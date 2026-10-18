import type { EditorCore } from "@/core";
import type {
	TProject,
	TProjectMetadata,
	TProjectSortKey,
	TProjectSortOption,
	TProjectSettings,
	TTimelineViewState,
} from "@/project/types";
import type { ExportOptions, ExportResult, ExportState } from "@/export";
import { storageService } from "@/services/storage/service";
import { toast } from "sonner";
import { generateUUID } from "@/utils/id";
import { UpdateProjectSettingsCommand } from "@/commands/project";
import { DEFAULT_BACKGROUND_COLOR } from "@/background/color";
import { DEFAULT_CANVAS_SIZE } from "@/canvas/sizes";
import { DEFAULT_FPS } from "@/fps/defaults";
import { buildDefaultScene, getProjectDurationFromScenes } from "@/timeline/scenes";
import { buildScene } from "@/services/renderer/scene-builder";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import {
	CURRENT_PROJECT_VERSION,
	migrations,
	runStorageMigrations,
	type MigrationProgress,
} from "@/services/storage/migrations";
import { loadFonts } from "@/fonts/google-fonts";
import { DEFAULTS } from "@/timeline/defaults";
import { getElementFontFamilies } from "@/timeline/element-utils";
import { getRaisedProjectFpsForImportedMedia } from "@/fps/utils";
import type { MediaAsset } from "@/media/types";
import { chooseProjectCover } from "@/project/cover-utils";
import { mediaTimeFromSeconds } from "@/wasm";

// Home cards are 16:9 and only need 640x360 JPEGs; avoid full-size PNGs.
const COVER_WIDTH = 640;
const COVER_HEIGHT = 360;

function paintCover(
	ctx: CanvasRenderingContext2D,
	source: CanvasImageSource,
	width: number,
	height: number,
) {
	const sourceRatio = width / height;
	const coverRatio = COVER_WIDTH / COVER_HEIGHT;
	const sw = sourceRatio > coverRatio ? height * coverRatio : width;
	const sh = sourceRatio > coverRatio ? height : width / coverRatio;
	ctx.drawImage(
		source,
		Math.max(0, (width - sw) / 2),
		Math.max(0, (height - sh) / 2),
		sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT,
	);
}

async function decodeCoverImage(source: string): Promise<HTMLImageElement> {
	return await new Promise((resolve, reject) => {
		const image = new Image();
		const timer = setTimeout(() => reject(new Error("Cover decode timeout")), 10000);
		image.onload = () => { clearTimeout(timer); resolve(image); };
		image.onerror = () => { clearTimeout(timer); reject(new Error("Invalid cover image")); };
		image.src = source;
	});
}

async function coverFromMediaAsset(asset: MediaAsset): Promise<string | null> {
	const canvas = document.createElement("canvas");
	canvas.width = COVER_WIDTH;
	canvas.height = COVER_HEIGHT;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const isTemporaryUrl = !asset.url;
	const url = asset.url ?? URL.createObjectURL(asset.file);
	try {
		if (asset.type === "image") {
			if (typeof createImageBitmap === "function") {
				try {
					const bitmap = await createImageBitmap(asset.file);
					try {
						paintCover(ctx, bitmap, bitmap.width, bitmap.height);
						return canvas.toDataURL("image/jpeg", 0.82);
					} finally {
						bitmap.close();
					}
				} catch { /* SVGs and uncommon image formats use HTMLImageElement. */ }
			}
			const image = await decodeCoverImage(url);
			paintCover(ctx, image, image.naturalWidth, image.naturalHeight);
			return canvas.toDataURL("image/jpeg", 0.82);
		}
		if (asset.type === "video") {
			const poster = asset.thumbnailUrl;
			if (poster?.startsWith("data:image/")) {
				const image = await decodeCoverImage(poster);
				paintCover(ctx, image, image.naturalWidth, image.naturalHeight);
				return canvas.toDataURL("image/jpeg", 0.82);
			}
			const video = document.createElement("video");
			video.preload = "auto";
			video.muted = true;
			video.playsInline = true;
			video.src = url;
			try {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error("Video frame timeout")), 10000);
					const settle = (ok: boolean) => {
						clearTimeout(timer);
						video.removeEventListener("loadeddata", onData);
						video.removeEventListener("error", onError);
						if (ok) resolve();
						else reject(new Error("Video frame unavailable"));
					};
					const onData = () => settle(true);
					const onError = () => settle(false);
					video.addEventListener("loadeddata", onData);
					video.addEventListener("error", onError);
					video.load();
				});
				if (video.videoWidth && video.videoHeight) {
					paintCover(ctx, video, video.videoWidth, video.videoHeight);
					return canvas.toDataURL("image/jpeg", 0.82);
				}
			} finally {
				video.pause();
				video.removeAttribute("src");
				video.load();
			}
		}
		return null;
	} catch (error) {
		console.warn("DarkCut could not create media cover:", error);
		return null;
	} finally {
		if (isTemporaryUrl) URL.revokeObjectURL(url);
	}
}

