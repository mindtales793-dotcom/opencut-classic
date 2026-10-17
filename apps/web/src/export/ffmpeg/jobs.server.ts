import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "../index";
import {
	isFfmpegExportEnabled,
	killProcessTree,
	probeFfmpeg,
	resolveFfmpegPath,
} from "./probe.server";
import {
	buildFfmpegArgs,
	getProfileById,
	type FfmpegProfile,
	type RawPixelFormat,
} from "./profiles";

/**
 * Server-only. One job = one FFmpeg process that receives raw frames on stdin
 * and writes the finished file to disk, so the editor never has to hold the
 * whole video in memory.
 */

export class ExportRequestError extends Error {
	// eslint-disable-next-line opencut/prefer-object-params -- mirrors Error(message) with an extra HTTP status.
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export function describeError(error: unknown): {
	status: number;
	message: string;
} {
	if (error instanceof ExportRequestError) {
		return { status: error.status, message: error.message };
	}
	return {
		status: 500,
		message: error instanceof Error ? error.message : "Erro desconhecido.",
	};
}

export function assertEnabled(): void {
	if (!isFfmpegExportEnabled()) {
		throw new ExportRequestError(
			404,
			"A exportação com FFmpeg não está habilitada neste ambiente.",
		);
	}
}

type JobStatus = "created" | "running" | "finished" | "failed" | "cancelled";

interface ExportJob {
	id: string;
	dir: string;
	outputPath: string;
	audioPath: string | null;
	filename: string;
	format: ExportFormat;
	quality: ExportQuality;
	width: number;
	height: number;
	fpsNumerator: number;
	fpsDenominator: number;
	inputPixelFormat: RawPixelFormat;
	profile: FfmpegProfile;
	child: ChildProcess | null;
	exit: Promise<number> | null;
	exitCode: number | null;
	stderr: string;
	status: JobStatus;
	framesWritten: number;
	lastActivity: number;
	queue: Promise<unknown>;
}

const JOB_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDLE_RUNNING_MS = 10 * 60_000;
const FINISHED_TTL_MS = 30 * 60_000;
const STALE_DIR_MS = 12 * 60 * 60_000;
const RAW_PIXEL_FORMATS: RawPixelFormat[] = ["rgba", "bgra", "rgb0", "bgr0"];

type JobStore = {
	jobs: Map<string, ExportJob>;
	sweeper: ReturnType<typeof setInterval> | null;
	cleanedStale: boolean;
};

const globalForJobs = globalThis as typeof globalThis & {
	__darkcutExportJobs?: JobStore;
};

function store(): JobStore {
	return (globalForJobs.__darkcutExportJobs ??= {
		jobs: new Map(),
		sweeper: null,
		cleanedStale: false,
	});
}

function exportsRoot(): string {
	const dataDir = process.env.DARKCUT_DATA_DIR;
	return dataDir ? join(dataDir, "exports") : join(tmpdir(), "darkcut-exports");
}

export interface StartRequest {
	format: ExportFormat;
	quality: ExportQuality;
	width: number;
	height: number;
	fpsNumerator: number;
	fpsDenominator: number;
	inputPixelFormat: RawPixelFormat;
	filename: string;
}

function isInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value);
}

export function sanitizeFilename(value: unknown): string {
	const raw = typeof value === "string" ? value : "";
	const cleaned = Array.from(raw, (char) =>
		char.charCodeAt(0) < 32 ? "-" : char,
	)
		.join("")
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\.+$/, "")
		.trim()
		.slice(0, 120);
	return cleaned || "export";
}

export function parseStartRequest(body: unknown): StartRequest {
	if (!body || typeof body !== "object") {
		throw new ExportRequestError(400, "Pedido de exportação inválido.");
	}
	const field = (key: string): unknown => Reflect.get(body, key);

	const format = EXPORT_FORMAT_VALUES.find(
		(value) => value === field("format"),
	);
	const quality = EXPORT_QUALITY_VALUES.find(
		(value) => value === field("quality"),
	);
	const inputPixelFormat = RAW_PIXEL_FORMATS.find(
		(value) => value === field("inputPixelFormat"),
	);
	if (!format || !quality || !inputPixelFormat) {
		throw new ExportRequestError(400, "Formato ou qualidade inválidos.");
	}

	const width = field("width");
	const height = field("height");
	const fpsNumerator = field("fpsNumerator");
	const fpsDenominator = field("fpsDenominator");
	if (
		!isInteger(width) ||
		!isInteger(height) ||
		width < 16 ||
		height < 16 ||
		width > 7680 ||
		height > 7680
	) {
		throw new ExportRequestError(400, "Resolução inválida.");
	}
	if (
		!isInteger(fpsNumerator) ||
		!isInteger(fpsDenominator) ||
		fpsNumerator < 1 ||
		fpsDenominator < 1 ||
		fpsNumerator > 240_000 ||
		fpsDenominator > 10_000 ||
		fpsNumerator / fpsDenominator > 240
	) {
		throw new ExportRequestError(400, "Taxa de quadros inválida.");
	}

	return {
		format,
		quality,
		width,
		height,
		fpsNumerator,
		fpsDenominator,
		inputPixelFormat,
		filename: sanitizeFilename(field("filename")),
	};
}

