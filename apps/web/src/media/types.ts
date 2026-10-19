import type { MediaAssetData } from "@/services/storage/types";

export type MediaType = "image" | "video" | "audio";

export interface MediaAsset
	extends Omit<MediaAssetData, "size" | "lastModified"> {
	file: File;
	/** Original file date, persisted independently of OPFS reconstruction. */
	lastModified?: number;
	url?: string;
}
