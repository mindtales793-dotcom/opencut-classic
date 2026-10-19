"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import {
	getExportMimeType,
	getExportFileExtension,
	downloadBuffer,
	downloadFromUrl,
} from "@/export";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_ENGINE_VALUES,
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportEngine,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import {
	getFfmpegCapabilities,
	type FfmpegCapabilities,
} from "@/services/renderer/ffmpeg-exporter";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { EXPORT_RESOLUTIONS, EXPORT_FPS_PRESETS, getExportDimensions, getExportFps, type ExportResolution, type ExportFpsPreset } from "@/export/presets";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

function isExportEngine(value: string): value is ExportEngine {
	return EXPORT_ENGINE_VALUES.some((engineValue) => engineValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const timelineDuration = useEditor((e) => e.timeline.getTotalDuration());
	const exportState = useEditor((e) => e.project.getExportState());
	const hasProject = !!activeProject;
	const hasTimelineContent = timelineDuration > 0;

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		// Clicking elsewhere or changing tabs must never cancel an active export.
		// Cancellation is explicit through the "Cancelar" button.
		if (!open && !exportState.isExporting && exportState.result) {
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	const openExport = () => {
		if (!hasProject) return;
		if (!hasTimelineContent) {
			toast.error("A timeline está vazia.", {
				description:
					"Adicione imagens, vídeos ou áudio à linha do tempo antes de exportar.",
			});
			return;
		}
		setIsExportPopoverOpen(true);
	};

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#fa2441] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					onClick={openExport}
					disabled={!hasProject}
					onKeyDown={(event) => {
						if (hasProject && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							openExport();
						}
					}}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#d90d29] to-[#ff243e] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-3.5" />
						<span className="z-50 text-[0.875rem]">
							{exportState.isExporting
								? `Exportando ${Math.round(exportState.progress * 100)}%`
								: "Exportar"}
						</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#d90d29] to-[#ff243e]" />
						</div>
					</div>
				</button>
			</PopoverTrigger>

			{hasProject && <ExportPopover onOpenChange={setIsExportPopoverOpen} />}
		</Popover>
	);
}

function ExportPopover({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const { isExporting, progress, result: exportResult } = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const [engine, setEngine] = useState<ExportEngine>("auto");
	const [resolution, setResolution] = useState<ExportResolution>("original");
	const [fpsPreset, setFpsPreset] = useState<ExportFpsPreset>("project");
	const [capabilities, setCapabilities] = useState<FfmpegCapabilities | null>(
		null,
	);

	// Checks (once per format) which encoder FFmpeg can use on this computer.
	useEffect(() => {
		let isActive = true;
		void getFfmpegCapabilities({ format }).then((result) => {
			if (isActive) setCapabilities(result);
		});
		return () => {
			isActive = false;
		};
	}, [format]);

	const handleExport = async () => {
		if (!activeProject) return;
		let dimensions: { width: number; height: number };
		try {
			dimensions = getExportDimensions({ source: activeProject.settings.canvasSize, resolution });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Resolução inválida.");
			return;
		}
		const selectedFps = getExportFps({ fps: activeProject.settings.fps, preset: fpsPreset });

		// Export is independent from preview playback. Free preview resources and
		// keep the UI usable while the renderer continues in the background.
		editor.playback.pause();

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: selectedFps,
				canvasSize: dimensions,
				includeAudio: shouldIncludeAudio,
				engine,
				filename: activeProject.metadata.name,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && (result.downloadUrl || result.buffer)) {
			const filename = `${activeProject.metadata.name}${getExportFileExtension({ format })}`;

			if (result.downloadUrl) {
				downloadFromUrl({ url: result.downloadUrl, filename });
			} else if (result.buffer) {
				downloadBuffer({
					buffer: result.buffer,
					filename,
					mimeType: getExportMimeType({ format }),
				});
			}

			editor.project.clearExportState();
			toast.success("Exportação concluída.", {
				description: result.verified
					? `${result.verified.width}×${result.verified.height} · ${result.verified.fps.toFixed(2)} FPS · ${result.verified.codec.toUpperCase()} · preset ${result.verified.quality} aplicado (codec, resolução e FPS verificados com FFprobe).`
					: `${dimensions.width}×${dimensions.height} · ${(selectedFps.numerator / selectedFps.denominator).toFixed(2)} FPS · preset ${quality} solicitado · ${result.encoderLabel || "encoder do navegador"} (sem validação FFprobe).`,
			});
			onOpenChange(false);
			return;
		}

		if (!result.success && !result.cancelled) {
			toast.error("Falha na exportação.", {
				description:
					result.error || "O renderizador não conseguiu concluir o vídeo.",
			});
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent className="bg-background mr-4 flex max-h-[85vh] w-88 flex-col overflow-y-auto p-0">
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Ocorreu um erro desconhecido."}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between border-b p-3">
						<h3 className="text-sm font-medium">
							{isExporting ? "Exportando projeto" : "Exportar projeto"}
						</h3>
					</div>

					<div className="flex flex-col gap-4">
						{!isExporting && (
							<>
								<div className="flex flex-col">
									<Section collapsible defaultOpen={true} showTopBorder={false}>
										<SectionHeader><SectionTitle>Resolução e FPS</SectionTitle></SectionHeader>
										<SectionContent>
											<div className="grid grid-cols-2 gap-2">
												<label className="flex flex-col gap-1 text-xs">Resolução
													<select aria-label="Resolução de exportação" className="w-full rounded-md border bg-background p-2" value={resolution} onChange={e=>setResolution(e.target.value as ExportResolution)}>
														{EXPORT_RESOLUTIONS.map(value=><option key={value} value={value}>{value === "original" ? "Original" : value}</option>)}
													</select>
												</label>
												<label className="flex flex-col gap-1 text-xs">FPS
													<select aria-label="FPS de exportação" className="w-full rounded-md border bg-background p-2" value={fpsPreset} onChange={e=>setFpsPreset(e.target.value as ExportFpsPreset)}>
														{EXPORT_FPS_PRESETS.map(value=><option key={value.id} value={value.id}>{value.label}</option>)}
													</select>
												</label>
											</div>
											<p className="mt-2 text-xs text-muted-foreground">O enquadramento é mantido na resolução escolhida. O arquivo FFmpeg é verificado antes do download.</p>
										</SectionContent>
									</Section>
									<Section
										collapsible
										defaultOpen={false}
										showTopBorder={false}
									>
										<SectionHeader>
											<SectionTitle>Formato</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) setFormat(value);
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">
														MP4 (H.264) - Melhor compatibilidade
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">
														WebM (VP9) - Arquivo menor
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Qualidade</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) setQuality(value);
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low">Baixa - Arquivo menor</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium">Média - Equilibrada</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high">Alta - Recomendada</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high">
														Muito alta - Maior qualidade
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Renderização</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={engine}
												onValueChange={(value) => {
													if (isExportEngine(value)) setEngine(value);
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="auto" id="engine-auto" />
													<Label htmlFor="engine-auto">
														Automática - FFmpeg + placa de vídeo
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="software" id="engine-software" />
																<Label htmlFor="engine-software">Estável - FFmpeg no processador (mantém formato e qualidade)</Label>
														</div>
														<div className="flex items-center space-x-2">
														<RadioGroupItem value="browser" id="engine-browser" />
													<Label htmlFor="engine-browser">
														Compatível - encoder do navegador
													</Label>
												</div>
											</RadioGroup>
											<EncoderStatus
												capabilities={capabilities}
												engine={engine}
											/>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Áudio</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
													onCheckedChange={(checked) =>
														setShouldIncludeAudio(!!checked)
													}
												/>
												<Label htmlFor="include-audio">
													Incluir áudio na exportação
												</Label>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-3 pt-0">
									<Button onClick={handleExport} className="w-full gap-2">
										<Download className="size-4" />
										Exportar vídeo
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{Math.round(progress * 100)}%
										</p>
										<p className="text-muted-foreground text-sm">100%</p>
									</div>
									<Progress value={progress * 100} className="w-full" />
								</div>

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									Cancelar
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">
					Falha na exportação
				</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copiar
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Tentar novamente
				</Button>
			</div>
		</div>
	);
}

function EncoderStatus({
	capabilities,
	engine,
}: {
	capabilities: FfmpegCapabilities | null;
	engine: ExportEngine;
}) {
	if (engine === "browser") {
		return (
			<p className="text-muted-foreground mt-3 text-xs">
				Usa o encoder do navegador. É mais lento e usa mais memória em vídeos
				longos.
			</p>
		);
	}
	if (!capabilities) {
		return (
			<p className="text-muted-foreground mt-3 text-xs">
				Verificando a placa de vídeo…
			</p>
		);
	}
	if (!capabilities.available || !capabilities.selected) {
		return (
			<p className="text-muted-foreground mt-3 text-xs">
				FFmpeg indisponível
				{capabilities.reason ? ` (${capabilities.reason})` : ""}. A exportação
				usará o encoder do navegador.
			</p>
		);
	}
	if (capabilities.selected.hardware) {
		return (
			<p className="mt-3 text-xs text-green-500">
				Placa de vídeo em uso: {capabilities.selected.label}.
			</p>
		);
	}
	const skipped = capabilities.tested.filter(
		(encoder) => encoder.hardware && !encoder.ok,
	);
	return (
		<div className="text-muted-foreground mt-3 space-y-1 text-xs">
			<p>
				A placa de vídeo não foi aceita pelo FFmpeg; a exportação usará o{" "}
				{capabilities.selected.label}.
			</p>
			{skipped.map((encoder) => (
				<p key={encoder.id}>
					{encoder.label}: {encoder.error ?? "indisponível"}
				</p>
			))}
		</div>
	);
}
