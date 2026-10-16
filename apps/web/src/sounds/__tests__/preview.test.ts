import { test, expect } from "bun:test";
import { playSound, stopSoundPreview } from "../use-sound-preview";
import type { SoundEffect } from "../types";
test("pause during loading cannot leave an orphan player or restart playback", async () => {
	const original = globalThis.Audio;
	const players: FakeAudio[] = [];
	class FakeAudio {
		paused = false;
		src = "";
		onended: any;
		onerror: any;
		resolve!: () => void;
		constructor(src: string) {
			this.src = src;
			players.push(this);
		}
		play() {
			return new Promise<void>((resolve) => {
				this.resolve = resolve;
			});
		}
		pause() {
			this.paused = true;
		}
		removeAttribute() {
			this.src = "";
		}
		load() {}
	}
	globalThis.Audio = FakeAudio as unknown as typeof Audio;
	try {
		const sound = {
			id: 1,
			previewUrl: "https://example.test/a.mp3",
			name: "Test",
		} as SoundEffect;
		playSound({ sound });
		playSound({ sound });
		expect(players.length).toBe(1);
		expect(players[0].paused).toBe(true);
		players[0].resolve();
		await Promise.resolve();
		expect(players[0].paused).toBe(true);
		playSound({ sound });
		playSound({ sound: { ...sound, id: 2 } });
		expect(players[1].paused).toBe(true);
		players[1].resolve();
		players[2].resolve();
		await Promise.resolve();
		expect(players[1].paused).toBe(true);
		stopSoundPreview();
		expect(players.every((p) => p.paused)).toBe(true);
	} finally {
		stopSoundPreview();
		globalThis.Audio = original;
	}
});
