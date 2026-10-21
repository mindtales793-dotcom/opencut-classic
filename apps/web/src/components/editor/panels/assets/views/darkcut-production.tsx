"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "@/darkcut/project-draft";
import { useAssetsPanelStore } from "../assets-panel-store";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import {
  buildDarkCutScenes,
  autoAssignLibraryMedia,
  assembleScenesOnTimeline,
  type DarkCutScene,
} from "../darkcut-automation";

/** Local-only script workflow: no AI services, prompts or background polling. */
export function DarkCutProductionView() {
  const editor = useEditor();
  const script = useDarkCutProductionStore((s) => s.script);
  const setScript = useDarkCutProductionStore((s) => s.setScript);
  const sceneSeconds = useDarkCutProductionStore((s) => s.sceneSeconds);
  const setSceneSeconds = useDarkCutProductionStore((s) => s.setSceneSeconds);
  const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
  const [scenes, setScenes] = useProjectDraft<DarkCutScene[]>("scenes", []);
  const [addCaptions, setAddCaptions] = useState(true);
  const assets = useEditor((e) => e.media.getAssets());
  const visualAssets = useMemo(
    () => assets.filter((asset) => !asset.ephemeral && (asset.type === "image" || asset.type === "video")),
    [assets],
  );
  const ready = scenes.filter((scene) => scene.mediaId && visualAssets.some((asset) => asset.id === scene.mediaId)).length;

  const createScenes = () => {
    if (!script.trim()) {
      toast.error("Escreva ou cole um roteiro primeiro.");
      return;
    }
    const next = buildDarkCutScenes({ script, sceneSeconds });
    setScenes(next);
    toast.success(String(next.length) + " cenas criadas localmente.");
  };

  const assignMedia = () => {
    if (!scenes.length) {
      toast.error("Divida o roteiro em cenas primeiro.");
      return;
    }
    const next = autoAssignLibraryMedia({ scenes, editor });
    setScenes(next);
    toast.success(String(next.filter((scene) => scene.mediaId).length) + " cenas associadas a mídias locais.");
  };

  const assemble = () => {
    if (!ready) {
      toast.error("Associe ao menos uma imagem ou vídeo às cenas.");
      return;
    }
    try {
      const count = assembleScenesOnTimeline({ scenes, editor, addCaptions });
      if (!count) {
        toast.error("Não foi possível inserir as cenas.");
        return;
      }
      toast.success(String(count) + " cenas adicionadas à timeline.");
      setActiveTab("timeline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao montar a timeline.");
    }
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <header>
        <h2 className="text-lg font-semibold">Roteiro</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Escreva seu roteiro, divida em cenas e escolha mídias do computador. Tudo funciona sem IA.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <label className="block text-sm font-medium" htmlFor="darkcut-lite-script">Texto do roteiro</label>
        <textarea
          id="darkcut-lite-script"
          className="min-h-48 w-full resize-y rounded-md border bg-background p-3 text-sm"
          placeholder="Escreva ou cole seu roteiro..."
          value={script}
          onChange={(event) => setScript(event.target.value)}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Duração inicial por cena (segundos)
            <input
              className="mt-1 block w-24 rounded border bg-background px-2 py-1"
              type="number"
              min={2}
              max={30}
              step={0.5}
              value={sceneSeconds}
              onChange={(event) => setSceneSeconds(Math.max(2, Math.min(30, Number(event.target.value) || 5)))}
            />
          </label>
          <Button onClick={createScenes} disabled={!script.trim()}>Dividir em cenas</Button>
          <Button variant="outline" onClick={() => setActiveTab("sync")}>Narração e sincronização</Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Cenas e mídias</h3>
            <p className="text-xs text-muted-foreground">
              {scenes.length} cenas · {ready} com mídia · {visualAssets.length} arquivos visuais
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setActiveTab("media")}>Importar mídias</Button>
            <Button variant="secondary" size="sm" onClick={assignMedia} disabled={!scenes.length || !visualAssets.length}>
              Associar por nome
            </Button>
          </div>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {scenes.map((scene) => (
            <div key={scene.id} className="space-y-2 rounded-md border bg-background p-3">
              <div className="text-xs font-semibold">Cena {scene.index}</div>
              <p className="text-xs text-muted-foreground">{scene.text}</p>
              <select
                className="w-full rounded-md border bg-background px-2 py-2 text-xs"
                aria-label={"Mídia da cena " + scene.index}
                value={scene.mediaId ?? ""}
                onChange={(event) => {
                  const asset = visualAssets.find((item) => item.id === event.target.value);
                  setScenes((current) => current.map((item) => item.id === scene.id
                    ? { ...item, mediaId: asset?.id, mediaName: asset?.name, status: asset ? "ready" : "missing" }
                    : item));
                }}
              >
                <option value="">Escolher imagem ou vídeo</option>
                {visualAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>
            </div>
          ))}
          {!scenes.length && <p className="text-xs text-muted-foreground">As cenas aparecerão aqui.</p>}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={addCaptions} onChange={(event) => setAddCaptions(event.target.checked)} />
          Criar textos das cenas na timeline (editáveis como legendas)
        </label>
        <Button onClick={assemble} disabled={!ready} className="w-full">Montar na timeline</Button>
      </section>
    </div>
  );
}
