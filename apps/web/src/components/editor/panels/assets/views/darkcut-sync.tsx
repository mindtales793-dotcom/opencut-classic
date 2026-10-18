"use client";

import { useProjectDraft } from "@/darkcut/project-draft";
import { TaskStatus, useDarkCutTasks } from "@/darkcut/tasks";
import { MusicPanel } from "@/darkcut/music-panel";
import { SilencePanel } from "@/darkcut/silence-panel";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { FISH_NARRATORS } from "@/darkcut/fish-narrators";
import { addNarrationAssetToTimeline } from "../darkcut-automation";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useAssetsPanelStore } from "../assets-panel-store";
import { syncVisualsToSrt, type DarkCutSrtScope, type DarkCutSrtOrder } from "@/timeline/darkcut-tools";
import { analyzeSceneSrt, makeSrtTimingGroups, resolveSrtSyncStrategy, sceneNumberFromName, type SrtSyncStrategy } from "@/darkcut/srt-scene-sync";
import type { TimelineElement } from "@/timeline/types";


function formatSrtTime(totalSeconds: number) {
	const safe = Math.max(0, totalSeconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = Math.floor(safe % 60);
	const milliseconds = Math.floor((safe - Math.floor(safe)) * 1000);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function splitSubtitleChunks(text: string) {
	const sentences =
		text
			.replace(/\s+/g, " ")
			.trim()
			.match(/[^.!?…]+[.!?…]?/g)
			?.map((part) => part.trim())
			.filter(Boolean) ?? [];

	const chunks: string[] = [];
	for (const sentence of sentences) {
		const words = sentence.split(/\s+/).filter(Boolean);
		if (words.length <= 12) {
			chunks.push(sentence);
			continue;
		}
		for (let i = 0; i < words.length; i += 10) {
			chunks.push(words.slice(i, i + 10).join(" "));
		}
	}
	return chunks;
}

async function narrationFingerprint(text: string, narratorId: string) {
	const source = `${narratorId}\n${text}`;
	if (globalThis.crypto?.subtle) {
		const bytes = new TextEncoder().encode(source);
		const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}
	let hash = 2166136261;
	for (let i = 0; i < source.length; i += 1) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv-${(hash >>> 0).toString(16)}`;
}

function buildSrtFromScript({
	text,
	durationSeconds,
}: {
	text: string;
	durationSeconds: number;
}) {
	const chunks = splitSubtitleChunks(text);
	if (!chunks.length) return "";

	const weights = chunks.map((chunk) =>
		Math.max(1, chunk.split(/\s+/).filter(Boolean).length),
	);
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	const effectiveDuration =
		durationSeconds > 0
			? durationSeconds
			: Math.max(2, totalWeight / 2.7);

	let cursor = 0;
	return chunks
		.map((chunk, index) => {
			const share = weights[index] / totalWeight;
			const rawDuration = effectiveDuration * share;
			const clipDuration = Math.max(0.9, rawDuration);
			const start = cursor;
			let end =
				index === chunks.length - 1
					? effectiveDuration
					: Math.min(effectiveDuration, start + clipDuration);

			if (end <= start) end = Math.min(effectiveDuration, start + 0.9);
			cursor = end;

			return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk}\n`;
		})
		.join("\n");
}

