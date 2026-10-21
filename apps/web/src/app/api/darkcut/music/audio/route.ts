import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const requestUrl = new URL(request.url);
	const trackId = requestUrl.searchParams.get("trackId")?.trim() || "";
	const clientId = requestUrl.searchParams.get("clientId")?.trim() || "";
	const action =
		requestUrl.searchParams.get("action") === "download"
			? "download"
			: "stream";

	if (!/^\d+$/.test(trackId) || !clientId) {
		return NextResponse.json(
			{ error: "Track ID ou Jamendo Client ID inválido." },
			{ status: 400 },
		);
	}

	const params = new URLSearchParams({
		client_id: clientId,
		id: trackId,
		format: "json",
		audioformat: "mp32",
	});
	try {
		const metadata = await fetch(
			`https://api.jamendo.com/v3.0/tracks/?${params}`,
			{ cache: "no-store", signal: AbortSignal.timeout(20000) },
		);
		const data = await metadata.json();
		const track = data.results?.[0];
		if (!metadata.ok || data.headers?.status === "failed" || !track)
			return NextResponse.json(
				{
					error:
						data.headers?.error_message || "Música não encontrada no Jamendo.",
				},
				{ status: 502 },
			);
		if (action === "download" && !track.audiodownload_allowed)
			return NextResponse.json(
				{
					error:
						"O artista não permite download desta música. Escolha outra faixa.",
				},
				{ status: 403 },
			);
		const source = action === "download" ? track.audiodownload : track.audio;
		if (!source)
			return NextResponse.json(
				{ error: "Arquivo de áudio indisponível no Jamendo." },
				{ status: 404 },
			);
		const sourceUrl = new URL(source);
		if (
			!["http:", "https:"].includes(sourceUrl.protocol) ||
			!(
				sourceUrl.hostname === "jamendo.com" ||
				sourceUrl.hostname.endsWith(".jamendo.com")
			)
		)
			throw new Error("Endereço de áudio inválido.");
		sourceUrl.protocol = "https:";
		const upstream = await fetch(sourceUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(90000),
			headers: {
				...(request.headers.get("range")
					? { Range: request.headers.get("range") as string }
					: {}),
			},
		});
		const contentType = upstream.headers.get("content-type") || "";
		if (contentType.includes("json") || contentType.includes("text/"))
			return NextResponse.json(
				{ error: "O Jamendo retornou uma resposta inválida em vez do áudio." },
				{ status: 502 },
			);

		if (!upstream.ok || !upstream.body) {
			return NextResponse.json(
				{ error: `Jamendo retornou HTTP ${upstream.status}.` },
				{ status: upstream.status || 502 },
			);
		}

		const headers = new Headers();
		headers.set(
			"Content-Type",
			upstream.headers.get("content-type") || "audio/mpeg",
		);
		headers.set("Cache-Control", "private, max-age=3600");
		headers.set(
			"Accept-Ranges",
			upstream.headers.get("accept-ranges") || "bytes",
		);

		for (const name of ["content-length", "content-range"]) {
			const value = upstream.headers.get(name);
			if (value) headers.set(name, value);
		}

		return new Response(upstream.body, {
			status: upstream.status,
			headers,
		});
	} catch (error) {
		console.error("DarkCut Jamendo audio stream failed:", error);
		return NextResponse.json(
			{ error: "Não foi possível carregar a música do Jamendo." },
			{ status: 502 },
		);
	}
}
