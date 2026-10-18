import { describe, expect, test } from "bun:test";
import { splitNarrationIntoChunks, narrationProgress } from "../narration-chunks";

describe("Fish narration chunks", () => {
  test("empty text produces no request", () => {
    expect(splitNarrationIntoChunks("   \n")).toEqual([]);
  });
  test("long script splits, preserves each word and never exceeds max characters", () => {
    const script = Array.from({ length: 150 }, (_, i) => `Você escolheu o caminho ${i}. Agora vem a consequência.`).join(" ");
    const chunks = splitNarrationIntoChunks(script, 240);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toEqual(script.replace(/\s+/g, " "));
  });
  test("unpunctuated text and very long word remain bounded", () => {
    expect(splitNarrationIntoChunks("texto ".repeat(350), 120).every((s) => s.length <= 120)).toBe(true);
    const word = "x".repeat(310);
    expect(splitNarrationIntoChunks(word, 110).join("")).toBe(word);
  });
  test("progress is an actual fraction of finished chunks, never a timer estimate", () => {
    expect(narrationProgress(0, 12)).toBe(0);
    expect(narrationProgress(3, 12)).toBe(25);
    expect(narrationProgress(6, 12)).toBe(50);
    expect(narrationProgress(12, 12)).toBe(99);
    expect(narrationProgress(12, 12, true)).toBe(100);
  });
});
