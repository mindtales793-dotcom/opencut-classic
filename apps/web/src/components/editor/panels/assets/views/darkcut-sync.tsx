"use client";

import { useProjectDraft } from "@/darkcut/project-draft";
import { TaskStatus, useDarkCutTasks } from "@/darkcut/tasks";
import { MusicPanel } from "@/darkcut/music-panel";
import { SilencePanel } from "@/darkcut/silence-panel";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { FISH_NARRATORS } from "@/darkcut/fish-narrators";
import { addNarrationAssetToTimeline } from "../darkcut-automation";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useAssetsPanelStore } from "../assets-panel-store";

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
	const [jobId, setJobId] = useProjectDraft<string | null>(
		"narration-job",
		null,
	);
	const [narrationFileName, setNarrationFileName] = useProjectDraft(
		"narration-filename",
		"darkcut-narracao.mp3",
	);

	const mediaAssets = useEditor((e) => e.media.getAssets());
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
		const task = (status: "running" | "done" | "error", detail?: string) =>
			useDarkCutTasks.getState().set("narration", {
				projectId,
				label: "Narração",
				detail,
				tab: "sync",
				status,
			});
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
			task("running", "Gerando voz — aguardando Fish Audio…");
			while (true) {
				const check = await fetch(`/api/darkcut/narration-jobs?id=${job.id}`);
				const state = await check.json();
				if (
					!check.ok ||
					state.status === "error" ||
					state.status === "interrupted"
				)
					throw new Error(
						state.error || "Tarefa interrompida. Clique em Retomar narração.",
					);
				if (state.status === "ready") break;
				await new Promise((resolve) => setTimeout(resolve, 1500));
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
			task("done");
			setNarrationUrl(asset.url ?? URL.createObjectURL(blob));
			setNarrationFileName(fileName);
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
		if (!narrationUrl) return;
		const link = document.createElement("a");
		link.href = narrationUrl;
		link.download = narrationFileName;
		link.click();
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
					timeline.
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
					<div role="status" className="rounded-md border p-3 text-xs">
						<TaskStatus task={narrationTask} />
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
						/>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="secondary" onClick={downloadNarration}>
								↓ Baixar
							</Button>
							<Button variant="secondary" onClick={addNarrationToTimeline}>
								+ Timeline
							</Button>
						</div>
					</div>
				)}
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
