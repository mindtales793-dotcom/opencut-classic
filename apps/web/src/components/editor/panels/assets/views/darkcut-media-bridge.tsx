"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "@/darkcut/project-draft";
import type { DarkCutScene } from "../darkcut-automation";
import { processMediaAssets } from "@/media/processing";
import { Button } from "@/components/ui/button";

type PendingMedia = {
  id: string;
  projectId: string;
  sceneIndex: number;
  filename: string;
  contentType: string;
  size: number;
};

const API = "/api/darkcut/media-bridge";
const headers = (token: string) => ({ "x-darkcut-bridge-token": token });

export function DarkCutMediaBridge() {
  const editor = useEditor();
  const projectId = useEditor((e) => e.project.getActive()?.metadata.id ?? "");
  const [scenes, setScenes] = useProjectDraft<DarkCutScene[]>("scenes", []);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [status, setStatus] = useState("Carregando conexão…");
  const [enabled, setEnabled] = useState(false);
  const inProgress = useRef(false);
  const completed = useRef(new Set<string>());
  const tokenRef = useRef("");

  useEffect(() => {
    let live = true;
    fetch(`${API}?action=pair`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Integração local indisponível. Use o DarkCut Windows.");
        return r.json() as Promise<{ token?: string; enabled?: boolean }>;
      })
      .then((data) => {
        if (!live) return;
        tokenRef.current = data.token ?? "";
        setToken(data.token ?? "");
        setEnabled(Boolean(data.enabled && data.token));
        setStatus(data.token ? "Pronto para receber imagens e vídeos." : "Ponte não configurada.");
      })
      .catch((err: unknown) => {
        if (!live) return;
        setStatus(err instanceof Error ? err.message : "Ponte indisponível.");
        setEnabled(false);
      });
    return () => { live = false; tokenRef.current = ""; };
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !projectId) return [] as PendingMedia[];
    const qs = new URLSearchParams({ action: "list", projectId });
    const result = await fetch(`${API}?${qs}`, {
      cache: "no-store", headers: headers(token),
    });
    if (!result.ok) throw new Error("Não foi possível consultar mídias recebidas.");
    const data = await result.json() as { pending?: PendingMedia[] };
    setPending(data.pending ?? []);
    return data.pending ?? [];
  }, [projectId, token]);

  const sync = useCallback(async () => {
    if (inProgress.current || !token || !projectId || !scenes.length) return;
    inProgress.current = true;
    setBusy(true);
    let imported = 0;
    const reserved = new Set<number>();
    try {
      const items = await refresh();
      const available = items.filter((entry) => {
        const scene = scenes.find((item) => item.index === entry.sceneIndex);
        return scene && !scene.mediaId && !reserved.has(entry.sceneIndex) &&
          !completed.current.has(entry.id) && (reserved.add(entry.sceneIndex), true);
      });
      for (const entry of available) {
        if (editor.project.getActive()?.metadata.id !== projectId) {
          throw new Error("O projeto foi alterado durante a importação.");
        }
        completed.current.add(entry.id);
        try {
          setStatus(`Importando cena ${entry.sceneIndex}: ${entry.filename}`);
          const fileResponse = await fetch(
            `${API}?action=file&projectId=${encodeURIComponent(projectId)}&id=${entry.id}`,
            { headers: headers(token), cache: "no-store" },
          );
          if (!fileResponse.ok) throw new Error("Falha ao carregar arquivo recebido.");
          const blob = await fileResponse.blob();
          const file = new File([blob], entry.filename, { type: entry.contentType });
          const [processed] = await processMediaAssets({ files: [file] });
          if (!processed || (processed.type !== "image" && processed.type !== "video")) {
            throw new Error("Não foi possível processar mídia.");
          }
          if (editor.project.getActive()?.metadata.id !== projectId) {
            throw new Error("Projeto alterado durante a importação.");
          }
          const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
          if (!asset) throw new Error("Não foi possível salvar mídia na biblioteca.");
          // Never overwrite a previously assigned scene in the editor.
          setScenes((current) => current.map((scene) =>
            scene.index === entry.sceneIndex && !scene.mediaId
              ? { ...scene, mediaId: asset.id, mediaName: asset.name, status: "ready" as const }
              : scene,
          ));
          const ack = await fetch(`${API}?action=ack`, {
            method: "POST",
            headers: { ...headers(token), "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, id: entry.id, assetId: asset.id }),
          });
          if (!ack.ok) throw new Error("Mídia salva, mas confirmação falhou. Revise antes de importar novamente.");
          imported += 1;
        } catch (error) {
          completed.current.delete(entry.id);
          console.error("DarkCut media bridge", error);
          toast.error(`Cena ${entry.sceneIndex}: ${error instanceof Error ? error.message : "falha na importação"}`);
        }
      }
      if (imported) toast.success(`${imported} mídia(s) importada(s) e vinculada(s) às cenas.`);
      if (!imported) {
        setStatus(available.length ? "Verifique as mídias recebidas." : "Pronto. Sem novas cenas disponíveis para preenchimento.");
      } else setStatus(`${imported} mídia(s) conectada(s) às cenas.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível sincronizar.");
    } finally {
      setBusy(false);
      inProgress.current = false;
    }
  }, [editor, projectId, refresh, scenes, setScenes, token]);

  useEffect(() => {
    completed.current.clear();
  }, [projectId]);

  useEffect(() => {
    if (!enabled || !autoSync || !scenes.length || !projectId) return;
    void sync();
    const timer = window.setInterval(() => { void sync(); }, 7000);
    return () => window.clearInterval(timer);
  }, [enabled, autoSync, scenes.length, projectId, sync]);

  const copy = (value: string, label: string) => {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copiado.`),
      () => toast.error("Não foi possível copiar. Selecione o texto manualmente."),
    );
  };

  return (
    <section className="mt-3 rounded-xl border border-primary/25 bg-card p-4" data-darkcut-media-bridge="true">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">🔗 Conectar mídias às cenas</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Extensão local opcional para enviar imagens e vídeos exportados de ferramentas compatíveis. Sem login de terceiros.
          </p>
        </div>
        <span className="rounded-md border px-2 py-1 text-[0.65rem]">{enabled ? "● Local ativo" : "○ Indisponível"}</span>
      </div>

      {enabled && projectId && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-2 text-xs">
              <p className="text-muted-foreground">Código do projeto</p>
              <p className="truncate font-mono" title={projectId}>{projectId}</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => copy(projectId, "Projeto")}>Copiar projeto</Button>
            </div>
            <div className="rounded-lg border bg-background p-2 text-xs">
              <p className="text-muted-foreground">Chave temporária da extensão</p>
              <p className="truncate font-mono" title={token}>••••••••••••••••</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => copy(token, "Chave")}>Copiar chave</Button>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            Importar automaticamente a cada 7 segundos
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !scenes.length} onClick={() => { void sync(); }}>
              {busy ? "Sincronizando…" : "↻ Sincronizar agora"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { void refresh().catch(() => toast.error("Falha ao atualizar a caixa de entrada.")); }}>
              Ver recebidos ({pending.length})
            </Button>
          </div>
          {pending.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto rounded border p-2 text-xs">
              {pending.slice(0, 20).map((entry) => (
                <p key={entry.id} className="truncate">Cena {entry.sceneIndex} · {entry.filename}</p>
              ))}
              <p className="mt-1 text-muted-foreground">Cenas com mídia já escolhida não são substituídas. Remova ou revise primeiro.</p>
            </div>
          )}
        </>
      )}
      <p role="status" className="mt-2 text-xs text-muted-foreground">{status}</p>
      <p className="mt-1 text-[0.67rem] text-muted-foreground">
        Apenas no aplicativo Windows. A extensão envia arquivos que você seleciona; não acessa contas nem automatiza sites.
      </p>
    </section>
  );
}