export function frameByteLength(job: Pick<ExportJob, "width" | "height">) {
	return job.width * job.height * 4;
}

export async function createJob(request: StartRequest): Promise<{
	id: string;
	encoder: { id: string; label: string; hardware: boolean };
}> {
	assertEnabled();

	const probe = await probeFfmpeg({ format: request.format });
	if (!probe.available || !probe.selected) {
		throw new ExportRequestError(
			503,
			probe.reason ?? "O FFmpeg não está disponível.",
		);
	}
	const profile = getProfileById({ id: probe.selected.id });
	if (!profile) {
		throw new ExportRequestError(500, "Perfil de encoder desconhecido.");
	}

	// A desktop editor exports one video at a time: drop anything left over.
	await cancelAllJobs();
	await cleanupStaleDirectories();
	startSweeper();

	const id = randomUUID();
	const dir = join(exportsRoot(), id);
	await mkdir(dir, { recursive: true });

	const extension = request.format === "webm" ? "webm" : "mp4";
	const job: ExportJob = {
		id,
		dir,
		outputPath: join(dir, `output.${extension}`),
		audioPath: null,
		filename: `${request.filename}.${extension}`,
		format: request.format,
		quality: request.quality,
		width: request.width,
		height: request.height,
		fpsNumerator: request.fpsNumerator,
		fpsDenominator: request.fpsDenominator,
		inputPixelFormat: request.inputPixelFormat,
		profile,
		child: null,
		exit: null,
		exitCode: null,
		stderr: "",
		status: "created",
		framesWritten: 0,
		lastActivity: Date.now(),
		queue: Promise.resolve(),
	};
	store().jobs.set(id, job);

	return { id, encoder: probe.selected };
}

export function getJob(id: string): ExportJob {
	if (!JOB_ID_PATTERN.test(id)) {
		throw new ExportRequestError(400, "Identificador de exportação inválido.");
	}
	const job = store().jobs.get(id);
	if (!job) {
		throw new ExportRequestError(404, "Exportação não encontrada ou expirada.");
	}
	job.lastActivity = Date.now();
	return job;
}

function enqueue<T>({
	job,
	task,
}: {
	job: ExportJob;
	task: () => Promise<T>;
}): Promise<T> {
	const run = job.queue.then(task, task);
	job.queue = run.catch(() => undefined);
	return run;
}

function failure({
	job,
	fallback = "O FFmpeg encerrou inesperadamente.",
}: {
	job: ExportJob;
	fallback?: string;
}) {
	const lines = job.stderr
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(-4)
		.join(" | ");
	return new ExportRequestError(500, lines || fallback);
}

function assertUsable(job: ExportJob) {
	if (job.status === "cancelled") {
		throw new ExportRequestError(409, "A exportação foi cancelada.");
	}
	if (job.status === "failed") throw failure({ job });
	if (job.status === "finished") {
		throw new ExportRequestError(409, "A exportação já foi concluída.");
	}
}

function startProcess(job: ExportJob) {
	const args = buildFfmpegArgs({
		profile: job.profile,
		container: job.format,
		width: job.width,
		height: job.height,
		fpsNumerator: job.fpsNumerator,
		fpsDenominator: job.fpsDenominator,
		quality: job.quality,
		inputPixelFormat: job.inputPixelFormat,
		audioPath: job.audioPath ?? undefined,
		outputPath: job.outputPath,
	});

	const child = spawn(resolveFfmpegPath(), args, {
		windowsHide: true,
		stdio: ["pipe", "ignore", "pipe"],
	});
	job.child = child;
	job.status = "running";

	child.stderr?.setEncoding("utf8");
	child.stderr?.on("data", (chunk: string) => {
		job.stderr = (job.stderr + chunk).slice(-8000);
	});
	child.stdin?.on("error", () => {
		// Broken pipe: the exit handler below reports the real FFmpeg error.
	});

	job.exit = new Promise<number>((resolve) => {
		child.on("error", (error) => {
			job.stderr += `\n${error.message}`;
			job.exitCode = -1;
			resolve(-1);
		});
		child.on("close", (code) => {
			job.exitCode = code ?? -1;
			resolve(job.exitCode);
		});
	});
}

