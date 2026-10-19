import type { EffectDefinition } from "@/effects/types";

export const COLOR_ADJUST_SHADER = "color-adjust";

type GradeDefaults = {
	brightness: number;
	contrast: number;
	saturation: number;
	temperature: number;
};

export function createColorGradeEffect({
	type,
	name,
	keywords,
	defaults,
}: {
	type: string;
	name: string;
	keywords: string[];
	defaults: GradeDefaults;
}): EffectDefinition {
	const params: EffectDefinition["params"] = [
		{ key: "brightness", label: "Brilho", type: "number", default: defaults.brightness, min: -1, max: 1, step: 0.05 },
		{ key: "contrast", label: "Contraste", type: "number", default: defaults.contrast, min: 0, max: 2, step: 0.05 },
		{ key: "saturation", label: "Saturação", type: "number", default: defaults.saturation, min: 0, max: 2, step: 0.05 },
		{ key: "temperature", label: "Temperatura", type: "number", default: defaults.temperature, min: -1, max: 1, step: 0.05 },
	];
	return {
		type,
		name,
		keywords,
		params,
		renderer: {
			passes: [{
				shader: COLOR_ADJUST_SHADER,
				uniforms: ({ effectParams }) => {
					const read = (key: keyof GradeDefaults) => {
						const raw = effectParams[key];
						const value = typeof raw === "number" ? raw : Number(raw);
						return Number.isFinite(value) ? value : defaults[key];
					};
					return {
						u_brightness: Math.max(-1, Math.min(1, read("brightness"))),
						u_contrast: Math.max(0, Math.min(2, read("contrast"))),
						u_saturation: Math.max(0, Math.min(2, read("saturation"))),
						u_temperature: Math.max(-1, Math.min(1, read("temperature"))),
					};
				},
			}],
		},
	};
}

export const COLOR_GRADE_EFFECTS: EffectDefinition[] = [
	createColorGradeEffect({
		type: "color-grade",
		name: "Correção de cor",
		keywords: ["color", "grade", "brightness", "contrast", "saturation", "temperature", "cor"],
		defaults: { brightness: 0, contrast: 1, saturation: 1, temperature: 0 },
	}),
	createColorGradeEffect({
		type: "cinematic-grade",
		name: "Cinema",
		keywords: ["cinema", "dramatic", "cinematic", "contrast"],
		defaults: { brightness: -0.03, contrast: 1.22, saturation: 0.87, temperature: -0.1 },
	}),
	createColorGradeEffect({
		type: "vintage-grade",
		name: "Vintage quente",
		keywords: ["vintage", "warm", "retro", "filme"],
		defaults: { brightness: 0.04, contrast: 0.93, saturation: 0.78, temperature: 0.34 },
	}),
	createColorGradeEffect({
		type: "mono-grade",
		name: "Preto e branco",
		keywords: ["black white", "monochrome", "grayscale", "pb"],
		defaults: { brightness: 0, contrast: 1.16, saturation: 0, temperature: 0 },
	}),
	createColorGradeEffect({
		type: "vibrant-grade",
		name: "Cores vibrantes",
		keywords: ["vibrant", "saturation", "colorful", "pop"],
		defaults: { brightness: 0.03, contrast: 1.08, saturation: 1.38, temperature: 0.05 },
	}),
];
