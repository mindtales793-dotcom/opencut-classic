import { describe, expect, test } from "bun:test";
import { interpolate, spring } from "remotion";
import { buildRemotionCompositionClip } from "../remotion-timeline";
import { parseComposerFrameInput, DARKCUT_REMOTION_GRAPHIC_ID } from "../remotion-compositor-canvas";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import type { ElementAnimations } from "@/animation/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import {
	composerSlidePixels,
	composerTextAnimations,
} from "../composer-motion";

const at = ({
	animations,
	path,
	seconds,
}: {
	animations: ElementAnimations;
	path: string;
	seconds: number;
}) =>
	resolveAnimationPathValueAtTime({
		animations,
		propertyPath: path,
		localTime: mediaTimeFromSeconds({ seconds }),
		fallbackValue: Number.NaN,
	});

function keysOf({
	animations,
	path,
}: {
	animations: ElementAnimations;
	path: string;
}) {
	const channel = animations[path];
	const keys = channel?.keys;
	if (!Array.isArray(keys)) throw new Error(`missing channel ${path}`);
	return keys;
}

const keyTimes = ({
	animations,
	path,
}: {
	animations: ElementAnimations;
	path: string;
}) =>
	keysOf({ animations, path }).map((key) =>
		mediaTimeToSeconds({ time: key.time }),
	);

describe("Remotion Composer motion as timeline keyframes", () => {
	const base = { baseX: 0, canvasWidth: 1920 };

	test("fades in, holds and fades out like the Composer", () => {
		const animations = composerTextAnimations({
			...base,
			durationSeconds: 4,
		});
		expect(at({ animations, path: "opacity", seconds: 0 })).toBeCloseTo(0, 5);
		expect(at({ animations, path: "opacity", seconds: 2 })).toBeCloseTo(1, 5);
		expect(at({ animations, path: "opacity", seconds: 4 })).toBeCloseTo(0, 5);
		// Halfway through the fade-in (10 frames at 15 fps = 0.667 s).
		expect(at({ animations, path: "opacity", seconds: 0.333 })).toBeCloseTo(
			0.5,
			1,
		);
	});

	test("slide-in follows the same spring as the Player and settles on the base", () => {
		const slide = composerSlidePixels({
			canvasWidth: 1920,
			intensity: "normal",
		});
		expect(slide).toBeCloseTo(130, 5); // 65px of a 960px composition, doubled.

		const animations = composerTextAnimations({ ...base, durationSeconds: 5 });
		expect(
			at({ animations, path: "transform.positionX", seconds: 0 }),
		).toBeCloseTo(slide, 3);

		for (const seconds of [0.1, 0.25, 0.5]) {
			const progress = spring({
				frame: seconds * 30,
				fps: 30,
				config: { damping: 20, stiffness: 120, mass: 0.85 },
			});
			const expected = interpolate(progress, [0, 1], [slide, 0]);
			// Sampled at 30 fps and interpolated linearly: allow a couple of pixels.
			expect(
				Math.abs(
					at({ animations, path: "transform.positionX", seconds: seconds }) -
						expected,
				),
			).toBeLessThan(2);
		}
		expect(
			at({ animations, path: "transform.positionX", seconds: 4 }),
		).toBeCloseTo(0, 1);
	});

	test("keeps the element's resting position as the slide target", () => {
		const animations = composerTextAnimations({
			baseX: -240,
			canvasWidth: 1920,
			durationSeconds: 3,
		});
		expect(
			at({ animations, path: "transform.positionX", seconds: 2.9 }),
		).toBeCloseTo(-240, 0);
	});

	test("push-in grows slowly and respects the base scale", () => {
		const animations = composerTextAnimations({
			...base,
			baseScale: 2,
			durationSeconds: 6,
		});
		expect(
			at({ animations, path: "transform.scaleX", seconds: 0 }),
		).toBeCloseTo(2, 5);
		expect(
			at({ animations, path: "transform.scaleY", seconds: 6 }),
		).toBeCloseTo(2 * 1.045, 4);
	});

	test("intensity scales the movement", () => {
		const soft = composerSlidePixels({ canvasWidth: 1920, intensity: "soft" });
		const normal = composerSlidePixels({
			canvasWidth: 1920,
			intensity: "normal",
		});
		const strong = composerSlidePixels({
			canvasWidth: 1920,
			intensity: "strong",
		});
		expect(soft).toBeLessThan(normal);
		expect(normal).toBeLessThan(strong);
		// Resolution independent: a 1080p canvas moves proportionally less.
		expect(
			composerSlidePixels({ canvasWidth: 960, intensity: "normal" }),
		).toBeCloseTo(65, 5);
	});

	test("keyframe times are strictly increasing, even for very short scenes", () => {
		for (const durationSeconds of [0.2, 0.5, 1, 2.5, 12]) {
			const animations = composerTextAnimations({ ...base, durationSeconds });
			for (const path of Object.keys(animations)) {
				const times = keyTimes({ animations, path });
				for (let index = 1; index < times.length; index++) {
					expect(times[index]).toBeGreaterThan(times[index - 1]);
				}
				expect(times[times.length - 1]).toBeLessThanOrEqual(
					Math.max(0.2, durationSeconds) + 1e-3,
				);
			}
			// A scene never ends visible: it has faded out on its last frame.
			expect(
				at({
					animations,
					path: "opacity",
					seconds: Math.max(0.2, durationSeconds),
				}),
			).toBeCloseTo(0, 5);
		}
	});

	test("generated ids never look like transition channels", () => {
		const animations = composerTextAnimations({ ...base, durationSeconds: 3 });
		for (const path of Object.keys(animations)) {
			for (const key of keysOf({ animations, path })) {
				expect(key.id.startsWith("darkcut-")).toBe(false);
			}
		}
	});
});


