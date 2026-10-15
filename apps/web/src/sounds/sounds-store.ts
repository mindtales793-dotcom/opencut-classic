import { create } from "zustand";
import type { SoundEffect, SavedSound } from "@/sounds/types";
import { storageService } from "@/services/storage/service";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import { buildLibraryAudioElement } from "@/timeline/element-utils";
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

	addSoundToTimeline: ({ sound }: { sound: SoundEffect }) => Promise<boolean>;
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

	addSoundToTimeline: async ({ sound }) => {
		const audioUrl = sound.downloadUrl || sound.previewUrl;
		if (!audioUrl) {
			toast.error("Áudio indisponível.");
			return false;
		}

		try {
			const editor = EditorCore.getInstance();
			const currentTime = editor.playback.getCurrentTime();
			const isBackgroundMusic = sound.tags?.some(
				(tag) => tag.toLowerCase() === "jamendo" || tag.toLowerCase() === "music",
			);
			const trackName = isBackgroundMusic
				? "A2 • Música de fundo"
				: "A3 • Efeitos sonoros";
			const targetTrackId = getOrCreateDarkCutAudioTrack({
				editor,
				name: trackName,
			});

			const response = await fetch(audioUrl);
			if (!response.ok) {
				throw new Error(`Falha ao carregar áudio: ${response.status}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const audioContext = new AudioContext();
			const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
			await audioContext.close();

			const measuredDuration =
				sound.duration > 0 ? sound.duration : Math.max(0.1, buffer.duration);
			const element = buildLibraryAudioElement({
				sourceUrl: audioUrl,
				name: sound.name,
				duration: mediaTimeFromSeconds({ seconds: measuredDuration }),
				startTime: currentTime,
				buffer,
			});

			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId: targetTrackId },
				element,
			});

			toast.success(
				isBackgroundMusic
					? "Música adicionada à faixa A2."
					: "Efeito sonoro adicionado à faixa A3.",
				{ id: `sound-${sound.id}` },
			);
			return true;
		} catch (error) {
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
