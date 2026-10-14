import type { EditorCore } from "@/core";
import type {
	ElementAnimations,
	ScalarAnimationChannel,
} from "@/animation/types";
import type {
	ElementRef,
	TimelineElement,
} from "@/timeline/types";
import type { DarkCutTransitionPreset } from "@/timeline/timeline-store";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
} from "@/wasm";
import { clampRetimeRate } from "@/retime/rate";

export const DARKCUT_TRANSITIONS: Array<{
	id: DarkCutTransitionPreset;
	label: string;
}> = [
	{ id: "fade", label: "Fade suave" },
	{ id: "zoom", label: "Zoom suave" },
	{ id: "slide-left", label: "Deslizar esquerda" },
	{ id: "slide-right", label: "Deslizar direita" },
	{ id: "ken-burns", label: "Ken Burns" },
	{ id: "pop", label: "Pop cinematográfico" },
];

type VisualTarget = {
	trackId: string;
	elementId: string;
	element: Extract<TimelineElement, { type: "image" | "video" }>;
};

function getVisualTargets({
	editor,
	refs,
	fallbackToAll = false,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	fallbackToAll?: boolean;
}): VisualTarget[] {
	const selected = editor.timeline
		.getElementsWithTracks({ elements: refs })
		.flatMap(({ track, element }) =>
			element.type === "image" || element.type === "video"
				? [
						{
							trackId: track.id,
							elementId: element.id,
							element,
						},
					]
				: [],
		);

	if (selected.length > 0 || !fallbackToAll) {
		return selected.sort((a, b) => a.element.startTime - b.element.startTime);
	}

	const scene = editor.scenes.getActiveScene();
	const tracks = [scene.tracks.main, ...scene.tracks.overlay];
	const all: VisualTarget[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "image" && element.type !== "video") continue;
			all.push({
				trackId: track.id,
				elementId: element.id,
				element,
			});
		}
	}
	return all.sort((a, b) => a.element.startTime - b.element.startTime);
}

function targetDurationPatch({
	element,
	seconds,
}: {
	element: Extract<TimelineElement, { type: "image" | "video" }>;
	seconds: number;
}): {
	patch: Partial<TimelineElement>;
	actualSeconds: number;
	wasClamped: boolean;
} {
	const targetSeconds = Math.max(0.1, seconds);
	if (element.type === "image") {
		return {
			patch: { duration: mediaTimeFromSeconds({ seconds: targetSeconds }) },
			actualSeconds: targetSeconds,
			wasClamped: false,
		};
	}

	const sourceSpanTicks = roundMediaTime({
		time:
			(element.sourceDuration ?? element.duration) -
			element.trimStart -
			element.trimEnd,
	});
	const sourceSpanSeconds = Math.max(
		0.001,
		mediaTimeToSeconds({ time: sourceSpanTicks }),
	);
	const requestedRate = sourceSpanSeconds / targetSeconds;
	const rate = clampRetimeRate({ rate: requestedRate });
	return {
		patch: {
			retime: {
				rate,
				maintainPitch: true,
			},
		},
		actualSeconds: sourceSpanSeconds / rate,
		wasClamped: Math.abs(rate - requestedRate) > 0.0001,
	};
}

export function applyFixedDuration({
	editor,
	refs,
	seconds,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	seconds: number;
}) {
	const targets = getVisualTargets({ editor, refs });
	if (targets.length === 0) {
		return { changed: 0, clamped: 0 };
	}

	let cursorSeconds = mediaTimeToSeconds({
		time: targets[0].element.startTime,
	});
	let clamped = 0;
	const updates = targets.map((target) => {
		const duration = targetDurationPatch({
			element: target.element,
			seconds,
		});
		if (duration.wasClamped) clamped += 1;
		const startTime = mediaTimeFromSeconds({ seconds: cursorSeconds });
		cursorSeconds += duration.actualSeconds;
		return {
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				...duration.patch,
				startTime,
			} as Partial<TimelineElement>,
		};
	});

	editor.timeline.updateElements({ updates });
	return { changed: targets.length, clamped };
}

