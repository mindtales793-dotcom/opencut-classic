"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "@/darkcut/project-draft";
import { processMediaAssets } from "@/media/processing";
import { syncVisualsToNarration } from "@/timeline/darkcut-tools";
import { addNarrationAssetToTimeline } from "../darkcut-automation";
import { useAssetsPanelStore } from "../assets-panel-store";
import { useDarkCutProductionStore } from "../darkcut-production-store";

/** Local audio import and timeline sync. No TTS, Whisper or AI worker. */
export function DarkCutSyncView() {
  const editor = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [narrationId, setNarrationId] = useProjectDraft<string | null>("narration-asset", null);
  const script = useDarkCutProductionStore((s) => s.script);
  const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
  const assets = useEditor((e) => e.media.getAssets());
  const audioAssets = useMemo(() => assets.filter((a) => !a.ephemeral && a.type === "audio"), [assets]);
  const narration = audioAssets.find((a) => a.id === narrationId);

  const importAudio = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const projectId = editor.project.getActive().metadata.id;
      const [processed] = await processMediaAssets({ files: [file] });
      if (!processed || processed.type !== "audio") throw new Error("Selecione um áudio compatível.");
      if (editor.project.getActive().metadata.id !== projectId) throw new Error("O projeto foi alterado durante a importação.");
      const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
      if (!asset) throw new Error("Não foi possível importar o áudio.");
      setNarrationId(asset.id);
      toast.success("Narração importada para a biblioteca.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar áudio.");
    } finally {
      setBusy(false);
    }
  };

  const addToTimeline = () => {
    if (!narrationId) return;
    try {
      const seconds = addNarrationAssetToTimeline({ mediaId: narrationId, editor });
      toast.success("Narração adicionada (" + Math.round(seconds) + "s).");
      setActiveTab("timeline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a narração.");
    }
  };

  const synchronize = () => {
    const result = syncVisualsToNarration({ editor, refs: [] });
    if (!result.narrationSeconds) {
      toast.error("Coloque a narração na timeline antes de sincronizar.");
    } else if (!result.changed) {
      toast.error("Adicione imagens ou vídeos à timeline primeiro.");
    } else {
      toast.success(String(result.changed) + " clipes sincronizados com a narração.");
      if (result.clamped) toast.info(String(result.clamped) + " vídeos atingiram o limite de velocidade.");
      setActiveTab("timeline");
    }
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <header>
        <h2 className="text-lg font-semibold">Narração e sincronização</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Importe uma narração gravada em MP3, WAV ou outro formato aceito. Sem geração por IA.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Roteiro</h3>
        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {script.trim() || "Adicione seu roteiro na aba Roteiro."}
        </p>
        <Button size="sm" variant="outline" onClick={() => setActiveTab("production")}>Editar roteiro</Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Arquivo de narração</h3>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
          className="sr-only"
          aria-label="Importar narração"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void importAudio(file);
          }}
        />
        <Button disabled={busy} variant="secondary" onClick={() => inputRef.current?.click()}>
          {busy ? "Importando..." : "Importar narração do computador"}
        </Button>
        <label className="block text-xs">
          Ou escolher um áudio já importado
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
            value={narrationId ?? ""}
            onChange={(event) => setNarrationId(event.target.value || null)}
          >
            <option value="">Selecione a narração</option>
            {audioAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        {narration?.url && <audio controls preload="none" className="w-full" src={narration.url} />}
        <Button className="w-full" disabled={!narration} onClick={addToTimeline}>
          Adicionar narração à timeline
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Sincronizar imagens e vídeos</h3>
        <p className="text-xs text-muted-foreground">
          Distribui os clipes visuais pela duração da narração, sem análise de voz nem IA.
          A narração e as legendas existentes não são movidas.
        </p>
        <Button className="w-full" onClick={synchronize}>Sincronizar com narração</Button>
      </section>
    </div>
  );
}
