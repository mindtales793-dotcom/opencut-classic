import { describe, expect, test } from "bun:test";
import { getPermittedSunoAudioUrl, normalizeLocalSunoSong, parseSunoPort } from "../suno-local";

describe("Suno optional local adapter", () => {
	test("only permits explicit local service ports", () => {
		expect(parseSunoPort("8025")).toBe(8025);
		expect(parseSunoPort("8099")).toBe(8099);
		expect(parseSunoPort("8000")).toBeNull();
		expect(parseSunoPort("65535")).toBeNull();
		expect(parseSunoPort("8025/songs")).toBeNull();
	});

	test("audio URL must be HTTPS on the Suno CDN, not a host provided by the API", () => {
		expect(getPermittedSunoAudioUrl("https://cdn1.suno.ai/test.mp3")).toBe("https://cdn1.suno.ai/test.mp3");
		expect(getPermittedSunoAudioUrl("https://example.com/song.mp3")).toBeNull();
		expect(getPermittedSunoAudioUrl("http://cdn1.suno.ai/song.mp3")).toBeNull();
		expect(getPermittedSunoAudioUrl("https://cdn1.suno.ai.evil.invalid/song.mp3")).toBeNull();
		expect(getPermittedSunoAudioUrl("file:///etc/passwd")).toBeNull();
	});

	test("exposes only a minimal song record with valid UUID", () => {
		const song = normalizeLocalSunoSong({
			id: "f49ac384-ecec-4b17-9024-e9a2224170cb",
			title: "Instrumental",
			status: "complete",
			audio_url: "https://cdn1.suno.ai/a.mp3",
			user_id: "should-not-leak",
			cookie: "should-not-leak",
		});
		expect(song).toEqual({ id: "f49ac384-ecec-4b17-9024-e9a2224170cb", title: "Instrumental", status: "complete", audioReady: true });
		expect(normalizeLocalSunoSong({ id: "123", audio_url: "https://cdn1.suno.ai/a.mp3" })).toBeNull();
	});
});
