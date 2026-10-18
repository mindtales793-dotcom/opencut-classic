import { NextResponse } from "next/server";
import { FISH_NARRATORS } from "@/darkcut/fish-narrators";

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const DEFAULT_MODEL = "s2.1-pro-free";

function normalizeApiKeys(value: unknown) {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.filter((key): key is string => typeof key === "string")
				.map((key) => key.trim())
				.filter(Boolean)
				.slice(0, 3),
		),
	);
}

export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	const data = payload as {
		text?: unknown;
		referenceId?: unknown;
		fishApiKeys?: unknown;
	};
	const text = typeof data.text === "string" ? data.text.trim() : "";
	const referenceId =
		typeof data.referenceId === "string" ? data.referenceId.trim() : "";
	const configuredKeys = normalizeApiKeys(data.fishApiKeys);
	const envKey = process.env.FISH_API_KEY?.trim();
	const apiKeys = configuredKeys.length
		? configuredKeys
		: envKey
			? [envKey]
			: [];

	if (!apiKeys.length) {
		return NextResponse.json(
			{
				error:
					"Cadastre pelo menos uma chave do Fish Audio em Configurações > APIs.",
			},
			{ status: 503 },
		);
	}

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

	let lastStatus = 502;
	let lastMessage = "Não foi possível conectar ao Fish Audio.";

	// Fish can return transient 503/502 responses during synthesis. Retry the
	// same authorized key with a bounded backoff before considering other keys.
	for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			let upstream: Response;
			try {
				upstream = await fetch(FISH_TTS_URL, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKeys[keyIndex]}`,
						"Content-Type": "application/json",
						model,
					},
					body: JSON.stringify({ text, reference_id: referenceId, format: "mp3" }),
					cache: "no-store",
					signal: AbortSignal.timeout(120_000),
				});
			} catch (error) {
				console.error("Fish Audio transient connection error:", error);
				lastStatus = 503;
				lastMessage = "Conexão com o Fish Audio falhou temporariamente.";
				if (attempt < 2) {
					await new Promise((resolve) => setTimeout(resolve, 850 * (2 ** attempt)));
					continue;
				}
				break;
			}
			if (upstream.ok) {
				if (!upstream.body) return NextResponse.json({ error: "Fish Audio respondeu sem áudio." }, { status: 502 });
				return new Response(upstream.body, {
					status: 200,
					headers: {
						"Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
						"Cache-Control": "no-store",
						"Content-Disposition": 'attachment; filename="darkcut-narracao.mp3"',
						"X-DarkCut-Fish-Key": String(keyIndex + 1),
					},
				});
			}
			lastStatus = upstream.status;
			const detail = (await upstream.text().catch(() => "")).slice(0, 500);
			console.error("Fish Audio error:", upstream.status, detail);
			lastMessage = upstream.status === 401 || upstream.status === 403
				? "A chave do Fish Audio foi recusada."
				: upstream.status === 429
					? "O Fish Audio atingiu um limite temporário de requisições."
					: upstream.status === 503
						? "Fish Audio temporariamente indisponível (HTTP 503). Os blocos prontos foram preservados; tente retomar."
						: `Fish Audio retornou HTTP ${upstream.status}.`;
			const retryable = upstream.status === 408 || upstream.status === 429 || upstream.status >= 500;
			if (retryable && attempt < 2) {
				const seconds = Number(upstream.headers.get("retry-after"));
				const waitMs = Number.isFinite(seconds) && seconds > 0
					? Math.min(5000, seconds * 1000) : 850 * (2 ** attempt);
				await new Promise((resolve) => setTimeout(resolve, waitMs));
				continue;
			}
			// Do not retry permanent 400/422 input/voice errors.
			if (!retryable && upstream.status !== 401 && upstream.status !== 403) {
				return NextResponse.json({ error: lastMessage }, { status: upstream.status });
			}
			break;
		}
	}

	return NextResponse.json(
		{
			error:
				apiKeys.length > 1
					? `Nenhuma das chaves do Fish Audio respondeu corretamente. ${lastMessage}`
					: lastMessage,
		},
		{ status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 },
	);
}
