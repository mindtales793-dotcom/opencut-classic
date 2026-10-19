import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname, basename } from "node:path";
import type { ExportFormat, ExportQuality } from "../index";
import { resolveFfmpegPath } from "./probe.server";

const run = promisify(execFile);

export type VerifiedExport = {
	format: ExportFormat;
	codec: "h264" | "vp9";
	width: number;
	height: number;
	fps: number;
	audioCodec: "aac" | "opus" | null;
	quality: ExportQuality;
};

type Stream = {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
};

export function checkExportStreams({
	streams,
	expected,
}: {
	streams: readonly Stream[];
	expected: {
		format: ExportFormat;
		width: number;
		height: number;
		fpsNumerator: number;
		fpsDenominator: number;
		quality: ExportQuality;
		withAudio: boolean;
	};
}): VerifiedExport {
	const video = streams.find(s => s.codec_type === "video");
	const audio = streams.find(s => s.codec_type === "audio");
	const codec = expected.format === "mp4" ? "h264" : "vp9";
	const audioCodec = expected.format === "mp4" ? "aac" : "opus";
	if (!video || video.codec_name !== codec) {
		throw new Error(`Codec incorreto: foi pedido ${codec.toUpperCase()}, mas FFprobe identificou ${video?.codec_name || "nenhum vídeo"}.`);
	}
	// YUV420 requires even dimensions; FFmpeg pads at most one pixel to protect the content.
	const width = expected.width + expected.width % 2;
	const height = expected.height + expected.height % 2;
	if (video.width !== width || video.height !== height) {
		throw new Error(`Resolução incorreta: esperado ${width}x${height}, mas arquivo contém ${video.width}x${video.height}.`);
	}
	const parts = (video.r_frame_rate || "").split("/").map(Number);
	const fps = parts.length === 2 && parts[1] > 0 ? parts[0] / parts[1] : NaN;
	const requestedFps = expected.fpsNumerator / expected.fpsDenominator;
	if (!Number.isFinite(fps) || Math.abs(fps - requestedFps) > 0.02) {
		throw new Error(`FPS incorreto: esperado ${requestedFps.toFixed(3)}, mas arquivo contém ${Number.isFinite(fps) ? fps.toFixed(3) : "indefinido"}.`);
	}
	if (expected.withAudio && audio?.codec_name !== audioCodec) {
		throw new Error(`Áudio incorreto: esperado ${audioCodec}, mas arquivo contém ${audio?.codec_name ?? "nenhum áudio"}.`);
	}
	if (!expected.withAudio && audio) throw new Error("O arquivo contém áudio apesar de a opção estar desmarcada.");
	return {
		format: expected.format,
		codec,
		width,
		height,
		fps,
		audioCodec: audio ? audioCodec : null,
		quality: expected.quality,
	};
}

export async function verifyExportFile({
	filePath,
	expected,
}: {
	filePath: string;
	expected: Parameters<typeof checkExportStreams>[0]["expected"];
}): Promise<VerifiedExport> {
	const ffmpeg = resolveFfmpegPath();
	const ffprobe = basename(ffmpeg).toLowerCase().startsWith("ffmpeg")
		? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
		: "ffprobe";
	let stdout: string;
	try {
		const result = await run(ffprobe, [
			"-v", "error", "-show_entries",
			"stream=codec_type,codec_name,width,height,r_frame_rate",
			"-of", "json", filePath,
		], { windowsHide: true, timeout: 20_000, maxBuffer: 1_000_000 });
		stdout = result.stdout;
	} catch {
		throw new Error("Não foi possível verificar o arquivo exportado com FFprobe. Verifique as ferramentas de vídeo do DarkCut.");
	}
	let parsed: { streams?: Stream[] };
	try { parsed = JSON.parse(stdout); }
	catch { throw new Error("FFprobe retornou informações de vídeo inválidas."); }
	return checkExportStreams({ streams: parsed.streams ?? [], expected });
}
