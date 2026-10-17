import { describe, expect, test } from "bun:test";
import {
	analyzeSceneSrt,
	makeSrtTimingGroups,
	resolveSrtSyncStrategy,
	sceneNumberFromName,
} from "../srt-scene-sync";

const sample = `1
00:00:00,000 --> 00:00:08,000
Primeira fala

2
00:00:08,000 --> 00:00:13,200
Segunda fala

3
00:00:13,200 --> 00:00:18,000
Terceira fala

4
00:00:18,000 --> 00:00:22,400
Quarta fala`;

describe("DarkCut SRT smart synchronization", () => {
	test("reads exact starts/ends from contiguous narration SRT", () => {
		const analysis = analyzeSceneSrt(sample);
		expect(analysis.cues).toHaveLength(4);
		expect(analysis.overlaps).toBe(0);
		expect(analysis.gaps).toBe(0);
		expect(analysis.durationSeconds).toBeCloseTo(22.4);
		expect(analysis.cues[1].startSeconds).toBeCloseTo(8);
		expect(analysis.cues[1].endSeconds).toBeCloseTo(13.2);
	});

	test("accepts unusual 1000ms values without dropping cues", () => {
		const input = `39
00:03:31,200 --> 00:03:35,1000
Cena trinta e nove

40
00:03:35,1000 --> 00:03:40,400
Cena quarenta`;
		const analysis = analyzeSceneSrt(input);
		expect(analysis.invalidBlocks).toBe(0);
		expect(analysis.cues).toHaveLength(2);
		expect(analysis.nonStandardTimestamps).toBe(2);
		expect(analysis.overlaps).toBe(0);
		expect(analysis.gaps).toBe(0);
		expect(analysis.cues[0].endSeconds).toBeCloseTo(216);
		expect(analysis.cues[1].startSeconds).toBeCloseTo(216);
	});

	test("detects bad blocks, gaps and overlapping timings", () => {
		const input = `1
00:00:00,000 --> 00:00:03,000
Cena 1

2
00:00:04,000 --> 00:00:06,000
Cena 2

3
00:00:05,000 --> 00:00:08,000
Cena 3

4
invalid --> invalid
Cena 4`;
		const analysis = analyzeSceneSrt(input);
		expect(analysis.invalidBlocks).toBe(1);
		expect(analysis.gaps).toBe(1);
		expect(analysis.overlaps).toBe(1);
	});

	test("keeps one image per cue in the exact mode", () => {
		const cues = analyzeSceneSrt(sample).cues;
		const group = makeSrtTimingGroups({
			cues,
			visualCount: 4,
			strategy: "one-per-cue",
		});
		expect(group).toHaveLength(4);
		expect(group[1].startSeconds).toBeCloseTo(8);
		expect(group[1].endSeconds).toBeCloseTo(13.2);
		expect(group[1].cueCount).toBe(1);
	});

	test("groups adjacent cues when there are fewer images", () => {
		const cues = analyzeSceneSrt(sample).cues;
		const group = makeSrtTimingGroups({
			cues,
			visualCount: 2,
			strategy: "fit-to-media",
		});
		expect(group).toHaveLength(2);
		expect(group[0].firstCue).toBe(1);
		expect(group[0].lastCue).toBe(2);
		expect(group[1].firstCue).toBe(3);
		expect(group[1].lastCue).toBe(4);
		expect(group[0].endSeconds).toBe(group[1].startSeconds);
		expect(group.reduce((sum, item) => sum + item.cueCount, 0)).toBe(4);
	});

	test("recognizes numbered scene filenames but not car model numbers", () => {
		expect(sceneNumberFromName("Cena 001.jpg")).toBe(1);
		expect(sceneNumberFromName("Imagem_390.webp")).toBe(390);
		expect(sceneNumberFromName("Scene-004.png")).toBe(4);
		expect(sceneNumberFromName("HB20.jpg")).toBeNull();
		expect(sceneNumberFromName("Gol 1996.png")).toBeNull();
	});
	test("handles different SRT quantities on every import", () => {
		const initial = analyzeSceneSrt(sample).cues;
		expect(resolveSrtSyncStrategy({
			strategy: "auto", cueCount: 4, visualCount: 4,
		})).toBe("one-per-cue");
		expect(resolveSrtSyncStrategy({
			strategy: "auto", cueCount: 4, visualCount: 2,
		})).toBe("fit-to-media");
		expect(resolveSrtSyncStrategy({
			strategy: "auto", cueCount: 4, visualCount: 6,
		})).toBe("one-per-cue");

		const short = makeSrtTimingGroups({
			cues: initial, visualCount: 2, strategy: "auto",
		});
		expect(short).toHaveLength(2);
		expect(short[1].endSeconds).toBeCloseTo(22.4);
		expect(short.reduce((sum, item) => sum + item.cueCount, 0)).toBe(4);

		// Another uploaded SRT may have fewer cues than the existing visuals.
		const excess = makeSrtTimingGroups({
			cues: initial.slice(0, 2), visualCount: 6, strategy: "auto",
		});
		expect(excess).toHaveLength(2);
		expect(excess[0].startSeconds).toBe(0);
		expect(excess[1].endSeconds).toBeCloseTo(13.2);
	});

	test("rebuilds an auto plan for a SRT with hundreds of cues", () => {
		const cues = Array.from({ length: 240 }, (_, index) => ({
			index: index + 1,
			startSeconds: index * 3.5,
			endSeconds: (index + 1) * 3.5,
			text: `Cena ${index + 1}`,
		}));
		const matching = makeSrtTimingGroups({ cues, visualCount: 240, strategy: "auto" });
		expect(matching).toHaveLength(240);
		expect(matching[239].endSeconds).toBeCloseTo(840);
		const grouped = makeSrtTimingGroups({ cues, visualCount: 120, strategy: "auto" });
		expect(grouped).toHaveLength(120);
		expect(grouped.reduce((sum, item) => sum + item.cueCount, 0)).toBe(240);
		expect(grouped.at(-1)?.endSeconds).toBeCloseTo(840);
	});

});
