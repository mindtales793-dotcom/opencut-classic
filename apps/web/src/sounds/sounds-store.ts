import { useDarkCutTasks } from "@/darkcut/tasks";
import { create } from "zustand";
import type { SoundEffect, SavedSound } from "@/sounds/types";
import { storageService } from "@/services/storage/service";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";
import { stopSoundPreview } from "@/sounds/use-sound-preview";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";

function getOrCreateDarkCutAudioTrack({
	editor,
	name,
}: {
	editor: EditorCore;
	name: string;
}) {
	const scene = editor.scenes.getActiveScene();
	const existing = scene.tracks.audio.find((track) => track.name === name);
	if (existing) return existing.id;
	return editor.timeline.addTrack({ type: "audio", name });
}

interface SoundsStore {
	topSoundEffects: SoundEffect[];
	isLoading: boolean;
	error: string | null;
	hasLoaded: boolean;
	showCommercialOnly: boolean;
	toggleCommercialFilter: () => void;
	searchQuery: string;
	searchResults: SoundEffect[];
	isSearching: boolean;
	searchError: string | null;
	lastSearchQuery: string;
	scrollPosition: number;
	currentPage: number;
	hasNextPage: boolean;
	totalCount: number;
	isLoadingMore: boolean;
	savedSounds: SavedSound[];
	isSavedSoundsLoaded: boolean;
	isLoadingSavedSounds: boolean;
	savedSoundsError: string | null;

	addSoundToTimeline: ({ sound, startSeconds, maxDurationSeconds, volumeDb, trackName }: {
		sound: SoundEffect;
		startSeconds?: number;
		maxDurationSeconds?: number;
		volumeDb?: number;
		trackName?: string;
	}) => Promise<boolean>;
	setTopSoundEffects: ({ sounds }: { sounds: SoundEffect[] }) => void;
	setLoading: ({ loading }: { loading: boolean }) => void;
	setError: ({ error }: { error: string | null }) => void;
	setHasLoaded: ({ loaded }: { loaded: boolean }) => void;
	setSearchQuery: ({ query }: { query: string }) => void;
	setSearchResults: ({ results }: { results: SoundEffect[] }) => void;
	setSearching: ({ searching }: { searching: boolean }) => void;
	setSearchError: ({ error }: { error: string | null }) => void;
	setLastSearchQuery: ({ query }: { query: string }) => void;
	setScrollPosition: ({ position }: { position: number }) => void;
	setCurrentPage: ({ page }: { page: number }) => void;
	setHasNextPage: ({ hasNext }: { hasNext: boolean }) => void;
	setTotalCount: ({ count }: { count: number }) => void;
	setLoadingMore: ({ loading }: { loading: boolean }) => void;
	appendSearchResults: ({ results }: { results: SoundEffect[] }) => void;
	appendTopSounds: ({ results }: { results: SoundEffect[] }) => void;
	resetPagination: () => void;
	loadSavedSounds: () => Promise<void>;
	saveSoundEffect: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	removeSavedSound: ({ soundId }: { soundId: number }) => Promise<void>;
	isSoundSaved: ({ soundId }: { soundId: number }) => boolean;
	toggleSavedSound: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	clearSavedSounds: () => Promise<void>;
}

