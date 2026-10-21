import { describe, expect, test } from "bun:test";
import { safeDownloadName } from "../download-name";

describe("safeDownloadName", () => {
	test("keeps normal names and adds the extension once", () => {
		expect(safeDownloadName({ name: "DARKCUT-NARRACAO-Meu-Projeto-Voz", extension: "mp3" })).toBe("DARKCUT-NARRACAO-Meu-Projeto-Voz.mp3");
		expect(safeDownloadName({ name: "narracao.MP3", extension: ".mp3" })).toBe("narracao.mp3");
	});

	test("replaces characters Windows rejects", () => {
		expect(safeDownloadName({ name: 'a/b\\c:d*e?f"g<h>i|j', extension: "mp3" })).toBe("a-b-c-d-e-f-g-h-i-j.mp3");
	});

	test("keeps accents and spaces, trims dots and spaces at the ends", () => {
		expect(safeDownloadName({ name: "  Narração do João...  ", extension: "mp3" })).toBe("Narração do João.mp3");
	});

	test("falls back when nothing usable is left and limits the length", () => {
		expect(safeDownloadName({ name: "???", extension: "mp3" })).toBe("darkcut-narracao.mp3");
		expect(safeDownloadName({ name: "a".repeat(500), extension: "mp3" }).length).toBe(124);
	});
});
