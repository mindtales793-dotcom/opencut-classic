import { interpolate, spring } from "remotion";
import type {
	ElementAnimations,
	ScalarAnimationChannel,
} from "@/animation/types";
import { mediaTimeFromSeconds } from "@/wasm";

/**
 * Turns the Remotion Composer's scene motion into native timeline keyframes.
 *
 * The Composer (src/remotion/darkcut-composer.tsx) only runs inside a React
 * <Player>, so nothing it animates reaches the exported MP4. The scene's look
 * is already applied to the timeline as a text element; this module gives that
 * element the Composer's movement (spring slide-in, fade in/out and a slow
 * push-in) using the very same `spring()` / `interpolate()` math, sampled into
 * keyframes. The export pipeline (GPU compositor -> FFmpeg) then renders it
 * like any other animation, with no React or DOM work per frame.
 */

export type ComposerMotionIntensity = "soft" | "normal" | "strong";

/** Same numbers as UniversalComposer in darkcut-composer.tsx. */
const COMPOSER_FPS = 15;
const COMPOSITION_WIDTH = 960;
const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.85 };
const SLIDE_PX = 65;
const FADE_IN_FRAMES = 10;
const FADE_OUT_FRAMES = 8;
const ZOOM_AMOUNT = 0.045;
const ZOOM_REFERENCE_SECONDS = 6;
const SAMPLE_FPS = 30;
const MAX_ENTRANCE_SECONDS = 1.2;

const INTENSITY_FACTOR: Record<ComposerMotionIntensity, number> = {
	soft: 0.6,
	normal: 1,
	strong: 1.4,
};

type Point = [seconds: number, value: number];

function channel({
	property,
	points,
}: {
	property: string;
	points: Point[];
}): ScalarAnimationChannel {
	return {
		keys: points.map(([seconds, value], index) => ({
			// Deliberately not "darkcut-…": transition cleanup treats such ids as its own.
			id: `composer-${property}-${index}`,
			time: mediaTimeFromSeconds({ seconds: Math.max(0, seconds) }),
			value,
			segmentToNext: "linear",
			tangentMode: "flat",
		})),
	};
}

/** Strictly increasing times (keyframes at the same time would collide). */
function dedupe(points: Point[]): Point[] {
	const result: Point[] = [];
	for (const point of points) {
		const previous = result[result.length - 1];
		if (previous && point[0] - previous[0] < 1e-4) {
			result[result.length - 1] = point;
		} else {
			result.push(point);
		}
	}
	return result;
}

export function composerFadeSeconds({
	durationSeconds,
}: {
	durationSeconds: number;
}): { fadeIn: number; fadeOut: number } {
	return {
		fadeIn: Math.min(FADE_IN_FRAMES / COMPOSER_FPS, durationSeconds * 0.3),
		fadeOut: Math.min(FADE_OUT_FRAMES / COMPOSER_FPS, durationSeconds * 0.25),
	};
}

/** Horizontal slide distance in canvas pixels for the given canvas width. */
export function composerSlidePixels({
	canvasWidth,
	intensity,
}: {
	canvasWidth: number;
	intensity: ComposerMotionIntensity;
}): number {
	return (
		(SLIDE_PX * INTENSITY_FACTOR[intensity] * canvasWidth) / COMPOSITION_WIDTH
	);
}

export function composerTextAnimations({
	durationSeconds,
	baseX,
	canvasWidth,
	baseScale = 1,
	intensity = "normal",
}: {
	durationSeconds: number;
	/** The element's resting `transform.positionX`, in canvas pixels. */
	baseX: number;
	canvasWidth: number;
	baseScale?: number;
	intensity?: ComposerMotionIntensity;
}): ElementAnimations {
	const duration = Math.max(0.2, durationSeconds);
	const factor = INTENSITY_FACTOR[intensity];
	const { fadeIn, fadeOut } = composerFadeSeconds({
		durationSeconds: duration,
	});
	const slide = composerSlidePixels({ canvasWidth, intensity });

	// Opacity: 0 -> 1 -> hold -> 0, as interpolate(frame, [0, 10, 82, 90], [0, 1, 1, 0]).
	const opacity = dedupe([
		[0, 0],
		[fadeIn, 1],
		[duration - fadeOut, 1],
		[duration, 0],
	]);

	// Slide: spring(0 -> 1) mapped to [slide, 0], sampled until it has settled.
	const entranceEnd = Math.min(MAX_ENTRANCE_SECONDS, duration * 0.6);
	const steps = Math.max(2, Math.ceil(entranceEnd * SAMPLE_FPS));
	const positionX: Point[] = [];
	for (let step = 0; step <= steps; step++) {
		const seconds = (step / steps) * entranceEnd;
		const progress = spring({
			frame: seconds * SAMPLE_FPS,
			fps: SAMPLE_FPS,
			config: SPRING_CONFIG,
		});
		positionX.push([
			seconds,
			baseX + interpolate(progress, [0, 1], [slide, 0]),
		]);
	}
	positionX.push([duration, baseX]);

	// Push-in: interpolate(frame, [0, 90], [1, 1 + 0.045 * motion]) over 6 s.
	const zoomEnd =
		1 + ZOOM_AMOUNT * factor * Math.min(1, duration / ZOOM_REFERENCE_SECONDS);
	const scale = dedupe([
		[0, baseScale],
		[duration, baseScale * zoomEnd],
	]);

	return {
		opacity: channel({ property: "opacity", points: opacity }),
		"transform.positionX": channel({
			property: "positionX",
			points: dedupe(positionX),
		}),
		"transform.scaleX": channel({ property: "scaleX", points: scale }),
		"transform.scaleY": channel({ property: "scaleY", points: scale }),
	};
}
