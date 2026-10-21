import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MAX_LOUDNESS_BOOST_DB,
	getChannelsPeak,
	measureIntegratedLoudness,
	normalizeChannelsLoudness,
	planLoudnessGain,
} from "../loudness";

const SAMPLE_RATE = 48000;

/** Deterministic pseudo-random numbers (mulberry32) so tests never flake. */
function createRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const dbToGain = (db: number) => 10 ** (db / 20);

function sine({
	seconds,
	frequency,
	amplitudeDb,
}: {
	seconds: number;
	frequency: number;
	amplitudeDb: number;
}): Float32Array {
	const data = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	const amplitude = dbToGain(amplitudeDb);
	for (let index = 0; index < data.length; index++) {
		data[index] =
			amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
	}
	return data;
}

/** Voice-like: noise bursts with pauses, so gating actually matters. */
function speechLike({
	seconds,
	amplitudeDb,
	seed,
}: {
	seconds: number;
	amplitudeDb: number;
	seed: number;
}): Float32Array {
	const random = createRandom(seed);
	const data = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	const amplitude = dbToGain(amplitudeDb);
	let low = 0;
	for (let index = 0; index < data.length; index++) {
		const second = index / SAMPLE_RATE;
		const talking = second % 2 < 1.3; // 1.3 s of speech, 0.7 s of pause
		const envelope = talking ? 0.6 + 0.4 * Math.sin(second * 9) ** 2 : 0.0005;
		low = low * 0.95 + (random() * 2 - 1) * 0.05; // warm, low-passed noise
		data[index] = amplitude * envelope * (low * 6 + (random() * 2 - 1) * 0.3);
	}
	return data;
}

