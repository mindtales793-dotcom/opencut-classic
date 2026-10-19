/**
 * Adapter for an optional, separately run, UNOFFICIAL Suno REST service.
 * The API referenced by the user exposes POST /v1/songs, GET /v1/songs,
 * GET /v1/song/{id} and GET /v1/credits. Do not store authentication cookies.
 */
export const SUNO_DEFAULT_PORT = 8025;
export const SUNO_MIN_PORT = 8020;
export const SUNO_MAX_PORT = 8099;

export function parseSunoPort(value: unknown): number | null {
	const port = typeof value === "number" ? value : typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : NaN;
	return Number.isInteger(port) && port >= SUNO_MIN_PORT && port <= SUNO_MAX_PORT ? port : null;
}

export const SUNO_SONG_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getPermittedSunoAudioUrl(value: unknown): string | null {
	if (typeof value !== "string" || !value || value.length > 2048) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || !/^cdn\d*\.suno\.ai$/i.test(url.hostname) ||
			url.username || url.password || (url.port && url.port !== "443")) return null;
		return url.href;
	} catch { return null; }
}

export interface LocalSunoSong {
	id: string;
	title: string;
	status: string;
	audioReady: boolean;
}

export function normalizeLocalSunoSong(value: unknown): LocalSunoSong | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const item = value as Record<string, unknown>;
	if (typeof item.id !== "string" || !SUNO_SONG_ID_PATTERN.test(item.id)) return null;
	return {
		id: item.id,
		title: typeof item.title === "string" ? item.title.slice(0, 120) : "Música gerada",
		status: typeof item.status === "string" ? item.status.slice(0, 48) : "aguardando",
		audioReady: getPermittedSunoAudioUrl(item.audio_url) !== null,
	};
}
