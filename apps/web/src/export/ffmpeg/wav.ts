/**
 * Encodes an AudioBuffer as 16-bit PCM WAV so FFmpeg can mux it
 * (AAC for MP4, Opus for WebM) without decoding anything in the browser.
 */
type WavSource = Pick<
	AudioBuffer,
	"numberOfChannels" | "sampleRate" | "length" | "getChannelData"
>;

const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;
/** Audio is uploaded in parts of about this size, so no huge ArrayBuffer is needed. */
const WAV_PART_TARGET_BYTES = 8 * 1024 * 1024;

function writeWavHeader({
	view,
	channelCount,
	sampleRate,
	dataSize,
}: {
	view: DataView;
	channelCount: number;
	sampleRate: number;
	dataSize: number;
}) {
	const blockAlign = channelCount * BYTES_PER_SAMPLE;
	writeAscii({ view, offset: 0, text: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, text: "WAVE" });
	writeAscii({ view, offset: 12, text: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
	writeAscii({ view, offset: 36, text: "data" });
	view.setUint32(40, dataSize, true);
}

/** Writes frames [startFrame, startFrame + frameCount) as 16-bit PCM at `view`/`offset`. */
function writePcm({
	view,
	offset,
	channels,
	startFrame,
	frameCount,
}: {
	view: DataView;
	offset: number;
	channels: Float32Array[];
	startFrame: number;
	frameCount: number;
}) {
	let position = offset;
	for (let frame = startFrame; frame < startFrame + frameCount; frame++) {
		for (const channel of channels) {
			const sample = Math.max(-1, Math.min(1, channel[frame]));
			view.setInt16(position, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			position += BYTES_PER_SAMPLE;
		}
	}
}

function getChannels({ audioBuffer }: { audioBuffer: WavSource }): Float32Array[] {
	const channels: Float32Array[] = [];
	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
		channels.push(audioBuffer.getChannelData(channel));
	}
	return channels;
}

/** Whole WAV in one ArrayBuffer. Fine for short audio; long timelines use {@link wavParts}. */
export function audioBufferToWav({
	audioBuffer,
}: {
	audioBuffer: WavSource;
}): ArrayBuffer {
	const channelCount = audioBuffer.numberOfChannels;
	const frameCount = audioBuffer.length;
	const dataSize = frameCount * channelCount * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
	const view = new DataView(buffer);
	writeWavHeader({
		view,
		channelCount,
		sampleRate: audioBuffer.sampleRate,
		dataSize,
	});
	writePcm({
		view,
		offset: WAV_HEADER_BYTES,
		channels: getChannels({ audioBuffer }),
		startFrame: 0,
		frameCount,
	});
	return buffer;
}

/**
 * The same WAV file as consecutive small parts (header in the first one), so
 * the browser never allocates one buffer the size of the whole soundtrack
 * (about 690 MB per hour of stereo audio). Concatenating the parts yields
 * exactly what {@link audioBufferToWav} returns.
 */
export function* wavParts({
	audioBuffer,
	partBytes = WAV_PART_TARGET_BYTES,
}: {
	audioBuffer: WavSource;
	partBytes?: number;
}): Generator<ArrayBuffer> {
	const channelCount = audioBuffer.numberOfChannels;
	const frameCount = audioBuffer.length;
	const blockAlign = channelCount * BYTES_PER_SAMPLE;
	const framesPerPart = Math.max(1, Math.floor(partBytes / blockAlign));
	const channels = getChannels({ audioBuffer });
	const dataSize = frameCount * blockAlign;

	let startFrame = 0;
	let isFirst = true;
	while (isFirst || startFrame < frameCount) {
		const frames = Math.min(framesPerPart, frameCount - startFrame);
		const headerBytes = isFirst ? WAV_HEADER_BYTES : 0;
		const buffer = new ArrayBuffer(headerBytes + frames * blockAlign);
		const view = new DataView(buffer);
		if (isFirst) {
			writeWavHeader({
				view,
				channelCount,
				sampleRate: audioBuffer.sampleRate,
				dataSize,
			});
		}
		writePcm({
			view,
			offset: headerBytes,
			channels,
			startFrame,
			frameCount: frames,
		});
		yield buffer;
		startFrame += frames;
		isFirst = false;
	}
}

/** Number of parts {@link wavParts} will yield. */
export function countWavParts({
	audioBuffer,
	partBytes = WAV_PART_TARGET_BYTES,
}: {
	audioBuffer: WavSource;
	partBytes?: number;
}): number {
	const blockAlign = audioBuffer.numberOfChannels * BYTES_PER_SAMPLE;
	const framesPerPart = Math.max(1, Math.floor(partBytes / blockAlign));
	return Math.max(1, Math.ceil(audioBuffer.length / framesPerPart));
}

function writeAscii({
	view,
	offset,
	text,
}: {
	view: DataView;
	offset: number;
	text: string;
}) {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}
