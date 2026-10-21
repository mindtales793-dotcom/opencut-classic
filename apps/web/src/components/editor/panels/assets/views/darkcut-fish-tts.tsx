"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "@/darkcut/project-draft";
import { useDarkCutTasks, TaskStatus } from "@/darkcut/tasks";
import { FISH_NARRATORS } from "@/darkcut/fish-narrators";
import { processMediaAssets } from "@/media/processing";
import { useDarkCutProductionStore } from "../darkcut-production-store";

async function narrationFingerprint(text: string, narratorId: string): Promise<string> {
  const bytes = new TextEncoder().encode(narratorId + "\n" + text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}

/** Fish Audio only runs after the user presses Generate or Test. Nothing loads in the background. */
export function DarkCutFishTts() {
  const editor = useEditor();
  const projectName = useDarkCutProductionStore((s) => s.projectName);
  const script = useDarkCutProductionStore((s) => s.script);
  const selectedNarratorId = useDarkCutProductionStore((s) => s.selectedNarratorId);
  const setSelectedNarratorId = useDarkCutProductionStore((s) => s.setSelectedNarratorId);
  const fishApiKeys = useDarkCutProductionStore((s) => s.fishApiKeys);
  const setFishApiKey = useDarkCutProductionStore((s) => s.setFishApiKey);
  const [narrationAssetId, setNarrationAssetId] = useProjectDraft<string | null>("narration-asset", null);
  const [jobId, setJobId] = useProjectDraft<string | null>("narration-job", null);
  const [signature, setSignature] = useProjectDraft<string | null>("narration-signature", null);
  const [fileName, setFileName] = useProjectDraft("narration-filename", "darkcut-narracao.mp3");
  const [isGenerating, setGenerating] = useState(false);
  const [isPreviewing, setPreviewing] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const narrationTask = useDarkCutTasks((s) => s.tasks.narration);
  const assets = useEditor((e) => e.media.getAssets());
  const narration = useMemo(() => assets.find((asset) => asset.id === narrationAssetId && asset.type === "audio"), [assets, narrationAssetId]);
  const selectedVoice = FISH_NARRATORS.find((v) => v.id === selectedNarratorId) ?? FISH_NARRATORS[0];
  const downloadedUrl = narration?.url ?? lastCreatedUrl;
  const configuredKeys = fishApiKeys.filter((key) => key.trim()).length;

  useEffect(() => () => { if (voiceUrl?.startsWith("blob:")) URL.revokeObjectURL(voiceUrl); }, [voiceUrl]);
  useEffect(() => () => { if (lastCreatedUrl?.startsWith("blob:")) URL.revokeObjectURL(lastCreatedUrl); }, [lastCreatedUrl]);

  const preview = async () => {
    setPreviewing(true);
    try {
      const text = selectedVoice.language === "en"
        ? "Hello. This is a short voice preview for DarkCut."
        : "Olá. Este é um teste de voz para o DarkCut.";
      const res = await fetch("/api/darkcut/fish/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, referenceId: selectedVoice.id, fishApiKeys }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error || "Não foi possível ouvir a voz.");
      }
      const url = URL.createObjectURL(await res.blob());
      setVoiceUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no teste de voz.");
    } finally {
      setPreviewing(false);
    }
  };

  const generate = async () => {
    const text = script.trim();
    if (!text || isGenerating) return;
    const projectId = editor.project.getActive().metadata.id;
    const task = (status: "running" | "done" | "error", detail: string, done?: number) =>
      useDarkCutTasks.getState().set("narration", {
        projectId, label: "Narração", tab: "sync", status, detail,
        ...(done === undefined ? {} : { done, total: 100 }),
      });
    setGenerating(true);
    try {
      const newSignature = await narrationFingerprint(text, selectedVoice.id);
      if (newSignature === signature && narration?.url) {
        setJobId(null);
        toast.success("A narração deste roteiro já está pronta.");
        return;
      }
      if (newSignature !== signature) {
        setNarrationAssetId(null);
        setSignature(null);
      }
      task("running", "Enviando roteiro ao Fish Audio…", 0);
      const response = await fetch("/api/darkcut/narration-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, text, referenceId: selectedVoice.id, fishApiKeys }),
      });
      const job = await response.json() as { error?: string; id?: string; status?: string; totalChunks?: number };
      if (!response.ok || !job.id) throw new Error(job.error || "Não foi possível iniciar a narração.");
      setJobId(job.id);

      if (job.status !== "ready") {
        const started = Date.now();
        while (true) {
          const check = await fetch("/api/darkcut/narration-jobs?id=" + encodeURIComponent(job.id), { cache: "no-store" });
          const result = await check.json() as {
            status?: string; error?: string; stage?: string; completedChunks?: number;
            totalChunks?: number; currentChunk?: number; progressPercent?: number;
          };
          if (!check.ok || result.status === "error" || result.status === "interrupted") {
            throw new Error(result.error || "Geração interrompida. Clique em Retomar para aproveitar os blocos prontos.");
          }
          if (result.status === "ready") break;
          const detail = result.stage === "combining"
            ? "Juntando blocos com FFmpeg…"
            : result.stage === "saving"
              ? "Salvando MP3…"
              : "Narrando bloco " + (result.currentChunk ?? 1) + "/" + (result.totalChunks ?? job.totalChunks ?? 1);
          task("running", detail, Math.min(99, Math.max(0, Number(result.progressPercent) || 0)));
          if (Date.now() - started > 90 * 60 * 1000) throw new Error("Tempo limite de acompanhamento. Tente Retomar narração.");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      task("running", "Importando MP3 para o projeto…", 99);
      const audioResponse = await fetch("/api/darkcut/narration-jobs?id=" + encodeURIComponent(job.id) + "&audio=1");
      if (!audioResponse.ok) throw new Error("Não foi possível baixar a narração gerada.");
      const blob = await audioResponse.blob();
      const projectSlug = projectName.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 40) || "darkcut";
      const outputName = "DARKCUT-NARRACAO-" + projectSlug + "-" + selectedVoice.name + ".mp3";
      const file = new File([blob], outputName, { type: "audio/mpeg" });
      const [processed] = await processMediaAssets({ files: [file] });
      if (!processed || processed.type !== "audio") throw new Error("O MP3 gerado não pôde ser processado.");
      if (editor.project.getActive().metadata.id !== projectId) {
        throw new Error("O projeto mudou durante a geração. Reabra o projeto anterior e retome.");
      }
      const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
      if (!asset) throw new Error("Não foi possível salvar a narração.");
      setNarrationAssetId(asset.id);
      setJobId(null);
      setSignature(newSignature);
      setFileName(outputName);
      setLastCreatedUrl(asset.url || URL.createObjectURL(blob));
      task("done", "MP3 pronto para a timeline e download", 100);
      toast.success("Narração gerada com " + selectedVoice.name + ".");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar narração.";
      task("error", message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!downloadedUrl) return;
    const a = document.createElement("a");
    a.href = downloadedUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-darkcut-fish-tts="true">
      <header>
        <h3 className="text-sm font-semibold">Gerar narração com Fish Audio</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Voz gerada online pela API; nenhuma IA é instalada ou executada no PC.
          A chave é configurada neste dispositivo. O serviço pode ter limites ou custos.
        </p>
      </header>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-xs font-semibold">Chaves Fish Audio ({configuredKeys}/3)</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          As chaves ficam nas configurações locais do editor. Não as compartilhe em prints.
        </p>
        {Array.from({ length: 3 }, (_, index) => (
          <label key={index} className="mt-2 block text-xs">
            Chave {index + 1}
            <input
              type="password"
              autoComplete="off"
              value={fishApiKeys[index] ?? ""}
              onChange={(event) => setFishApiKey(index, event.target.value)}
              placeholder="Cole sua chave Fish Audio"
              className="mt-1 w-full rounded-md border bg-background p-2"
            />
          </label>
        ))}
      </details>
      <label className="block text-xs">
        Narrador
        <select
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          value={selectedVoice.id}
          onChange={(event) => { setSelectedNarratorId(event.target.value); setVoiceUrl(null); }}
        >
          {FISH_NARRATORS.map((voice) => (
            <option key={voice.id} value={voice.id}>{voice.name} · {voice.language.toUpperCase()}</option>
          ))}
        </select>
      </label>
      <Button variant="secondary" disabled={isPreviewing || isGenerating} onClick={() => void preview()}>
        {isPreviewing ? "Preparando prévia..." : "▶ Testar voz"}
      </Button>
      {voiceUrl && <audio className="w-full" controls autoPlay preload="none" src={voiceUrl} />}
      <Button className="w-full" disabled={isGenerating || !script.trim()} onClick={() => void generate()}>
        {isGenerating ? "Gerando narração..." : jobId ? "Retomar narração" : "🎙 Gerar narração"}
      </Button>
      {narrationTask && narrationTask.projectId === editor.project.getActive().metadata.id && (
        <div className="rounded-md border bg-background p-2 text-xs"><TaskStatus task={narrationTask} /></div>
      )}
      {narration?.url && <audio className="w-full" controls preload="metadata" src={narration.url} />}
      <Button variant="outline" className="w-full" onClick={download} disabled={!downloadedUrl}>
        ↓ Baixar narração em MP3
      </Button>
      <p className="text-xs text-muted-foreground">
        Quando terminar, a narração entra na biblioteca. Use o botão Adicionar narração à timeline logo abaixo.
      </p>
    </section>
  );
}
