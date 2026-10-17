"use client";

import { useProjectDraft } from "@/darkcut/project-draft";
import { useDarkCutTasks } from "@/darkcut/tasks";
import { buildMediaSearchPlan } from "@/darkcut/media-search-intelligence";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import {
	assembleScenesOnTimeline,
	buildDarkCutScenes,
	type DarkCutScene,
} from "../darkcut-automation";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useAssetsPanelStore } from "../assets-panel-store";

type VideoBlock = DarkCutScene & {
	searchQuery: string;
	fallbackQuery?: string;
	searchReason?: string;
	mediaExternalId?: string;
	statusLabel: "idle" | "searching" | "ready" | "error" | "exhausted";
	triedVideoIds: string[];
	lastVideoId?: string;
	mediaSource?: "youtube" | "pexels" | "pixabay";
	mediaKind?: "video" | "image";
	error?: string;
};

function createVideoBlocks(script: string, sceneSeconds: number): VideoBlock[] {
	const scenes = buildDarkCutScenes({ script, sceneSeconds });
	return scenes.map((scene, index) => {
		const plan = buildMediaSearchPlan(scene.text, scenes[index - 1]?.text ?? "");
		return {
			...scene,
			searchQuery: plan.query,
			fallbackQuery: plan.fallbackQuery,
			searchReason: plan.reason,
			statusLabel: "idle",
			triedVideoIds: [],
		};
	});
}

