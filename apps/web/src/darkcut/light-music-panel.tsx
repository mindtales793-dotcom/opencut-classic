"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SoundEffect } from "@/sounds/types";
import { generateLightMusic, LIGHT_MUSIC_STYLES, type LightMusicStyle } from "./light-music";

type Result = { name: string; url: string; duration: number; id: number };

export function LightMusicPanel() {
  const [style, setStyle] = useState<LightMusicStyle>("documentary");
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const generatedUrl = useRef<string | null>(null);
  const addSoundToTimeline = useSoundsStore((state) => state.addSoundToTimeline);
  useEffect(() => () => {
    if (generatedUrl.current) URL.revokeObjectURL(generatedUrl.current);
  }, []);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Give React a chance to draw the progress state before synthesis.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const seed = Math.floor(Math.random() * 0xffffffff);
      const wav = generateLightMusic({ style, duration, seed });
      const url = URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }));
      if (generatedUrl.current) URL.revokeObjectURL(generatedUrl.current);
      generatedUrl.current = url;
      const name = "Trilha leve - " + (LIGHT_MUSIC_STYLES.find((item) => item.id === style)?.label ?? style);
      setResult({ name, url, duration, id: Date.now() % 2_000_000_000 });
      toast.success("Trilha instrumental criada sem API ou modelo de IA.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar esta trilha.");
    } finally {
      setBusy(false);
    }
  };

  const addToTimeline = async () => {
    if (!result || busy) return;
    setBusy(true);
    try {
      const sound: SoundEffect = {
        id: result.id,
        name: result.name,
        description: "Composição instrumental produzida localmente por síntese musical do DARKCUT.",
        url: "",
        previewUrl: result.url,
        downloadUrl: result.url,
        duration: result.duration,
        filesize: 0,
        type: "audio",
        channels: 1,
        bitrate: 0,
        bitdepth: 16,
        samplerate: 22050,
        username: "DARKCUT • Trilha Leve",
        tags: ["music", "procedural"],
        license: "Áudio sintetizado localmente sem samples de terceiros; confira o resultado antes de publicar.",
        created: new Date().toISOString(),
        downloads: 0,
        rating: 0,
        ratingCount: 0,
      };
      await addSoundToTimeline({ sound, trackName: "A2 • Música de fundo", volumeDb: -19 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-5 text-xs">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Trilha Leve • sem instalação</h3>
        <p className="text-muted-foreground">
          Crie uma trilha instrumental simples para narrações no próprio DARKCUT.
          Não precisa de GPU, internet, conta, API ou modelos para baixar.
        </p>
      </div>
      <div>
        <p className="mb-2 font-medium">Escolha a atmosfera</p>
        <div className="grid grid-cols-2 gap-2">
          {LIGHT_MUSIC_STYLES.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={style === item.id ? "default" : "outline"}
              onClick={() => setStyle(item.id)}
              className="h-auto min-h-14 flex-col items-start whitespace-normal py-2 text-left"
              aria-pressed={style === item.id}
              disabled={busy}
            >
              <span className="font-semibold">{item.label}</span>
              <span className="text-[10px] opacity-80">{item.detail}</span>
            </Button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="font-medium">Duração da trilha</span>
        <select
          aria-label="Duração da trilha leve"
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
          disabled={busy}
          className="rounded border bg-background px-2 py-1"
        >
          <option value={30}>30 segundos</option>
          <option value={60}>1 minuto</option>
          <option value={90}>1 min e 30 s</option>
          <option value={120}>2 minutos</option>
        </select>
      </label>
      <Button disabled={busy} onClick={() => void generate()}>
        {busy ? "Preparando áudio…" : "Criar trilha instrumental"}
      </Button>
      {result && (
        <div className="space-y-3 rounded border p-3">
          <p className="font-semibold">{result.name}</p>
          <audio aria-label="Ouvir trilha leve" key={result.url} controls src={result.url} preload="metadata" className="w-full" />
          <Button disabled={busy} onClick={() => void addToTimeline()} className="w-full">
            Adicionar à A2 da timeline
          </Button>
          <a
            className="block text-center underline underline-offset-2"
            href={result.url}
            download={`darkcut-trilha-leve-${style}.wav`}
          >
            Baixar WAV
          </a>
          <p className="text-muted-foreground">
            Para vídeos longos, use a opção de repetir música na mixagem automática.
            A narração permanece separada na faixa A1.
          </p>
        </div>
      )}
      <p className="text-muted-foreground">
        Esta opção gera arranjos por síntese de áudio e regras musicais — não usa um modelo de IA
        e não reproduz músicas comerciais. O resultado é mais simples que um compositor de IA;
        ouça e revise antes de publicar.
      </p>
    </section>
  );
}
