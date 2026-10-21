import type { SubtitleCue } from "./types";

export type CaptionAnimationMode = "none" | "karaoke" | "karaoke-pop";
export interface KaraokeWord {
	word: string;
	startTime: number;
	duration: number;
}

/**
 * SRT and segment-level Whisper timestamps do not contain word boundaries.
 * These are explicitly ESTIMATED timings, weighted by visible word length.
 * We never present them as measured alignment.
 */
export function estimateKaraokeWords({
	caption,
	maxWords = 160,
}: {
	caption: Pick<SubtitleCue, "text" | "startTime" | "duration">;
	maxWords?: number;
}): KaraokeWord[] {
	if (!Number.isFinite(caption.startTime) || !Number.isFinite(caption.duration) || caption.duration <= 0) return [];
	const words = caption.text.match(/\S+/gu) ?? [];
	if (words.length === 0 || words.length > maxWords) return [];
	const weights = words.map((word) => Math.max(1, [...word].length));
	const total = weights.reduce((sum, value) => sum + value, 0);
	let cumulative = 0;
	return words.map((word, index) => {
		const startTime = caption.startTime + (caption.duration * cumulative) / total;
		cumulative += weights[index];
		const endTime = index === words.length - 1
			? caption.startTime + caption.duration
			: caption.startTime + (caption.duration * cumulative) / total;
		return { word, startTime, duration: Math.max(0, endTime - startTime) };
	});
}
