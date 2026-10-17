import { NextResponse } from "next/server";
import { sortMediaCandidates } from "@/darkcut/media-search-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StockRequest = {
	query?: unknown;
	pexelsApiKey?: unknown;
	pixabayApiKey?: unknown;
	prefer?: unknown;
	excludeMediaIds?: unknown;
};

type Candidate = {
	source: "pexels" | "pixabay";
	kind: "video" | "image";
	id: string;
	title: string;
	url: string;
	contentType: string;
};

function checkSearchResponse(response: Response, provider: string) {
	if (response.ok) return;
	const reason = response.status === 401 || response.status === 403
		? "chave recusada; confira Configurações > APIs"
		: response.status === 429
			? "limite de requisições atingido; tente novamente mais tarde"
			: `serviço indisponível (HTTP ${response.status})`;
	throw new Error(`${provider}: ${reason}.`);
}

function clean(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

async function searchPexels(query: string, apiKey: string, errors: string[], prefer: "video" | "image"): Promise<Candidate[]> {
	if (!apiKey) return [];
	const headers = { Authorization: apiKey };
	const candidates: Candidate[] = [];

	try {
		const response = await fetch(
			`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
			{ headers, cache: "no-store", signal: AbortSignal.timeout(20000) },
		);
		checkSearchResponse(response, "Pexels");
		if (response.ok) {
			const data = (await response.json()) as {
				videos?: Array<{
					id?: number;
					url?: string;
					user?: { name?: string };
					video_files?: Array<{
						link?: string;
						file_type?: string;
						width?: number;
						height?: number;
						quality?: string;
					}>;
				}>;
			};
			for (const item of data.videos ?? []) {
				const files = (item.video_files ?? [])
					.filter((file) => file.link && /video\/mp4/i.test(file.file_type ?? ""))
					.sort((a, b) => {
						const aw = a.width ?? 0;
						const bw = b.width ?? 0;
						const aPenalty = aw > 1280 ? 10000 : 0;
						const bPenalty = bw > 1280 ? 10000 : 0;
						return Math.abs(1280 - aw) + aPenalty - (Math.abs(1280 - bw) + bPenalty);
					});
				const file = files[0];
				if (!item.id || !file?.link) continue;
				candidates.push({
					source: "pexels",
					kind: "video",
					id: String(item.id),
					title: `Pexels ${item.id}${item.user?.name ? ` · ${item.user.name}` : ""}`,
					url: file.link,
					contentType: file.file_type || "video/mp4",
				});
			}
		}
	} catch (error) {
		errors.push(error instanceof Error && error.name === "Error" ? error.message : "Pexels: falha de conexão ou tempo limite excedido.");
	}

	if (prefer === "video" && candidates.length > 0) return candidates;

	try {
		const response = await fetch(
			`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
			{ headers, cache: "no-store", signal: AbortSignal.timeout(20000) },
		);
		checkSearchResponse(response, "Pexels");
		if (response.ok) {
			const data = (await response.json()) as {
				photos?: Array<{
					id?: number;
					alt?: string;
					photographer?: string;
					src?: { large2x?: string; large?: string; landscape?: string };
				}>;
			};
			for (const item of data.photos ?? []) {
				const url = item.src?.large ?? item.src?.landscape ?? item.src?.large2x;
				if (!item.id || !url) continue;
				candidates.push({
					source: "pexels",
					kind: "image",
					id: String(item.id),
					title:
						item.alt?.trim() ||
						`Pexels ${item.id}${item.photographer ? ` · ${item.photographer}` : ""}`,
					url,
					contentType: "image/jpeg",
				});
			}
		}
	} catch (error) {
		errors.push(error instanceof Error && error.name === "Error" ? error.message : "Pexels: falha de conexão ou tempo limite excedido.");
	}

	return candidates;
}

async function searchPixabay(query: string, apiKey: string, errors: string[], prefer: "video" | "image"): Promise<Candidate[]> {
	if (!apiKey) return [];
	const candidates: Candidate[] = [];

	try {
		const params = new URLSearchParams({
			key: apiKey,
			q: query,
			per_page: "10",
			safesearch: "true",
			order: "popular",
		});
		const response = await fetch(`https://pixabay.com/api/videos/?${params.toString()}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(20000),
		});
		checkSearchResponse(response, "Pixabay");
		if (response.ok) {
			const data = (await response.json()) as {
				hits?: Array<{
					id?: number;
					tags?: string;
					user?: string;
					videos?: {
						medium?: { url?: string; width?: number };
						small?: { url?: string; width?: number };
						large?: { url?: string; width?: number };
					};
				}>;
			};
			for (const item of data.hits ?? []) {
				const file = item.videos?.medium ?? item.videos?.small ?? item.videos?.large;
				if (!item.id || !file?.url) continue;
				candidates.push({
					source: "pixabay",
					kind: "video",
					id: String(item.id),
					title:
						item.tags?.trim() ||
						`Pixabay ${item.id}${item.user ? ` · ${item.user}` : ""}`,
					url: file.url,
					contentType: "video/mp4",
				});
			}
		}
	} catch (error) {
		errors.push(error instanceof Error && error.name === "Error" ? error.message : "Pixabay: falha de conexão ou tempo limite excedido.");
	}

	if (prefer === "video" && candidates.length > 0) return candidates;

	try {
		const params = new URLSearchParams({
			key: apiKey,
			q: query,
			image_type: "photo",
			orientation: "horizontal",
			per_page: "12",
			safesearch: "true",
			order: "popular",
		});
		const response = await fetch(`https://pixabay.com/api/?${params.toString()}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(20000),
		});
		checkSearchResponse(response, "Pixabay");
		if (response.ok) {
			const data = (await response.json()) as {
				hits?: Array<{
					id?: number;
					tags?: string;
					user?: string;
					largeImageURL?: string;
					webformatURL?: string;
				}>;
			};
			for (const item of data.hits ?? []) {
				const url = item.largeImageURL ?? item.webformatURL;
				if (!item.id || !url) continue;
				candidates.push({
					source: "pixabay",
					kind: "image",
					id: String(item.id),
					title:
						item.tags?.trim() ||
						`Pixabay ${item.id}${item.user ? ` · ${item.user}` : ""}`,
					url,
					contentType: "image/jpeg",
				});
			}
		}
	} catch (error) {
		errors.push(error instanceof Error && error.name === "Error" ? error.message : "Pixabay: falha de conexão ou tempo limite excedido.");
	}

	return candidates;
}

