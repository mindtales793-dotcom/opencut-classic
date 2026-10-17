import { transitionValue } from "@/darkcut/fx-core.generated";
import {
	makeSrtTimingGroups,
	resolveSrtSyncStrategy,
	sceneNumberFromName,
	type SrtSyncStrategy,
} from "@/darkcut/srt-scene-sync";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import type { EditorCore } from "@/core";
import type {
	ElementAnimations,
	ScalarAnimationChannel,
} from "@/animation/types";
import type { ElementRef, TimelineElement } from "@/timeline/types";
import type {
	DarkCutEffectIntensity,
	DarkCutMotionPreset,
	DarkCutTransitionPreset,
} from "@/timeline/timeline-store";
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

export const DARKCUT_MOTIONS: Array<{
	id: DarkCutMotionPreset;
	label: string;
}> = [
	{ id: "zoom-in", label: "Zoom lento in" },
	{ id: "zoom-out", label: "Zoom lento out" },
	{ id: "pan-left-right", label: "Pan esquerda → direita" },
	{ id: "pan-right-left", label: "Pan direita → esquerda" },
	{ id: "pan-up-down", label: "Pan cima → baixo" },
	{ id: "pan-down-up", label: "Pan baixo → cima" },
	{ id: "ken-burns", label: "Ken Burns suave" },
	{ id: "push-in", label: "Push-in cinematográfico" },
	{ id: "pull-out", label: "Pull-out suave" },
	{ id: "documentary", label: "Câmera documental" },
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

export type DarkCutSrtTiming = {
	index?: number;
	startSeconds: number;
	endSeconds: number;
	text?: string;
};

export type DarkCutSrtScope = "main" | "all";
export type DarkCutSrtOrder = "timeline" | "scene-number";

export function syncVisualsToSrt({
	editor,
	refs = [],
	cues,
	strategy = "one-per-cue",
	scope = "main",
	order = "timeline",
}: {
	editor: EditorCore;
	refs?: ElementRef[];
	cues: DarkCutSrtTiming[];
	strategy?: SrtSyncStrategy;
	scope?: DarkCutSrtScope;
	order?: DarkCutSrtOrder;
}) {
	const scene = editor.scenes.getActiveScene();
	const targets = getVisualTargets({
		editor,
		refs,
		fallbackToAll: true,
	}).filter((target) => scope === "all" || target.trackId === scene.tracks.main.id);

	const validCues = cues.filter(
		(cue) =>
			Number.isFinite(cue.startSeconds) &&
			Number.isFinite(cue.endSeconds) &&
			cue.startSeconds >= 0 &&
			cue.endSeconds > cue.startSeconds,
	).map((cue, index) => ({
		index: cue.index ?? index + 1,
		startSeconds: cue.startSeconds,
		endSeconds: cue.endSeconds,
		text: cue.text ?? "",
	})).sort((a, b) => a.startSeconds - b.startSeconds);

	const emptyResult = {
		changed: 0,
		visualCount: targets.length,
		cueCount: validCues.length,
		unmatchedVisuals: targets.length,
		unmatchedCues: validCues.length,
		groupedCues: 0,
		nameMatched: 0,
		clamped: 0,
	};

	if (!targets.length || !validCues.length) return emptyResult;

	const effectiveStrategy = resolveSrtSyncStrategy({
		strategy,
		cueCount: validCues.length,
		visualCount: targets.length,
	});

	// A naming match uses only explicit scene-number filenames. Descriptive
	// filenames such as "HB20 novo" do not count as an image identifier.
	let pairs: Array<{
		target: VisualTarget;
		startSeconds: number;
		endSeconds: number;
		cueCount: number;
	}> = [];
	if (order === "scene-number" && effectiveStrategy === "one-per-cue") {
		const byIndex = new Map(validCues.map((cue) => [cue.index, cue]));
		const usedIndices = new Set<number>();
		for (const target of targets) {
			const number = sceneNumberFromName(target.element.name);
			const cue = number == null ? undefined : byIndex.get(number);
			if (!cue || usedIndices.has(cue.index)) continue;
			usedIndices.add(cue.index);
			pairs.push({
				target,
				startSeconds: cue.startSeconds,
				endSeconds: cue.endSeconds,
				cueCount: 1,
			});
		}
	} else {
		const groups = makeSrtTimingGroups({
			cues: validCues,
			visualCount: targets.length,
			strategy,
		});
		pairs = groups.map((cue, i) => ({
			target: targets[i],
			startSeconds: cue.startSeconds,
			endSeconds: cue.endSeconds,
			cueCount: cue.cueCount,
		}));
	}

	if (!pairs.length) return emptyResult;

	let clamped = 0;
	const updates = pairs.map(({ target, startSeconds, endSeconds }) => {
		const duration = targetDurationPatch({
			element: target.element,
			seconds: endSeconds - startSeconds,
		});
		if (duration.wasClamped) clamped += 1;
		return {
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				...duration.patch,
				startTime: mediaTimeFromSeconds({ seconds: startSeconds }),
			} as Partial<TimelineElement>,
		};
	});

	editor.timeline.updateElements({ updates });
	const usedCueCount = pairs.reduce((sum, pair) => sum + pair.cueCount, 0);
	return {
		changed: pairs.length,
		visualCount: targets.length,
		cueCount: validCues.length,
		unmatchedVisuals: Math.max(0, targets.length - pairs.length),
		unmatchedCues: Math.max(0, validCues.length - usedCueCount),
		groupedCues: Math.max(0, usedCueCount - pairs.length),
		nameMatched: order === "scene-number" ? pairs.length : 0,
		clamped,
	};
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

// Original channels travel with the generated channel so replacing/clearing a
// transition restores camera keyframes, including after saving and reopening.
type TransitionChannel = ScalarAnimationChannel & {
	darkcutTransition?: {
		preset: DarkCutTransitionPreset;
		original: ElementAnimations[string] | null;
	};
};
function withoutTransitions(
	animations: ElementAnimations = {},
): ElementAnimations {
	const result: ElementAnimations = {};
	for (const [path, channel] of Object.entries(animations)) {
		const meta = (channel as TransitionChannel | undefined)?.darkcutTransition;
		if (meta) {
			if (meta.original) result[path] = meta.original;
			continue;
		}
		const id =
			(channel as ScalarAnimationChannel | undefined)?.keys?.[0]?.id ?? "";
		// Compatibility with templates saved before transition metadata existed.
		if (
			id.startsWith("darkcut-") &&
			!id.includes("-motion-") &&
			/-(opacity|positionX|scaleX|scaleY)-0$/.test(id)
		)
			continue;
		result[path] = channel;
	}
	return result;
}
export function transitionAnimations({
	element,
	preset,
}: {
	element: Extract<TimelineElement, { type: "image" | "video" }>;
	preset: DarkCutTransitionPreset;
}): ElementAnimations {
	const duration = Math.max(
		0.001,
		mediaTimeToSeconds({ time: element.duration }),
	);
	const existing = withoutTransitions(element.animations);
	const result = { ...existing };
	const presetId = [
		"fade",
		"zoom",
		"slide-left",
		"slide-right",
		"ken-burns",
		"pop",
	].indexOf(preset);
	const paths = [
		"opacity",
		...(preset === "slide-left" || preset === "slide-right"
			? ["transform.positionX"]
			: []),
		...(["zoom", "ken-burns", "pop"].includes(preset)
			? ["transform.scaleX", "transform.scaleY"]
			: []),
	];
	for (const path of paths) {
		const original = existing[path];
		const times = new Set(
			Array.from({ length: 121 }, (_, i) => (duration * i) / 120),
		);
		for (const key of (original as ScalarAnimationChannel | undefined)?.keys ??
			[])
			times.add(Math.min(duration, mediaTimeToSeconds({ time: key.time })));
		const points: Array<[number, number]> = [...times]
			.sort((a, b) => a - b)
			.map((time) => {
				const base = resolveAnimationPathValueAtTime({
					animations: existing,
					propertyPath: path,
					localTime: mediaTimeFromSeconds({ seconds: time }),
					fallbackValue: Number(
						element.params[path] ?? (path === "transform.positionX" ? 0 : 1),
					),
				});
				return [
					time,
					transitionValue(
						presetId,
						path === "opacity" ? 0 : path === "transform.positionX" ? 1 : 2,
						time,
						duration,
						base,
					),
				];
			});
		const channel: TransitionChannel = scalarChannel(
			element.id,
			`transition-${path}`,
			points,
		);
		channel.keys.forEach((key) => {
			key.segmentToNext = "linear";
		});
		channel.darkcutTransition = { preset, original: original ?? null };
		result[path] = channel;
	}
	return result;
}

function intensityFactor(intensity: DarkCutEffectIntensity) {
	switch (intensity) {
		case "strong":
			return 1.65;
		case "normal":
			return 1;
		case "soft":
		default:
			return 0.6;
	}
}

export function motionAnimations(
	args: Parameters<typeof rawMotionAnimations>[0],
): ElementAnimations {
	const previous = args.element.animations ?? {};
	const transition = Object.values(previous)
		.map((c) => (c as TransitionChannel | undefined)?.darkcutTransition?.preset)
		.find(Boolean);
	const clean = withoutTransitions(previous);
	for (const [path, channel] of Object.entries(clean)) {
		if (
			(channel as ScalarAnimationChannel | undefined)?.keys?.[0]?.id?.includes(
				"-motion-",
			)
		)
			delete clean[path];
	}
	const element = { ...args.element, animations: clean };
	const animations = rawMotionAnimations({ ...args, element });
	return transition
		? transitionAnimations({
				element: { ...element, animations },
				preset: transition,
			})
		: animations;
}

function rawMotionAnimations({
	element,
	preset,
	intensity,
}: {
	element: Extract<TimelineElement, { type: "image" | "video" }>;
	preset: DarkCutMotionPreset;
	intensity: DarkCutEffectIntensity;
}): ElementAnimations {
	const duration = Math.max(
		0.2,
		mediaTimeToSeconds({ time: element.duration }),
	);
	const factor = intensityFactor(intensity);
	const baseX = Number(element.params["transform.positionX"] ?? 0);
	const baseY = Number(element.params["transform.positionY"] ?? 0);
	const baseScaleX = Number(element.params["transform.scaleX"] ?? 1);
	const baseScaleY = Number(element.params["transform.scaleY"] ?? 1);
	const scaleSmall = 0.055 * factor;
	const scaleLarge = 0.095 * factor;
	const travel = 90 * factor;
	const existing = element.animations ?? {};

	const scale = (from: number, to: number) => ({
		"transform.scaleX": scalarChannel(element.id, "motion-scaleX", [
			[0, baseScaleX * from],
			[duration, baseScaleX * to],
		]),
		"transform.scaleY": scalarChannel(element.id, "motion-scaleY", [
			[0, baseScaleY * from],
			[duration, baseScaleY * to],
		]),
	});

	switch (preset) {
		case "zoom-out":
			return {
				...existing,
				...scale(1 + scaleLarge, 1),
			};
		case "pan-left-right":
			return {
				...existing,
				"transform.positionX": scalarChannel(element.id, "motion-x", [
					[0, baseX - travel],
					[duration, baseX + travel],
				]),
				...scale(1 + scaleSmall, 1 + scaleSmall),
			};
		case "pan-right-left":
			return {
				...existing,
				"transform.positionX": scalarChannel(element.id, "motion-x", [
					[0, baseX + travel],
					[duration, baseX - travel],
				]),
				...scale(1 + scaleSmall, 1 + scaleSmall),
			};
		case "pan-up-down":
			return {
				...existing,
				"transform.positionY": scalarChannel(element.id, "motion-y", [
					[0, baseY - travel],
					[duration, baseY + travel],
				]),
				...scale(1 + scaleSmall, 1 + scaleSmall),
			};
		case "pan-down-up":
			return {
				...existing,
				"transform.positionY": scalarChannel(element.id, "motion-y", [
					[0, baseY + travel],
					[duration, baseY - travel],
				]),
				...scale(1 + scaleSmall, 1 + scaleSmall),
			};
		case "ken-burns":
			return {
				...existing,
				...scale(1, 1 + scaleLarge),
				"transform.positionX": scalarChannel(element.id, "motion-x", [
					[0, baseX - travel * 0.35],
					[duration, baseX + travel * 0.35],
				]),
				"transform.positionY": scalarChannel(element.id, "motion-y", [
					[0, baseY + travel * 0.2],
					[duration, baseY - travel * 0.2],
				]),
			};
		case "push-in":
			return {
				...existing,
				...scale(1, 1 + scaleLarge * 1.25),
			};
		case "pull-out":
			return {
				...existing,
				...scale(1 + scaleLarge * 1.25, 1),
			};
		case "documentary":
			return {
				...existing,
				...scale(1.01, 1 + scaleSmall),
				"transform.positionX": scalarChannel(element.id, "motion-x", [
					[0, baseX - travel * 0.18],
					[duration, baseX + travel * 0.18],
				]),
			};
		case "zoom-in":
		default:
			return {
				...existing,
				...scale(1, 1 + scaleLarge),
			};
	}
}

export function applyMotionPreset({
	editor,
	refs,
	preset,
	intensity,
	fallbackToAll = false,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	preset: DarkCutMotionPreset;
	intensity: DarkCutEffectIntensity;
	fallbackToAll?: boolean;
}) {
	const targets = getVisualTargets({ editor, refs, fallbackToAll });
	if (targets.length === 0) return 0;

	editor.timeline.updateElements({
		updates: targets.map((target) => ({
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				animations: motionAnimations({
					element: target.element,
					preset,
					intensity,
				}),
			},
		})),
	});
	return targets.length;
}

