import { describe, expect, test } from "bun:test";
import { scenesFromSrt, serializeSrt, snapSrtToPauses } from "../srt-production-bridge";
import { analyzeSceneSrt } from "../srt-scene-sync";
import { generateScriptSrt } from "../script-srt-generator";
import { alignSrtToWordTimings } from "../srt-word-alignment";

describe("DarkCut V2.4 integrated scene workflow",()=>{
 const cues=[
  {index:1,startSeconds:0,endSeconds:2,text:"Eu recusei financiar um carro zero."},
  {index:2,startSeconds:2,endSeconds:4,text:"Comprei um carro usado à vista."},
  {index:3,startSeconds:4,endSeconds:6,text:"E descobri por que valeu a pena."},
 ];
 test("preserves every SRT cue, even 390, without losing timings",()=>{
  const long=Array.from({length:390},(_,i)=>({index:i+1,startSeconds:i*3,endSeconds:(i+1)*3,text:`Cena ${i+1} com texto diferente.`}));
  const srt=serializeSrt(long);
  const parsed=analyzeSceneSrt(srt);
  expect(parsed.cues).toHaveLength(390);
  expect(parsed.durationSeconds).toBe(1170);
  expect(parsed.overlaps).toBe(0);
 });
 test("snaps only to neighboring pauses, not across actual silence gaps",()=>{
  const adjusted=snapSrtToPauses(cues,[{start:1.75,end:1.85},{start:4.1,end:4.22}]);
  expect(adjusted[0].endSeconds).toBeCloseTo(1.8);
  expect(adjusted[1].startSeconds).toBeCloseTo(1.8);
  const gap=[{index:1,startSeconds:0,endSeconds:2,text:"Um"},{index:2,startSeconds:3,endSeconds:5,text:"Dois"}];
  expect(snapSrtToPauses(gap,[{start:2.4,end:2.6}])).toEqual(gap);
 });
 test("keeps existing media and human-refined prompt only if scene speech is unchanged",()=>{
  const first=scenesFromSrt(cues);
  first[0].mediaId="asset-001";first[0].mediaName="carro.png";first[0].status="ready";first[0].prompt="Enquadramento artístico escolhido";
  const result=scenesFromSrt(cues,first);
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({mediaId:"asset-001",status:"ready",prompt:"Enquadramento artístico escolhido"});
  const modified=scenesFromSrt([{...cues[0],text:"Outra fala"}],first);
  expect(modified[0].mediaId).toBeUndefined();
  expect(modified[0].status).toBe("missing");
 });
 test("preserves custom start offset when aligning to Whisper words",()=>{
  const draft=generateScriptSrt("Você comprou o carro. Pagou à vista.",{maxWords:4,minWords:1,startSeconds:12,targetDurationSeconds:4});
  const words="Você comprou o carro Pagou à vista".split(" ").map((word,i)=>({word,start:i*0.5,end:i*0.5+0.3}));
  const aligned=alignSrtToWordTimings(draft,words,4);
  expect(aligned.mode).toBe("word-aligned");
  expect(aligned.srt).toContain("00:00:12,000");
 });
});