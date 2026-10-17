import type { ExportFormat, ExportQuality } from "../index";

/**
 * Encoder profiles for the FFmpeg export engine.
 *
 * Pure data + argument building: nothing in this file touches Node or the DOM,
 * so it can be unit tested and shared between the API routes and the client.
 *
 * Profiles are ordered by preference. The server probes them with a real
 * test encode and picks the first one that works on the current machine
 * (Intel Quick Sync, NVIDIA NVENC, AMD AMF) before falling back to software.
 */

export type FfmpegProfileId =
	| "h264_qsv_gpu"
	| "h264_qsv"
	| "h264_nvenc"
	| "h264_amf"
	| "libx264"
	| "vp9_qsv_gpu"
	| "libvpx_vp9";

export type RawPixelFormat = "rgba" | "bgra" | "rgb0" | "bgr0";

export type FfmpegContainer = ExportFormat | "null";

export interface FfmpegProfile {
	id: FfmpegProfileId;
	label: string;
	format: ExportFormat;
	hardware: boolean;
	/** Arguments placed before the inputs (hardware device setup). */
	initArgs: string[];
	/** Filter chain that turns the raw input frames into the encoder's input. */
	filter: (inputPixelFormat: RawPixelFormat) => string;
	/** Encoder-specific arguments. */
	codecArgs: (params: CodecParams) => string[];
}

export interface CodecParams {
	width: number;
	height: number;
	fpsNumerator: number;
	fpsDenominator: number;
	quality: ExportQuality;
}

const BITS_PER_PIXEL: Record<ExportQuality, number> = {
	low: 0.05,
	medium: 0.08,
	high: 0.12,
	very_high: 0.2,
};

const X264_CRF: Record<ExportQuality, number> = {
	low: 28,
	medium: 24,
	high: 20,
	very_high: 17,
};

const NVENC_CQ: Record<ExportQuality, number> = {
	low: 30,
	medium: 26,
	high: 22,
	very_high: 18,
};

export function targetBitrate({
	width,
	height,
	fpsNumerator,
	fpsDenominator,
	quality,
}: CodecParams): number {
	const fps = fpsNumerator / fpsDenominator;
	return Math.max(
		500_000,
		Math.round(width * height * fps * BITS_PER_PIXEL[quality]),
	);
}

function bitrateArgs(params: CodecParams): string[] {
	const bitrate = targetBitrate(params);
	return [
		"-b:v",
		String(bitrate),
		"-maxrate",
		String(Math.round(bitrate * 1.5)),
		"-bufsize",
		String(bitrate * 2),
	];
}

/** Keeps even dimensions (required by every YUV 4:2:0 encoder). */
function evenCropFilter({
	width,
	height,
}: Pick<CodecParams, "width" | "height">): string | null {
	if (width % 2 === 0 && height % 2 === 0) return null;
	return "crop=trunc(iw/2)*2:trunc(ih/2)*2";
}

function chain(...parts: Array<string | null>): string {
	return parts.filter((part): part is string => !!part).join(",");
}

const QSV_DEVICE_ARGS = [
	"-init_hw_device",
	"qsv=hw",
	"-filter_hw_device",
	"hw",
];

