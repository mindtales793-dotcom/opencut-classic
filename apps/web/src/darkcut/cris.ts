import type {
	DarkCutEffectIntensity,
	DarkCutMotionPreset,
	DarkCutTransitionPreset,
} from "@/timeline/timeline-store";

export type CrisProvider = "gemini" | "openrouter";

export type CrisSceneType =
	| "hook"
	| "context"
	| "list"
	| "number"
	| "emotion"
	| "problem"
	| "solution"
	| "turn"
	| "cta";

export type CrisVisualEffect = "none" | "blur";

export type CrisScenePlan = {
	index: number;
	sceneType: CrisSceneType;
	summary: string;
	visualQuery: string;
	overlayText: string;
	motion: DarkCutMotionPreset;
	transition: DarkCutTransitionPreset;
	effect: CrisVisualEffect;
	intensity: DarkCutEffectIntensity;
	durationWeight: number;
};

export type CrisEditPlan = {
	provider: CrisProvider | "local";
	templateId: string;
	templateTitle: string;
	createdAt: number;
	scenes: CrisScenePlan[];
};

export type CrisTemplateContext = {
	id: string;
	title: string;
	motions: DarkCutMotionPreset[];
	transitions: DarkCutTransitionPreset[];
	intensity: DarkCutEffectIntensity;
	effects: CrisVisualEffect[];
};

const MOTIONS: DarkCutMotionPreset[] = [
	"zoom-in",
	"zoom-out",
	"pan-left-right",
	"pan-right-left",
	"pan-up-down",
	"pan-down-up",
	"ken-burns",
	"push-in",
	"pull-out",
	"documentary",
];

const TRANSITIONS: DarkCutTransitionPreset[] = [
	"fade",
	"zoom",
	"slide-left",
	"slide-right",
	"ken-burns",
	"pop",
];

const INTENSITIES: DarkCutEffectIntensity[] = ["soft", "normal", "strong"];
const SCENE_TYPES: CrisSceneType[] = [
	"hook",
	"context",
	"list",
	"number",
	"emotion",
	"problem",
	"solution",
	"turn",
	"cta",
];

function cleanText(value: unknown, max = 80) {
	return typeof value === "string"
		? value.replace(/\s+/g, " ").trim().slice(0, max)
		: "";
}

function splitScript(script: string, count: number) {
	const clean = script.replace(/\s+/g, " ").trim();
	if (!clean || count <= 0) return Array.from({ length: count }, () => "");
	const sentences =
		clean.match(/[^.!?…]+[.!?…]?/g)?.map((item) => item.trim()).filter(Boolean) ??
		[clean];
	const groups: string[] = [];
	for (let i = 0; i < count; i += 1) {
		const start = Math.floor((i * sentences.length) / count);
		const end = Math.max(start + 1, Math.floor(((i + 1) * sentences.length) / count));
		groups.push(sentences.slice(start, end).join(" ") || sentences[i % sentences.length]);
	}
	return groups;
}

function sceneTypeFor(text: string, index: number, total: number): CrisSceneType {
	const lower = text.toLocaleLowerCase("pt-BR");
	if (index === 0) return "hook";
	if (/\b(primeiro|segundo|terceiro|erro|motivo|passo|lista)\b/.test(lower))
		return "list";
	if (/r\$|\b\d+[.,]?\d*\b|por cento|%|mil|milhao|milhão/.test(lower))
		return "number";
	if (/medo|ansioso|feliz|triste|alivio|alívio|desespero|emocao|emoção|gelei/.test(lower))
		return "emotion";
	if (/problema|erro|divida|dívida|perdi|falhou|dificuldade/.test(lower))
		return "problem";
	if (/solucao|solução|resolvi|consegui|aprendi|decidi/.test(lower))
		return "solution";
	if (/mas|entao|então|de repente|foi ai|foi aí|virada/.test(lower))
		return "turn";
	if (index === total - 1 || /inscreva|comenta|compartilha|e voce|e você/.test(lower))
		return "cta";
	return "context";
}

function localOverlay(text: string, type: CrisSceneType, index: number) {
	if (type === "list") {
		const match = text.match(/\b(primeiro|segundo|terceiro|quarto|quinto|\d+)\b/i);
		return match ? match[0].toUpperCase() : `ITEM ${index + 1}`;
	}
	if (type === "number") {
		const money = text.match(/R\$\s?[\d.,]+(?:\s?(?:mil|milhão|milhoes|milhões))?/i);
		if (money) return money[0].toUpperCase();
		const number = text.match(/\b\d+[.,]?\d*\s?%?\b/);
		if (number) return number[0];
	}
	if (type === "hook") return cleanText(text, 42);
	if (type === "problem") return "O PROBLEMA";
	if (type === "solution") return "A VIRADA";
	if (type === "cta") return "E VOCÊ?";
	return "";
}

