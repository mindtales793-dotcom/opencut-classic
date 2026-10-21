import type { EditorCore } from "@/core";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import type { ExportOptions, ExportResult } from "@/export";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { FfmpegSceneExporter } from "@/services/renderer/ffmpeg-exporter";
import { buildScene } from "@/services/renderer/scene-builder";
import { createTimelineAudioBuffer } from "@/media/audio";
import { formatTimecode } from "opencut-wasm";
import { frameRateToFloat } from "@/fps/utils";
import { downloadBlob } from "@/utils/browser";

type SnapshotResult =
	| { success: true; blob: Blob; filename: string }
	| { success: false; error: string };

export class RendererManager {
	private renderTree: RootNode | null = null;
	private _isDegraded = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	get isDegraded(): boolean {
		return this._isDegraded;
	}

	setDegraded(degraded: boolean): void {
		if (this._isDegraded === degraded) return;
		this._isDegraded = degraded;
		this.notify();
	}

	setRenderTree({ renderTree }: { renderTree: RootNode | null }): void {
		this.renderTree = renderTree;
		this.notify();
	}

	getRenderTree(): RootNode | null {
		return this.renderTree;
	}

	async saveSnapshot(): Promise<{ success: boolean; error?: string }> {
		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		downloadBlob({ blob: snapshot.blob, filename: snapshot.filename });
		return { success: true };
	}

