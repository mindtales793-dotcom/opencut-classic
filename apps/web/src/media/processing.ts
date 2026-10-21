import { toast } from "sonner";
import { getMediaTypeFromFile } from "@/media/media-utils";
import { formatStorageBytes } from "@/services/storage/quota";
import { storageService } from "@/services/storage/service";
import type { MediaAsset } from "@/media/types";
import { readVideoFile } from "./mediabunny";
import type { VideoFileData } from "./mediabunny";
import { renderThumbnailDataUrl } from "./thumbnail";

export interface ProcessedMediaAsset extends Omit<MediaAsset, "id"> {}

const getUnsupportedVideoDescription = ({
	codec,
}: {
	codec: VideoFileData["codec"];
}): string => {
	const codecLabel = codec ? codec.toUpperCase() : "this video codec";

	return codec === "hevc"
		? `${codecLabel} cannot be decoded in this browser, so this clip may not preview correctly. Convert it to H.264 MP4 or try importing it in Safari.`
		: `${codecLabel} cannot be decoded in this browser, so this clip may not preview correctly. Convert it to H.264 MP4 and reimport it.`;
};

const getStorageLimitDescription = ({
	fileSize,
	availableBytes,
}: {
	fileSize: number;
	availableBytes: number | null;
}): string => {
	const fileSizeLabel = formatStorageBytes({ bytes: fileSize });

	if (availableBytes === null) {
		return `File size is ${fileSizeLabel}.`;
	}

	return `File size is ${fileSizeLabel}, but only ${formatStorageBytes({
		bytes: availableBytes,
	})} is safely available in browser storage.`;
};

/**
 * Decode in Chromium's image decoder rather than forcing hundreds of
 * full-size HTMLImageElements through the main thread.
 * The original File is never rescaled: only its small library thumbnail is.
 */
async function generateImageThumbnail({
	imageFile,
}: {
	imageFile: File;
}): Promise<{ thumbnailUrl: string; width: number; height: number }> {
	const makeThumbnail = (image: CanvasImageSource, width: number, height: number) => {
		const scale = Math.min(1, 720 / width, 405 / height);
		const thumbnailUrl = renderThumbnailDataUrl({
			width: Math.max(1, Math.round(width * scale)),
			height: Math.max(1, Math.round(height * scale)),
			draw: ({ context, width: targetWidth, height: targetHeight }) => {
				context.drawImage(image, 0, 0, targetWidth, targetHeight);
			},
		});
		return { thumbnailUrl, width, height };
	};

	if (typeof createImageBitmap === "function") {
		try {
			const bitmap = await createImageBitmap(imageFile);
			try {
				return makeThumbnail(bitmap, bitmap.width, bitmap.height);
			} finally {
				bitmap.close();
			}
		} catch {
			// Some image formats need the classic browser image decoder.
		}
	}

	return new Promise((resolve, reject) => {
		const image = new window.Image();
		const objectUrl = URL.createObjectURL(imageFile);
		const cleanup = () => {
			URL.revokeObjectURL(objectUrl);
			image.remove();
		};
		image.addEventListener("load", () => {
			try {
				resolve(makeThumbnail(image, image.naturalWidth, image.naturalHeight));
			} catch (error) {
				reject(error);
			} finally {
				cleanup();
			}
		}, { once: true });
		image.addEventListener("error", () => {
			cleanup();
			reject(new Error("Could not load image"));
		}, { once: true });
		image.src = objectUrl;
	});
}

