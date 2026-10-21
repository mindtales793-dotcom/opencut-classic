/**
 * Integrated loudness (ITU-R BS.1770-4 / EBU R128) and gain normalization.
 *
 * Voice-over videos usually reach the export far quieter than what YouTube,
 * Shorts or TikTok expect (about -14 LUFS). A peak limiter alone never raises
 * them, so the video sounds weak next to others. This module measures the mix
 * the same way broadcast meters do and returns the gain needed to hit a target.
 *
 * It works on plain `Float32Array` channels so it can be tested without a
 * browser, and it streams the audio in 100 ms steps instead of copying it.
 */

export const LOUDNESS_TARGETS = [
	{ lufs: -14, label: "YouTube / Shorts / TikTok (-14 LUFS)" },
	{ lufs: -16, label: "Mais suave (-16 LUFS)" },
	{ lufs: -23, label: "Broadcast EBU R128 (-23 LUFS)" },
] as const;

/** Never boost more than this, so a near-silent file is not turned into noise. */
export const MAX_LOUDNESS_BOOST_DB = 12;
export const MAX_LOUDNESS_CUT_DB = 24;
/** The master limiter may work this many dB above full scale after the boost. */
const LIMITER_OVERSHOOT_DB = 4;

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_SECONDS = 0.4;
const STEP_SECONDS = 0.1;
const STEPS_PER_BLOCK = Math.round(BLOCK_SECONDS / STEP_SECONDS);

interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

/** K-weighting: a high shelf (head acoustics) followed by a 38 Hz high-pass. */
export function kWeightingFilters({
	sampleRate,
}: {
	sampleRate: number;
}): [Biquad, Biquad] {
	const shelfGainDb = 3.999843853973347;
	const shelfFrequency = 1681.974450955533;
	const shelfQ = 0.7071752369554196;
	const shelfK = Math.tan((Math.PI * shelfFrequency) / sampleRate);
	const vh = 10 ** (shelfGainDb / 20);
	const vb = vh ** 0.4996667741545416;
	const shelfA0 = 1 + shelfK / shelfQ + shelfK * shelfK;
	const shelf: Biquad = {
		b0: (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
		b1: (2 * (shelfK * shelfK - vh)) / shelfA0,
		b2: (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
		a1: (2 * (shelfK * shelfK - 1)) / shelfA0,
		a2: (1 - shelfK / shelfQ + shelfK * shelfK) / shelfA0,
	};

	const highPassFrequency = 38.13547087602444;
	const highPassQ = 0.5003270373238773;
	const highPassK = Math.tan((Math.PI * highPassFrequency) / sampleRate);
	const highPassA0 = 1 + highPassK / highPassQ + highPassK * highPassK;
	const highPass: Biquad = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (highPassK * highPassK - 1)) / highPassA0,
		a2: (1 - highPassK / highPassQ + highPassK * highPassK) / highPassA0,
	};

	return [shelf, highPass];
}

/**
 * Sum of K-weighted squared samples for every consecutive 100 ms step,
 * summed over channels (all channels weigh 1.0, as for stereo).
 */
