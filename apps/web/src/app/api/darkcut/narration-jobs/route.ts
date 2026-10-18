import { mkdir, open, readFile, writeFile, rename, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { POST as synthesize } from "../fish/tts/route";
import { splitNarrationIntoChunks, narrationProgress } from "@/darkcut/narration-chunks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobStatus = "running" | "ready" | "error" | "interrupted";
type JobStage = "queued" | "synthesizing" | "downloading" | "combining" | "saving" | "ready" | "error";
type Job = {
  id: string;
  status: JobStatus;
  stage: JobStage;
  error?: string;
  text: string;
  referenceId: string;
  completedChunks: number;
  totalChunks: number;
  currentChunk: number;
  progressPercent: number;
  bytesReceived?: number;
  totalBytes?: number;
};
const running = new Set<string>();
const root = () => join(process.env.DARKCUT_DATA_DIR ?? tmpdir(), "darkcut-narration-jobs");
const valid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const jobFile = (id: string) => join(root(), id + ".json");
const blockFile = (id: string, index: number) => join(root(), `${id}-part-${String(index + 1).padStart(4, "0")}.mp3`);

async function save(job: Job) {
  await mkdir(root(), { recursive: true });
  const name = jobFile(job.id);
  const pending = name + ".tmp";
  await writeFile(pending, JSON.stringify(job));
  await rename(pending, name);
}
async function read(id: string): Promise<Job> {
  return JSON.parse(await readFile(jobFile(id), "utf8")) as Job;
}
async function validMp3(filepath: string) {
  try {
    const s = await stat(filepath);
    if (s.size < 100) return false;
    const file = await open(filepath, "r");
    try {
      const head = Buffer.alloc(4);
      await file.read(head, 0, 4, 0);
      return head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    } finally { await file.close(); }
  } catch { return false; }
}
async function streamMp3(response: Response, filepath: string, onBytes: (received: number, expected: number) => Promise<void>) {
  if (!response.body) throw new Error("Fish Audio retornou uma resposta sem áudio.");
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const file = await open(filepath, "w");
  let received = 0;
  let lastUpdate = Date.now();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value?.length) {
        await file.writeFile(chunk.value);
        received += chunk.value.length;
        if (Date.now() - lastUpdate > 1000) {
          await onBytes(received, total);
          lastUpdate = Date.now();
        }
      }
    }
    await onBytes(received, total);
  } finally {
    reader.releaseLock();
    await file.close();
  }
  if (!await validMp3(filepath)) throw new Error("O Fish Audio não retornou um MP3 válido para este bloco.");
  return received;
}