	async copySnapshot(): Promise<{ success: boolean; error?: string }> {
		if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
			return {
				success: false,
				error: "Clipboard image copy is not supported in this browser",
			};
		}

		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[snapshot.blob.type || "image/png"]: snapshot.blob,
				}),
			]);
			return { success: true };
		} catch (error) {
			console.error("Copy snapshot failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async createSnapshot(): Promise<SnapshotResult> {
		try {
			const renderTree = this.getRenderTree();
			const activeProject = this.editor.project.getActive();

			if (!renderTree || !activeProject) {
				return { success: false, error: "No project or scene to capture" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const { canvasSize, fps } = activeProject.settings;
			const renderTime = Math.min(
				this.editor.playback.getCurrentTime(),
				this.editor.timeline.getLastFrameTime(),
			);

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
			});

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = canvasSize.width;
			tempCanvas.height = canvasSize.height;

			await renderer.renderToCanvas({
				node: renderTree,
				time: renderTime,
				targetCanvas: tempCanvas,
			});

			const blob = await new Promise<Blob | null>((resolve) => {
				tempCanvas.toBlob((result) => resolve(result), "image/png");
			});

			if (!blob) {
				return { success: false, error: "Failed to create image" };
			}

			const timecode = formatTimecode({ time: renderTime, rate: fps })!.replace(/:/g, "-");
			const safeName =
				activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
				"snapshot";
			const filename = `${safeName}-${timecode}.png`;

			return { success: true, blob, filename };
		} catch (error) {
			console.error("Snapshot capture failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async exportProject({
		options,
		onProgress,
		onCancel,
	}: {
		options: ExportOptions;
		onProgress?: ({ progress }: { progress: number }) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		const { format, quality, fps, includeAudio, engine, loudnessTargetLufs } =
			options;
		if (onCancel?.()) return { success: false, cancelled: true };

		try {
			const tracks = this.editor.scenes.getActiveScene().tracks;
			const mediaAssets = this.editor.media.getAssets();
			const activeProject = this.editor.project.getActive();

			if (!activeProject) {
				return { success: false, error: "No active project" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const exportFps = fps ?? activeProject.settings.fps;
			const canvasSize = activeProject.settings.canvasSize;
			const exportSize = options.canvasSize ?? canvasSize;
			if (![exportSize.width, exportSize.height].every(value =>
				Number.isInteger(value) && value >= 16 && value <= 7680)) {
				return { success: false, error: "Escolha uma resolução válida entre 16 e 7680 pixels." };
			}

			let audioBuffer: AudioBuffer | null = null;
			if (includeAudio) {
				onProgress?.({ progress: 0.05 });
				audioBuffer = await createTimelineAudioBuffer({
					tracks,
					mediaAssets,
					duration,
					loudnessTargetLufs: loudnessTargetLufs ?? null,
				});
			}

			if (onCancel?.()) return { success: false, cancelled: true };

			const scene = buildScene({
				tracks,
				mediaAssets,
				duration,
				canvasSize,
				background: activeProject.settings.background,
			});

			const reportProgress = (progress: number) => {
				const adjustedProgress = includeAudio
					? 0.05 + progress * 0.95
					: progress;
				onProgress?.({ progress: adjustedProgress });
			};

			// Preferred engine: FFmpeg + GPU encoder (desktop runtime). It streams
			// the file to disk instead of holding the whole video in memory.
			if (
				engine !== "browser" &&
				(await FfmpegSceneExporter.isSupported({ format }))
			) {
				const ffmpegResult = await this.exportWithFfmpeg({
					scene,
					width: exportSize.width,
					height: exportSize.height,
					sourceWidth: canvasSize.width,
					sourceHeight: canvasSize.height,
					fps: exportFps,
					format,
					quality,
					filename: options.filename ?? activeProject.metadata.name,
					preferSoftwareOnly: engine === "software",
					audioBuffer,
					onProgress: reportProgress,
					onCancel,
				});
				return ffmpegResult;
			}

			if (engine === "software") {
				return { success: false, error: "FFmpeg indisponível. Instale as ferramentas de vídeo do DarkCut para exportar no modo estável, ou selecione explicitamente o encoder do navegador." };
			}

			if (onCancel?.()) return { success: false, cancelled: true };
			const exporter = new SceneExporter({
				width: exportSize.width,
				height: exportSize.height,
				sourceWidth: canvasSize.width,
				sourceHeight: canvasSize.height,
				fps: exportFps,
				format,
				quality,
				shouldIncludeAudio: !!includeAudio,
				audioBuffer: audioBuffer || undefined,
			});

			exporter.on("progress", reportProgress);

			let cancelled = false;
			const checkCancel = () => {
				if (onCancel?.()) {
					cancelled = true;
					exporter.cancel();
				}
			};

			checkCancel();
			const cancelInterval = setInterval(checkCancel, 100);

			try {
				const buffer = await exporter.export({ rootNode: scene });
				clearInterval(cancelInterval);

				if (cancelled) {
					return { success: false, cancelled: true };
				}

				if (!buffer) {
					return { success: false, error: "Export failed to produce buffer" };
				}

				return {
					success: true,
					buffer,
					encoderLabel: "Navegador (WebCodecs)",
				};
			} finally {
				clearInterval(cancelInterval);
			}
		} catch (error) {
			console.error("Export failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown export error",
			};
		}
	}

	/** Retries a failed hardware FFmpeg export using the CPU without changing quality. */
	private async exportWithFfmpeg({
		scene,
		width,
		height,
		sourceWidth,
		sourceHeight,
		fps,
		format,
		quality,
		filename,
		preferSoftwareOnly = false,
		audioBuffer,
		onProgress,
		onCancel,
	}: {
		scene: RootNode;
		width: number;
		height: number;
		sourceWidth: number;
		sourceHeight: number;
		fps: NonNullable<ExportOptions["fps"]>;
		format: ExportOptions["format"];
		quality: ExportOptions["quality"];
		filename: string;
		preferSoftwareOnly?: boolean;
		audioBuffer: AudioBuffer | null;
		onProgress: (progress: number) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		// Hardware encoders can pass a small capability probe but fail when an
		// actual 4K project is fed to the driver. Retry once on the CPU with
		// the SAME selected codec container and quality (never silently downgrade).
		for (const preferSoftware of (preferSoftwareOnly ? [true] : [false, true])) {
			if (onCancel?.()) return { success: false, cancelled: true };
			const exporter = new FfmpegSceneExporter({
				width,
				height,
				sourceWidth,
				sourceHeight,
				fps,
				format,
				quality,
				filename,
				preferSoftware,
				shouldIncludeAudio: !!audioBuffer,
				audioBuffer: audioBuffer ?? undefined,
			});
			exporter.on("progress", onProgress);

			let cancelled = false;
			const cancelInterval = setInterval(() => {
				if (onCancel?.()) {
					cancelled = true;
					exporter.cancel();
				}
			}, 100);

			try {
				const output = await exporter.export({ rootNode: scene });
				if (cancelled || !output) return { success: false, cancelled: true };
				return {
					success: true,
					downloadUrl: output.downloadUrl,
					encoderLabel: output.encoderLabel,
					verified: output.verified,
				};
			} catch (error) {
				if (cancelled) return { success: false, cancelled: true };
				if (!preferSoftware && exporter.getUsedHardware() === true) {
					console.warn("Hardware encoder failed; retrying with CPU at the same quality.", error);
					onProgress(0);
					continue;
				}
				console.error("FFmpeg export failed:", error);
				return {
					success: false,
					error: (error instanceof Error ? error.message : "Falha desconhecida do FFmpeg.") +
						" Tente Renderização → Compatível (navegador), se necessário.",
				};
			} finally {
				clearInterval(cancelInterval);
			}
		}
		return { success: false, error: "Nenhum encoder FFmpeg pôde concluir a exportação." };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
