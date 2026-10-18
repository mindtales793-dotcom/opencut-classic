import { describe, expect, test } from "bun:test";
import { NICHE_MARKETS, sanitizeMinerVideo, rankMinerOpportunities, buildNicheSkillPrompt, localTitleAngles } from "../niche-miner";
describe("DarkMiner evidence-aware niche skill",()=>{
 test("rejects untrusted or malformed videos",()=>{
  expect(sanitizeMinerVideo({video_id:"../secret",title:"oops"})).toBeNull();
  expect(sanitizeMinerVideo({video_id:"dQw4w9WgXcQ",title:"Um teste",views:1000,subscribers:100})).toMatchObject({videoId:"dQw4w9WgXcQ",views:1000});
 });
 test("ranks videos by observations, not claimed viral guarantees",()=>{
  const now=Date.parse("2026-10-18");
  const low=sanitizeMinerVideo({video_id:"dQw4w9WgXcQ",title:"Baixo",views:100,subscribers:10000});
  const high=sanitizeMinerVideo({video_id:"sBws8MSXN7A",title:"Alto",views:50000,subscribers:1000,outlier_ratio:12,vph:400});
  const result=rankMinerOpportunities([low!,high!],now);
  expect(result[0].video.title).toBe("Alto");
  expect(result[0].score).toBeGreaterThan(result[1].score);
  expect(result[1].cautions.length).toBeGreaterThan(0);
 });
 test("supports ten markets, hypotheses and original examples",()=>{
  expect(NICHE_MARKETS.length).toBeGreaterThanOrEqual(10);
  const p=buildNicheSkillPrompt({title:"POV: Como",subject:"carro usado",format:"POV",market:NICHE_MARKETS[1],candidates:[]});
  expect(p).toContain("não");
  expect(p).toContain("México");
  expect(p).toContain("Evidências reais");
  expect(localTitleAngles("carro usado",NICHE_MARKETS[0]).length).toBe(5);
 });
});