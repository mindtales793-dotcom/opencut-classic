import { describe, expect, test } from "bun:test";
import { applyCaptionPreset, CAPTION_PRESETS } from "../caption-presets";
import type { SubtitleCue } from "../types";

const captions: SubtitleCue[] = [
	{ startTime: 0, duration: 1.5, text: "Olá mundo", style: { color: "#123456", background: { enabled: true, color: "#ffffff" } } },
	{ startTime: 1.5, duration: 2, text: "Outro trecho" },
];

describe("caption presets", () => {
	test("preserves original SRT/ASS formatting when Original is selected", () => {
		const result = applyCaptionPreset({ captions, presetId: "original" });
		expect(result).toEqual(captions);
		expect(result).not.toBe(captions);
		expect(result[0].style?.color).toBe("#123456");
	});

	test("applies chosen preset to every cue without changing timing or words", () => {
		const result = applyCaptionPreset({ captions, presetId: "shorts-pop" });
		expect(result.map(({ text, startTime, duration }) => ({ text, startTime, duration })))
			.toEqual(captions.map(({ text, startTime, duration }) => ({ text, startTime, duration })));
		expect(result[0].style?.color).toBe("#ffffff");
		expect(result[1].style?.background?.enabled).toBe(true);
		expect(result[0].style?.placement?.verticalAlign).toBe("bottom");
		expect(captions[0].style?.color).toBe("#123456");
	});

	test("all styles have unique IDs and a label", () => {
		expect(new Set(CAPTION_PRESETS.map((item) => item.id)).size).toBe(CAPTION_PRESETS.length);
		expect(CAPTION_PRESETS.every((item) => item.label.length > 0)).toBe(true);
	});
});