function toWav({ channels }: { channels: Float32Array[] }): Buffer {
	const length = channels[0].length;
	const dataBytes = length * channels.length * 2;
	const wav = Buffer.alloc(44 + dataBytes);
	wav.write("RIFF", 0);
	wav.writeUInt32LE(36 + dataBytes, 4);
	wav.write("WAVEfmt ", 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(channels.length, 22);
	wav.writeUInt32LE(SAMPLE_RATE, 24);
	wav.writeUInt32LE(SAMPLE_RATE * channels.length * 2, 28);
	wav.writeUInt16LE(channels.length * 2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write("data", 36);
	wav.writeUInt32LE(dataBytes, 40);
	let offset = 44;
	for (let index = 0; index < length; index++) {
		for (const data of channels) {
			const clamped = Math.max(-1, Math.min(1, data[index]));
			wav.writeInt16LE(Math.round(clamped * 32767), offset);
			offset += 2;
		}
	}
	return wav;
}

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** Reference: FFmpeg's EBU R128 meter, the same one used for the final MP4. */
function ffmpegIntegratedLufs({ channels }: { channels: Float32Array[] }) {
	const directory = mkdtempSync(join(tmpdir(), "darkcut-lufs-"));
	try {
		const file = join(directory, "signal.wav");
		writeFileSync(file, toWav({ channels }));
		const result = spawnSync(
			"ffmpeg",
			["-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"],
			{ encoding: "utf8" },
		);
		const summary = result.stderr.split("Summary:")[1] ?? "";
		const match = /I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(summary);
		if (!match) throw new Error(`ebur128 produced no summary:\n${result.stderr}`);
		return Number(match[1]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe("integrated loudness (BS.1770)", () => {
	test("a 1 kHz stereo sine reads close to its theoretical value", () => {
		// Identical stereo channels add their power, and K-weighting is about +0.7 dB at
		// 1 kHz: a -20 dBFS peak stereo sine is -20.0 LUFS (a mono one is 3 dB lower).
		const tone = sine({ seconds: 6, frequency: 1000, amplitudeDb: -20 });
		const lufs = measureIntegratedLoudness({
			channels: [tone, tone],
			sampleRate: SAMPLE_RATE,
		});
		expect(lufs).toBeGreaterThan(-20.1);
		expect(lufs).toBeLessThan(-19.9);
	});

	test("silence and sub-block audio are reported as -Infinity", () => {
		const silence = new Float32Array(SAMPLE_RATE * 2);
		expect(
			measureIntegratedLoudness({
				channels: [silence, silence],
				sampleRate: SAMPLE_RATE,
			}),
		).toBe(Number.NEGATIVE_INFINITY);
		const tooShort = sine({ seconds: 0.3, frequency: 1000, amplitudeDb: -10 });
		expect(
			measureIntegratedLoudness({
				channels: [tooShort],
				sampleRate: SAMPLE_RATE,
			}),
		).toBe(Number.NEGATIVE_INFINITY);
	});

	test("the gate ignores pauses: speech with long silences keeps its loudness", () => {
		const speech = speechLike({ seconds: 12, amplitudeDb: -18, seed: 7 });
		const withTail = new Float32Array(speech.length + SAMPLE_RATE * 20);
		withTail.set(speech);
		const base = measureIntegratedLoudness({
			channels: [speech, speech],
			sampleRate: SAMPLE_RATE,
		});
		const padded = measureIntegratedLoudness({
			channels: [withTail, withTail],
			sampleRate: SAMPLE_RATE,
		});
		expect(Math.abs(base - padded)).toBeLessThan(0.1);
	});

	test.skipIf(!hasFfmpeg)(
		"matches FFmpeg ebur128 within 0.1 LU on tones and speech-like audio",
		() => {
			const cases: Array<{ name: string; channels: Float32Array[] }> = [
				{
					name: "sine",
					channels: [
						sine({ seconds: 8, frequency: 1000, amplitudeDb: -18 }),
						sine({ seconds: 8, frequency: 1000, amplitudeDb: -18 }),
					],
				},
				{
					name: "low sine",
					channels: [
						sine({ seconds: 8, frequency: 90, amplitudeDb: -14 }),
						sine({ seconds: 8, frequency: 90, amplitudeDb: -14 }),
					],
				},
				{
					name: "speech-like",
					channels: [
						speechLike({ seconds: 16, amplitudeDb: -17, seed: 1 }),
						speechLike({ seconds: 16, amplitudeDb: -17, seed: 2 }),
					],
				},
				{
					name: "quiet speech-like",
					channels: [
						speechLike({ seconds: 16, amplitudeDb: -34, seed: 3 }),
						speechLike({ seconds: 16, amplitudeDb: -34, seed: 4 }),
					],
				},
			];
			for (const { name, channels } of cases) {
				// Compare on the same 16-bit data FFmpeg reads.
				const quantized = channels.map(
					(data) => new Float32Array(data.map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767) / 32767)),
				);
				const ours = measureIntegratedLoudness({
					channels: quantized,
					sampleRate: SAMPLE_RATE,
				});
				const reference = ffmpegIntegratedLufs({ channels });
				expect(
					Math.abs(ours - reference),
					`${name}: ours ${ours.toFixed(2)} vs ffmpeg ${reference.toFixed(2)}`,
				).toBeLessThan(0.1);
			}
		},
	);
});

describe("loudness gain planning", () => {
	test("boosts quiet audio to the target and attenuates loud audio", () => {
		expect(
			planLoudnessGain({ measuredLufs: -20, peak: 0.1, targetLufs: -14 }),
		).toMatchObject({ gainDb: 6, reason: "applied" });
		expect(
			planLoudnessGain({ measuredLufs: -8, peak: 0.9, targetLufs: -14 }),
		).toMatchObject({ gainDb: -6, reason: "applied" });
	});

	test("never boosts more than the cap, even for very quiet files", () => {
		const plan = planLoudnessGain({
			measuredLufs: -50,
			peak: 0.001,
			targetLufs: -14,
		});
		expect(plan.gainDb).toBe(MAX_LOUDNESS_BOOST_DB);
	});

	test("does not ask the limiter to flatten spiky audio", () => {
		// -30 LUFS with a full-scale peak: a 16 dB boost would put the peak +16 dB over full scale.
		const plan = planLoudnessGain({
			measuredLufs: -30,
			peak: 1,
			targetLufs: -14,
		});
		expect(plan.gainDb).toBeLessThanOrEqual(4.0001);
		expect(plan.gainDb).toBeGreaterThan(0);
	});

	test("leaves silence and already-on-target audio alone", () => {
		expect(
			planLoudnessGain({
				measuredLufs: Number.NEGATIVE_INFINITY,
				peak: 0,
				targetLufs: -14,
			}).gainDb,
		).toBe(0);
		expect(
			planLoudnessGain({ measuredLufs: -14.04, peak: 0.5, targetLufs: -14 })
				.reason,
		).toBe("already-at-target");
	});
});

describe("normalizeChannelsLoudness", () => {
	test("brings quiet narration to the target and the result re-measures on target", () => {
		const left = speechLike({ seconds: 20, amplitudeDb: -32, seed: 11 });
		const right = speechLike({ seconds: 20, amplitudeDb: -32, seed: 12 });
		const channels = [left, right];
		const before = measureIntegratedLoudness({
			channels,
			sampleRate: SAMPLE_RATE,
		});
		expect(before).toBeLessThan(-30);

		const plan = normalizeChannelsLoudness({
			channels,
			sampleRate: SAMPLE_RATE,
			targetLufs: -14,
		});
		expect(plan.reason).toBe("applied");

		const after = measureIntegratedLoudness({
			channels,
			sampleRate: SAMPLE_RATE,
		});
		// Boost is capped at 12 dB, so very quiet audio only gets part of the way.
		expect(after).toBeCloseTo(before + plan.gainDb, 1);
		expect(after - before).toBeLessThanOrEqual(MAX_LOUDNESS_BOOST_DB + 0.01);
	});

	test("reaches the target exactly when the cap and peak allow it", () => {
		const left = speechLike({ seconds: 20, amplitudeDb: -24, seed: 21 });
		const right = speechLike({ seconds: 20, amplitudeDb: -24, seed: 22 });
		const channels = [left, right];
		normalizeChannelsLoudness({
			channels,
			sampleRate: SAMPLE_RATE,
			targetLufs: -16,
		});
		const after = measureIntegratedLoudness({
			channels,
			sampleRate: SAMPLE_RATE,
		});
		expect(Math.abs(after + 16)).toBeLessThan(0.15);
		expect(getChannelsPeak({ channels })).toBeGreaterThan(0);
	});

	test("does not touch silent audio", () => {
		const silence = new Float32Array(SAMPLE_RATE * 3);
		const plan = normalizeChannelsLoudness({
			channels: [silence, silence],
			sampleRate: SAMPLE_RATE,
			targetLufs: -14,
		});
		expect(plan.reason).toBe("silent");
		expect(getChannelsPeak({ channels: [silence, silence] })).toBe(0);
	});
});
