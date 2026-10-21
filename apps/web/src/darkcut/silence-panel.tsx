"use client";
import { processMediaAssets } from "@/media/processing";
import { addNarrationAssetToTimeline } from "@/components/editor/panels/assets/darkcut-automation";
import { useDarkCutTasks } from "./tasks";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeToSeconds } from "@/wasm";
import type { TScene } from "@/timeline";
import {
	analyzeSilence,
	ApplySilenceCuts,
	findMainTrackGaps,
	loadAudioCore,
	type SilenceCut,
} from "./silence";

export function SilencePanel() {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const assets = useEditor((e) => e.media.getAssets());
	const clips =
		scene?.tracks.audio.flatMap((t) =>
			t.elements
				.filter((e) => e.sourceType === "upload")
				.map((e) => ({ track: t, element: e })),
		) ?? [];
	const [selected, setSelected] = useState("");
	const chosen = clips.find((c) => c.element.id === selected) ?? clips[0];
	const [db, setDb] = useState(-35),
		[minimum, setMinimum] = useState(0.45),
		[padding, setPadding] = useState(0.08);
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState<{
		scene: TScene;
		cuts: SilenceCut[];
		duration: number;
	} | null>(null);
	const controller = useRef<AbortController | null>(null);
	useEffect(() => () => controller.current?.abort(), []);
	const importAudio = async (file: File) => {
		setBusy(true);
		const projectId = editor.project.getActive().metadata.id;
		try {
			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed || processed.type !== "audio")
				throw new Error("Escolha um arquivo de áudio.");
			if (editor.project.getActive().metadata.id !== projectId)
				throw new Error("O projeto mudou. Importe novamente.");
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: processed,
			});
			if (!asset) throw new Error("Não foi possível importar o áudio.");
			addNarrationAssetToTimeline({ mediaId: asset.id, editor });
			setPreview(null);
			toast.success("Áudio adicionado à faixa de narração.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha ao importar áudio.");
		} finally {
			setBusy(false);
		}
	};
	const analyze = async () => {
		if (!chosen || !scene) {
			toast.error("Adicione a narração à timeline primeiro.");
			return;
		}
		const clip = chosen.element;
		const asset = assets.find(
			(a) => clip.sourceType === "upload" && a.id === clip.mediaId,
		);
		if (!asset?.file) {
			toast.error("Arquivo de áudio não disponível. Importe-o novamente.");
			return;
		}
		const projectId = editor.project.getActive().metadata.id;
		const task = (status: "running" | "done" | "error" | "paused") =>
			useDarkCutTasks
				.getState()
				.set("silence", { projectId, label: "Silêncios", tab: "sync", status });
		task("running");
		const abort = new AbortController();
		controller.current = abort;
		setBusy(true);
		setPreview(null);
		try {
			const duration = mediaTimeToSeconds({ time: clip.duration });
			const cuts = await analyzeSilence(
				asset.file,
				{
					db,
					minimum,
					padding,
					trim: mediaTimeToSeconds({ time: clip.trimStart }),
					duration,
					rate: clip.retime?.rate ?? 1,
				},
				abort.signal,
			);
			const offset = mediaTimeToSeconds({ time: clip.startTime });
			task("done");
			setPreview({
				scene,
				cuts: cuts.map(([a, b]) => [
					offset + a,
					offset + Math.min(b, duration),
				]),
				duration,
			});
			if (!cuts.length)
				toast.info("Nenhuma pausa longa encontrada com estes ajustes.");
		} catch (error) {
			task(abort.signal.aborted ? "paused" : "error");
			if (!abort.signal.aborted)
				toast.error(
					error instanceof Error ? error.message : "Não foi possível analisar.",
				);
		} finally {
			setBusy(false);
		}
	};
	const removeTimelineSpaces = async () => {
		if (!scene) {
			toast.error("Abra uma timeline primeiro.");
			return;
		}
		const gaps = findMainTrackGaps(scene);
		if (!gaps.length) {
			toast.info("Não encontrei espaços vazios entre os clipes da V1.");
			return;
		}

		setBusy(true);
		try {
			const core = await loadAudioCore();
			editor.playback.pause();
			editor.command.execute({
				command: new ApplySilenceCuts(editor, scene, gaps, core),
			});
			const removedSeconds = gaps.reduce((sum, [a, b]) => sum + (b - a), 0);
			setPreview(null);
			toast.success(
				`${gaps.length} espaço(s) removido(s) da timeline.`,
				{
					description: `${removedSeconds.toFixed(
						2,
					)}s fechados em todas as faixas. Ctrl+Z desfaz tudo.`,
				},
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao remover espaços da timeline.",
			);
		} finally {
			setBusy(false);
		}
	};

	const apply = async () => {
		if (!preview?.cuts.length) return;
		setBusy(true);
		try {
			const core = await loadAudioCore();
			editor.playback.pause();
			// This command already ripples every lane, independently of the toolbar mode.
			const previousRipple = editor.command.isRippleEnabled;
			try {
				editor.command.isRippleEnabled = false;
				editor.command.execute({
					command: new ApplySilenceCuts(
						editor,
						preview.scene,
						preview.cuts,
						core,
					),
				});
			} finally {
				editor.command.isRippleEnabled = previousRipple;
			}
			setPreview(null);
			toast.success("Silêncios removidos. Ctrl+Z desfaz todos os cortes.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao aplicar os cortes.",
			);
		} finally {
			setBusy(false);
		}
	};
	const removed = preview?.cuts.reduce((sum, [a, b]) => sum + b - a, 0) ?? 0;
	const stale =
		preview &&
		(preview.scene.id !== scene?.id ||
			preview.scene.tracks !== scene?.tracks ||
			preview.scene.bookmarks !== scene?.bookmarks);
	return (
		<section className="mt-3 space-y-3 rounded-md border bg-card p-3">
			<h3 className="text-sm font-semibold">✂ Remover silêncios</h3>
			<p className="text-xs text-muted-foreground">
				Analisa a narração no seu computador. Os cortes encurtam todas as faixas
				juntas, incluindo vídeos, músicas e legendas. O arquivo original é
				preservado.
			</p>
			<label className="block text-xs">
				Importar narração do computador
				<input
					aria-label="Importar narração"
					type="file"
					accept="audio/*"
					disabled={busy}
					className="mt-1 w-full"
					onChange={(e) => {
						const f = e.target.files?.[0];
						e.target.value = "";
						if (f) void importAudio(f);
					}}
				/>
			</label>
			<label className="block text-xs">
				Narração na timeline
				<select
					aria-label="Narração para remover silêncios"
					className="mt-1 w-full rounded border bg-background p-2"
					value={chosen?.element.id ?? ""}
					disabled={busy}
					onChange={(e) => {
						setSelected(e.target.value);
						setPreview(null);
					}}
				>
					{!clips.length && (
						<option value="">Adicione um áudio à timeline</option>
					)}
					{clips.map((c) => (
						<option key={c.element.id} value={c.element.id}>
							{c.track.name} — {c.element.name}
						</option>
					))}
				</select>
			</label>
			<div className="grid grid-cols-3 gap-2 text-xs">
				<label>
					Limiar (dB)
					<input
						aria-label="Limiar de silêncio"
						className="mt-1 w-full rounded border bg-background p-2"
						type="number"
						min={-80}
						max={-10}
						value={db}
						disabled={busy}
						onChange={(e) => {
							setDb(Number(e.target.value));
							setPreview(null);
						}}
					/>
				</label>
				<label>
					Pausa mínima (s)
					<input
						aria-label="Pausa mínima"
						className="mt-1 w-full rounded border bg-background p-2"
						type="number"
						min={0.1}
						max={5}
						step={0.05}
						value={minimum}
						disabled={busy}
						onChange={(e) => {
							setMinimum(Number(e.target.value));
							setPreview(null);
						}}
					/>
				</label>
				<label>
					Margem (s)
					<input
						aria-label="Margem de fala"
						className="mt-1 w-full rounded border bg-background p-2"
						type="number"
						min={0}
						max={0.5}
						step={0.01}
						value={padding}
						disabled={busy}
						onChange={(e) => {
							setPadding(Number(e.target.value));
							setPreview(null);
						}}
					/>
				</label>
			</div>
			<p className="text-xs text-muted-foreground">
				A margem preserva o início e o fim das palavras. Para preservar vozes
				baixas, reduza o limiar (ex.: −45 dB).
			</p>
			<Button className="w-full" disabled={busy || !chosen} onClick={analyze}>
				{busy ? "Processando áudio…" : "Analisar silêncios"}
			</Button>
			<Button
				variant="outline"
				className="w-full"
				disabled={busy || !scene}
				onClick={removeTimelineSpaces}
				title="Fecha os espaços vazios entre os clipes da faixa V1 e mantém todas as outras faixas sincronizadas"
			>
				🧲 Remover espaços vazios da timeline
			</Button>
			<p className="text-[0.68rem] text-muted-foreground">
				Usa a faixa V1 como referência e fecha os buracos em todas as faixas ao
				mesmo tempo, mantendo narração, música, efeitos e legendas alinhados.
			</p>
			{busy && (
				<Button variant="secondary" onClick={() => controller.current?.abort()}>
					Cancelar análise
				</Button>
			)}
			{preview && (
				<div className="space-y-2 text-xs" aria-live="polite">
					<p>
						{preview.cuts.length} pausas • {removed.toFixed(2)} s removidos
					</p>
					<p>
						Narração: {preview.duration.toFixed(2)} s →{" "}
						{(preview.duration - removed).toFixed(2)} s
					</p>
					<details>
						<summary>Conferir trechos na timeline</summary>
						<ol className="max-h-32 overflow-auto">
							{preview.cuts.map(([a, b], i) => (
								<li key={i}>
									{a.toFixed(2)} s → {b.toFixed(2)} s
								</li>
							))}
						</ol>
					</details>
					{stale && <p>A timeline mudou. Analise novamente.</p>}
					<Button
						className="w-full"
						disabled={busy || !preview.cuts.length || !!stale}
						onClick={apply}
					>
						Aplicar cortes em todas as faixas
					</Button>
					<p>Desfazer: Ctrl+Z. Refazer: Ctrl+Shift+Z.</p>
				</div>
			)}
		</section>
	);
}
