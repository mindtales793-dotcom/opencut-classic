"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { TracksSnapshotCommand } from "@/commands/timeline/tracks-snapshot";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";
import { generateUUID } from "@/utils/id";
import type { ScalarAnimationKey } from "@/animation/types";
type DSP = {
	memory: WebAssembly.Memory;
	alloc: (n: number) => number;
	release: (p: number, n: number) => void;
	peak_gain: (p: number, n: number) => number;
	loop_duration: (i: number, source: number, total: number) => number;
	music_envelope: (
		p: number,
		n: number,
		duration: number,
		base: number,
		duck: number,
		fade: number,
		out: number,
	) => number;
};
async function dsp() {
	const r = await fetch("/darkcut/audio.wasm");
	if (!r.ok) throw new Error("Motor de áudio indisponível.");
	return (await WebAssembly.instantiate(await r.arrayBuffer())).instance
		.exports as unknown as DSP;
}
export function MusicPanel() {
	const editor = useEditor();
	const [busy, setBusy] = useState(false);
	const [volume, setVolume] = useState(-18),
		[duck, setDuck] = useState(-30),
		[fade, setFade] = useState(0.6);
	const apply = async (loop: boolean) => {
		setBusy(true);
		const scene = editor.scenes.getActiveScene();
		try {
			if (
				![volume, duck, fade].every(Number.isFinite) ||
				volume < -60 ||
				volume > 0 ||
				duck < -60 ||
				duck > volume ||
				fade < 0.05 ||
				fade > 5
			)
				throw new Error(
					"Use volumes entre −60 e 0 dB, voz abaixo da música e fade entre 0,05 e 5 s.",
				);
			const music = scene.tracks.audio.find(
				(t) => t.name === "A2 • Música de fundo",
			);
			const narration = scene.tracks.audio.find(
				(t) => t.name === "A1 • Narração",
			);
			if (!music?.elements.length || !narration?.elements.length)
				throw new Error("Adicione música à A2 e narração à A1 primeiro.");
			const w = await dsp();
			const total = Math.max(
				...narration.elements.map((e) =>
					mediaTimeToSeconds({ time: (e.startTime + e.duration) as MediaTime }),
				),
			);
			let elements = music.elements;
			if (loop) {
				const first = music.elements[0],
					source = mediaTimeToSeconds({ time: first.duration });
				if (source < 0.1 || total / source > 2000)
					throw new Error("Escolha uma música mais longa para repetir.");
				elements = [];
				for (let i = 0; ; i++) {
					const seconds = w.loop_duration(i, source, total);
					if (seconds <= 0) break;
					const duration = mediaTimeFromSeconds({ seconds });
					elements.push({
						...first,
						id: generateUUID(),
						startTime: mediaTimeFromSeconds({ seconds: i * source }),
						duration,
						trimEnd: (first.trimEnd +
							(first.duration - duration) *
								(first.retime?.rate ?? 1)) as MediaTime,
					});
				}
			}
			elements = elements.map((e) => {
				const start = mediaTimeToSeconds({ time: e.startTime }),
					duration = mediaTimeToSeconds({ time: e.duration });
				const voices = narration.elements.flatMap((n) => [
					mediaTimeToSeconds({ time: n.startTime }) - start,
					mediaTimeToSeconds({
						time: (n.startTime + n.duration) as MediaTime,
					}) - start,
				]);
				const ptr = w.alloc(voices.length),
					capacity = 2 * (4 + voices.length * 2),
					out = w.alloc(capacity);
				new Float32Array(w.memory.buffer, ptr, voices.length).set(voices);
				const count = w.music_envelope(
					ptr,
					voices.length / 2,
					duration,
					volume,
					duck,
					fade,
					out,
				);
				const values = new Float32Array(w.memory.buffer, out, count * 2);
				const keys: ScalarAnimationKey[] = Array.from(
					{ length: count },
					(_, i) => ({
						id: generateUUID(),
						time: mediaTimeFromSeconds({ seconds: values[i * 2] }),
						value: values[i * 2 + 1],
						segmentToNext: "linear",
						tangentMode: "auto",
					}),
				);
				w.release(ptr, voices.length);
				w.release(out, capacity);
				return {
					...e,
					params: { ...e.params, volume },
					animations: { ...e.animations, volume: { keys } },
				};
			});
			if (editor.scenes.getActiveScene().tracks !== scene.tracks)
				throw new Error("A timeline mudou. Tente novamente.");
			editor.command.execute({
				command: new TracksSnapshotCommand({
					before: scene.tracks,
					after: {
						...scene.tracks,
						audio: scene.tracks.audio.map((t) =>
							t.id === music.id ? { ...t, elements } : t,
						),
					},
				}),
			});
			toast.success(
				"Música ajustada com fade e redução durante a narração. Ctrl+Z desfaz.",
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha ao ajustar música.");
		} finally {
			setBusy(false);
		}
	};
	const normalize = async () => {
		setBusy(true);
		const scene = editor.scenes.getActiveScene();
		try {
			const voice = scene.tracks.audio.find((t) => t.name === "A1 • Narração");
			if (!voice?.elements.length)
				throw new Error("Adicione a narração à faixa A1.");
			const w = await dsp(),
				context = new AudioContext();
			const gains = new Map<string, number>();
			try {
				for (const e of voice.elements) {
					if (e.sourceType !== "upload")
						throw new Error("Importe o arquivo de narração para normalizar.");
					if (gains.has(e.mediaId)) continue;
					const file = editor.media
						.getAssets()
						.find((a) => a.id === e.mediaId)?.file;
					if (!file || file.size > 400 * 1024 * 1024)
						throw new Error("Arquivo indisponível ou maior que 400 MB.");
					const buffer = await context.decodeAudioData(
						await file.arrayBuffer(),
					);
					let gain = 24;
					for (let c = 0; c < buffer.numberOfChannels; c++) {
						const samples = buffer.getChannelData(c),
							p = w.alloc(samples.length);
						new Float32Array(w.memory.buffer, p, samples.length).set(samples);
						gain = Math.min(gain, w.peak_gain(p, samples.length));
						w.release(p, samples.length);
					}
					gains.set(e.mediaId, gain);
				}
			} finally {
				await context.close();
			}
			if (editor.scenes.getActiveScene().tracks !== scene.tracks)
				throw new Error("A timeline mudou. Tente novamente.");
			editor.command.execute({
				command: new TracksSnapshotCommand({
					before: scene.tracks,
					after: {
						...scene.tracks,
						audio: scene.tracks.audio.map((t) =>
							t.id !== voice.id
								? t
								: {
										...t,
										elements: t.elements.map((e) => ({
											...e,
											params: {
												...e.params,
												volume:
													e.sourceType === "upload"
														? (gains.get(e.mediaId) ?? 0)
														: 0,
											},
											animations: { ...e.animations, volume: undefined },
										})),
									},
						),
					},
				}),
			});
			toast.success("Narração normalizada por pico a −1 dBFS. Ctrl+Z desfaz.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha ao normalizar.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="mt-3 space-y-2 rounded border bg-card p-3 text-xs">
			<h3 className="text-sm font-semibold">Mixagem automática</h3>
			<p>
				Narração na A1, música na A2. Ajusta o volume por keyframes editáveis;
				substitui a automação de volume dessas faixas.
			</p>
			<div className="grid grid-cols-3 gap-2">
				{[
					["Música (dB)", volume, setVolume, -60, 0],
					["Com voz (dB)", duck, setDuck, -60, 0],
					["Fade (s)", fade, setFade, 0.05, 5],
				].map(([label, value, setter, min, max]) => (
					<label key={String(label)}>
						{String(label)}
						<input
							type="number"
							className="mt-1 w-full rounded border bg-background p-2"
							min={min as number}
							max={max as number}
							step={0.1}
							value={value as number}
							onChange={(e) =>
								(setter as (v: number) => void)(Number(e.target.value))
							}
						/>
					</label>
				))}
			</div>
			<Button className="w-full" disabled={busy} onClick={() => apply(false)}>
				Aplicar ducking e fade
			</Button>
			<Button
				variant="secondary"
				className="w-full"
				disabled={busy}
				onClick={() => apply(true)}
			>
				Repetir primeira música até o fim da narração
			</Button>
			<Button
				variant="secondary"
				className="w-full"
				disabled={busy}
				onClick={normalize}
			>
				Normalizar narração (pico −1 dBFS)
			</Button>
		</section>
	);
}