export function DarkCutSyncView() {
	const editor = useEditor();
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const {
		projectName,
		script,
		selectedNarratorId,
		setSelectedNarratorId,
		fishApiKeys,
	} = useDarkCutProductionStore();

	const narrationTask = useDarkCutTasks((s) => s.tasks.narration);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
	const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
	const [narrationAssetId, setNarrationAssetId] = useProjectDraft<
		string | null
	>("narration-asset", null);
	const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
	const [narrationDurationSeconds, setNarrationDurationSeconds] = useState(0);
	const [jobId, setJobId] = useProjectDraft<string | null>(
		"narration-job",
		null,
	);
	const [narrationFileName, setNarrationFileName] = useProjectDraft(
		"narration-filename",
		"darkcut-narracao.mp3",
	);
	const [narrationSignature, setNarrationSignature] = useProjectDraft<
		string | null
	>("narration-signature", null);
	const [syncSrtText, setSyncSrtText] = useProjectDraft("sync-srt-text", "");
	const [syncSrtFileName, setSyncSrtFileName] = useProjectDraft(
		"sync-srt-filename",
		"",
	);
	const srtInputRef = useRef<HTMLInputElement>(null);
	const [srtStrategy, setSrtStrategy] = useProjectDraft<SrtSyncStrategy>(
		"sync-srt-strategy", "auto",
	);
	const [srtOrder, setSrtOrder] = useProjectDraft<DarkCutSrtOrder>(
		"sync-srt-order", "timeline",
	);
	const [srtScope, setSrtScope] = useProjectDraft<DarkCutSrtScope>(
		"sync-srt-scope", "main",
	);
	const [confirmSrtPlan, setConfirmSrtPlan] = useState(false);
	const srtAnalysis = useMemo(() => analyzeSceneSrt(syncSrtText), [syncSrtText]);
	const srtCues = srtAnalysis.cues;

	const mediaAssets = useEditor((e) => e.media.getAssets());
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const visualTimeline = useMemo(() => {
		if (!activeScene) return [] as Array<{ name: string; startTime: number }>;
		const tracks = (
			srtScope === "main"
				? [activeScene.tracks.main]
				: [activeScene.tracks.main, ...activeScene.tracks.overlay]
		) as Array<{ elements: readonly TimelineElement[] }>;
		const visuals: Array<{ name: string; startTime: number }> = [];
		for (const track of tracks) {
			for (const element of track.elements) {
				if (element.type !== "image" && element.type !== "video") continue;
				visuals.push({ name: element.name, startTime: element.startTime });
			}
		}
		return visuals.sort((a, b) => a.startTime - b.startTime);
	}, [activeScene, srtScope]);
	const timelineVisualCount = visualTimeline.length;
	const namedVisualCount = visualTimeline.filter(
		(item) => sceneNumberFromName(item.name) != null,
	).length;
	const effectiveSrtStrategy = resolveSrtSyncStrategy({
		strategy: srtStrategy,
		cueCount: srtCues.length,
		visualCount: timelineVisualCount,
	});
	const groupedPreview = useMemo(
		() => makeSrtTimingGroups({
			cues: srtCues,
			visualCount: timelineVisualCount,
			strategy: srtStrategy,
		}),
		[srtCues, timelineVisualCount, srtStrategy],
	);
	const hasSrtMismatch = srtCues.length !== timelineVisualCount;
	const needsPlanConfirmation =
		srtAnalysis.invalidBlocks > 0 ||
		hasSrtMismatch;
	const canApplySrt =
		srtCues.length > 0 &&
		timelineVisualCount > 0 &&
		srtAnalysis.overlaps === 0 &&
		(!needsPlanConfirmation || confirmSrtPlan) &&
		(effectiveSrtStrategy !== "one-per-cue" ||
			srtOrder !== "scene-number" ||
			namedVisualCount > 0);

	useEffect(() => {
		const asset = mediaAssets.find((a) => a.id === narrationAssetId);
		if (asset?.url) setNarrationUrl(asset.url);
	}, [mediaAssets, narrationAssetId]);
	const selectedNarrator = FISH_NARRATORS.find(
		(item) => item.id === selectedNarratorId,
	);

	useEffect(() => {
		return () => {
			if (voicePreviewUrl?.startsWith("blob:")) {
				URL.revokeObjectURL(voicePreviewUrl);
			}
		};
	}, [voicePreviewUrl]);

	const previewSelectedVoice = async () => {
		if (!selectedNarrator) {
			toast.error("Selecione um narrador.");
			return;
		}

		setIsPreviewingVoice(true);
		try {
			const previewText =
				selectedNarrator.language === "en"
					? "Hello. This is a quick DarkCut voice preview so you can choose your narrator."
					: "Olá. Este é um teste rápido de voz do DarkCut para você escolher seu narrador.";

			const response = await fetch("/api/darkcut/fish/tts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text: previewText,
					referenceId: selectedNarrator.id,
					fishApiKeys,
				}),
			});

			if (!response.ok) {
				let message = "Falha ao carregar a prévia da voz.";
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) message = body.error;
				} catch {}
				throw new Error(message);
			}

			const blob = await response.blob();
			if (voicePreviewUrl?.startsWith("blob:")) {
				URL.revokeObjectURL(voicePreviewUrl);
			}
			const url = URL.createObjectURL(blob);
			setVoicePreviewUrl(url);
			toast.success(`Prévia pronta: ${selectedNarrator.name}.`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao carregar a prévia da voz.",
			);
		} finally {
			setIsPreviewingVoice(false);
		}
	};

	const generateNarration = async () => {
		const text = script.trim();
		if (!text) {
			toast.error("Primeiro escreva ou cole o roteiro na aba Roteiro.");
			setActiveTab("production");
			return;
		}

		const projectId = editor.project.getActive().metadata.id;
		const task = (
			status: "running" | "done" | "error",
			detail?: string,
			progress?: { done: number; total: number },
		) =>
			useDarkCutTasks.getState().set("narration", {
				projectId,
				label: "Narração",
				detail,
				tab: "sync",
				status,
				...(progress && { done: progress.done, total: progress.total }),
			});
		const signature = await narrationFingerprint(text, selectedNarratorId);
		const existingAsset = mediaAssets.find((asset) => asset.id === narrationAssetId);
		if (
			narrationSignature === signature &&
			existingAsset?.url &&
			narrationAssetId
		) {
			setNarrationUrl(existingAsset.url);
			setJobId(null);
			task("done", "Narração reutilizada — sem nova geração.");
			toast.success("Essa narração já estava pronta. Reutilizei o áudio salvo.");
			return;
		}

		setIsGenerating(true);
		task("running", "Enviando roteiro…");
		try {
			const creation = await fetch("/api/darkcut/narration-jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: jobId,
					text,
					referenceId: selectedNarratorId,
					fishApiKeys,
				}),
			});

			const job = await creation.json();
			if (!creation.ok) throw new Error(job.error || "Falha ao criar tarefa.");
			setJobId(job.id);
			const initialTotal = Math.max(1, Number(job.totalChunks) || 1);
			task("running", `Preparando blocos de narração (0/${initialTotal})…`, {
				done: Number(job.completedChunks) || 0, total: initialTotal,
			});
			if (job.status !== "ready") {
				const startedPolling = Date.now();
				while (true) {
					const check = await fetch(
						`/api/darkcut/narration-jobs?id=${job.id}`,
						{ cache: "no-store" },
					);
					const state = await check.json();
					if (!check.ok || state.status === "error" || state.status === "interrupted") {
						throw new Error(
							state.error ||
								"Tarefa interrompida. Os blocos prontos foram salvos; clique em Retomar narração.",
						);
					}
					const total = Math.max(1, Number(state.totalChunks) || initialTotal);
					const completed = Math.min(total, Number(state.completedChunks) || 0);
					if (state.status === "ready") {
						task("running", "Narração completa. Importando áudio para o projeto…", { done: total, total });
						break;
					}
					const current = Math.max(1, Number(state.currentChunk) || completed + 1);
					const detail = state.stage === "combining"
						? "Unindo os blocos de áudio com FFmpeg…"
						: state.stage === "saving"
							? "Validando e salvando o MP3 completo…"
							: state.stage === "downloading"
								? `Recebendo bloco ${current}/${total} · ${((Number(state.bytesReceived) || 0) / 1048576).toFixed(1)} MB`
								: `Fish Audio narrando bloco ${current}/${total}…`;
					task("running", detail, { done: completed, total });
					if (Date.now() - startedPolling > 90 * 60 * 1000) {
						throw new Error("Limite de acompanhamento atingido. Clique em Retomar narração; os blocos concluídos permanecem salvos.");
					}
					await new Promise((resolve) => setTimeout(resolve, 1200));
				}
			}
			task("running", "Baixando narração…");
			const response = await fetch(
				`/api/darkcut/narration-jobs?id=${job.id}&audio=1`,
			);

			if (!response.ok) {
				let message = "Falha ao gerar narração no Fish Audio.";
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) message = body.error;
				} catch {}
				throw new Error(message);
			}

			const blob = await response.blob();
			const selected = FISH_NARRATORS.find(
				(item) => item.id === selectedNarratorId,
			);
			const cleanProject =
				projectName
					.trim()
					.replace(/[^a-zA-Z0-9-_]+/g, "-")
					.replace(/^-+|-+$/g, "")
					.slice(0, 60) || "darkcut";
			const fileName = `DARKCUT-NARRACAO-${cleanProject}-${selected?.name ?? "voz"}.mp3`;
			const file = new File([blob], fileName, {
				type: blob.type || "audio/mpeg",
			});

			task("running", "Preparando áudio…");
			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed) {
				throw new Error("Não foi possível preparar o áudio gerado.");
			}

			const activeProject = editor.project.getActive();
			if (activeProject.metadata.id !== projectId)
				throw new Error(
					"Narração pronta. Reabra o projeto de origem e clique em Retomar narração.",
				);
			task("running", "Salvando narração…");
			const asset = await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: processed,
			});
			if (!asset) {
				throw new Error("Não foi possível salvar a narração na biblioteca.");
			}

			setNarrationAssetId(asset.id);
			setJobId(null);
			task("done", "MP3 pronto • escolha como continuar");
			setNarrationUrl(asset.url ?? URL.createObjectURL(blob));
			setNarrationFileName(fileName);
			setNarrationSignature(signature);
			toast.success(`Narração gerada com ${selected?.name ?? "Fish Audio"}.`);
		} catch (error) {
			task(
				"error",
				error instanceof Error ? error.message : "Falha ao gerar narração.",
			);
			console.error(error);
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao gerar narração no Fish Audio.",
			);
		} finally {
			setIsGenerating(false);
		}
	};

	const addNarrationToTimeline = () => {
		if (!narrationAssetId) {
			toast.error("Gere a narração primeiro.");
			return;
		}
		try {
			const duration = addNarrationAssetToTimeline({
				mediaId: narrationAssetId,
				editor,
			});
			toast.success(
				`Narração adicionada à timeline (${Math.round(duration)}s).`,
			);
		} catch (error) {
			console.error(error);
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao adicionar narração à timeline.",
			);
		}
	};

	const downloadNarration = () => {
		if (!narrationUrl) {
			toast.error("Gere a narração primeiro.");
			return;
		}
		const link = document.createElement("a");
		link.href = narrationUrl;
		link.download = narrationFileName.endsWith(".mp3")
			? narrationFileName
			: `${narrationFileName}.mp3`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		toast.success("Download da narração iniciado.");
	};

	const downloadNarrationSrt = () => {
		const text = script.trim();
		if (!text) {
			toast.error("O roteiro está vazio.");
			return;
		}

		const srt = buildSrtFromScript({
			text,
			durationSeconds: narrationDurationSeconds,
		});
		if (!srt) {
			toast.error("Não foi possível gerar o SRT.");
			return;
		}

		const blob = new Blob([srt], {
			type: "application/x-subrip;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = narrationFileName.replace(/\.mp3$/i, "") + ".srt";
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
		toast.success("SRT gerado e enviado para download.");
	};

	const loadSrtForSync = async (file: File | undefined) => {
		if (!file) return;
		try {
			const text = await file.text();
			const analysis = analyzeSceneSrt(text);
			if (!analysis.cues.length) {
				throw new Error(
					"Não encontrei marcações de tempo válidas nesse arquivo SRT.",
				);
			}
			setSyncSrtText(text);
			setSyncSrtFileName(file.name);
			setConfirmSrtPlan(false);
			toast.success(`SRT carregado: ${analysis.cues.length} marcações de tempo.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao ler o arquivo SRT.",
			);
		}
	};

	const applySrtToTimeline = () => {
		if (!srtCues.length || !timelineVisualCount) {
			toast.error("Importe um SRT e coloque as imagens na timeline primeiro.");
			return;
		}
		if (srtAnalysis.overlaps > 0) {
			toast.error("O SRT possui tempos sobrepostos. Corrija antes de sincronizar.");
			return;
		}
		if (needsPlanConfirmation && !confirmSrtPlan) {
			toast.error("Confira e confirme as diferenças antes de modificar a timeline.");
			return;
		}
		if (srtOrder === "scene-number" && !namedVisualCount) {
			toast.error("Nenhum arquivo tem número de cena reconhecível.");
			return;
		}

		const result = syncVisualsToSrt({
			editor,
			cues: srtCues,
			strategy: srtStrategy,
			scope: srtScope,
			order: effectiveSrtStrategy === "fit-to-media" ? "timeline" : srtOrder,
		});

		if (!result.changed) {
			toast.error("Nenhuma mídia pôde ser associada aos trechos do SRT.");
			return;
		}

		const warnings = [
			result.unmatchedVisuals ? `${result.unmatchedVisuals} mídia(s) não modificadas` : "",
			result.unmatchedCues ? `${result.unmatchedCues} trecho(s) sem imagem` : "",
			result.clamped ? `${result.clamped} vídeo(s) com ajuste limitado` : "",
			result.groupedCues ? `${result.groupedCues} trechos combinados` : "",
		].filter(Boolean);
		toast.success(`${result.changed} mídia(s) ajustadas pelos tempos do SRT.`, {
			description: warnings.length
				? warnings.join(" · ")
				: "Início e duração aplicados; narração e outras trilhas foram preservadas.",
		});
	};


	const words = script.trim() ? script.trim().split(/\s+/).length : 0;

	return (
		<div className="h-full overflow-y-auto p-4">
			<div className="mb-4">
				<p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
					DarkCut Studio
				</p>
				<h2 className="mt-1 text-lg font-semibold">Sincronização e Narração</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Primeiro o roteiro. Depois a voz. Em seguida, a narração entra na
					timeline. O modo rápido reduz esperas locais sem alterar a qualidade da voz.
				</p>
			</div>

			<section className="rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-medium">Roteiro carregado</div>
						<div className="text-[0.7rem] text-muted-foreground">
							{words > 0 ? `${words} palavras` : "Nenhum roteiro ainda"}
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setActiveTab("production")}
					>
						Editar roteiro
					</Button>
				</div>
				<div className="mt-3 max-h-28 overflow-y-auto rounded-md border bg-background p-2 text-xs text-muted-foreground">
					{script.trim() ||
						"Volte para a aba Roteiro e cole o texto que será narrado."}
				</div>
			</section>

			<section className="mt-3 space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<div className="text-sm font-medium">Gerar narração</div>
						<div className="text-[0.7rem] text-muted-foreground">
							Fish Audio · selecione a voz antes de gerar.
							{fishApiKeys.filter((key) => key.trim()).length === 0
								? " Configure a API em Configurações > APIs."
								: ""}
						</div>
					</div>
					<span className="rounded bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
						Fish
					</span>
				</div>

				<div className="space-y-2">
					<label className="block text-xs text-muted-foreground">
						Narrador
						<select
							value={selectedNarratorId}
							onChange={(event) => {
								setSelectedNarratorId(event.target.value);
								if (voicePreviewUrl?.startsWith("blob:")) {
									URL.revokeObjectURL(voicePreviewUrl);
								}
								setVoicePreviewUrl(null);
							}}
							className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
						>
							{FISH_NARRATORS.map((voice) => (
								<option key={voice.id} value={voice.id}>
									{voice.name} · {voice.language.toUpperCase()}
								</option>
							))}
						</select>
					</label>

					<div className="rounded-md border bg-background p-2">
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0">
								<div className="truncate text-xs font-medium text-foreground">
									{selectedNarrator?.name ?? "Narrador"}
								</div>
								<div className="text-[0.65rem] text-muted-foreground">
									{selectedNarrator?.language.toUpperCase() ?? "—"} · prévia
									curta
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								className="h-8 shrink-0 px-2 text-xs"
								disabled={isPreviewingVoice}
								onClick={previewSelectedVoice}
							>
								{isPreviewingVoice ? "Carregando..." : "▶ Ouvir voz"}
							</Button>
						</div>

						{voicePreviewUrl && (
							<audio
								className="mt-2 h-8 w-full"
								controls
								autoPlay
								preload="metadata"
								src={voicePreviewUrl}
							/>
						)}
					</div>

					<div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
						{FISH_NARRATORS.map((voice) => {
							const isSelected = voice.id === selectedNarratorId;
							return (
								<button
									key={voice.id}
									type="button"
									onClick={() => {
										setSelectedNarratorId(voice.id);
										if (voicePreviewUrl?.startsWith("blob:")) {
											URL.revokeObjectURL(voicePreviewUrl);
										}
										setVoicePreviewUrl(null);
									}}
									className={cn(
										"flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors",
										isSelected
											? "bg-primary/10 text-primary"
											: "text-foreground hover:bg-accent",
									)}
								>
									<span className="truncate">{voice.name}</span>
									<span className="ml-2 shrink-0 text-[0.62rem] text-muted-foreground">
										{voice.language.toUpperCase()}
									</span>
								</button>
							);
						})}
					</div>
				</div>

				<Button
					className="w-full"
					disabled={isGenerating || !script.trim()}
					onClick={generateNarration}
				>
					{isGenerating
						? "Gerando narração..."
						: jobId
							? "Retomar narração"
							: "🎙️ Gerar narração"}
				</Button>

				{isGenerating && narrationTask && (
				<div role="status" className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
					<div className="flex items-center justify-between">
						<span className="font-semibold">Gerando narração • acompanhamento</span>
						<span className="text-primary">Em andamento</span>
					</div>
					<TaskStatus task={narrationTask} />
					<p className="text-[0.68rem] leading-relaxed text-muted-foreground">
						A porcentagem representa blocos de voz realmente concluídos
						pelo Fish Audio. Durante a síntese de cada bloco, ela aguarda
						o resultado. Em caso de erro, clique em Retomar para aproveitar
						os blocos já salvos.
					</p>
				</div>
			)}
			<p className="text-xs text-muted-foreground">
					Pode trocar de aba durante a geração. Se fechar o aplicativo, use
					Retomar narração ao reabrir; resultados concluídos são recuperados sem
					gerar novamente.
				</p>
				{narrationUrl && (
					<div className="space-y-2 rounded-md border bg-background p-2">
						<audio
							className="w-full"
							controls
							preload="metadata"
							src={narrationUrl}
							onLoadedMetadata={(event) => {
								const duration = event.currentTarget.duration;
								if (Number.isFinite(duration) && duration > 0) {
									setNarrationDurationSeconds(duration);
								}
							}}
						/>
						<div className="rounded-md border border-primary/20 bg-primary/5 p-2">
							<div className="text-xs font-medium text-foreground">
								Arquivos da narração
							</div>
							<div className="mt-0.5 text-[0.68rem] text-muted-foreground">
								Baixe o áudio e a legenda antes de gerar suas imagens. Os dois
								arquivos ficam independentes do projeto e podem ser usados depois.
							</div>
							<div className="mt-2 grid grid-cols-2 gap-2">
							<Button variant="secondary" onClick={downloadNarration}>↓ Baixar MP3</Button>
							<Button variant="secondary" onClick={downloadNarrationSrt} title="SRT estimado pelo texto e duração">↓ Salvar SRT</Button>
							<Button variant="secondary" onClick={addNarrationToTimeline}>+ Adicionar à timeline</Button>
							<Button onClick={() => setActiveTab("videos")}>Continuar → Vídeos</Button>
						</div>
						<p className="mt-2 text-[0.65rem] text-muted-foreground">
							O SRT exportado distribui o texto na duração total: não é alinhamento palavra por palavra.
						</p>
						</div>
					</div>
				)}
			</section>

			<section className="mt-3 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-medium">Sincronização inteligente • SRT</div>
						<p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
							O SRT define o começo e o fim de cada cena. Analise o plano
							antes de reposicionar imagens; áudio, narração e legendas não são movidos.
						</p>
					</div>
					<span className="shrink-0 rounded bg-primary/15 px-2 py-1 text-[0.62rem] font-medium text-primary">
						SRT → CENAS
					</span>
				</div>

				<input
					ref={srtInputRef}
					type="file"
					accept=".srt,application/x-subrip,text/plain"
					className="hidden"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						void loadSrtForSync(file);
						event.currentTarget.value = "";
					}}
				/>
				<Button variant="secondary" className="w-full" onClick={() => srtInputRef.current?.click()}>
					↑ Importar arquivo SRT
				</Button>
				<div className="grid grid-cols-3 gap-2 text-[0.68rem]">
					<div className="rounded border bg-background p-2">
						<div className="text-muted-foreground">Trechos SRT</div>
						<div className="mt-1 text-base font-semibold">{srtCues.length}</div>
					</div>
					<div className="rounded border bg-background p-2">
						<div className="text-muted-foreground">Mídias visuais</div>
						<div className="mt-1 text-base font-semibold">{timelineVisualCount}</div>
					</div>
					<div className="rounded border bg-background p-2">
						<div className="text-muted-foreground">Duração SRT</div>
						<div className="mt-1 text-sm font-semibold">
							{formatSrtTime(srtAnalysis.durationSeconds).slice(0, 8)}
						</div>
					</div>
				</div>

				<div className="grid gap-2 sm:grid-cols-2">
					<label className="text-[0.68rem] text-muted-foreground">
						Como distribuir os tempos?
						<select
							value={srtStrategy}
							onChange={(event) => {
								const value = event.target.value;
								setSrtStrategy(
									value === "fit-to-media" || value === "one-per-cue"
										? value
										: "auto",
								);
								setSrtOrder("timeline");
								setConfirmSrtPlan(false);
							}}
							className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
						>
							<option value="auto">Automático (recomendado)</option>
							<option value="one-per-cue">1 trecho = 1 imagem (exato)</option>
							<option value="fit-to-media">Adaptar a menos imagens</option>
						</select>
					</label>
					<label className="text-[0.68rem] text-muted-foreground">
						Quais trilhas ajustar?
						<select
							value={srtScope}
							onChange={(event) => {
								setSrtScope(event.target.value === "all" ? "all" : "main");
								setConfirmSrtPlan(false);
							}}
							className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
						>
							<option value="main">Somente trilha principal</option>
							<option value="all">Todas as trilhas visuais</option>
						</select>
					</label>
				</div>

				{effectiveSrtStrategy === "one-per-cue" && (
					<label className="block text-[0.68rem] text-muted-foreground">
						Como identificar cada imagem?
						<select
							value={srtOrder}
							onChange={(event) => {
								setSrtOrder(event.target.value === "scene-number" ? "scene-number" : "timeline");
								setConfirmSrtPlan(false);
							}}
							className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
						>
							<option value="timeline">Ordem atual da timeline</option>
							<option value="scene-number">Número no nome (Cena 001, Imagem 002...)</option>
						</select>
						{srtOrder === "scene-number" && (
							<span className="mt-1 block">
								{namedVisualCount} de {timelineVisualCount} mídia(s) com número reconhecido.
								As outras ficam intactas.
							</span>
						)}
					</label>
				)}

				{syncSrtFileName && (
					<div className="rounded-md border bg-background p-2 text-[0.68rem]">
						<div className="flex items-center justify-between gap-2">
							<span className="min-w-0 truncate font-medium">{syncSrtFileName}</span>
							<Button size="sm" variant="ghost" onClick={() => {
								setSyncSrtText("");
								setSyncSrtFileName("");
								setConfirmSrtPlan(false);
							}}>Remover</Button>
						</div>
						<div className="mt-1 space-y-1 text-muted-foreground">
							{srtAnalysis.nonStandardTimestamps > 0 && (
								<p>{srtAnalysis.nonStandardTimestamps} marcação(ões) com milissegundos incomuns, interpretadas automaticamente.</p>
							)}
							{srtAnalysis.gaps > 0 && (
								<p>{srtAnalysis.gaps} intervalo(s) sem fala. O DarkCut respeita esses espaços.</p>
							)}
							{srtAnalysis.invalidBlocks > 0 && (
								<p className="text-destructive">{srtAnalysis.invalidBlocks} bloco(s) inválido(s) serão ignorados.</p>
							)}
							{srtAnalysis.overlaps > 0 && (
								<p className="text-destructive">{srtAnalysis.overlaps} trecho(s) sobrepostos. Corrija o SRT antes de aplicar.</p>
							)}
						</div>
					</div>
				)}

				{srtCues.length > 0 && (
					<div className="rounded-md border bg-background p-2">
						<div className="text-xs font-semibold">Prévia das primeiras cenas</div>
						<div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
							{(srtOrder === "scene-number" && effectiveSrtStrategy === "one-per-cue"
								? srtCues.slice(0, 6).map((cue) => ({
									firstCue: cue.index,
									lastCue: cue.index,
									startSeconds: cue.startSeconds,
									endSeconds: cue.endSeconds,
									text: cue.text,
								}))
								: groupedPreview.slice(0, 6)
							).map((group, i) => (
								<div key={`${group.firstCue}-${group.startSeconds}`} className="rounded border p-2 text-[0.68rem]">
									<div className="flex justify-between gap-2 font-medium">
										<span className="truncate">
											{group.firstCue === group.lastCue
												? `Cena ${group.firstCue}`
												: `Cenas ${group.firstCue}–${group.lastCue}`}
											{srtOrder === "timeline" && visualTimeline[i] ? ` · ${visualTimeline[i].name}` : ""}
										</span>
										<span className="shrink-0 tabular-nums text-primary">
											{formatSrtTime(group.startSeconds).slice(3, 11)} → {formatSrtTime(group.endSeconds).slice(3, 11)}
										</span>
									</div>
									<p className="mt-1 truncate text-muted-foreground">{group.text}</p>
								</div>
							))}
							{groupedPreview.length > 6 && (
								<p className="text-center text-[0.65rem] text-muted-foreground">
									+ {groupedPreview.length - 6} mídias no plano
								</p>
							)}
						</div>
					</div>
				)}

				{srtCues.length > 0 && (
					<p className="text-[0.68rem] leading-relaxed text-muted-foreground">
						{effectiveSrtStrategy === "fit-to-media" && timelineVisualCount < srtCues.length
							? `Automático: este arquivo tem ${srtCues.length} trechos e ${timelineVisualCount} mídia(s). Os trechos consecutivos serão agrupados para cobrir o SRT inteiro.`
							: timelineVisualCount > srtCues.length
								? `Este SRT tem ${srtCues.length} trechos e há ${timelineVisualCount} mídias. As ${timelineVisualCount - srtCues.length} mídias sem trecho permanecerão sem alteração.`
								: "Quantidade correspondente: cada mídia receberá o tempo de seu trecho no SRT."}
					</p>
				)}

				{needsPlanConfirmation && srtCues.length > 0 && (
					<label className="flex items-start gap-2 text-[0.68rem] text-muted-foreground">
						<input
							type="checkbox"
							className="mt-0.5"
							checked={confirmSrtPlan}
							onChange={(event) => setConfirmSrtPlan(event.target.checked)}
						/>
						Confirmo os tempos calculados para este SRT. Mídias sem correspondência permanecerão intactas.
					</label>
				)}

				<Button className="w-full" disabled={!canApplySrt} onClick={applySrtToTimeline}>
					{canApplySrt ? `Aplicar SRT na timeline (${groupedPreview.length} mídias)` : "Confira o SRT e a timeline"}
				</Button>
				<p className="text-[0.65rem] leading-relaxed text-muted-foreground">
					O DarkCut muda somente tempo e posição dos visuais escolhidos.
					O conteúdo da imagem não é analisado por IA nesta etapa;
					o pareamento é pela ordem ou pelo número explícito no nome.
					Se algum vídeo não puder atingir a duração pedida, o editor avisa.
				</p>
			</section>

			<SilencePanel />
			<MusicPanel />
			<section className="mt-3 rounded-md border bg-card p-3">
				<div className="text-sm font-medium">Fluxo DarkCut</div>
				<div className="mt-2 grid gap-2 text-xs text-muted-foreground">
					<div className="rounded-md border bg-background p-2">1. Roteiro</div>
					<div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-foreground">
						2. Narração
					</div>
					<div className="rounded-md border bg-background p-2">
						3. Cenas e mídias
					</div>
					<div className="rounded-md border bg-background p-2">4. Timeline</div>
				</div>
			</section>
		</div>
	);
}
