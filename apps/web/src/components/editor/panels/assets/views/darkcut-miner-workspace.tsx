"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DesktopMinerStatus } from "./darkcut-miner-desktop";
import { DarkCutMinerView } from "./darkcut-miner";

/**
 * The original Dark Miner dashboard runs unchanged on localhost:8000.
 * Its Chrome extension targets the same backend and SQLite database.
 * The frame fills the entire editing workspace; the timeline/monitor are
 * deliberately not rendered on this tab.
 */
export function DarkMinerWorkspace() {
  const [status, setStatus] = useState<DesktopMinerStatus>({ connected: false });
  const [started, setStarted] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const autoStartAttempted = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/darkcut/miner/desktop?action=status", {
      cache: "no-store",
    });
    const data = (await response.json()) as DesktopMinerStatus;
    if (response.ok && data.connected && /^http:\/\/127\.0\.0\.1:80\d{2}\/$/.test(data.url || "")) {
      setStatus(data);
      return true;
    }
    setStatus({
      connected: false,
      message: data.message || data.error || "Dark Miner ainda não está online.",
    });
    return false;
  }, []);

  useEffect(() => {
    let active = true;
    const native = window.darkCutMinerDesktop;
    const init = async () => {
      const available = await refresh().catch(() => false);
      if (!active || available || !native || autoStartAttempted.current) return;
      autoStartAttempted.current = true;
      try {
        const connection = await native.connection();
        if (!active) return;
        setRemembered(Boolean(connection.remembered));
        if (connection.remembered) {
          const launched = await native.startSaved();
          if (launched.ok && active) setStarted(true);
        }
      } catch {
        // The user can select the executable explicitly below.
      }
    };
    void init();
    const interval = window.setInterval(() => { void refresh().catch(() => {}); }, 4000);
    return () => { active = false; window.clearInterval(interval); };
  }, [refresh]);

  const launch = async () => {
    if (!window.darkCutMinerDesktop) {
      toast.error("A integração local está disponível no DARKCUT para Windows.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.darkCutMinerDesktop.chooseAndStart();
      if (result.ok) {
        setRemembered(true);
        setStarted(true);
        toast.message("Iniciando o Dark Miner. Os canais e favoritos permanecem no banco original.");
        void refresh();
      } else if (!result.cancelled) {
        toast.error(result.error || "Não foi possível iniciar o Dark Miner.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro de inicialização.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="darkcut-miner-workspace flex h-full min-h-0 flex-col bg-[#0b0c0e]" data-darkcut-miner-workspace="true">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-red-800/30 bg-[#111215] px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">📡 DARK MINER <span className="font-normal text-red-400">Intelligence</span></h2>
          <p className="text-xs text-slate-400">
            Dashboard original · canais, radar, monitor, oportunidades e extensão Chrome no mesmo banco local
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"rounded-md px-2 py-1 text-xs " + (status.connected
            ? "bg-green-900/30 text-green-400" : "bg-zinc-800 text-zinc-400")}>
            {status.connected ? "● Conectado" : "○ Aguardando Dark Miner"}
          </span>
          <Button size="sm" variant="outline" onClick={() => setAdvanced(current => !current)}>
            {advanced ? "Dashboard original" : "Análise de nichos DARKCUT"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setRefreshCount(count => count + 1);
            void refresh();
          }}>↻ Atualizar</Button>
        </div>
      </header>
      {advanced ? (
        <div className="min-h-0 flex-1 overflow-auto"><DarkCutMinerView /></div>
      ) : status.connected && status.url ? (
        <iframe
          key={status.url + "#" + refreshCount}
          title="Dark Miner — interface original"
          src={status.url}
          className="min-h-0 w-full flex-1 border-0 bg-[#090b10]"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-4 rounded-xl border border-red-900/40 bg-[#161417] p-6 text-center text-white">
            <div className="text-4xl">📡</div>
            <h3 className="text-lg font-semibold">Conectar o Dark Miner 3.6.1</h3>
            <p className="text-sm leading-relaxed text-slate-300">
              O Dark Miner precisa executar o serviço local na porta 8000.
              Assim a extensão do Chrome e esta tela compartilham os canais, favoritos e monitoramento.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button disabled={busy} onClick={() => { void launch(); }}>
                {busy ? "Iniciando…" : "Selecionar Dark Miner.exe"}
              </Button>
              {remembered && (
                <Button variant="outline" onClick={() => {
                  void window.darkCutMinerDesktop?.startSaved().then(() => setStarted(true));
                }}>Iniciar salvo</Button>
              )}
            </div>
            <p className="text-xs text-slate-400" role="status">
              {started ? "Aguardando o serviço local…" :
                status.message || "Ao abrir a aba, o DARKCUT tenta iniciar automaticamente o executável já cadastrado."}
            </p>
            <p className="text-xs text-slate-500">
              A versão 3.6.1 original pode abrir uma janela separada.
              Para usar somente esta tela, instale o launcher de integração sem janela extra.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
