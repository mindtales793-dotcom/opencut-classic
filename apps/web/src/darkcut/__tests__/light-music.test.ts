import { describe, expect, test } from "bun:test";
import { generateLightMusic } from "../light-music";

describe("Trilha Leve WAV renderer", () => {
  test("writes a playable mono PCM WAV at 22.05 kHz", () => {
    const wav = generateLightMusic({ style: "documentary", duration: 15, seed: 1234 });
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const fourCC = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));
    expect(fourCC(0)).toBe("RIFF");
    expect(fourCC(8)).toBe("WAVE");
    expect(fourCC(12)).toBe("fmt ");
    expect(fourCC(36)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // uncompressed PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(15 * 22_050 * 2);
    expect(wav.byteLength).toBe(44 + 15 * 22_050 * 2);
    let peak = 0;
    for (let i = 44 + 22_050; i < wav.byteLength; i += 2) {
      peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
    }
    expect(peak).toBeGreaterThan(200);
    expect(peak).toBeLessThanOrEqual(32767);
  });

  test("presets and seeds change the composition while identical inputs stay reproducible", () => {
    const args = { style: "emotional" as const, duration: 15, seed: 22 };
    const a = generateLightMusic(args);
    const b = generateLightMusic(args);
    const otherStyle = generateLightMusic({ ...args, style: "suspense" });
    const otherSeed = generateLightMusic({ ...args, seed: 78 });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(otherStyle))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(otherSeed))).toBe(false);
  });

  test("rejects unknown styles and unreasonable duration", () => {
    expect(() => generateLightMusic({ style: "lofi", duration: 121, seed: 1 })).toThrow();
    expect(() => generateLightMusic({ style: "lofi", duration: 5, seed: 1 })).toThrow();
    expect(() => generateLightMusic({ style: "incorrect" as "lofi", duration: 30, seed: 1 })).toThrow();
  });
});
