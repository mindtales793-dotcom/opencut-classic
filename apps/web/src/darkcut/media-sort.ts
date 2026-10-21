import type { MediaAsset } from "@/media/types";

export type MediaSortKey = "name" | "scene" | "date" | "type" | "duration" | "size";
export type MediaSortOrder = "asc" | "desc";

const natural = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

export function mediaSortValue(
	asset: MediaAsset,
	key: MediaSortKey,
): string | number | null {
	switch (key) {
		case "scene":
		case "name":
			return asset.name;
		case "date":
			// OPFS may return a new File with a different lastModified date
			// after reopening a project. Prefer the persisted original date.
			return numberOrNull(asset.lastModified) ?? numberOrNull(asset.file?.lastModified);
		case "duration":
			return numberOrNull(asset.duration);
		case "size":
			return numberOrNull(asset.file?.size);
		case "type":
			return asset.type;
	}
}

export function sortProjectMedia<T extends MediaAsset>(
	items: readonly T[],
	key: MediaSortKey,
	order: MediaSortOrder,
): T[] {
	const direction = order === "desc" ? -1 : 1;
	return [...items].sort((a, b) => {
		const left = mediaSortValue(a, key);
		const right = mediaSortValue(b, key);
		// Missing dates or durations are always at the end, regardless of
		// ascending/descending order. Never compare undefined as zero.
		if (left === null && right !== null) return 1;
		if (left !== null && right === null) return -1;
		let compared = 0;
		if (typeof left === "string" && typeof right === "string") {
			compared = natural.compare(left, right);
		} else if (typeof left === "number" && typeof right === "number") {
			compared = Math.sign(left - right);
		}
		return compared * direction
			|| natural.compare(a.name, b.name)
			|| natural.compare(a.id, b.id);
	});
}