export function DarkCutVideosView() {
	const editor = useEditor();
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const {
		script,
		sceneSeconds,
		setSceneSeconds,
		youtubeApiKeys,
		setYoutubeApiKey,
		pexelsApiKey,
		pixabayApiKey,
	} = useDarkCutProductionStore();
	const [blocks, setBlocks] = useProjectDraft<VideoBlock[]>("video-blocks", []);
	const [isRunning, setIsRunning] = useState(false);
	const [isPaused, setIsPaused] = useProjectDraft<boolean>(
		"video-search-paused",
		false,
	);
	const pause = useRef(isPaused);
	const usedVideoIds = useRef(new Set<string>());
	const usedStockIds = useRef(new Set<string>());
	const [sourcePriority, setSourcePriority] = useProjectDraft<
		"youtube-first" | "stock-first" | "stock-only"
	>("video-source-priority", "youtube-first");
	const task = (
		status: "running" | "paused" | "done" | "error",
		done: number,
		total: number,
		detail?: string,
	) =>
		useDarkCutTasks.getState().set("videos", {
			projectId: editor.project.getActive().metadata.id,
			label: "Vídeos",
			detail,
			tab: "videos",
			status,
			done,
			total,
		});

	const readyCount = useMemo(
		() => blocks.filter((block) => block.statusLabel === "ready").length,
		[blocks],
	);
	const configuredApiKeys = useMemo(
		() => youtubeApiKeys.filter((key) => key.trim()).length,
		[youtubeApiKeys],
	);
	const configuredStockApis = Number(Boolean(pexelsApiKey.trim())) + Number(Boolean(pixabayApiKey.trim()));
	const hasAnyMediaSource = configuredApiKeys > 0 || configuredStockApis > 0;

	const analyze = () => {
		const next = createVideoBlocks(script, sceneSeconds);
		if (!next.length) {
			toast.error("Cole o roteiro na aba Produção antes de analisar.");
			setActiveTab("production");
			return;
		}
		setBlocks(next);
		toast.success(`${next.length} blocos criados para busca automática.`);
	};

	const updateBlock = (id: string, patch: Partial<VideoBlock>) => {
		setBlocks((current) =>
			current.map((block) =>
				block.id === id ? { ...block, ...patch } : block,
			),
		);
	};

	const saveResponseAsMedia = async ({
		response,
		block,
		source,
	}: {
		response: Response;
		block: VideoBlock;
		source: "youtube" | "pexels" | "pixabay";
	}) => {
		const contentType = response.headers.get("content-type") || "application/octet-stream";
		const isImage = contentType.startsWith("image/");
		const rawTitle =
			response.headers.get(source === "youtube" ? "X-DarkCut-Video-Title" : "X-DarkCut-Media-Title") || "";
		const title = rawTitle
			? decodeURIComponent(rawTitle)
			: `${source.toUpperCase()} · bloco ${block.index}`;
		const mediaId =
			response.headers.get(source === "youtube" ? "X-DarkCut-Video-Id" : "X-DarkCut-Media-Id") ||
			String(Date.now());
		const blob = await response.blob();
		const extension = isImage
			? contentType.includes("png")
				? "png"
				: contentType.includes("webp")
					? "webp"
					: "jpg"
			: "mp4";
		const file = new File(
			[blob],
			`DARKCUT-BLOCO-${block.index}-${source}-${mediaId}.${extension}`,
			{ type: contentType },
		);
		const [processed] = await processMediaAssets({ files: [file] });
		if (!processed) throw new Error("Não foi possível preparar a mídia encontrada.");

		const activeProject = editor.project.getActive();
		const asset = await editor.media.addMediaAsset({
			projectId: activeProject.metadata.id,
			asset: processed,
		});
		if (!asset) throw new Error("Não foi possível salvar a mídia na Mídia Local.");

		const externalKey = `${source}:${isImage ? "image" : "video"}:${mediaId}`;
		if (source !== "youtube") usedStockIds.current.add(externalKey);
		updateBlock(block.id, {
			statusLabel: "ready",
			status: "ready",
			mediaId: asset.id,
			mediaName: title,
			mediaSource: source,
			mediaKind: isImage ? "image" : "video",
			mediaExternalId: externalKey,
			error: undefined,
		});
		return true;
	};

	const tryStockFallback = async (block: VideoBlock) => {
		if (!configuredStockApis) return false;
		const plan = buildMediaSearchPlan(block.text);
		const queries = Array.from(new Set([
			block.searchQuery.trim(),
			(block.fallbackQuery || plan.fallbackQuery).trim(),
		].filter(Boolean)));
		let errorDetail = "";
		// Only try a broad fallback when the exact stock search has no matches.
		// No extra YouTube search request is spent here.
		for (const [index, query] of queries.entries()) {
			const response = await fetch("/api/darkcut/stock/media", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query,
					pexelsApiKey,
					pixabayApiKey,
					prefer: "video",
					excludeMediaIds: Array.from(new Set([
						...usedStockIds.current,
						...blocks.flatMap((item) => item.mediaExternalId ? [item.mediaExternalId] : []),
					])),
				}),
			});
			if (response.ok) {
				const source = response.headers.get("X-DarkCut-Source") === "pixabay"
					? "pixabay" : "pexels";
				if (index > 0) {
					toast.info(`Bloco ${block.index}: busca ampliada para encontrar mídia de apoio.`, {
						description: "Confira se a imagem genérica representa corretamente a fala.",
					});
				}
				return saveResponseAsMedia({ response, block, source });
			}
			const data = await response.json().catch(() => null) as {
				error?: string;
				detail?: string;
			} | null;
			errorDetail = data?.detail || data?.error || `Bancos HTTP ${response.status}`;
			if (response.status !== 404) break;
		}
		throw new Error(errorDetail || "Nenhuma mídia compatível nos bancos consultados.");
	};

	const downloadForBlock = async (block: VideoBlock) => {
		const query = block.searchQuery.trim();
		if (!query) {
			updateBlock(block.id, {
				statusLabel: "error",
				error: "Defina uma palavra-chave para este bloco.",
			});
			return false;
		}
		if (!hasAnyMediaSource) {
			updateBlock(block.id, {
				statusLabel: "error",
				error: "Cadastre YouTube, Pexels ou Pixabay em Configurações > APIs.",
			});
			toast.error("Cadastre pelo menos uma fonte de mídia antes de buscar.");
			return false;
		}

		updateBlock(block.id, { statusLabel: "searching", error: undefined });
		let youtubeError = "";

		if (sourcePriority !== "youtube-first" && configuredStockApis) {
			try {
				if (await tryStockFallback(block)) return true;
			} catch (error) {
				youtubeError = error instanceof Error ? error.message : "Falha nos bancos.";
			}
		}

		if (configuredApiKeys && sourcePriority !== "stock-only") {
			try {
				const response = await fetch("/api/darkcut/youtube/clip", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						query,
						durationSeconds: block.durationSeconds,
						excludeVideoIds: Array.from(
							new Set([
								...block.triedVideoIds,
								...usedVideoIds.current,
								...blocks.flatMap((b) => (b.lastVideoId ? [b.lastVideoId] : [])),
							]),
						),
						youtubeApiKeys,
					}),
				});

				if (response.ok) {
					const videoId = response.headers.get("X-DarkCut-Video-Id") || "";
					if (videoId) usedVideoIds.current.add(videoId);
					const triedHeader = response.headers.get("X-DarkCut-Tried-Ids") || "";
					const autoTriedIds = triedHeader
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean);
					updateBlock(block.id, {
						lastVideoId: videoId || undefined,
						triedVideoIds: Array.from(
							new Set([
								...block.triedVideoIds,
								...autoTriedIds,
								...(videoId ? [videoId] : []),
							]),
						),
					});
					return await saveResponseAsMedia({
						response,
						block,
						source: "youtube",
					});
				}

				try {
					const data = (await response.json()) as {
						error?: string;
						detail?: string;
						attemptedVideoIds?: string[];
					};
					youtubeError = [data.error, data.detail].filter(Boolean).join(" ");
					if (Array.isArray(data.attemptedVideoIds)) {
						updateBlock(block.id, {
							triedVideoIds: Array.from(
								new Set([...block.triedVideoIds, ...data.attemptedVideoIds]),
							),
						});
					}
				} catch {
					youtubeError = "YouTube não retornou um resultado utilizável.";
				}
			} catch (error) {
				youtubeError =
					error instanceof Error ? error.message : "Falha ao acessar o YouTube.";
			}
		}

		if (sourcePriority === "youtube-first") {
			try {
				if (await tryStockFallback(block)) return true;
			} catch (error) {
				const stockError =
					error instanceof Error ? error.message : "Falha nos bancos de mídia.";
				youtubeError = [youtubeError, stockError].filter(Boolean).join(" · ");
			}
		}

		updateBlock(block.id, {
			statusLabel: "exhausted",
			error:
				youtubeError ||
				"Nenhum resultado adequado foi encontrado no YouTube, Pexels ou Pixabay.",
		});
		return false;
	};

	const searchAll = async () => {
		if (!hasAnyMediaSource) {
			toast.error("Cadastre YouTube, Pexels ou Pixabay em Configurações > APIs.");
			return;
		}
		const currentBlocks = blocks.length
			? blocks
			: createVideoBlocks(script, sceneSeconds);
		if (!currentBlocks.length) {
			toast.error("Cole o roteiro na aba Produção antes de buscar vídeos.");
			setActiveTab("production");
			return;
		}
		if (!blocks.length) setBlocks(currentBlocks);

		if (isRunning) return;
		pause.current = false;
		setIsPaused(false);
		setIsRunning(true);
		let success = currentBlocks.filter(
			(b) => b.statusLabel === "ready" && b.mediaId,
		).length;
		task("running", success, currentBlocks.length);
		try {
			for (const block of currentBlocks) {
				if (pause.current) break;
				if (block.statusLabel === "ready" && block.mediaId) continue;
				task(
					"running",
					success,
					currentBlocks.length,
					`Buscando e baixando bloco ${currentBlocks.indexOf(block) + 1} de ${currentBlocks.length}…`,
				);
				if (await downloadForBlock(block)) success += 1;
				task("running", success, currentBlocks.length);
			}
			if (pause.current) {
				setIsPaused(true);
				task(
					"paused",
					success,
					currentBlocks.length,
					`Pausado em ${success}/${currentBlocks.length}. Clique em Retomar busca.`,
				);
				toast.info(
					`Busca pausada. ${success} de ${currentBlocks.length} blocos já estão prontos.`,
				);
			} else {
				setIsPaused(false);
				task(
					success === currentBlocks.length ? "done" : "error",
					success,
					currentBlocks.length,
				);
				const message = `${success} de ${currentBlocks.length} blocos receberam mídia.`;
				if (success === currentBlocks.length) toast.success(message);
				else toast.error(`${message} Confira os erros nos blocos pendentes.`);
			}
		} finally {
			setIsRunning(false);
		}
	};

	const searchAnother = async (block: VideoBlock) => {
		await downloadForBlock({
			...block,
			mediaId: undefined,
			mediaName: undefined,
			status: "missing",
		});
	};

	const addReadyToTimeline = () => {
		const readyScenes: DarkCutScene[] = blocks
			.filter((block) => block.mediaId)
			.map((block) => ({
				id: block.id,
				index: block.index,
				text: block.text,
				prompt: block.prompt,
				keywords: block.keywords,
				durationSeconds: block.durationSeconds,
				status: "ready",
				mediaId: block.mediaId,
				mediaName: block.mediaName,
			}));

		if (!readyScenes.length) {
			toast.error("Nenhum bloco com mídia pronta.");
			return;
		}
		const inserted = assembleScenesOnTimeline({
			scenes: readyScenes,
			editor,
			addCaptions: false,
		});
		toast.success(`${inserted} mídias adicionadas à timeline.`);
	};

	return (
		<div className="h-full overflow-y-auto p-4">
			<div className="mb-4">
				<p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
					DarkCut Studio
				</p>
				<h2 className="mt-1 text-lg font-semibold">Busca automática de vídeos</h2>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{isRunning && (
						<Button
							variant="secondary"
							onClick={() => {
								pause.current = true;
								setIsPaused(true);
								task(
									"paused",
									readyCount,
									blocks.length,
									"Pausa solicitada — finalizando o clipe atual…",
								);
							}}
						>
							⏸ Pausar busca
						</Button>
					)}
					{!isRunning && isPaused && (
						<Button
							onClick={searchAll}
							disabled={!script.trim() || !hasAnyMediaSource}
						>
							▶ Retomar busca
						</Button>
					)}
					{isPaused && (
						<span className="rounded-full border border-caution/40 bg-caution/10 px-2 py-1 text-[0.68rem] text-caution">
							Fila pausada · {readyCount}/{blocks.length} prontos
						</span>
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					Blocos salvos por projeto. O DarkCut interpreta cada trecho e cria
					uma busca visual curta em inglês, em vez de pesquisar a frase inteira.
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Roteiro → interpretação visual → YouTube → Pexels → Pixabay →
					preview do resultado → Mídia Local → timeline.
				</p>
			</div>

			<section className="mb-3 space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<div className="text-sm font-medium">YouTube Data API v3</div>
						<div className="text-[0.7rem] text-muted-foreground">
							Até três chaves. O DarkCut salva neste dispositivo e alterna
							automaticamente quando uma chave falhar ou atingir limite.
						</div>
					</div>
					<span className="rounded bg-primary/10 px-2 py-1 text-[0.65rem] text-primary">
						{configuredApiKeys}/3 configuradas
					</span>
				</div>

				<div className="space-y-2">
					{[0, 1, 2].map((index) => (
						<label key={index} className="block">
							<span className="mb-1 block text-[0.68rem] text-muted-foreground">
								Chave YouTube {index + 1}
							</span>
							<input
								type="password"
								autoComplete="off"
								value={youtubeApiKeys[index] || ""}
								onChange={(event) =>
									setYoutubeApiKey(index, event.target.value)
								}
								className="h-9 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
								placeholder="Cole sua chave aqui"
							/>
						</label>
					))}
				</div>

				<div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
					<span>✓ Salvamento automático</span>
					<button
						type="button"
						className="hover:text-foreground"
						onClick={() => {
							[0, 1, 2].forEach((index) => setYoutubeApiKey(index, ""));
							toast.success("Chaves do YouTube removidas deste dispositivo.");
						}}
					>
						Limpar chaves
					</button>
				</div>
			</section>

			<section className="space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<div className="text-sm font-medium">Analisar roteiro</div>
						<div className="text-[0.7rem] text-muted-foreground">
							Usa o mesmo roteiro salvo na aba Produção.
						</div>
					</div>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						Blocos
						<input
							type="number"
							min={2}
							max={15}
							value={sceneSeconds}
							onChange={(event) =>
								setSceneSeconds(
									Math.max(2, Math.min(15, Number(event.target.value) || 3)),
								)
							}
							className="h-8 w-16 rounded-md border bg-background px-2 text-foreground"
						/>
						s
					</label>
				</div>

				<div className="max-h-24 overflow-y-auto rounded-md border bg-background p-2 text-xs text-muted-foreground">
					{script.trim() || "Nenhum roteiro carregado."}
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						variant="secondary"
						onClick={analyze}
						disabled={!script.trim()}
					>
						Separar em blocos
					</Button>
					<Button
						onClick={searchAll}
						disabled={isRunning || !script.trim() || !hasAnyMediaSource}
					>
						{isRunning
							? "Buscando e baixando..."
							: isPaused
								? "▶ Retomar busca"
								: "▶ Buscar vídeos automático"}
					</Button>
				</div>
			</section>

			{blocks.length > 0 && (
				<section className="mt-3 rounded-md border bg-card p-3">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-sm font-medium">Fila de vídeos</div>
						<div className="flex items-center gap-2">
							{isPaused && (
								<span className="rounded bg-caution/15 px-1.5 py-0.5 text-[0.65rem] text-caution">
									Pausado
								</span>
							)}
							<span className="text-[0.7rem] text-muted-foreground">
								{readyCount}/{blocks.length} prontos
							</span>
						</div>
					</div>

					<div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
						{blocks.map((block) => (
							<div
								key={block.id}
								className="rounded-md border bg-background p-2"
							>
								<div className="flex items-center justify-between gap-2 text-xs">
									<span className="font-medium">Bloco {block.index}</span>
									<span
										className={cn(
											"rounded px-1.5 py-0.5 text-[0.65rem]",
											block.statusLabel === "ready" &&
												"bg-constructive/15 text-constructive",
											block.statusLabel === "searching" &&
												"bg-primary/15 text-primary",
											(block.statusLabel === "error" ||
												block.statusLabel === "exhausted") &&
												"bg-destructive/15 text-destructive",
										)}
									>
										{block.statusLabel === "ready"
											? "Pronto"
											: block.statusLabel === "searching"
												? "Buscando..."
												: block.statusLabel === "exhausted"
													? "Sem outro resultado"
													: block.statusLabel === "error"
														? "Erro"
														: "Pendente"}
									</span>
								</div>

								<p className="mt-1 line-clamp-2 text-[0.7rem] text-muted-foreground">
									{block.text}
								</p>

								<input
									value={block.searchQuery}
									onChange={(event) =>
										updateBlock(block.id, {
											searchQuery: event.target.value,
											statusLabel:
												block.statusLabel === "ready" ? "ready" : "idle",
										})
									}
									className="mt-2 h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-primary"
									placeholder="Palavra-chave visual em inglês"
								/>

								{block.statusLabel === "searching" && (
									<div className="mt-2 overflow-hidden rounded-md border border-primary/25 bg-primary/5">
										<div className="aspect-video w-full animate-pulse bg-muted/50" />
										<div className="flex items-center gap-2 border-t px-2 py-1.5 text-[0.65rem] text-muted-foreground">
											<span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
											Buscando a melhor mídia para este trecho…
										</div>
									</div>
								)}
								{block.mediaId && (() => {
									const asset = mediaAssets.find((item) => item.id === block.mediaId);
									if (!asset || (asset.type !== "video" && asset.type !== "image")) return null;
									return (
										<div className="mt-2 overflow-hidden rounded-md border bg-black">
											{asset.type === "video" ? (
												<video
													src={asset.url}
													poster={asset.thumbnailUrl}
													controls
													preload="metadata"
													className="aspect-video w-full object-contain"
												/>
											) : (
												<img
													src={asset.url || asset.thumbnailUrl}
													alt={block.mediaName || `Mídia do bloco ${block.index}`}
													className="aspect-video w-full object-contain"
												/>
											)}
											<div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/80 px-2 py-1.5 text-[0.65rem] text-white/80">
												<span className="truncate">✓ {block.mediaName || asset.name}</span>
												<span className="shrink-0">
													{block.mediaSource ? block.mediaSource.toUpperCase() : "MÍDIA"} · {asset.type === "video" ? "Vídeo" : "Imagem"}
												</span>
											</div>
										</div>
									);
								})()}
								{block.error && (
									<div className="mt-1 text-[0.68rem] text-destructive">
										{block.error}
									</div>
								)}

								<div className="mt-2 grid grid-cols-2 gap-2">
									<Button
										size="sm"
										variant="secondary"
										disabled={block.statusLabel === "searching"}
										onClick={() => searchAnother(block)}
									>
										{block.mediaId ? "↻ Outra mídia" : "Buscar este bloco"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											updateBlock(block.id, {
												triedVideoIds: [],
												statusLabel: "idle",
												error: undefined,
											})
										}
									>
										Refazer busca
									</Button>
								</div>

								{block.triedVideoIds.length > 0 && (
									<div className="mt-1 text-[0.62rem] text-muted-foreground">
										{block.triedVideoIds.length} resultado(s) já tentado(s)
									</div>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			<section className="mt-3 rounded-md border bg-card p-3">
				<Button
					className="w-full"
					disabled={!readyCount}
					onClick={addReadyToTimeline}
				>
					+ Adicionar mídias prontas à timeline ({readyCount})
				</Button>
				<p className="mt-2 text-[0.68rem] text-muted-foreground">
					As mídias encontradas ficam salvas na Mídia Local do projeto antes de
					entrar na timeline.
				</p>
			</section>
		</div>
	);
}
