import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const requestUrl = new URL(request.url);
	const trackId = requestUrl.searchParams.get("trackId")?.trim() || "";
	const clientId = requestUrl.searchParams.get("clientId")?.trim() || "";
	const action =
		requestUrl.searchParams.get("action") === "download" ? "download" : "stream";

	if (!/^\d+$/.test(trackId) || !clientId) {
		return NextResponse.json(
			{ error: "Track ID ou Jamendo Client ID inválido." },
			{ status: 400 },
		);
	}

	const params = new URLSearchParams({
		client_id: clientId,
		id: trackId,
		audioformat: "mp32",
		action,
	});

	try {
		const upstream = await fetch(
			`https://api.jamendo.com/v3.0/tracks/file/?${params.toString()}`,
			{
				cache: "no-store",
				redirect: "follow",
				headers: {
					"User-Agent": "DarkCut-Studio/1.0",
					Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
					...(request.headers.get("range")
						? { Range: request.headers.get("range") as string }
						: {}),
				},
			},
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
		headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");

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
