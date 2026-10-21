"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FPS_PRESETS } from "@/fps/presets";
import { floatToFrameRate, frameRateToFloat } from "@/fps/utils";
import { useEditor } from "@/editor/use-editor";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { BackgroundContent } from "./background";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { useEditorStore } from "@/editor/editor-store";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { dimensionToAspectRatio } from "@/utils/geometry";
import { formatNumberForDisplay } from "@/utils/math";
import { OcSquarePlusIcon } from "@/components/icons";
import type { TCanvasSize } from "@/project/types";

type SettingsView = "project-info" | "background" | "performance";

function isSettingsView(value: string): value is SettingsView {
	return (
		value === "project-info" ||
		value === "background" ||
		value === "performance"
	);
}

const PRESET_LABELS: Record<string, string> = {
	"1:1": "1:1",
	"16:9": "YouTube • Horizontal (16:9)",
	"9:16": "TikTok / Reels / Shorts (9:16)",
	"4:3": "4:3",
};

function areCanvasSizesEqual({
	left,
	right,
}: {
	left: TCanvasSize;
	right: TCanvasSize;
}) {
	return left.width === right.width && left.height === right.height;
}

function formatCanvasDimension({ value }: { value: number }) {
	return formatNumberForDisplay({ value, maxFractionDigits: 0 });
}

function parseCanvasDimension({ input }: { input: string }): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) return null;

	const rounded = Math.round(parsed);
	return rounded > 0 ? rounded : null;
}

function useCanvasDimensionDraft({
	value,
	onCommit,
}: {
	value: number;
	onCommit: (value: number) => void;
}) {
	const [pendingValue, setPendingValue] = useState(value);

	return usePropertyDraft({
		displayValue: formatCanvasDimension({ value }),
		parse: (input) => parseCanvasDimension({ input }),
		onStartEditing: () => {
			setPendingValue(value);
		},
		onPreview: (nextValue) => {
			setPendingValue(nextValue);
		},
		onCommit: () => {
			if (pendingValue !== value) {
				onCommit(pendingValue);
			}
		},
	});
}

