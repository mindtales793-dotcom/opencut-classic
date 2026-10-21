import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "../concurrency";

describe("bounded ordered project media loading", () => {
  test("keeps original media order while multiple reads overlap", async () => {
    let active = 0;
    let observedMax = 0;
    const result = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (value) => {
      active++;
      observedMax = Math.max(observedMax, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, (6 - value) * 2));
        return `asset-${value}`;
      } finally {
        active--;
      }
    });
    expect(observedMax).toBeGreaterThan(1);
    expect(observedMax).toBeLessThanOrEqual(3);
    expect(result).toEqual(["asset-0", "asset-1", "asset-2", "asset-3", "asset-4", "asset-5"]);
  });

  test("empty input does not invoke a worker", async () => {
    let called = false;
    const result = await mapWithConcurrency([], 3, async (_item: number) => {
      called = true;
      return 1;
    });
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  test("nonpositive concurrency falls back to serial reads", async () => {
    let active = 0;
    let max = 0;
    const result = await mapWithConcurrency([1, 2, 3], 0, async (item) => {
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      active--;
      return item * 2;
    });
    expect(max).toBe(1);
    expect(result).toEqual([2, 4, 6]);
  });

  test("retains missing assets for the caller to filter without shifting matches", async () => {
    const result = await mapWithConcurrency(["a", "missing", "b"], 2, async (id) =>
      id === "missing" ? null : { id },
    );
    expect(result.filter((item) => item !== null)).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
