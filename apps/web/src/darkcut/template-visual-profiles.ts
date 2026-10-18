import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";
import type { DarkCutEffectIntensity } from "@/timeline/timeline-store";

export type TemplateVisualProfile = {
	id: string;
	name: string;
	family: "archive" | "editorial" | "cinema" | "pov" | "explainer" | "social";
	background: string;
	foreground: string;
	accent: string;
	card: string;
	cardText: string;
	tempo: "slow" | "medium" | "fast";
	graphics: readonly string[];
};

export const TEMPLATE_VISUAL_PROFILES: Record<string, TemplateVisualProfile> = {
	"retro-automotive": {
		id: "retro-automotive", name: "Arquivo de investigação", family: "archive",
		background: "#211c1b", foreground: "#f4eedb", accent: "#a81818", card: "#f4eedb", cardText: "#1b1a18", tempo: "medium",
		graphics: ["Ficha de arquivo", "Números de impacto", "Comparador duplo", "Mapa técnico", "Evidências", "Polaroid"],
	},
	"pov-finance": {
		id: "pov-finance", name: "Finanças visuais", family: "editorial",
		background: "#0a1d1b", foreground: "#e6fff2", accent: "#39d5a3", card: "#102b28", cardText: "#e6fff2", tempo: "medium",
		graphics: ["Dívida x à vista", "Valor de parcelas", "Contador de juros", "Escolha x resultado", "Gráfico de custos"],
	},
	"pov-car": {
		id: "pov-car", name: "História automotiva", family: "pov",
		background: "#211015", foreground: "#fff5ef", accent: "#ff5964", card: "#3a1a22", cardText: "#fff5ef", tempo: "medium",
		graphics: ["Comparação entre carros", "Ficha do carro", "Decisão financeira", "Revelação da conquista"],
	},
	"dark-channel": {
		id: "dark-channel", name: "Arquivo sombrio", family: "cinema",
		background: "#10111d", foreground: "#f0efff", accent: "#a59aff", card: "#1a1d34", cardText: "#f0efff", tempo: "slow",
		graphics: ["Foto em parallax", "Dossiê escuro", "Linha do tempo", "Localização", "Revelação documental"],
	},
	documentary: {
		id: "documentary", name: "Documentário editorial", family: "archive",
		background: "#121b20", foreground: "#eaf5f7", accent: "#54c5d9", card: "#19323a", cardText: "#f1fbfc", tempo: "slow",
		graphics: ["Fotos históricas", "Documentos", "Mapa com rota", "Legenda de contexto", "Linhas de evidência"],
	},
	pov: {
		id: "pov", name: "POV emocional", family: "pov",
		background: "#24121d", foreground: "#fff1f7", accent: "#ff75b5", card: "#3e2336", cardText: "#fff1f7", tempo: "fast",
		graphics: ["Frase de impacto", "Zoom emocional", "Escolha x consequência", "Virada pessoal"],
	},
	vox: {
		id: "vox", name: "Explicador visual", family: "explainer",
		background: "#132337", foreground: "#eef7ff", accent: "#6ad1ff", card: "#e7f7ff", cardText: "#102334", tempo: "fast",
		graphics: ["Mapa minimalista", "Comparação de dados", "Diagrama animado", "Números", "Cards de evidência"],
	},
	cinematic: {
		id: "cinematic", name: "Cinema documental", family: "cinema",
		background: "#211c18", foreground: "#fff4df", accent: "#ffca78", card: "#312924", cardText: "#fff4df", tempo: "slow",
		graphics: ["Foto 2.5D", "Textos de filme", "Rack focus", "Revelação por luz", "Abertura cinematográfica"],
	},
	educational: {
		id: "educational", name: "Educação clara", family: "explainer",
		background: "#14261d", foreground: "#e9fff4", accent: "#94ed9d", card: "#e6ffed", cardText: "#14261d", tempo: "medium",
		graphics: ["Passo a passo", "Esquema visual", "Quadro comparativo", "Mapa simples", "Definição de termos"],
	},
	list: {
		id: "list", name: "Ranking dinâmico", family: "social",
		background: "#251c14", foreground: "#fff9e8", accent: "#ffd04f", card: "#3f2c17", cardText: "#fff9e8", tempo: "fast",
		graphics: ["Contagem de lista", "Cartões numerados", "Números grandes", "Comparação rápida", "Revelação"],
	},
	storytelling: {
		id: "storytelling", name: "Jornada e transformação", family: "pov",
		background: "#211b30", foreground: "#faf0ff", accent: "#cf99ff", card: "#332743", cardText: "#faf0ff", tempo: "medium",
		graphics: ["Personagem e ambiente", "Conflito visual", "Virada dramática", "Antes x depois", "Conclusão"],
	},
};

export function getTemplateVisualProfile(id: string): TemplateVisualProfile {
	return TEMPLATE_VISUAL_PROFILES[id] ?? TEMPLATE_VISUAL_PROFILES.documentary;
}

export function describeTemplateScene({
	profileId, visualSlot, sceneType, intensity,
}: {
	profileId: string;
	visualSlot: CrisVisualSlot;
	sceneType: CrisSceneType;
	intensity: DarkCutEffectIntensity;
}) {
	const profile = getTemplateVisualProfile(profileId);
	const isNumber = visualSlot === "number" || visualSlot === "date" || sceneType === "number";
	const isComparison = visualSlot === "comparison" || visualSlot === "conflict" ||
		sceneType === "problem" || sceneType === "solution";
	const isLocation = visualSlot === "map" || visualSlot === "location";
	const isDocument = visualSlot === "document" || visualSlot === "quote";
	const isHook = sceneType === "hook" || visualSlot === "reveal";
	const isList = sceneType === "list" || visualSlot === "list-item";
	const label = isNumber ? "DADO EM DESTAQUE" :
		isComparison ? "COMPARAÇÃO" : isLocation ? "MAPA / LOCAL" :
		isDocument ? "ARQUIVO / EVIDÊNCIA" : isHook ? "REVELAÇÃO" :
		isList ? "ITEM EM DESTAQUE" : "CONTEXTO";
	const base = isNumber ? 94 : isHook ? 74 : isList ? 70 : 59;
	const multiplier = intensity === "strong" ? 1.13 : intensity === "soft" ? 0.86 : 1;
	return {
		profile,
		label,
		isNumber,
		isComparison,
		isLocation,
		isDocument,
		isHook,
		isList,
		fontSize: Math.round(base * multiplier),
		color: (isNumber || isHook) && profile.family !== "archive" ? profile.accent : profile.cardText,
		background: profile.card + "e8",
		paddingX: intensity === "strong" ? 29 : intensity === "soft" ? 16 : 23,
		paddingY: intensity === "strong" ? 19 : intensity === "soft" ? 11 : 15,
	};
}
