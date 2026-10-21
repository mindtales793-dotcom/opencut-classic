import { buildGraphicPreviewUrl } from "@/graphics";
import type { ElementAnimations, ScalarAnimationChannel } from "@/animation/types";
import type { ParamValues } from "@/params";
import type { CreateGraphicElement } from "@/timeline";
import { buildGraphicElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { buildStickerId, parseStickerId } from "../sticker-id";
import type { StickerItem, StickerProvider } from "../types";

export type AnimatedStickerPresetId =
	| "pulse-star" | "bounce-circle" | "spin-star" | "slide-label"
	| "blink-dot" | "pop-heart" | "float-diamond" | "wiggle-star";

export interface AnimatedStickerPreset {
	id: AnimatedStickerPresetId;
	name: string;
	definitionId: string;
	params: ParamValues;
	animation: "pulse" | "bounce" | "spin" | "slide" | "blink" | "pop" | "float" | "wiggle";
}

export const ANIMATED_STICKER_PRESETS: readonly AnimatedStickerPreset[] = [
	{ id: "pulse-star", name: "Estrela pulsante", definitionId: "star", params: { fill: "#facc15", stroke: "#ffffff", strokeWidth: 3, points: 5 }, animation: "pulse" },
	{ id: "bounce-circle", name: "Bolinha quicando", definitionId: "ellipse", params: { fill: "#22d3ee", stroke: "#ffffff", strokeWidth: 3 }, animation: "bounce" },
	{ id: "spin-star", name: "Estrela giratória", definitionId: "star", params: { fill: "#fb7185", points: 6, depth: 50 }, animation: "spin" },
	{ id: "slide-label", name: "Faixa deslizante", definitionId: "rectangle", params: { fill: "#a78bfa", cornerRadius: 24 }, animation: "slide" },
	{ id: "blink-dot", name: "Sinal piscante", definitionId: "ellipse", params: { fill: "#4ade80" }, animation: "blink" },
	{ id: "pop-heart", name: "Coração pop", definitionId: "star", params: { fill: "#f43f5e", points: 5, depth: 75 }, animation: "pop" },
	{ id: "float-diamond", name: "Diamante flutuante", definitionId: "polygon", params: { fill: "#38bdf8", sides: 4 }, animation: "float" },
	{ id: "wiggle-star", name: "Estrela balançando", definitionId: "star", params: { fill: "#fbbf24", points: 8 }, animation: "wiggle" },
] as const;

const ANIMATION_SECONDS = 3;

function channel({
	preset,
	path,
	points,
}: {
	preset: AnimatedStickerPresetId;
	path: string;
	points: Array<[number, number]>;
}): ScalarAnimationChannel {
	return {
		keys: points.map(([seconds, value], index) => ({
			id: `animated-${preset}-${path}-${index}`,
			time: mediaTimeFromSeconds({ seconds }),
			value,
			segmentToNext: "linear" as const,
			tangentMode: "auto" as const,
		})),
	};
}

export function buildAnimatedStickerAnimations({
	preset,
}: {
	preset: AnimatedStickerPreset;
}): ElementAnimations {
	const key = (path: string, points: Array<[number, number]>) =>
		channel({ preset: preset.id, path, points });
	const pulses: Array<[number, number]> = [[0, 0.85], [0.35, 1.15], [0.7, 0.9], [1.1, 1.14], [1.5, 0.9], [2, 1.12], [2.5, 0.94], [3, 1]];
	switch (preset.animation) {
		case "pulse": return { "transform.scaleX": key("scaleX", pulses), "transform.scaleY": key("scaleY", pulses) };
		case "bounce": return { "transform.positionY": key("positionY", [[0, 70], [0.35, -80], [0.7, 45], [1, -45], [1.3, 30], [1.7, -35], [2, 25], [2.5, -20], [3, 0]]) };
		case "spin": return { "transform.rotate": key("rotate", [[0, 0], [1, 120], [2, 240], [3, 360]]) };
		case "slide": return { "transform.positionX": key("positionX", [[0, -400], [0.5, 0], [2.5, 0], [3, 400]]), opacity: key("opacity", [[0, 0], [0.25, 1], [2.75, 1], [3, 0]]) };
		case "blink": return { opacity: key("opacity", [[0, 1], [0.35, 0.15], [0.7, 1], [1.05, 0.15], [1.4, 1], [1.75, 0.15], [2.1, 1], [2.45, 0.15], [3, 1]]) };
		case "pop": return { "transform.scaleX": key("scaleX", [[0, 0.3], [0.22, 1.2], [0.45, 1], [2.6, 1], [3, 0.3]]), "transform.scaleY": key("scaleY", [[0, 0.3], [0.22, 1.2], [0.45, 1], [2.6, 1], [3, 0.3]]) };
		case "float": return { "transform.positionY": key("positionY", [[0, 25], [0.75, -25], [1.5, 25], [2.25, -25], [3, 25]]) };
		case "wiggle": return { "transform.rotate": key("rotate", [[0, -12], [0.3, 12], [0.6, -12], [0.9, 12], [1.2, -12], [1.5, 12], [1.8, -12], [2.1, 12], [2.4, -12], [2.7, 12], [3, -12]]) };
	}
}

export function parseAnimatedStickerId({
	stickerId,
}: {
	stickerId: string;
}): AnimatedStickerPreset | null {
	try {
		const { providerId, providerValue } = parseStickerId({ stickerId });
		if (providerId !== "animated") return null;
		return ANIMATED_STICKER_PRESETS.find((preset) => preset.id === providerValue) ?? null;
	} catch {
		return null;
	}
}

export function buildAnimatedGraphicElement({
	preset,
	startTime,
}: {
	preset: AnimatedStickerPreset;
	startTime: MediaTime;
}): CreateGraphicElement {
	return {
		...buildGraphicElement({
			definitionId: preset.definitionId,
			name: preset.name,
			startTime,
			params: preset.params,
		}),
		duration: mediaTimeFromSeconds({ seconds: ANIMATION_SECONDS }),
		animations: buildAnimatedStickerAnimations({ preset }),
	};
}

function toItem(preset: AnimatedStickerPreset): StickerItem {
	return {
		id: buildStickerId({ providerId: "animated", providerValue: preset.id }),
		provider: "animated",
		name: preset.name,
		previewUrl: buildGraphicPreviewUrl({ definitionId: preset.definitionId, params: preset.params }),
		metadata: { definitionId: preset.definitionId, animation: preset.animation },
	};
}

export const animatedStickerProvider: StickerProvider = {
	id: "animated",
	async search({ query, options }) {
		const q = query.trim().toLocaleLowerCase("pt-BR");
		const matches = ANIMATED_STICKER_PRESETS.filter((preset) => !q || `${preset.name} ${preset.id}`.toLocaleLowerCase("pt-BR").includes(q));
		const limit = Math.max(1, options?.limit ?? matches.length);
		return { items: matches.slice(0, limit).map(toItem), total: matches.length, hasMore: matches.length > limit };
	},
	async browse({ options }) {
		const page = Math.max(1, options?.page ?? 1);
		const limit = Math.max(1, options?.limit ?? ANIMATED_STICKER_PRESETS.length);
		const start = (page - 1) * limit;
		return { sections: [{ id: "animated", items: ANIMATED_STICKER_PRESETS.slice(start, start + limit).map(toItem), hasMore: start + limit < ANIMATED_STICKER_PRESETS.length, layout: "grid" }] };
	},
	resolveUrl({ stickerId }) {
		const preset = parseAnimatedStickerId({ stickerId });
		if (!preset) throw new Error("Sticker animado inválido");
		return buildGraphicPreviewUrl({ definitionId: preset.definitionId, params: preset.params });
	},
};
