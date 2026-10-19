"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SoundEffect } from "@/sounds/types";
import { SUNO_DEFAULT_PORT, parseSunoPort, type LocalSunoSong } from "@/darkcut/suno-local";

const STYLES = [
	{ label: "Documentário", prompt: "Cinematic documentary instrumental with thoughtful piano, warm strings, subtle rise, no vocals" },
	{ label: "POV Financeiro", prompt: "Emotional cinematic instrumental: restrained guitar, reflective piano, inspiring ending, no vocals" },
	{ label: "Suspense", prompt: "Subtle documentary suspense underscore, analog textures, soft pulses, no vocals" },
	{ label: "Lo-fi", prompt: "Warm relaxing lo-fi hip hop instrumental, gentle drums, mellow pads, no vocals" },
] as const;

function soundFromSuno(song: LocalSunoSong, port: number): SoundEffect {
	const numericId = -Math.max(1, parseInt(song.id.replaceAll("-", "").slice(0, 12), 16));
	const url = `/api/darkcut/music/suno?action=audio&port=${port}&id=${encodeURIComponent(song.id)}`;
	return {
		id: numericId,
		name: song.title || "Música gerada por IA",
		description: "Música criada em serviço Suno não oficial. Verifique sua licença antes de usar.",
		url: "",
		previewUrl: url,
		downloadUrl: url,
		duration: 0,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: "Suno · geração local",
		tags: ["music", "suno"],
		license: "Verificar termos e direitos da conta Suno",
		created: "",
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	};
}

