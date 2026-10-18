import { describe, expect, test } from "bun:test";
import {
	parseYouTubeDuration,
	rankYouTubeCandidates,
} from "../youtube-candidate-ranker";

describe("YouTube B-roll ranking and Shorts filters", () => {
	test("parses ISO durations without guessing", () => {
		expect(parseYouTubeDuration("PT37M29S")).toBe(2249);
		expect(parseYouTubeDuration("PT1H2M3S")).toBe(3723);
		expect(parseYouTubeDuration("PT59S")).toBe(59);
		expect(parseYouTubeDuration("bad")).toBeNull();
	});
	const candidates = [
		{id:"1",title:"Chevrolet Corsa driving",channel:"Canal A",durationSeconds:54},
		{id:"2",title:"Chevrolet Corsa review 2025",channel:"Canal A",durationSeconds:700},
		{id:"3",title:"Chevrolet Corsa dealership",channel:"Canal B",durationSeconds:530},
		{id:"4",title:"Hyundai HB20 dealership",channel:"Canal B",durationSeconds:800},
		{id:"5",title:"Chevrolet Corsa long video",channel:"Canal A"},
	];
	test("avoids video below 61 seconds while keeping an unknown duration", () => {
		const chosen=rankYouTubeCandidates(candidates,"Chevrolet Corsa car", "over-minute");
		expect(chosen.some(item=>item.id==="1")).toBe(false);
		expect(chosen.some(item=>item.id==="4")).toBe(false);
		expect(chosen.some(item=>item.id==="5")).toBe(true);
	});
	test("can include short clips on request", () => {
		const chosen=rankYouTubeCandidates(candidates,"Chevrolet Corsa car", "all");
		expect(chosen.some(item=>item.id==="1")).toBe(true);
	});
	test("honors 3-minute filter and excludes non-embeddable results", () => {
		const chosen=rankYouTubeCandidates([
			...candidates,
			{id:"6",title:"Chevrolet Corsa dealership",channel:"Canal X",durationSeconds:900,embeddable:false},
			{id:"7",title:"Chevrolet Corsa short documentary",channel:"Canal Y",durationSeconds:160},
		],"Chevrolet Corsa","over-three-minutes");
		expect(chosen.some(item=>item.id==="6")).toBe(false);
		expect(chosen.some(item=>item.id==="7")).toBe(false);
	});
});