export async function processMediaAssets({
	files,
	onProgress,
}: {
	files: FileList | File[];
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<ProcessedMediaAsset[]> {
	const fileArray = Array.from(files);
	if (!fileArray.length) return [];
	const total = fileArray.length;
	const processedAssets: Array<ProcessedMediaAsset | undefined> = new Array(total);
	let completed = 0;
	let lastReportedProgress = -1;
	// Two concurrent image decoders give the low-power Intel/HDD computer
	// responsiveness without thrashing memory. Complex video/audio stays serial.
	const imageOnly = fileArray.every((file) => getMediaTypeFromFile({ file }) === "image");
	const concurrency = imageOnly ? Math.min(2, total) : 1;
	let cursor = 0;

	const processOne = async (file: File, index: number) => {
		const fileType = getMediaTypeFromFile({ file });

		if (!fileType) {
			toast.error(`Unsupported file type: ${file.name}`);
			return;
		}

		const storageCheck = await storageService.canStoreFile({
			size: file.size,
		});

		if (!storageCheck.canStore) {
			toast.error(`Not enough browser storage for ${file.name}`, {
				description: getStorageLimitDescription({
					fileSize: file.size,
					availableBytes: storageCheck.availableBytes,
				}),
			});
			return;
		}

		const url = URL.createObjectURL(file);
		let thumbnailUrl: string | undefined;
		let duration: number | undefined;
		let width: number | undefined;
		let height: number | undefined;
		let fps: number | undefined;
		let hasAudio: boolean | undefined;

		try {
			if (fileType === "image") {
				const result = await generateImageThumbnail({ imageFile: file });
				thumbnailUrl = result.thumbnailUrl;
				width = result.width;
				height = result.height;
			} else if (fileType === "video") {
				try {
					const videoData = await readVideoFile({ file });
					duration = videoData.duration;
					width = videoData.width;
					height = videoData.height;
					fps = Number.isFinite(videoData.fps)
						? Math.round(videoData.fps)
						: undefined;
					hasAudio = videoData.hasAudio;
					thumbnailUrl = videoData.thumbnailUrl ?? undefined;

					if (!videoData.canDecode) {
						toast.error(`Can't preview ${file.name}`, {
							description: getUnsupportedVideoDescription({
								codec: videoData.codec,
							}),
						});
					}
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Could not process video";

					toast.error(`Couldn't process ${file.name}`, {
						description: message,
					});
				}
			} else if (fileType === "audio") {
				duration = await getMediaDuration({ file });
			}

			processedAssets[index] = {
				name: file.name,
				type: fileType,
				file,
				url,
				thumbnailUrl,
				duration,
				width,
				height,
				fps,
				hasAudio,
			};


		} catch (error) {
			console.error("Error processing file:", file.name, error);
			toast.error(`Failed to process ${file.name}`);
			URL.revokeObjectURL(url);
		}
	};

	const workers = Array.from({ length: concurrency }, async () => {
		while (cursor < total) {
			const index = cursor++;
			try {
				await processOne(fileArray[index], index);
			} finally {
				completed += 1;
				// Progress UI displays whole percentages. Avoid hundreds of duplicate
				// state updates during large folder imports (same accurate 0–100%).
				const percentage = Math.round((completed / total) * 100);
				if (percentage !== lastReportedProgress) {
					lastReportedProgress = percentage;
					onProgress?.({ progress: percentage });
				}
				// Let the UI render periodically during very large folder imports.
				if (completed % 10 === 0) {
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
				}
			}
		}
	});
	await Promise.all(workers);
	return processedAssets.filter((item): item is ProcessedMediaAsset => item !== undefined);
}

const getMediaDuration = ({ file }: { file: File }): Promise<number> => {
	return new Promise((resolve, reject) => {
		const element = document.createElement(
			file.type.startsWith("video/") ? "video" : "audio",
		) as HTMLVideoElement;
		const objectUrl = URL.createObjectURL(file);

		element.addEventListener("loadedmetadata", () => {
			resolve(element.duration);
			URL.revokeObjectURL(objectUrl);
			element.remove();
		});

		element.addEventListener("error", () => {
			reject(new Error("Could not load media"));
			URL.revokeObjectURL(objectUrl);
			element.remove();
		});

		element.src = objectUrl;
		element.load();
	});
};
