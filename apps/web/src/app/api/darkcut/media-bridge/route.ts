import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES_PER_PROJECT = 500;
const MAX_PENDING_RETURNED = 100;

type InboxEntry = {
  id: string;
  projectId: string;
  sceneIndex: number;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  state: "pending" | "imported";
  assetId?: string;
};

function bridgeConfig() {
  const dataDir = process.env.DARKCUT_DATA_DIR;
  const token = process.env.DARKCUT_MEDIA_BRIDGE_TOKEN;
  if (!dataDir || !token) return null;
  return { root: path.join(dataDir, "media-bridge", "inbox"), token };
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function authorized(request: Request, token: string) {
  const supplied = request.headers.get("x-darkcut-bridge-token") ?? "";
  const actual = Buffer.from(token, "utf8");
  const proposed = Buffer.from(supplied, "utf8");
  return actual.length === proposed.length && timingSafeEqual(actual, proposed);
}

function safeProjectId(value: string | null) {
  return value && /^[A-Za-z0-9_-]{3,90}$/.test(value) ? value : null;
}

function safeId(value: string | null) {
  return value && /^[a-f0-9-]{36}$/.test(value) ? value : null;
}

function sceneNumber(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null;
}

function detectFileType(data: Buffer, file: File) {
  const name = file.name.trim().replace(/[\\/]/g, "-").slice(0, 180);
  const lower = name.toLowerCase();
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const webp = data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
  const mp4 = data.subarray(4, 8).toString() === "ftyp";
  const webm = data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (png && lower.endsWith(".png")) return { extension: ".png", contentType: "image/png", name };
  if (jpeg && /\.jpe?g$/.test(lower)) return { extension: ".jpg", contentType: "image/jpeg", name };
  if (webp && lower.endsWith(".webp")) return { extension: ".webp", contentType: "image/webp", name };
  if (mp4 && lower.endsWith(".mp4")) return { extension: ".mp4", contentType: "video/mp4", name };
  if (webm && lower.endsWith(".webm")) return { extension: ".webm", contentType: "video/webm", name };
  return null;
}

async function loadEntries(dir: string): Promise<InboxEntry[]> {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const entries: InboxEntry[] = [];
  for (const name of names.filter((item) => /^[a-f0-9-]{36}\.json$/.test(item)).slice(0, MAX_FILES_PER_PROJECT + 1)) {
    try {
      const item = JSON.parse(await readFile(path.join(dir, name), "utf8")) as InboxEntry;
      if (item.id + ".json" === name && (item.state === "pending" || item.state === "imported")) entries.push(item);
    } catch { /* Ignore partial or corrupted metadata, never execute it. */ }
  }
  return entries;
}

export async function GET(request: Request) {
  const config = bridgeConfig();
  if (!config) return response({ error: "A ponte de mídias funciona apenas no aplicativo DarkCut para Windows." }, 503);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "pair") {
    // The bearer token is exposed only to the local DarkCut UI, never to an extension.
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const expected = "http://127.0.0.1:3217";
    const sameOrigin = request.headers.get("sec-fetch-site") === "same-origin";
    if (origin && origin !== expected) return response({ error: "Origem não autorizada." }, 403);
    if (!sameOrigin || !referer?.startsWith(expected + "/")) return response({ error: "Acesse pelo DarkCut Studio." }, 403);
    return response({ enabled: true, token: config.token });
  }
  if (!authorized(request, config.token)) return response({ error: "Conexão não autorizada." }, 401);
  if (action === "status") return response({ enabled: true, maxBytes: MAX_BYTES });
  const projectId = safeProjectId(url.searchParams.get("projectId"));
  if (!projectId) return response({ error: "Projeto inválido." }, 400);
  const dir = path.join(config.root, projectId);
  if (action === "list") {
    const entries = await loadEntries(dir);
    return response({
      pending: entries.filter((item) => item.state === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, MAX_PENDING_RETURNED),
      total: entries.length,
    });
  }
  if (action === "file") {
    const id = safeId(url.searchParams.get("id"));
    if (!id) return response({ error: "Identificador inválido." }, 400);
    let item: InboxEntry;
    try { item = JSON.parse(await readFile(path.join(dir, id + ".json"), "utf8")) as InboxEntry; }
    catch { return response({ error: "Arquivo não encontrado." }, 404); }
    if (item.id !== id || item.projectId !== projectId || item.state !== "pending") return response({ error: "Arquivo indisponível." }, 404);
    const ext = item.contentType === "image/png" ? ".png" :
      item.contentType === "image/jpeg" ? ".jpg" :
      item.contentType === "image/webp" ? ".webp" :
      item.contentType === "video/mp4" ? ".mp4" : ".webm";
    try {
      const bytes = await readFile(path.join(dir, id + ext));
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": item.contentType, "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch { return response({ error: "Arquivo não encontrado." }, 404); }
  }
  return response({ error: "Ação inválida." }, 400);
}

export async function POST(request: Request) {
  const config = bridgeConfig();
  if (!config) return response({ error: "A ponte não está disponível fora do aplicativo Windows." }, 503);
  if (!authorized(request, config.token)) return response({ error: "Conexão não autorizada." }, 401);
  const action = new URL(request.url).searchParams.get("action");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 65536) return response({ error: "Arquivo grande demais (máximo 64 MB)." }, 413);

  if (action === "upload") {
    let form: FormData;
    try { form = await request.formData(); }
    catch { return response({ error: "Envie mídia via formulário." }, 400); }
    const projectId = safeProjectId(String(form.get("projectId") ?? ""));
    const sceneIndex = sceneNumber(form.get("sceneIndex"));
    const file = form.get("file");
    if (!projectId || !sceneIndex || !(file instanceof File)) return response({ error: "Projeto, número da cena e arquivo são obrigatórios." }, 400);
    if (file.size < 1 || file.size > MAX_BYTES) return response({ error: "Arquivo fora do limite de 64 MB." }, 413);
    const dir = path.join(config.root, projectId);
    await mkdir(dir, { recursive: true });
    const entries = await loadEntries(dir);
    if (entries.length >= MAX_FILES_PER_PROJECT) return response({ error: "Limite de 500 arquivos por projeto atingido." }, 409);
    const bytes = Buffer.from(await file.arrayBuffer());
    const verified = detectFileType(bytes, file);
    if (!verified) return response({ error: "Formato inválido. Aceitos PNG, JPG, WebP, MP4 e WebM." }, 415);
    const id = randomUUID();
    const entry: InboxEntry = {
      id, projectId, sceneIndex, filename: verified.name,
      contentType: verified.contentType, size: bytes.length,
      createdAt: new Date().toISOString(), state: "pending",
    };
    await writeFile(path.join(dir, id + verified.extension), bytes, { flag: "wx" });
    await writeFile(path.join(dir, id + ".json"), JSON.stringify(entry), { flag: "wx" });
    return response({ ok: true, id, sceneIndex }, 201);
  }

  if (action === "ack") {
    let payload: unknown;
    try { payload = await request.json(); }
    catch { return response({ error: "JSON inválido." }, 400); }
    const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const projectId = safeProjectId(typeof data.projectId === "string" ? data.projectId : null);
    const id = safeId(typeof data.id === "string" ? data.id : null);
    const assetId = typeof data.assetId === "string" && /^[A-Za-z0-9_-]{2,100}$/.test(data.assetId) ? data.assetId : null;
    if (!projectId || !id || !assetId) return response({ error: "Confirmação inválida." }, 400);
    const dir = path.join(config.root, projectId);
    const filename = path.join(dir, id + ".json");
    let item: InboxEntry;
    try { item = JSON.parse(await readFile(filename, "utf8")) as InboxEntry; }
    catch { return response({ error: "Entrada não encontrada." }, 404); }
    if (item.id !== id || item.projectId !== projectId) return response({ error: "Entrada inválida." }, 400);
    if (item.state === "imported") return response({ ok: true, imported: true });
    const tmp = path.join(dir, id + ".tmp.json");
    await writeFile(tmp, JSON.stringify({ ...item, state: "imported", assetId }), { flag: "w" });
    await rename(tmp, filename);
    return response({ ok: true, imported: true });
  }
  return response({ error: "Ação inválida." }, 400);
}
