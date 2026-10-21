import { describe, expect, test } from "bun:test";
import { mergeDarkMinerVideos, normalizeLegacyVideo } from "../darkminer-legacy-adapter";
describe("DarkMiner 3.6.1 desktop + Chrome integration", () => {
  test("reads real Python DB snake_case and preserves measured outlier multiplier", () => {
    expect(normalizeLegacyVideo({
      video_id:"dQw4w9WgXcQ",title:"Uma escolha inesperada",
      channel_title:"Canal de exemplo",published_at:"2026-10-18T16:00:00Z",
      views:24000,subscribers:3000,outlier_score:88,
      outlier_multiplier:6.5,vph:120,language:"pt",
    },"outliers")).toMatchObject({
      videoId:"dQw4w9WgXcQ",channel:"Canal de exemplo",
      outlier:6.5,views:24000,source:"desktop",
    });
  });
  test("does not mislabel legacy opportunity score as an outlier multiplier",()=>{
    const v=normalizeLegacyVideo({video_id:"sBws8MSXN7A",title:"Teste",views:200,outlier_score:81},"favorites");
    expect(v?.outlier).toBeNull();
  });
  test("ignores legacy rows without valid YouTube ID",()=>{
    expect(normalizeLegacyVideo({video_id:"../../secret",title:"invalid"},"monitor")).toBeNull();
  });
  test("preserves richer desktop evidence when extension only has a title",()=>{
    const extension=normalizeLegacyVideo({video_id:"dQw4w9WgXcQ",title:"Primeiro",views:500},"favorites")!;
    const desktop=normalizeLegacyVideo({video_id:"dQw4w9WgXcQ",title:"Segundo",views:500,subscribers:300,outlier_multiplier:8},"outliers")!;
    const result=mergeDarkMinerVideos([extension],[desktop]);
    expect(result).toHaveLength(1);
    expect(result[0].outlier).toBe(8);
    expect(result[0].subscribers).toBe(300);
  });
});