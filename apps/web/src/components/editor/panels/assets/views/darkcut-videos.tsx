"use client";

import { useMemo, useState } from "react";
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
	statusLabel: "idle" | "searching" | "ready" | "error" | "exhausted";
	triedVideoIds: string[];
	lastVideoId?: string;
	error?: string;
};

function createVideoBlocks(script: string, sceneSeconds: number): VideoBlock[] {
	return buildDarkCutScenes({ script, sceneSeconds }).map((scene) => ({
		...scene,
		searchQuery: scene.keywords.slice(0, 5).join(" "),
		statusLabel: "idle",
		triedVideoIds: [],
	}));
}

export function DarkCutVideosView() {
	const editor = useEditor();
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const { script, sceneSeconds, setSceneSeconds } = useDarkCutProductionStore();
	const [blocks, setBlocks] = useState<VideoBlock[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	const readyCount = useMemo(
		() => blocks.filter((block) => block.statusLabel === "ready").length,
		[blocks],
	);

	const analyze = () => {
		const next = createVideoBlocks(script, sceneSeconds);
		if (!next.length) {
			toast.error("Cole o roteiro na aba Roteiro antes de analisar.");
			setActiveTab("production");
			return;
		}
		setBlocks(next);
		toast.success(`${next.length} blocos criados para busca automática.`);
	};

	const updateBlock = (id: string, patch: Partial<VideoBlock>) => {
		setBlocks((current) =>
			current.map((block) => (block.id === id ? { ...block, ...patch } : block)),
		);
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

		updateBlock(block.id, { statusLabel: "searching", error: undefined });
		try {
			const response = await fetch("/api/darkcut/youtube/clip", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query,
					durationSeconds: block.durationSeconds,
					excludeVideoIds: block.triedVideoIds,
				}),
			});

			if (!response.ok) {
				let message = "Falha ao buscar vídeo.";
				let exhausted = false;
				try {
					const data = (await response.json()) as {
						error?: string;
						exhausted?: boolean;
					};
					if (data.error) message = data.error;
					exhausted = Boolean(data.exhausted);
				} catch {}
				updateBlock(block.id, {
					statusLabel: exhausted ? "exhausted" : "error",
					error: message,
				});
				return false;
			}

			const videoId = response.headers.get("X-DarkCut-Video-Id") || "";
			const rawTitle = response.headers.get("X-DarkCut-Video-Title") || "";
			const title = rawTitle ? decodeURIComponent(rawTitle) : `YouTube ${videoId}`;
			const blob = await response.blob();
			const fileName = `DARKCUT-BLOCO-${block.index}-${videoId || Date.now()}.mp4`;
			const file = new File([blob], fileName, {
				type: blob.type || "video/mp4",
			});
			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed) throw new Error("Não foi possível preparar o clipe baixado.");

			const activeProject = editor.project.getActive();
			const asset = await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: processed,
			});
			if (!asset) throw new Error("Não foi possível salvar o clipe na Mídia Local.");

			const tried = videoId
				? Array.from(new Set([...block.triedVideoIds, videoId]))
				: block.triedVideoIds;

			updateBlock(block.id, {
				statusLabel: "ready",
				status: "ready",
				mediaId: asset.id,
				mediaName: title,
				lastVideoId: videoId || undefined,
				triedVideoIds: tried,
				error: undefined,
			});
			return true;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Falha ao baixar o vídeo.";
			updateBlock(block.id, { statusLabel: "error", error: message });
			return false;
		}
	};

	const searchAll = async () => {
		const currentBlocks = blocks.length
			? blocks
			: createVideoBlocks(script, sceneSeconds);
		if (!currentBlocks.length) {
			toast.error("Cole o roteiro na aba Roteiro antes de buscar vídeos.");
			setActiveTab("production");
			return;
		}
		if (!blocks.length) setBlocks(currentBlocks);

		setIsRunning(true);
		let success = 0;
		try {
			for (const block of currentBlocks) {
				if (await downloadForBlock(block)) success += 1;
			}
			toast.success(`${success} de ${currentBlocks.length} blocos receberam vídeos.`);
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
			toast.error("Nenhum bloco com vídeo pronto.");
			return;
		}
		const inserted = assembleScenesOnTimeline({
			scenes: readyScenes,
			editor,
			addCaptions: false,
		});
		toast.success(`${inserted} clipes adicionados à timeline.`);
	};

	return (
		<div className="h-full overflow-y-auto p-4">
			<div className="mb-4">
				<p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
					DarkCut Studio
				</p>
				<h2 className="mt-1 text-lg font-semibold">Vídeos com Vídeos</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Roteiro → blocos → busca → download → Mídia Local → timeline.
				</p>
			</div>

			<section className="space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<div className="text-sm font-medium">Analisar roteiro</div>
						<div className="text-[0.7rem] text-muted-foreground">
							Usa o mesmo roteiro salvo na aba Roteiro.
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
					<Button variant="secondary" onClick={analyze} disabled={!script.trim()}>
						Separar em blocos
					</Button>
					<Button onClick={searchAll} disabled={isRunning || !script.trim()}>
						{isRunning ? "Buscando e baixando..." : "▶ Buscar vídeos automático"}
					</Button>
				</div>
			</section>

			{blocks.length > 0 && (
				<section className="mt-3 rounded-md border bg-card p-3">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-sm font-medium">Fila de vídeos</div>
						<span className="text-[0.7rem] text-muted-foreground">
							{readyCount}/{blocks.length} prontos
						</span>
					</div>

					<div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
						{blocks.map((block) => (
							<div key={block.id} className="rounded-md border bg-background p-2">
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
												block.statusLabel === "ready"
													? "ready"
													: "idle",
										})
									}
									className="mt-2 h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-primary"
									placeholder="Palavra-chave de busca"
								/>

								{block.mediaName && (
									<div className="mt-1 truncate text-[0.68rem] text-foreground">
										✓ {block.mediaName}
									</div>
								)}
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
										{block.mediaId ? "↻ Outro vídeo" : "Buscar este bloco"}
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
					+ Adicionar vídeos prontos à timeline ({readyCount})
				</Button>
				<p className="mt-2 text-[0.68rem] text-muted-foreground">
					Os clipes baixados ficam salvos na Mídia Local do projeto antes de entrar na timeline.
				</p>
			</section>
		</div>
	);
}