export function SunoLocalMusicView() {
	const addSoundToTimeline = useSoundsStore((state) => state.addSoundToTimeline);
	const [portText, setPortText] = useState(String(SUNO_DEFAULT_PORT));
	const [prompt, setPrompt] = useState(STYLES[0].prompt);
	const [instrumental, setInstrumental] = useState(true);
	const [songs, setSongs] = useState<LocalSunoSong[]>([]);
	const [credits, setCredits] = useState<number | null>(null);
	const [connected, setConnected] = useState(false);
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(false);
	const [addingId, setAddingId] = useState<string | null>(null);
	const [playingId, setPlayingId] = useState<string | null>(null);
	const [error, setError] = useState("");

	const port = parseSunoPort(portText);
	const base = port === null ? "" : `/api/darkcut/music/suno?port=${port}`;

	useEffect(() => {
		const saved = window.localStorage.getItem("darkcut-suno-local-port");
		if (parseSunoPort(saved) !== null) setPortText(saved!);
	}, []);

	const requestJSON = async (url: string, options?: RequestInit) => {
		const response = await fetch(url, {
			cache: "no-store",
			signal: AbortSignal.timeout(options?.method === "POST" ? 115_000 : 15_000),
			...options,
		});
		const data = await response.json() as Record<string, unknown>;
		if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Serviço Suno local indisponível.");
		return data;
	};

	const refresh = async () => {
		if (!base) {
			setError("Informe uma porta entre 8020 e 8099.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const status = await requestJSON(`${base}&action=status`);
			setConnected(status.connected === true);
			setCredits(typeof status.credits === "number" ? status.credits : null);
			const result = await requestJSON(`${base}&action=list`);
			setSongs(Array.isArray(result.songs) ? result.songs as LocalSunoSong[] : []);
			window.localStorage.setItem("darkcut-suno-local-port", portText);
		} catch (cause) {
			setConnected(false);
			setError(cause instanceof Error ? cause.message : "Serviço indisponível.");
		} finally {
			setLoading(false);
		}
	};

	const generate = async () => {
		if (!base || prompt.trim().length < 5 || prompt.length > 700) {
			setError("Informe uma porta válida e um prompt de 5 a 700 caracteres.");
			return;
		}
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			const result = await requestJSON(base, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: prompt.trim(), instrumental }),
			});
			const generated = Array.isArray(result.songs) ? result.songs as LocalSunoSong[] : [];
			setSongs((current) => {
				const ids = new Set(generated.map((song) => song.id));
				return [...generated, ...current.filter((song) => !ids.has(song.id))];
			});
			toast.success("Pedido concluído. Ouça as faixas disponíveis e confira os créditos.");
			if (port) window.localStorage.setItem("darkcut-suno-local-port", String(port));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Falha ao gerar música.");
			toast.error("Falha ao consultar o gerador. Confira a biblioteca antes de repetir: uma geração pode consumir créditos.");
		} finally {
			setBusy(false);
		}
	};

	const add = async (song: LocalSunoSong) => {
		if (!song.audioReady || !port || addingId) return;
		setAddingId(song.id);
		try {
			await addSoundToTimeline({
				sound: soundFromSuno(song, port),
				trackName: "A2 • Música de fundo",
				volumeDb: -18,
			});
		} finally {
			setAddingId(null);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 text-xs">
			<div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-background to-background p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<h3 className="text-sm font-semibold">Gerar trilha com IA</h3>
						<p className="mt-1 text-muted-foreground">Conector local para Suno-API não oficial · sem enviar cookies ao DarkCut</p>
					</div>
					<span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] ${connected ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
						{connected ? "Conectado" : "Desconectado"}
					</span>
				</div>
				<label className="mt-3 block text-xs">Porta do servidor local (127.0.0.1)
					<input aria-label="Porta Suno local" type="number" min={8020} max={8099} value={portText}
						onChange={(event) => setPortText(event.target.value)}
						className="mt-1 h-9 w-full rounded-md border bg-background px-2" />
				</label>
				<Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={loading || busy}
					onClick={() => void refresh()}>{loading ? "Verificando…" : "Conectar / Atualizar músicas"}</Button>
				{connected && credits !== null && <p className="mt-2 text-muted-foreground">Créditos informados pelo serviço: {credits}</p>}
			</div>

			<div className="rounded-lg border bg-card p-3">
				<label className="block text-xs font-medium" htmlFor="darkcut-suno-prompt">Prompt musical</label>
				<textarea id="darkcut-suno-prompt" aria-label="Descrição da música" value={prompt} maxLength={700}
					onChange={(event) => setPrompt(event.target.value)}
					rows={3}
					className="mt-2 w-full resize-y rounded-md border bg-background p-2 text-xs"
					placeholder="Ex.: Instrumental cinematográfico emocional, piano brasileiro suave…" />
				<div className="mt-2 flex flex-wrap gap-1">
					{STYLES.map((style) => <Button type="button" key={style.label} size="sm" variant="outline" className="h-7 px-2 text-[0.65rem]"
						onClick={() => { setPrompt(style.prompt); setInstrumental(true); }}>{style.label}</Button>)}
				</div>
				<label className="mt-3 flex items-center gap-2 text-xs">
					<input type="checkbox" checked={instrumental} onChange={(event) => setInstrumental(event.target.checked)} />
					Somente instrumental (sem voz)
				</label>
				<Button type="button" className="mt-3 w-full" disabled={busy || !port || !connected || prompt.trim().length < 5}
					onClick={() => void generate()}>{busy ? "Gerando… aguarde o serviço local" : "Gerar música com IA"}</Button>
				<p className="mt-2 leading-relaxed text-muted-foreground">
					A geração pode consumir créditos Suno. A biblioteca de terceiros é antiga e pode falhar. Antes de usar no YouTube, verifique se seu plano permite uso comercial.
				</p>
			</div>

			{error && <div role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700">{error}</div>}

			<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-3">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h4 className="text-sm font-semibold">Minhas músicas geradas</h4>
					<span className="text-muted-foreground">{songs.length} faixas</span>
				</div>
				{songs.length === 0 && <p className="text-muted-foreground">Conecte seu serviço local e atualize para carregar músicas geradas.</p>}
				<div className="space-y-3">
					{songs.map((song) => (
						<div key={song.id} className="rounded-lg border bg-background p-3">
							<div className="flex items-center gap-2">
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{song.title}</p>
									<p className="text-muted-foreground">{song.audioReady ? "Áudio pronto" : `Processando · ${song.status}`}</p>
								</div>
								<Button size="sm" variant="outline" disabled={!song.audioReady || Boolean(addingId)}
									onClick={() => setPlayingId(playingId === song.id ? null : song.id)}>
									{playingId === song.id ? "Fechar" : "Ouvir"}
								</Button>
								<Button size="sm" disabled={!song.audioReady || Boolean(addingId)}
									onClick={() => void add(song)}>
									{addingId === song.id ? "Adicionando…" : "+ Timeline"}
								</Button>
							</div>
							{playingId === song.id && song.audioReady && port && (
								<audio aria-label={`Prévia: ${song.title}`} controls preload="none" className="mt-3 w-full"
									src={`/api/darkcut/music/suno?action=audio&port=${port}&id=${encodeURIComponent(song.id)}`} />
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
