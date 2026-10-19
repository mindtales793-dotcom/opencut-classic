import { toValidSrtTimestamp, type ScriptSrtResult } from "./script-srt-generator";

export type GroqTimedWord={word:string;start:number;end:number};
export type AlignedSrtResult={srt:string;coverage:number;cueCount:number;mode:"word-aligned"|"estimated"};
function norm(s:string){return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");}
export function alignSrtToWordTimings(draft:ScriptSrtResult, words:GroqTimedWord[], durationSeconds:number):AlignedSrtResult{
 if(!draft.cues.length) return {srt:"",coverage:0,cueCount:0,mode:"estimated"};
 const durationMs=Math.max(1,Math.round(durationSeconds*1000));
 const tokens=draft.cues.flatMap(cue=>cue.text.trim().split(/\s+/).filter(Boolean));
 const actual=words.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>=w.start);
 if(!tokens.length||!actual.length)return {srt:draft.srt,coverage:0,cueCount:draft.cues.length,mode:"estimated"};
 const recognized=actual.map(w=>norm(w.word));
 const anchors:{index:number;time:number}[]=[{index:0,time:0}];
 let cursor=0,matches=0;
 for(let i=0;i<tokens.length;i++){
  const target=norm(tokens[i]);if(!target)continue;
  for(let j=cursor;j<Math.min(recognized.length,cursor+32);j++){
   if(recognized[j]===target){
    matches++;cursor=j+1;
    anchors.push({index:i,time:Math.max(0,Math.min(durationMs,Math.round(actual[j].start*1000)))});
    break;
   }
  }
 }
 const coverage=matches/tokens.length;
 if(coverage<0.4)return {srt:draft.srt,coverage,cueCount:draft.cues.length,mode:"estimated"};
 anchors.push({index:tokens.length,time:durationMs});
 anchors.sort((a,b)=>a.index-b.index||a.time-b.time);
 const timeAt=(i:number)=>{
  for(let j=1;j<anchors.length;j++){
   const b=anchors[j],a=anchors[j-1];
   if(i<=b.index){
    if(a.index===b.index)return b.time;
    return Math.round(a.time+(b.time-a.time)*(i-a.index)/(b.index-a.index));
   }
  }
  return durationMs;
 };
 let total=0;
 const raw=[0];
 for(const cue of draft.cues){total+=cue.wordCount;raw.push(timeAt(total));}
 const bounds=[0];
 for(let i=1;i<raw.length-1;i++){
  const remaining=raw.length-i-1;
  const t=Math.max(bounds.at(-1)!+1,Math.min(raw[i],durationMs-remaining));
  bounds.push(t);
 }
 bounds.push(durationMs);
 const originMs=Math.max(0,Math.round((draft.cues[0]?.startSeconds??0)*1000));
 const srt=draft.cues.map((cue,i)=>[
  String(i+1),`${toValidSrtTimestamp(bounds[i]+originMs)} --> ${toValidSrtTimestamp(bounds[i+1]+originMs)}`,cue.text,"",
 ].join("\n")).join("\n");
 return {srt,coverage,cueCount:draft.cues.length,mode:"word-aligned"};
}
