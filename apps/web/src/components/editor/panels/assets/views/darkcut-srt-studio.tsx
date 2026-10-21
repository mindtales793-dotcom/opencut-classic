"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DarkCutSyncView } from "./darkcut-sync";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAssetsPanelStore } from "../assets-panel-store";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useProjectDraft } from "@/darkcut/project-draft";
import { useEditor } from "@/editor/use-editor";
import { generateScriptSrt } from "@/darkcut/script-srt-generator";
import { alignSrtToWordTimings, type GroqTimedWord } from "@/darkcut/srt-word-alignment";
import { analyzeSceneSrt, type SrtSceneCue } from "@/darkcut/srt-scene-sync";
import { scenesFromSrt, serializeSrt, snapSrtToPauses, type SrtMode, type SilenceRange } from "@/darkcut/srt-production-bridge";
import type { DarkCutScene } from "../darkcut-automation";

declare global {
  interface Window {
    darkCutGroqKeys?: {
      status:()=>Promise<{ok:boolean;configured?:boolean;secure?:boolean;error?:string}>;
      save:(secret:string)=>Promise<{ok:boolean;error?:string}>;
      load:()=>Promise<{ok:boolean;secret?:string;error?:string}>;
      remove:()=>Promise<{ok:boolean;error?:string}>;
    };
  }
}
type Job = {
  id:string;status:"running"|"ready"|"error"|"interrupted";
  stage:string;total:number;completed:number;progressPercent:number;message:string;error?:string;
};
const MODES: {id:SrtMode;title:string;description:string}[] = [
  {id:"whisper",title:"Whisper preciso",description:"Alinha o texto aos horários por palavra da narração transcrita."},
  {id:"pauses",title:"Pausas reais",description:"Usa a duração e desloca os cortes para pausas detectadas pelo FFmpeg."},
  {id:"duration",title:"Duração do áudio",description:"Distribui o texto proporcionalmente ao tempo total da narração."},
  {id:"estimated",title:"Estimativa rápida",description:"Divide por palavras sem precisar transcrever ou importar áudio."},
];
const printTime = (s:number)=> {
  if(!Number.isFinite(s))return "00:00";
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;
};

