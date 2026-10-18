/** Curated CRIS sound-design cues; Gemini recommends existing sounds, not synthesize them. */
export const CRIS_SOUND_QUERIES = {
  "cinematic-impact": "soft cinematic impact",
  "soft-whoosh": "soft whoosh transition",
  "car-door": "car door open close",
  "car-engine": "car engine starting",
  "bus-arrival": "bus arrival brakes",
  "rain": "rain gentle ambience",
  "footsteps": "footsteps walking",
  "paper": "paper rustling",
  "money": "coins counting",
  "keyboard": "computer keyboard typing",
  "notification": "soft notification chime",
  "city": "quiet city ambience",
} as const;
export const CRIS_SOUND_PRESETS = Object.keys(CRIS_SOUND_QUERIES) as Array<keyof typeof CRIS_SOUND_QUERIES>;
export type CrisSoundPreset = "none" | keyof typeof CRIS_SOUND_QUERIES;
export type CrisSoundPlacement = "start" | "middle" | "end";
export type CrisSoundCue = { preset: CrisSoundPreset; placement: CrisSoundPlacement };
const SILENT: CrisSoundCue = { preset: "none", placement: "start" };

export function guessCrisSoundCue(text: string, sceneType: string, index: number): CrisSoundCue {
  const t = text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/porta (do |de )?carro|abriu a porta|fechou a porta/.test(t)) return { preset: "car-door", placement: "middle" };
  if (/ligou o motor|deu a partida|motor ligando/.test(t)) return { preset: "car-engine", placement: "middle" };
  if (/onibus (chegou|parou)|ponto de onibus/.test(t)) return { preset: "bus-arrival", placement: "middle" };
  if (/chovia|chuva|tempestade/.test(t)) return { preset: "rain", placement: "start" };
  if (/passos|caminhou|andando a pe/.test(t)) return { preset: "footsteps", placement: "middle" };
  if (/assinou (o )?contrato|folheou|papel/.test(t)) return { preset: "paper", placement: "middle" };
  if (/moedas|contando moedas/.test(t)) return { preset: "money", placement: "middle" };
  if (/digitou|teclado|computador/.test(t)) return { preset: "keyboard", placement: "middle" };
  if (sceneType === "hook" && index === 0) return { preset: "cinematic-impact", placement: "start" };
  if (sceneType === "turn" && index % 3 === 0) return { preset: "soft-whoosh", placement: "start" };
  return SILENT;
}

export function normalizeCrisSoundCue(value: unknown, fallback: CrisSoundCue = SILENT): CrisSoundCue {
  if (!value || typeof value !== "object") return fallback;
  const data = value as Record<string, unknown>;
  const preset: CrisSoundPreset =
    data.preset === "none" || CRIS_SOUND_PRESETS.includes(data.preset as keyof typeof CRIS_SOUND_QUERIES)
      ? data.preset as CrisSoundPreset : fallback.preset;
  const placement: CrisSoundPlacement =
    data.placement === "start" || data.placement === "middle" || data.placement === "end"
      ? data.placement : fallback.placement;
  return { preset, placement };
}

export type CrisSoundTimelineCue = {
  sceneIndex: number;
  preset: Exclude<CrisSoundPreset, "none">;
  query: string;
  startSeconds: number;
  maxDurationSeconds: number;
  volumeDb: number;
};

/** Timing comes from the real editor timeline, not word-count estimates. */
export function buildCrisSoundTimeline({
  scenes, timings,
}: {
  scenes: Array<{ sound?: CrisSoundCue }>;
  timings: Array<{ startSeconds: number; durationSeconds: number } | null>;
}): CrisSoundTimelineCue[] {
  return scenes.flatMap((scene, sceneIndex) => {
    const timing = timings[sceneIndex];
    const sound = scene.sound;
    if (!timing || !sound || sound.preset === "none") return [];
    if (!Number.isFinite(timing.startSeconds) || !Number.isFinite(timing.durationSeconds) || timing.durationSeconds < 0.8) return [];
    const ratio = sound.placement === "middle" ? 0.4 : sound.placement === "end" ? 0.7 : 0;
    const startSeconds = Math.max(0, timing.startSeconds + timing.durationSeconds * ratio);
    const remaining = timing.startSeconds + timing.durationSeconds - startSeconds;
    const maxDurationSeconds = Math.min(2.5, remaining - 0.1);
    if (maxDurationSeconds < 0.3) return [];
    return [{
      sceneIndex,
      preset: sound.preset,
      query: CRIS_SOUND_QUERIES[sound.preset],
      startSeconds,
      maxDurationSeconds,
      volumeDb: sound.preset === "rain" || sound.preset === "city" ? -26 : -19,
    }];
  });
}

/** Automatic sound placement accepts only attribution-free CC0 licences. */
export function isCrisAutoSoundLicense(license: string): boolean {
  return /\bcc0\b|creativecommons\.org\/publicdomain\/zero/i.test(license);
}
