import { describe, expect, test } from "bun:test";
import {
  CRIS_REFERENCE_STYLES,
  crisStylePromptLines,
  getCrisReferenceStyle,
} from "../reference-editing-styles";
import { TEMPLATE_VISUAL_PROFILES } from "../template-visual-profiles";

describe("CRIS original YouTube-informed editorial profiles", () => {
  test("every existing visual template has a distinct editorial guide", () => {
    expect(Object.keys(CRIS_REFERENCE_STYLES).sort()).toEqual(Object.keys(TEMPLATE_VISUAL_PROFILES).sort());
    expect(new Set(Object.values(CRIS_REFERENCE_STYLES).map((profile) => profile.label)).size).toBe(Object.keys(TEMPLATE_VISUAL_PROFILES).length);
  });
  test("each guide explains pacing, camera, graphics and restrained sound", () => {
    for (const id of Object.keys(TEMPLATE_VISUAL_PROFILES)) {
      const p = getCrisReferenceStyle(id);
      expect(p.pacing.length).toBeGreaterThan(20);
      expect(p.camera.length).toBeGreaterThan(20);
      expect(p.graphics.length).toBeGreaterThan(20);
      expect(p.sound.length).toBeGreaterThan(20);
      expect(p.rule.length).toBeGreaterThan(20);
      expect(crisStylePromptLines(id).join(" ")).toContain("timeline");
    }
  });
  test("confidence distinguishes visual viewing, transcript and metadata", () => {
    expect(getCrisReferenceStyle("pov").evidence).toBe("visual");
    expect(getCrisReferenceStyle("pov-finance").evidence).toBe("transcript");
    expect(getCrisReferenceStyle("dark-channel").evidence).toBe("metadata");
    expect(getCrisReferenceStyle("cinematic").evidence).toBe("metadata");
  });
  test("fallback remains an original documentary style", () => {
    expect(getCrisReferenceStyle("unknown-template").id).toBe("documentary");
  });
});
