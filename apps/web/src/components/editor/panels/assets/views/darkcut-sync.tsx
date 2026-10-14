"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
	} = useDarkCutProductionStore();

	const [isGenerating, setIsGenerating] = useState(false);
	const [narrationAssetId, setNarrationAssetId] = useState<string | null>(null);
	const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
	const [narrationFileName, setNarrationFileName] =
		useState("darkcut-narracao.mp3");

	const generateNarration = async () => {
		const text = script.trim();
		if (!text) {
			toast.error("Primeiro escreva ou cole o roteiro na aba Roteiro.");
			setActiveTab("production");
			return;
		}

		setIsGenerating(true);
		try {
			const response = await fetch("/api/darkcut/fish/tts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text,
					referenceId: selectedNarratorId,
				}),
			});

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
			const fileName = `${cleanProject}-${selected?.name ?? "narracao"}.mp3`;
			const file = new File([blob], fileName, {
				type: blob.type || "audio/mpeg",
			});

			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed) {
				throw new Error("Não foi possível preparar o áudio gerado.");
			}

			const activeProject = editor.project.getActive();
			const asset = await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: processed,
			});
			if (!asset) {
				throw new Error("Não foi possível salvar a narração na biblioteca.");
			}

			setNarrationAssetId(asset.id);
			setNarrationUrl(asset.url ?? URL.createObjectURL(blob));
			setNarrationFileName(fileName);
			toast.success(`Narração gerada com ${selected?.name ?? "Fish Audio"}.`);
		} catch (error) {
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
					Primeiro o roteiro. Depois a voz. Em seguida, a narração entra na timeline.
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
					{script.trim() || "Volte para a aba Roteiro e cole o texto que será narrado."}
				</div>
			</section>

			<section className="mt-3 space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<div className="text-sm font-medium">Gerar narração</div>
						<div className="text-[0.7rem] text-muted-foreground">
							Fish Audio · selecione a voz antes de gerar.
						</div>
					</div>
					<span className="rounded bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
						Fish
					</span>
				</div>

				<label className="block text-xs text-muted-foreground">
					Narrador
					<select
						value={selectedNarratorId}
						onChange={(event) => setSelectedNarratorId(event.target.value)}
						className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
					>
						{FISH_NARRATORS.map((voice) => (
							<option key={voice.id} value={voice.id}>
								{voice.name} · {voice.language.toUpperCase()}
							</option>
						))}
					</select>
				</label>

				<Button
					className="w-full"
					disabled={isGenerating || !script.trim()}
					onClick={generateNarration}
				>
					{isGenerating ? "Gerando narração..." : "🎙️ Gerar narração"}
				</Button>

				{narrationUrl && (
					<div className="space-y-2 rounded-md border bg-background p-2">
						<audio className="w-full" controls preload="metadata" src={narrationUrl} />
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

			<section className="mt-3 rounded-md border bg-card p-3">
				<div className="text-sm font-medium">Fluxo DarkCut</div>
				<div className="mt-2 grid gap-2 text-xs text-muted-foreground">
					<div className="rounded-md border bg-background p-2">1. Roteiro</div>
					<div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-foreground">
						2. Narração
					</div>
					<div className="rounded-md border bg-background p-2">3. Cenas e mídias</div>
					<div className="rounded-md border bg-background p-2">4. Timeline</div>
				</div>
			</section>
		</div>
	);
}
