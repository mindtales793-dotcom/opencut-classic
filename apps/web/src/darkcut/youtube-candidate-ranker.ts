import { scoreMediaCandidate } from "@/darkcut/media-search-intelligence";

export type YouTubeSearchCandidate = {
	id: string;
	title: string;
	channel: string;
	thumbnailUrl?: string;
	durationSeconds?: number;
	embeddable?: boolean;
};

/** The public YouTube videos.list API returns ISO 8601 durations. */
export function parseYouTubeDuration(value: string): number | null {
	const match = /^P(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?)?$/.exec(value);
	if (!match) return null;
	const [days,hours,minutes,seconds] = match.slice(1).map(Number);
	const total = (days || 0)*86400+(hours || 0)*3600+(minutes || 0)*60+(seconds || 0);
	return total > 0 ? total : null;
}

export type CandidateLengthFilter = "all" | "over-minute" | "over-three-minutes";
export const YOUTUBE_LENGTH_FILTERS: Record<CandidateLengthFilter, number> = {
	all: 0,
	"over-minute": 61,
	"over-three-minutes": 181,
};

/**
 * Prefer a relevant car, then varied channels, without rejecting every video
 * when API metadata is missing. Length is only a Shorts proxy: YouTube does
 * not expose reliable portrait/landscape orientation in public video search.
 */
export function rankYouTubeCandidates<T extends YouTubeSearchCandidate>(
	candidates: readonly T[],
	query: string,
	mode: CandidateLengthFilter = "over-minute",
): T[] {
	const minimum = YOUTUBE_LENGTH_FILTERS[mode];
	const eligible = candidates.filter((item) => {
		if (item.embeddable === false) return false;
		if (typeof item.durationSeconds === "number" &&
			item.durationSeconds < minimum) return false;
		if (mode !== "all" && /(?:^|\s)#?shorts?(?:\b|$)/i.test(item.title)) return false;
		return scoreMediaCandidate({query,title:item.title}) > -90;
	});
	const channelCounts = new Map<string,number>();
	const remaining = eligible.map((item,index)=>({
		item,index,score:scoreMediaCandidate({query,title:item.title}),
	}));
	const ranked:T[]=[];
	while(remaining.length) {
		let bestIndex=0;
		let bestScore=-Infinity;
		for(let i=0;i<remaining.length;i++) {
			const {item,score,index} = remaining[i];
			const occurrences=channelCounts.get(item.channel.toLowerCase())??0;
			const adjusted = score-occurrences*3-(index*0.0001);
			if(adjusted>bestScore){bestScore=adjusted;bestIndex=i;}
		}
		const [{item}]=remaining.splice(bestIndex,1);
		ranked.push(item);
		const key=item.channel.toLowerCase();
		channelCounts.set(key,(channelCounts.get(key)??0)+1);
	}
	return ranked;
}
