/**
 * Small, dependency-free score generator for voiceover backing tracks.
 * This is procedural synthesis, not generative AI. No model, provider,
 * copyrighted samples, network access or API key is involved.
 */
export const LIGHT_MUSIC_STYLES = [
  { id: "documentary", label: "Documentário", detail: "Piano sutil e atmosfera investigativa" },
  { id: "emotional", label: "Emocional", detail: "Acordes acolhedores e melodia suave" },
  { id: "suspense", label: "Suspense", detail: "Graves lentos e tensão controlada" },
  { id: "lofi", label: "Lo-fi", detail: "Teclas suaves e pulsação relaxante" },
] as const;

export type LightMusicStyle = (typeof LIGHT_MUSIC_STYLES)[number]["id"];
export type LightMusicOptions = { style: LightMusicStyle; duration: number; seed: number };

const SAMPLE_RATE = 22_050;
const TAU = Math.PI * 2;
const MAX_DURATION = 120;

const SCORES: Record<LightMusicStyle, { bpm: number; chords: number[][]; pad: number; melody: number; bass: number }> = {
  documentary: { bpm: 76, chords: [[52, 55, 59, 64], [48, 52, 55, 60], [55, 59, 62, 67], [50, 54, 57, 62]], pad: 0.095, melody: 0.070, bass: 0.058 },
  emotional:   { bpm: 82, chords: [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]], pad: 0.110, melody: 0.073, bass: 0.052 },
  suspense:    { bpm: 65, chords: [[50, 53, 57, 62], [46, 50, 53, 58], [43, 46, 50, 55], [45, 49, 52, 57]], pad: 0.082, melody: 0.040, bass: 0.080 },
  lofi:        { bpm: 88, chords: [[48, 52, 55, 59], [45, 48, 52, 55], [53, 57, 60, 64], [55, 59, 62, 65]], pad: 0.095, melody: 0.074, bass: 0.065 },
};

function randomSource(seed: number): () => number {
  let state = (seed >>> 0) || 0x2eaf23c;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

type Instrument = "pad" | "keys" | "bass";
function voice(
  data: Float32Array,
  startSeconds: number,
  lengthSeconds: number,
  midi: number,
  level: number,
  instrument: Instrument,
) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const frames = Math.min(
    data.length - start,
    Math.ceil(lengthSeconds * SAMPLE_RATE),
  );
  if (frames <= 0) return;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const omega = (TAU * freq) / SAMPLE_RATE;
  const attack = instrument === "pad" ? 0.21 : instrument === "keys" ? 0.013 : 0.05;
  const release = instrument === "pad" ? 0.32 : 0.15;
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const remain = (frames - i) / SAMPLE_RATE;
    const envelope = Math.min(1, t / attack) * Math.min(1, remain / release);
    const phase = i * omega;
    let wave: number;
    if (instrument === "pad") {
      wave = 0.58 * Math.sin(phase) + 0.29 * Math.sin(phase * 0.997) +
        0.13 * Math.sin(phase * 2.003);
    } else if (instrument === "keys") {
      wave = (0.73 * Math.sin(phase) + 0.18 * Math.sin(2 * phase) +
        0.09 * Math.sin(3 * phase)) * Math.exp(-1.9 * t / lengthSeconds);
    } else {
      wave = 0.86 * Math.sin(phase) + 0.14 * Math.sin(2 * phase);
    }
    data[start + i] += wave * envelope * level;
  }
}

function encodeWav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const word = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return bytes;
}

export function generateLightMusic(options: LightMusicOptions): Uint8Array {
  const { style, duration, seed } = options;
  if (!(style in SCORES)) throw new Error("Estilo musical desconhecido.");
  if (!Number.isInteger(duration) || duration < 15 || duration > MAX_DURATION) {
    throw new Error("A trilha deve durar entre 15 e 120 segundos.");
  }
  const score = SCORES[style];
  const random = randomSource(seed);
  const samples = new Float32Array(duration * SAMPLE_RATE);
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const totalBars = Math.ceil(duration / bar);
  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const start = barIndex * bar;
    const chord = score.chords[barIndex % score.chords.length];
    const remaining = Math.min(bar + 0.25, duration - start);
    for (let index = 0; index < chord.length; index++) {
      voice(samples, start, remaining, chord[index], score.pad * (0.95 + random() * 0.1), "pad");
    }
    voice(samples, start, Math.min(bar * 0.8, duration - start), chord[0] - 12, score.bass, "bass");
    const everyBeats = style === "suspense" ? 2 : 0.5;
    for (let position = 0; position < 4; position += everyBeats) {
      const noteStart = start + position * beat;
      if (noteStart >= duration) break;
      const arpeggioIndex = Math.floor(position * 2 + barIndex + (random() * 2)) % chord.length;
      voice(
        samples,
        noteStart,
        Math.min(beat * (style === "suspense" ? 1.4 : 0.75), duration - noteStart),
        chord[arpeggioIndex] + 12,
        score.melody * (0.7 + random() * 0.3),
        "keys",
      );
    }
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? Math.min(1.5, 0.76 / peak) : 1;
  const fadeSamples = Math.floor(SAMPLE_RATE * 0.22);
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / fadeSamples, (samples.length - 1 - i) / fadeSamples);
    samples[i] *= gain * Math.max(0, fade);
  }
  return encodeWav(samples);
}