function stepEnergies({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): { energies: Float64Array; stepLength: number } {
	const stepLength = Math.max(1, Math.round(STEP_SECONDS * sampleRate));
	const length = channels.reduce((max, data) => Math.max(max, data.length), 0);
	const stepCount = Math.floor(length / stepLength);
	const energies = new Float64Array(stepCount);
	const [shelf, highPass] = kWeightingFilters({ sampleRate });

	for (const data of channels) {
		let shelfX1 = 0;
		let shelfX2 = 0;
		let shelfY1 = 0;
		let shelfY2 = 0;
		let highX1 = 0;
		let highX2 = 0;
		let highY1 = 0;
		let highY2 = 0;

		for (let step = 0; step < stepCount; step++) {
			let sum = 0;
			const start = step * stepLength;
			for (let index = start; index < start + stepLength; index++) {
				const x = index < data.length ? data[index] : 0;
				const shelved =
					shelf.b0 * x +
					shelf.b1 * shelfX1 +
					shelf.b2 * shelfX2 -
					shelf.a1 * shelfY1 -
					shelf.a2 * shelfY2;
				shelfX2 = shelfX1;
				shelfX1 = x;
				shelfY2 = shelfY1;
				shelfY1 = shelved;

				const weighted =
					highPass.b0 * shelved +
					highPass.b1 * highX1 +
					highPass.b2 * highX2 -
					highPass.a1 * highY1 -
					highPass.a2 * highY2;
				highX2 = highX1;
				highX1 = shelved;
				highY2 = highY1;
				highY1 = weighted;

				sum += weighted * weighted;
			}
			energies[step] += sum;
		}
	}

	return { energies, stepLength };
}

const energyToLufs = (energy: number): number =>
	energy > 0 ? -0.691 + 10 * Math.log10(energy) : Number.NEGATIVE_INFINITY;

/**
 * Gated integrated loudness in LUFS. Returns `-Infinity` for silence or for
 * audio shorter than one 400 ms block.
 */
export function measureIntegratedLoudness({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): number {
	if (channels.length === 0 || sampleRate <= 0) return Number.NEGATIVE_INFINITY;
	const { energies, stepLength } = stepEnergies({ channels, sampleRate });
	const blockCount = energies.length - STEPS_PER_BLOCK + 1;
	if (blockCount < 1) return Number.NEGATIVE_INFINITY;

	// Mean square per block (400 ms = 4 steps, 75 % overlap).
	const blockLength = stepLength * STEPS_PER_BLOCK;
	const blocks = new Float64Array(blockCount);
	let windowSum = 0;
	for (let step = 0; step < STEPS_PER_BLOCK; step++) windowSum += energies[step];
	blocks[0] = windowSum / blockLength;
	for (let block = 1; block < blockCount; block++) {
		windowSum += energies[block + STEPS_PER_BLOCK - 1] - energies[block - 1];
		blocks[block] = Math.max(0, windowSum) / blockLength;
	}

	const absolute = blocks.filter(
		(energy) => energyToLufs(energy) > ABSOLUTE_GATE_LUFS,
	);
	if (absolute.length === 0) return Number.NEGATIVE_INFINITY;
	const absoluteMean =
		absolute.reduce((sum, energy) => sum + energy, 0) / absolute.length;

	const relativeGate = energyToLufs(absoluteMean) + RELATIVE_GATE_LU;
	const relative = absolute.filter(
		(energy) => energyToLufs(energy) > relativeGate,
	);
	if (relative.length === 0) return Number.NEGATIVE_INFINITY;
	return energyToLufs(
		relative.reduce((sum, energy) => sum + energy, 0) / relative.length,
	);
}

export interface LoudnessGainPlan {
	measuredLufs: number;
	/** Gain to apply, in dB (0 when nothing should change). */
	gainDb: number;
	reason: "applied" | "silent" | "already-at-target";
}

/**
 * Gain needed to reach `targetLufs`, kept inside safe bounds:
 * - boost is capped at {@link MAX_LOUDNESS_BOOST_DB};
 * - boost never pushes the sample peak more than a few dB above full scale,
 *   so the master limiter is not asked to flatten the whole track;
 * - silence is left alone.
 */
export function planLoudnessGain({
	measuredLufs,
	peak,
	targetLufs,
}: {
	measuredLufs: number;
	peak: number;
	targetLufs: number;
}): LoudnessGainPlan {
	if (!Number.isFinite(measuredLufs) || peak <= 0) {
		return { measuredLufs, gainDb: 0, reason: "silent" };
	}
	let gainDb = targetLufs - measuredLufs;
	gainDb = Math.min(gainDb, MAX_LOUDNESS_BOOST_DB);
	gainDb = Math.max(gainDb, -MAX_LOUDNESS_CUT_DB);
	const peakDb = 20 * Math.log10(peak);
	gainDb = Math.min(gainDb, LIMITER_OVERSHOOT_DB - peakDb);
	if (Math.abs(gainDb) < 0.1) {
		return { measuredLufs, gainDb: 0, reason: "already-at-target" };
	}
	return { measuredLufs, gainDb, reason: "applied" };
}

export function getChannelsPeak({
	channels,
}: {
	channels: Float32Array[];
}): number {
	let peak = 0;
	for (const data of channels) {
		for (let index = 0; index < data.length; index++) {
			const magnitude = Math.abs(data[index]);
			if (magnitude > peak) peak = magnitude;
		}
	}
	return peak;
}

/** Measures `channels`, then scales them in place to the target loudness. */
export function normalizeChannelsLoudness({
	channels,
	sampleRate,
	targetLufs,
}: {
	channels: Float32Array[];
	sampleRate: number;
	targetLufs: number;
}): LoudnessGainPlan {
	const plan = planLoudnessGain({
		measuredLufs: measureIntegratedLoudness({ channels, sampleRate }),
		peak: getChannelsPeak({ channels }),
		targetLufs,
	});
	if (plan.gainDb === 0) return plan;
	const gain = 10 ** (plan.gainDb / 20);
	for (const data of channels) {
		for (let index = 0; index < data.length; index++) data[index] *= gain;
	}
	return plan;
}
