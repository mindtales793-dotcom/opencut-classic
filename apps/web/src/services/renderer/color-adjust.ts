import type { EffectPass } from "@/effects/types";

const clamp = (value: number, low: number, high: number) =>
	Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;

export function colorAdjustFilter({
	pass,
}: {
	pass: EffectPass;
}): { filter: string; tint: string; tintOpacity: number } {
	const number = (key: string, fallback: number) => {
		const value = pass.uniforms[key];
		return typeof value === "number" && Number.isFinite(value) ? value : fallback;
	};
	const brightness = clamp(1 + number("u_brightness", 0), 0.05, 2);
	const contrast = clamp(number("u_contrast", 1), 0, 2);
	const saturation = clamp(number("u_saturation", 1), 0, 2);
	const temperature = clamp(number("u_temperature", 0), -1, 1);
	return {
		filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`,
		tint: temperature >= 0 ? "#ffb56c" : "#79baff",
		tintOpacity: Math.abs(temperature) * 0.35,
	};
}

/**
 * The published opencut-wasm package only supports gaussian blur. Use the
 * native canvas 2D filter/compositor for color effects in the packaged editor
 * instead of submitting an unsupported shader to that WASM version.
 * The same OffscreenCanvas frames are used by preview and MP4 export.
 */
export function applyColorAdjustPass({
	source,
	width,
	height,
	pass,
}: {
	source: OffscreenCanvas;
	width: number;
	height: number;
	pass: EffectPass;
}): OffscreenCanvas {
	const output = new OffscreenCanvas(width, height);
	const ctx = output.getContext("2d");
	if (!ctx) return source;
	const style = colorAdjustFilter({ pass });
	ctx.filter = style.filter;
	ctx.drawImage(source, 0, 0, width, height);
	ctx.filter = "none";
	if (style.tintOpacity > 0) {
		ctx.save();
		ctx.globalCompositeOperation = "soft-light";
		ctx.globalAlpha = style.tintOpacity;
		ctx.fillStyle = style.tint;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();
	}
	return output;
}
