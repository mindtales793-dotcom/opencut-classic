"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { MinerVideo } from "@/darkcut/niche-miner";

export type DesktopMinerStatus = {
  connected: boolean;
  port?: number;
  url?: string;
  version?: string;
  groups?: Record<string, number>;
  unavailable?: string[];
  videos?: MinerVideo[];
  error?: string;
  message?: string;
};

declare global {
  interface Window {
    darkCutMinerDesktop?: {
      chooseAndStart: () => Promise<{ok:boolean;cancelled?:boolean;error?:string}>;
      startSaved: () => Promise<{ok:boolean;error?:string}>;
      connection: () => Promise<{ok:boolean;remembered:boolean;startedByDarkCut:boolean}>;
    };
  }
}

export function DarkMinerDesktopConnect({ onChange }: {
  onChange: (rows: MinerVideo[]) => void;
}) {
  const [status, setStatus] = useState<DesktopMinerStatus>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/darkcut/miner/desktop?action=all", { cache:"no-store" });
    const result = await response.json() as DesktopMinerStatus;
    setHasChecked(true);
    if (!response.ok || !result.connected) {
      setStatus({ connected:false, message:result.message||result.error||"Servidor do Dark Miner não encontrado." });
      onChange([]);
      return false;
    }
    setStatus(result);
    onChange(Array.isArray(result.videos) ? result.videos : []);
    return true;
  }, [onChange]);

  useEffect(() => {
    let active = true;
    if (typeof window !== "undefined" && window.darkCutMinerDesktop) {
      void window.darkCutMinerDesktop.connection().then(x => {
        if (active) setRemembered(Boolean(x.remembered));
      }).catch(()=>{});
    }
    void refresh().catch(e => {
      if (active) { setHasChecked(true); setStatus({ connected:false, message:String(e) }); }
    });
    const timer = window.setInterval(() => { void refresh().catch(()=>{}); }, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const start = async (choose:boolean) => {
    const native = window.darkCutMinerDesktop;
    if (!native) { toast.error("Instale o DarkCut Windows para selecionar aplicativos externos."); return; }
    setBusy(true);
    try {
      const action = choose ? native.chooseAndStart : native.startSaved;
      const result = await action();
      if (!result.ok) {
        if (!result.cancelled) toast.error(result.error||"Não foi possível iniciar o Dark Miner.");
        return;
      }
      if (choose) setRemembered(true);
      toast.message("Abrindo Dark Miner Desktop. Aguarde a inicialização da base local.");
      for (let attempt = 0; attempt < 14; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        if (await refresh()) break;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar.");
    } finally { setBusy(false); }
  };

  const overlay = fullscreen && status.connected && status.url ? (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-[#0b0b10] text-white" role="dialog" aria-modal="true" aria-label="Dark Miner Desktop completo">
      <div className="flex min-h-14 items-center justify-between border-b border-red-700/40 bg-[#141217] px-5 py-2">
        <div className="flex items-center gap-3"><b className="text-base">📡 DARKMINER</b><span className="text-xs text-slate-300">Dashboard completo • Integrado ao DarkCut Studio</span></div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-white/20 px-3 py-2 text-xs" onClick={()=>{void refresh();}}>↻ Atualizar dados</button>
          <button autoFocus className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold" onClick={()=>setFullscreen(false)}>✕ Voltar ao DarkCut</button>
        </div>
      </div>
      <iframe title="DarkMiner Desktop 3.6.1" className="min-h-0 w-full flex-1 border-0 bg-[#08090d]" src={status.url} referrerPolicy="no-referrer" />
    </div>
  ) : null;

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-card p-3" data-darkminer-desktop="true">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">🖥️ DarkMiner Desktop 3.6.1 • completo</h3>
          <p className="mt-1 text-xs text-muted-foreground">As telas originais de Radar, TOP 30, Oportunidades, Canais, Outliers, Anotações, Meu Canal e Produção continuam no mesmo motor FastAPI/SQLite.</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[0.68rem] ${status.connected ? "border-emerald-700 text-emerald-400":"text-muted-foreground"}`}>
          {status.connected ? "● Online" : hasChecked ? "○ Offline" : "Verificando…"}
        </span>
      </div>
      {status.connected && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Salvos",status.groups?.favorites??0],
            ["Monitor",status.groups?.monitor??0],
            ["Outliers",status.groups?.outliers??0],
          ].map(([label,count])=><div key={label} className="rounded-md border bg-background p-2">
            <b className="tabular-nums">{count}</b><p className="text-[0.68rem] text-muted-foreground">{label}</p>
          </div>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status.connected ? (
          <>
            <Button size="sm" className="flex-1" onClick={()=>setFullscreen(true)}>↗ Abrir DarkMiner completo dentro do DarkCut</Button>
            <Button size="sm" variant="secondary" onClick={()=>{void refresh().then(()=>toast.success("Dados locais atualizados.")).catch(()=>toast.error("Falha ao sincronizar."));}}>↻ Sincronizar</Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={()=>{void start(true);}}>{busy?"Iniciando…":"Selecionar e abrir Dark Miner.exe"}</Button>
            {remembered&&<Button variant="secondary" size="sm" disabled={busy} onClick={()=>{void start(false);}}>Abrir executável salvo</Button>}
            <Button variant="outline" size="sm" onClick={()=>{void refresh();}}>Verificar conexão</Button>
          </>
        )}
      </div>
      <p role="status" className="text-xs text-muted-foreground">{status.connected
        ? `Servidor original ${status.version??""} disponível. Dados lidos sem alterar o banco. ${status.unavailable?.length ? "Fontes indisponíveis: "+status.unavailable.join(", "):""}`
        : status.message||"Execute seu Dark Miner Desktop; o DarkCut detectará o serviço automaticamente."}</p>
      <p className="text-[0.67rem] text-muted-foreground">
        O executável 3.6.1 que você enviou também abre uma janela própria. Um launcher sem janela extra está disponível no pacote complementar. Nenhuma API ou banco é copiado para o GitHub.
      </p>
      {typeof document!=="undefined"&&overlay?createPortal(overlay,document.body):null}
    </div>
  );
}
