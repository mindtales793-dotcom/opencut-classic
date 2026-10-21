import EventEmitter from "eventemitter3";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { FrameRate } from "opencut-wasm";
import { mediaTimeToSeconds } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { RootNode } from "./nodes/root-node";
import type { ExportFormat, ExportQuality } from "@/export";
import { CanvasRenderer } from "./canvas-renderer";

type ExportParams = {
	width: number;
	height: number;
	sourceWidth?: number;
	sourceHeight?: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: ExportQuality;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private targetWidth: number;
	private targetHeight: number;
	private targetCanvas: HTMLCanvasElement | null = null;
	private format: ExportFormat;
	private quality: ExportQuality;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;

	private isCancelled = false;

	constructor({
		width,
		height,
		sourceWidth,
		sourceHeight,
		fps,
		format,
		quality,
		shouldIncludeAudio,
		audioBuffer,
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width: sourceWidth ?? width,
			height: sourceHeight ?? height,
			fps,
		});
		this.targetWidth = width;
		this.targetHeight = height;

		this.format = format;
		this.quality = quality;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
	}

	cancel(): void {
		this.isCancelled = true;
	}

	private drawOutputCanvas(): HTMLCanvasElement {
		const source = this.renderer.getOutputCanvas();
		if (
			source.width === this.targetWidth &&
			source.height === this.targetHeight
		)
			return source;
		if (!this.targetCanvas) {
			this.targetCanvas = document.createElement("canvas");
			this.targetCanvas.width = this.targetWidth;
			this.targetCanvas.height = this.targetHeight;
		}
		const context = this.targetCanvas.getContext("2d");
		if (!context)
			throw new Error("Não foi possível preparar a resolução escolhida.");
		context.clearRect(0, 0, this.targetWidth, this.targetHeight);
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(source, 0, 0, this.targetWidth, this.targetHeight);
		return this.targetCanvas;
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		if (this.isCancelled) {
			this.emit("cancelled");
			return null;
		}
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.ceil(rootNode.duration / ticksPerFrame);
		if (frameCount < 1)
			throw new Error("O projeto não tem quadros para exportar.");

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		try {
			const outputCanvas =
				this.targetWidth === this.renderer.width &&
				this.targetHeight === this.renderer.height
					? this.renderer.getOutputCanvas()
					: (this.targetCanvas ??= (() => {
							const canvas = document.createElement("canvas");
							canvas.width = this.targetWidth;
							canvas.height = this.targetHeight;
							return canvas;
						})());
			const videoSource = new CanvasSource(outputCanvas, {
				codec: this.format === "webm" ? "vp9" : "avc",
				bitrate: qualityMap[this.quality],
				// Ask Chromium/WebCodecs to use the hardware encoder whenever the
				// installed GPU/driver supports this codec. It safely falls back to
				// software when hardware encode is unavailable.
				hardwareAcceleration: "prefer-hardware",
				latencyMode: "quality",
				contentHint: "motion",
			});

			output.addVideoTrack(videoSource, { frameRate: fpsFloat });

			let audioSource: AudioBufferSource | null = null;
			if (this.shouldIncludeAudio && this.audioBuffer) {
				const audioCodec: "aac" | "opus" =
					this.format === "webm" ? "opus" : "aac";

				if (audioCodec === "aac" && typeof AudioEncoder !== "undefined") {
					const { supported } = await AudioEncoder.isConfigSupported({
						codec: "mp4a.40.2",
						sampleRate: this.audioBuffer.sampleRate,
						numberOfChannels: this.audioBuffer.numberOfChannels,
						bitrate: 192000,
					});
					if (!supported)
						throw new Error(
							"O navegador não suporta áudio AAC neste MP4. Selecione a renderização automática com FFmpeg.",
						);
				}

				audioSource = new AudioBufferSource({
					codec: audioCodec,
					bitrate: qualityMap[this.quality],
				});
				output.addAudioTrack(audioSource);
			}

			await output.start();

			if (audioSource && this.audioBuffer) {
				await audioSource.add(this.audioBuffer);
				audioSource.close();
			}

			for (let i = 0; i < frameCount; i++) {
				if (this.isCancelled) {
					await output.cancel();
					this.emit("cancelled");
					return null;
				}

				const timeTicks = i * ticksPerFrame;
				const timeSeconds = mediaTimeToSeconds({ time: timeTicks });
				await this.renderer.render({ node: rootNode, time: timeTicks });
				this.drawOutputCanvas();
				await videoSource.add(timeSeconds, 1 / fpsFloat);

				this.emit("progress", i / frameCount);
			}

			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			videoSource.close();
			await output.finalize();
			this.emit("progress", 1);

			const buffer = output.target.buffer;
			if (!buffer) {
				this.emit("error", new Error("Failed to export video"));
				return null;
			}

			this.emit("complete", buffer);
			return buffer;
		} catch (error) {
			// Release encoder resources after render, audio or finalization failures.
			await output.cancel().catch(() => undefined);
			throw error;
		}
	}
}
