import { describe, expect, test } from "bun:test";
import type { FrameDescriptor } from "../types";
import { toWasmFrameDescriptor } from "../wasm-frame-adapter";

const FRAME: FrameDescriptor = {
	width: 1280,
	height: 720,
	clear: { color: [0, 0, 0, 1] },
	items: [],
};

describe("published compositor WASM descriptor compatibility", () => {
	test("keeps normal frames untouched without allocations", () => {
		expect(toWasmFrameDescriptor(FRAME)).toBe(FRAME);
	});

	test("renames inline SceneEffect passes for Rust serde without altering layers", () => {
		const scenePasses = [[{ shader: "blur", uniforms: { radius: 2 } }]];
		const layer = {
			type: "layer" as const,
			textureId: "background",
			transform: {
				centerX: 640, centerY: 360, width: 1280, height: 720,
				rotationDegrees: 0, flipX: false, flipY: false,
			},
			opacity: 1,
			blendMode: "normal" as const,
			effectPassGroups: [],
			mask: null,
		};
		const frame: FrameDescriptor = {
			...FRAME,
			items: [layer, { type: "sceneEffect", effectPassGroups: scenePasses }],
		};
		const adapted = toWasmFrameDescriptor(frame);
		expect(adapted.items[0]).toBe(layer);
		expect(adapted.items[1]).toMatchObject({ type: "sceneEffect", effect_pass_groups: scenePasses });
		expect(frame.items[1]).not.toHaveProperty("effect_pass_groups");
	});
});
