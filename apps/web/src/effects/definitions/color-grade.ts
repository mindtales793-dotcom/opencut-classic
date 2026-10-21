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
	createColorGradeEffect({
		type: "golden-hour-grade",
		name: "Golden Hour",
		keywords: ["dourado","sunset","warm","golden"],
		defaults: { brightness: 0.08, contrast: 1.12, saturation: 1.21, temperature: 0.35 },
	}),
	createColorGradeEffect({
		type: "noir-grade",
		name: "Noir Dramático",
		keywords: ["noir","black and white","contraste"],
		defaults: { brightness: -0.09, contrast: 1.55, saturation: 0, temperature: -0.08 },
	}),
	createColorGradeEffect({
		type: "retro-90-grade",
		name: "Retrô Anos 90",
		keywords: ["retro","filme antigo","nostalgia"],
		defaults: { brightness: 0.03, contrast: 0.88, saturation: 0.75, temperature: 0.27 },
	}),
	createColorGradeEffect({
		type: "teal-orange-grade",
		name: "Teal & Orange",
		keywords: ["cinema","teal","orange","blockbuster"],
		defaults: { brightness: -0.02, contrast: 1.29, saturation: 1.14, temperature: -0.19 },
	}),
	createColorGradeEffect({
		type: "night-blue-grade",
		name: "Noturno Azul",
		keywords: ["noite","azul","cinematic night"],
		defaults: { brightness: -0.19, contrast: 1.33, saturation: 0.62, temperature: -0.48 },
	}),
	createColorGradeEffect({
		type: "soft-pastel-grade",
		name: "Pastel Suave",
		keywords: ["pastel","delicado","soft"],
		defaults: { brightness: 0.09, contrast: 0.84, saturation: 0.71, temperature: 0.13 },
	}),
	createColorGradeEffect({
		type: "portrait-grade",
		name: "Retrato Natural",
		keywords: ["pele","rosto","natural","portrait"],
		defaults: { brightness: 0.08, contrast: 0.92, saturation: 0.97, temperature: 0.14 },
	}),
	createColorGradeEffect({
		type: "documentary-grade",
		name: "Documentário Real",
		keywords: ["documentary","documental","realista"],
		defaults: { brightness: 0.015, contrast: 1.09, saturation: 0.96, temperature: 0 },
	}),
	createColorGradeEffect({
		type: "cold-light-grade",
		name: "Luz Fria",
		keywords: ["frio","inverno","cool"],
		defaults: { brightness: 0.035, contrast: 1.06, saturation: 0.89, temperature: -0.59 },
	}),
	createColorGradeEffect({
		type: "summer-pop-grade",
		name: "Verão Vibrante",
		keywords: ["verão","summer","cores vivas"],
		defaults: { brightness: 0.11, contrast: 1.14, saturation: 1.5, temperature: 0.42 },
	}),
	createColorGradeEffect({
		type: "matte-grade",
		name: "Matte Desbotado",
		keywords: ["matte","desbotado","faded"],
		defaults: { brightness: 0.08, contrast: 0.79, saturation: 0.81, temperature: -0.06 },
	}),
	createColorGradeEffect({
		type: "winter-vintage-grade",
		name: "Vintage Frio",
		keywords: ["vintage","frio","retro azul"],
		defaults: { brightness: -0.05, contrast: 1.03, saturation: 0.69, temperature: -0.33 },
	}),
	createColorGradeEffect({
		type: "toon-2d-grade",
		name: "Desenho 2D Pop",
		keywords: ["2d","cartoon","animação"],
		defaults: { brightness: 0.055, contrast: 1.28, saturation: 1.59, temperature: 0.07 },
	}),
	createColorGradeEffect({
		type: "soft-bw-grade",
		name: "P&B Suave",
		keywords: ["preto e branco","grayscale","soft"],
		defaults: { brightness: 0.06, contrast: 0.94, saturation: 0, temperature: 0 },
	}),
	createColorGradeEffect({
		type: "thriller-grade",
		name: "Suspense Escuro",
		keywords: ["dark","thriller","suspense"],
		defaults: { brightness: -0.22, contrast: 1.49, saturation: 0.53, temperature: -0.56 },
	}),
	createColorGradeEffect({
		type: "clean-grade",
		name: "Clean Profissional",
		keywords: ["clean","produto","negócios"],
		defaults: { brightness: 0.025, contrast: 1.075, saturation: 1.04, temperature: 0.015 },
	}),
];
