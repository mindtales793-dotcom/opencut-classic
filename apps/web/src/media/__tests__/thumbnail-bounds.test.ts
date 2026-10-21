import { describe, expect, test } from "bun:test";
import { thumbnailSize } from "../thumbnail";

describe("DARKCUT memory-friendly thumbnail bounds", () => {
  test("downsizes Full HD previews without touching original dimensions", () => {
    expect(thumbnailSize({ width: 1920, height: 1080 })).toEqual({ width: 480, height: 270 });
    expect(thumbnailSize({ width: 3840, height: 2160 })).toEqual({ width: 480, height: 270 });
  });

  test("keeps portrait previews inside the same pixel budget", () => {
    expect(thumbnailSize({ width: 1080, height: 1920 })).toEqual({ width: 152, height: 270 });
  });

  test("does not enlarge small source images", () => {
    expect(thumbnailSize({ width: 320, height: 180 })).toEqual({ width: 320, height: 180 });
  });

  test("preserves aspect ratio within rounding tolerance", () => {
    for (const [width, height] of [[1920, 800], [1920, 1080], [720, 1280], [640, 480]]) {
      const preview = thumbnailSize({ width, height });
      expect(preview.width).toBeLessThanOrEqual(480);
      expect(preview.height).toBeLessThanOrEqual(270);
      expect(Math.abs(preview.width / preview.height - width / height)).toBeLessThan(0.02);
    }
  });
});
