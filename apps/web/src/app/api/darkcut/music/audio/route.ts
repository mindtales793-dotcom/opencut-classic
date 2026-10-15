import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedJamendoHost(hostname: string) {
	const host = hostname.toLowerCase();
	return (
		host === "jamendo.com" ||
		host.endsWith(".jamendo.com") ||
		host === "jamendo.net" ||
		host.endsWith(".jamendo.net")
	);
}

export async function GET(request: Request) {
	const requestUrl = new URL(request.url);
	const source = requestUrl.searchParams.get("url")?.trim();

	if (!source) {
		return NextResponse.json(
			{ error: "URL de áudio ausente." },
			{ status: 400 },
		);
	}

	let remote: URL;
	try {
		remote = new URL(source);
	} catch {
		return NextResponse.json(
			{ error: "URL de áudio inválida." },
			{ status: 400 },
		);
	}

	if (remote.protocol !== "https:" || !isAllowedJamendoHost(remote.hostname)) {
		return NextResponse.json(
			{ error: "Fonte de áudio não permitida." },
			{ status: 400 },
		);
	}

	try {
		const upstream = await fetch(remote, {
			cache: "no-store",
			headers: {
				"User-Agent": "DarkCut-Studio/1.0",
				Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
			},
		});

		if (!upstream.ok) {
			return NextResponse.json(
				{ error: `Jamendo retornou HTTP ${upstream.status}.` },
				{ status: upstream.status },
			);
		}

		const audio = await upstream.arrayBuffer();
		return new Response(audio, {
			status: 200,
			headers: {
				"Content-Type":
					upstream.headers.get("content-type") || "audio/mpeg",
				"Content-Length": String(audio.byteLength),
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (error) {
		console.error("DarkCut Jamendo audio proxy failed:", error);
		return NextResponse.json(
			{ error: "Não foi possível carregar o áudio do Jamendo." },
			{ status: 502 },
		);
	}
}
