import { describe, expect, test } from "bun:test";
import { COLOR_GRADE_EFFECTS } from "../definitions/color-grade";
import { colorAdjustFilter } from "../../services/renderer/color-adjust";

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
});
