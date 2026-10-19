import type { DarkCutScene } from "@/components/editor/panels/assets/darkcut-automation";
import type { SrtSceneCue } from "./srt-scene-sync";
import { toValidSrtTimestamp } from "./script-srt-generator";

export type SrtMode = "whisper" | "pauses" | "duration" | "estimated";
export type SilenceRange = { start: number; end: number };

export function serializeSrt(cues: readonly SrtSceneCue[]): string {
  return cues.map((cue, index) => [
    String(index + 1),
    `${toValidSrtTimestamp(cue.startSeconds * 1000)} --> ${toValidSrtTimestamp(cue.endSeconds * 1000)}`,
    cue.text.trim(),
    "",
  ].join("\n")).join("\n");
}

/** Snap neighboring scene cuts to real quiet intervals without creating overlap. */
export function snapSrtToPauses(cues: readonly SrtSceneCue[], silences: readonly SilenceRange[], threshold = 0.85): SrtSceneCue[] {
  if (cues.length < 2 || !silences.length) return cues.map(cue => ({...cue}));
  const results = cues.map(cue=>({...cue}));
  for (let i=0;i<results.length-1;i++) {
    const left=results[i],right=results[i+1];
    const center=(left.endSeconds+right.startSeconds)/2;
    const nearby=silences
      .map(s=>(s.start+s.end)/2)
      .filter(t=>t>left.startSeconds+0.12&&t<right.endSeconds-0.12 && Math.abs(t-center)<=threshold)
      .sort((a,b)=>Math.abs(a-center)-Math.abs(b-center))[0];
    if (nearby === undefined) continue;
    const oldGap = right.startSeconds-left.endSeconds;
    if (oldGap>0.15) {
      // Keep actual silent gaps in speech-aligned subtitles.
      continue;
    }
    left.endSeconds=Math.round(nearby*1000)/1000;
    right.startSeconds=left.endSeconds;
  }
  return results;
}

/** A one-to-one scene list for every SRT cue, including 390+ cues. */
export function scenesFromSrt(cues: readonly SrtSceneCue[], previous: readonly DarkCutScene[] = []): DarkCutScene[] {
  const existing=new Map(previous.map(x=>[x.index,x]));
  return cues.map((cue,index)=>{
    const sceneIndex=index+1;
    const seconds=Math.max(0.15,cue.endSeconds-cue.startSeconds);
    const keywords=Array.from(new Set((cue.text.toLocaleLowerCase("pt-BR").normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]{4,}/g)||[]))).slice(0,6);
    const prompt=`Cena ${sceneIndex}, ilustração documental cinematográfica 16:9: ${cue.text}. 
Composição visual específica desta fala; sem palavras ou logotipos dentro da imagem.`;
    const current=existing.get(sceneIndex);
    const sameText=current?.text.trim()===cue.text.trim();
    return {
      id:`scene-${sceneIndex}`,index:sceneIndex,
      text:cue.text,
      durationSeconds:seconds,
      status:sameText ? current!.status : "missing",
      mediaId:sameText ? current!.mediaId : undefined,
      mediaName:sameText ? current!.mediaName : undefined,
      // Visual prompts already refined by the user must not be overwritten.
      prompt:sameText && current?.prompt ? current.prompt : prompt,
      keywords:sameText && current?.keywords ? current.keywords : keywords,
    };
  });
}
