import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExportFormat } from "../index";
import {
	buildFfmpegArgs,
	getProfilesForFormat,
	type FfmpegProfile,
} from "./profiles";

/**
 * Server-only. Finds FFmpeg and checks, with a real test encode, which
 * hardware encoder works on this machine.
 *
 * The FFmpeg export engine is only enabled in the desktop runtime
 * (`DARKCUT_VIDEO_TOOLS` is set by the Electron shell) or when explicitly
 * opted in with `DARKCUT_FFMPEG_EXPORT=1`, so a hosted deployment never
 * exposes process spawning.
 */

export function isFfmpegExportEnabled(): boolean {
	return (
		!!process.env.DARKCUT_VIDEO_TOOLS ||
		process.env.DARKCUT_FFMPEG_EXPORT === "1"
	);
}

export function resolveFfmpegPath(): string {
	const toolsDir = process.env.DARKCUT_VIDEO_TOOLS;
	const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	if (toolsDir) {
		const bundled = join(toolsDir, executable);
		if (existsSync(bundled)) return bundled;
	}
	return executable;
}

export function killProcessTree(child: ChildProcess): void {
	if (child.exitCode !== null || child.killed) return;
	if (process.platform === "win32" && child.pid) {
		spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
			windowsHide: true,
		});
		return;
	}
	child.kill("SIGKILL");
}

export interface ProbedProfile {
	id: string;
	label: string;
	hardware: boolean;
	ok: boolean;
	error?: string;
}

export interface FfmpegProbeResult {
	available: boolean;
	version?: string;
	selected: { id: string; label: string; hardware: boolean } | null;
	tested: ProbedProfile[];
	reason?: string;
}

const PROBE_WIDTH = 320;
const PROBE_HEIGHT = 192;
const PROBE_FRAMES = 3;

function runFfmpeg({
	args,
	stdin,
	timeoutMs,
}: {
	args: string[];
	stdin?: Buffer;
	timeoutMs: number;
}): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			child = spawn(resolveFfmpegPath(), args, {
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch (error) {
			resolve({
				code: -1,
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (code: number) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, stdout, stderr: stderr.trim() });
		};

		const timer = setTimeout(() => {
			stderr += "\nTempo esgotado no teste do encoder.";
			killProcessTree(child);
			finish(-1);
		}, timeoutMs);

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout = (stdout + chunk).slice(-4000);
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-4000);
		});
		child.stdin?.on("error", () => {
			// The encoder may exit before consuming stdin; the exit code tells why.
		});
		child.on("error", (error) => {
			stderr += `\n${error.message}`;
			finish(-1);
		});
		child.on("close", (code) => finish(code ?? -1));

		if (stdin) child.stdin?.end(stdin);
		else child.stdin?.end();
	});
}

function lastLine(text: string): string {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	return lines[lines.length - 1] ?? "Falha desconhecida.";
}

async function testProfile(profile: FfmpegProfile): Promise<ProbedProfile> {
	const base = {
		id: profile.id,
		label: profile.label,
		hardware: profile.hardware,
	};

	const args = buildFfmpegArgs({
		profile,
		container: "null",
		width: PROBE_WIDTH,
		height: PROBE_HEIGHT,
		fpsNumerator: 30,
		fpsDenominator: 1,
		quality: "medium",
		inputPixelFormat: "bgra",
	});

	const frame = Buffer.alloc(PROBE_WIDTH * PROBE_HEIGHT * 4, 0x20);
	const result = await runFfmpeg({
		args,
		stdin: Buffer.concat(Array.from({ length: PROBE_FRAMES }, () => frame)),
		timeoutMs: 20_000,
	});

	if (result.code === 0) return { ...base, ok: true };
	return { ...base, ok: false, error: lastLine(result.stderr) };
}

async function runProbe(format: ExportFormat): Promise<FfmpegProbeResult> {
	const versionResult = await runFfmpeg({
		args: ["-hide_banner", "-version"],
		timeoutMs: 8_000,
	});

	if (versionResult.code !== 0) {
		return {
			available: false,
			selected: null,
			tested: [],
			reason: "O FFmpeg não foi encontrado neste computador.",
		};
	}

	const version = versionResult.stdout.split(/\r?\n/)[0]?.trim();
	const tested: ProbedProfile[] = [];

	for (const profile of getProfilesForFormat({ format })) {
		const result = await testProfile(profile);
		tested.push(result);
		if (result.ok) {
			return {
				available: true,
				version,
				selected: {
					id: profile.id,
					label: profile.label,
					hardware: profile.hardware,
				},
				tested,
			};
		}
	}

	return {
		available: false,
		version,
		selected: null,
		tested,
		reason: "Nenhum encoder do FFmpeg funcionou neste computador.",
	};
}

type ProbeCache = Map<ExportFormat, Promise<FfmpegProbeResult>>;

const globalForProbe = globalThis as typeof globalThis & {
	__darkcutFfmpegProbe?: ProbeCache;
};

export function probeFfmpeg({
	format,
	refresh = false,
}: {
	format: ExportFormat;
	refresh?: boolean;
}): Promise<FfmpegProbeResult> {
	const cache = (globalForProbe.__darkcutFfmpegProbe ??= new Map());
	const cached = cache.get(format);
	if (cached && !refresh) return cached;

	const pending = runProbe(format);
	cache.set(format, pending);
	return pending;
}
