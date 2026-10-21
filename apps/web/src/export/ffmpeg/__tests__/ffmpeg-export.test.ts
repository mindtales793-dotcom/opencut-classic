import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildFfmpegArgs,
	getProfileById,
	getProfilesForFormat,
	targetBitrate,
	toRawPixelFormat,
} from "../profiles";
import { audioBufferToWav } from "../wav";
import { checkExportContainer, checkExportStreams } from "../verify.server";
import { getExportDimensions, getExportFps } from "../../presets";

const hasFfmpeg = (() => {
	try {
		execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

describe("ffmpeg profiles", () => {
	test("checks the actual container instead of trusting the file extension", () => {
		expect(() => checkExportContainer({ formatName: "mov,mp4,m4a,3gp,3g2,mj2", expected: "mp4" })).not.toThrow();
		expect(() => checkExportContainer({ formatName: "matroska,webm", expected: "webm" })).not.toThrow();
		expect(() => checkExportContainer({ formatName: "matroska,webm", expected: "mp4" })).toThrow("Contêiner incorreto");
		expect(() => checkExportContainer({ formatName: undefined, expected: "mp4" })).toThrow("Contêiner incorreto");
	});
	test("prefers GPU encoders before the software fallback", () => {
		const ids = getProfilesForFormat({ format: "mp4" }).map((p) => p.id);
		expect(ids).toEqual([
			"h264_qsv_gpu",
			"h264_qsv",
			"h264_nvenc",
			"h264_amf",
			"libx264",
		]);
		expect(getProfilesForFormat({ format: "webm" }).at(-1)?.hardware).toBe(
			false,
		);
	});

	test("Quick Sync GPU profile uploads and converts frames on the GPU", () => {
		const profile = getProfileById({ id: "h264_qsv_gpu" });
		if (!profile) throw new Error("missing profile");
		const args = buildFfmpegArgs({
			profile,
			container: "mp4",
			width: 1920,
			height: 1080,
			fpsNumerator: 30,
			fpsDenominator: 1,
			quality: "high",
			inputPixelFormat: "bgra",
			outputPath: "out.mp4",
		});
		const joined = args.join(" ");
		expect(joined).toContain("-init_hw_device qsv=hw -filter_hw_device hw");
		expect(joined).toContain("hwupload=extra_hw_frames=32,vpp_qsv=format=nv12");
		expect(joined).toContain("-c:v h264_qsv");
		expect(joined).toContain("-f rawvideo -pix_fmt bgra -video_size 1920x1080");
		expect(args.at(-1)).toBe("out.mp4");
	});

	test("pads odd sizes before hardware filters without cropping the image", () => {
		const profile = getProfileById({ id: "h264_qsv_gpu" });
		if (!profile) throw new Error("missing profile");
		const args = buildFfmpegArgs({
			profile,
			container: "null",
			width: 321,
			height: 193,
			fpsNumerator: 30,
			fpsDenominator: 1,
			quality: "low",
			inputPixelFormat: "rgba",
		});
		const filter = args[args.indexOf("-vf") + 1];
		expect(filter.startsWith("pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=black,")).toBe(true);
	});

	test("maps VideoFrame formats and scales bitrate with quality", () => {
		expect(toRawPixelFormat({ videoFrameFormat: "BGRA" })).toBe("bgra");
		expect(toRawPixelFormat({ videoFrameFormat: "I420" })).toBeNull();

		const base = {
			width: 1920,
			height: 1080,
			fpsNumerator: 30,
			fpsDenominator: 1,
		};
		const low = targetBitrate({ ...base, quality: "low" });
		const veryHigh = targetBitrate({ ...base, quality: "very_high" });
		expect(veryHigh).toBeGreaterThan(low * 3);
	});
	test("keeps exact 16:9 and 9:16 resolutions and requested frame rate", () => {
		expect(getExportDimensions({ source: { width: 1920, height: 1080 }, resolution: "720p" }))
			.toEqual({ width: 1280, height: 720 });
		expect(getExportDimensions({ source: { width: 1080, height: 1920 }, resolution: "2160p" }))
			.toEqual({ width: 2160, height: 3840 });
		expect(getExportDimensions({ source: { width: 1920, height: 1080 }, resolution: "original" }))
			.toEqual({ width: 1920, height: 1080 });
		expect(getExportFps({ fps: { numerator: 24, denominator: 1 }, preset: "29.97" }))
			.toEqual({ numerator: 30000, denominator: 1001 });
	});

	test("quality selection changes CRF and bitrate in the chosen codec", () => {
		const sw = getProfileById({ id: "libx264" });
		const vp9 = getProfileById({ id: "libvpx_vp9" });
		expect(sw).toBeDefined();
		expect(vp9).toBeDefined();
		const base = { width: 1280, height: 720, fpsNumerator: 30, fpsDenominator: 1 };
		const preset = (quality: "low" | "medium" | "high" | "very_high") => ({ ...base, quality });
		const crfs = ["low", "medium", "high", "very_high"].map(q => {
			const args = sw!.codecArgs(preset(q as "low" | "medium" | "high" | "very_high"));
			return Number(args[args.indexOf("-crf") + 1]);
		});
		expect(crfs).toEqual([28, 24, 20, 17]);
		expect(targetBitrate(preset("very_high"))).toBeGreaterThan(targetBitrate(preset("low")));
		expect(vp9!.codecArgs(preset("very_high")).join(" ")).toContain("-b:v");
	});

	test("rejects a video when FFprobe detects unexpected codec, size, FPS or audio", () => {
		const expected = { format: "mp4" as const, width: 1920, height: 1080, fpsNumerator: 30000, fpsDenominator: 1001, quality: "very_high" as const, withAudio: true };
		const streams = [
			{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30000/1001" },
			{ codec_type: "audio", codec_name: "aac" },
		];
		expect(checkExportStreams({ streams, expected })).toMatchObject({ codec: "h264", width: 1920, height: 1080, quality: "very_high", audioCodec: "aac" });
		expect(() => checkExportStreams({ streams: [{ ...streams[0], codec_name: "vp9" }, streams[1]], expected })).toThrow("Codec incorreto");
		expect(() => checkExportStreams({ streams: [{ ...streams[0], width: 1280 }, streams[1]], expected })).toThrow("Resolução incorreta");
		expect(() => checkExportStreams({ streams: [{ ...streams[0], r_frame_rate: "24/1" }, streams[1]], expected })).toThrow("FPS incorreto");
		expect(() => checkExportStreams({ streams: [streams[0]], expected })).toThrow("Áudio incorreto");
	});

});

describe("wav encoder", () => {
	test("writes a valid 16-bit PCM header", () => {
		const left = new Float32Array([0, 1, -1, 0.5]);
		const right = new Float32Array([0, -1, 1, -0.5]);
		const wav = audioBufferToWav({
			audioBuffer: {
				numberOfChannels: 2,
				sampleRate: 48000,
				length: 4,
				getChannelData: (channel: number) => (channel === 0 ? left : right),
			},
		});
		const view = new DataView(wav);
		expect(wav.byteLength).toBe(44 + 4 * 2 * 2);
		expect(String.fromCharCode(...new Uint8Array(wav, 0, 4))).toBe("RIFF");
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint32(24, true)).toBe(48000);
		expect(view.getInt16(44 + 4, true)).toBe(0x7fff);
		expect(view.getInt16(44 + 6, true)).toBe(-0x8000);
	});
});

describe.skipIf(!hasFfmpeg)("ffmpeg job pipeline (real ffmpeg)", () => {
	let dataDir = "";
	let jobs: typeof import("../jobs.server");

	beforeAll(async () => {
		dataDir = mkdtempSync(join(tmpdir(), "darkcut-export-test-"));
		process.env.DARKCUT_FFMPEG_EXPORT = "1";
		process.env.DARKCUT_DATA_DIR = dataDir;
		jobs = await import("../jobs.server");
	});

	afterAll(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	function frames({
		width,
		height,
		count,
	}: {
		width: number;
		height: number;
		count: number;
	}) {
		const frame = Buffer.alloc(width * height * 4);
		const all: Buffer[] = [];
		for (let index = 0; index < count; index++) {
			for (let i = 0; i < frame.length; i += 4) {
				frame[i] = (index * 8) % 256;
				frame[i + 1] = (i / 4) % 256;
				frame[i + 2] = 128;
				frame[i + 3] = 255;
			}
			all.push(Buffer.from(frame));
		}
		return Buffer.concat(all);
	}

	type ProbedStream = {
		codec_type: string;
		codec_name: string;
		width?: number;
		height?: number;
		nb_read_frames?: string;
	};

	function probe(path: string): { streams: ProbedStream[] } {
		const parsed: { streams: ProbedStream[] } = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-count_frames",
				"-show_streams",
				"-of",
				"json",
				path,
			]).toString(),
		);
		return parsed;
	}

	test("rejects invalid requests", () => {
		expect(() => jobs.parseStartRequest(null)).toThrow();
		expect(() =>
			jobs.parseStartRequest({
				format: "mp4",
				quality: "high",
				inputPixelFormat: "bgra",
				width: 10,
				height: 1080,
				fpsNumerator: 30,
				fpsDenominator: 1,
			}),
		).toThrow("Resolução inválida");
		expect(() =>
			jobs.parseStartRequest({
				format: "mp4; rm -rf /",
				quality: "high",
				inputPixelFormat: "bgra",
				width: 1920,
				height: 1080,
				fpsNumerator: 30,
				fpsDenominator: 1,
			}),
		).toThrow();
		expect(jobs.sanitizeFilename('a/b:c*"d?')).toBe("a-b-c--d-");
		expect(() => jobs.getJob("../../etc/passwd")).toThrow();
	});

	test("encodes streamed frames into an MP4 with audio", async () => {
		const width = 320;
		const height = 192;
		const request = jobs.parseStartRequest({
			format: "mp4",
			quality: "medium",
			width,
			height,
			fpsNumerator: 30,
			fpsDenominator: 1,
			inputPixelFormat: "bgra",
			filename: "teste",
		});
		const { id, encoder } = await jobs.createJob(request);
		// No GPU in CI/sandbox: the probe must fall back to software.
		expect(encoder.id).toBe("libx264");

		const job = jobs.getJob(id);
		const samples = new Float32Array(48000).map((_, i) =>
			Math.sin((i / 48000) * 2 * Math.PI * 440),
		);
		await jobs.saveAudio({
			job,
			data: Buffer.from(
				audioBufferToWav({
					audioBuffer: {
						numberOfChannels: 1,
						sampleRate: 48000,
						length: samples.length,
						getChannelData: () => samples,
					},
				}),
			),
		});

		// Two batches, like the browser sends them.
		await jobs.pushFrames({ job, data: frames({ width, height, count: 15 }) });
		await jobs.pushFrames({ job, data: frames({ width, height, count: 15 }) });
		const { size, verified } = await jobs.finishJob({ job });
		expect(size).toBeGreaterThan(1000);
		expect(verified).toMatchObject({ format: "mp4", codec: "h264", width: 320, height: 192, fps: 30, audioCodec: "aac", quality: "medium" });

		const file = jobs.getFinishedFile(job);
		expect(file.filename).toBe("teste.mp4");
		const info = probe(file.path);
		const video = info.streams.find((s) => s.codec_type === "video");
		const audio = info.streams.find((s) => s.codec_type === "audio");
		expect(video?.codec_name).toBe("h264");
		expect(video?.nb_read_frames).toBe("30");
		expect(audio?.codec_name).toBe("aac");

		await jobs.cancelJob(id);
		expect(existsSync(file.path)).toBe(false);
	}, 60_000);

	test("odd canvas sizes still produce a valid file", async () => {
		const width = 321;
		const height = 193;
		const { id } = await jobs.createJob(
			jobs.parseStartRequest({
				format: "mp4",
				quality: "low",
				width,
				height,
				fpsNumerator: 30000,
				fpsDenominator: 1001,
				inputPixelFormat: "rgba",
				filename: "impar",
			}),
		);
		const job = jobs.getJob(id);
		await jobs.pushFrames({ job, data: frames({ width, height, count: 6 }) });
		await jobs.finishJob({ job });

		const video = probe(jobs.getFinishedFile(job).path).streams[0];
		expect(video.width).toBe(322);
		expect(video.height).toBe(194);
		await jobs.cancelJob(id);
	}, 60_000);

	test("WebM export works and wrong frame sizes are rejected", async () => {
		const width = 320;
		const height = 192;
		const { id } = await jobs.createJob(
			jobs.parseStartRequest({
				format: "webm",
				quality: "low",
				width,
				height,
				fpsNumerator: 24,
				fpsDenominator: 1,
				inputPixelFormat: "bgra",
				filename: "web",
			}),
		);
		const job = jobs.getJob(id);
		await expect(
			jobs.pushFrames({ job, data: Buffer.alloc(1234) }),
		).rejects.toThrow("tamanho esperado");
		await jobs.pushFrames({ job, data: frames({ width, height, count: 8 }) });
		await jobs.finishJob({ job });

		const video = probe(jobs.getFinishedFile(job).path).streams[0];
		expect(video.codec_name).toBe("vp9");
		await jobs.cancelJob(id);
	}, 60_000);

	test("CPU fallback keeps requested MP4, 60 FPS and very high quality", async () => {
		const width = 320, height = 192;
		const request = jobs.parseStartRequest({
			format: "mp4", quality: "very_high", preferSoftware: true,
			width, height, fpsNumerator: 60, fpsDenominator: 1,
			inputPixelFormat: "bgra", filename: "cpu-60fps",
		});
		const { id, encoder } = await jobs.createJob(request);
		expect(encoder.id).toBe("libx264");
		expect(encoder.hardware).toBe(false);
		const job = jobs.getJob(id);
		await jobs.pushFrames({ job, data: frames({ width, height, count: 12 }) });
		const result = await jobs.finishJob({ job });
		expect(result.verified).toMatchObject({
			format: "mp4", codec: "h264", fps: 60,
			width, height, quality: "very_high", audioCodec: null,
		});
		await jobs.cancelJob(id);
	}, 60_000);

	for (const format of ["mp4", "webm"] as const) {
		for (const quality of ["low", "medium", "high", "very_high"] as const) {
			test(`real ${format} export preserves ${quality} with audio`, async () => {
				const width = 160, height = 90;
				const { id } = await jobs.createJob(jobs.parseStartRequest({
					format, quality, width, height, preferSoftware: true,
					fpsNumerator: 25, fpsDenominator: 1, inputPixelFormat: "rgba", filename: "matrix",
				}));
				try {
					const job = jobs.getJob(id);
					const samples = new Float32Array(48000 / 5);
					await jobs.saveAudio({ job, data: Buffer.from(audioBufferToWav({ audioBuffer: {
						numberOfChannels: 1, sampleRate: 48000, length: samples.length, getChannelData: () => samples,
					} })) });
					await jobs.pushFrames({ job, data: frames({ width, height, count: 5 }) });
					const { verified } = await jobs.finishJob({ job });
					expect(verified).toMatchObject({ format, quality, width, height, fps: 25,
						codec: format === "mp4" ? "h264" : "vp9", audioCodec: format === "mp4" ? "aac" : "opus" });
					const video = probe(jobs.getFinishedFile(job).path).streams.find(s => s.codec_type === "video");
					expect(video?.nb_read_frames).toBe("5");
				} finally { await jobs.cancelJob(id); }
			}, 60_000);
		}
	}

	test("cancelling mid-export stops ffmpeg and removes the files", async () => {
		const width = 320;
		const height = 192;
		const { id } = await jobs.createJob(
			jobs.parseStartRequest({
				format: "mp4",
				quality: "low",
				width,
				height,
				fpsNumerator: 30,
				fpsDenominator: 1,
				inputPixelFormat: "bgra",
				filename: "cancelar",
			}),
		);
		const job = jobs.getJob(id);
		await jobs.pushFrames({ job, data: frames({ width, height, count: 4 }) });
		const dir = job.dir;
		expect(existsSync(dir)).toBe(true);

		await jobs.cancelJob(id);
		expect(existsSync(dir)).toBe(false);
		expect(() => jobs.getJob(id)).toThrow("não encontrada");
	}, 60_000);
});