function ffmpegBinary() {
  const directory = process.env.DARKCUT_VIDEO_TOOLS;
  return directory ? join(directory, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : "ffmpeg";
}
async function mergeMp3Chunks(parts: string[], output: string) {
  if (parts.length === 1) {
    await rename(parts[0] + ".merge-copy", output).catch(async () => {
      // Never move original checkpoint; copy for future retries.
      const { copyFile } = await import("node:fs/promises");
      await copyFile(parts[0], output);
    });
    return;
  }
  // FFmpeg concat demuxer copies encoded frames; no slow whole-video render
  // and no MP3 binary concatenation (which breaks duration metadata).
  const list = output + ".concat.txt";
  const entries = parts.map((file) => `file '${resolve(file).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(list, entries + "\n");
  try {
    await new Promise<void>((resolveDone, reject) => {
      const ff = spawn(ffmpegBinary(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "copy", output], { windowsHide: true });
      let stderr = "";
      ff.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-1400); });
      ff.once("error", reject);
      ff.once("close", (code) => code === 0 ? resolveDone() : reject(new Error(`FFmpeg não conseguiu juntar os blocos: ${stderr || code}`)));
    });
  } finally {
    const { unlink } = await import("node:fs/promises");
    await unlink(list).catch(() => {});
  }
}
async function generate(job: Job, keys: unknown) {
  const id = job.id;
  const chunks = splitNarrationIntoChunks(job.text);
  const total = chunks.length;
  const parts: string[] = [];
  let completed = 0;
  try {
    for (let index = 0; index < total; index++) {
      const part = blockFile(id, index);
      parts.push(part);
      if (await validMp3(part)) {
        completed++;
        await save({ ...job, completedChunks: completed, totalChunks: total, currentChunk: index + 1, progressPercent: narrationProgress(completed, total), stage: "synthesizing" });
        continue;
      }
      await save({ ...job, stage: "synthesizing", completedChunks: completed, totalChunks: total, currentChunk: index + 1, progressPercent: narrationProgress(completed, total), bytesReceived: 0, totalBytes: 0 });
      const response = await synthesize(new Request("http://localhost/api/darkcut/fish/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunks[index], referenceId: job.referenceId, fishApiKeys: keys }),
      }));
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(`Bloco ${index + 1}/${total}: ${error.error || `Fish Audio HTTP ${response.status}`}`);
      }
      const temporary = part + ".tmp";
      await streamMp3(response, temporary, async (bytesReceived, totalBytes) => {
        await save({ ...job, stage: "downloading", completedChunks: completed, totalChunks: total, currentChunk: index + 1, progressPercent: narrationProgress(completed, total), bytesReceived, totalBytes });
      });
      await rename(temporary, part);
      completed++;
      await save({ ...job, stage: "synthesizing", completedChunks: completed, totalChunks: total, currentChunk: Math.min(total, index + 2), progressPercent: narrationProgress(completed, total), bytesReceived: 0, totalBytes: 0 });
    }
    const output = join(root(), id + ".mp3");
    await save({ ...job, stage: "combining", completedChunks: total, totalChunks: total, currentChunk: total, progressPercent: 99 });
    await mergeMp3Chunks(parts, output + ".tmp.mp3");
    if (!await validMp3(output + ".tmp.mp3")) throw new Error("A união dos blocos gerou um arquivo de áudio inválido.");
    await save({ ...job, stage: "saving", completedChunks: total, totalChunks: total, currentChunk: total, progressPercent: 99 });
    await rename(output + ".tmp.mp3", output);
    await save({ ...job, status: "ready", stage: "ready", completedChunks: total, totalChunks: total, currentChunk: total, progressPercent: 100 });
  } catch (error) {
    await save({ ...job, status: "error", stage: "error", completedChunks: completed, totalChunks: total, currentChunk: Math.min(total, completed + 1), progressPercent: narrationProgress(completed, total), error: error instanceof Error ? error.message : "Falha na narração." }).catch(() => {});
  } finally {
    running.delete(id);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!valid(id)) return Response.json({ error: "Tarefa inválida." }, { status: 400 });
  try {
    const job = await read(id);
    if (url.searchParams.get("audio") === "1") {
      if (job.status !== "ready") return Response.json({ error: "Narração ainda não concluída." }, { status: 409 });
      const filename = join(root(), id + ".mp3");
      const info = await stat(filename);
      return new Response(Readable.toWeb(createReadStream(filename)) as unknown as ReadableStream<Uint8Array>, {
        headers: { "Content-Type": "audio/mpeg", "Content-Length": String(info.size), "Cache-Control": "no-store" },
      });
    }
    const status = job.status === "running" && !running.has(id) ? "interrupted" : job.status;
    return Response.json({
      id, status, stage: job.stage, error: job.error,
      currentChunk: job.currentChunk ?? 0,
      completedChunks: job.completedChunks ?? 0,
      totalChunks: job.totalChunks ?? 0,
      progressPercent: job.progressPercent ?? 0,
      bytesReceived: job.bytesReceived ?? 0,
      totalBytes: job.totalBytes ?? 0,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof body.text !== "string" || !body.text.trim() ||
    body.text.length > 100_000 || typeof body.referenceId !== "string") {
    return Response.json({ error: "Roteiro ou narrador inválido." }, { status: 400 });
  }
  const text = body.text.trim();
  const referenceId = body.referenceId.trim();
  const chunks = splitNarrationIntoChunks(text);
  if (!chunks.length) return Response.json({ error: "Roteiro vazio." }, { status: 400 });
  const receivedId = typeof body.id === "string" && valid(body.id) ? body.id : randomUUID();
  let id = receivedId;
  let old: Job | null = null;
  try { old = await read(id); } catch { /* New job */ }
  if (old && (old.text !== text || old.referenceId !== referenceId)) {
    // A changed script/voice must never reuse old block MP3 checkpoints.
    id = randomUUID();
    old = null;
  }
  if (old?.status === "ready") return Response.json({ id, status: "ready", completedChunks: chunks.length, totalChunks: chunks.length, progressPercent: 100 });
  if (running.has(id)) return Response.json({ id, status: "running", completedChunks: old?.completedChunks ?? 0, totalChunks: chunks.length });
  const job: Job = {
    id, status: "running", stage: "queued",
    text, referenceId, completedChunks: old?.completedChunks ?? 0, totalChunks: chunks.length,
    currentChunk: 0, progressPercent: narrationProgress(old?.completedChunks ?? 0, chunks.length),
  };
  running.add(id);
  try { await save(job); }
  catch {
    running.delete(id);
    return Response.json({ error: "Não foi possível salvar a tarefa." }, { status: 500 });
  }
  // Keys remain in memory; never persist secrets in the checkpoint metadata.
  void generate(job, body.fishApiKeys);
  return Response.json({ id, status: "running", totalChunks: chunks.length, completedChunks: job.completedChunks, progressPercent: job.progressPercent }, { status: 202 });
}