function getNarrationDurationSeconds({ editor }: { editor: EditorCore }) {
	const scene = editor.scenes.getActiveScene();
	const audioElements = scene.tracks.audio.flatMap((track) =>
		track.elements.map((element) => ({ track, element })),
	);
	if (audioElements.length === 0) return null;

	const preferred = audioElements.filter((item) =>
		item.element.name.toLowerCase().includes("narracao"),
	);
	const candidates = preferred.length > 0 ? preferred : audioElements;
	const lastEnd = candidates.reduce(
		(max, item) =>
			Math.max(max, item.element.startTime + item.element.duration),
		0,
	);
	return mediaTimeToSeconds({
		time: roundMediaTime({ time: lastEnd }),
	});
}

export function syncVisualsToNarration({
	editor,
	refs,
}: {
	editor: EditorCore;
	refs: ElementRef[];
}) {
	const targets = getVisualTargets({
		editor,
		refs,
		fallbackToAll: true,
	});
	const narrationSeconds = getNarrationDurationSeconds({ editor });
	if (!narrationSeconds || narrationSeconds <= 0 || targets.length === 0) {
		return {
			changed: 0,
			secondsEach: 0,
			narrationSeconds: narrationSeconds ?? 0,
			clamped: 0,
		};
	}

	const secondsEach = narrationSeconds / targets.length;
	let cursorSeconds = 0;
	let clamped = 0;
	const updates = targets.map((target) => {
		const duration = targetDurationPatch({
			element: target.element,
			seconds: secondsEach,
		});
		if (duration.wasClamped) clamped += 1;
		const startTime = mediaTimeFromSeconds({ seconds: cursorSeconds });
		cursorSeconds += duration.actualSeconds;
		return {
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				...duration.patch,
				startTime,
			} as Partial<TimelineElement>,
		};
	});

	editor.timeline.updateElements({ updates });
	return {
		changed: targets.length,
		secondsEach,
		narrationSeconds,
		clamped,
	};
}

function scalarChannel(
	elementId: string,
	property: string,
	points: Array<[number, number]>,
): ScalarAnimationChannel {
	return {
		keys: points.map(([seconds, value], index) => ({
			id: `darkcut-${elementId}-${property}-${index}`,
			time: mediaTimeFromSeconds({ seconds: Math.max(0, seconds) }),
			value,
			segmentToNext: "bezier",
			tangentMode: "flat",
		})),
	};
}

