import type { FrameRate } from "opencut-wasm";
import type { AnyBaseNode } from "./nodes/base-node";
import { createCanvasSurface } from "./canvas-utils";
import { buildFrameDescriptor } from "./compositor/frame-descriptor";
import { wasmCompositor } from "./compositor/wasm-compositor";
import { applyColorAdjustPass } from "./color-adjust";
import { resolveRenderTree } from "./resolve";
import {
	measureSpanAsync,
	measureSpanSync,
	onRenderPerfFrameComplete,
} from "@/diagnostics/render-perf";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: FrameRate;
};

export class CanvasRenderer {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	fps: FrameRate;
	private exportCanvas: HTMLCanvasElement | null = null;

	constructor({ width, height, fps }: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.fps = fps;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	getOutputCanvas(): HTMLCanvasElement {
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		if (!this.exportCanvas) {
			this.exportCanvas = document.createElement("canvas");
			this.exportCanvas.width = this.width;
			this.exportCanvas.height = this.height;
		}
		return this.exportCanvas;
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;
		if (this.exportCanvas) {
			this.exportCanvas.width = width;
			this.exportCanvas.height = height;
		}

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	async render({ node, time }: { node: AnyBaseNode; time: number }) {
		await measureSpanAsync({
			name: "resolve",
			fn: () => resolveRenderTree({ node, renderer: this, time }),
		});
		const { frame, textures, postColorPasses } = await measureSpanAsync({
			name: "buildFrame",
			fn: () => buildFrameDescriptor({ node, renderer: this }),
		});
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		measureSpanSync({
			name: "syncTextures",
			fn: () => wasmCompositor.syncTextures(textures),
		});
		measureSpanSync({
			name: "renderFrame",
			fn: () => wasmCompositor.render(frame),
		});
		const output = this.getOutputCanvas();
		const ctx = output.getContext("2d");
		if (!ctx) throw new Error("Não foi possível criar o canvas de exportação.");
		let source: CanvasImageSource = wasmCompositor.getCanvas();
		if (postColorPasses.length > 0) {
			const initial = new OffscreenCanvas(this.width, this.height);
			const initialCtx = initial.getContext("2d");
			if (!initialCtx) throw new Error("Canvas de efeitos indisponível.");
			initialCtx.drawImage(source, 0, 0, this.width, this.height);
			let graded = initial;
			for (const pass of postColorPasses) {
				graded = applyColorAdjustPass({ source: graded, width: this.width, height: this.height, pass });
			}
			source = graded;
		}
		ctx.clearRect(0, 0, this.width, this.height);
		ctx.drawImage(source, 0, 0, this.width, this.height);
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: AnyBaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		await this.render({ node, time });

		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		measureSpanSync({
			name: "drawImage",
			fn: () =>
				ctx.drawImage(
					this.getOutputCanvas(),
					0,
					0,
					targetCanvas.width,
					targetCanvas.height,
				),
		});
		onRenderPerfFrameComplete();
	}
}
