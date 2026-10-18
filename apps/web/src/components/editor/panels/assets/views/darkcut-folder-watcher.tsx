"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "@/darkcut/project-draft";
import { isSupportedBridgeMedia, sceneNumberFromMediaFilename } from "@/darkcut/media-bridge";
import { processMediaAssets } from "@/media/processing";
import type { DarkCutScene } from "../darkcut-automation";

type LocalHandle = {
  kind: "file" | "directory";
  getFile?: () => Promise<File>;
};
type ReadableDirectory = {
  name: string;
  entries(): AsyncIterable<[string, LocalHandle]>;
};

export function DarkCutFolderWatcher() {
  const editor = useEditor();
  const projectId = useEditor((e) => e.project.getActive()?.metadata.id ?? "");
  const [scenes, setScenes] = useProjectDraft<DarkCutScene[]>("scenes", []);
  const [folder, setFolder] = useState<ReadableDirectory | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Selecione uma pasta local para acompanhar novos downloads.");
  const scanBusy = useRef(false);
  const fingerprint = useRef(new Map<string, string>());
  const done = useRef(new Set<string>());
  const selectedProject = useRef<string | null>(null);

  const chooseFolder = async () => {
    const picker = (window as Window & {
      showDirectoryPicker?: () => Promise<ReadableDirectory>;
    }).showDirectoryPicker;
    if (!picker) {
      toast.error("Seu navegador não oferece a seleção monitorada de pastas. Use o DarkCut Windows atualizado.");
      return;
    }
    try {
      const directory = await picker();
      selectedProject.current = projectId;
      fingerprint.current.clear();
      done.current.clear();
      setFolder(directory);
      setRunning(true);
      setMessage(`Monitorando a pasta "${directory.name}". Importe somente arquivos numerados por cena.`);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") toast.error(error.message);
    }
  };

  const scan = useCallback(async () => {
    if (!folder || !running || scanBusy.current || !projectId || selectedProject.current !== projectId) return;
    scanBusy.current = true;
    let imported = 0;
    const assignedThisScan = new Set<number>();
    try {
      for await (const [name, handle] of folder.entries()) {
        if (handle.kind !== "file" || !handle.getFile || !isSupportedBridgeMedia(name)) continue;
        const sceneIndex = sceneNumberFromMediaFilename(name);
        if (!sceneIndex || assignedThisScan.has(sceneIndex)) continue;
        const target = scenes.find((scene) => scene.index === sceneIndex);
        if (!target || target.mediaId || done.current.has(name)) continue;
        const file = await handle.getFile();
        if (!file.size || file.size > 64 * 1024 * 1024) continue;
        const current = `${file.size}:${file.lastModified}`;
        if (fingerprint.current.get(name) !== current) {
          // Wait for two scans with identical metadata so an active download is never imported.
          fingerprint.current.set(name, current);
          continue;
        }
        assignedThisScan.add(sceneIndex);
        if (editor.project.getActive()?.metadata.id !== projectId) {
          setRunning(false);
          throw new Error("O projeto mudou. Monitoramento pausado.");
        }
        const [processed] = await processMediaAssets({ files: [file] });
        if (!processed || (processed.type !== "image" && processed.type !== "video")) continue;
        if (editor.project.getActive()?.metadata.id !== projectId) {
          setRunning(false);
          throw new Error("O projeto mudou durante a importação.");
        }
        const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
        if (!asset) continue;
        setScenes((currentScenes) => currentScenes.map((scene) =>
          scene.index === sceneIndex && !scene.mediaId
            ? { ...scene, mediaId: asset.id, mediaName: asset.name, status: "ready" as const }
            : scene,
        ));
        done.current.add(name);
        imported++;
      }
      setMessage(imported
        ? `${imported} mídia(s) importada(s) automaticamente da pasta "${folder.name}".`
        : `Acompanhando "${folder.name}". Aguardando arquivos numerados estáveis.`);
      if (imported) toast.success(`${imported} cena(s) conectada(s) à mídia local.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ler a pasta escolhida.");
    } finally {
      scanBusy.current = false;
    }
  }, [editor, folder, projectId, running, scenes, setScenes]);

  useEffect(() => {
    if (!folder || !running) return;
    void scan();
    const timer = window.setInterval(() => { void scan(); }, 8000);
    return () => window.clearInterval(timer);
  }, [folder, running, scan]);

  useEffect(() => {
    if (selectedProject.current && selectedProject.current !== projectId) {
      setRunning(false);
      setFolder(null);
      setMessage("Projeto alterado. Selecione novamente a pasta para este projeto.");
    }
  }, [projectId]);

  return (
    <div className="mt-3 rounded-lg border bg-background p-3" data-darkcut-folder-watcher="true">
      <p className="text-xs font-semibold">📂 Monitorar uma pasta local</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">
        Importa automaticamente novas imagens/vídeos já baixados, com nomes como cena-001.png. Verifica se o arquivo terminou de ser gravado.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!projectId || !scenes.length} onClick={() => { void chooseFolder(); }}>
          Escolher pasta
        </Button>
        {folder && (
          <Button size="sm" variant="outline" onClick={() => setRunning((current) => !current)}>
            {running ? "Pausar monitoramento" : "Retomar monitoramento"}
          </Button>
        )}
      </div>
      <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">
        Permissão apenas para a pasta escolhida. Não altera arquivos originais, não acessa sites nem substitui cenas prontas.
      </p>
    </div>
  );
}
