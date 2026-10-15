import { Command, createElementSelectionResult } from "@/commands/base-command";
import { SplitElementsCommand } from "@/commands/timeline/element/split-elements";
import { DeleteElementsCommand } from "@/commands/timeline/element/delete-elements";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import type { EditorCore } from "@/core";
import type { TScene, SceneTracks } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";

export type SilenceCut = [number, number];
export type AudioCore = {
	edit_action: (
		start: number,
		duration: number,
		a: number,
		b: number,
	) => number;
	shifted_time: (time: number, a: number, b: number) => number;
};
export async function loadAudioCore(): Promise<AudioCore> {
	const response = await fetch("/darkcut/audio.wasm");
	if (!response.ok) throw new Error("Motor de áudio indisponível.");
	return (await WebAssembly.instantiate(await response.arrayBuffer())).instance
		.exports as unknown as AudioCore;
}

export async function analyzeSilence(
	file: File,
	options: {
		db: number;
		minimum: number;
		padding: number;
		trim: number;
		duration: number;
		rate: number;
	},
	signal: AbortSignal,
): Promise<SilenceCut[]> {
	if (
		![options.db, options.minimum, options.padding, options.rate].every(
			Number.isFinite,
		) ||
		options.db < -80 ||
		options.db > -10 ||
		options.minimum < 0.1 ||
		options.minimum > 5 ||
		options.padding < 0 ||
		options.padding > 0.5 ||
		options.rate <= 0
	)
		throw new Error("Ajustes de silêncio inválidos.");
	if (file.size > 400 * 1024 * 1024)
		throw new Error("Divida áudios maiores que 400 MB antes de analisar.");
	signal.throwIfAborted();
	const context = new AudioContext({ sampleRate: 16000 });
	let buffer: AudioBuffer;
	try {
		buffer = await context.decodeAudioData(await file.arrayBuffer());
	} finally {
		await context.close();
	}
	signal.throwIfAborted();
	const start = Math.round(options.trim * buffer.sampleRate);
	const end = Math.min(
		buffer.length,
		start + Math.round(options.duration * options.rate * buffer.sampleRate),
	);
	if (end <= start) throw new Error("O trecho de áudio está vazio.");
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i).slice(start, end),
	);
	return new Promise((resolve, reject) => {
		const worker = new Worker("/darkcut/silence-worker.js");
		const stop = () => {
			worker.terminate();
			signal.removeEventListener("abort", abort);
		};
		const abort = () => {
			stop();
			reject(new DOMException("Análise cancelada", "AbortError"));
		};
		signal.addEventListener("abort", abort, { once: true });
		worker.onerror = () => {
			stop();
			reject(new Error("Falha no motor de áudio."));
		};
		worker.onmessage = ({
			data,
		}: {
			data: { cuts?: SilenceCut[]; error?: string };
		}) => {
			stop();
			if (data.error) reject(new Error(data.error));
			else
				resolve(
					(data.cuts ?? []).map(([a, b]) => [
						a / options.rate,
						b / options.rate,
					]),
				);
		};
		worker.postMessage(
			{
				channels,
				rate: buffer.sampleRate,
				db: options.db,
				minimum: options.minimum * options.rate,
				padding: options.padding * options.rate,
			},
			channels.map((c) => c.buffer),
		);
	});
}

export function findMainTrackGaps(
	scene: TScene,
	minimumGapSeconds = 0.03,
): SilenceCut[] {
	const elements = [...scene.tracks.main.elements].sort(
		(a, b) => a.startTime - b.startTime,
	);
	if (elements.length === 0) return [];

	const cuts: SilenceCut[] = [];
	let cursor = 0 as MediaTime;

	for (const element of elements) {
		if (element.startTime > cursor) {
			const start = mediaTimeToSeconds({ time: cursor });
			const end = mediaTimeToSeconds({ time: element.startTime });
			if (end - start >= minimumGapSeconds) {
				cuts.push([start, end]);
			}
		}

		const elementEnd = (element.startTime + element.duration) as MediaTime;
		if (elementEnd > cursor) cursor = elementEnd;
	}

	return cuts;
}

const allTracks = (tracks: SceneTracks) => [
	...tracks.overlay,
	tracks.main,
	...tracks.audio,
];
// Platform adapter: compose the editor's existing split/delete/move commands.
// Rust decides which fragments to remove and how times move.
export class ApplySilenceCuts extends Command {
	private after: TScene | null = null;
	constructor(
		private editor: EditorCore,
		private before: TScene,
		private cuts: SilenceCut[],
		private core: AudioCore,
	) {
		super();
	}
	private restore(scene: TScene) {
		this.editor.scenes.setScenes({
			scenes: this.editor.scenes
				.getScenes()
				.map((s) => (s.id === scene.id ? scene : s)),
		});
		this.editor.timeline.updateTracks(scene.tracks);
	}
	execute() {
		if (this.after) {
			this.restore(this.after);
			return createElementSelectionResult([]);
		}
		const active = this.editor.scenes.getActiveScene();
		if (
			active.id !== this.before.id ||
			active.tracks !== this.before.tracks ||
			active.bookmarks !== this.before.bookmarks
		)
			throw new Error("A timeline mudou. Analise novamente antes de aplicar.");
		try {
			let bookmarks = this.before.bookmarks;
			for (const [start, end] of [...this.cuts].reverse()) {
				const a = mediaTimeFromSeconds({ seconds: start }),
					b = mediaTimeFromSeconds({ seconds: end });
				for (const splitTime of [b, a]) {
					const elements = allTracks(
						this.editor.scenes.getActiveScene().tracks,
					).flatMap((t) =>
						t.elements.map((e) => ({ trackId: t.id, elementId: e.id })),
					);
					new SplitElementsCommand({ elements, splitTime }).execute();
				}
				const elements: { trackId: string; elementId: string }[] = [];
				const updates: {
					trackId: string;
					elementId: string;
					patch: { startTime: MediaTime };
				}[] = [];
				for (const t of allTracks(this.editor.scenes.getActiveScene().tracks))
					for (const e of t.elements) {
						const action = this.core.edit_action(e.startTime, e.duration, a, b);
						if (action === 1) elements.push({ trackId: t.id, elementId: e.id });
						if (action === 2)
							updates.push({
								trackId: t.id,
								elementId: e.id,
								patch: {
									startTime: this.core.shifted_time(
										e.startTime,
										a,
										b,
									) as MediaTime,
								},
							});
					}
				new DeleteElementsCommand({ elements }).execute();
				new UpdateElementsCommand({ updates }).execute();
				bookmarks = bookmarks.map((m) => ({
					...m,
					time: this.core.shifted_time(m.time, a, b) as MediaTime,
					...(m.duration !== undefined
						? {
								duration: (this.core.shifted_time(m.time + m.duration, a, b) -
									this.core.shifted_time(m.time, a, b)) as MediaTime,
							}
						: {}),
				}));
			}
			this.after = { ...this.editor.scenes.getActiveScene(), bookmarks };
			this.restore(this.after);
			return createElementSelectionResult([]);
		} catch (error) {
			this.restore(this.before);
			throw error;
		}
	}
	undo() {
		this.restore(this.before);
	}
}
