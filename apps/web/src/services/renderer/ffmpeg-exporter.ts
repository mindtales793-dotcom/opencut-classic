import EventEmitter from "eventemitter3";
import type { FrameRate } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import type { ExportFormat, ExportQuality } from "@/export";
import { audioBufferToWav } from "@/export/ffmpeg/wav";
import { toRawPixelFormat } from "@/export/ffmpeg/profiles";
import type { RootNode } from "./nodes/root-node";
import { CanvasRenderer } from "./canvas-renderer";

/**
 * Export engine that streams GPU-composited frames to a local FFmpeg process.
 *
 * The compositor (wgpu/WebGPU) still renders every frame on the GPU. Frames
 * are then piped to FFmpeg, which encodes with the best hardware encoder the
 * machine offers (Intel Quick Sync, NVENC, AMF) or falls back to x264. The
 * finished file stays on disk, so memory use does not grow with video length.
 */

const API_BASE = "/api/darkcut/export";
const BATCH_TARGET_BYTES = 12 * 1024 * 1024;
const FRAME_PROGRESS_SHARE = 0.98;

export interface FfmpegTestedEncoder {
	id: string;
	label: string;
	hardware: boolean;
	ok: boolean;
	error?: string;
}

export interface FfmpegCapabilities {
	available: boolean;
	selected: { id: string; label: string; hardware: boolean } | null;
	/** Every encoder the server tried, so the UI can explain why the GPU was skipped. */
	tested: FfmpegTestedEncoder[];
	reason?: string;
}

const UNAVAILABLE: FfmpegCapabilities = {
	available: false,
	selected: null,
	tested: [],
};
const capabilitiesCache = new Map<ExportFormat, Promise<FfmpegCapabilities>>();

export function getFfmpegCapabilities({
	format,
}: {
	format: ExportFormat;
}): Promise<FfmpegCapabilities> {
	if (typeof VideoFrame === "undefined" || typeof fetch === "undefined") {
		return Promise.resolve(UNAVAILABLE);
	}

	const cached = capabilitiesCache.get(format);
	if (cached) return cached;

	const pending = fetch(`${API_BASE}/capabilities?format=${format}`, {
		cache: "no-store",
	})
		.then(async (response): Promise<FfmpegCapabilities> => {
			if (!response.ok) return UNAVAILABLE;
			const data = await readJson(response);
			if (!isRecord(data)) return UNAVAILABLE;
			const selected = parseSelected(data.selected);
			return {
				available: data.available === true && !!selected,
				selected,
				tested: parseTested(data.tested),
				reason: typeof data.reason === "string" ? data.reason : undefined,
			};
		})
		.catch(() => {
			capabilitiesCache.delete(format);
			return UNAVAILABLE;
		});

	capabilitiesCache.set(format, pending);
	return pending;
}

export type FfmpegExportOutput = {
	downloadUrl: string;
	encoderLabel: string;
	verified?: { format: ExportFormat; codec: string; width: number; height: number; fps: number; audioCodec: string | null; quality: ExportQuality };
};

export type FfmpegExporterEvents = {
	progress: [progress: number];
	complete: [output: FfmpegExportOutput];
	error: [error: Error];
	cancelled: [];
};

type FfmpegExporterParams = {
	width: number;
	height: number;
	sourceWidth?: number;
	sourceHeight?: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: ExportQuality;
	filename: string;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
};

class RequestFailedError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
	return response.json().catch(() => null);
}

async function readError(response: Response): Promise<string> {
	const data = await readJson(response);
	const message = isRecord(data) ? data.error : null;
	return typeof message === "string"
		? message
		: `O servidor respondeu ${response.status}.`;
}

function parseTested(value: unknown): FfmpegTestedEncoder[] {
	if (!Array.isArray(value)) return [];
	const tested: FfmpegTestedEncoder[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const { id, label, hardware, ok, error } = entry;
		if (typeof id !== "string" || typeof label !== "string") continue;
		tested.push({
			id,
			label,
			hardware: hardware === true,
			ok: ok === true,
			error: typeof error === "string" ? error : undefined,
		});
	}
	return tested;
}

