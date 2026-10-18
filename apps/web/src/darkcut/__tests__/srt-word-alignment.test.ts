import { describe, expect, test } from "bun:test";
import { generateScriptSrt } from "../script-srt-generator";
import { alignSrtToWordTimings } from "../srt-word-alignment";
describe("Native Whisper alignment",()=>{
 test("aligns original SRT scenes to grounded word offsets",()=>{
  const source="Você recusou o financiamento. Comprou um carro à vista.";
  const base=generateScriptSrt(source,{maxWords:5,minWords:1,targetDurationSeconds:8});
  const words=source.replace(/[.!]/g,"").split(" ").map((word,i)=>({word,start:i*0.7,end:i*0.7+0.5}));
  const result=alignSrtToWordTimings(base,words,8);
  expect(result.cueCount).toBe(base.cues.length);
  expect(result.mode).toBe("word-aligned");
  expect(result.coverage).toBeGreaterThan(0.9);
  expect(result.srt).toContain("00:00:08,000");
 });
 test("low coverage reverts to estimated timing, preserving original subtitles",()=>{
  const base=generateScriptSrt("Agora a decisão mudou completamente.",{maxWords:8});
  const a=alignSrtToWordTimings(base,[{word:"desconhecido",start:0,end:0.3}],3);
  expect(a.mode).toBe("estimated");
  expect(a.srt).toBe(base.srt);
 });
});
