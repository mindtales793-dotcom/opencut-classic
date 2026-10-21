import type { SubtitleCue, SubtitleStyleOverrides } from "./types";

/**
 * Caption styles are converted into regular timeline text elements.
 * They render in the same canvas/export pipeline as all other text layers.
 * "Original" deliberately preserves imported ASS styles.
 */
export type CaptionPresetId =
	| "original"
	| "shorts-pop"
	| "documentary"
	| "cinema"
	| "neon"
	| "comic"
	| "news"
	| "minimal";

export type CaptionPreset = {
	id: CaptionPresetId;
	label: string;
	description: string;
	style: SubtitleStyleOverrides;
};

export const CAPTION_PRESETS: readonly CaptionPreset[] = [
	{
		id: "original",
		label: "Original / SRT",
		description: "Preserva os estilos ASS ou usa o padrão de legendas.",
		style: {},
	},
	{
		id: "shorts-pop",
		label: "Shorts Pop",
		description: "Letras fortes e fundo escuro para vídeos verticais.",
		style: {
			fontFamily: "Arial",
			fontSize: 6.5,
			fontWeight: "bold",
			color: "#ffffff",
			background: { enabled: true, color: "#111827dd", cornerRadius: 10, paddingX: 16, paddingY: 10 },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.13 },
		},
	},
	{
		id: "documentary",
		label: "Documentário",
		description: "Legenda discreta, com leitura confortável.",
		style: {
			fontFamily: "Arial",
			fontSize: 4.5,
			fontWeight: "bold",
			color: "#f8fafc",
			background: { enabled: true, color: "#0f172ab8", cornerRadius: 3, paddingX: 12, paddingY: 7 },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.055 },
		},
	},
	{
		id: "cinema",
		label: "Cinema",
		description: "Tipografia clássica e contraste suave.",
		style: {
			fontFamily: "Georgia",
			fontSize: 5.1,
			fontWeight: "normal",
			color: "#fff4dc",
			background: { enabled: true, color: "#09090bcc", cornerRadius: 2, paddingX: 14, paddingY: 8 },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.07 },
		},
	},
	{
		id: "neon",
		label: "Neon Tech",
		description: "Ciano sobre grafite para tecnologia e games.",
		style: {
			fontFamily: "Arial",
			fontSize: 5.6,
			fontWeight: "bold",
			color: "#67e8f9",
			background: { enabled: true, color: "#082f49e8", cornerRadius: 8, paddingX: 14, paddingY: 9 },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.09 },
		},
	},
	{
		id: "comic",
		label: "Comic",
		description: "Texto amarelo de impacto para humor e memes.",
		style: {
			fontFamily: "Impact",
			fontSize: 6.5,
			fontWeight: "bold",
			color: "#fde047",
			background: { enabled: true, color: "#171717ed", cornerRadius: 5, paddingX: 15, paddingY: 10 },
			placement: { verticalAlign: "middle" },
		},
	},
	{
		id: "news",
		label: "Noticiário",
		description: "Faixa de legenda objetiva, ideal para dados e entrevistas.",
		style: {
			fontFamily: "Arial",
			fontSize: 5,
			fontWeight: "bold",
			color: "#ffffff",
			background: { enabled: true, color: "#1e3a8aee", cornerRadius: 2, paddingX: 14, paddingY: 8 },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.055 },
		},
	},
	{
		id: "minimal",
		label: "Minimalista",
		description: "Texto limpo sem caixa de fundo.",
		style: {
			fontFamily: "Arial",
			fontSize: 4.8,
			fontWeight: "bold",
			color: "#ffffff",
			background: { enabled: false, color: "#00000000" },
			placement: { verticalAlign: "bottom", marginVerticalRatio: 0.08 },
		},
	},
] as const;

export function applyCaptionPreset({
	captions,
	presetId,
	overrides,
}: {
	captions: readonly SubtitleCue[];
	presetId: CaptionPresetId;
	overrides?: SubtitleStyleOverrides;
}): SubtitleCue[] {
	if (presetId === "original" && !overrides) {
		return captions.map((caption) => ({ ...caption }));
	}
	const preset = CAPTION_PRESETS.find((item) => item.id === presetId);
	return captions.map((caption) => {
		const selectedBackground = overrides?.background ??
			preset?.style.background ?? caption.style?.background;
		return {
			...caption,
			style: {
				...caption.style,
				...preset?.style,
				...overrides,
				...(selectedBackground ? {
					background: {
						...selectedBackground,
						...caption.style?.background,
						...preset?.style.background,
						...overrides?.background,
					},
				} : {}),
				placement: {
					...caption.style?.placement,
					...preset?.style.placement,
					...overrides?.placement,
				},
			},
		};
	});
}