function parseSelected(value: unknown): FfmpegCapabilities["selected"] {
	if (!isRecord(value)) return null;
	const { id, label, hardware } = value;
	if (typeof id !== "string" || typeof label !== "string") return null;
	return { id, label, hardware: hardware === true };
}

/** Copies a frame into `dest` without row padding (width * 4 bytes per row). */
async function copyFrameTight({
	frame,
	dest,
}: {
	frame: VideoFrame;
	dest: Uint8Array;
}): Promise<void> {
	const rowBytes = frame.codedWidth * 4;
	const tightSize = rowBytes * frame.codedHeight;

	if (frame.allocationSize() === tightSize) {
		await frame.copyTo(dest.subarray(0, tightSize));
		return;
	}

	const scratch = new Uint8Array(frame.allocationSize());
	const [plane] = await frame.copyTo(scratch);
	for (let row = 0; row < frame.codedHeight; row++) {
		const start = plane.offset + row * plane.stride;
		dest.set(scratch.subarray(start, start + rowBytes), row * rowBytes);
	}
}

export class FfmpegSceneExporter extends EventEmitter<FfmpegExporterEvents> {
	private renderer: CanvasRenderer;
	private targetWidth: number;
	private targetHeight: number;
	private targetCanvas: HTMLCanvasElement | null = null;
	private format: ExportFormat;
	private quality: ExportQuality;
	private filename: string;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;
	private abortController = new AbortController();
	private isCancelled = false;
	private jobId: string | null = null;

	constructor({
		width,
		height,
		sourceWidth,
		sourceHeight,
		fps,
		format,
		quality,
		filename,
		shouldIncludeAudio,
		audioBuffer,
	}: FfmpegExporterParams) {
		super();
		this.targetWidth = width;
		this.targetHeight = height;
		this.renderer = new CanvasRenderer({ width: sourceWidth ?? width, height: sourceHeight ?? height, fps });
		this.format = format;
		this.quality = quality;
		this.filename = filename;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
	}

	static async isSupported({
		format,
	}: {
		format: ExportFormat;
	}): Promise<boolean> {
		return (await getFfmpegCapabilities({ format })).available;
	}

