import { describe, expect, test } from "bun:test";
import { ANIMATED_STICKER_PRESETS, animatedStickerProvider, buildAnimatedStickerAnimations, parseAnimatedStickerId } from "../providers/animated";

describe("animated sticker presets", () => {
	test("all eight stickers have distinct export-ready keyframes", () => {
		expect(ANIMATED_STICKER_PRESETS).toHaveLength(8);
		for (const preset of ANIMATED_STICKER_PRESETS) {
			const channels = buildAnimatedStickerAnimations({ preset });
			expect(Object.keys(channels).length).toBeGreaterThan(0);
			for (const channel of Object.values(channels)) {
				if (!channel || !("keys" in channel)) continue;
				expect(channel.keys.length).toBeGreaterThan(1);
				expect(channel.keys[0].time).toBe(0);
				expect(channel.keys.at(-1)?.time).toBeGreaterThan(0);
			}
			expect(parseAnimatedStickerId({ stickerId: `animated:${preset.id}` })?.name).toBe(preset.name);
		}
		expect(parseAnimatedStickerId({ stickerId: "animated:unknown" })).toBeNull();
		expect(parseAnimatedStickerId({ stickerId: "flags:BR" })).toBeNull();
	});

	test("provider supports category search and browse", async () => {
		const result = await animatedStickerProvider.search({ query: "estrela" });
		expect(result.items.length).toBeGreaterThanOrEqual(2);
		expect(result.items.every((item) => item.provider === "animated")).toBe(true);
		const browse = await animatedStickerProvider.browse({ options: { limit: 8 } });
		expect(browse.sections[0].items).toHaveLength(8);
	});
});
