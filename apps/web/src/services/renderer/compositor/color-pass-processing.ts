import type { EffectPass } from "@/effects/types";
import { applyColorAdjustPass } from "../color-adjust";
import type { FrameItemDescriptor, TextureUploadDescriptor } from "./types";

let frameSerial = 0;

/**
 * The published compositor WASM does not recognize color-adjust yet.
 * Rasterize those passes on each affected layer BEFORE GPU upload, and
 * reserve full-scene color passes for a final canvas filter after composition.
 * Blur and other supported WASM passes stay in the GPU pipeline.
 */
export function prepareColorAdjustedFrame({
	items,
	textures,
}: {
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}): EffectPass[] {
	const sceneColorPasses: EffectPass[] = [];
	frameSerial++;
	for (const item of items) {
		const colorPasses: EffectPass[] = [];
		item.effectPassGroups = item.effectPassGroups
			.map((group) => group.filter((pass) => {
				if (pass.shader !== "color-adjust") return true;
				colorPasses.push(pass);
				return false;
			}))
			.filter((group) => group.length > 0);
		if (colorPasses.length === 0) continue;
		if (item.type === "sceneEffect") {
			sceneColorPasses.push(...colorPasses);
			continue;
		}
		const texture = textures.get(item.textureId);
		if (!texture) continue;
		const { width, height } = texture;
		const originalDraw = texture.kind === "rendered"
			? texture.draw
			: (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => {
				ctx.drawImage(texture.source, 0, 0, width, height);
			};
		const baseHash = texture.kind === "rendered" ? texture.contentHash : `external-frame-${frameSerial}`;
		textures.set(item.textureId, {
			kind: "rendered",
			id: texture.id,
			width,
			height,
			contentHash: `${baseHash}:color:${JSON.stringify(colorPasses)}`,
			draw: (ctx) => {
				const backing = new OffscreenCanvas(width, height);
				const sourceCtx = backing.getContext("2d");
				if (!sourceCtx) return;
				originalDraw(sourceCtx);
				let result = backing;
				for (const pass of colorPasses) {
					result = applyColorAdjustPass({ source: result, width, height, pass });
				}
				ctx.drawImage(result, 0, 0, width, height);
			},
		});
	}
	return sceneColorPasses;
}
