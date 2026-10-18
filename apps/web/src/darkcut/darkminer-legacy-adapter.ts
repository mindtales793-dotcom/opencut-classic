import { sanitizeMinerVideo, type MinerVideo } from "@/darkcut/niche-miner";

/** The original Python DarkMiner 3.6.1 returns snake_case DB fields. */
export type LegacyVideoGroup = "favorites" | "monitor" | "outliers" | "production";
export type LegacyVideo = MinerVideo & {
  source: "desktop";
  group: LegacyVideoGroup;
};
export function normalizeLegacyVideo(row: unknown, group: LegacyVideoGroup): LegacyVideo | null {
  if (!row || typeof row !== "object") return null;
  const input = row as Record<string, unknown>;
  const video = sanitizeMinerVideo({
    video_id: input.video_id ?? input.videoId,
    title: input.title,
    channel: input.channel_title ?? input.channel_name ?? input.channel ?? input.channelTitle,
    views: input.views,
    subscribers: input.subscribers,
    publishedAt: input.published_at ?? input.publishedAt,
    language: input.language,
    // outlier_score is *not* a multiplier in the original DB: use the
    // ratio computed from a channel median by the V3 outlier endpoint.
    outlier: input.outlier_multiplier ?? input.real_outlier_multiplier ?? input.outlier,
    vph: input.vph,
  });
  return video ? { ...video, source: "desktop", group } : null;
}
export function mergeDarkMinerVideos(extension: MinerVideo[], desktop: MinerVideo[]): MinerVideo[] {
  const map = new Map<string, MinerVideo>();
  for (const item of [...extension, ...desktop]) {
    const previous = map.get(item.videoId);
    if (!previous || (!previous.outlier && item.outlier) ||
      (previous.subscribers == null && item.subscribers != null)) {
      map.set(item.videoId, item);
    }
  }
  return [...map.values()];
}
