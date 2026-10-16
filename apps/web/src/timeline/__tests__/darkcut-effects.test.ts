import { expect, test } from "bun:test";
import {
	DARKCUT_MOTIONS,
	DARKCUT_TRANSITIONS,
	motionAnimations,
	transitionAnimations,
	clearDarkCutTransitions,
} from "../darkcut-tools";
import { mediaTimeFromSeconds } from "@/wasm";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import type { ImageElement } from "../types";
import type { EditorCore } from "@/core";
const time = (seconds: number) => mediaTimeFromSeconds({ seconds });
const image = (): ImageElement => ({
	id: "test",
	type: "image",
	name: "test",
	mediaId: "test",
	duration: time(4),
	startTime: time(0),
	trimStart: time(0),
	trimEnd: time(0),
	params: {
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": 1,
		"transform.scaleY": 1,
		opacity: 1,
	},
});
const value = (e: ImageElement, path: string, seconds: number) =>
	resolveAnimationPathValueAtTime({
		animations: e.animations,
		propertyPath: path,
		localTime: time(seconds),
		fallbackValue: Number(e.params[path] ?? 0),
	});
const signature = (e: ImageElement) =>
	JSON.stringify(
		[0.1, 0.3, 2, 3.9].flatMap((t) =>
			[
				"opacity",
				"transform.positionX",
				"transform.positionY",
				"transform.scaleX",
			].map((p) => value(e, p, t)),
		),
	);
test("ten motions are distinct", () => {
	expect(
		new Set(
			DARKCUT_MOTIONS.map(({ id }) => {
				const e = image();
				e.animations = motionAnimations({
					element: e,
					preset: id,
					intensity: "normal",
				});
				return signature(e);
			}),
		).size,
	).toBe(10);
});
test("six transitions remain distinct with every motion", () => {
	for (const motion of DARKCUT_MOTIONS) {
		const e = image();
		e.animations = motionAnimations({
			element: e,
			preset: motion.id,
			intensity: "normal",
		});
		expect(
			new Set(
				DARKCUT_TRANSITIONS.map(({ id }) =>
					signature({
						...e,
						animations: transitionAnimations({ element: e, preset: id }),
					}),
				),
			).size,
		).toBe(6);
	}
});
test("replacement does not stack and clearing restores saved camera", () => {
	const e = image();
	e.animations = motionAnimations({
		element: e,
		preset: "ken-burns",
		intensity: "normal",
	});
	const baseline = e.animations;
	e.animations = transitionAnimations({ element: e, preset: "slide-left" });
	const once = JSON.stringify(e.animations);
	e.animations = transitionAnimations({ element: e, preset: "slide-left" });
	expect(JSON.stringify(e.animations)).toBe(once);
	e.animations = JSON.parse(
		JSON.stringify(transitionAnimations({ element: e, preset: "zoom" })),
	);
	let patch: any;
	const editor = {
		scenes: {
			getActiveScene: () => ({
				tracks: { main: { id: "main", elements: [e] }, overlay: [], audio: [] },
			}),
		},
		timeline: {
			getElementsWithTracks: () => [{ track: { id: "main" }, element: e }],
			updateElements: ({ updates }: any) => {
				patch = updates[0].patch;
			},
		},
	} as unknown as EditorCore;
	clearDarkCutTransitions({
		editor,
		refs: [{ trackId: "main", elementId: e.id }],
	});
	expect(patch.animations).toEqual(baseline);
});
test("pan to zoom clears stale movement but preserves slide", () => {
	const e = image();
	e.animations = motionAnimations({
		element: e,
		preset: "pan-up-down",
		intensity: "normal",
	});
	e.animations = transitionAnimations({ element: e, preset: "slide-right" });
	e.animations = motionAnimations({
		element: e,
		preset: "zoom-in",
		intensity: "normal",
	});
	expect(e.animations["transform.positionY"]).toBeUndefined();
	expect(value(e, "transform.positionX", 0.1)).toBeLessThan(0);
	expect(value(e, "transform.scaleX", 3)).toBeGreaterThan(
		value(e, "transform.scaleX", 1),
	);
});