async function download(candidate: Candidate) {
	const response = await fetch(candidate.url, {
		cache: "no-store",
		signal: AbortSignal.timeout(90000),
		headers: {
			"User-Agent": "DarkCut Studio",
		},
	});
	if (!response.ok) throw new Error(`${candidate.source} download HTTP ${response.status}`);
	const bytes = await response.arrayBuffer();
	if (!bytes.byteLength) throw new Error("A mídia retornou vazia.");
	return new Response(bytes, {
		status: 200,
		headers: {
			"Content-Type": response.headers.get("content-type") || candidate.contentType,
			"Cache-Control": "no-store",
			"X-DarkCut-Source": candidate.source,
			"X-DarkCut-Media-Kind": candidate.kind,
			"X-DarkCut-Media-Id": candidate.id,
			"X-DarkCut-Media-Title": encodeURIComponent(candidate.title.slice(0, 160)),
		},
	});
}

export async function POST(request: Request) {
	let body: StockRequest;
	try {
		body = (await request.json()) as StockRequest;
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return NextResponse.json({ error: "Informe um objeto JSON válido." }, { status: 400 });
	}

	const query = clean(body.query);
	const pexelsApiKey = clean(body.pexelsApiKey);
	const pixabayApiKey = clean(body.pixabayApiKey);
	const prefer = body.prefer === "image" ? "image" : "video";
	const excluded = new Set(
		Array.isArray(body.excludeMediaIds)
			? body.excludeMediaIds.filter((item): item is string => typeof item === "string").slice(0, 1000)
			: [],
	);

	if (!query) {
		return NextResponse.json({ error: "Informe uma busca visual." }, { status: 400 });
	}
	if (!pexelsApiKey && !pixabayApiKey) {
		return NextResponse.json(
			{ error: "Cadastre uma chave Pexels ou Pixabay em Configurações > APIs." },
			{ status: 400 },
		);
	}

	const errors: string[] = [];
	const providers: Array<() => Promise<Candidate[]>> = [
		() => searchPexels(query, pexelsApiKey, errors, prefer),
		() => searchPixabay(query, pixabayApiKey, errors, prefer),
	];

	for (const search of providers) {
		try {
			const candidates = await search();
			const ordered = sortMediaCandidates(candidates, query, {
				prefer,
				exclude: excluded,
			});
			for (const candidate of ordered.slice(0, 6)) {
				try {
					return await download(candidate);
				} catch (error) {
					errors.push(
						`${candidate.source} ${candidate.id}: ${error instanceof Error ? error.message : "falhou"}`,
					);
				}
			}
		} catch (error) {
			errors.push(error instanceof Error ? error.message : "Falha no banco de mídia.");
		}
	}

	return NextResponse.json(
		{
			error: "Nenhuma mídia de banco compatível foi encontrada.",
			detail: [...new Set(errors)].join(" | ").slice(0, 600),
		},
		{ status: 404 },
	);
}