export function DarkCutSrtStudio(){
  const script = useDarkCutProductionStore(s=>s.script);
  const setScript = useDarkCutProductionStore(s=>s.setScript);
  const setActiveTab = useAssetsPanelStore(s=>s.setActiveTab);
  const [srt,setSrt] = useProjectDraft("sync-srt-text","");
  const [,setSrtName] = useProjectDraft("sync-srt-filename","");
  const [scenes,setScenes] = useProjectDraft<DarkCutScene[]>("scenes",[]);
  const [narrationAssetId] = useProjectDraft<string|null>("narration-asset",null);
  const assets = useEditor(e=>e.media.getAssets());
  const [jobId,setJobId] = useProjectDraft<string>("srt-v24-job-id","");
  const [mode,setMode] = useProjectDraft<SrtMode>("srt-v24-mode","duration");
  const [maxWords,setMaxWords] = useState(20);
  const [minWords,setMinWords] = useState(7);
  const [secondsPerWord,setSecondsPerWord] = useState(0.4);
  const [startSeconds,setStartSeconds] = useState(0);
  const [audio,setAudio] = useState<File|null>(null);
  const [audioUrl,setAudioUrl] = useState("");
  const [duration,setDuration] = useState(0);
  const [pauseAt,setPauseAt] = useState<number|null>(null);
  const [silences,setSilences] = useState<SilenceRange[]>([]);
  const [words,setWords] = useState<GroqTimedWord[]>([]);
  const [transcribed,setTranscribed] = useState("");
  const [job,setJob] = useState<Job|null>(null);
  const [working,setWorking] = useState(false);
  const [status,setStatus] = useState("Pronto para montar SRT.");
  const [coverage,setCoverage] = useState<number|null>(null);
  const [groqKey,setGroqKey] = useState("");
  const [keyStatus,setKeyStatus] = useState({secure:false,configured:false});
  const [model,setModel] = useState("whisper-large-v3-turbo");
  const [filter,setFilter] = useState("");
  const [showAll,setShowAll] = useState(false);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const sourceRef = useRef<string>("");
  const lastResult = useRef<string>("");
  const cues = useMemo(()=>analyzeSceneSrt(srt),[srt]);
  const prepared=useMemo(()=>generateScriptSrt(script,{
    maxWords,minWords,secondsPerWord,targetDurationSeconds:duration||undefined,startSeconds
  }),[script,maxWords,minWords,secondsPerWord,duration,startSeconds]);
  const filtered=useMemo(()=>cues.cues.filter(c=>
    !filter.trim()||c.text.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())||String(c.index).includes(filter.trim())
  ),[cues.cues,filter]);
  const visible=showAll?filtered:filtered.slice(0,40);

  useEffect(()=>{
    let live=true;
    void window.darkCutGroqKeys?.status().then(x=>{
      if(live)setKeyStatus({secure:!!x.secure,configured:!!x.configured});
    }).catch(()=>{});
    return()=>{live=false;};
  },[]);
  useEffect(()=>()=>{if(sourceRef.current)URL.revokeObjectURL(sourceRef.current);},[]);
  const getKey=async()=>{
    if(groqKey.trim())return groqKey.trim();
    if(window.darkCutGroqKeys&&keyStatus.configured){
      const response=await window.darkCutGroqKeys.load();
      if(response.ok&&response.secret)return response.secret;
      throw new Error(response.error||"Chave protegida indisponível.");
    }
    throw new Error("Cadastre a chave Groq ou cole uma chave para usar apenas nesta sessão.");
  };
  const saveKey=async()=>{
    if(!window.darkCutGroqKeys)return toast.error("Salvamento protegido disponível somente no executável Windows.");
    if(!groqKey.trim())return toast.error("Digite sua chave Groq primeiro.");
    const result=await window.darkCutGroqKeys.save(groqKey.trim());
    if(!result.ok)return toast.error(result.error||"Não foi possível salvar a chave.");
    setGroqKey("");setKeyStatus({secure:true,configured:true});
    toast.success("Chave Groq protegida pelo Windows. Não precisará colar novamente.");
  };
  const forgetKey=async()=>{
    if(!window.darkCutGroqKeys)return;
    const result=await window.darkCutGroqKeys.remove();
    if(result.ok){setKeyStatus(v=>({...v,configured:false}));toast.success("Chave apagada do armazenamento protegido.");}
    else toast.error(result.error||"Não foi possível apagar a chave.");
  };
  const testKey=async()=>{
    setWorking(true);
    try{
      const apiKey=await getKey();
      const response=await fetch("/api/darkcut/srt/jobs",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"test-key",apiKey})});
      const data=await response.json() as {error?:string;models?:string[]};
      if(!response.ok)throw new Error(data.error||"Acesso recusado.");
      toast.success(`Groq autenticada. Modelos listados: ${data.models?.join(", ")||"nenhum Whisper disponível"}`);
    }catch(e){toast.error(e instanceof Error?e.message:"Falha de conexão.");}
    finally{setWorking(false);}
  };
  const selectAudio=async(file:File|null)=>{
    if(sourceRef.current){URL.revokeObjectURL(sourceRef.current);sourceRef.current="";}
    setAudio(file);setDuration(0);setAudioUrl("");setSilences([]);setWords([]);
    setTranscribed("");setCoverage(null);setJobId("");setJob(null);lastResult.current="";
    if(!file)return;
    if(file.size>300*1024*1024){toast.error("O limite do importador é 300 MB.");return;}
    const url=URL.createObjectURL(file);
    sourceRef.current=url;setAudioUrl(url);
    const audioElement=document.createElement("audio");
    audioElement.preload="metadata";
    audioElement.src=url;
    audioElement.onloadedmetadata=()=>{
      if(Number.isFinite(audioElement.duration)&&audioElement.duration>0)
        setDuration(audioElement.duration);
      else setStatus("Não foi possível medir a duração; FFmpeg tentará detectar no servidor.");
    };
    audioElement.onerror=()=>setStatus("Erro de leitura no navegador; verifique formato e FFmpeg.");
    setStatus(`Narração carregada: ${file.name}. Escolha um modo de sincronização.`);
  };

  useEffect(()=>{
    if(!jobId)return;
    let live=true;
    const check=async()=>{
      const response=await fetch(`/api/darkcut/srt/jobs?id=${encodeURIComponent(jobId)}`,{cache:"no-store"});
      const data=await response.json() as Job&{error?:string};
      if(!live)return;
      if(!response.ok){setStatus(data.error||"Falha ao consultar tarefa.");return;}
      setJob(data);
      if(data.status==="ready"&&lastResult.current!==jobId){
        const resultResponse=await fetch(`/api/darkcut/srt/jobs?id=${encodeURIComponent(jobId)}&result=1`,{cache:"no-store"});
        if(resultResponse.ok){
          const result=await resultResponse.json() as {text?:string;words?:GroqTimedWord[]};
          if(!live)return;
          setWords(result.words||[]);setTranscribed(result.text||"");
          lastResult.current=jobId;setWorking(false);setStatus("✓ Transcrição completa e horários recuperados.");
          setMode("whisper");
          toast.success(`${result.words?.length||0} palavras sincronizadas pela Groq.`);
        }
      }else if(data.status==="error"||data.status==="interrupted"){
        setWorking(false);setStatus(data.error||"Tarefa interrompida: os blocos concluídos permanecem salvos.");
      }else if(data.status==="running"){
        setStatus(data.message||"Reconhecendo narração.");
      }
    };
    void check().catch(()=>{});
    const interval=window.setInterval(()=>{void check().catch(()=>{});},1600);
    return()=>{live=false;window.clearInterval(interval);};
  },[jobId,setMode]);

  const transcribe=async(resume=false)=>{
    if(!resume&&!audio)return toast.error("Importe a narração primeiro.");
    setWorking(true);
    try{
      const apiKey=await getKey();
      let response:Response;
      if(resume){
        response=await fetch("/api/darkcut/srt/jobs",{method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"resume",id:jobId,apiKey})});
      }else{
        const form=new FormData();
        form.set("audio",audio!,audio!.name);form.set("apiKey",apiKey);form.set("model",model);form.set("mode","transcribe");
        response=await fetch("/api/darkcut/srt/jobs",{method:"POST",body:form});
      }
      const data=await response.json() as {id?:string;error?:string};
      if(!response.ok||!data.id)throw new Error(data.error||"Falha ao iniciar a transcrição.");
      setJobId(data.id);
      setStatus("Transcrição recebida. Os blocos serão gerados em segundo plano.");
    }catch(e){setStatus(e instanceof Error?e.message:"Falha ao iniciar transcrição.");setWorking(false);}
  };
  const useProjectNarration=async()=>{
    const asset=assets.find(item=>item.id===narrationAssetId);
    if(!asset?.url)return toast.error("Gere uma narração Fish Audio na Produção antes de importar.");
    setWorking(true);
    try{
      const response=await fetch(asset.url);
      if(!response.ok)throw new Error("Não foi possível ler o áudio do projeto.");
      const blob=await response.blob();
      await selectAudio(new File([blob],asset.name.endsWith(".mp3")?asset.name:asset.name+".mp3",{type:blob.type||"audio/mpeg"}));
      toast.success("Narração Fish conectada ao separador SRT.");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao recuperar narração do projeto.");}
    finally{setWorking(false);}
  };
  const analyzePauses=async()=>{
    if(!audio)return toast.error("Importe uma narração para analisar pausas.");
    setWorking(true);setStatus("FFmpeg analisando intervalos de silêncio do áudio…");
    try{
      const form=new FormData();form.set("audio",audio,audio.name);form.set("mode","silences");
      const response=await fetch("/api/darkcut/srt/jobs",{method:"POST",body:form});
      const data=await response.json() as {silences?:SilenceRange[];duration?:number;error?:string};
      if(!response.ok)throw new Error(data.error||"Falha ao detectar pausas.");
      setSilences(data.silences||[]);
      if(data.duration)setDuration(data.duration);
      setMode("pauses");setStatus(`✓ ${data.silences?.length||0} pausas detectadas. Gere o SRT para ajustar os cortes.`);
    }catch(e){setStatus(e instanceof Error?e.message:"Erro ao detectar pausas.");}
    finally{setWorking(false);}
  };
  const build=()=>{
    if(!script.trim())return toast.error("Adicione o roteiro antes de gerar o SRT.");
    let result=generateScriptSrt(script,{
      maxWords,minWords,secondsPerWord,startSeconds,
      targetDurationSeconds:mode==="estimated"?undefined:duration||undefined,
    });
    if(mode==="whisper"){
      if(!words.length||!duration)return toast.error("Transcreva a narração para usar o modo Whisper.");
      const aligned=alignSrtToWordTimings(result,words,duration);
      setCoverage(aligned.coverage);
      if(aligned.mode!=="word-aligned"){
        return toast.error("A correspondência ficou baixa. Confira se o roteiro corresponde ao áudio, ou use o modo duração.");
      }
      setSrt(aligned.srt);
    }else if(mode==="pauses"){
      if(!silences.length||!duration)return toast.error("Clique em Detectar pausas primeiro.");
      const adjusted=snapSrtToPauses(result.cues,silences.map(p=>({start:p.start+startSeconds,end:p.end+startSeconds})));
      setSrt(serializeSrt(adjusted));
      setCoverage(null);
    }else{setSrt(result.srt);setCoverage(null);}
    setSrtName("darkcut-cenas-sincronizadas.srt");
    setStatus(`✓ ${result.cues.length} cenas SRT geradas no modo ${MODES.find(x=>x.id===mode)?.title}.`);
    toast.success("SRT pronto para revisar e conectar às cenas.");
  };
  const updateCue=(position:number,field:"startSeconds"|"endSeconds"|"text",value:string)=>{
    const copy=cues.cues.map(x=>({...x}));
    const target=copy[position];
    if(!target)return;
    if(field==="text")target.text=value;
    else{
      const valueNumber=Number(value);
      if(!Number.isFinite(valueNumber)||valueNumber<0)return;
      target[field]=valueNumber;
    }
    // Allow temporary edits but never save invalid SRT timings.
    if(copy.some(x=>x.endSeconds<=x.startSeconds))return;
    setSrt(serializeSrt(copy));
  };
  const play=(cue:SrtSceneCue)=>{
    if(!audioRef.current)return toast.error("Carregue a narração para ouvir este trecho.");
    audioRef.current.pause();
    audioRef.current.currentTime=cue.startSeconds;
    setPauseAt(cue.endSeconds);
    void audioRef.current.play().catch(()=>toast.error("Não foi possível reproduzir o trecho."));
  };
  const createScenes=()=>{
    if(!cues.cues.length)return toast.error("Gere ou importe um SRT antes.");
    if(cues.overlaps||cues.invalidBlocks)return toast.error("Corrija os trechos inválidos/sobrepostos antes de criar cenas.");
    const changed=scenes.some((scene,index)=>cues.cues[index]?.text.trim()!==scene.text.trim());
    if(changed&&scenes.length&&!window.confirm("Atualizar as cenas da Produção com os trechos do SRT? Imagens das cenas cujo texto mudou serão desassociadas para revisão."))return;
    const next=scenesFromSrt(cues.cues,scenes);
    setScenes(next);
    toast.success(`${next.length} cenas vinculadas ao SRT. As mídias existentes com o mesmo texto foram preservadas.`);
    setActiveTab("production");
  };
  const download=(value:string,ext:string)=>{
    const link=URL.createObjectURL(new Blob([value],{type:"text/plain;charset=utf-8"}));
    const anchor=document.createElement("a");anchor.href=link;anchor.download=`darkcut-${ext}`;anchor.click();
    window.setTimeout(()=>URL.revokeObjectURL(link),2000);
  };

  return <div className="space-y-4 bg-gradient-to-b from-primary/[0.04] via-background to-background p-4 text-sm" data-darkcut-srt-v24="true">
    <header className="rounded-2xl border border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-primary">DarkCut Studio • Precisão na timeline</p>
          <h2 className="mt-1 text-xl font-bold">📝 Roteiro → SRT <span className="text-primary">V2.4</span></h2>
          <p className="mt-1 text-xs text-muted-foreground">Roteiro, narração, transcrição, pausas, revisão e cenas conectadas à Produção.</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2 text-right"><p className="text-lg font-bold tabular-nums">{cues.cues.length||prepared.cues.length}</p><p className="text-[0.68rem] text-muted-foreground">Cenas identificadas</p></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.7rem]">
        <div className="rounded-md bg-background p-2"><strong className="block text-sm">{printTime(duration||prepared.durationSeconds)}</strong><span className="text-muted-foreground">Duração</span></div>
        <div className="rounded-md bg-background p-2"><strong className="block text-sm">{prepared.totalWords.toLocaleString("pt-BR")}</strong><span className="text-muted-foreground">Palavras</span></div>
        <div className="rounded-md bg-background p-2"><strong className="block text-sm">{scenes.filter(x=>x.mediaId).length}/{scenes.length}</strong><span className="text-muted-foreground">Mídias vinculadas</span></div>
      </div>
    </header>

    <section className="rounded-xl border bg-card p-3 space-y-3">
      <h3 className="font-semibold">01 • Roteiro compartilhado com Produção</h3>
      <textarea rows={5} value={script} onChange={e=>setScript(e.target.value)}
        placeholder="Cole o roteiro. O mesmo texto será utilizado pela CRIS e pela Produção…"
        className="w-full resize-y rounded-lg border bg-background p-3 text-xs leading-5 outline-primary"/>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Compartilhado com a CRIS, narração e prompts.</span>
        <label className="cursor-pointer rounded-lg border px-3 py-2 font-medium">↑ Importar TXT
          <input className="hidden" type="file" accept=".txt,text/plain" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(setScript).catch(()=>toast.error("TXT inválido."));}}/>
        </label>
      </div>
    </section>

    <section className="rounded-xl border bg-card p-3 space-y-3">
      <h3 className="font-semibold">02 • Narração e modo de sincronização</h3>
      <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-primary/35 bg-primary/[0.03] p-4 text-center text-xs transition-colors hover:bg-primary/10">
        <span>🎙️ {audio?`${audio.name} · ${(audio.size/1048576).toFixed(1)} MB`:"Selecionar narração MP3, WAV, M4A ou outro áudio (até 300 MB)"}</span>
        <input type="file" accept=".mp3,.wav,.m4a,.flac,.ogg,.webm,.mp4,audio/*" className="hidden" onChange={e=>{void selectAudio(e.target.files?.[0]||null);}}/>
      </label>
      <Button size="sm" variant="secondary" disabled={working||!narrationAssetId} onClick={()=>{void useProjectNarration();}}>
        🎧 Usar narração Fish do projeto {narrationAssetId?"":"(ainda não gerada)"}
      </Button>
      {audioUrl&&<audio ref={audioRef} src={audioUrl} preload="metadata" controls className="w-full" onTimeUpdate={e=>{
        if(pauseAt!==null && e.currentTarget.currentTime>=pauseAt){e.currentTarget.pause();setPauseAt(null);}
      }}/>}
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map(item=><button key={item.id} onClick={()=>setMode(item.id)} type="button"
          aria-pressed={mode===item.id}
          className={`rounded-xl border p-3 text-left transition-all ${mode===item.id?"border-primary bg-primary/10 ring-1 ring-primary/40":"bg-background hover:border-primary/50"}`}>
          <span className="flex items-center gap-2 text-xs font-semibold"><span className={`inline-block size-2 rounded-full ${mode===item.id?"bg-primary":"bg-muted-foreground/50"}`}/>{item.title}</span>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">{item.description}</p>
        </button>)}
      </div>
      <div className="grid grid-cols-4 gap-2 text-[0.7rem]">
        <label>Máx. palavras<input className="mt-1 w-full rounded-md border bg-background p-2" type="number" min={5} max={100} value={maxWords} onChange={e=>setMaxWords(Math.max(5,Math.min(100,Number(e.target.value)||20)))}/></label>
        <label>Mín. palavras<input className="mt-1 w-full rounded-md border bg-background p-2" type="number" min={1} max={30} value={minWords} onChange={e=>setMinWords(Math.max(1,Math.min(30,Number(e.target.value)||7)))}/></label>
        <label>Seg. / palavra<input className="mt-1 w-full rounded-md border bg-background p-2" type="number" step={0.05} min={0.1} max={2} value={secondsPerWord} onChange={e=>setSecondsPerWord(Math.max(0.1,Math.min(2,Number(e.target.value)||0.4)))}/></label>
        <label>Início (seg.)<input className="mt-1 w-full rounded-md border bg-background p-2" type="number" min={0} step={0.1} value={startSeconds} onChange={e=>setStartSeconds(Math.max(0,Number(e.target.value)||0))}/></label>
      </div>
      {mode==="pauses"&&<Button variant="outline" disabled={!audio||working} onClick={()=>{void analyzePauses();}}>{working?"Analisando pausas…":`♬ Detectar pausas no áudio ${silences.length?"("+silences.length+")":""}`}</Button>}
    </section>

    <section className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">03 • Transcrição Whisper + API segura</h3>
        <span className="rounded-full border px-2 py-1 text-[0.68rem] text-muted-foreground">{keyStatus.configured?"🔒 Salva no Windows":keyStatus.secure?"DPAPI disponível":"Sessão local"}</span>
      </div>
      <p className="text-xs text-muted-foreground">Salve uma única vez com a proteção do Windows. A versão interna não copia sua chave para a extensão nem a inclui nos arquivos de projeto.</p>
      <input type="password" value={groqKey} autoComplete="off" onChange={e=>setGroqKey(e.target.value)}
        placeholder={keyStatus.configured?"Chave salva — pode transcrever sem digitar":"Chave Groq (gsk_…)"}
        className="w-full rounded-lg border bg-background p-3 text-xs"/>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!groqKey.trim()||!keyStatus.secure} onClick={()=>{void saveKey();}}>🔐 Salvar no Windows</Button>
        <Button size="sm" variant="outline" disabled={working||(!groqKey&&!keyStatus.configured)} onClick={()=>{void testKey();}}>Testar acesso Groq</Button>
        {keyStatus.configured&&<Button size="sm" variant="outline" onClick={()=>{void forgetKey();}}>Apagar chave</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="min-w-0 flex-1 rounded-md border bg-background p-2 text-xs" value={model} onChange={e=>setModel(e.target.value)}>
          <option value="whisper-large-v3-turbo">Whisper Large V3 Turbo · rápido</option>
          <option value="whisper-large-v3">Whisper Large V3 · precisão</option>
        </select>
        <Button size="sm" disabled={!audio||working||(!groqKey&&!keyStatus.configured)} onClick={()=>{void transcribe(false);}}>🎤 Transcrever narração</Button>
        {jobId&&(job?.status==="error"||job?.status==="interrupted")&&<Button size="sm" variant="secondary" disabled={working} onClick={()=>{void transcribe(true);}}>↻ Retomar blocos</Button>}
      </div>
      {jobId&&<div className="rounded-xl border border-primary/30 bg-background p-3 space-y-2">
        <div className="flex items-center justify-between text-xs"><span className="font-medium">{job?.stage==="ready"?"Transcrição concluída":job?.message||"Carregando tarefa…"}</span><strong className="tabular-nums">{job?.progressPercent??0}%</strong></div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job?.progressPercent??0} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{width:`${job?.progressPercent??0}%`}}/>
        </div>
        <p className="text-[0.68rem] text-muted-foreground">{job?.completed??0} de {job?.total||"?"} blocos realmente transcritos. Etapa atual: {job?.stage||"aguardando"}.</p>
        {job?.error&&<p className="text-xs text-destructive">{job.error}</p>}
      </div>}
      {words.length>0&&<details className="rounded-lg border p-2 text-xs"><summary className="cursor-pointer font-semibold">✓ Ver transcrição ({words.length} palavras)</summary>
        <p className="mt-2 max-h-32 overflow-auto text-muted-foreground">{transcribed}</p>
        <div className="mt-2"><Button size="sm" variant="secondary" onClick={()=>download(transcribed,"transcricao.txt")}>↓ Baixar TXT</Button>
        <Button size="sm" variant="outline" className="ml-2" onClick={()=>{if(script.trim()&&!window.confirm("Substituir o roteiro atual pelo texto transcrito?"))return;setScript(transcribed);toast.success("Roteiro atualizado.");}}>Usar como roteiro</Button></div>
      </details>}
    </section>

    <section className="rounded-xl border border-primary/35 bg-card p-3 space-y-3">
      <div><h3 className="font-semibold">04 • SRT e revisão visual de cenas</h3><p className="mt-1 text-xs text-muted-foreground">Confira horário, texto e áudio antes de vincular imagens ou aplicar na timeline.</p></div>
      <Button className="w-full" disabled={!script.trim()} onClick={build}>⚡ Gerar SRT · {prepared.cues.length} cenas</Button>
      <p className="text-xs text-muted-foreground" role="status">{status}</p>
      {coverage!==null&&<p className="text-xs text-muted-foreground">Correspondência roteiro/narração: <b>{Math.round(coverage*100)}%</b> (não equivale a uma garantia de precisão).</p>}
      {cues.overlaps>0&&<p className="text-xs text-destructive">⚠ {cues.overlaps} trechos sobrepostos: ajuste antes de aplicar.</p>}
      {cues.invalidBlocks>0&&<p className="text-xs text-destructive">⚠ {cues.invalidBlocks} blocos inválidos detectados.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!srt.trim()} onClick={()=>download(srt,"cenas.srt")}>↓ Baixar SRT</Button>
        <Button size="sm" variant="outline" disabled={!srt.trim()} onClick={()=>document.getElementById("darkcut-srt-timeline-sync")?.scrollIntoView({behavior:"smooth",block:"start"})}>Ver sincronização →</Button>
        <Button size="sm" disabled={!cues.cues.length||!!cues.overlaps||!!cues.invalidBlocks} onClick={createScenes}>🎬 Criar {cues.cues.length} cenas na Produção</Button>
      </div>
      <details><summary className="cursor-pointer rounded-lg border px-3 py-2 text-xs">Editar SRT bruto / importar arquivo SRT</summary>
        <label className="mt-2 block cursor-pointer rounded-md border p-2 text-xs">↑ Importar SRT
          <input type="file" className="ml-2 text-xs" accept=".srt,text/plain" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(text=>{setSrt(text);setSrtName(file.name);}).catch(()=>toast.error("Não foi possível importar SRT."));}}/>
        </label>
        <textarea rows={8} className="mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs" value={srt} onChange={e=>setSrt(e.target.value)}/>
      </details>
      <div className="rounded-xl border bg-background p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-xs">{cues.cues.length} cenas · {printTime(cues.durationSeconds)}</b>
          <input className="rounded-md border bg-card p-2 text-xs" placeholder="Buscar cena ou fala..." value={filter} onChange={e=>setFilter(e.target.value)}/>
        </div>
        <div className="mt-2 max-h-[400px] space-y-2 overflow-y-auto">
          {visible.map(cue=>{
            const pos=cues.cues.indexOf(cue);
            return <div key={pos} className="rounded-lg border bg-card p-2 text-xs">
              <div className="mb-2 flex items-center gap-2">
                <strong className="rounded-md bg-primary/10 px-2 py-1 text-primary">#{String(pos+1).padStart(3,"0")}</strong>
                <input aria-label="Início da cena em segundos" type="number" min={0} step={0.01} className="w-20 rounded border bg-background px-2 py-1 tabular-nums" defaultValue={cue.startSeconds} key={`s-${cue.startSeconds}`} onBlur={e=>updateCue(pos,"startSeconds",e.target.value)}/>
                <span className="text-muted-foreground">→</span>
                <input aria-label="Fim da cena em segundos" type="number" min={0} step={0.01} className="w-20 rounded border bg-background px-2 py-1 tabular-nums" defaultValue={cue.endSeconds} key={`e-${cue.endSeconds}`} onBlur={e=>updateCue(pos,"endSeconds",e.target.value)}/>
                <button type="button" className="ml-auto rounded-md border px-2 py-1 hover:border-primary" onClick={()=>play(cue)}>▶ Ouvir</button>
              </div>
              <textarea aria-label={`Fala da cena ${pos+1}`} rows={2} className="w-full resize-y rounded-md border bg-background p-2" defaultValue={cue.text} key={`t-${cue.text}`} onBlur={e=>{if(e.target.value!==cue.text)updateCue(pos,"text",e.target.value);}}/>
            </div>;
          })}
          {!visible.length&&<p className="p-4 text-center text-xs text-muted-foreground">Gere um SRT para ver a lista editável de cenas.</p>}
        </div>
        {filtered.length>40&&<Button size="sm" variant="outline" className="mt-2 w-full" onClick={()=>setShowAll(v=>!v)}>{showAll?"Mostrar primeiras 40":`Mostrar todas as ${filtered.length} cenas`}</Button>}
      </div>
      <p className="text-[0.69rem] text-muted-foreground">As cenas seguem cada linha do SRT e preservam as mídias associadas. Confira e aplique os tempos abaixo, sem sair desta aba.</p>
      <div id="darkcut-srt-timeline-sync"><DarkCutSyncView mode="srt" /></div>
    </section>
  </div>;
}
