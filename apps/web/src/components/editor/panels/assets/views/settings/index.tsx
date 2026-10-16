"use client";

import { useState } from "react";
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
import { useDarkCutProductionStore } from "@/components/editor/panels/assets/darkcut-production-store";

type SettingsView = "project-info" | "background" | "apis";

function isSettingsView(value: string): value is SettingsView {
	return value === "project-info" || value === "background" || value === "apis";
}

const PRESET_LABELS: Record<string, string> = {
	"1:1": "1:1",
	"16:9": "16:9",
	"9:16": "9:16",
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
						<TabsTrigger value="apis">APIs</TabsTrigger>
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
							<SectionTitle className="flex-1">Aspect ratio</SectionTitle>
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
			{view === "apis" && <ApiSettingsContent />}
		</PanelView>
	);
}


function ApiSettingsContent() {
	const {
		youtubeApiKeys,
		setYoutubeApiKey,
		fishApiKeys,
		setFishApiKey,
		jamendoClientId,
		setJamendoClientId,
		freesoundApiKey,
		setFreesoundApiKey,
		geminiApiKey,
		setGeminiApiKey,
		openRouterApiKey,
		setOpenRouterApiKey,
		crisPrimaryProvider,
		setCrisPrimaryProvider,
		crisFallbackProvider,
		setCrisFallbackProvider,
		geminiModel,
		setGeminiModel,
		openRouterModel,
		setOpenRouterModel,
	} = useDarkCutProductionStore();

	const youtubeCount = youtubeApiKeys.filter((key) => key.trim()).length;
	const fishCount = fishApiKeys.filter((key) => key.trim()).length;
	const [isTestingCris, setIsTestingCris] = useState(false);

	const clearAll = () => {
		for (let index = 0; index < 3; index += 1) {
			setYoutubeApiKey(index, "");
			setFishApiKey(index, "");
		}
		setJamendoClientId("");
		setFreesoundApiKey("");
		setGeminiApiKey("");
		setOpenRouterApiKey("");
		toast.success("APIs removidas deste dispositivo.");
	};

	return (
		<div className="space-y-4 p-4">
			<div>
				<h3 className="text-sm font-semibold">APIs do DarkCut</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					As chaves ficam salvas neste navegador/aplicativo e são reutilizadas automaticamente.
				</p>
			</div>

			<section className="space-y-2 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">YouTube Data API v3</div>
						<div className="text-[0.68rem] text-muted-foreground">
							Busca de vídeos · até três chaves
						</div>
					</div>
					<span className="text-[0.68rem] text-muted-foreground">{youtubeCount}/3</span>
				</div>
				{[0, 1, 2].map((index) => (
					<Input
						key={`youtube-${index}`}
						type="password"
						value={youtubeApiKeys[index] ?? ""}
						onChange={(event) => setYoutubeApiKey(index, event.target.value)}
						placeholder={`Chave YouTube ${index + 1}`}
						autoComplete="off"
					/>
				))}
			</section>

			<section className="space-y-2 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">Fish Audio</div>
						<div className="text-[0.68rem] text-muted-foreground">
							Narração e prévia das vozes · até três chaves
						</div>
					</div>
					<span className="text-[0.68rem] text-muted-foreground">{fishCount}/3</span>
				</div>
				{[0, 1, 2].map((index) => (
					<Input
						key={`fish-${index}`}
						type="password"
						value={fishApiKeys[index] ?? ""}
						onChange={(event) => setFishApiKey(index, event.target.value)}
						placeholder={`Chave Fish Audio ${index + 1}`}
						autoComplete="off"
					/>
				))}
			</section>


			<section className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
				<div className="flex items-start justify-between gap-2">
					<div>
						<div className="text-sm font-medium">Cris • Inteligência do Editor</div>
						<div className="text-[0.68rem] text-muted-foreground">
							Analisa o roteiro depois que suas imagens/vídeos estiverem prontos e monta o template automaticamente.
						</div>
					</div>
					<span className="rounded bg-primary/15 px-2 py-1 text-[0.62rem] font-medium text-primary">
						IA + fallback local
					</span>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<label className="text-[0.68rem] text-muted-foreground">
						Provedor principal
						<select
							value={crisPrimaryProvider}
							onChange={(event) =>
								setCrisPrimaryProvider(
									event.target.value === "openrouter" ? "openrouter" : "gemini",
								)
							}
							className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
						>
							<option value="gemini">Gemini</option>
							<option value="openrouter">OpenRouter</option>
						</select>
					</label>
					<label className="text-[0.68rem] text-muted-foreground">
						Fallback
						<select
							value={crisFallbackProvider}
							onChange={(event) =>
								setCrisFallbackProvider(
									event.target.value === "gemini" ? "gemini" : "openrouter",
								)
							}
							className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
						>
							<option value="openrouter">OpenRouter</option>
							<option value="gemini">Gemini</option>
						</select>
					</label>
				</div>

				<div className="space-y-2 rounded-md border bg-background p-2">
					<div className="text-xs font-medium">Google Gemini</div>
					<Input
						type="password"
						value={geminiApiKey}
						onChange={(event) => setGeminiApiKey(event.target.value)}
						placeholder="Gemini API Key"
						autoComplete="off"
					/>
					<Input
						value={geminiModel}
						onChange={(event) => setGeminiModel(event.target.value)}
						placeholder="Modelo Gemini"
						autoComplete="off"
					/>
				</div>

				<div className="space-y-2 rounded-md border bg-background p-2">
					<div className="text-xs font-medium">OpenRouter</div>
					<Input
						type="password"
						value={openRouterApiKey}
						onChange={(event) => setOpenRouterApiKey(event.target.value)}
						placeholder="OpenRouter API Key"
						autoComplete="off"
					/>
					<Input
						value={openRouterModel}
						onChange={(event) => setOpenRouterModel(event.target.value)}
						placeholder="Modelo OpenRouter"
						autoComplete="off"
					/>
				</div>

				<Button
					variant="secondary"
					disabled={isTestingCris}
					onClick={async () => {
						setIsTestingCris(true);
						try {
							const response = await fetch("/api/darkcut/cris", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									mode: "test",
									primaryProvider: crisPrimaryProvider,
									fallbackProvider: crisFallbackProvider,
									geminiApiKey,
									openRouterApiKey,
									geminiModel,
									openRouterModel,
								}),
							});
							const data = (await response.json()) as {
								ok?: boolean;
								provider?: string;
								fallbackUsed?: boolean;
								error?: string;
							};
							if (!response.ok || !data.ok)
								throw new Error(data.error || "Falha ao testar a Cris.");
							toast.success("Cris conectada.", {
								description: data.fallbackUsed
									? `Conectou usando o fallback: ${data.provider}.`
									: `Provedor ativo: ${data.provider}.`,
							});
						} catch (error) {
							toast.error(
								error instanceof Error
									? error.message
									: "Falha ao testar a Cris.",
							);
						} finally {
							setIsTestingCris(false);
						}
					}}
				>
					{isTestingCris ? "Testando Cris..." : "Testar conexão da Cris"}
				</Button>

				<p className="text-[0.65rem] leading-relaxed text-muted-foreground">
					Se as APIs estiverem sem cota ou indisponíveis, o DarkCut usa o analisador local para não interromper a montagem.
				</p>
			</section>

			<section className="space-y-2 rounded-md border bg-card p-3">
				<div>
					<div className="text-sm font-medium">Jamendo</div>
					<div className="text-[0.68rem] text-muted-foreground">
						Biblioteca de músicas de fundo
					</div>
				</div>
				<Input
					type="password"
					value={jamendoClientId}
					onChange={(event) => setJamendoClientId(event.target.value)}
					placeholder="Jamendo Client ID"
					autoComplete="off"
				/>
			</section>

			<section className="space-y-2 rounded-md border bg-card p-3">
				<div>
					<div className="text-sm font-medium">Freesound</div>
					<div className="text-[0.68rem] text-muted-foreground">
						Efeitos sonoros e ambientes
					</div>
				</div>
				<Input
					type="password"
					value={freesoundApiKey}
					onChange={(event) => setFreesoundApiKey(event.target.value)}
					placeholder="Freesound API Key"
					autoComplete="off"
				/>
			</section>

			<div className="grid grid-cols-2 gap-2">
				<Button
					onClick={() =>
						toast.success("APIs salvas.", {
							description: "O DarkCut vai reutilizar essas chaves automaticamente.",
						})
					}
				>
					Salvar APIs
				</Button>
				<Button variant="outline" onClick={clearAll}>
					Limpar
				</Button>
			</div>

			<p className="text-[0.66rem] leading-relaxed text-muted-foreground">
				No app atual, essas credenciais ficam persistidas localmente. Não coloque suas chaves em prints ou mensagens.
			</p>
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
