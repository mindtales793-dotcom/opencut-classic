import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { mediaSortValue, sortProjectMedia } from "../media-sort";

const asset = ({
	id,
	name,
	type = "image",
	duration,
	size = 1024,
	fileDate = 100,
	lastModified,
}: {
	id: string;
	name: string;
	type?: MediaAsset["type"];
	duration?: number;
	size?: number;
	fileDate?: number;
	lastModified?: number;
}): MediaAsset => ({
	id, name, type, duration, lastModified,
	file: { size, lastModified: fileDate } as File,
});

describe("DarkCut project media sort controls", () => {
	const a = asset({id: "a", name: "Cena 10.png", fileDate: 333, lastModified: 50, size: 80, duration: 15});
	const b = asset({id: "b", name: "Cena 2.png", fileDate: 100, lastModified: 250, size: 40, duration: 7});
	const c = asset({id: "c", name: "Cena 1.mp3", type: "audio", fileDate: 150, size: 60, duration: 9});

	test("numeric natural scene order, ascending and descending, without mutating original list", () => {
		const input = [a, b, c];
		expect(sortProjectMedia(input, "scene", "asc").map(x=>x.id)).toEqual(["c","b","a"]);
		expect(sortProjectMedia(input, "scene", "desc").map(x=>x.id)).toEqual(["a","b","c"]);
		expect(input.map(x=>x.id)).toEqual(["a","b","c"]);
	});

	test("sort by original persisted file date, not OPFS rewritten date", () => {
		expect(mediaSortValue(a,"date")).toBe(50);
		expect(sortProjectMedia([a,b,c],"date","desc").map(x=>x.id)).toEqual(["b","c","a"]);
		expect(sortProjectMedia([a,b,c],"date","asc").map(x=>x.id)).toEqual(["a","c","b"]);
	});

	test("sorts size and duration both ways", () => {
		expect(sortProjectMedia([a,b,c],"size","asc").map(x=>x.id)).toEqual(["b","c","a"]);
		expect(sortProjectMedia([a,b,c],"duration","desc").map(x=>x.id)).toEqual(["a","c","b"]);
		expect(sortProjectMedia([a,b,c],"type","asc").map(x=>x.id)).toEqual(["c","b","a"]);
	});

	test("missing times/dates stay at the end instead of becoming epoch 1970", () => {
		const missing = asset({id:"u",name:"Sem metadados",fileDate: Number.NaN, duration:undefined});
		expect(sortProjectMedia([missing,b],"date","asc").map(x=>x.id)).toEqual(["b","u"]);
		expect(sortProjectMedia([missing,b],"date","desc").map(x=>x.id)).toEqual(["b","u"]);
		expect(sortProjectMedia([missing,b],"duration","desc").map(x=>x.id)).toEqual(["b","u"]);
	});

	test("duplicate names use deterministic stable ID tie-breaks", () => {
		const d=asset({id:"d",name:"Cena 2.png",fileDate:100});
		expect(sortProjectMedia([d,b],"name","asc").map(x=>x.id)).toEqual(["b","d"]);
	});
});
