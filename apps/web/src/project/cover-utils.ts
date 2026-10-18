import type { TScene } from "@/timeline/types";

export interface CoverMedia {
	id: string;
	type: "image" | "video" | "audio";
	name?: string;
}

export interface CoverCandidate {
	mediaId: string;
	type: "image" | "video";
	startTime: number;
}

/**
 * Choose a cover from the earliest visible visual in the project, rather than
 * blindly rendering timeline time zero (which may be black before the intro).
 * Preserve the timeline: this picks a thumbnail; it never inserts a clip.
 */
export function chooseProjectCover(
	scenes: readonly TScene[],
	assets: readonly CoverMedia[],
): CoverCandidate | null {
	const byId = new Map(assets.map((asset) => [asset.id, asset]));
	const candidates: CoverCandidate[] = [];
	for (const scene of scenes) {
		const tracks = [scene.tracks.main, ...scene.tracks.overlay]
			.filter((track) => track.type === "video" && !track.hidden);
		for (const track of tracks) {
			for (const element of track.elements) {
				if ((element.type !== "image" && element.type !== "video") ||
					element.hidden || element.duration <= 0) continue;
				const asset = byId.get(element.mediaId);
				if (!asset || asset.type !== element.type) continue;
				candidates.push({
					mediaId: asset.id,
					type: element.type,
					startTime: element.startTime,
				});
			}
		}
		if (candidates.length) break;
	}
	candidates.sort((a, b) =>
		a.startTime - b.startTime ||
		Number(b.type === "image") - Number(a.type === "image"),
	);
	if (candidates[0]) return candidates[0];
	// Media imported but not placed on the timeline can still identify a project.
	const fallback = assets.find((item) => item.type === "image") ??
		assets.find((item) => item.type === "video");
	return fallback ? {
		mediaId: fallback.id,
		type: fallback.type as "image" | "video",
		startTime: 0,
	} : null;
}

export function createProjectPlaceholder(name: string): string {
	// A lightweight, recognizable cover until the first usable frame is saved.
	// Encode XML so project names cannot inject SVG markup.
	const safe = name.trim().slice(0, 62).replace(/[&<>"']/g, (ch) =>
		({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[ch] ?? ch,
	);
	const title = safe || "PROJETO DARKCUT";
	const normalized = name.toLowerCase();
	const label = /hb\s?20|onix|corsa|gol|carro|fiat|chevrolet|volkswagen|hyundai/.test(normalized)
		? "AUTOMOTIVO" : /document[aá]rio|hist[oó]ria|investiga/.test(normalized)
			? "DOCUMENTÁRIO" : "EM PRODUÇÃO";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#25141c"/><stop offset="0.53" stop-color="#101721"/><stop offset="1" stop-color="#0b0c12"/></linearGradient>
<pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity=".055"/></pattern></defs>
<rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#p)"/>
<circle cx="534" cy="140" r="130" fill="#ee2945" fill-opacity=".055"/>
<path d="M42 45H126 M42 45V120 M598 317H514 M598 317V245" stroke="#f83c59" stroke-width="4" fill="none"/>
<rect x="42" y="61" width="130" height="30" rx="4" fill="#ac2338"/>
<text x="54" y="81" font-family="Arial" font-weight="bold" fill="#fff" font-size="13" letter-spacing="2">DARKCUT</text>
<text x="42" y="173" font-family="Arial" font-size="14" font-weight="bold" fill="#f8adb7" letter-spacing="3">${label}</text>
<text x="42" y="228" font-family="Arial" font-size="34" font-weight="900" fill="#ffffff" textLength="540" lengthAdjust="spacingAndGlyphs">${title}</text>
<rect x="42" y="276" width="548" height="2" fill="#f83c59" fill-opacity=".45"/>
<text x="42" y="310" font-family="Arial" font-size="14" fill="#e3bfc6">Capa automática ao adicionar a primeira mídia</text>
</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
