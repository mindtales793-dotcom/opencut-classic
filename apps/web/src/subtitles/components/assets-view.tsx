import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import type { CaptionChunk } from "@/transcription/types";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { CAPTION_PRESETS, applyCaptionPreset, type CaptionPresetId } from "@/subtitles/caption-presets";
import type { CaptionAnimationMode } from "@/subtitles/karaoke";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	const [captionPreset, setCaptionPreset] = useState<CaptionPresetId>("original");
	const [captionAnimation, setCaptionAnimation] = useState<CaptionAnimationMode>("none");
	const [highlightColor, setHighlightColor] = useState("#fde047");
	const [captionColor, setCaptionColor] = useState<string | null>(null);
	const [captionFontSize, setCaptionFontSize] = useState<number | null>(null);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();

	const isProcessing = processing.status === "processing";
	const previewPreset = CAPTION_PRESETS.find((preset) => preset.id === captionPreset);
	const previewColor = captionColor ?? previewPreset?.style.color ?? "#ffffff";
	const previewSize = captionFontSize ?? previewPreset?.style.fontSize ?? 5;

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): boolean => {
		const overrides = captionColor !== null || captionFontSize !== null
			? {
				...(captionColor !== null ? { color: captionColor } : {}),
				...(captionFontSize !== null ? { fontSize: captionFontSize, fontSizeRatioOfPlayHeight: undefined } : {}),
			} : undefined;
		const trackId = insertCaptionChunksAsTextTrack({
			editor,
			captions: applyCaptionPreset({ captions, presetId: captionPreset, overrides }),
			animation: captionAnimation,
			highlightColor,
		});
		return trackId !== null;
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Legendas"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<Button type="button" variant="outline" size="sm" onClick={handleImportClick} disabled={isProcessing}>
					<HugeiconsIcon icon={CloudUploadIcon} />
					Importar SRT/ASS
				</Button>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Animação de palavras">
							<Select value={captionAnimation} onValueChange={(value) => setCaptionAnimation(value as CaptionAnimationMode)} disabled={isProcessing}>
								<SelectTrigger aria-label="Animação de legenda"><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Sem animação</SelectItem>
									<SelectItem value="karaoke">Karaokê · palavra destacada</SelectItem>
									<SelectItem value="karaoke-pop">Karaokê Pop · palavra com zoom</SelectItem>
								</SelectContent>
							</Select>
							{captionAnimation !== "none" && (
								<div className="mt-2 flex items-center gap-3">
									<label className="flex items-center gap-2 text-xs">Cor do destaque
										<input type="color" value={highlightColor} aria-label="Cor da palavra destacada" disabled={isProcessing} onChange={(event) => setHighlightColor(event.target.value)} className="h-9 w-14 rounded border bg-background" />
									</label>
								</div>
							)}
							<p className="mt-1 text-xs text-muted-foreground">Arquivos SRT e ASS não têm tempos individuais das palavras. O DarkCut estima os destaques; ajuste a timeline para sincronização exata. Cada palavra é um clipe editável e exportável.</p>
						</SectionField>
						<SectionField label="Template de legenda">
							<Select value={captionPreset} onValueChange={(value) => setCaptionPreset(value as CaptionPresetId)} disabled={isProcessing}>
								<SelectTrigger aria-label="Template de legenda">
									<SelectValue placeholder="Escolha um estilo" />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_PRESETS.map((preset) => (
										<SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="mt-1 text-xs text-muted-foreground">{CAPTION_PRESETS.find((preset) => preset.id === captionPreset)?.description}</p>
							<p className="mt-1 text-xs text-muted-foreground">O estilo escolhido vira texto editável na timeline e acompanha a exportação do vídeo.</p>
							<div className="mt-2 flex min-h-20 items-center justify-center rounded-md border bg-slate-900 p-3" aria-label="Prévia aproximada da legenda">
								<span
									style={{
										color: previewColor,
										fontFamily: previewPreset?.style.fontFamily ?? "Arial",
										fontWeight: previewPreset?.style.fontWeight ?? "bold",
										fontSize: `${Math.round(previewSize * 3)}px`,
										backgroundColor: previewPreset?.style.background?.enabled ? previewPreset.style.background.color : "transparent",
										padding: previewPreset?.style.background?.enabled ? "6px 10px" : "0",
										borderRadius: previewPreset?.style.background?.enabled ? "6px" : "0",
									}}
								>
									Sua legenda aparece aqui
								</span>
							</div>
							<div className="mt-2 flex flex-wrap items-end gap-3">
								<label className="flex flex-col gap-1 text-xs">Cor do texto
									<input type="color" aria-label="Cor da legenda" value={previewColor} disabled={isProcessing} onChange={(event) => setCaptionColor(event.target.value)} className="h-9 w-14 cursor-pointer rounded border bg-background" />
								</label>
								<label className="flex flex-col gap-1 text-xs">Tamanho
									<input type="number" aria-label="Tamanho da legenda" min={2} max={12} step={0.5} value={previewSize} disabled={isProcessing} onChange={(event) => setCaptionFontSize(Math.min(12, Math.max(2, Number(event.target.value) || 5)))} className="h-9 w-20 rounded border bg-background px-2" />
								</label>
								<Button type="button" size="sm" variant="outline" disabled={isProcessing || (captionColor === null && captionFontSize === null)} onClick={() => { setCaptionColor(null); setCaptionFontSize(null); }}>Restaurar estilo</Button>
							</div>
							<p className="text-[0.65rem] text-muted-foreground">Prévia aproximada. Fontes e posicionamento também podem ser editados no clipe.</p>
						</SectionField>
					</SectionFields>

					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