export const FFMPEG_PROFILES: FfmpegProfile[] = [
	// Intel Quick Sync with the colour conversion done on the GPU too
	// (hwupload + vpp_qsv): the CPU only pipes raw frames.
	{
		id: "h264_qsv_gpu",
		label: "Intel Quick Sync (GPU completa)",
		format: "mp4",
		hardware: true,
		initArgs: QSV_DEVICE_ARGS,
		filter: () =>
			chain(
				"format=bgra",
				"hwupload=extra_hw_frames=32",
				"vpp_qsv=format=nv12",
			),
		codecArgs: (params) => [
			"-c:v",
			"h264_qsv",
			"-preset",
			"medium",
			"-profile:v",
			"high",
			...bitrateArgs(params),
		],
	},
	// Same encoder, but if the GPU filter chain is not supported by the
	// driver the conversion falls back to the CPU and only the encode is GPU.
	{
		id: "h264_qsv",
		label: "Intel Quick Sync",
		format: "mp4",
		hardware: true,
		initArgs: [],
		filter: () => "format=nv12",
		codecArgs: (params) => [
			"-c:v",
			"h264_qsv",
			"-preset",
			"medium",
			"-profile:v",
			"high",
			...bitrateArgs(params),
		],
	},
	{
		id: "h264_nvenc",
		label: "NVIDIA NVENC",
		format: "mp4",
		hardware: true,
		initArgs: [],
		filter: () => "format=nv12",
		codecArgs: ({ quality }) => [
			"-c:v",
			"h264_nvenc",
			"-preset",
			"p4",
			"-rc",
			"vbr",
			"-cq",
			String(NVENC_CQ[quality]),
			"-b:v",
			"0",
			"-profile:v",
			"high",
		],
	},
	{
		id: "h264_amf",
		label: "AMD AMF",
		format: "mp4",
		hardware: true,
		initArgs: [],
		filter: () => "format=nv12",
		codecArgs: (params) => [
			"-c:v",
			"h264_amf",
			"-quality",
			"balanced",
			"-rc",
			"vbr_peak",
			"-profile:v",
			"high",
			...bitrateArgs(params),
		],
	},
	{
		id: "libx264",
		label: "Processador (x264)",
		format: "mp4",
		hardware: false,
		initArgs: [],
		filter: () => "format=yuv420p",
		codecArgs: ({ quality }) => [
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			String(X264_CRF[quality]),
			"-profile:v",
			"high",
		],
	},
	{
		id: "vp9_qsv_gpu",
		label: "Intel Quick Sync VP9 (GPU completa)",
		format: "webm",
		hardware: true,
		initArgs: QSV_DEVICE_ARGS,
		filter: () =>
			chain(
				"format=bgra",
				"hwupload=extra_hw_frames=32",
				"vpp_qsv=format=nv12",
			),
		codecArgs: (params) => ["-c:v", "vp9_qsv", ...bitrateArgs(params)],
	},
	{
		id: "libvpx_vp9",
		label: "Processador (VP9)",
		format: "webm",
		hardware: false,
		initArgs: [],
		filter: () => "format=yuv420p",
		codecArgs: (params) => [
			"-c:v",
			"libvpx-vp9",
			"-deadline",
			"realtime",
			"-cpu-used",
			"5",
			"-row-mt",
			"1",
			"-b:v",
			String(targetBitrate(params)),
		],
	},
];

export function getProfilesForFormat({
	format,
}: {
	format: ExportFormat;
}): FfmpegProfile[] {
	return FFMPEG_PROFILES.filter((profile) => profile.format === format);
}

export function getProfileById({
	id,
}: {
	id: string;
}): FfmpegProfile | undefined {
	return FFMPEG_PROFILES.find((profile) => profile.id === id);
}

/** Maps WebCodecs `VideoFrame.format` names to FFmpeg raw pixel formats. */
export function toRawPixelFormat({
	videoFrameFormat,
}: {
	videoFrameFormat: string | null | undefined;
}): RawPixelFormat | null {
	switch (videoFrameFormat) {
		case "RGBA":
			return "rgba";
		case "BGRA":
			return "bgra";
		case "RGBX":
			return "rgb0";
		case "BGRX":
			return "bgr0";
		default:
			return null;
	}
}

export interface BuildFfmpegArgsParams {
	profile: FfmpegProfile;
	container: FfmpegContainer;
	width: number;
	height: number;
	fpsNumerator: number;
	fpsDenominator: number;
	quality: ExportQuality;
	inputPixelFormat: RawPixelFormat;
	/** Path to a PCM WAV file with the timeline audio, if any. */
	audioPath?: string;
	/** Output file path. Ignored for the "null" container. */
	outputPath?: string;
}

export function buildFfmpegArgs({
	profile,
	container,
	width,
	height,
	fpsNumerator,
	fpsDenominator,
	quality,
	inputPixelFormat,
	audioPath,
	outputPath,
}: BuildFfmpegArgsParams): string[] {
	const params: CodecParams = {
		width,
		height,
		fpsNumerator,
		fpsDenominator,
		quality,
	};

	// The crop has to run first: hardware surfaces cannot be cropped later.
	const filter = chain(
		evenCropFilter(params),
		profile.filter(inputPixelFormat),
	);

	const args: string[] = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostats",
		"-y",
		...profile.initArgs,
		"-f",
		"rawvideo",
		"-pix_fmt",
		inputPixelFormat,
		"-video_size",
		`${width}x${height}`,
		"-framerate",
		`${fpsNumerator}/${fpsDenominator}`,
		"-i",
		"pipe:0",
	];

	if (audioPath) args.push("-i", audioPath);

	args.push("-map", "0:v:0");
	if (audioPath) args.push("-map", "1:a:0");

	args.push("-vf", filter, ...profile.codecArgs(params));

	if (audioPath) {
		args.push(
			...(profile.format === "webm"
				? ["-c:a", "libopus", "-b:a", "160k"]
				: ["-c:a", "aac", "-b:a", "192k"]),
		);
	} else {
		args.push("-an");
	}

	if (container === "null") {
		args.push("-f", "null", "-");
		return args;
	}

	if (container === "mp4") args.push("-movflags", "+faststart");
	if (!outputPath) throw new Error("outputPath is required");
	args.push(outputPath);
	return args;
}
