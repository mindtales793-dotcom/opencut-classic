import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import {
	getTextVisualRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { mediaTimeFromSeconds } from "@/wasm";
import type { CreateTextElement } from "@/timeline";
import type { TextBackground } from "@/text/background";
import type {
	TextAlign,
	TextDecoration,
	TextFontStyle,
	TextFontWeight,
} from "@/text/primitives";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";
import { estimateKaraokeWords, type CaptionAnimationMode } from "./karaoke";

const SUBTITLE_MAX_WIDTH_RATIO = 0.8;
const SUBTITLE_BOTTOM_MARGIN_RATIO = 0.05;
const SUBTITLE_FONT_SIZE = 5;
const MEASUREMENT_CANVAS_SIZE = 4096;

function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

function createMeasurementContext(): CanvasRenderingContext2D | null {
	const canvas = document.createElement("canvas");
	canvas.width = MEASUREMENT_CANVAS_SIZE;
	canvas.height = MEASUREMENT_CANVAS_SIZE;
	return canvas.getContext("2d");
}

function measureLineWidth({
	ctx,
	text,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
}): number {
	return ctx.measureText(text).width;
}

function wrapSubtitleText({
	ctx,
	text,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	maxWidth: number;
}): string {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	const paragraphs = normalized.split("\n");
	const wrappedParagraphs: string[] = [];

	for (const paragraph of paragraphs) {
		const trimmedParagraph = paragraph.trim();
		if (!trimmedParagraph) {
			wrappedParagraphs.push("");
			continue;
		}

		const words = trimmedParagraph.split(/\s+/);
		let currentLine = words[0] ?? "";
		const lines: string[] = [];

		for (let i = 1; i < words.length; i++) {
			const nextLine = `${currentLine} ${words[i]}`;
			if (measureLineWidth({ ctx, text: nextLine }) <= maxWidth) {
				currentLine = nextLine;
				continue;
			}

			lines.push(currentLine);
			currentLine = words[i];
		}

		lines.push(currentLine);
		wrappedParagraphs.push(lines.join("\n"));
	}

	return wrappedParagraphs.join("\n");
}

function measureWrappedTextBlock({
	ctx,
	content,
	canvasHeight,
	textAlign,
	background,
	fontSize,
	lineHeight,
}: {
	ctx: CanvasRenderingContext2D;
	content: string;
	canvasHeight: number;
	textAlign: TextAlign;
	background: TextBackground;
	fontSize: number;
	lineHeight: number;
}) {
	const scaledFontSize = fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const lineHeightPx = lineHeight * scaledFontSize;
	const lines = content.split("\n");
	const lineMetrics = lines.map((line) => ctx.measureText(line));

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx,
	});
	const visualRect = getTextVisualRect({
		textAlign,
		block,
		background,
		fontSizeRatio: fontSize / 15,
	});

	return {
		block,
		visualRect,
	};
}

function resolveSubtitleStyle({
	style,
}: {
	style: SubtitleStyleOverrides | undefined;
}): {
	fontFamily: string;
	fontSize: number;
	color: string;
	textAlign: TextAlign;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textDecoration: TextDecoration;
	letterSpacing: number;
	lineHeight: number;
	background: TextBackground;
	placement: NonNullable<SubtitleStyleOverrides["placement"]>;
} {
	const fontSize =
		style?.fontSizeRatioOfPlayHeight != null
			? style.fontSizeRatioOfPlayHeight * FONT_SIZE_SCALE_REFERENCE
			: (style?.fontSize ?? SUBTITLE_FONT_SIZE);

	return {
		fontFamily: style?.fontFamily ?? "Arial",
		fontSize,
		color: style?.color ?? "#ffffff",
		textAlign: style?.textAlign ?? "center",
		fontWeight: style?.fontWeight ?? "bold",
		fontStyle: style?.fontStyle ?? "normal",
		textDecoration: style?.textDecoration ?? "none",
		letterSpacing: style?.letterSpacing ?? DEFAULTS.text.letterSpacing,
		lineHeight: style?.lineHeight ?? DEFAULTS.text.lineHeight,
		background: {
			...DEFAULTS.text.background,
			enabled: false,
			...(style?.background ?? {}),
		},
		placement: {
			verticalAlign: style?.placement?.verticalAlign ?? "bottom",
			marginLeftRatio: style?.placement?.marginLeftRatio,
			marginRightRatio: style?.placement?.marginRightRatio,
			marginVerticalRatio: style?.placement?.marginVerticalRatio,
		},
	};
}

