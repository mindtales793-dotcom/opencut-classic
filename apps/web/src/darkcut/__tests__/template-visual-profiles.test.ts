import { describe, expect, test } from "bun:test";
import {
	TEMPLATE_VISUAL_PROFILES,
	describeTemplateScene,
	getTemplateVisualProfile,
} from "../template-visual-profiles";

describe("All DarkCut template families", () => {
	const ids=["retro-automotive","pov-finance","pov-car","dark-channel","documentary","pov","vox","cinematic","educational","list","storytelling","shorts-hook","tech-neon","news-brief","podcast-cuts","minimal-clean","meme-reaction","travel-vlog","real-estate"];
	test("every existing template has a full visual profile", () => {
		expect(Object.keys(TEMPLATE_VISUAL_PROFILES).sort()).toEqual([...ids].sort());
		for(const id of ids) {
			const profile=getTemplateVisualProfile(id);
			expect(profile.graphics.length).toBeGreaterThanOrEqual(4);
			expect(profile.accent).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
	test("templates have varied palettes and editorial choices", () => {
		expect(new Set(ids.map(id=>getTemplateVisualProfile(id).background)).size).toBe(ids.length);
		expect(getTemplateVisualProfile("list").tempo).toBe("fast");
		expect(getTemplateVisualProfile("cinematic").tempo).toBe("slow");
	});
	test("every category supports numbers, comparisons and editorial cards", () => {
		for(const id of ids) {
			const number=describeTemplateScene({profileId:id,visualSlot:"number",sceneType:"number",intensity:"normal"});
			const comparison=describeTemplateScene({profileId:id,visualSlot:"comparison",sceneType:"context",intensity:"normal"});
			expect(number.isNumber).toBe(true);
			expect(comparison.isComparison).toBe(true);
			expect(number.label).toBe("DADO EM DESTAQUE");
		}
	});
	test("soft and strong intensity affect typography", () => {
		const base={profileId:"pov-finance",visualSlot:"number" as const,sceneType:"number" as const};
		const soft=describeTemplateScene({...base,intensity:"soft"});
		const strong=describeTemplateScene({...base,intensity:"strong"});
		expect(strong.fontSize).toBeGreaterThan(soft.fontSize);
		expect(strong.paddingX).toBeGreaterThan(soft.paddingX);
	});
});
