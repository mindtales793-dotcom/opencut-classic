"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { NICHE_MARKETS, localTitleAngles, rankMinerOpportunities, sanitizeMinerVideo, type MinerVideo } from "@/darkcut/niche-miner";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useAssetsPanelStore } from "../assets-panel-store";

type AIResult = { summary:string; titles:{title:string;angle:string;hook:string;risk:string}[]; nicheDoubles:{angle:string;audience:string;why:string;culturalAdaptation:string;validation:string}[]; searchQueries:string[]; culturalChecks:string[]; confidenceNotes:string[] };
const URL="/api/darkcut/miner/bridge";
export function DarkCutMinerView(){
  const [videos,setVideos]=useState<MinerVideo[]>([]);
  const [pairs,setPairs]=useState("");
  const [error,setError]=useState("");
  const [manualJson,setManualJson]=useState("");
  const [search,setSearch]=useState("");
  const [subject,setSubject]=useState("");
  const [language,setLanguage]=useState("pt-BR");
  const [format,setFormat]=useState("POV");
  const [pattern,setPattern]=useState("POV: Por que / Como / A escolha que");
  const [selected,setSelected]=useState("");
  const [loading,setLoading]=useState(false);
  const [ai,setAi]=useState<AIResult|null>(null);
  const [connected,setConnected]=useState(false);
  const setActiveTab=useAssetsPanelStore(s=>s.setActiveTab);
  const setScript=useDarkCutProductionStore(s=>s.setScript);
  const script=useDarkCutProductionStore(s=>s.script);
  const geminiKey=useDarkCutProductionStore(s=>s.geminiApiKeys.find(Boolean)||s.geminiApiKey);
  const market=NICHE_MARKETS.find(m=>m.language===language)||NICHE_MARKETS[0];
  const matches=useMemo(()=>rankMinerOpportunities(videos.filter(v=>(v.title+" "+v.channel).toLocaleLowerCase().includes(search.toLocaleLowerCase()))).slice(0,70),[videos,search]);

  const load=async (key:string)=>{
    const r=await fetch(URL,{headers:{"x-darkcut-bridge-token":key},cache:"no-store"});
    if(!r.ok)throw new Error("Ponte do DarkMiner indisponível. Abra o DarkCut Windows atualizado.");
    const data=await r.json() as {videos?:unknown[]};
    const items=(data.videos||[]).map(sanitizeMinerVideo).filter((v):v is MinerVideo=>v!==null);
    setVideos(items);
    setConnected(true);
  };
  useEffect(()=>{
    let active=true;
    void fetch("/api/darkcut/media-bridge?action=pair",{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error("Ponte de extensão disponível no aplicativo Windows.");
      return response.json() as Promise<{token:string}>;
    }).then(async data=>{
      if(!active)return;
      setPairs(data.token);
      try {await load(data.token);}catch {/* Wait until paired. */}
    }).catch(()=>{if(active)setConnected(false)});
    return()=>{active=false};
  },[]);

  const importJson=()=>{
    try {
      const parsed=JSON.parse(manualJson) as unknown;
      const raw=Array.isArray(parsed)?parsed:parsed&&typeof parsed==="object"?((parsed as Record<string,unknown>).videos??[]):[];
      if(!Array.isArray(raw))throw new Error("Envie uma lista JSON de vídeos.");
      const items=raw.slice(0,150).map(sanitizeMinerVideo).filter((v):v is MinerVideo=>v!==null);
      if(!items.length)throw new Error("Nenhum vídeo com ID e título válidos.");
      setVideos(prev=>{
        const map=new Map(prev.map(v=>[v.videoId,v]));
        items.forEach(v=>map.set(v.videoId,v));
        return [...map.values()].slice(-300);
      });
      setManualJson("");
      toast.success(`${items.length} vídeos importados para análise.`);
    }catch(e){toast.error(e instanceof Error?e.message:"JSON inválido.");}
  };

  const analyse=async()=>{
    if(!subject.trim()){toast.error("Escolha uma oportunidade ou descreva o nicho.");return;}
    if(!geminiKey){toast.error("Configure a chave Gemini em Configurações do DarkCut para análise de IA.");return;}
    setLoading(true);setError("");setAi(null);
    try{
      const r=await fetch("/api/darkcut/miner/ideas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        geminiApiKey:geminiKey,subject,language,format,titlePattern:pattern,videos:matches.slice(0,12).map(x=>x.video)
      })});
      const data=await r.json() as {error?:string;result?:AIResult};
      if(!r.ok||!data.result)throw new Error(data.error||"Resposta de IA indisponível.");
      setAi(data.result);
    }catch(e){setError(e instanceof Error?e.message:"Erro de análise.");}finally{setLoading(false);}
  };
  const copy=(value:string)=>void navigator.clipboard.writeText(value).then(()=>toast.success("Copiado."),()=>toast.error("Não foi possível copiar."));
  const sendToProduction=(title:string)=>{
    if(script.trim()&&!window.confirm("Substituir o roteiro atual pelo título selecionado? O texto existente será perdido."))return;
    setScript(title+"\n\n");
    setActiveTab("production");
    toast.success("Título enviado à aba Produção. Desenvolva o roteiro.");
  };

  return <section className="space-y-4 p-4 text-sm" data-darkcut-miner="true">
    <header className="space-y-1">
      <h2 className="text-lg font-bold text-foreground">📡 DarkMiner • Inteligência de oportunidades</h2>
      <p className="text-xs text-muted-foreground">Radar internacional, dobra de nicho e títulos por idioma. Dados importados da extensão + sugestões originais de IA.</p>
    </header>
    <div className="rounded-xl border border-primary/30 bg-card p-3 space-y-2">
      <h3 className="font-semibold">🔗 Sincronizar sua extensão Dark Miner 3.8.1+</h3>
      <p className="text-xs text-muted-foreground">No Windows, copie a chave temporária e use a extensão DarkMiner atualizada para enviar as listas Salvos/Monitor. Nenhuma chave do YouTube é transferida.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!pairs} variant="secondary" size="sm" onClick={()=>copy(pairs)}>{pairs?"Copiar chave de conexão":"Ponte local indisponível"}</Button>
        <Button disabled={!pairs} variant="outline" size="sm" onClick={()=>{void load(pairs).then(()=>toast.success("Vídeos atualizados.")).catch((e:Error)=>toast.error(e.message));}}>↻ Atualizar listas</Button>
      </div>
      <p className="text-xs text-muted-foreground">{connected?"✓ Conectado ao DarkCut Windows":"Modo independente: importe os vídeos como JSON ou instale a versão Windows."}</p>
      <details className="text-xs">
        <summary className="cursor-pointer">Importar JSON de vídeos manualmente</summary>
        <textarea value={manualJson} onChange={e=>setManualJson(e.target.value)} rows={3} placeholder='[{"video_id":"dQw4w9WgXcQ","title":"Exemplo de título","views":15000,"subscribers":3000}]' className="mt-2 w-full rounded-md border bg-background p-2" />
        <Button size="sm" onClick={importJson}>Importar JSON</Button>
      </details>
    </div>
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">📈 Oportunidades ({matches.length})</h3><span className="text-xs text-muted-foreground">Score heurístico • não prevê viralização</span></div>
      <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Filtrar por canal, tema ou título..." />
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {!matches.length&&<p className="text-xs text-muted-foreground">Sem vídeos importados. Envie os salvos/monitor pela extensão DarkMiner ou importe JSON.</p>}
        {matches.map(({video,score,reasons,cautions})=><div key={video.videoId} className="rounded-lg border bg-background p-2">
          <div className="flex gap-2 justify-between items-start"><div><b className="text-xs">{video.title}</b><div className="text-[0.7rem] text-muted-foreground">{video.channel} • {video.views.toLocaleString("pt-BR")} views • {video.subscribers??"?"} inscritos</div></div><span className="rounded-md bg-primary/10 px-2 py-1 font-bold tabular-nums text-primary">{score}/100</span></div>
          <p className="mt-1 text-[0.69rem] text-muted-foreground">{reasons[0]||cautions[0]||"Amostra limitada"}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant={selected===video.videoId?"default":"secondary"} onClick={()=>{setSelected(video.videoId);setSubject(video.title);setAi(null);}}>Usar oportunidade</Button><a className="rounded-md border px-2 py-1 text-xs" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">Abrir vídeo ↗</a></div>
        </div>)}
      </div>
    </div>
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <h3 className="font-semibold">🧠 Skill • Dobra de nicho e tropicalização</h3>
      <label className="block text-xs">Tema ou oportunidade
        <textarea className="mt-1 w-full rounded-md border bg-background p-2" rows={2} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Ex.: Recusei financiar um carro zero, comprei usado à vista" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Mercado cultural e idioma
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={language} onChange={e=>{setLanguage(e.target.value);setAi(null);}}>{NICHE_MARKETS.map(m=><option key={m.language} value={m.language}>{m.label}</option>)}</select>
        </label>
        <label className="text-xs">Estilo de canal
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={format} onChange={e=>setFormat(e.target.value)}>
            {["POV","Documentário","Educativo","Lista","Cinematográfico","Financeiro","Histórias"].map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <p className="rounded-md border border-primary/20 p-2 text-xs text-muted-foreground">Contexto a verificar: {market.culturalLens}. Evite traduções literais e confirme costumes e dados de cada país.</p>
      <label className="block text-xs">Padrão do título
        <input className="mt-1 w-full rounded-md border bg-background p-2" value={pattern} onChange={e=>setPattern(e.target.value)} />
      </label>
      <Button className="w-full" onClick={()=>{void analyse();}} disabled={loading}>{loading?"Consultando Gemini…":"✨ Gerar dobra de nicho + títulos com Gemini"}</Button>
      {error&&<p className="text-xs text-destructive" role="alert">{error}</p>}
      {!ai&&<div className="space-y-2"><p className="text-xs text-muted-foreground">Prévia local em português (não validada culturalmente; a IA gera no idioma escolhido):</p>{localTitleAngles(subject,market).slice(0,3).map((v,i)=><div key={i} className="flex gap-2 items-center rounded-md border p-2 text-xs"><span className="flex-1">{v}</span><Button size="sm" variant="secondary" onClick={()=>copy(v)}>Copiar</Button></div>)}</div>}
      {ai&&<div className="space-y-3">
        <p className="text-xs">{ai.summary}</p>
        <h4 className="font-semibold">🌍 Dobras de nicho</h4>
        {(ai.nicheDoubles||[]).map((item,i)=><div key={i} className="rounded-lg border p-2 text-xs"><b>{item.angle}</b><p className="text-muted-foreground">{item.audience} • {item.why}</p><p className="mt-1 text-muted-foreground">{item.culturalAdaptation}</p><p className="mt-1 text-muted-foreground">Validar: {item.validation}</p></div>)}
        <h4 className="font-semibold">✍️ Títulos no idioma selecionado</h4>
        {(ai.titles||[]).map((item,i)=><div key={i} className="rounded-lg border p-2 text-xs"><b>{item.title}</b><p className="text-muted-foreground">{item.angle}</p><p className="text-muted-foreground">Gancho: {item.hook}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={()=>copy(item.title)}>Copiar</Button><Button size="sm" onClick={()=>sendToProduction(item.title)}>Enviar à Produção →</Button></div></div>)}
        <details className="text-xs"><summary>Consultas e verificações culturais</summary><p className="my-2 text-muted-foreground">Estas são pesquisas sugeridas, não resultados reais.</p>{(ai.searchQueries||[]).map((x,i)=><p key={i}>• {x}</p>)}{(ai.culturalChecks||[]).map((x,i)=><p key={i}>✓ {x}</p>)}</details>
      </div>}
    </div>
    <p className="text-[0.68rem] text-muted-foreground">O Radar e a pesquisa completa do YouTube continuam disponíveis na extensão original. O DarkCut recebe uma amostra de vídeos e cria análises editoriais; não afirma ter pesquisado todos os canais.</p>
  </section>;
}
