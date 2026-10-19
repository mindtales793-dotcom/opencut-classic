import { describe, expect, test } from "bun:test";
import { COLOR_GRADE_EFFECTS } from "../definitions/color-grade";
describe("color grading", () => { test("has five presets", () => expect(COLOR_GRADE_EFFECTS).toHaveLength(5)); });
