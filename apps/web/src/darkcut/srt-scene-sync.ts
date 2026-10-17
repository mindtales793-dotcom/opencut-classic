/**
 * Pure SRT timing analysis for the DarkCut scene synchronizer.
 * This file does not modify the editor; the user reviews the plan first.
 */
export type SrtSceneCue = {
	index: number;
	startSeconds: number;
	endSeconds: number;
	text: string;
};

export type SrtTimingGroup = {
	firstCue: number;
	lastCue: number;
	cueCount: number;
	startSeconds: number;
	endSeconds: number;
	text: string;
};

export type SrtSyncStrategy = "one-per-cue" | "fit-to-media";

export type SrtTimingAnalysis = {
	cues: SrtSceneCue[];
	invalidBlocks: number;
	nonStandardTimestamps: number;
	gaps: number;
	overlaps: number;
	durationSeconds: number;
};

function readTimestamp(source: string) {
	const match = source.trim().match(/^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{1,4})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const fraction = match[4];
	// Some generators emit 1000 for exactly one second of milliseconds.
	const milliseconds =
		fraction.length <= 3 ? Number(fraction.padEnd(3, "0")) : Number(fraction);
	return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function analyzeSceneSrt(source: string): SrtTimingAnalysis {
	const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
	const result: SrtTimingAnalysis = {
		cues: [],
		invalidBlocks: 0,
		nonStandardTimestamps: 0,
		gaps: 0,
		overlaps: 0,
		durationSeconds: 0,
	};
	if (!normalized) return result;

	const timePattern =
		/^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,4})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,4})(?:\s+.*)?$/;

	for (const block of normalized.split(/\n\s*\n/)) {
		const lines = block.split("\n");
		const timingLine = lines.findIndex((line) => line.includes("-->"));
		if (timingLine < 0) {
			result.invalidBlocks += 1;
			continue;
		}
		const match = lines[timingLine].match(timePattern);
		const from = match ? readTimestamp(match[1]) : null;
		const to = match ? readTimestamp(match[2]) : null;
		if (from === null || to === null || to <= from || from < 0) {
			result.invalidBlocks += 1;
			continue;
		}
		if (match && (
			match[1].split(/[,.]/)[1].length === 4 ||
			match[2].split(/[,.]/)[1].length === 4
		)) {
			result.nonStandardTimestamps += 1;
		}
		const rawIndex = timingLine > 0 ? Number(lines[timingLine - 1].trim()) : NaN;
		const index = Number.isInteger(rawIndex) && rawIndex > 0
			? rawIndex
			: result.cues.length + 1;
		result.cues.push({
			index,
			startSeconds: from,
			endSeconds: to,
			text: lines.slice(timingLine + 1).join(" ").replace(/<[^>]*>/g, "")
				.replace(/\s+/g, " ").trim(),
		});
	}

	result.cues.sort((a, b) => a.startSeconds - b.startSeconds || a.index - b.index);
	result.durationSeconds = result.cues.at(-1)?.endSeconds ?? 0;

	for (let i = 1; i < result.cues.length; i += 1) {
		const distance = result.cues[i].startSeconds - result.cues[i - 1].endSeconds;
		if (distance > 0.025) result.gaps += 1;
		if (distance < -0.025) result.overlaps += 1;
	}
	return result;
}

/** One visual for each cue, or fewer visuals covering contiguous cue groups. */
export function makeSrtTimingGroups({
	cues,
	visualCount,
	strategy,
}: {
	cues: readonly SrtSceneCue[];
	visualCount: number;
	strategy: SrtSyncStrategy;
}): SrtTimingGroup[] {
	if (visualCount <= 0 || !cues.length) return [];
	const count = Math.min(Math.floor(visualCount), cues.length);
	const group = (startIndex: number, endIndex: number): SrtTimingGroup => ({
		firstCue: cues[startIndex].index,
		lastCue: cues[endIndex].index,
		cueCount: endIndex - startIndex + 1,
		startSeconds: cues[startIndex].startSeconds,
		endSeconds: cues[endIndex].endSeconds,
		text: cues.slice(startIndex, endIndex + 1).map((cue) => cue.text).filter(Boolean).join(" "),
	});

	if (strategy === "one-per-cue" || count >= cues.length) {
		return cues.slice(0, count).map((_, i) => group(i, i));
	}

	// Divide by actual durations rather than just cue count: a long phrase
	// will not be forced into the same tiny visual span as a short phrase.
	const first = cues[0].startSeconds;
	const total = cues[cues.length - 1].endSeconds - first;
	const result: SrtTimingGroup[] = [];
	let cursor = 0;
	for (let i = 0; i < count; i += 1) {
		const remaining = count - i - 1;
		const maxExclusive = cues.length - remaining;
		let endExclusive = cursor + 1;
		if (remaining) {
			const target = first + (total * (i + 1)) / count;
			while (
				endExclusive + 1 < maxExclusive &&
				Math.abs(cues[endExclusive + 1].startSeconds - target) <
					Math.abs(cues[endExclusive].startSeconds - target)
			) {
				endExclusive += 1;
			}
		} else {
			endExclusive = cues.length;
		}
		result.push(group(cursor, endExclusive - 1));
		cursor = endExclusive;
	}
	return result;
}

/** Recognizes deliberate numbered assets, never numbers such as 'HB20'. */
export function sceneNumberFromName(name: string): number | null {
	const match = name.trim().match(
		/(?:^|[\\/\s_-])(?:cena|scene|imagem|image|frame|prompt|shot)[\s_#-]*(\d{1,5})(?=\D|$)|^(\d{1,5})(?=\.[\w]{2,5}$|$)/i,
	);
	if (!match) return null;
	const index = Number(match[1] ?? match[2]);
	return index > 0 ? index : null;
}
