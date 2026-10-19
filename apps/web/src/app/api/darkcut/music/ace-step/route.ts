import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACE_URL = "http://127.0.0.1:8001";
const TASK_ID = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

type ApiEnvelope = { code?: number; error?: unknown; data?: unknown };
type TaskEntry = { task_id?: unknown; status?: unknown; result?: unknown };

function enabled(request: Request): Response | null {
	if (!process.env.DARKCUT_DATA_DIR) {
		return NextResponse.json({ error: "ACE-Step local está disponível somente no DarkCut Studio para Windows." }, { status: 403 });
	}
	const origin = request.headers.get("origin");
	if (origin) {
		try {
			if (new URL(origin).origin !== new URL(request.url).origin) {
				return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
			}
		} catch {
			return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
		}
	}
	return null;
}

async function aceRequest(path: string, body?: object, timeoutMs = 15000): Promise<unknown> {
	const response = await fetch(ACE_URL + path, {
		method: body ? "POST" : "GET",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(timeoutMs),
		cache: "no-store",
	});
	if (!response.ok) throw new Error(`ACE-Step indisponível (HTTP ${response.status}).`);
	const payload = (await response.json()) as ApiEnvelope;
	if (typeof payload === "object" && payload !== null && payload.code !== undefined && payload.code !== 200) {
		throw new Error("O ACE-Step recusou esta operação.");
	}
	return payload;
}

function toTask(payload: unknown, taskId: string): TaskEntry {
	const data = (payload as ApiEnvelope)?.data;
	const list = Array.isArray(data) ? data : [];
	const task = list.find((item: unknown) =>
		typeof item === "object" && item !== null && (item as TaskEntry).task_id === taskId
	) as TaskEntry | undefined;
	if (!task) throw new Error("Tarefa de música não encontrada no ACE-Step.");
	return task;
}

async function queryTask(id: string) {
	const result = await aceRequest("/query_result", { task_id_list: [id] });
	return toTask(result, id);
}

function audioPath(task: TaskEntry): string | null {
	if (task.status !== 1) return null;
	let entries: unknown = task.result;
	if (typeof entries === "string") {
		try { entries = JSON.parse(entries); } catch { return null; }
	}
	const first = Array.isArray(entries) ? entries[0] : null;
	const raw = first && typeof first === "object" && "file" in first ? (first as { file: unknown }).file : null;
	if (typeof raw !== "string" || !raw.startsWith("/v1/audio?")) return null;
	try {
		const uri = new URL(raw, ACE_URL);
		if (uri.origin !== ACE_URL || uri.pathname !== "/v1/audio" || !uri.searchParams.has("path")) return null;
		return uri.pathname + uri.search;
	} catch { return null; }
}

export async function GET(request: Request) {
	const blocked = enabled(request);
	if (blocked) return blocked;
	const params = new URL(request.url).searchParams;
	const action = params.get("action") ?? "status";
	if (action === "status") {
		try {
			await aceRequest("/health", undefined, 2500);
			return NextResponse.json({ connected: true, version: "1.5" });
		} catch {
			return NextResponse.json({ connected: false, instruction: "Inicie o servidor ACE-Step 1.5 na porta 8001 com start_api_server.bat." });
		}
	}
	const taskId = params.get("taskId") ?? "";
	if (!TASK_ID.test(taskId)) return NextResponse.json({ error: "ID de tarefa inválido." }, { status: 400 });
	try {
		const task = await queryTask(taskId);
		if (action === "result") {
			return NextResponse.json({
				status: task.status === 1 ? "ready" : task.status === 2 ? "failed" : "processing",
				ready: task.status === 1 && Boolean(audioPath(task)),
				taskId,
			});
		}
		if (action === "audio") {
			const path = audioPath(task);
			if (!path) return NextResponse.json({ error: "A música ainda não está disponível." }, { status: 409 });
			const upstream = await fetch(ACE_URL + path, { cache: "no-store", signal: AbortSignal.timeout(90000) });
			const type = upstream.headers.get("content-type") ?? "";
			const size = Number(upstream.headers.get("content-length") ?? 0);
			if (!upstream.ok || !upstream.body || !type.startsWith("audio/") || size > MAX_AUDIO_BYTES) {
				return NextResponse.json({ error: "ACE-Step não retornou áudio válido." }, { status: 502 });
			}
			let total = 0;
			const reader = upstream.body.getReader();
			const stream = new ReadableStream<Uint8Array>({
				async pull(controller) {
					const { done, value } = await reader.read();
					if (done) { controller.close(); return; }
					total += value.byteLength;
					if (total > MAX_AUDIO_BYTES) {
						await reader.cancel();
						controller.error(new Error("Áudio ultrapassou o limite de tamanho."));
						return;
					}
					controller.enqueue(value);
				},
				cancel() { void reader.cancel(); },
			});
			return new Response(stream, {
				headers: {
					"Content-Type": type,
					"Content-Disposition": `inline; filename="trilha-ace-step-${taskId}.mp3"`,
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			});
		}
		return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
	} catch {
		return NextResponse.json({ error: "Não foi possível consultar o ACE-Step local." }, { status: 502 });
	}
}

export async function POST(request: Request) {
	const blocked = enabled(request);
	if (blocked) return blocked;
	let input: { prompt?: unknown; duration?: unknown };
	try { input = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
	const prompt = input && typeof input.prompt === "string" ? input.prompt.trim() : "";
	const duration = input && typeof input.duration === "number" ? input.duration : NaN;
	if (!prompt || prompt.length > 1500 || !Number.isFinite(duration) || duration < 10 || duration > 600) {
		return NextResponse.json({ error: "Descreva a trilha e use duração entre 10 e 600 segundos." }, { status: 400 });
	}
	try {
		const result = (await aceRequest("/release_task", {
			prompt: `${prompt}. Instrumental background music, no singing, no spoken words.`,
			lyrics: "[Instrumental]",
			task_type: "text2music",
			audio_duration: duration,
			batch_size: 1,
			audio_format: "mp3",
			thinking: false,
			use_cot_caption: false,
			use_cot_language: false,
			inference_steps: 8,
		}, 30000)) as ApiEnvelope;
		const id = (result.data as { task_id?: unknown } | null)?.task_id;
		if (typeof id !== "string" || !TASK_ID.test(id)) throw new Error("Resposta inválida.");
		return NextResponse.json({ taskId: id });
	} catch {
		return NextResponse.json({ error: "Não foi possível iniciar a geração. Verifique o servidor e os modelos do ACE-Step." }, { status: 502 });
	}
}
