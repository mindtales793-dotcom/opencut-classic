import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];

/**
 * - "auto": FFmpeg with GPU encoding when the desktop runtime provides it,
 *   otherwise the in-browser encoder.
 * - "software": FFmpeg CPU encoder only, prioritizes stability and repeatable quality.\n * - "browser": always use the in-browser (WebCodecs) encoder.
 */
export const EXPORT_ENGINE_VALUES = ["auto", "software", "browser"] as const;
export type ExportEngine = (typeof EXPORT_ENGINE_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	/** Dimensions of the encoded file. Keeps the original project layout. */
	canvasSize?: { width: number; height: number };
	includeAudio?: boolean;
	engine?: ExportEngine;
	/** Used as the downloaded file name by the FFmpeg engine (no extension). */
	filename?: string;
}

export interface ExportResult {
	success: boolean;
	/** In-memory file. Only produced by the in-browser encoder. */
	buffer?: ArrayBuffer;
	/** Server-side file produced by FFmpeg. Download it instead of a buffer. */
	downloadUrl?: string;
	/** Human readable encoder that produced the file. */
	encoderLabel?: string;
	verified?: { format: ExportFormat; codec: string; width: number; height: number; fps: number; audioCodec: string | null; quality: ExportQuality };
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	// Keep the Blob URL alive until Chromium has started the download.
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Downloads a file that already lives on the local server, without loading it into memory. */
export function downloadFromUrl({
	url,
	filename,
}: {
	url: string;
	filename: string;
}): void {
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
}
