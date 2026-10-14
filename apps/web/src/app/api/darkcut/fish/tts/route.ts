import { NextResponse } from "next/server";
import { FISH_NARRATORS } from "@/darkcut/fish-narrators";

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const DEFAULT_MODEL = "s2.1-pro-free";

export async function POST(request: Request) {
	const apiKey = process.env.FISH_API_KEY?.trim();
	if (!apiKey) {
		return NextResponse.json(
			{ error: "FISH_API_KEY não configurada no servidor." },
			{ status: 503 },
		);
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	const data = payload as { text?: unknown; referenceId?: unknown };
	const text = typeof data.text === "string" ? data.text.trim() : "";
	const referenceId =
		typeof data.referenceId === "string" ? data.referenceId.trim() : "";

	if (!text) {
		return NextResponse.json(
			{ error: "O roteiro está vazio." },
			{ status: 400 },
		);
	}
	if (text.length > 100_000) {
		return NextResponse.json(
			{ error: "O roteiro é grande demais para uma única geração." },
			{ status: 400 },
		);
	}
	if (!FISH_NARRATORS.some((voice) => voice.id === referenceId)) {
		return NextResponse.json(
			{ error: "Narrador Fish Audio inválido." },
			{ status: 400 },
		);
	}

	const model = process.env.FISH_TTS_MODEL?.trim() || DEFAULT_MODEL;
	if (!["s2.1-pro-free", "s2.1-pro"].includes(model)) {
		return NextResponse.json(
			{ error: "FISH_TTS_MODEL não permitido. Use s2.1-pro-free ou s2.1-pro." },
			{ status: 500 },
		);
	}

	let upstream: Response;
	try {
		upstream = await fetch(FISH_TTS_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				model,
			},
			body: JSON.stringify({
				text,
				reference_id: referenceId,
				format: "mp3",
			}),
			cache: "no-store",
		});
	} catch (error) {
		console.error("Fish Audio request failed:", error);
		return NextResponse.json(
			{ error: "Não foi possível conectar ao Fish Audio." },
			{ status: 502 },
		);
	}

	if (!upstream.ok) {
		const detail = (await upstream.text()).slice(0, 1000);
		console.error("Fish Audio error:", upstream.status, detail);
		return NextResponse.json(
			{
				error:
					upstream.status === 401 || upstream.status === 403
						? "A chave do Fish Audio foi recusada."
						: `Fish Audio retornou HTTP ${upstream.status}.`,
			},
			{ status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
		);
	}

	const audio = await upstream.arrayBuffer();
	return new Response(audio, {
		status: 200,
		headers: {
			"Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
			"Cache-Control": "no-store",
			"Content-Disposition": 'attachment; filename="darkcut-narracao.mp3"',
		},
	});
}