describe("Remotion full-frame timeline composition", () => {
  test("constructs an editable export-ready graphic with exact frame duration and dimensions", () => {
    const clip = buildRemotionCompositionClip({
      startTime: mediaTimeFromSeconds({ seconds: 2 }),
      duration: mediaTimeFromSeconds({ seconds: 5 }),
      canvasWidth: 1920, canvasHeight: 1080,
      templateId: "vox", templateTitle: "VOX", heading: "Comparação", subtitle: "Antes e depois",
      sceneType: "problem", visualSlot: "comparison", intensity: "strong",
    });
    expect(clip.type).toBe("graphic");
    expect(clip.definitionId).toBe(DARKCUT_REMOTION_GRAPHIC_ID);
    expect(clip.duration).toBe(mediaTimeFromSeconds({ seconds: 5 }));
    expect(clip.params["transform.scaleX"]).toBeCloseTo(1920 / 1080, 5);
    expect(clip.params["transform.scaleY"]).toBe(1);
    expect(clip.params.heading).toBe("Comparação");
    expect(at({ animations: clip.animations ?? {}, path: "params.frame", seconds: 0 })).toBe(0);
    expect(at({ animations: clip.animations ?? {}, path: "params.frame", seconds: 2.5 })).toBeCloseTo(45, 3);
    expect(at({ animations: clip.animations ?? {}, path: "params.frame", seconds: 5 })).toBe(90);
  });
  test("keeps vertical exports full screen and rejects zero duration", () => {
    const input = {
      startTime: mediaTimeFromSeconds({ seconds: 0 }),
      duration: mediaTimeFromSeconds({ seconds: 4 }),
      canvasWidth: 1080, canvasHeight: 1920,
      templateId: "shorts-hook", templateTitle: "Shorts", heading: "Gancho",
      subtitle: "", sceneType: "hook" as const, visualSlot: "default" as const,
      intensity: "normal" as const,
    };
    const result = buildRemotionCompositionClip(input);
    expect(result.params["transform.scaleX"]).toBe(1);
    expect(result.params["transform.scaleY"]).toBeCloseTo(1920 / 1080, 5);
    expect(() => buildRemotionCompositionClip({ ...input, duration: 0 })).toThrow();
  });
  test("clamps invalid frame values for deterministic export", () => {
    const p = parseComposerFrameInput({ templateId: "documentary", frame: 140 });
    expect(p.frame).toBe(90);
    expect(parseComposerFrameInput({ frame: -10 }).frame).toBe(0);
  });
});