	cancel(): void {
		this.isCancelled = true;
		this.abortController.abort();
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<FfmpegExportOutput | null> {
		try {
			const output = await this.run({ rootNode });
			if (output) {
				this.emit("progress", 1);
				this.emit("complete", output);
				return output;
			}
			await this.discardJob();
			this.emit("cancelled");
			return null;
		} catch (error) {
			await this.discardJob();
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			const failure = error instanceof Error ? error : new Error(String(error));
			this.emit("error", failure);
			throw failure;
		}
	}

	/** Scale an unchanged project layout into the exact requested encoded resolution. */
	private getFrameCanvas(): HTMLCanvasElement {
		const original = this.renderer.getOutputCanvas();
		if (original.width === this.targetWidth && original.height === this.targetHeight) return original;
		if (!this.targetCanvas) {
			this.targetCanvas = document.createElement("canvas");
			this.targetCanvas.width = this.targetWidth;
			this.targetCanvas.height = this.targetHeight;
		}
		const ctx = this.targetCanvas.getContext("2d");
		if (!ctx) throw new Error("Não foi possível preparar a resolução escolhida.");
		ctx.clearRect(0, 0, this.targetWidth, this.targetHeight);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(original, 0, 0, this.targetWidth, this.targetHeight);
		return this.targetCanvas;
	}

	private async run({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<FfmpegExportOutput | null> {
		const { fps } = this.renderer;
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.ceil(rootNode.duration / ticksPerFrame);
		if (frameCount < 1)
			throw new Error("O projeto não tem quadros para exportar.");

		const fpsFloat = fps.numerator / fps.denominator;


		// Render the first frame up front: it tells us the real frame size and
		// pixel layout, which FFmpeg must know before it starts.
		await this.renderer.render({ node: rootNode, time: 0 });
		if (this.isCancelled) return null;

		const firstFrame = new VideoFrame(this.getFrameCanvas(), { timestamp: 0 });
		const width = firstFrame.codedWidth;
		const height = firstFrame.codedHeight;
		const inputPixelFormat = toRawPixelFormat({
			videoFrameFormat: firstFrame.format,
		});
		if (!inputPixelFormat) {
			firstFrame.close();
			throw new Error("Formato de quadro não suportado pelo FFmpeg.");
		}

		const frameBytes = width * height * 4;
		const firstBytes = new Uint8Array(frameBytes);
		try {
			await copyFrameTight({ frame: firstFrame, dest: firstBytes });
		} finally {
			firstFrame.close();
		}

		const startResponse = await this.request({
			url: API_BASE,
			body: JSON.stringify({
				format: this.format,
				quality: this.quality,
				width,
				height,
				fpsNumerator: fps.numerator,
				fpsDenominator: fps.denominator,
				inputPixelFormat,
				filename: this.filename,
			}),
			contentType: "application/json",
		});
		const jobId = startResponse.id;
		const encoder = parseSelected(startResponse.encoder);
		if (typeof jobId !== "string" || !encoder) {
			throw new Error("Resposta inválida do servidor de exportação.");
		}
		this.jobId = jobId;
		const jobUrl = `${API_BASE}/${jobId}`;

		if (this.shouldIncludeAudio && this.audioBuffer) {
			await this.request({
				url: `${jobUrl}/audio`,
				body: audioBufferToWav({ audioBuffer: this.audioBuffer }),
				contentType: "audio/wav",
			});
		}

		const framesPerBatch = Math.max(
			1,
			Math.floor(BATCH_TARGET_BYTES / frameBytes),
		);
		let batch = new Uint8Array(frameBytes * framesPerBatch);
		let batchCount = 0;
		let upload: Promise<unknown> = Promise.resolve();

		const sendBatch = async () => {
			if (batchCount === 0) return;
			// Only one upload in flight: FFmpeg's pipe is the backpressure, and the
			// next frames render while this one is being written.
			await upload;
			const body = batch.subarray(0, batchCount * frameBytes);
			upload = this.request({
				url: `${jobUrl}/frames`,
				body,
				contentType: "application/octet-stream",
			});
			upload.catch(() => undefined);
			// The in-flight request owns this buffer now.
			batch = new Uint8Array(frameBytes * framesPerBatch);
			batchCount = 0;
		};

		batch.set(firstBytes, 0);
		batchCount = 1;
		if (batchCount === framesPerBatch) await sendBatch();

		for (let index = 1; index < frameCount; index++) {
			if (this.isCancelled) return null;

			const time = index * ticksPerFrame;
			await this.renderer.render({ node: rootNode, time });

			const frame = new VideoFrame(this.getFrameCanvas(), {
				timestamp: Math.round((index * 1_000_000) / fpsFloat),
			});
			try {
				await copyFrameTight({
					frame,
					dest: batch.subarray(batchCount * frameBytes),
				});
			} finally {
				frame.close();
			}
			batchCount++;

			if (batchCount === framesPerBatch) await sendBatch();
			this.emit("progress", (index / frameCount) * FRAME_PROGRESS_SHARE);
		}

		await sendBatch();
		await upload;
		if (this.isCancelled) return null;

		const finished = await this.request({
			url: `${jobUrl}/finish`,
			body: null,
			contentType: "application/json",
		});
		if (typeof finished.downloadUrl !== "string") {
			throw new Error("Resposta inválida ao finalizar a exportação.");
		}

		this.jobId = null;
		return {
			downloadUrl: finished.downloadUrl,
			encoderLabel: encoder.label,
			verified: isRecord(finished.verified) ? finished.verified as FfmpegExportOutput["verified"] : undefined,
		};
	}

	private async request({
		url,
		body,
		contentType,
	}: {
		url: string;
		body: BodyInit | null;
		contentType: string;
	}): Promise<Record<string, unknown>> {
		const response = await fetch(url, {
			method: "POST",
			body,
			headers: { "Content-Type": contentType },
			signal: this.abortController.signal,
		});
		if (!response.ok) throw new RequestFailedError(await readError(response));
		const data = await readJson(response);
		return isRecord(data) ? data : {};
	}

	/** Stops FFmpeg and deletes the partial file on the server. */
	private async discardJob(): Promise<void> {
		const id = this.jobId;
		if (!id) return;
		this.jobId = null;
		await fetch(`${API_BASE}/${id}`, { method: "DELETE" }).catch(
			() => undefined,
		);
	}
}