function localVisualQuery(text: string) {
	const normalized = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ");

	const terms: string[] = [];
	const rules: Array<[RegExp, string[]]> = [
		[/\b(acordei|acordar|levant|manha|madrugada)\b/, ["waking up", "early morning"]],
		[/\b(sao paulo)\b/, ["Sao Paulo", "city"]],
		[/\b(frio|inverno|gelado)\b/, ["cold weather", "winter"]],
		[/\b(chuva|chovendo)\b/, ["rainy city"]],
		[/\b(onibus|busao)\b/, ["commuting by bus"]],
		[/\b(trabalho|empresa|escritorio)\b/, ["going to work", "office"]],
		[/\b(carro|dirigir|motorista)\b/, ["driving car"]],
		[/\b(dinheiro|salario|parcela|divida|financiamento)\b/, ["personal finance", "money"]],
		[/\b(doente|gripe|gripado|febre)\b/, ["sick person", "bedroom"]],
		[/\b(banco)\b/, ["bank building"]],
		[/\b(casa|quarto|apartamento)\b/, ["home interior"]],
		[/\b(cidade|rua|avenida|centro)\b/, ["city street"]],
	];
	for (const [pattern, values] of rules) {
		if (pattern.test(normalized)) terms.push(...values);
	}
	if (!terms.length) {
		terms.push(
			...normalized
				.split(/\s+/)
				.filter((word) => word.length >= 4)
				.slice(0, 5),
		);
	}
	return Array.from(new Set(terms)).slice(0, 6).join(" ");
}

export function buildLocalCrisPlan({
	script,
	visualCount,
	template,
}: {
	script: string;
	visualCount: number;
	template: CrisTemplateContext;
}): CrisEditPlan {
	const texts = splitScript(script, visualCount);
	const motions: DarkCutMotionPreset[] =
		template.motions.length ? template.motions : ["zoom-in"];
	const transitions: DarkCutTransitionPreset[] =
		template.transitions.length ? template.transitions : ["fade"];
	const effects: CrisVisualEffect[] =
		template.effects.length ? template.effects : ["none"];

	return {
		provider: "local",
		templateId: template.id,
		templateTitle: template.title,
		createdAt: Date.now(),
		scenes: texts.map((text, index) => {
			const sceneType = sceneTypeFor(text, index, texts.length);
			const intensity =
				sceneType === "hook" || sceneType === "turn" || sceneType === "number"
					? template.intensity === "soft"
						? "normal"
						: template.intensity
					: template.intensity;
			return {
				index,
				sceneType,
				summary: cleanText(text, 90),
				visualQuery: localVisualQuery(text),
				overlayText: localOverlay(text, sceneType, index),
				motion: motions[index % motions.length],
				transition: transitions[index % transitions.length],
				effect:
					sceneType === "hook" || sceneType === "turn"
						? effects[index % effects.length]
						: "none",
				intensity,
				durationWeight:
					sceneType === "hook" || sceneType === "turn" ? 0.9 : sceneType === "emotion" ? 1.2 : 1,
			};
		}),
	};
}

export function normalizeCrisPlan({
	value,
	visualCount,
	template,
	provider,
}: {
	value: unknown;
	visualCount: number;
	template: CrisTemplateContext;
	provider: CrisProvider;
}): CrisEditPlan | null {
	if (!value || typeof value !== "object") return null;
	const rawScenes = Array.isArray((value as { scenes?: unknown }).scenes)
		? ((value as { scenes: unknown[] }).scenes)
		: [];
	if (!rawScenes.length) return null;

	const fallback = buildLocalCrisPlan({
		script: "",
		visualCount,
		template,
	});
	const scenes = Array.from({ length: visualCount }, (_, index) => {
		const raw =
			rawScenes.find(
				(scene) =>
					scene &&
					typeof scene === "object" &&
					Number((scene as { index?: unknown }).index) === index,
			) ?? rawScenes[index];
		const base = fallback.scenes[index];
		if (!raw || typeof raw !== "object") return base;

		const item = raw as Record<string, unknown>;
		const motion = MOTIONS.includes(item.motion as DarkCutMotionPreset)
			? (item.motion as DarkCutMotionPreset)
			: base.motion;
		const transition = TRANSITIONS.includes(
			item.transition as DarkCutTransitionPreset,
		)
			? (item.transition as DarkCutTransitionPreset)
			: base.transition;
		const intensity = INTENSITIES.includes(item.intensity as DarkCutEffectIntensity)
			? (item.intensity as DarkCutEffectIntensity)
			: base.intensity;
		const sceneType = SCENE_TYPES.includes(item.sceneType as CrisSceneType)
			? (item.sceneType as CrisSceneType)
			: base.sceneType;
		const effect: CrisVisualEffect =
			item.effect === "blur" && template.effects.includes("blur")
				? "blur"
				: "none";
		const durationWeight = Number(item.durationWeight);
		return {
			index,
			sceneType,
			summary: cleanText(item.summary, 90) || base.summary,
			visualQuery: cleanText(item.visualQuery, 100) || base.visualQuery,
			overlayText: cleanText(item.overlayText, 42),
			motion,
			transition,
			effect,
			intensity,
			durationWeight:
				Number.isFinite(durationWeight) && durationWeight >= 0.6 && durationWeight <= 1.6
					? durationWeight
					: base.durationWeight,
		};
	});

	return {
		provider,
		templateId: template.id,
		templateTitle: template.title,
		createdAt: Date.now(),
		scenes,
	};
}
