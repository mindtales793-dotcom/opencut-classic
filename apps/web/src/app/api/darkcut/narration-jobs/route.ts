import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { POST as synthesize } from "../fish/tts/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Job = {
	id: string;
	status: "running" | "ready" | "error" | "interrupted";
	error?: string;
	text: string;
	referenceId: string;
};
const running = new Set<string>();
const root = () =>
	join(process.env.DARKCUT_DATA_DIR ?? tmpdir(), "darkcut-narration-jobs");
const valid = (id: string) => /^[0-9a-f-]{36}$/.test(id);
async function save(job: Job) {
	await mkdir(root(), { recursive: true });
	const p = join(root(), job.id + ".json");
	await writeFile(p + ".tmp", JSON.stringify(job));
	await rename(p + ".tmp", p);
}
async function read(id: string): Promise<Job> {
	return JSON.parse(await readFile(join(root(), id + ".json"), "utf8"));
}
export async function GET(request: Request) {
	const url = new URL(request.url),
		id = url.searchParams.get("id") ?? "";
	if (!valid(id))
		return Response.json({ error: "Tarefa inválida." }, { status: 400 });
	try {
		const job = await read(id);
		if (url.searchParams.get("audio") === "1" && job.status === "ready")
			return new Response(await readFile(join(root(), id + ".mp3")), {
				headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
			});
		const status =
			job.status === "running" && !running.has(id) ? "interrupted" : job.status;
		return Response.json(
			{ id, status, error: job.error },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
	}
}
export async function POST(request: Request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "JSON inválido." }, { status: 400 });
	}
	if (!body || typeof body !== "object") return Response.json({error:"JSON inválido."},{status:400});
	if (
		typeof body.text !== "string" ||
		!body.text.trim() ||
		body.text.length > 100000 ||
		typeof body.referenceId !== "string"
	)
		return Response.json(
			{ error: "Roteiro ou narrador inválido." },
			{ status: 400 },
		);
	const id =
		typeof body.id === "string" && valid(body.id) ? body.id : randomUUID();
	let job: Job = {
		id,
		status: "running",
		text: body.text,
		referenceId: body.referenceId,
	};
	try {
		const old = await read(id);
		if (old.status === "ready" || running.has(id))
			return Response.json({ id, status: old.status });
		job = { ...old, status: "running", error: undefined };
	} catch {}
	running.add(id);
	try {
		await save(job);
	} catch {
		running.delete(id);
		return Response.json(
			{ error: "Não foi possível salvar a tarefa." },
			{ status: 500 },
		);
	}
	// Local server operation; keys stay only in memory, never in job files.
	void (async () => {
		try {
			const response = await synthesize(
				new Request("http://localhost/api/darkcut/fish/tts", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						text: job.text,
						referenceId: job.referenceId,
						fishApiKeys: body.fishApiKeys,
					}),
				}),
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? "Falha na narração.");
			}
			const output = join(root(), id + ".mp3");
			await writeFile(
				output + ".tmp",
				Buffer.from(await response.arrayBuffer()),
			);
			await rename(output + ".tmp", output);
			await save({ ...job, status: "ready" });
		} catch (error) {
			await save({
				...job,
				status: "error",
				error: error instanceof Error ? error.message : "Falha na narração.",
			}).catch(() => {});
		} finally {
			running.delete(id);
		}
	})();
	return Response.json({ id, status: "running" }, { status: 202 });
}
