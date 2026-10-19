import { describe, expect, test } from "bun:test";
import { estimateKaraokeWords } from "../karaoke";

describe("karaoke captions with honest estimated word timing", () => {
	test("preserves all words and covers the exact cue duration", () => {
		const words = estimateKaraokeWords({ caption: { text: "Olá, mundo! Como vai?", startTime: 1.5, duration: 2.7 } });
		expect(words.map((item) => item.word)).toEqual(["Olá,", "mundo!", "Como", "vai?"]);
		expect(words[0].startTime).toBe(1.5);
		expect(words.at(-1)!.startTime + words.at(-1)!.duration).toBeCloseTo(4.2);
		for (let i = 1; i < words.length; i++) {
			expect(words[i].startTime).toBeCloseTo(words[i - 1].startTime + words[i - 1].duration);
		}
	});

	test("rejects invalid or excessive cues without producing bogus timestamps", () => {
		expect(estimateKaraokeWords({ caption: { text: "um dois", startTime: 0, duration: 0 } })).toEqual([]);
		expect(estimateKaraokeWords({ caption: { text: "um dois três", startTime: 0, duration: 1 }, maxWords: 2 })).toEqual([]);
		expect(estimateKaraokeWords({ caption: { text: "  ", startTime: 0, duration: 1 } })).toEqual([]);
	});
});