function resolveTargetWidth({
	canvasWidth,
	placement,
}: {
	canvasWidth: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
}): number {
	const leftRatio = placement.marginLeftRatio ?? 0;
	const rightRatio = placement.marginRightRatio ?? 0;
	const hasExplicitMargins = leftRatio > 0 || rightRatio > 0;
	if (!hasExplicitMargins) {
		return canvasWidth * SUBTITLE_MAX_WIDTH_RATIO;
	}

	const availableWidth = canvasWidth * (1 - leftRatio - rightRatio);
	return Math.max(0, availableWidth);
}

function resolvePositionX({
	canvasWidth,
	textAlign,
	placement,
	visualRect,
}: {
	canvasWidth: number;
	textAlign: TextAlign;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { left: number; width: number };
}): number {
	const leftMargin = canvasWidth * (placement.marginLeftRatio ?? 0);
	const rightMargin = canvasWidth * (placement.marginRightRatio ?? 0);
	const canvasCenterX = canvasWidth / 2;

	if (textAlign === "left") {
		return leftMargin - visualRect.left - canvasCenterX;
	}

	if (textAlign === "right") {
		return (
			canvasWidth -
			rightMargin -
			(visualRect.left + visualRect.width) -
			canvasCenterX
		);
	}

	const availableWidth = canvasWidth - leftMargin - rightMargin;
	const targetCenterX = leftMargin + availableWidth / 2;
	return (
		targetCenterX - (visualRect.left + visualRect.width / 2) - canvasCenterX
	);
}

function resolvePositionY({
	canvasHeight,
	placement,
	visualRect,
}: {
	canvasHeight: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { top: number; height: number };
}): number {
	const margin =
		canvasHeight *
		(placement.marginVerticalRatio ?? SUBTITLE_BOTTOM_MARGIN_RATIO);
	const canvasCenterY = canvasHeight / 2;

	if (placement.verticalAlign === "top") {
		return margin - visualRect.top - canvasCenterY;
	}

	if (placement.verticalAlign === "middle") {
		const targetCenterY = canvasHeight / 2;
		return (
			targetCenterY - (visualRect.top + visualRect.height / 2) - canvasCenterY
		);
	}

	return (
		canvasHeight - margin - (visualRect.top + visualRect.height) - canvasCenterY
	);
}