export function SettingsView() {
	const [view, setView] = useState<SettingsView>("project-info");
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const { canvasPresets } = useEditorStore();
	const currentCanvasSize = activeProject.settings.canvasSize;
	const canvasSizeMode = activeProject.settings.canvasSizeMode ?? "preset";
	const lastCustomCanvasSize =
		activeProject.settings.lastCustomCanvasSize ?? null;

	const presetItems = canvasPresets.map((preset, index) => {
		const ratio = dimensionToAspectRatio(preset);
		return {
			id: index.toString(),
			label: PRESET_LABELS[ratio] ?? ratio,
			ratio,
			canvasSize: preset,
		};
	});

	const selectedPresetId = canvasSizeMode === "preset"
		? (presetItems.find((preset) =>
				areCanvasSizesEqual({
					left: preset.canvasSize,
					right: currentCanvasSize,
				}),
			)?.id ?? null)
		: null;

	const updateCustomCanvasSize = ({
		canvasSize,
	}: {
		canvasSize: TCanvasSize;
	}) => {
		const shouldUpdateCanvasSize = !areCanvasSizesEqual({
			left: canvasSize,
			right: currentCanvasSize,
		});
		const shouldUpdateLastCustomCanvasSize =
			lastCustomCanvasSize === null ||
			!areCanvasSizesEqual({
				left: canvasSize,
				right: lastCustomCanvasSize,
			});
		const shouldUpdateCanvasSizeMode = canvasSizeMode !== "custom";

		if (
			!shouldUpdateCanvasSize &&
			!shouldUpdateLastCustomCanvasSize &&
			!shouldUpdateCanvasSizeMode
		) {
			return;
		}

		editor.project.updateSettings({
			settings: {
				...(shouldUpdateCanvasSize ? { canvasSize } : {}),
				...(shouldUpdateCanvasSizeMode
					? { canvasSizeMode: "custom" as const }
					: {}),
				lastCustomCanvasSize: canvasSize,
			},
		});
	};

	const selectPresetCanvasSize = ({
		canvasSize,
	}: {
		canvasSize: TCanvasSize;
	}) => {
		const shouldUpdateCanvasSize = !areCanvasSizesEqual({
			left: canvasSize,
			right: currentCanvasSize,
		});
		const shouldUpdateCanvasSizeMode = canvasSizeMode !== "preset";

		if (!shouldUpdateCanvasSize && !shouldUpdateCanvasSizeMode) return;

		editor.project.updateSettings({
			settings: {
				...(shouldUpdateCanvasSize ? { canvasSize } : {}),
				...(shouldUpdateCanvasSizeMode
					? { canvasSizeMode: "preset" as const }
					: {}),
			},
		});
	};

	const selectCustomCanvasSize = () => {
		updateCustomCanvasSize({
			canvasSize: lastCustomCanvasSize ?? currentCanvasSize,
		});
	};

	const widthDraft = useCanvasDimensionDraft({
		value: currentCanvasSize.width,
		onCommit: (width) =>
			updateCustomCanvasSize({
				canvasSize: { width, height: currentCanvasSize.height },
			}),
	});

	const heightDraft = useCanvasDimensionDraft({
		value: currentCanvasSize.height,
		onCommit: (height) =>
			updateCustomCanvasSize({
				canvasSize: { width: currentCanvasSize.width, height },
			}),
	});

	const isCustomSelected = canvasSizeMode === "custom";

	return (
		<PanelView
			contentClassName="px-0"
			scrollClassName="pt-0"
			actions={
				<Tabs
					value={view}
					onValueChange={(value) => {
						if (isSettingsView(value)) {
							setView(value);
						}
					}}
				>
					<TabsList>
						<TabsTrigger value="project-info">Projeto</TabsTrigger>
						<TabsTrigger value="background">Fundo</TabsTrigger>
						<TabsTrigger value="performance">Desempenho</TabsTrigger>
					</TabsList>
				</Tabs>
			}
		>
			{view === "project-info" && (
				<div className="flex flex-col">
					<Section showTopBorder={false}>
						<SectionHeader>
							<SectionTitle className="flex-1">Name</SectionTitle>
							<span className="text-sm truncate">
								{activeProject.metadata.name}
							</span>
						</SectionHeader>
					</Section>
					<Section showTopBorder={false}>
						<SectionHeader className="justify-between">
							<SectionTitle className="flex-1">Frame rate</SectionTitle>
					<Select
							value={String(Math.round(frameRateToFloat(activeProject.settings.fps)))}
							onValueChange={(value) => {
								const fps = floatToFrameRate(parseFloat(value));
								editor.project.updateSettings({ settings: { fps } });
							}}
							>
								<SelectTrigger className="bg-transparent border-none p-1 h-auto">
									<SelectValue placeholder="Select a frame rate" />
								</SelectTrigger>
								<SelectContent>
									{FPS_PRESETS.map((preset) => (
										<SelectItem key={preset.value} value={preset.value}>
											{preset.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionHeader>
					</Section>
					<Section
						showTopBorder={false}
						collapsible
						sectionKey="settings:aspect-ratio"
					>
						<SectionHeader>
							<SectionTitle className="flex-1">Formato do vídeo</SectionTitle>
						</SectionHeader>
						<SectionContent className="px-2 flex flex-col gap-1 pb-2">
							{presetItems.map((preset) => (
								<AspectRatioItem
									key={preset.id}
									label={preset.label}
									previewIcon={<AspectRatioPreview ratio={preset.ratio} />}
									isSelected={selectedPresetId === preset.id}
									onClick={() => {
										selectPresetCanvasSize({
											canvasSize: preset.canvasSize,
										});
									}}
								/>
							))}
							<div className="pb-2">
								<AspectRatioItem
									key="custom"
									label="Custom"
									previewIcon={<OcSquarePlusIcon />}
									isSelected={isCustomSelected}
									onClick={selectCustomCanvasSize}
									uiOptions={
										<div className=" flex items-center gap-2 text-foreground">
											<NumberField
												value={widthDraft.displayValue}
												className="w-full"
												aria-label="Canvas width"
												onFocus={widthDraft.onFocus}
												onChange={widthDraft.onChange}
												onBlur={widthDraft.onBlur}
											/>
											<NumberField
												value={heightDraft.displayValue}
												className="w-full"
												aria-label="Canvas height"
												onFocus={heightDraft.onFocus}
												onChange={heightDraft.onChange}
												onBlur={heightDraft.onBlur}
											/>
										</div>
									}
								/>
							</div>
						</SectionContent>
					</Section>
				</div>
			)}
			{view === "background" && <BackgroundContent />}
			{view === "performance" && <PerformanceSettingsContent />}
		</PanelView>
	);
}


type PerformanceProbe = {
	ok: boolean;
	cpu: string;
	logicalCores: number;
	ramGb: number;
	freeRamGb: number;
	gpuNames: string[];
	capabilities: {
		ffmpeg: boolean;
		h264Qsv: boolean;
		hevcQsv: boolean;
		h264Nvenc: boolean;
		hevcNvenc: boolean;
		h264Amf: boolean;
		hevcAmf: boolean;
		qsv: boolean;
		cuda: boolean;
		d3d11va: boolean;
		dxva2: boolean;
	};
	recommendation: {
		mode: string;
		preferredEncoder: string;
		previewHeight: number;
		proxyHeight: number;
		maxHeavyJobs: number;
		useProxies: boolean;
		useRenderCache: boolean;
		remotionPreviewFps: number;
	};
};

function PerformanceSettingsContent() {
	const [probe, setProbe] = useState<PerformanceProbe | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const refresh = async () => {
		setLoading(true);
		setError("");
		try {
			const response = await fetch("/api/darkcut/performance", {
				cache: "no-store",
			});
			const data = (await response.json()) as PerformanceProbe & { error?: string };
			if (!response.ok || !data.ok) {
				throw new Error(data.error || "Não foi possível analisar o hardware.");
			}
			setProbe(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Falha ao analisar o hardware.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	const gpu = probe?.gpuNames?.length
		? probe.gpuNames.join(" • ")
		: "GPU não identificada pelo runtime";
	const encoderLabel =
		probe?.recommendation.preferredEncoder === "h264_qsv"
			? "Intel Quick Sync (QSV)"
			: probe?.recommendation.preferredEncoder === "h264_nvenc"
				? "NVIDIA NVENC"
				: probe?.recommendation.preferredEncoder === "h264_amf"
					? "AMD AMF"
					: "CPU / WebCodecs";

	return (
		<div className="space-y-4 p-4">
			<section className="rounded-md border border-primary/30 bg-primary/5 p-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold">Motor Automático DarkCut</div>
						<p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
							O DarkCut intercala compositor, WebCodecs e FFmpeg conforme o
							hardware disponível. Em PCs mais leves ele reduz o preview,
							usa proxy/cache e evita várias tarefas pesadas ao mesmo tempo.
						</p>
					</div>
					<span className="rounded bg-primary/15 px-2 py-1 text-[0.65rem] font-medium text-primary">
						AUTO
					</span>
				</div>
			</section>

			<section className="space-y-2 rounded-md border bg-card p-3 text-xs">
				<div className="flex items-center justify-between">
					<span className="font-medium">Hardware detectado</span>
					<Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
						{loading ? "Analisando..." : "Analisar novamente"}
					</Button>
				</div>
				{error && <p className="text-destructive">{error}</p>}
				{probe && (
					<div className="grid gap-2">
						<div className="rounded border bg-background p-2">
							<div className="text-muted-foreground">CPU</div>
							<div className="mt-0.5 font-medium">{probe.cpu}</div>
							<div className="mt-1 text-[0.68rem] text-muted-foreground">
								{probe.logicalCores} thread(s) • {probe.ramGb} GB RAM • {probe.freeRamGb} GB livres agora
							</div>
						</div>
						<div className="rounded border bg-background p-2">
							<div className="text-muted-foreground">GPU</div>
							<div className="mt-0.5 font-medium">{gpu}</div>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="rounded border bg-background p-2">
								<div className="text-muted-foreground">Encoder preferido</div>
								<div className="mt-0.5 font-medium">{encoderLabel}</div>
							</div>
							<div className="rounded border bg-background p-2">
								<div className="text-muted-foreground">FFmpeg</div>
								<div className="mt-0.5 font-medium">
									{probe.capabilities.ffmpeg ? "Disponível" : "Não detectado"}
								</div>
							</div>
						</div>
						<div className="rounded border bg-background p-2">
							<div className="font-medium">Perfil automático aplicado</div>
							<div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
								<span>Preview: {probe.recommendation.previewHeight}p</span>
								<span>Proxy: {probe.recommendation.proxyHeight}p</span>
								<span>Tarefas pesadas: {probe.recommendation.maxHeavyJobs}</span>
								<span>Remotion: {probe.recommendation.remotionPreviewFps} FPS</span>
								<span>Proxy: {probe.recommendation.useProxies ? "ativo" : "desligado"}</span>
								<span>Cache: {probe.recommendation.useRenderCache ? "ativo" : "desligado"}</span>
							</div>
						</div>
						<div className="rounded border bg-background p-2 text-[0.68rem] text-muted-foreground">
							QSV H.264: {probe.capabilities.h264Qsv ? "sim" : "não"} •
							NVENC H.264: {probe.capabilities.h264Nvenc ? "sim" : "não"} •
							AMF H.264: {probe.capabilities.h264Amf ? "sim" : "não"} •
							D3D11VA: {probe.capabilities.d3d11va ? "sim" : "não"}
						</div>
					</div>
				)}
			</section>


		</div>
	);
}


function AspectRatioItem({
	label,
	previewIcon,
	isSelected,
	onClick,
	uiOptions,
}: {
	label: string;
	previewIcon: React.ReactNode;
	isSelected: boolean;
	onClick: () => void;
	uiOptions?: React.ReactNode;
}) {
	return (
		<Button
			variant={isSelected ? "secondary" : "ghost"}
			className={cn(
				"px-2 py-0 flex flex-col h-fit w-full",
				!isSelected && "border border-transparent opacity-75!",
			)}
			onClick={onClick}
		>
			<div className="w-full flex justify-between items-center h-8">
				<div className="flex-1 flex items-center gap-2">
					<div className="flex items-center justify-center size-5">
						{previewIcon}
					</div>
					<span className="text-sm truncate">{label}</span>
				</div>
				<div>
					{isSelected && <HugeiconsIcon icon={Tick02Icon} className="size-4" />}
				</div>
			</div>
			{uiOptions && isSelected && (
				<div className="w-full pb-2">{uiOptions}</div>
			)}
		</Button>
	);
}

function AspectRatioPreview({ ratio }: { ratio?: string }) {
	if (!ratio) return null;

	const [w, h] = ratio.split(":").map(Number);
	const maxSize = 16;
	const width = w >= h ? maxSize : (w / h) * maxSize;
	const height = h >= w ? maxSize : (h / w) * maxSize;

	return (
		<div
			style={{ width, height, borderWidth: 1.5 }}
			className="rounded-xs border-current opacity-60"
		/>
	);
}