function transitionAnimations({
	element,
	preset,
}: {
	element: Extract<TimelineElement, { type: "image" | "video" }>;
	preset: DarkCutTransitionPreset;
}): ElementAnimations {
	const duration = Math.max(
		0.2,
		mediaTimeToSeconds({ time: element.duration }),
	);
	const edge = Math.min(0.55, Math.max(0.15, duration * 0.16));
	const out = Math.max(edge, duration - edge);
	const end = duration;
	const baseX = Number(element.params["transform.positionX"] ?? 0);
	const baseScaleX = Number(element.params["transform.scaleX"] ?? 1);
	const baseScaleY = Number(element.params["transform.scaleY"] ?? 1);
	const existing = element.animations ?? {};

	const opacity = (start = 0, finish = 0) =>
		scalarChannel(element.id, "opacity", [
			[0, start],
			[edge, 1],
			[out, 1],
			[end, finish],
		]);

	switch (preset) {
		case "zoom":
			return {
				...existing,
				opacity: opacity(0.1, 0.1),
				"transform.scaleX": scalarChannel(element.id, "scaleX", [
					[0, baseScaleX * 1.08],
					[edge, baseScaleX],
					[out, baseScaleX],
					[end, baseScaleX * 1.03],
				]),
				"transform.scaleY": scalarChannel(element.id, "scaleY", [
					[0, baseScaleY * 1.08],
					[edge, baseScaleY],
					[out, baseScaleY],
					[end, baseScaleY * 1.03],
				]),
			};
		case "slide-left":
			return {
				...existing,
				opacity: opacity(0, 0),
				"transform.positionX": scalarChannel(element.id, "positionX", [
					[0, baseX + 160],
					[edge, baseX],
					[out, baseX],
					[end, baseX - 160],
				]),
			};
		case "slide-right":
			return {
				...existing,
				opacity: opacity(0, 0),
				"transform.positionX": scalarChannel(element.id, "positionX", [
					[0, baseX - 160],
					[edge, baseX],
					[out, baseX],
					[end, baseX + 160],
				]),
			};
		case "ken-burns":
			return {
				...existing,
				opacity: opacity(0.25, 0.25),
				"transform.scaleX": scalarChannel(element.id, "scaleX", [
					[0, baseScaleX],
					[end, baseScaleX * 1.1],
				]),
				"transform.scaleY": scalarChannel(element.id, "scaleY", [
					[0, baseScaleY],
					[end, baseScaleY * 1.1],
				]),
			};
		case "pop":
			return {
				...existing,
				opacity: opacity(0, 0),
				"transform.scaleX": scalarChannel(element.id, "scaleX", [
					[0, baseScaleX * 0.92],
					[edge, baseScaleX],
					[out, baseScaleX],
					[end, baseScaleX * 0.97],
				]),
				"transform.scaleY": scalarChannel(element.id, "scaleY", [
					[0, baseScaleY * 0.92],
					[edge, baseScaleY],
					[out, baseScaleY],
					[end, baseScaleY * 0.97],
				]),
			};
		case "fade":
		default:
			return {
				...existing,
				opacity: opacity(0, 0),
			};
	}
}

export function applyTransitionPreset({
	editor,
	refs,
	preset,
	fallbackToAll = false,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	preset: DarkCutTransitionPreset;
	fallbackToAll?: boolean;
}) {
	const targets = getVisualTargets({ editor, refs, fallbackToAll });
	if (targets.length === 0) return 0;

	editor.timeline.updateElements({
		updates: targets.map((target) => ({
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				animations: transitionAnimations({
					element: target.element,
					preset,
				}),
			},
		})),
	});
	return targets.length;
}

export function applyRandomTransitions({
	editor,
	refs,
	presets,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	presets: DarkCutTransitionPreset[];
}) {
	const targets = getVisualTargets({
		editor,
		refs,
		fallbackToAll: true,
	});
	const pool =
		presets.length > 0 ? presets : DARKCUT_TRANSITIONS.map((item) => item.id);
	if (targets.length === 0 || pool.length === 0) return 0;

	editor.timeline.updateElements({
		updates: targets.map((target, index) => {
			const preset =
				pool[Math.floor(Math.random() * pool.length)] ?? pool[index % pool.length] ?? pool[0];
			return {
				trackId: target.trackId,
				elementId: target.elementId,
				patch: {
					animations: transitionAnimations({
						element: target.element,
						preset,
					}),
				},
			};
		}),
	});
	return targets.length;
}

export function clearDarkCutTransitions({
	editor,
	refs,
}: {
	editor: EditorCore;
	refs: ElementRef[];
}) {
	const targets = getVisualTargets({
		editor,
		refs,
		fallbackToAll: false,
	});
	if (targets.length === 0) return 0;

	const darkcutKeys = new Set([
		"opacity",
		"transform.positionX",
		"transform.scaleX",
		"transform.scaleY",
	]);
	editor.timeline.updateElements({
		updates: targets.map((target) => ({
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				animations: Object.fromEntries(
					Object.entries(target.element.animations ?? {}).filter(
						([key]) => !darkcutKeys.has(key),
					),
				),
			},
		})),
	});
	return targets.length;
}
