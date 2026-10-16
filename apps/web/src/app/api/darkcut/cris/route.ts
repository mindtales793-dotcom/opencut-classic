import { NextResponse } from "next/server";
import {
	buildLocalCrisPlan,
	normalizeCrisPlan,
	type CrisEditPlan,
	type CrisProvider,
	type CrisTemplateContext,
} from "@/darkcut/cris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
	mode?: "analyze" | "test";
	script?: string;
	visualCount?: number;
	template?: CrisTemplateContext;
	primaryProvider?: CrisProvider;
	fallbackProvider?: CrisProvider;
	geminiApiKey?: string;
	openRouterApiKey?: string;
	geminiApiKeys?: string[];
	openRouterApiKeys?: string[];
	geminiModel?: string;
	openRouterModel?: string;
};

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_MODEL_FALLBACK = "gemini-3.8-flash";
const LEGACY_GEMINI_MODELS = new Set([
	"gemini-2.5-flash-lite",
	"gemini-2.5-flash",
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash",
]);

function cleanKey(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function cleanKeys(values: unknown, legacy: unknown) {
	const list = Array.isArray(values) ? values : [];
	const keys = [...list, legacy]
		.map(cleanKey)
		.filter(Boolean);
	return Array.from(new Set(keys)).slice(0, 3);
}

function normalizeGeminiModel(value: unknown) {
	const model = cleanKey(value);
	if (!model || LEGACY_GEMINI_MODELS.has(model)) return DEFAULT_GEMINI_MODEL;
	return model;
}

function parseJsonText(text: string) {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
	return JSON.parse(cleaned) as unknown;
}

function promptForPlan({
	script,
	visualCount,
	template,
}: {
	script: string;
	visualCount: number;
	template: CrisTemplateContext;
}) {
	return [
		"Você é Cris, diretora de edição do DarkCut Studio.",
		"Analise o roteiro e crie um plano de edição para as mídias que o usuário já escolheu.",
		"Não reescreva o roteiro inteiro. Pense visualmente.",
		`Crie EXATAMENTE ${visualCount} itens em scenes, com index de 0 até ${Math.max(0, visualCount - 1)}.`,
		`Template: ${template.title} (${template.id}).`,
		`Movimentos permitidos: ${template.motions.join(", ")}.`,
		`Transições permitidas: ${template.transitions.join(", ")}.`,
		`Efeitos permitidos: ${template.effects.join(", ")}.`,
		`Intensidade base: ${template.intensity}.`,
		"Para cada mídia, decida o que deve aparecer naquele momento da narração.",
		"visualQuery deve ser uma busca visual curta em INGLÊS, não uma tradução literal da frase.",
		"overlayText deve ser curto e só existir quando realmente agregar: número, item de lista, valor, virada, pergunta, palavra-chave.",
		"Use sceneType apenas entre: hook, context, list, number, emotion, problem, solution, turn, cta.",
		"Use effect apenas none ou blur.",
		"durationWeight deve ficar entre 0.6 e 1.6.",
		"Retorne SOMENTE JSON válido no formato:",
		JSON.stringify({
			scenes: [
				{
					index: 0,
					sceneType: "hook",
					summary: "resumo visual curto",
					visualQuery: "early morning city bedroom",
					overlayText: "5:00 DA MANHÃ",
					motion: template.motions[0] ?? "zoom-in",
					transition: template.transitions[0] ?? "fade",
					effect: "none",
					intensity: template.intensity,
					durationWeight: 1,
				},
			],
		}),
		"ROTEIRO:",
		script.slice(0, 60000),
	].join("\n");
}

async function callGeminiOnce({
	apiKey,
	model,
	prompt,
}: {
	apiKey: string;
	model: string;
	prompt: string;
}) {
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
			model,
		)}:generateContent`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": apiKey,
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: {
					responseMimeType: "application/json",
				},
			}),
			cache: "no-store",
			signal: AbortSignal.timeout(60000),
		},
	);
	const data = (await response.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		error?: { message?: string };
	};
	if (!response.ok) {
		const message = data.error?.message || `Gemini HTTP ${response.status}`;
		const error = new Error(message) as Error & { status?: number };
		error.status = response.status;
		throw error;
	}
	const text =
		data.candidates?.[0]?.content?.parts
			?.map((part) => part.text ?? "")
			.join("")
			.trim() ?? "";
	if (!text) throw new Error("Gemini respondeu sem plano de edição.");
	return parseJsonText(text);
}

function shouldTryAnotherGeminiModel(error: unknown) {
	if (!(error instanceof Error)) return false;
	const status = (error as Error & { status?: number }).status;
	const message = error.message.toLowerCase();
	return (
		status === 404 ||
		status === 400 ||
		message.includes("model") ||
		message.includes("no longer available") ||
		message.includes("not found") ||
		message.includes("not supported")
	);
}

async function callGemini({
	apiKey,
	model,
	prompt,
}: {
	apiKey: string;
	model: string;
	prompt: string;
}) {
	const preferred = normalizeGeminiModel(model);
	const candidates = Array.from(
		new Set([preferred, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_FALLBACK]),
	);
	let lastError: unknown;

	for (const candidate of candidates) {
		try {
			return await callGeminiOnce({ apiKey, model: candidate, prompt });
		} catch (error) {
			lastError = error;
			if (!shouldTryAnotherGeminiModel(error)) throw error;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Nenhum modelo Gemini disponível.");
}

async function callOpenRouter({
	apiKey,
	model,
	prompt,
}: {
	apiKey: string;
	model: string;
	prompt: string;
}) {
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"X-Title": "DarkCut Studio - Cris",
		},
		body: JSON.stringify({
			model: model || "openrouter/free",
			messages: [
				{
					role: "system",
					content:
						"Você é Cris, diretora de edição. Responda somente com JSON válido.",
				},
				{ role: "user", content: prompt },
			],
			temperature: 0.25,
			response_format: { type: "json_object" },
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(60000),
	});
	const data = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(data.error?.message || `OpenRouter HTTP ${response.status}`);
	}
	const text = data.choices?.[0]?.message?.content?.trim() ?? "";
	if (!text) throw new Error("OpenRouter respondeu sem plano de edição.");
	return parseJsonText(text);
}

async function analyzeWithProvider({
	provider,
	body,
	prompt,
}: {
	provider: CrisProvider;
	body: RequestBody;
	prompt: string;
}) {
	const keys =
		provider === "gemini"
			? cleanKeys(body.geminiApiKeys, body.geminiApiKey)
			: cleanKeys(body.openRouterApiKeys, body.openRouterApiKey);
	if (!keys.length) {
		throw new Error(
			provider === "gemini"
				? "Gemini API Key não configurada."
				: "OpenRouter API Key não configurada.",
		);
	}

	const errors: string[] = [];
	for (const [index, key] of keys.entries()) {
		try {
			const raw =
				provider === "gemini"
					? await callGemini({
							apiKey: key,
							model: normalizeGeminiModel(body.geminiModel),
							prompt,
						})
					: await callOpenRouter({
							apiKey: key,
							model: cleanKey(body.openRouterModel) || "openrouter/free",
							prompt,
						});
			return { raw, keySlot: index + 1 };
		} catch (error) {
			errors.push(
				`chave ${index + 1}: ${error instanceof Error ? error.message : "falhou"}`,
			);
		}
	}

	throw new Error(errors.join(" | ").slice(0, 900));
}

export async function POST(request: Request) {
	let body: RequestBody;
	try {
		body = (await request.json()) as RequestBody;
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	const primary = body.primaryProvider === "openrouter" ? "openrouter" : "gemini";
	const fallback =
		body.fallbackProvider === "gemini" ? "gemini" : "openrouter";

	if (body.mode === "test") {
		const template: CrisTemplateContext = {
			id: "test",
			title: "Teste Cris",
			motions: ["zoom-in"],
			transitions: ["fade"],
			intensity: "soft",
			effects: ["none"],
		};
		const prompt = promptForPlan({
			script: "Uma pessoa acorda cedo e começa o dia.",
			visualCount: 1,
			template,
		});
		try {
			const primaryResult = await analyzeWithProvider({ provider: primary, body, prompt });
			return NextResponse.json({
				ok: true,
				provider: primary,
				keySlot: primaryResult.keySlot,
				model:
					primary === "gemini"
						? normalizeGeminiModel(body.geminiModel)
						: cleanKey(body.openRouterModel) || "openrouter/free",
			});
		} catch (primaryError) {
			if (fallback !== primary) {
				try {
					const fallbackResult = await analyzeWithProvider({ provider: fallback, body, prompt });
					return NextResponse.json({
						ok: true,
						provider: fallback,
						fallbackUsed: true,
						keySlot: fallbackResult.keySlot,
						model:
							fallback === "gemini"
								? normalizeGeminiModel(body.geminiModel)
								: cleanKey(body.openRouterModel) || "openrouter/free",
					});
				} catch {}
			}
			return NextResponse.json(
				{
					error:
						primaryError instanceof Error
							? primaryError.message
							: "Falha ao testar a Cris.",
				},
				{ status: 502 },
			);
		}
	}

	const script = typeof body.script === "string" ? body.script.trim() : "";
	const visualCount = Math.max(
		1,
		Math.min(
			200,
			typeof body.visualCount === "number" && Number.isFinite(body.visualCount)
				? Math.round(body.visualCount)
				: 1,
		),
	);
	const template = body.template;
	if (!script || !template || typeof template !== "object") {
		return NextResponse.json(
			{ error: "Roteiro e template são obrigatórios." },
			{ status: 400 },
		);
	}

	const prompt = promptForPlan({ script, visualCount, template });
	const providers = Array.from(new Set<CrisProvider>([primary, fallback]));
	const errors: string[] = [];

	for (const provider of providers) {
		try {
			const result = await analyzeWithProvider({ provider, body, prompt });
			const plan = normalizeCrisPlan({
				value: result.raw,
				visualCount,
				template,
				provider,
			});
			if (plan) {
				return NextResponse.json({
					plan,
					provider,
					fallbackUsed: provider !== primary,
					keySlot: result.keySlot,
				});
			}
			errors.push(`${provider}: resposta inválida`);
		} catch (error) {
			errors.push(
				`${provider}: ${error instanceof Error ? error.message : "falhou"}`,
			);
		}
	}

	const plan: CrisEditPlan = buildLocalCrisPlan({
		script,
		visualCount,
		template,
	});
	return NextResponse.json({
		plan,
		provider: "local",
		fallbackUsed: true,
		warning: errors.join(" | ").slice(0, 600),
	});
}