/** Detect legacy covers generated from an empty timeline at second zero. */
async function isEmptyCover(thumbnail: string | undefined): Promise<boolean> {
	if (!thumbnail) return true;
	if (!thumbnail.startsWith("data:image/")) return false;
	try {
		const image = await decodeCoverImage(thumbnail);
		const canvas = document.createElement("canvas");
		canvas.width = 16; canvas.height = 9;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return false;
		ctx.drawImage(image, 0, 0, 16, 9);
		const pixels = ctx.getImageData(0, 0, 16, 9).data;
		let min = 255; let max = 0; let average = 0;
		for (let i = 0; i < pixels.length; i += 4) {
			const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
			min = Math.min(min, brightness);
			max = Math.max(max, brightness);
			average += brightness;
		}
		average /= pixels.length / 4;
		return average < 26 && max - min < 14;
	} catch {
		return true;
	}
}

export interface MigrationState {
	isMigrating: boolean;
	fromVersion: number | null;
	toVersion: number | null;
	projectName: string | null;
}

export class ProjectManager {
	private active: TProject | null = null;
	private savedProjects: TProjectMetadata[] = [];
	private isLoading = true;
	private isInitialized = false;
	private invalidProjectIds = new Set<string>();
	private storageMigrationPromise: Promise<void> | null = null;
	private listeners = new Set<() => void>();
	private migrationState: MigrationState = {
		isMigrating: false,
		fromVersion: null,
		toVersion: null,
		projectName: null,
	};
	private exportState: ExportState = {
		isExporting: false,
		progress: 0,
		result: null,
	};
	private exportCancelRequested = false;

	constructor(private editor: EditorCore) {}

	private async ensureStorageMigrations(): Promise<void> {
		if (this.storageMigrationPromise) {
			await this.storageMigrationPromise;
			return;
		}

		this.storageMigrationPromise = (async () => {
			await runStorageMigrations({
				migrations,
				onProgress: (progress: MigrationProgress) => {
					this.migrationState = progress;
					this.notify();
				},
			});
		})();

		await this.storageMigrationPromise;
	}