export function buildSubtitleTextElement({
	index,
	caption,
	canvasSize,
}: {
	index: number;
	caption: SubtitleCue;
	canvasSize: { width: number; height: number };
}): CreateTextElement {
	const ctx = createMeasurementContext();
	const style = resolveSubtitleStyle({
		style: caption.style,
	});
	const fontFamily = quoteFontFamily({
		fontFamily: style.fontFamily,
	});
	const fontWeight = style.fontWeight;
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	const scaledFontSize =
		style.fontSize * (canvasSize.height / FONT_SIZE_SCALE_REFERENCE);
	const fontString = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
	const maxWidth = resolveTargetWidth({
		canvasWidth: canvasSize.width,
		placement: style.placement,
	});

	let content = caption.text;
	let positionX = 0;
	let positionY = 0;

	if (ctx) {
		ctx.font = fontString;
		setCanvasLetterSpacing({ ctx, letterSpacingPx: style.letterSpacing });
		content = wrapSubtitleText({
			ctx,
			text: caption.text,
			maxWidth,
		});
		const measurement = measureWrappedTextBlock({
			ctx,
			content,
			canvasHeight: canvasSize.height,
			textAlign: style.textAlign,
			background: style.background,
			fontSize: style.fontSize,
			lineHeight: style.lineHeight,
		});
		positionX = resolvePositionX({
			canvasWidth: canvasSize.width,
			textAlign: style.textAlign,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
		positionY = resolvePositionY({
			canvasHeight: canvasSize.height,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
	}

	return {
		...DEFAULTS.text.element,
		name: `Caption ${index + 1}`,
		duration: mediaTimeFromSeconds({ seconds: caption.duration }),
		startTime: mediaTimeFromSeconds({ seconds: caption.startTime }),
		params: {
			...DEFAULTS.text.element.params,
			content,
			fontSize: style.fontSize,
			fontFamily: style.fontFamily,
			color: style.color,
			textAlign: style.textAlign,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
			textDecoration: style.textDecoration,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
			"background.enabled": style.background.enabled,
			"background.color": style.background.color,
			"background.cornerRadius":
				style.background.cornerRadius ?? DEFAULTS.text.background.cornerRadius,
			"background.paddingX":
				style.background.paddingX ?? DEFAULTS.text.background.paddingX,
			"background.paddingY":
				style.background.paddingY ?? DEFAULTS.text.background.paddingY,
			"background.offsetX":
				style.background.offsetX ?? DEFAULTS.text.background.offsetX,
			"background.offsetY":
				style.background.offsetY ?? DEFAULTS.text.background.offsetY,
			"transform.positionX": positionX,
			"transform.positionY": positionY,
		},
	};
}

/**
 * Builds a highlight layer over the fully visible subtitle. Each word uses
 * the same font metrics and line layout as the underlying text element.
 * This makes karaoke visible in canvas preview AND the MP4 frame renderer.
 */
export function buildKaraokeHighlightElements({
	index,
	caption,
	canvasSize,
	animation,
	highlightColor,
}: {
	index: number;
	caption: SubtitleCue;
	canvasSize: { width: number; height: number };
	animation: Exclude<CaptionAnimationMode, "none">;
	highlightColor: string;
}): CreateTextElement[] {
	const base = buildSubtitleTextElement({ index, caption, canvasSize });
	const content = String(base.params.content ?? "");
	const words = estimateKaraokeWords({ caption });
	const ctx = createMeasurementContext();
	if (!ctx || words.length === 0) return [];
	const fontSize = Number(base.params.fontSize ?? SUBTITLE_FONT_SIZE);
	const fontFamily = String(base.params.fontFamily ?? "Arial");
	const fontWeight = String(base.params.fontWeight ?? "bold");
	const fontStyle = String(base.params.fontStyle ?? "normal");
	const textAlign = String(base.params.textAlign ?? "center");
	const letterSpacing = Number(base.params.letterSpacing ?? 0);
	const lineHeight = Number(base.params.lineHeight ?? DEFAULTS.text.lineHeight);
	const scaledFontSize = fontSize * (canvasSize.height / FONT_SIZE_SCALE_REFERENCE);
	ctx.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: letterSpacing });
	const lines = content.split("\n");
	const lineHeightPx = scaledFontSize * lineHeight;
	const x = Number(base.params["transform.positionX"] ?? 0);
	const y = Number(base.params["transform.positionY"] ?? 0);
	const highlights: CreateTextElement[] = [];
	let wordIndex = 0;
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const width = ctx.measureText(line).width;
		const lineX = textAlign === "left" ? 0 : textAlign === "right" ? -width : -width / 2;
		for (const match of line.matchAll(/\S+/gu)) {
			const timing = words[wordIndex];
			if (!timing) break;
			const prefix = line.slice(0, match.index);
			const localX = lineX + ctx.measureText(prefix).width;
			const localY = (lineIndex - (lines.length - 1) / 2) * lineHeightPx;
			const duration = Math.max(0.001, timing.duration);
			const popEnd = Math.min(0.18, duration / 2);
			const popStart = Math.min(0.08, popEnd / 2);
			const scaleKeys = (property: string) => ({
				keys: [
					{ id: `karaoke-${index}-${wordIndex}-${property}-start`, time: mediaTimeFromSeconds({ seconds: 0 }), value: 0.82, segmentToNext: "linear" as const, tangentMode: "auto" as const },
					{ id: `karaoke-${index}-${wordIndex}-${property}-peak`, time: mediaTimeFromSeconds({ seconds: popStart }), value: 1.12, segmentToNext: "linear" as const, tangentMode: "auto" as const },
					{ id: `karaoke-${index}-${wordIndex}-${property}-end`, time: mediaTimeFromSeconds({ seconds: popEnd }), value: 1, segmentToNext: "linear" as const, tangentMode: "auto" as const },
				],
			});
			highlights.push({
				...base,
				name: `Karaokê ${index + 1} · palavra ${wordIndex + 1}`,
				startTime: mediaTimeFromSeconds({ seconds: timing.startTime }),
				duration: mediaTimeFromSeconds({ seconds: duration }),
				params: {
					...base.params,
					content: match[0],
					color: highlightColor,
					textAlign: "left",
					"background.enabled": false,
					"transform.positionX": x + localX,
					"transform.positionY": y + localY,
				},
				...(animation === "karaoke-pop" ? {
					animations: {
						"transform.scaleX": scaleKeys("scaleX"),
						"transform.scaleY": scaleKeys("scaleY"),
					},
				} : {}),
			});
			wordIndex++;
		}
	}
	return highlights;
}
