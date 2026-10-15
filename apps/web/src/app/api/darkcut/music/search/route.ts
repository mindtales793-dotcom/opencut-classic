import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MusicSearchRequest = {
	clientId?: unknown;
	query?: unknown;
	page?: unknown;
	limit?: unknown;
};

type JamendoTrack = {
	id?: string;
	name?: string;
	duration?: number;
	artist_name?: string;
	audio?: string;
	audiodownload?: string;
	audiodownload_allowed?: boolean;
	image?: string;
	license_ccurl?: string;
	shareurl?: string;
};

type JamendoResponse = {
	headers?: {
		status?: string;
		error_message?: string;
		results_count?: number;
	};
	results?: JamendoTrack[];
};

export async function POST(request: Request) {
	let body: MusicSearchRequest;
	try {
		body = (await request.json()) as MusicSearchRequest;
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	const clientId =
		typeof body.clientId === "string" ? body.clientId.trim() : "";
	const query = typeof body.query === "string" ? body.query.trim() : "";
	const requestedPage =
		typeof body.page === "number" && Number.isFinite(body.page)
			? Math.floor(body.page)
			: 1;
	const requestedLimit =
		typeof body.limit === "number" && Number.isFinite(body.limit)
			? Math.floor(body.limit)
			: 30;
	const page = Math.max(1, requestedPage);
	const limit = Math.max(1, Math.min(50, requestedLimit));

	if (!clientId) {
		return NextResponse.json(
			{
				error:
					"Cadastre o Jamendo Client ID em Configurações > APIs.",
			},
			{ status: 400 },
		);
	}

	const params = new URLSearchParams({
		client_id: clientId,
		format: "json",
		limit: String(limit),
		offset: String((page - 1) * limit),
		order: query ? "relevance" : "popularity_total",
		audioformat: "mp32",
		include: "musicinfo",
	});

	if (query) {
		params.set("search", query);
	}

	try {
		const response = await fetch(
			`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`,
			{ cache: "no-store" },
		);
		const data = (await response.json()) as JamendoResponse;

		if (!response.ok || data.headers?.status === "failed") {
			return NextResponse.json(
				{
					error:
						data.headers?.error_message ||
						`Jamendo retornou HTTP ${response.status}.`,
				},
				{ status: response.ok ? 502 : response.status },
			);
		}

		const results = (data.results ?? [])
			.map((track) => {
				const idNumber = Number(track.id);
				const audioBase = `/api/darkcut/music/audio?trackId=${encodeURIComponent(
					track.id || "",
				)}&clientId=${encodeURIComponent(clientId)}`;
				const proxiedPreviewUrl = track.id
					? `${audioBase}&action=stream`
					: undefined;
				const proxiedDownloadUrl =
					track.id && track.audiodownload_allowed
						? `${audioBase}&action=download`
						: proxiedPreviewUrl;

				return {
					id: Number.isFinite(idNumber) ? idNumber : 0,
					name: track.name || "Música Jamendo",
					description: track.shareurl || "",
					url: track.shareurl || "",
					previewUrl: proxiedPreviewUrl,
					downloadUrl: proxiedDownloadUrl,
					duration:
						typeof track.duration === "number" ? track.duration : 0,
					filesize: 0,
					type: "audio",
					channels: 0,
					bitrate: 0,
					bitdepth: 0,
					samplerate: 0,
					username: track.artist_name || "Jamendo",
					tags: ["music", "jamendo"],
					license: track.license_ccurl || "",
					created: "",
					downloads: 0,
					rating: 0,
					ratingCount: 0,
					image: track.image || "",
					source: "jamendo",
					downloadAllowed: Boolean(
						track.audiodownload_allowed && track.audiodownload,
					),
				};
			})
			.filter((track) => track.id > 0 && track.previewUrl);

		return NextResponse.json({
			results,
			page,
			limit,
			hasMore: results.length === limit,
		});
	} catch (error) {
		console.error("DarkCut Jamendo search failed:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Falha ao buscar músicas no Jamendo.",
			},
			{ status: 502 },
		);
	}
}
