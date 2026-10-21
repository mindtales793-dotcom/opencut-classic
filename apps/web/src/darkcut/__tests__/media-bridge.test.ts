import { describe, expect, test } from "bun:test";
import { sceneNumberFromMediaFilename, isSupportedBridgeMedia } from "../media-bridge";

describe("DarkCut local media bridge scene matching", () => {
  test("reads scene indexes from numbered file names", () => {
    expect(sceneNumberFromMediaFilename("cena-025.png")).toBe(25);
    expect(sceneNumberFromMediaFilename("scene_001 - resultado.jpg")).toBe(1);
    expect(sceneNumberFromMediaFilename("prompt.0390.webp")).toBe(390);
    expect(sceneNumberFromMediaFilename("0007.png")).toBe(7);
    expect(sceneNumberFromMediaFilename("CENA 12.mp4")).toBe(12);
  });
  test("never guesses scene from ambiguous file", () => {
    expect(sceneNumberFromMediaFilename("image.png")).toBeNull();
    expect(sceneNumberFromMediaFilename("scene-0.png")).toBeNull();
    expect(sceneNumberFromMediaFilename("scene-10001.png")).toBeNull();
  });
  test("accepts only local image and video formats", () => {
    expect(isSupportedBridgeMedia("scene-01.png")).toBe(true);
    expect(isSupportedBridgeMedia("scene-02.mp4")).toBe(true);
    expect(isSupportedBridgeMedia("script.html")).toBe(false);
    expect(isSupportedBridgeMedia("readme.exe")).toBe(false);
  });
});