export const useSoundsStore = create<SoundsStore>((set, get) => ({
	topSoundEffects: [],
	isLoading: false,
	error: null,
	hasLoaded: false,
	showCommercialOnly: true,

	toggleCommercialFilter: () => {
		set((state) => ({ showCommercialOnly: !state.showCommercialOnly }));
	},

	searchQuery: "",
	searchResults: [],
	isSearching: false,
	searchError: null,
	lastSearchQuery: "",
	scrollPosition: 0,
	currentPage: 1,
	hasNextPage: false,
	totalCount: 0,
	isLoadingMore: false,
	savedSounds: [],
	isSavedSoundsLoaded: false,
	isLoadingSavedSounds: false,
	savedSoundsError: null,

	setTopSoundEffects: ({ sounds }) => set({ topSoundEffects: sounds }),
	setLoading: ({ loading }) => set({ isLoading: loading }),
	setError: ({ error }) => set({ error }),
	setHasLoaded: ({ loaded }) => set({ hasLoaded: loaded }),
	setSearchQuery: ({ query }) => set({ searchQuery: query }),
	setSearchResults: ({ results }) =>
		set({ searchResults: results, currentPage: 1 }),
	setSearching: ({ searching }) => set({ isSearching: searching }),
	setSearchError: ({ error }) => set({ searchError: error }),
	setLastSearchQuery: ({ query }) => set({ lastSearchQuery: query }),
	setScrollPosition: ({ position }) => set({ scrollPosition: position }),
	setCurrentPage: ({ page }) => set({ currentPage: page }),
	setHasNextPage: ({ hasNext }) => set({ hasNextPage: hasNext }),
	setTotalCount: ({ count }) => set({ totalCount: count }),
	setLoadingMore: ({ loading }) => set({ isLoadingMore: loading }),

	appendSearchResults: ({ results }) =>
		set((state) => ({
			searchResults: [...state.searchResults, ...results],
		})),

	appendTopSounds: ({ results }) =>
		set((state) => ({
			topSoundEffects: [...state.topSoundEffects, ...results],
		})),

	resetPagination: () =>
		set({
			currentPage: 1,
			hasNextPage: false,
			totalCount: 0,
			isLoadingMore: false,
		}),

	loadSavedSounds: async () => {
		if (get().isSavedSoundsLoaded) return;

		try {
			set({ isLoadingSavedSounds: true, savedSoundsError: null });
			const savedSoundsData = await storageService.loadSavedSounds();
			set({
				savedSounds: savedSoundsData.sounds,
				isSavedSoundsLoaded: true,
				isLoadingSavedSounds: false,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to load saved sounds";
			set({
				savedSoundsError: errorMessage,
				isLoadingSavedSounds: false,
			});
			console.error("Failed to load saved sounds:", error);
		}
	},

	saveSoundEffect: async ({ soundEffect }) => {
		const previous = get().savedSounds;
		const optimistic: SavedSound = {
			id: soundEffect.id,
			name: soundEffect.name,
			username: soundEffect.username,
			previewUrl: soundEffect.previewUrl,
			downloadUrl: soundEffect.downloadUrl,
			duration: soundEffect.duration,
			tags: soundEffect.tags,
			license: soundEffect.license,
			savedAt: new Date().toISOString(),
		};

		if (!previous.some((sound) => sound.id === soundEffect.id)) {
			set({
				savedSounds: [...previous, optimistic],
				savedSoundsError: null,
			});
		}

		try {
			await storageService.saveSoundEffect({ soundEffect });
			const savedSoundsData = await storageService.loadSavedSounds();
			set({
				savedSounds: savedSoundsData.sounds,
				isSavedSoundsLoaded: true,
				savedSoundsError: null,
			});
			toast.success("Música salva nos Favoritos.");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Falha ao salvar favorito";
			set({
				savedSounds: previous,
				savedSoundsError: errorMessage,
			});
			toast.error("Não foi possível salvar nos Favoritos.");
			console.error("Failed to save sound:", error);
		}
	},

	removeSavedSound: async ({ soundId }) => {
		const previous = get().savedSounds;
		set({
			savedSounds: previous.filter((sound) => sound.id !== soundId),
			savedSoundsError: null,
		});

		try {
			await storageService.removeSavedSound({ soundId });
			toast.success("Removido dos Favoritos.");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Falha ao remover favorito";
			set({
				savedSounds: previous,
				savedSoundsError: errorMessage,
			});
			toast.error("Não foi possível remover dos Favoritos.");
			console.error("Failed to remove sound:", error);
		}
	},

	isSoundSaved: ({ soundId }) => {
		const { savedSounds } = get();
		return savedSounds.some((sound) => sound.id === soundId);
	},

	toggleSavedSound: async ({ soundEffect }) => {
		const { isSoundSaved, saveSoundEffect, removeSavedSound } = get();

		if (isSoundSaved({ soundId: soundEffect.id })) {
			await removeSavedSound({ soundId: soundEffect.id });
		} else {
			await saveSoundEffect({ soundEffect });
		}
	},

	clearSavedSounds: async () => {
		try {
			await storageService.clearSavedSounds();
			set({
				savedSounds: [],
				savedSoundsError: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to clear saved sounds";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to clear saved sounds");
			console.error("Failed to clear saved sounds:", error);
		}
	},

	addSoundToTimeline: async ({ sound, startSeconds, maxDurationSeconds, volumeDb, trackName }) => {
		const audioUrl = sound.downloadUrl || sound.previewUrl;
		if (!audioUrl) {
			toast.error("Áudio indisponível.");
			return false;
		}

		const projectId = EditorCore.getInstance().project.getActive().metadata.id;
		const task = (status: "running" | "done" | "error", detail: string) =>
			useDarkCutTasks
				.getState()
				.set(`sound-${sound.id}`, {
					projectId,
					label: sound.name,
					tab: "sounds",
					status,
					detail,
				});
		task("running", "Baixando áudio…");
		try {
			const editor = EditorCore.getInstance();
			const currentTime = Number.isFinite(startSeconds)
				? mediaTimeFromSeconds({ seconds: Math.max(0, startSeconds ?? 0) })
				: editor.playback.getCurrentTime();
			const isBackgroundMusic = sound.tags?.some(
				(tag) =>
					tag.toLowerCase() === "jamendo" || tag.toLowerCase() === "music",
			);
			const destinationTrackName = trackName || (isBackgroundMusic
				? "A2 • Música de fundo"
				: "A3 • Efeitos sonoros");

			const sceneId = editor.scenes.getActiveScene().id;
			stopSoundPreview();
			toast.loading("Baixando e preparando áudio…", {
				id: `sound-${sound.id}`,
			});
			const response = await fetch(audioUrl, {
				signal: AbortSignal.timeout(90000),
			});
			if (!response.ok) {
				const detail = await response.json().catch(() => null);
				throw new Error(
					detail?.error || `Falha ao carregar áudio: ${response.status}`,
				);
			}
			const type = response.headers.get("content-type") || "";
			if (type.includes("json") || type.includes("text/"))
				throw new Error("O provedor não retornou um arquivo de áudio.");
			const blob = await response.blob();
			// Preserve real container extensions: locally composed tracks are WAV.
			const audioType = blob.type.toLowerCase();
			const extension = audioType.includes("wav") || audioType.includes("wave")
				? "wav" : audioType.includes("ogg") ? "ogg" : audioType.includes("flac") ? "flac" : "mp3";
			const file = new File(
				[blob],
				`${sound.name.replace(/[<>:"/\\|?*]/g, "-")}.${extension}`,
				{ type: audioType.startsWith("audio/") ? audioType : "audio/mpeg" },
			);
			task("running", "Preparando áudio…");
			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed || !processed.duration)
				throw new Error("Não foi possível decodificar essa música.");
			if (
				editor.project.getActive().metadata.id !== projectId ||
				editor.scenes.getActiveScene().id !== sceneId
			)
				throw new Error(
					"O projeto mudou. Adicione a música novamente no projeto desejado.",
				);
			task("running", "Salvando áudio…");
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: processed,
			});
			if (!asset)
				throw new Error("Não foi possível salvar a música localmente.");
			if (
				editor.project.getActive().metadata.id !== projectId ||
				editor.scenes.getActiveScene().id !== sceneId
			)
				throw new Error(
					"O projeto mudou. O áudio foi salvo na biblioteca do projeto original.",
				);
			const targetTrackId = getOrCreateDarkCutAudioTrack({
				editor,
				name: destinationTrackName,
			});
			const element = buildElementFromMedia({
				mediaId: asset.id,
				mediaType: "audio",
				name: sound.name,
				duration: mediaTimeFromSeconds({ seconds:
					Math.min(processed.duration, Number.isFinite(maxDurationSeconds) && (maxDurationSeconds ?? 0) > 0 ? maxDurationSeconds! : processed.duration),
				}),
				startTime: currentTime,
			});

			if (Number.isFinite(volumeDb)) {
				element.params = {
					...element.params,
					volume: Math.max(-60, Math.min(20, volumeDb ?? -19)),
				};
			}
			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId: targetTrackId },
				element,
			});

			task("done", "Adicionado à timeline");
			toast.success(
				isBackgroundMusic
					? "Música adicionada à faixa A2."
					: "Efeito sonoro adicionado à faixa A3.",
				{ id: `sound-${sound.id}` },
			);
			return true;
		} catch (error) {
			task(
				"error",
				error instanceof Error ? error.message : "Falha ao adicionar áudio",
			);
			console.error("Failed to add sound to timeline:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao adicionar áudio à timeline.",
				{ id: `sound-${sound.id}` },
			);
			return false;
		}
	},
}));
