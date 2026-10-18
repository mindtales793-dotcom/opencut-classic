/**
 * DarkCut's native implementation of the uploaded "Roteiro → SRT" separator.
 * The source tool splits at punctuation, splits long passages in halves,
 * merges small phrases and estimates timing at 0.4 seconds per word.
 *
 * This creates EDITORIAL scene timing, not speech-aligned transcription.
 */
export type ScriptSrtOptions = {
	maxWords?: number;
	minWords?: number;
	secondsPerWord?: number;
	startSeconds?: number;
	/** Optional total narration length: adjusts the full set of blocks proportionally. */
	targetDurationSeconds?: number;
};

export type ScriptSrtCue = {
	index: number;
	text: string;
	wordCount: number;
	startSeconds: number;
	endSeconds: number;
};

export type ScriptSrtResult = {
	srt: string;
	cues: ScriptSrtCue[];
	totalWords: number;
	durationSeconds: number;
	narrationAdjusted: boolean;
};

function countWords(value: string): number {
	return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function splitIntoHalves(words: string[], maxWords: number): string[] {
	if (words.length <= maxWords) return [words.join(" ")];
	const half = Math.ceil(words.length / 2);
	return [
		...splitIntoHalves(words.slice(0, half), maxWords),
		...splitIntoHalves(words.slice(half), maxWords),
	];
}

function tokenizeSentences(source: string) {
	const text = source.replace(/\r\n?/g, "\n");
	// Match the supplied separator's punctuation boundaries. Avoid splitting
	// numbers such as 12.000 or 3,5 when they are car prices or amounts.
	const parts = text.split(/([.,!?]+)/);
	const segments: string[] = [];
	let current = "";
	for (let i = 0; i < parts.length; i += 1) {
		const part = parts[i];
		if (/^[.,!?]+$/.test(part)) {
			const previous = current.at(-1) ?? "";
			const next = parts[i + 1]?.[0] ?? "";
			if (/^[.,]+$/.test(part) && /\d/.test(previous) && /\d/.test(next)) {
				current += part;
			} else {
				current += part;
				if (current.trim()) segments.push(current.trim());
				current = "";
			}
		} else {
			current += part;
		}
	}
	if (current.trim()) segments.push(current.trim());
	return segments;
}

/** Identical scene-count strategy to the HTML tool, with number-safe punctuation. */
export function splitRoteiroIntoSrtBlocks(
	source: string,
	{ maxWords = 20, minWords = 7 }: Pick<ScriptSrtOptions, "maxWords" | "minWords"> = {},
): string[] {
	const limit = Math.max(1, Math.min(100, Math.floor(maxWords) || 20));
	const minimum = Math.max(1, Math.min(limit, Math.floor(minWords) || 7));
	const initial: string[] = [];
	for (const segment of tokenizeSentences(source)) {
		const words = segment.split(/\s+/).filter(Boolean);
		if (!words.length) continue;
		initial.push(...splitIntoHalves(words, limit));
	}
	const merged: string[] = [];
	let pending = "";
	for (let i = 0; i < initial.length; i += 1) {
		const combined = pending ? pending + " " + initial[i] : initial[i];
		if (countWords(combined) < minimum && i < initial.length - 1) {
			pending = combined;
		} else {
			merged.push(combined.trim());
			pending = "";
		}
	}
	if (pending) {
		if (merged.length) merged[merged.length - 1] += " " + pending;
		else merged.push(pending);
	}
	// Second pass from the HTML separator: re-split combined oversized blocks.
	return merged
		.flatMap((block) => splitIntoHalves(block.trim().split(/\s+/).filter(Boolean), limit))
		.filter(Boolean);
}

export function toValidSrtTimestamp(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(total / 3600000);
	const minutes = Math.floor((total % 3600000) / 60000);
	const seconds = Math.floor((total % 60000) / 1000);
	const ms = total % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function generateScriptSrt(
	source: string,
	{
		maxWords = 20,
		minWords = 7,
		secondsPerWord = 0.4,
		startSeconds = 0,
		targetDurationSeconds,
	}: ScriptSrtOptions = {},
): ScriptSrtResult {
	const blocks = splitRoteiroIntoSrtBlocks(source, { maxWords, minWords });
	const totalWords = blocks.reduce((sum, block) => sum + countWords(block), 0);
	const empty: ScriptSrtResult = {
		srt: "", cues: [], totalWords: 0, durationSeconds: 0, narrationAdjusted: false,
	};
	if (!blocks.length || !totalWords) return empty;

	const rate = Number.isFinite(secondsPerWord) && secondsPerWord > 0
		? Math.min(2, secondsPerWord)
		: 0.4;
	const startMs = Math.round(Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0) * 1000);
	const adjusted =
		typeof targetDurationSeconds === "number" &&
		Number.isFinite(targetDurationSeconds) &&
		targetDurationSeconds > blocks.length * 0.001;
	const durationMs = adjusted
		? Math.round(targetDurationSeconds * 1000)
		: Math.round(totalWords * rate * 1000);
	let cumulative = 0;
	let cursor = startMs;
	const cues = blocks.map((text, index) => {
		const wordCount = countWords(text);
		cumulative += wordCount;
		const endMs = index === blocks.length - 1
			? startMs + durationMs
			: startMs + Math.round((cumulative / totalWords) * durationMs);
		const cue: ScriptSrtCue = {
			index: index + 1,
			text,
			wordCount,
			startSeconds: cursor / 1000,
			endSeconds: endMs / 1000,
		};
		cursor = endMs;
		return cue;
	});
	const srt = cues.map(({ index, text, startSeconds, endSeconds }) =>
		`${index}\n${toValidSrtTimestamp(startSeconds * 1000)} --> ${toValidSrtTimestamp(endSeconds * 1000)}\n${text}\n`,
	).join("\n");
	return {
		srt,
		cues,
		totalWords,
		durationSeconds: durationMs / 1000,
		narrationAdjusted: adjusted,
	};
}