	async createNewProject({ name }: { name: string }): Promise<string> {
		const mainScene = buildDefaultScene({ name: "Main scene", isMain: true });
		const newProject: TProject = {
			metadata: {
				id: generateUUID(),
				name,
				duration: getProjectDurationFromScenes({ scenes: [mainScene] }),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			scenes: [mainScene],
			currentSceneId: mainScene.id,
			settings: {
				fps: DEFAULT_FPS,
				canvasSize: DEFAULT_CANVAS_SIZE,
				canvasSizeMode: "preset",
				lastCustomCanvasSize: null,
				originalCanvasSize: null,
				background: {
					type: "color",
					color: DEFAULT_BACKGROUND_COLOR,
				},
			},
			version: CURRENT_PROJECT_VERSION,
		};

		this.active = newProject;
		this.notify();

		this.editor.media.clearAllAssets();
		this.editor.scenes.initializeScenes({
			scenes: newProject.scenes,
			currentSceneId: newProject.currentSceneId,
		});

		try {
			await storageService.saveProject({ project: newProject });
			this.updateMetadata(newProject);

			return newProject.metadata.id;
		} catch (error) {
			toast.error("Failed to save new project");
			throw error;
		}
	}

	async loadProject({ id }: { id: string }): Promise<void> {
		if (!this.isInitialized) {
			this.isLoading = true;
			this.notify();
		}

		this.editor.save.pause();
		await this.ensureStorageMigrations();
		this.editor.media.clearAllAssets();
		this.editor.scenes.clearScenes();

		try {
			const result = await storageService.loadProject({ id });
			if (!result) {
				throw new Error(`Project with id ${id} not found`);
			}

			const project = result.project;

			this.active = project;
			this.notify();

			if (project.scenes && project.scenes.length > 0) {
				this.editor.scenes.initializeScenes({
					scenes: project.scenes,
					currentSceneId: project.currentSceneId,
				});
			}

			await this.editor.media.loadProjectMedia({ projectId: id });

			await loadFonts({
				families: [
					...new Set(
						(project.scenes ?? []).flatMap((scene) =>
							getElementFontFamilies({ tracks: scene.tracks }),
						),
					),
				],
			});

			if (!project.metadata.thumbnail) {
				try {
					const didUpdateThumbnail = await this.updateThumbnailFromTimeline();
					if (didUpdateThumbnail) {
						await this.saveCurrentProject();
					}
				} catch (error) {
					console.error("Failed to generate project thumbnail:", error);
				}
			}
		} catch (error) {
			console.error("Failed to load project:", error);
			throw error;
		} finally {
			this.isLoading = false;
			this.notify();
			this.editor.save.resume();
		}
	}

	async saveCurrentProject(): Promise<void> {
		if (!this.active) return;

		try {
			const scenes = this.editor.scenes.getScenes();
			const updatedProject = {
				...this.active,
				scenes,
				metadata: {
					...this.active.metadata,
					duration: getProjectDurationFromScenes({ scenes }),
					updatedAt: new Date(),
				},
			};

			await storageService.saveProject({ project: updatedProject });
			this.active = updatedProject;
			this.updateMetadata(updatedProject);
		} catch (error) {
			console.error("Failed to save project:", error);
		}
	}

	async export({ options }: { options: ExportOptions }): Promise<ExportResult> {
		this.exportCancelRequested = false;
		this.exportState = { isExporting: true, progress: 0, result: null };
		this.notify();

		const result = await this.editor.renderer.exportProject({
			options,
			onProgress: ({ progress }) => {
				this.exportState = { ...this.exportState, progress };
				this.notify();
			},
			onCancel: () => this.exportCancelRequested,
		});

		this.exportState = {
			isExporting: false,
			progress: this.exportState.progress,
			result,
		};
		this.notify();

		return result;
	}

	cancelExport(): void {
		this.exportCancelRequested = true;
	}

	clearExportState(): void {
		this.exportState = { isExporting: false, progress: 0, result: null };
		this.notify();
	}

	getExportState(): ExportState {
		return this.exportState;
	}

	async loadAllProjects(): Promise<void> {
		if (!this.isInitialized) {
			this.isLoading = true;
			this.notify();
		}

		try {
			await this.ensureStorageMigrations();
			try {
				const metadata = await storageService.loadAllProjectsMetadata();
				this.savedProjects = metadata;
				this.notify();
				// Repair old black covers in the background, without blocking Home.
				void this.repairLegacyProjectCovers();
			} catch (error) {
				console.error("Failed to load projects:", error);
			} finally {
				this.isLoading = false;
				this.isInitialized = true;
				this.notify();
			}
		} catch (error) {
			console.error("Failed to run migrations:", error);
			this.isLoading = false;
			this.isInitialized = true;
			this.notify();
		}
	}

	async deleteProjects({ ids }: { ids: string[] }): Promise<void> {
		const uniqueIds = Array.from(new Set(ids));
		if (uniqueIds.length === 0) return;

		try {
			await Promise.all(
				uniqueIds.map((id) =>
					Promise.all([
						storageService.deleteProjectMedia({ projectId: id }),
						storageService.deleteProject({ id }),
					]),
				),
			);

			const idSet = new Set(uniqueIds);
			this.savedProjects = this.savedProjects.filter(
				(project) => !idSet.has(project.id),
			);

			const shouldClearActive =
				this.active && idSet.has(this.active.metadata.id);

			if (shouldClearActive) {
				this.active = null;
				this.editor.media.clearAllAssets();
				this.editor.scenes.clearScenes();
			}

			this.notify();
		} catch (error) {
			console.error("Failed to delete projects:", error);
		}
	}

	closeProject(): void {
		this.active = null;
		this.notify();

		this.editor.media.clearAllAssets();
		this.editor.scenes.clearScenes();
	}

	async renameProject({
		id,
		name,
	}: {
		id: string;
		name: string;
	}): Promise<void> {
		try {
			const result = await storageService.loadProject({ id });
			if (!result) {
				toast.error("Project not found", {
					description: "Please try again",
				});
				return;
			}

			const updatedProject: TProject = {
				...result.project,
				metadata: {
					...result.project.metadata,
					name,
					updatedAt: new Date(),
				},
			};

			await storageService.saveProject({ project: updatedProject });

			if (this.active?.metadata.id === id) {
				this.active = updatedProject;
				this.notify();
			}

			this.updateMetadata(updatedProject);
		} catch (error) {
			console.error("Failed to rename project:", error);
			toast.error("Failed to rename project", {
				description:
					error instanceof Error ? error.message : "Please try again",
			});
		}
	}

	async duplicateProjects({ ids }: { ids: string[] }): Promise<string[]> {
		const uniqueIds = Array.from(new Set(ids));
		if (uniqueIds.length === 0) return [];

		try {
			const getDuplicateBaseName = ({ name }: { name: string }) => {
				const match = name.match(/^\((\d+)\)\s+(.+)$/);
				const number = match ? Number.parseInt(match[1], 10) : null;
				const baseName = match ? match[2] : name;
				return { baseName, number };
			};

			const loadResults = await Promise.all(
				uniqueIds.map(async (projectId) => {
					const result = await storageService.loadProject({ id: projectId });
					return { projectId, project: result?.project ?? null };
				}),
			);

			const missingProjectIds = loadResults
				.filter((result) => !result.project)
				.map((result) => result.projectId);

			if (missingProjectIds.length > 0) {
				toast.error(
					missingProjectIds.length === 1
						? "Project not found"
						: "Projects not found",
					{
						description:
							missingProjectIds.length === 1
								? "Please try again"
								: "Some projects could not be found",
					},
				);
				throw new Error(`Projects not found: ${missingProjectIds.join(", ")}`);
			}

			const projectsToDuplicate = loadResults.flatMap((result) =>
				result.project ? [result.project] : [],
			);

			const maxNumberByBaseName = new Map<string, number>();

			for (const project of this.savedProjects) {
				const { baseName, number } = getDuplicateBaseName({
					name: project.name,
				});

				if (number === null) continue;

				const currentMax = maxNumberByBaseName.get(baseName);
				if (currentMax === undefined || number > currentMax) {
					maxNumberByBaseName.set(baseName, number);
				}
			}

			const nextNumberByBaseName = new Map<string, number>();
			for (const [baseName, maxNumber] of maxNumberByBaseName) {
				nextNumberByBaseName.set(baseName, maxNumber + 1);
			}

			const duplicationPlans = projectsToDuplicate.map((project) => {
				const { baseName } = getDuplicateBaseName({
					name: project.metadata.name,
				});
				const nextNumber = nextNumberByBaseName.get(baseName) ?? 1;
				nextNumberByBaseName.set(baseName, nextNumber + 1);

				const newProjectId = generateUUID();
				const newProject: TProject = {
					...project,
					metadata: {
						...project.metadata,
						id: newProjectId,
						name: `(${nextNumber}) ${baseName}`,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				};

				return {
					newProjectId,
					newProject,
					sourceProjectId: project.metadata.id,
				};
			});

			await Promise.all(
				duplicationPlans.map(({ newProject }) =>
					storageService.saveProject({ project: newProject }),
				),
			);

			await Promise.all(
				duplicationPlans.map(async ({ sourceProjectId, newProjectId }) => {
					const sourceMediaAssets = await storageService.loadAllMediaAssets({
						projectId: sourceProjectId,
					});

					await Promise.all(
						sourceMediaAssets.map((mediaAsset) =>
							storageService.saveMediaAsset({
								projectId: newProjectId,
								mediaAsset,
							}),
						),
					);
				}),
			);

			for (const { newProject } of duplicationPlans) {
				this.updateMetadata(newProject);
			}

			return duplicationPlans.map((plan) => plan.newProjectId);
		} catch (error) {
			console.error("Failed to duplicate projects:", error);
			toast.error("Failed to duplicate projects", {
				description:
					error instanceof Error ? error.message : "Please try again",
			});
			throw error;
		}
	}

	async updateSettings({
		settings,
		pushHistory = true,
	}: {
		settings: Partial<TProjectSettings>;
		pushHistory?: boolean;
	}): Promise<void> {
		if (!this.active) return;

		const command = new UpdateProjectSettingsCommand(settings);
		if (pushHistory) {
			this.editor.command.execute({ command });
			return;
		}

		command.execute();
	}

	ratchetFpsForImportedMedia({
		importedAssets,
	}: {
		importedAssets: Array<Pick<MediaAsset, "type" | "fps">>;
	}): import("opencut-wasm").FrameRate | null {
		if (!this.active) return null;

		const nextFps = getRaisedProjectFpsForImportedMedia({
			currentFps: this.active.settings.fps,
			importedAssets,
		});
		if (nextFps === null) return null;

		new UpdateProjectSettingsCommand({ fps: nextFps }).execute();
		return nextFps;
	}

	async updateThumbnail({ thumbnail }: { thumbnail: string }): Promise<void> {
		if (!this.active) return;

		const updatedProject: TProject = {
			...this.active,
			metadata: { ...this.active.metadata, thumbnail, updatedAt: new Date() },
		};
		this.active = updatedProject;
		this.notify();
		this.updateMetadata(updatedProject);
		this.editor.save.markDirty();
	}

	async prepareExit(): Promise<void> {
		if (!this.active) return;

		try {
			const didUpdateThumbnail = await this.updateThumbnailFromTimeline();
			if (didUpdateThumbnail) {
				await this.editor.save.flush();
			}
		} catch (error) {
			console.error("Failed to generate project thumbnail on exit:", error);
		}
	}

	getFilteredAndSortedProjects({
		searchQuery,
		sortOption,
	}: {
		searchQuery: string;
		sortOption: TProjectSortOption;
	}): TProjectMetadata[] {
		const filteredProjects = this.savedProjects.filter((project) =>
			project.name.toLowerCase().includes(searchQuery.toLowerCase()),
		);

		const [key, order] = sortOption.split("-") as [
			TProjectSortKey,
			"asc" | "desc",
		];

		const sortedProjects = [...filteredProjects].sort((a, b) => {
			const aValue = a[key];
			const bValue = b[key];

			if (order === "asc") {
				if (aValue < bValue) return -1;
				if (aValue > bValue) return 1;
				return 0;
			}
			if (aValue > bValue) return -1;
			if (aValue < bValue) return 1;
			return 0;
		});

		return sortedProjects;
	}

	isInvalidProjectId({ id }: { id: string }): boolean {
		return this.invalidProjectIds.has(id);
	}

	markProjectIdAsInvalid({ id }: { id: string }): void {
		this.invalidProjectIds.add(id);
		this.notify();
	}

	clearInvalidProjectIds(): void {
		this.invalidProjectIds.clear();
		this.notify();
	}

	getActive(): TProject {
		if (!this.active) {
			throw new Error("No active project");
		}
		return this.active;
	}

	/**
	 * for agents:
	 * in most cases, the project is guaranteed to be active, in which getActive() should be used instead.
	 * for very rare cases, this function may be used.
	 */
	getActiveOrNull(): TProject | null {
		return this.active;
	}

	getTimelineViewState(): TTimelineViewState {
		return this.active?.timelineViewState ?? DEFAULTS.timeline.viewState;
	}

	setTimelineViewState({ viewState }: { viewState: TTimelineViewState }): void {
		if (!this.active) return;
		this.active = {
			...this.active,
			timelineViewState: viewState ?? undefined,
		};
		this.editor.save.markDirty();
		this.notify();
	}

	getSavedProjects(): TProjectMetadata[] {
		return this.savedProjects;
	}

	getIsLoading(): boolean {
		return this.isLoading;
	}

	getIsInitialized(): boolean {
		return this.isInitialized;
	}

	getMigrationState(): MigrationState {
		return this.migrationState;
	}

	setActiveProject({ project }: { project: TProject }): void {
		this.active = project;
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async updateThumbnailFromTimeline(): Promise<boolean> {
		if (!this.active) return false;

		const tracks = this.editor.scenes.getActiveScene().tracks;
		const mediaAssets = this.editor.media.getAssets();
		const cover = chooseProjectCover(
			[this.editor.scenes.getActiveScene()],
			mediaAssets,
		);
		// Never overwrite a meaningful project cover with a blank frame.
		if (!cover) return false;
		const media = mediaAssets.find((asset) => asset.id === cover.mediaId);
		if (media) {
			const coverImage = await coverFromMediaAsset(media);
			if (coverImage) {
				await this.updateThumbnail({ thumbnail: coverImage });
				return true;
			}
		}

		const duration = this.editor.timeline.getTotalDuration();
		const { canvasSize, background } = this.active.settings;
		const scene = buildScene({
			tracks,
			mediaAssets,
			duration: duration || 1,
			canvasSize,
			background,
		});

		const renderer = new CanvasRenderer({
			width: canvasSize.width,
			height: canvasSize.height,
			fps: this.active.settings.fps,
		});

		// Project cards only need a small cover. Avoid saving full-resolution
		// PNG data URLs in project metadata: they slow down HDD reads and startup.
		const scale = Math.min(1, 640 / canvasSize.width, 360 / canvasSize.height);
		const tempCanvas = document.createElement("canvas");
		tempCanvas.width = Math.max(1, Math.round(canvasSize.width * scale));
		tempCanvas.height = Math.max(1, Math.round(canvasSize.height * scale));

		await renderer.renderToCanvas({
			node: scene,
			time: mediaTimeFromSeconds({ seconds: cover.startTime + 0.15 }),
			targetCanvas: tempCanvas,
		});

		const thumbnailDataUrl = tempCanvas.toDataURL("image/jpeg", 0.78);

		await this.updateThumbnail({ thumbnail: thumbnailDataUrl });
		return true;
	}

	/**
	 * Existing installations may contain black JPEG metadata thumbnails.
	 * Read only the first matching visual asset and do not touch the timeline.
	 */
	private async repairLegacyProjectCovers(): Promise<void> {
		for (const metadata of this.savedProjects.slice(0, 60)) {
			try {
				if (!(await isEmptyCover(metadata.thumbnail))) continue;
				const result = await storageService.loadProject({ id: metadata.id });
				if (!result?.project) continue;
				const { project } = result;
				const references = project.scenes.flatMap((scene) =>
					[scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
						track.type !== "video" || track.hidden ? [] :
						track.elements.filter((el) =>
							(el.type === "image" || el.type === "video") && !el.hidden,
						).map((el) => ({
							id: el.mediaId,
							type: el.type,
						})),
					),
				);
				const candidate = chooseProjectCover(project.scenes, references);
				if (!candidate) continue;
				const asset = await storageService.loadMediaAsset({
					projectId: metadata.id,
					id: candidate.mediaId,
				});
				if (!asset) continue;
				let cover: string | null = null;
				try {
					cover = await coverFromMediaAsset(asset);
				} finally {
					if (asset.url?.startsWith("blob:")) URL.revokeObjectURL(asset.url);
				}
				if (!cover) continue;
				// A project could have been opened while we were repairing Home.
				if (this.active?.metadata.id === metadata.id) continue;
				const updated: TProject = {
					...project,
					metadata: { ...project.metadata, thumbnail: cover },
				};
				await storageService.saveProject({ project: updated });
				this.updateMetadata(updated);
			} catch (error) {
				console.warn("Failed to repair an older DarkCut project cover:", error);
			}
		}
	}

	private updateMetadata(project: TProject): void {
		const index = this.savedProjects.findIndex(
			(p) => p.id === project.metadata.id,
		);

		if (index !== -1) {
			this.savedProjects = this.savedProjects.with(index, project.metadata);
		} else {
			this.savedProjects = [project.metadata, ...this.savedProjects];
		}

		this.notify();
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
