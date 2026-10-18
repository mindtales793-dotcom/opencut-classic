import { describe, expect, test } from "bun:test";
import { chooseProjectCover, createProjectPlaceholder } from "../cover-utils";
import type { TScene } from "@/timeline/types";

const visual=(mediaId:string,type:"image"|"video",startTime:number,hidden=false)=>({
	type,mediaId,startTime,duration:5,hidden,
});
const scene=(primary:ReturnType<typeof visual>[], overlays:ReturnType<typeof visual>[] = []):TScene => ({
	tracks: {
		main:{id:"main",type:"video",hidden:false,elements:primary},
		overlay:[{id:"overlay",type:"video",hidden:false,elements:overlays}],
		audio:[],
	},
}) as unknown as TScene;

describe("Smart project cover selection", () => {
	test("chooses earliest visible timeline image instead of a black 00:00 frame", () => {
		const choice=chooseProjectCover([
			scene([visual("late","video",16),visual("first","image",2)]),
		],[{id:"late",type:"video"},{id:"first",type:"image"}]);
		expect(choice).toEqual({mediaId:"first",type:"image",startTime:2});
	});
	test("skips hidden and missing media", () => {
		const choice=chooseProjectCover([
			scene([visual("hidden","image",0,true),visual("missing","video",1)]),
		],[{id:"hidden",type:"image"},{id:"fallback",type:"image"}]);
		expect(choice?.mediaId).toBe("fallback");
	});
	test("chooses overlay if it is earliest", () => {
		const choice=chooseProjectCover([
			scene([visual("later","video",5)],[visual("earlier","image",1)]),
		],[{id:"later",type:"video"},{id:"earlier",type:"image"}]);
		expect(choice?.mediaId).toBe("earlier");
	});
	test("does not invent a cover when no visual exists", () => {
		expect(chooseProjectCover([scene([])],[])).toBeNull();
	});
	test("safe project placeholder is themed and escapes markup", () => {
		const value=createProjectPlaceholder('Corsa <script>alert(1)</script>');
		expect(value.startsWith("data:image/svg+xml")).toBe(true);
		const decoded=decodeURIComponent(value);
		expect(decoded).toContain("AUTOMOTIVO");
		expect(decoded).not.toContain("<script>");
	});
});
