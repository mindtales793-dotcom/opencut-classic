import { beforeEach, expect, mock, test } from "bun:test";

// Run this file in its own Bun process: browser APIs are replaced here.
let cancelCalls = 0;
let rendered = 0;
let failRender = false;
let failFinalize = false;
let failCleanup = false;
let adds: number[] = [];
const canvas = { width: 320, height: 192 };
mock.module("@/wasm", () => ({ TICKS_PER_SECOND: 30000 }));
mock.module("opencut-wasm", () => ({
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 30000,
}));
mock.module("@/fps/utils", () => ({
	frameRateToFloat: (fps: { numerator: number; denominator: number }) =>
		fps.numerator / fps.denominator,
}));
mock.module("../canvas-renderer", () => ({
	CanvasRenderer: class {
		width = 320;
		height = 192;
		fps = { numerator: 30, denominator: 1 };
		getOutputCanvas() {
			return canvas;
		}
		async render() {
			rendered++;
			if (failRender) throw new Error("render failed");
		}
	},
}));
mock.module("mediabunny", () => ({
	Output: class {
		target = { buffer: new ArrayBuffer(8) };
		addVideoTrack() {}
		addAudioTrack() {}
		async start() {}
		async cancel() {
			cancelCalls++;
			if (failCleanup) throw new Error("cleanup failed");
		}
		async finalize() {
			if (failFinalize) throw new Error("finalize failed");
		}
	},
	CanvasSource: class {
		async add(time: number) {
			adds.push(time);
		}
		close() {}
	},
	AudioBufferSource: class {},
	BufferTarget: class {},
	Mp4OutputFormat: class {},
	WebMOutputFormat: class {},
	QUALITY_LOW: 1,
	QUALITY_MEDIUM: 2,
	QUALITY_HIGH: 3,
	QUALITY_VERY_HIGH: 4,
}));
const { SceneExporter } = await import("../scene-exporter");
import type { RootNode } from "../nodes/root-node";
function exporter() {
	return new SceneExporter({
		width: 320,
		height: 192,
		fps: { numerator: 30, denominator: 1 },
		format: "mp4",
		quality: "high",
	});
}
// The renderer mock only needs a duration from the real root-node interface.
const scene = { duration: 1500 } as RootNode;
beforeEach(() => {
	cancelCalls = 0;
	rendered = 0;
	failRender = false;
	failFinalize = false;
	failCleanup = false;
	adds = [];
});
test("releases encoder resources on rendering failure without hiding the cause", async () => {
	failRender = true;
	failCleanup = true;
	await expect(exporter().export({ rootNode: scene })).rejects.toThrow(
		"render failed",
	);
	expect(cancelCalls).toBe(1);
});
test("releases encoder resources on finalization failure", async () => {
	failFinalize = true;
	await expect(exporter().export({ rootNode: scene })).rejects.toThrow(
		"finalize failed",
	);
	expect(cancelCalls).toBe(1);
});
test("does not start rendering an already cancelled export", async () => {
	const job = exporter();
	job.cancel();
	expect(await job.export({ rootNode: scene })).toBeNull();
	expect(rendered).toBe(0);
});
test("includes the last partial frame and reports completion only after finalizing", async () => {
	const job = exporter();
	const progress: number[] = [];
	job.on("progress", (value) => progress.push(value));
	expect(await job.export({ rootNode: scene })).toBeInstanceOf(ArrayBuffer);
	expect(adds).toEqual([0, 1 / 30]);
	expect(progress.at(-1)).toBe(1);
	expect(cancelCalls).toBe(0);
});
