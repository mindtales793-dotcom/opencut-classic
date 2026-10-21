import { describe, expect, test } from "bun:test";
import {
	RETRO_VISUAL_MODES,
	resolveRetroVisual,
	retroTextStyle,
} from "../retro-automotive";

describe("Arquivo Automotivo Premium — Cris motion choices", () => {
	test("every selectable demo variant is supported", () => {
		expect(RETRO_VISUAL_MODES.map((entry) => entry.id)).toEqual([
			"auto", "file-card", "impact", "comparison", "evidence", "map", "split-screen",
		]);
	});
	test("prices and dates become animated impact numbers", () => {
		expect(resolveRetroVisual({ visualSlot: "number", sceneType: "number" })).toBe("impact");
		expect(resolveRetroVisual({ visualSlot: "date", sceneType: "context" })).toBe("impact");
	});
	test("explicit comparisons win over number scene type", () => {
		expect(resolveRetroVisual({ visualSlot: "comparison", sceneType: "number" })).toBe("comparison");
		expect(resolveRetroVisual({ visualSlot: "result", sceneType: "solution" })).toBe("comparison");
	});
	test("documents, conflicts, routes and hooks use the corresponding panels", () => {
		expect(resolveRetroVisual({ visualSlot: "document", sceneType: "context" })).toBe("file-card");
		expect(resolveRetroVisual({ visualSlot: "conflict", sceneType: "problem" })).toBe("evidence");
		expect(resolveRetroVisual({ visualSlot: "location", sceneType: "context" })).toBe("map");
		expect(resolveRetroVisual({ visualSlot: "default", sceneType: "hook" })).toBe("split-screen");
	});
	test("manual scene choice overrides automatic detection", () => {
		expect(resolveRetroVisual({ mode: "evidence", visualSlot: "number", sceneType: "number" })).toBe("evidence");
	});
	test("different intensity levels change editable timeline text styling", () => {
		const soft = retroTextStyle({
			visualSlot: "number",
			sceneType: "number",
			intensity: "soft",
		});
		const strong = retroTextStyle({
			visualSlot: "number",
			sceneType: "number",
			intensity: "strong",
		});
		expect(strong.fontSize).toBeGreaterThan(soft.fontSize);
		expect(strong.paddingX).toBeGreaterThan(soft.paddingX);
		expect(soft.color).toBe("#A81818");
	});
});