export function applyRandomMotions({
	editor,
	refs,
	presets,
	intensity,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	presets: DarkCutMotionPreset[];
	intensity: DarkCutEffectIntensity;
}) {
	const targets = getVisualTargets({
		editor,
		refs,
		fallbackToAll: true,
	});
	const pool =
		presets.length > 0 ? presets : DARKCUT_MOTIONS.map((item) => item.id);
	if (targets.length === 0 || pool.length === 0) return 0;

	let previous: DarkCutMotionPreset | null = null;
	editor.timeline.updateElements({
		updates: targets.map((target, index) => {
			const candidates =
				pool.length > 1 && previous
					? pool.filter((preset) => preset !== previous)
					: pool;
			const preset =
				candidates[Math.floor(Math.random() * candidates.length)] ??
				pool[index % pool.length] ??
				pool[0];
			previous = preset;
			return {
				trackId: target.trackId,
				elementId: target.elementId,
				patch: {
					animations: motionAnimations({
						element: target.element,
						preset,
						intensity,
					}),
				},
			};
		}),
	});
	return targets.length;
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
				pool[Math.floor(Math.random() * pool.length)] ??
				pool[index % pool.length] ??
				pool[0];
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

	editor.timeline.updateElements({
		updates: targets.map((target) => ({
			trackId: target.trackId,
			elementId: target.elementId,
			patch: {
				animations: withoutTransitions(target.element.animations),
			},
		})),
	});
	return targets.length;
}

export function autoEditWithNarration({
	editor,
	refs,
	motionPresets,
	transitionPresets,
	intensity,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	motionPresets: DarkCutMotionPreset[];
	transitionPresets: DarkCutTransitionPreset[];
	intensity: DarkCutEffectIntensity;
}) {
	const sync = syncVisualsToNarration({ editor, refs });
	if (!sync.changed || !sync.narrationSeconds) {
		return {
			...sync,
			motions: 0,
			transitions: 0,
		};
	}

	const motions = applyRandomMotions({
		editor,
		refs,
		presets: motionPresets,
		intensity,
	});
	const transitions = applyRandomTransitions({
		editor,
		refs,
		presets: transitionPresets,
	});

	return {
		...sync,
		motions,
		transitions,
	};
}
