import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";

export type RetroVisualMode =
	| "auto"
	| "file-card"
	| "impact"
	| "comparison"
	| "evidence"
	| "map"
	| "split-screen";

export type RetroVisualResolved = Exclude<RetroVisualMode, "auto">;
export type RetroIntensity = "soft" | "normal" | "strong";

export const RETRO_VISUAL_MODES: Array<{
	id: RetroVisualMode;
	label: string;
}> = [
	{ id: "auto", label: "Automático pela Cris" },
	{ id: "file-card", label: "Ficha de arquivo" },
	{ id: "impact", label: "Número / palavra de impacto" },
	{ id: "comparison", label: "Comparação em duas colunas" },
	{ id: "evidence", label: "Painel de evidências" },
	{ id: "map", label: "Mapa técnico / localização" },
	{ id: "split-screen", label: "Tela dividida" },
];

export function resolveRetroVisual({
	mode = "auto",
	visualSlot,
	sceneType,
	sceneIndex = 0,
}: {
	mode?: RetroVisualMode;
	visualSlot: CrisVisualSlot;
	sceneType: CrisSceneType;
	sceneIndex?: number;
}): RetroVisualResolved {
	if (mode !== "auto") return mode;
	if (visualSlot === "number" || visualSlot === "date" || sceneType === "number")
		return "impact";
	if (visualSlot === "location" || visualSlot === "map") return "map";
	if (visualSlot === "document" || visualSlot === "quote") return "file-card";
	if (visualSlot === "conflict" || sceneType === "problem") return "evidence";
	if (visualSlot === "comparison" || visualSlot === "reveal" || visualSlot === "result" || sceneType === "solution")
		return "comparison";
	if (visualSlot === "list-item" || sceneType === "list") return "file-card";
	if (sceneType === "hook") return "split-screen";
	return sceneIndex % 3 === 0 ? "split-screen" : "file-card";
}

export const RETRO_COLORS = {
	paper: "#F4EEDB",
	ink: "#1B1A18",
	red: "#A81818",
	gold: "#D4A359",
	grid: "rgba(27,26,24,0.14)",
} as const;

export function retroTextStyle({
	visualSlot,
	sceneType,
	intensity,
}: {
	visualSlot: CrisVisualSlot;
	sceneType: CrisSceneType;
	intensity: RetroIntensity;
}) {
	const kind = resolveRetroVisual({ visualSlot, sceneType });
	const strong = intensity === "strong";
	const subtle = intensity === "soft";
	return {
		fontSize: kind === "impact" ? (strong ? 108 : subtle ? 75 : 91) : kind === "map" ? 63 : strong ? 76 : subtle ? 57 : 66,
		color: kind === "impact" ? RETRO_COLORS.red : RETRO_COLORS.ink,
		background: kind === "map" ? "#eee6d6f2" : "#f4eedbed",
		paddingX: strong ? 30 : 23,
		paddingY: strong ? 21 : 16,
		label: RETRO_VISUAL_MODES.find((item) => item.id === kind)?.label ?? "Ficha de arquivo",
	};
}
