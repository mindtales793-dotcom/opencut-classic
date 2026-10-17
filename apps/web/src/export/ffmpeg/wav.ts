/**
 * Encodes an AudioBuffer as 16-bit PCM WAV so FFmpeg can mux it
 * (AAC for MP4, Opus for WebM) without decoding anything in the browser.
 */
export function audioBufferToWav({
	audioBuffer,
}: {
	audioBuffer: Pick<
		AudioBuffer,
		"numberOfChannels" | "sampleRate" | "length" | "getChannelData"
	>;
}): ArrayBuffer {
	const channelCount = audioBuffer.numberOfChannels;
	const frameCount = audioBuffer.length;
	const bytesPerSample = 2;
	const blockAlign = channelCount * bytesPerSample;
	const dataSize = frameCount * blockAlign;

	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii({ view, offset: 0, text: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, text: "WAVE" });
	writeAscii({ view, offset: 12, text: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channelCount, true);
	view.setUint32(24, audioBuffer.sampleRate, true);
	view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeAscii({ view, offset: 36, text: "data" });
	view.setUint32(40, dataSize, true);

	const channels: Float32Array[] = [];
	for (let channel = 0; channel < channelCount; channel++) {
		channels.push(audioBuffer.getChannelData(channel));
	}

	let offset = 44;
	for (let frame = 0; frame < frameCount; frame++) {
		for (let channel = 0; channel < channelCount; channel++) {
			const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
			view.setInt16(
				offset,
				sample < 0 ? sample * 0x8000 : sample * 0x7fff,
				true,
			);
			offset += bytesPerSample;
		}
	}

	return buffer;
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
