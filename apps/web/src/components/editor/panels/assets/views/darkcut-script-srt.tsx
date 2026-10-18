"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAssetsPanelStore } from "../assets-panel-store";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useProjectDraft } from "@/darkcut/project-draft";
import { generateScriptSrt } from "@/darkcut/script-srt-generator";
import { alignSrtToWordTimings, type GroqTimedWord } from "@/darkcut/srt-word-alignment";
import { analyzeSceneSrt } from "@/darkcut/srt-scene-sync";

export function DarkCutScriptSrtView(){
  const script=useDarkCutProductionStore(s=>s.script);
  const setScript=useDarkCutProductionStore(s=>s.setScript);
  const [srt,setSrt]=useProjectDraft("sync-srt-text","");
  const [,setSrtName]=useProjectDraft("sync-srt-filename","");
  const setActiveTab=useAssetsPanelStore(s=>s.setActiveTab);
  const [maxWords,setMaxWords]=useState(20),[minWords,setMinWords]=useState(7);
  const [rate,setRate]=useState(0.4),[audioDuration,setAudioDuration]=useState(0);
  const [audio,setAudio]=useState<File|null>(null);
  const [groqKey,setGroqKey]=useState("");
  const [model,setModel]=useState("whisper-large-v3-turbo");
  const [timedWords,setTimedWords]=useState<GroqTimedWord[]>([]);
  const [recognizedText,setRecognizedText]=useState("");
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState("Pronto para separar roteiro.");
  const [accuracy,setAccuracy]=useState<number|null>(null);
  const source=useRef<string|null>(null);
  const draft=useMemo(()=>generateScriptSrt(script,{maxWords,minWords,secondsPerWord:rate,targetDurationSeconds:audioDuration||undefined}),[script,maxWords,minWords,rate,audioDuration]);
  const analysis=useMemo(()=>analyzeSceneSrt(srt),[srt]);
  useEffect(()=>()=>{if(source.current)URL.revokeObjectURL(source.current);},[]);
  const chooseAudio=async(file:File|null)=>{
    if(source.current){URL.revokeObjectURL(source.current);source.current=null;}
    setAudio(file);setAudioDuration(0);setTimedWords([]);setRecognizedText("");setAccuracy(null);
    if(!file)return;
    const url=URL.createObjectURL(file);source.current=url;
    try {
      const duration=await new Promise<number>((resolve,reject)=>{
        const el=document.createElement("audio");el.preload="metadata";
        const timer=window.setTimeout(()=>reject(new Error("Áudio sem duração válida.")),15000);
        el.onloadedmetadata=()=>{clearTimeout(timer);resolve(el.duration);};
        el.onerror=()=>{clearTimeout(timer);reject(new Error("O navegador não conseguiu ler este áudio."));};
        el.src=url;
      });
      if(!Number.isFinite(duration)||duration<=0)throw Error("Duração inválida.");
      setAudioDuration(duration);
      setStatus(`Áudio carregado: ${file.name} (${Math.round(duration)} segundos).`);
    }catch(e){setStatus(e instanceof Error?e.message:"Falha ao ler áudio.");}
  };
  const generate=()=>{
    if(!script.trim())return toast.error("Cole o roteiro na Produção ou nesta aba primeiro.");
    const plan=generateScriptSrt(script,{maxWords,minWords,secondsPerWord:rate,targetDurationSeconds:audioDuration||undefined});
    const aligned=timedWords.length&&audioDuration?alignSrtToWordTimings(plan,timedWords,audioDuration):null;
    setSrt(aligned?.mode==="word-aligned"?aligned.srt:plan.srt);
    setAccuracy(aligned?.coverage??null);
    setSrtName("darkcut-roteiro-sincronizado.srt");
    setStatus(aligned?.mode==="word-aligned"
      ?`✓ ${aligned.cueCount} cenas SRT alinhadas por palavras (${Math.round(aligned.coverage*100)}% de correspondência).`
      :`✓ ${plan.cues.length} cenas SRT geradas. ${audioDuration?"Duração do áudio real; cortes proporcionais ao roteiro.":"Tempos estimados; importe a narração para melhorar."}`);
  };
  const transcribe=async()=>{
    if(!audio||!groqKey.trim())return toast.error("Selecione áudio e informe a chave Groq nesta sessão.");
    if(audio.size>24*1024*1024)return toast.error("Mais de 24 MB: utilize o separador externo V2.4 com FFmpeg ou comprima o arquivo.");
    setRunning(true);setStatus("Enviando narração à Groq. Aguarde o reconhecimento das palavras…");
    try{
      const form=new FormData();form.append("audio",audio,audio.name);
      form.append("model",model);form.append("apiKey",groqKey);
      const res=await fetch("/api/darkcut/srt/whisper",{method:"POST",body:form});
      const data=await res.json() as {error?:string;words?:GroqTimedWord[];text?:string};
      if(!res.ok||!data.words?.length)throw new Error(data.error||"Whisper não retornou horários por palavra.");
      setTimedWords(data.words);setRecognizedText(data.text||"");
      setStatus(`✓ ${data.words.length} palavras transcritas. Clique em Gerar SRT para aplicar os horários reais.`);
      toast.success("Transcrição concluída!");
    }catch(e){setStatus(e instanceof Error?e.message:"Falha ao transcrever.");}
    finally{setRunning(false);}
  };
  const download=(contents:string,filename:string,type:string)=>{
    const url=URL.createObjectURL(new Blob([contents],{type}));
    const el=document.createElement("a");el.href=url;el.download=filename;el.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  return <div className="space-y-4 p-4 text-sm" data-darkcut-roteiro-srt="true">
    <div><h2 className="text-lg font-bold">📝 Roteiro → SRT</h2><p className="text-xs text-muted-foreground">Separador incorporado à Produção. Divide cenas, usa a duração real da narração e oferece alinhamento por palavra com Groq/Whisper.</p></div>
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="font-semibold">1. Roteiro conectado à Produção</h3>
      <textarea className="w-full rounded-md border bg-background p-2 text-xs" rows={7} value={script} onChange={e=>setScript(e.target.value)} placeholder="Cole aqui ou na aba Produção o texto completo..." />
      <input type="file" accept=".txt,text/plain" className="block max-w-full text-xs" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(setScript).catch(()=>toast.error("TXT inválido"));}}/>
      <p className="text-xs text-muted-foreground">O texto é compartilhado com a CRIS e a geração de cenas; editar aqui também altera o roteiro da Produção.</p>
    </div>
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <h3 className="font-semibold">2. Divisão e duração real</h3>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs">Máx. palavras<input className="mt-1 w-full rounded border bg-background p-2" type="number" min={5} max={100} value={maxWords} onChange={e=>setMaxWords(Math.max(5,Math.min(100,Number(e.target.value)||20)))} /></label>
        <label className="text-xs">Mín. palavras<input className="mt-1 w-full rounded border bg-background p-2" type="number" min={1} max={30} value={minWords} onChange={e=>setMinWords(Math.max(1,Math.min(30,Number(e.target.value)||7)))} /></label>
        <label className="text-xs">Seg./palavra<input className="mt-1 w-full rounded border bg-background p-2" type="number" step={0.05} min={0.1} max={2} value={rate} onChange={e=>setRate(Math.max(0.1,Math.min(2,Number(e.target.value)||0.4)))} /></label>
      </div>
      <input type="file" accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*" className="block max-w-full text-xs" onChange={e=>{void chooseAudio(e.target.files?.[0]??null);}}/>
      <div className="rounded-md border bg-background p-2 text-xs"><span className="font-semibold">{draft.cues.length} cenas • {draft.totalWords} palavras</span><p className="text-muted-foreground">{audioDuration?`Duração real: ${audioDuration.toFixed(1)} s`:"Duração estimada: "+draft.durationSeconds.toFixed(1)+" s"}</p></div>
    </div>
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="font-semibold">3. Alinhamento por palavras (opcional)</h3>
      <p className="text-xs text-muted-foreground">A Groq recebe o áudio somente quando você clicar em Transcrever. Por segurança, a chave digitada nesta aba fica apenas na sessão, sem ser salva no navegador. O separador externo V2.4 mantém o DPAPI do Windows.</p>
      <input className="w-full rounded-md border bg-background p-2 text-xs" type="password" autoComplete="off" value={groqKey} onChange={e=>setGroqKey(e.target.value)} placeholder="Chave Groq (gsk_…)" />
      <select className="w-full rounded-md border bg-background p-2 text-xs" value={model} onChange={e=>setModel(e.target.value)}><option value="whisper-large-v3-turbo">Whisper Large V3 Turbo • rápido</option><option value="whisper-large-v3">Whisper Large V3 • precisão</option></select>
      <Button className="w-full" size="sm" disabled={!audio||running||!groqKey} onClick={()=>{void transcribe();}}>{running?"Transcrevendo áudio…":"🎙 Transcrever narração no Whisper"}</Button>
      {recognizedText&&<details className="text-xs"><summary>Ver transcrição ({timedWords.length} palavras)</summary><p className="mt-2 rounded-md border p-2">{recognizedText.slice(0,1500)}</p><Button variant="secondary" size="sm" onClick={()=>download(recognizedText,"transcricao-darkcut.txt","text/plain;charset=utf-8")}>Baixar transcrição TXT</Button></details>}
    </div>
    <div className="space-y-2 rounded-xl border border-primary/30 bg-card p-3">
      <h3 className="font-semibold">4. Gerar e conectar SRT</h3>
      <Button className="w-full" onClick={generate} disabled={!script.trim()}>⚡ Gerar SRT para este projeto</Button>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
      {accuracy!=null&&<p className="text-xs text-muted-foreground">Correspondência com a narração: {Math.round(accuracy*100)}%. Se baixa, revise o texto e o áudio.</p>}
      <textarea className="min-h-44 w-full rounded-md border bg-background p-2 font-mono text-xs" value={srt} onChange={e=>setSrt(e.target.value)} placeholder="O arquivo SRT será exibido aqui..." />
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!srt.trim()} variant="secondary" onClick={()=>download(srt,"darkcut-roteiro-sincronizado.srt","text/plain;charset=utf-8")}>↓ Baixar SRT</Button><Button size="sm" disabled={!srt.trim()} onClick={()=>{setActiveTab("sync");toast.success("SRT enviado à sincronização.");}}>Enviar à Sincronização →</Button></div>
      <p className="text-xs text-muted-foreground">Leitura atual: {analysis.cues.length} blocos. As cenas podem ser usadas pela timeline e revisadas antes da edição automática.</p>
    </div>
  </div>;
}
