import { describe, expect, test } from "bun:test";
import {
  buildCrisSoundTimeline,
  guessCrisSoundCue,
  isCrisAutoSoundLicense,
  normalizeCrisSoundCue,
} from "../cris-sound-design";

describe("CRIS sound design", () => {
  test("uses narrative actions but keeps explanatory scenes quiet", () => {
    expect(guessCrisSoundCue("Você deu a partida no carro.", "context", 1).preset).toBe("car-engine");
    expect(guessCrisSoundCue("As parcelas apertaram o orçamento.", "problem", 3).preset).toBe("none");
    expect(guessCrisSoundCue("O começo de tudo", "hook", 0).preset).toBe("cinematic-impact");
  });
  test("rejects unsupported presets and placements from AI", () => {
    const fallback = { preset: "none" as const, placement: "start" as const };
    expect(normalizeCrisSoundCue({ preset: "unsafe-url", placement: "middle" }, fallback).preset).toBe("none");
    expect(normalizeCrisSoundCue({ preset: "car-door", placement: "somewhere" }, fallback).placement).toBe("start");
  });
  test("places short effects inside real timeline scene limits", () => {
    const cues = buildCrisSoundTimeline({
      scenes: [
        { sound: { preset: "car-door", placement: "end" } },
        { sound: { preset: "none", placement: "start" } },
      ],
      timings: [
        { startSeconds: 10, durationSeconds: 3 },
        { startSeconds: 13, durationSeconds: 3 },
      ],
    });
    expect(cues).toHaveLength(1);
    expect(cues[0].startSeconds).toBeCloseTo(12.1);
    expect(cues[0].startSeconds + cues[0].maxDurationSeconds).toBeLessThan(13);
    expect(cues[0].volumeDb).toBeLessThan(0);
  });
  test("only CC0 is allowed for unreviewed automatic placement", () => {
    expect(isCrisAutoSoundLicense("http://creativecommons.org/publicdomain/zero/1.0/")).toBe(true);
    expect(isCrisAutoSoundLicense("CC0")).toBe(true);
    expect(isCrisAutoSoundLicense("https://creativecommons.org/licenses/by/4.0/")).toBe(false);
  });
});
