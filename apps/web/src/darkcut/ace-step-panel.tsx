"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SoundEffect } from "@/sounds/types";

type TaskState = "idle" | "processing" | "ready" | "failed";

const SUGGESTIONS = [
	{ label: "Documentário", prompt: "Cinematic ambient documentary instrumental, intimate warm piano, soft strings, slow evolving pads, subtle tension, calm pacing, understated arrangement for voiceover" },
	{ label: "POV financeiro", prompt: "Emotional hopeful cinematic instrumental, subtle acoustic piano and clean guitars, gradual inspiring build, no dramatic peaks, ideal for Brazilian personal finance storytelling voiceover" },
	{ label: "Suspense", prompt: "Dark investigative instrumental underscore, low synth pulses, controlled tension, sparse percussion, subtle suspense, cinematic documentary background music" },
	{ label: "Lo-fi", prompt: "Gentle lo-fi instrumental music, soft mellow electric piano, subtle vinyl atmosphere, warm bass, minimal relaxing drum groove, no prominent melody" },
] as const;

const ENDPOINT = "/api/darkcut/music/ace-step";
const audioUrl = (taskId: string) => `${ENDPOINT}?action=audio&taskId=${encodeURIComponent(taskId)}`;

export function AceStepPanel() {
	const [available, setAvailable] = useState<boolean | null>(null);
	const [prompt, setPrompt] = useState<string>(SUGGESTIONS[0].prompt);
	const [duration, setDuration] = useState(60);
	const [taskId, setTaskId] = useState<string | null>(null);
	const [taskState, setTaskState] = useState<TaskState>("idle");
	const [busy, setBusy] = useState(false);
	const addSoundToTimeline = useSoundsStore((state) => state.addSoundToTimeline);

	const checkServer = async () => {
		try {
			const response = await fetch(ENDPOINT, { cache: "no-store" });
			const data = (await response.json()) as { connected?: boolean };
			setAvailable(Boolean(response.ok && data.connected));
		} catch { setAvailable(false); }
	};
	useEffect(() => { void checkServer(); }, []);

	useEffect(() => {
		if (!taskId || taskState !== "processing") return;
		let active = true;
		let running = false;
		const check = async () => {
			if (running) return;
			running = true;
			try {
				const response = await fetch(`${ENDPOINT}?action=result&taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
				if (!response.ok) return;
				const data = (await response.json()) as { status?: TaskState; ready?: boolean };
				if (!active) return;
				if (data.status === "failed") {
					setTaskState("failed");
					toast.error("O ACE-Step não conseguiu gerar a trilha.");
				} else if (data.ready && data.status === "ready") {
					setTaskState("ready");
					toast.success("Trilha instrumental gerada. Você já pode ouvir ou adicionar à timeline.");
				}
			} catch {
				// ACE-Step may be temporarily unavailable while the model loads; retry.
			} finally { running = false; }
		};
		void check();
		const interval = window.setInterval(() => { if (active) void check(); }, 4000);
		return () => { active = false; window.clearInterval(interval); };
	}, [taskId, taskState]);

	const generate = async () => {
		if (busy || taskState === "processing") return;
		setBusy(true);
		try {
			const response = await fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt, duration }),
			});
			const data = (await response.json()) as { taskId?: string; error?: string };
			if (!response.ok || !data.taskId) throw new Error(data.error || "Falha na geração.");
			setTaskId(data.taskId);
			setTaskState("processing");
			toast.message("Geração iniciada. A música será processada no seu computador.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Falha ao gerar música.");
		} finally { setBusy(false); }
	};

	const addToTimeline = async () => {
		if (!taskId || taskState !== "ready") return;
		setBusy(true);
		try {
			const sound: SoundEffect = {
				id: Number.parseInt(taskId.replace(/[^0-9a-f]/gi, "").slice(0, 9) || "1", 16),
				name: "Trilha IA - " + prompt.trim().slice(0, 44),
				description: prompt,
				url: "",
				previewUrl: audioUrl(taskId),
				downloadUrl: audioUrl(taskId),
				duration,
				filesize: 0,
				type: "audio",
				channels: 0,
				bitrate: 0,
				bitdepth: 0,
				samplerate: 0,
				username: "ACE-Step 1.5 local",
				tags: ["music", "ai"],
				license: "IA gerada localmente; confira originalidade antes de publicar.",
				created: new Date().toISOString(),
				downloads: 0,
				rating: 0,
				ratingCount: 0,
			};
			await addSoundToTimeline({ sound, trackName: "A2 • Música de fundo", volumeDb: -19 });
		} finally { setBusy(false); }
	};

	return (
		<section className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-5 text-xs">
			<div>
				<h3 className="text-sm font-semibold">Gerar trilha musical com IA · ACE-Step 1.5</h3>
				<p className="mt-1 text-muted-foreground">Crie música instrumental localmente, sem API paga. A narração continua independente na faixa A1.</p>
			</div>
			<div className="flex items-center justify-between rounded border p-2">
				<span>{available === null ? "Verificando servidor…" : available ? "Servidor local conectado (porta 8001)" : "ACE-Step ainda não conectado"}</span>
				<Button variant="outline" size="sm" onClick={() => void checkServer()}>Verificar</Button>
			</div>
			{available === false && (
				<p className="rounded border p-3 text-muted-foreground">
					Instale o ACE-Step 1.5 separadamente e execute <code>start_api_server.bat</code> no Windows. Ele baixa os modelos na primeira execução. O DarkCut se conecta em <code>127.0.0.1:8001</code>, sem precisar de API na nuvem.
				</p>
			)}
			<div>
				<p className="mb-2 font-medium">Estilo da trilha</p>
				<div className="flex flex-wrap gap-1.5">
					{SUGGESTIONS.map(({ label, prompt: suggested }) => (
						<Button key={label} size="sm" variant="outline" onClick={() => setPrompt(suggested)}>{label}</Button>
					))}
				</div>
			</div>
			<label className="flex flex-col gap-1">
				Descrição instrumental
				<textarea aria-label="Descrição da trilha ACE-Step" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1500} rows={5} className="w-full resize-y rounded border bg-background p-2" />
			</label>
			<label className="flex flex-col gap-1">
				Duração da música
				<select aria-label="Duração ACE-Step" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="w-full rounded border bg-background p-2">
					<option value={30}>30 segundos</option>
					<option value={60}>1 minuto</option>
					<option value={120}>2 minutos</option>
					<option value={180}>3 minutos</option>
					<option value={300}>5 minutos</option>
					<option value={600}>10 minutos</option>
				</select>
			</label>
			<Button onClick={() => void generate()} disabled={!available || busy || taskState === "processing" || prompt.trim().length < 3}>
				{taskState === "processing" ? "Gerando no computador…" : "Gerar trilha instrumental"}
			</Button>
			{taskState === "processing" && <p role="status" className="text-muted-foreground">O modelo está processando a música. Isso pode levar alguns minutos, dependendo da GPU.</p>}
			{taskState === "failed" && <p className="text-destructive">Geração falhou. Confira o terminal do ACE-Step e tente novamente.</p>}
			{taskState === "ready" && taskId && (
				<div className="space-y-2 rounded border p-3">
					<p className="font-semibold">Trilha gerada</p>
					<audio className="w-full" controls src={audioUrl(taskId)} preload="none" />
					<Button className="w-full" disabled={busy} onClick={() => void addToTimeline()}>Adicionar à faixa A2 da timeline</Button>
					<a className="block text-center underline" href={audioUrl(taskId)} download={`trilha-ace-step-${taskId}.mp3`}>Baixar música MP3</a>
				</div>
			)}
			<p className="text-muted-foreground">O projeto ACE-Step usa código aberto, mas nenhuma IA garante músicas livres de semelhança com obras protegidas. Ouça e revise o resultado antes de publicar no YouTube. Exige espaço em disco e GPU/CPU compatível.</p>
		</section>
	);
}
