import { describe, expect, test } from "bun:test";
import { COLOR_GRADE_EFFECTS } from "../definitions/color-grade";
import { colorAdjustFilter } from "../../services/renderer/color-adjust";
import { prepareColorAdjustedFrame } from "../../services/renderer/compositor/color-pass-processing";
import type { FrameItemDescriptor, TextureUploadDescriptor } from "../../services/renderer/compositor/types";

describe("color grading", () => {
	test("five presets expose real canvas-compatible color passes", () => {
		expect(COLOR_GRADE_EFFECTS).toHaveLength(5);
		for (const effect of COLOR_GRADE_EFFECTS) {
			const params = Object.fromEntries(effect.params.map((param) => [param.key, param.default]));
			const pass = effect.renderer.passes[0];
			expect(pass.shader).toBe("color-adjust");
			const uniforms = pass.uniforms({ effectParams: params, width: 640, height: 360 });
			expect(Object.keys(uniforms).sort()).toEqual(["u_brightness", "u_contrast", "u_saturation", "u_temperature"]);
			const css = colorAdjustFilter({ pass: { shader: pass.shader, uniforms } });
			expect(css.filter).toContain("brightness(");
			expect(css.filter).toContain("contrast(");
			expect(css.filter).toContain("saturate(");
			expect(css.tintOpacity).toBeGreaterThanOrEqual(0);
		}
	});

	test("out-of-range values are clamped", () => {
		const effect = COLOR_GRADE_EFFECTS[0];
		const uniforms = effect.renderer.passes[0].uniforms({
			effectParams: { brightness: 100, contrast: 100, saturation: -10, temperature: -100 },
			width: 320,
			height: 192,
		});
		expect(uniforms.u_brightness).toBe(1);
		expect(uniforms.u_contrast).toBe(2);
		expect(uniforms.u_saturation).toBe(0);
		expect(uniforms.u_temperature).toBe(-1);
	});
	test("separates scene and clip color passes from unsupported WASM shaders", () => {
		const color = { shader: "color-adjust", uniforms: { u_brightness: 0, u_contrast: 1, u_saturation: 0, u_temperature: 0 } };
		const blur = { shader: "gaussian-blur", uniforms: { u_sigma: 2, u_step: 1, u_direction: [1, 0] } };
		const items: FrameItemDescriptor[] = [
			{ type: "layer", textureId: "test", transform: { centerX: 10, centerY: 10, width: 20, height: 20, rotationDegrees: 0, flipX: false, flipY: false }, opacity: 1, blendMode: "normal", effectPassGroups: [[color, blur]], mask: null },
			{ type: "sceneEffect", effectPassGroups: [[color]] },
		];
		const textures = new Map<string, TextureUploadDescriptor>([["test", { kind: "rendered", id: "test", contentHash: "fixture", width: 20, height: 20, draw: () => {} }]]);
		const post = prepareColorAdjustedFrame({ items, textures });
		expect(post).toHaveLength(1);
		expect(items[0].effectPassGroups[0][0].shader).toBe("gaussian-blur");
		expect(items[1].effectPassGroups).toEqual([]);
		expect(textures.get("test")?.kind).toBe("rendered");
	});

});
