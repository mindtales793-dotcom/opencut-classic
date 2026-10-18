import { NextResponse } from "next/server";
import { sanitizeMinerVideo, type MinerVideo } from "@/darkcut/niche-miner";

/**
 * Read-only bridge to a user-owned Dark Miner Desktop backend.
 * NEVER forward arbitrary URLs, write its database, or expose API credentials.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HOST = "127.0.0.1";
const PORTS = Array.from({ length: 11 }, (_, index) => 8000 + index);
const MAX_RESPONSE_BYTES = 2_000_000;
const allowedOrigins = new Set(["http://127.0.0.1:3217", "http://localhost:3217"]);

type LegacyStatus = { ok?: boolean; version?: string; configured_keys?: number };
type LegacyCollection = { items?: unknown[] };
type VideoWithSource = MinerVideo & { source: "desktop"; group: "favorites" | "monitor" | "outliers" | "production" };

async function localJSON<T>(port: number, endpoint: string, timeout = 2500): Promise<T> {
  const response = await fetch(`http://${HOST}:${port}${endpoint}`, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Resposta excessivamente grande");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Limite da resposta excedido");
  return JSON.parse(text) as T;
}
function normalizeEntry(row: unknown, group: VideoWithSource["group"]): VideoWithSource | null {
  if (!row || typeof row !== "object") return null;
  const input = row as Record<string, unknown>;
  // Real legacy fields: video_id, channel_title, published_at,
  // outlier_multiplier / real_outlier and vph, not synthetic view metrics.
  const video = sanitizeMinerVideo({
    video_id: input.video_id ?? input.videoId,
    title: input.title,
    channel: input.channel_title ?? input.channel_name ?? input.channel ?? input.channelTitle,
    views: input.views, subscribers: input.subscribers,
    publishedAt: input.published_at ?? input.publishedAt,
    language: input.language,
    outlier: input.real_outlier_multiplier ?? input.outlier_multiplier ?? input.outlier ?? input.outlier_ratio,
    vph: input.vph,
  });
  return video ? { ...video, source: "desktop", group } : null;
}
function blockedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return Boolean((origin && !allowedOrigins.has(origin)) ||
    (site && !["same-origin", "none"].includes(site)));
}
const reply = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

export async function GET(request: Request) {
  if (!process.env.DARKCUT_DATA_DIR) return reply({
    connected: false, error: "Integração disponível no DarkCut Windows.",
  }, 503);
  if (blockedOrigin(request)) return reply({ error: "Origem não autorizada." }, 403);
  let port: number | null = null;
  let status: LegacyStatus | null = null;
  for (const candidate of PORTS) {
    try {
      const result = await localJSON<LegacyStatus>(candidate, "/api/status", 450);
      if (result?.ok === true && /^3\./.test(result.version || "")) {
        port = candidate; status = result; break;
      }
    } catch { /* Old desktop may be offline or bound to another local port. */ }
  }
  if (!port) return reply({
    connected: false, status: "offline",
    message: "Abra o Dark Miner Desktop 3.6.1 ou selecione seu executável pelo DarkCut.",
  });

  const action = new URL(request.url).searchParams.get("action") ?? "all";
  if (action === "status") return reply({
    connected: true, port, version: status?.version,
    // Never forward configured_keys, key masks, environment paths or server internals.
    url: `http://${HOST}:${port}/`,
  });
  if (action !== "all") return reply({ error: "Ação desconhecida." }, 400);

  const endpoints = [
    ["favorites", "/api/favorites"],
    ["monitor", "/api/monitoring"],
    ["outliers", "/api/v3/outliers?min_multiplier=0&days=3650&limit=120"],
    ["production", "/api/v3/production"],
  ] as const;
  const fetched = await Promise.allSettled(endpoints.map(async ([group, endpoint]) => ({
    group,
    items: (await localJSON<LegacyCollection>(port!, endpoint, 5000)).items ?? [],
  })));
  const merged = new Map<string, VideoWithSource>();
  const groups: Record<string, number> = {};
  const unavailable: string[] = [];
  for (let i = 0; i < fetched.length; i++) {
    const r = fetched[i], group = endpoints[i][0];
    if (r.status !== "fulfilled" || !Array.isArray(r.value.items)) {
      unavailable.push(group); continue;
    }
    const videos = r.value.items.slice(0, 200).map(row => normalizeEntry(row, group)).filter((row): row is VideoWithSource => row != null);
    groups[group] = videos.length;
    for (const video of videos) {
      const previous = merged.get(video.videoId);
      // Prefer the entry with richer evidence, preserve original context.
      if (!previous || (!previous.outlier && video.outlier) || (!previous.subscribers && video.subscribers)) {
        merged.set(video.videoId, video);
      }
    }
  }
  return reply({
    connected: true, port, version: status?.version,
    url: `http://${HOST}:${port}/`,
    groups, unavailable,
    videos: [...merged.values()].slice(0, 400),
    note: "Leitura local, sem escrita na base do Dark Miner e sem compartilhar suas chaves.",
  });
}
