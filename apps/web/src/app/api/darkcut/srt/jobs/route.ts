import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TimedWord = { word: string; start: number; end: number };
type Transcription = { text: string; words: TimedWord[]; chunks: number };
type TranscriptionJob = {
  id: string;
  status: "running" | "ready" | "error" | "interrupted";
  stage: "uploading" | "preparing" | "transcribing" | "saving" | "ready" | "error";
  name: string;
  model: string;
  format: string;
  total: number;
  completed: number;
  progressPercent: number;
  message: string;
  error?: string;
  updatedAt: number;
};
const root = () => path.join(process.env.DARKCUT_DATA_DIR || tmpdir(), "darkcut-srt-v24");
const running = new Set<string>();
const MAX_UPLOAD = 300 * 1024 * 1024;
const PART_SECONDS = 480;
const validId = (s: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const validModels = new Set(["whisper-large-v3", "whisper-large-v3-turbo"]);
const extensions = new Set(["mp3", "wav", "m4a", "ogg", "flac", "webm", "mp4"]);
const output = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function localOnly(req: Request) {
  const u = new URL(req.url);
  const host = u.hostname;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  return (host === "127.0.0.1" || host === "localhost") &&
    (!origin || origin === u.origin) &&
    (!site || site === "same-origin" || site === "none");
}
const directory = (id: string) => path.join(root(), id);
async function readJob(id: string): Promise<TranscriptionJob> {
  return JSON.parse(await readFile(path.join(directory(id), "job.json"), "utf8")) as TranscriptionJob;
}
async function save(job: TranscriptionJob) {
  const dir = directory(job.id);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, "job.json");
  const temp = path.join(dir, "job.pending.json");
  await writeFile(temp, JSON.stringify({ ...job, updatedAt: Date.now() }));
  await rename(temp, dest);
}
function binary(tool: "ffmpeg" | "ffprobe") {
  const bin = process.platform === "win32" ? tool + ".exe" : tool;
  return process.env.DARKCUT_VIDEO_TOOLS ? path.join(process.env.DARKCUT_VIDEO_TOOLS, bin) : bin;
}
async function execute(command: "ffmpeg" | "ffprobe", args: string[], timeout = 180_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary(command), args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const kill = setTimeout(() => { child.kill(); reject(new Error("FFmpeg excedeu o tempo de processamento.")); }, timeout);
    child.stdout.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-200_000); });
    child.stderr.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-100_000); });
    child.once("error", error => { clearTimeout(kill); reject(new Error("FFmpeg/FFprobe indisponível: " + error.message)); });
    child.once("close", code => {
      clearTimeout(kill);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error("FFmpeg: " + stderr.slice(-500)));
    });
  });
}
async function durationOf(file: string) {
  const result = await execute("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], 30_000);
  const duration = Number(result.stdout.trim());
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error("Não foi possível ler a duração da narração.");
  return duration;
}
async function segmentsFor(id: string) {
  const dir = directory(id);
  const existing = (await readdir(dir)).filter(name => /^part-\d{5}\.mp3$/.test(name)).sort();
  if (existing.length) return existing.map(name => path.join(dir, name));
  const input = path.join(dir, "source");
  // Always generate independently decodable segments; 48kbps mono is typically
  // < 4 MB per eight minutes, safely below Groq's upload cap.
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
    "-f", "segment", "-segment_time", String(PART_SECONDS), "-reset_timestamps", "1",
    path.join(dir, "part-%05d.mp3"),
  ], 360_000);
  const parts = (await readdir(dir)).filter(name => /^part-\d{5}\.mp3$/.test(name)).sort();
  if (!parts.length) throw new Error("FFmpeg não conseguiu preparar nenhum bloco de áudio.");
  return parts.map(name => path.join(dir, name));
}
async function groq(part: string, apiKey: string, model: string): Promise<{ text?: string; words?: TimedWord[] }> {
  const bytes = await readFile(part);
  if (bytes.length > 24 * 1024 * 1024) throw new Error("Bloco ultrapassou 24 MB.");
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], path.basename(part), { type: "audio/mpeg" }));
  form.set("model", model);
  form.set("response_format", "verbose_json");
  form.set("language", "pt");
  form.set("timestamp_granularities[]", "word");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: "Bearer " + apiKey },
        body: form, cache: "no-store", signal: AbortSignal.timeout(240_000),
      });
    } catch (error) {
      if (attempt < 2) { await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1700)); continue; }
      throw new Error("Falha de conexão com a Groq. Verifique internet e proxy. " + (error instanceof Error ? error.message : ""));
    }
    if (response.ok) return await response.json() as {text?: string;words?: TimedWord[]};
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retry = Number(response.headers.get("retry-after"));
      await new Promise(resolve => setTimeout(resolve, retry > 0 ? Math.min(10000, retry * 1000) : 1800 * (attempt + 1)));
      continue;
    }
    const friendly = response.status === 403
      ? "HTTP 403: sua organização/projeto não autorizou este modelo ou a requisição foi bloqueada."
      : response.status === 401 ? "HTTP 401: chave Groq recusada."
      : response.status === 429 ? "HTTP 429: cota ou limite da Groq atingido."
      : result.error?.message || `Groq HTTP ${response.status}`;
    throw new Error(friendly.slice(0, 360));
  }
  throw new Error("Falha temporária de transcrição.");
}
async function work(job: TranscriptionJob, apiKey: string) {
  const dir = directory(job.id);
  let completed = 0;
  try {
    job.stage = "preparing"; job.message = "FFmpeg preparando blocos de áudio"; await save(job);
    const parts = await segmentsFor(job.id);
    job.total = parts.length;
    let offset = 0;
    const transcript: Transcription = { text: "", words: [], chunks: parts.length };
    const fragments: string[] = [];
    for (let index = 0; index < parts.length; index++) {
      const checkpoint = path.join(dir, `words-${String(index).padStart(5, "0")}.json`);
      const duration = await durationOf(parts[index]);
      job.completed = completed; job.progressPercent = Math.min(99, Math.floor(100 * completed / parts.length));
      job.stage = "transcribing"; job.message = `Reconhecendo bloco ${index + 1} de ${parts.length}`; await save(job);
      let result: { text?: string; words?: TimedWord[] };
      try {
        result = JSON.parse(await readFile(checkpoint, "utf8")) as typeof result;
      } catch {
        result = await groq(parts[index], apiKey, job.model);
        if (!Array.isArray(result.words) || !result.words.length) throw new Error(`O bloco ${index + 1} não devolveu horários por palavra.`);
        await writeFile(checkpoint + ".tmp", JSON.stringify(result));
        await rename(checkpoint + ".tmp", checkpoint);
      }
      fragments.push(String(result.text || "").trim());
      for (const word of result.words || []) {
        const start = Number(word.start), end = Number(word.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          transcript.words.push({word:String(word.word || "").slice(0,150),start:start + offset,end:end + offset});
        }
      }
      offset += duration;
      completed++;
      job.completed = completed;
      job.progressPercent = Math.min(99, Math.floor(100 * completed / parts.length));
      await save(job);
    }
    transcript.text = fragments.filter(Boolean).join(" ");
    job.stage = "saving";job.progressPercent = 99;job.message = "Salvando transcrição consolidada";await save(job);
    await writeFile(path.join(dir, "result.json.tmp"), JSON.stringify(transcript));
    await rename(path.join(dir, "result.json.tmp"), path.join(dir, "result.json"));
    job.status = "ready";job.stage = "ready";job.progressPercent = 100;job.message = `${transcript.words.length} palavras transcritas em ${completed} blocos`;
    await save(job);
  } catch (error) {
    job.status = "error";job.stage = "error";job.completed = completed;
    job.progressPercent = job.total > 0 ? Math.min(99, Math.floor(100 * completed / job.total)) : 0;
    job.error = error instanceof Error ? error.message : "Falha ao transcrever";
    job.message = `Falha no bloco ${completed + 1}; os anteriores foram preservados.`;
    await save(job).catch(() => {});
  } finally {
    running.delete(job.id);
  }
}
async function detectSilences(input: string) {
  const out = await execute("ffmpeg", [
    "-hide_banner", "-nostdin", "-i", input,
    "-af", "silencedetect=noise=-35dB:d=0.28", "-f", "null", "-",
  ], 240_000);
  const matches: { start: number; end: number }[] = [];
  let started: number | null = null;
  for (const line of out.stderr.split("\n")) {
    const a = line.match(/silence_start:\s*([\d.]+)/);
    const b = line.match(/silence_end:\s*([\d.]+)/);
    if (a) started = Number(a[1]);
    if (b && started !== null) {
      matches.push({start:started,end:Number(b[1])});
      started = null;
    }
  }
  return matches.slice(0,5000);
}
export async function GET(req: Request) {
  if (!localOnly(req)) return output({error:"Origem não autorizada."},403);
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!validId(id)) return output({error:"Tarefa inválida."},400);
  try {
    const job = await readJob(id);
    const status = job.status === "running" && !running.has(id) ? "interrupted" : job.status;
    if (new URL(req.url).searchParams.get("result") === "1") {
      if (job.status !== "ready") return output({error:"Transcrição ainda não concluída."},409);
      return output(JSON.parse(await readFile(path.join(directory(id), "result.json"), "utf8")));
    }
    return output({...job,status});
  } catch {return output({error:"Tarefa não encontrada."},404);}
}
export async function POST(req: Request) {
  if (!localOnly(req)) return output({error:"Origem não autorizada."},403);
  if (!process.env.DARKCUT_DATA_DIR) return output({error:"Processamento longo funciona apenas no DarkCut Windows."},503);
  const kind = req.headers.get("content-type") || "";
  if (kind.includes("application/json")) {
    let data: Record<string, unknown>;
    try {data = await req.json() as Record<string, unknown>;} catch {return output({error:"JSON inválido."},400);}
    const action = String(data.action||"");
    const apiKey = String(data.apiKey||"");
    if (action === "test-key") {
      if (!apiKey.startsWith("gsk_")) return output({error:"Chave Groq ausente."},400);
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/models",{
          headers:{Authorization:"Bearer "+apiKey},cache:"no-store",signal:AbortSignal.timeout(12000)
        });
        if (!resp.ok) return output({error:resp.status===403?"HTTP 403: acesso à Groq bloqueado neste projeto.":`Groq HTTP ${resp.status}`},resp.status);
        const list = await resp.json() as {data?:Array<{id:string}>};
        return output({ok:true,models:(list.data||[]).filter(x=>validModels.has(x.id)).map(x=>x.id)});
      }catch{return output({error:"Falha de conexão com a Groq."},502);}
    }
    if (action !== "resume") return output({error:"Ação inválida."},400);
    const id = String(data.id||"");
    if (!validId(id) || !apiKey.startsWith("gsk_") || apiKey.length>512) return output({error:"Tarefa ou chave inválida."},400);
    let job:TranscriptionJob;
    try {job = await readJob(id);}catch{return output({error:"Tarefa não encontrada."},404);}
    if (job.status === "ready") return output({...job});
    if (running.has(id)) return output({...job});
    job.status = "running";job.stage = "preparing";job.error = undefined;
    running.add(id); await save(job);
    void work(job,apiKey);
    return output({...job},202);
  }
  if (!kind.includes("multipart/form-data")) return output({error:"Envie um áudio ou uma tarefa."},415);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD + 65536) return output({error:"Áudio excede 300 MB."},413);
  let form:FormData;
  try {form = await req.formData();}catch{return output({error:"Não foi possível ler o upload."},400);}
  const file = form.get("audio");
  if (!(file instanceof File) || file.size<64 || file.size>MAX_UPLOAD) return output({error:"Selecione áudio válido de até 300 MB."},413);
  const extension = file.name.toLowerCase().split(".").at(-1)||"";
  if (!extensions.has(extension)) return output({error:"Formato de áudio não suportado."},415);
  const mode = String(form.get("mode")||"transcribe");
  if (mode !== "transcribe" && mode !== "silences") return output({error:"Operação desconhecida."},400);
  const key = String(form.get("apiKey")||"");
  const model = String(form.get("model")||"whisper-large-v3-turbo");
  if (mode === "transcribe" && (!key.startsWith("gsk_") || key.length>512 || !validModels.has(model))) {
    return output({error:"Configure sua chave Groq e selecione o modelo."},400);
  }
  const id = randomUUID(), dir = directory(id);
  await mkdir(dir,{recursive:true});
  const source = path.join(dir,"source");
  try {await writeFile(source,new Uint8Array(await file.arrayBuffer()),{flag:"wx"});}
  catch{return output({error:"Não foi possível salvar o áudio no projeto."},500);}
  if (mode === "silences") {
    try {
      const duration = await durationOf(source);
      const silences = await detectSilences(source);
      await rm(dir,{recursive:true,force:true});
      return output({duration,silences});
    }catch(error){
      await rm(dir,{recursive:true,force:true});
      return output({error:error instanceof Error ? error.message:"Falha ao analisar pausas."},502);
    }
  }
  if (running.size>=2) {await rm(dir,{recursive:true,force:true});return output({error:"Já há duas transcrições em andamento."},429);}
  const job:TranscriptionJob = {id,status:"running",stage:"uploading",name:file.name.slice(0,180),model,format:extension,total:0,completed:0,progressPercent:0,message:"Áudio recebido",updatedAt:Date.now()};
  running.add(id);
  await save(job);
  void work(job,key);
  return output({id,status:"running",progressPercent:0},202);
}
