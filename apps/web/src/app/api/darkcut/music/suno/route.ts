import { NextResponse } from "next/server";
import {
	getPermittedSunoAudioUrl,
	normalizeLocalSunoSong,
	parseSunoPort,
	SUNO_DEFAULT_PORT,
	SUNO_SONG_ID_PATTERN,
} from "@/darkcut/suno-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 250_000;
const MAX_AUDIO_BYTES = 80_000_000;
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:3217", "http://localhost:3217"]);

const json = (body: unknown, status = 200) =>
	NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

function allowed(request: Request): boolean {
	if (!process.env.DARKCUT_DATA_DIR) return false;
	const origin = request.headers.get("origin");
	const site = request.headers.get("sec-fetch-site");
	return (!origin || ALLOWED_ORIGINS.has(origin)) && (!site || site === "same-origin" || site === "none");
}

async function localApi({
	port,
	path,
	body,
	timeout = 10_000,
}: {
	port: number;
	path: string;
	body?: unknown;
	timeout?: number;
}): Promise<unknown> {
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method: body === undefined ? "GET" : "POST",
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
		headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
		redirect: "error",
		cache: "no-store",
		signal: AbortSignal.timeout(timeout),
	});
	if (!response.ok) throw new Error(`Serviço Suno local respondeu HTTP ${response.status}. Verifique se a biblioteca não oficial ainda funciona.`);
	if (Number(response.headers.get("content-length") ?? 0) > MAX_JSON_BYTES) throw new Error("Resposta local grande demais.");
	const responseBody = await response.text();
	if (responseBody.length > MAX_JSON_BYTES) throw new Error("Resposta local grande demais.");
	return JSON.parse(responseBody) as unknown;
}

function failure(error: unknown) {
	const message = error instanceof Error ? error.message : "Serviço indisponível.";
	const localError = message.includes("fetch failed") || message.includes("ECONNREFUSED") ||
		message.includes("aborted") || message.includes("timed out");
	return json({ error: localError
		? "Serviço Suno local não respondeu. Inicie o servidor não oficial em 127.0.0.1 e verifique a porta."
		: message.slice(0, 200) }, 502);
}

function getPort(request: Request): number | null {
	const url = new URL(request.url);
	return parseSunoPort(url.searchParams.get("port") ?? String(SUNO_DEFAULT_PORT));
}

export async function GET(request: Request) {
	if (!allowed(request)) return json({ error: "Integração disponível apenas no DarkCut Windows local." }, 403);
	const url = new URL(request.url);
	const port = getPort(request);
	if (port === null) return json({ error: "Porta local permitida: 8020 a 8099." }, 400);
	const action = url.searchParams.get("action") || "status";
	try {
		if (action === "status") {
			const response = await localApi({ port, path: "/v1/credits", timeout: 3500 });
			const credits = (response && typeof response === "object")
				? (response as Record<string, unknown>).total_credits_left : undefined;
			return json({ connected: true, credits: typeof credits === "number" ? credits : null,
				note: "Serviço de terceiros não oficial; créditos e direitos de uso dependem da conta." });
		}
		if (action === "list") {
			const result = await localApi({ port, path: "/v1/songs", timeout: 12_000 });
			return json({ songs: Array.isArray(result)
				? result.slice(0, 60).map(normalizeLocalSunoSong).filter(Boolean) : [] });
		}
		const id = url.searchParams.get("id") ?? "";
		if (!SUNO_SONG_ID_PATTERN.test(id)) return json({ error: "Identificador de música inválido." }, 400);
		if (action !== "song" && action !== "audio") return json({ error: "Operação desconhecida." }, 400);
		const result = await localApi({ port, path: `/v1/song/${id}`, timeout: 8000 });
		const song = normalizeLocalSunoSong(result);
		if (!song) return json({ error: "Música não encontrada no serviço local." }, 404);
		if (action === "song") return json({ song });
		const raw = result && typeof result === "object" ? (result as Record<string, unknown>).audio_url : null;
		const audioUrl = getPermittedSunoAudioUrl(raw);
		if (!audioUrl) return json({ error: "Arquivo ainda não ficou pronto ou URL não é reconhecida." }, 409);
		const range = request.headers.get("range") ?? "";
		const audio = await fetch(audioUrl, {
			redirect: "error", cache: "no-store", signal: AbortSignal.timeout(90_000),
			headers: /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {},
		});
		if (![200, 206].includes(audio.status) || !audio.body) throw new Error("CDN não disponibilizou o áudio.");
		const type = audio.headers.get("content-type") || "";
		if (!(type.startsWith("audio/") || type.includes("octet-stream"))) throw new Error("O provedor não retornou um arquivo de áudio.");
		if (Number(audio.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) throw new Error("Áudio grande demais.");
		const headers = new Headers({
			"Content-Type": type.startsWith("audio/") ? type : "audio/mpeg",
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"Accept-Ranges": "bytes",
		});
		for (const key of ["content-length", "content-range"]) {
			const value = audio.headers.get(key);
			if (value) headers.set(key, value);
		}
		let size = 0;
		const bounded = audio.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				size += chunk.byteLength;
				if (size > MAX_AUDIO_BYTES) throw new Error("Áudio excedeu limite de tamanho");
				controller.enqueue(chunk);
			},
		}));
		return new Response(bounded, { status: audio.status, headers });
	} catch (error) {
		return failure(error);
	}
}

export async function POST(request: Request) {
	if (!allowed(request)) return json({ error: "Integração disponível apenas no DarkCut Windows local." }, 403);
	const port = getPort(request);
	if (port === null) return json({ error: "Porta local permitida: 8020 a 8099." }, 400);
	try {
		if (Number(request.headers.get("content-length") ?? 0) > 4096) return json({ error: "Prompt grande demais." }, 413);
		const input = await request.json() as Record<string, unknown>;
		const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
		const tags = typeof input.tags === "string" ? input.tags.trim() : "";
		if (prompt.length < 5 || prompt.length > 700 || tags.length > 150 ||
			typeof input.instrumental !== "boolean") return json({ error: "Informe um prompt de 5 a 700 caracteres, estilo opcional e modo instrumental." }, 400);
		const generated = await localApi({
			port, path: "/v1/songs",
			body: { prompt, tags, custom: false, instrumental: input.instrumental },
			timeout: 110_000,
		});
		if (!Array.isArray(generated)) throw new Error("O serviço não retornou uma lista de músicas.");
		return json({ songs: generated.slice(0, 4).map(normalizeLocalSunoSong).filter(Boolean) });
	} catch (error) {
		return failure(error);
	}
}