function writeToStdin({
	job,
	data,
}: {
	job: ExportJob;
	data: Buffer;
}): Promise<void> {
	const child = job.child;
	const stdin = child?.stdin;
	if (!child || !stdin || stdin.destroyed || job.exitCode !== null) {
		return Promise.reject(failure({ job }));
	}

	const written = new Promise<void>((resolve, reject) => {
		stdin.write(data, (error) =>
			error ? reject(failure({ job })) : resolve(),
		);
	});
	const exited = (job.exit ?? Promise.resolve(0)).then(() => {
		throw failure({ job });
	});
	return Promise.race([written, exited]);
}

export function saveAudio({
	job,
	data,
}: {
	job: ExportJob;
	data: Buffer;
}): Promise<void> {
	return enqueue({
		job,
		task: async () => {
			assertUsable(job);
			if (job.child) {
				throw new ExportRequestError(
					409,
					"O áudio precisa ser enviado antes dos quadros.",
				);
			}
			const audioPath = join(job.dir, "audio.wav");
			await writeFile(audioPath, data);
			job.audioPath = audioPath;
		},
	});
}

export function pushFrames({
	job,
	data,
}: {
	job: ExportJob;
	data: Buffer;
}): Promise<number> {
	return enqueue({
		job,
		task: async () => {
			assertUsable(job);

			const frameBytes = frameByteLength(job);
			if (data.length === 0 || data.length % frameBytes !== 0) {
				throw new ExportRequestError(
					400,
					"Os quadros enviados não têm o tamanho esperado.",
				);
			}

			if (!job.child) startProcess(job);

			try {
				await writeToStdin({ job, data });
			} catch (error) {
				job.status = "failed";
				throw error;
			}

			job.framesWritten += data.length / frameBytes;
			return job.framesWritten;
		},
	});
}

export function finishJob({
	job,
}: {
	job: ExportJob;
}): Promise<{ size: number }> {
	return enqueue({
		job,
		task: async () => {
			assertUsable(job);
			if (!job.child || job.framesWritten === 0) {
				throw new ExportRequestError(409, "Nenhum quadro foi enviado.");
			}

			job.child.stdin?.end();
			const code = await job.exit;
			if (code !== 0) {
				job.status = "failed";
				throw failure({ job });
			}

			const info = await stat(job.outputPath);
			job.status = "finished";
			return { size: info.size };
		},
	});
}

export function getFinishedFile(job: ExportJob): {
	path: string;
	filename: string;
	format: ExportFormat;
} {
	if (job.status !== "finished") {
		throw new ExportRequestError(409, "A exportação ainda não terminou.");
	}
	return { path: job.outputPath, filename: job.filename, format: job.format };
}

export async function removeJob(job: ExportJob): Promise<void> {
	store().jobs.delete(job.id);
	if (job.child) killProcessTree(job.child);
	await rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
}

export async function cancelJob(id: string): Promise<void> {
	const job = store().jobs.get(id);
	if (!job) return;
	job.status = "cancelled";
	await removeJob(job);
}

async function cancelAllJobs(): Promise<void> {
	await Promise.all(
		Array.from(store().jobs.values()).map((job) => {
			job.status = "cancelled";
			return removeJob(job);
		}),
	);
}

function startSweeper() {
	const state = store();
	if (state.sweeper) return;
	state.sweeper = setInterval(() => {
		const now = Date.now();
		for (const job of state.jobs.values()) {
			const idle = now - job.lastActivity;
			const expired =
				job.status === "running" || job.status === "created"
					? idle > IDLE_RUNNING_MS
					: idle > FINISHED_TTL_MS;
			if (expired) {
				job.status = "cancelled";
				void removeJob(job);
			}
		}
	}, 60_000);
	state.sweeper.unref?.();
}

async function cleanupStaleDirectories(): Promise<void> {
	const state = store();
	if (state.cleanedStale) return;
	state.cleanedStale = true;

	const root = exportsRoot();
	const entries = await readdir(root).catch(() => [] as string[]);
	const now = Date.now();
	await Promise.all(
		entries.map(async (entry) => {
			if (!JOB_ID_PATTERN.test(entry) || state.jobs.has(entry)) return;
			const path = join(root, entry);
			const info = await stat(path).catch(() => null);
			if (info && now - info.mtimeMs > STALE_DIR_MS) {
				await rm(path, { recursive: true, force: true }).catch(() => undefined);
			}
		}),
	);
}
