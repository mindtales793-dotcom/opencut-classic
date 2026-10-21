export const EXPORT_RESOLUTIONS = ["original", "480p", "720p", "1080p", "1440p", "2160p"] as const;

export type ExportResolution = (typeof EXPORT_RESOLUTIONS)[number];

export type ExportDimensions = { width: number; height: number };

const SHORT_EDGES: Record<Exclude<ExportResolution, "original">, number> = {
	"480p": 480,
	"720p": 720,
	"1080p": 1080,
	"1440p": 1440,
	"2160p": 2160,
};

/** Keeps the native aspect ratio; output presets are even-sized for H.264/VP9. */
export function getExportDimensions({
	source,
	resolution,
}: {
	source: ExportDimensions;
	resolution: ExportResolution;
}): ExportDimensions {
	if (!Number.isFinite(source.width) || !Number.isFinite(source.height) ||
		source.width <= 0 || source.height <= 0) {
		throw new Error("O projeto tem dimensões inválidas.");
	}
	if (resolution === "original") return { ...source };
	const edge = SHORT_EDGES[resolution];
	const scale = edge / Math.min(source.width, source.height);
	const even = (dimension: number) => Math.max(16, Math.round((dimension * scale) / 2) * 2);
	const width = even(source.width);
	const height = even(source.height);
	if (width > 7680 || height > 7680) {
		throw new Error("O aspecto deste projeto ultrapassa o limite de 7680 pixels da exportação.");
	}
	return { width, height };
}

export function encodedDimensions({ width, height }: ExportDimensions): ExportDimensions {
	return { width: width + width % 2, height: height + height % 2 };
}

export const EXPORT_FPS_PRESETS = [
	{ id: "project", label: "Projeto" },
	{ id: "24", label: "24 FPS" },
	{ id: "25", label: "25 FPS" },
	{ id: "30", label: "30 FPS" },
	{ id: "29.97", label: "29,97 FPS" },
	{ id: "60", label: "60 FPS" },
] as const;

export type ExportFpsPreset = (typeof EXPORT_FPS_PRESETS)[number]["id"];

export function getExportFps({
	fps,
	preset,
}: {
	fps: { numerator: number; denominator: number };
	preset: ExportFpsPreset;
}): { numerator: number; denominator: number } {
	if (preset === "project") return fps;
	if (preset === "29.97") return { numerator: 30000, denominator: 1001 };
	return { numerator: Number(preset), denominator: 1 };
}
