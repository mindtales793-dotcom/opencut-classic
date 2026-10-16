"use client";

import { useSoundPreview, stopSoundPreview } from "@/sounds/use-sound-preview";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSoundSearch } from "@/sounds/use-sound-search";
import { useSoundsStore } from "@/sounds/sounds-store";
import { useDarkCutProductionStore } from "@/components/editor/panels/assets/darkcut-production-store";
import type { SavedSound, SoundEffect } from "@/sounds/types";
import { cn } from "@/utils/ui";
import {
	FavouriteIcon,
	FilterMailIcon,
	PauseIcon,
	PlayIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function SoundsView() {
	return (
		<div className="flex h-full flex-col">
			<Tabs defaultValue="music" className="flex h-full flex-col">
				<div className="px-3 pt-4 pb-0">
					<TabsList className="w-full">
						<TabsTrigger value="music">Músicas</TabsTrigger>
						<TabsTrigger value="sound-effects">Efeitos</TabsTrigger>
						<TabsTrigger value="saved">Favoritos</TabsTrigger>
					</TabsList>
				</div>
				<Separator className="my-4" />
				<TabsContent
					value="music"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<MusicLibraryView />
				</TabsContent>
				<TabsContent
					value="sound-effects"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SoundEffectsView />
				</TabsContent>
				<TabsContent
					value="saved"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SavedSoundsView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function MusicLibraryView() {
	const [query, setQuery] = useState("");
	const [sounds, setSounds] = useState<SoundEffect[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const { playingId, playSound } = useSoundPreview();
	const jamendoClientId = useDarkCutProductionStore(
		(state) => state.jamendoClientId,
	);
	const loadSavedSounds = useSoundsStore((state) => state.loadSavedSounds);

	const categories = [
		{ label: "Documental", query: "documentary instrumental" },
		{ label: "Calma", query: "calm ambient instrumental" },
		{ label: "Esperança", query: "hopeful inspirational instrumental" },
		{ label: "Cinemática", query: "cinematic instrumental" },
		{ label: "Lo-fi", query: "lofi background music" },
		{ label: "Tecnologia", query: "technology corporate instrumental" },
	];

	const fetchMusic = async ({
		search,
		nextPage = 1,
		append = false,
	}: {
		search: string;
		nextPage?: number;
		append?: boolean;
	}) => {
		setIsLoading(true);
		try {
			if (!jamendoClientId.trim()) {
				setSounds([]);
				setHasMore(false);
				return;
			}

			const response = await fetch("/api/darkcut/music/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clientId: jamendoClientId,
					query: search,
					page: nextPage,
					limit: 30,
				}),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(
					data.error || `Falha ao carregar músicas: ${response.status}`,
				);
			}
			setSounds((current) =>
				append ? [...current, ...(data.results ?? [])] : (data.results ?? []),
			);
			setPage(nextPage);
			setHasMore(Boolean(data.hasMore));
		} catch (error) {
			console.error("Failed to load background music:", error);
			setSounds((current) => (append ? current : []));
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		void loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		const timeout = setTimeout(
			() => {
				void fetchMusic({ search: query, nextPage: 1 });
			},
			query.trim() ? 350 : 0,
		);
		return () => clearTimeout(timeout);
	}, [query, jamendoClientId]);

	return (
		<div className="mt-1 flex h-full min-h-0 flex-col gap-3">
			<div>
				<h3 className="text-sm font-semibold">Músicas de fundo</h3>
				<p className="mt-1 text-[0.68rem] text-muted-foreground">
					Ouça uma prévia e adicione a música em uma faixa de áudio da timeline.
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Input
					placeholder="Buscar: calma, documental, lo-fi..."
					className="w-full"
					containerClassName="w-full"
					value={query}
					onChange={({ currentTarget }) => setQuery(currentTarget.value)}
					showClearIcon
					onClear={() => setQuery("")}
				/>
				<span
					className="shrink-0 rounded-md border px-2 py-2 text-[0.65rem] text-muted-foreground"
					title="Fonte da biblioteca"
				>
					Jamendo
				</span>
			</div>

			<div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
				{categories.map((category) => (
					<Button
						key={category.label}
						variant="outline"
						size="sm"
						className="h-7 shrink-0 px-2 text-[0.65rem]"
						onClick={() => setQuery(category.query)}
					>
						{category.label}
					</Button>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="flex flex-col gap-3 pr-1">
						{isLoading && sounds.length === 0 && (
							<div className="py-6 text-center text-xs text-muted-foreground">
								Carregando músicas...
							</div>
						)}

						{!jamendoClientId.trim() && (
							<div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
								Configure o Jamendo Client ID em Configurações &gt; APIs para
								carregar as músicas.
							</div>
						)}

						{jamendoClientId.trim() && !isLoading && sounds.length === 0 && (
							<div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
								Nenhuma música encontrada. Tente outro estilo ou termo.
							</div>
						)}

						{sounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
								showDuration
							/>
						))}

						{hasMore && (
							<Button
								variant="outline"
								size="sm"
								className="mb-2 w-full"
								disabled={isLoading}
								onClick={() =>
									void fetchMusic({
										search: query,
										nextPage: page + 1,
										append: true,
									})
								}
							>
								{isLoading ? "Carregando..." : "Carregar mais músicas"}
							</Button>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function SoundEffectsView() {
	const {
		topSoundEffects,
		isLoading,
		searchQuery,
		setSearchQuery,
		scrollPosition,
		setScrollPosition,
		loadSavedSounds,
		showCommercialOnly,
		toggleCommercialFilter,
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	} = useSoundsStore();
	const {
		results: searchResults,
		isLoading: isSearching,
		loadMore,
		hasNextPage,
		isLoadingMore,
	} = useSoundSearch({
		query: searchQuery,
		commercialOnly: showCommercialOnly,
	});

	const { playingId, playSound } = useSoundPreview();

	const { scrollAreaRef, handleScroll } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore: hasNextPage,
		isLoading: isLoadingMore || isSearching,
	});

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		if (hasLoaded) {
			return;
		}

		let shouldIgnore = false;

		const fetchTopSounds = async () => {
			try {
				if (!shouldIgnore) {
					setLoading({ loading: true });
					setError({ error: null });
				}

				const response = await fetch(
					"/api/sounds/search?page_size=50&sort=downloads",
				);

				if (!shouldIgnore) {
					if (!response.ok) {
						throw new Error(`Failed to fetch: ${response.status}`);
					}

					const data = await response.json();
					setTopSoundEffects({ sounds: data.results });
					setHasLoaded({ loaded: true });

					setCurrentPage({ page: 1 });
					setHasNextPage({ hasNext: !!data.next });
					setTotalCount({ count: data.count });
				}
			} catch (error) {
				if (!shouldIgnore) {
					console.error("Failed to fetch top sounds:", error);
					setError({
						error:
							error instanceof Error ? error.message : "Failed to load sounds",
					});
				}
			} finally {
				if (!shouldIgnore) {
					setLoading({ loading: false });
				}
			}
		};

		const timeoutId = setTimeout(fetchTopSounds, 100, {});

		return () => {
			shouldIgnore = true;
			clearTimeout(timeoutId);
		};
	}, [
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	]);

	useEffect(() => {
		if (!scrollAreaRef.current || scrollPosition <= 0) {
			return;
		}

		const restoreScrollPosition = () => {
			scrollAreaRef.current?.scrollTo({ top: scrollPosition });
		};

		const timeoutId = setTimeout(restoreScrollPosition, 100, {});

		return () => clearTimeout(timeoutId);
	}, [scrollPosition, scrollAreaRef]);

	const handleScrollWithPosition = ({
		currentTarget,
	}: React.UIEvent<HTMLDivElement>) => {
		const { scrollTop } = currentTarget;
		setScrollPosition({ position: scrollTop });
		handleScroll({ currentTarget } as React.UIEvent<HTMLDivElement>);
	};

	const displayedSounds = searchQuery ? searchResults : topSoundEffects;

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<div className="flex items-center gap-3">
				<Input
					placeholder="Search sound effects"
					className="w-full"
					containerClassName="w-full"
					value={searchQuery}
					onChange={({ currentTarget }) =>
						setSearchQuery({ query: currentTarget.value })
					}
					showClearIcon
					onClear={() => setSearchQuery({ query: "" })}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="icon"
							className={cn(showCommercialOnly && "text-primary")}
						>
							<HugeiconsIcon icon={FilterMailIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuCheckboxItem
							checked={showCommercialOnly}
							onCheckedChange={() => toggleCommercialFilter()}
						>
							Show only commercially licensed
						</DropdownMenuCheckboxItem>
						<div className="text-muted-foreground px-2 py-1.5 text-xs">
							{showCommercialOnly
								? "Only showing sounds licensed for commercial use"
								: "Showing all sounds regardless of license"}
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea
					className="h-full flex-1"
					ref={scrollAreaRef}
					onScrollCapture={handleScrollWithPosition}
				>
					<div className="flex flex-col gap-4">
						{isLoading && !searchQuery && (
							<div className="text-muted-foreground text-sm">
								Loading sounds...
							</div>
						)}
						{isSearching && searchQuery && (
							<div className="text-muted-foreground text-sm">Searching...</div>
						)}
						{displayedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
						{!isLoading && !isSearching && displayedSounds.length === 0 && (
							<div className="text-muted-foreground text-sm">
								{searchQuery ? "No sounds found" : "No sounds available"}
							</div>
						)}
						{isLoadingMore && (
							<div className="text-muted-foreground py-4 text-center text-sm">
								Loading more sounds...
							</div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function SavedSoundsView() {
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		clearSavedSounds,
	} = useSoundsStore();

	const { playingId, playSound } = useSoundPreview();

	const [showClearDialog, setShowClearDialog] = useState(false);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	const convertToSoundEffect = ({
		savedSound,
	}: {
		savedSound: SavedSound;
	}): SoundEffect => ({
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	});

	if (isLoadingSavedSounds) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-sm">
					Loading saved sounds...
				</div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-destructive text-sm">
					Error: {savedSoundsError}
				</div>
			</div>
		);
	}

	if (savedSounds.length === 0) {
		return (
			<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
				<HugeiconsIcon
					icon={FavouriteIcon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-2 text-center">
					<p className="text-lg font-medium">No saved sounds</p>
					<p className="text-muted-foreground text-sm text-balance">
						Click the heart icon on any sound to save it here
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					{savedSounds.length} saved{" "}
					{savedSounds.length === 1 ? "sound" : "sounds"}
				</p>
				<Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
					<DialogTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="text-muted-foreground hover:text-destructive h-auto !opacity-100"
						>
							Clear all
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Clear all saved sounds?</DialogTitle>
							<DialogDescription>
								This will permanently remove all {savedSounds.length} saved
								sounds from your collection. This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="text" onClick={() => setShowClearDialog(false)}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={async ({
									stopPropagation,
								}: React.MouseEvent<HTMLButtonElement>) => {
									stopPropagation();
									await clearSavedSounds();
									setShowClearDialog(false);
								}}
							>
								Clear all sounds
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea className="h-full flex-1">
					<div className="flex flex-col gap-4">
						{savedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={convertToSoundEffect({ savedSound: sound })}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

interface AudioItemProps {
	sound: SoundEffect;
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
	showDuration?: boolean;
}

function formatSoundDuration(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	const minutes = Math.floor(seconds / 60);
	const rest = Math.floor(seconds % 60);
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function AudioItem({
	sound,
	isPlaying,
	onPlay,
	showDuration = false,
}: AudioItemProps) {
	const { addSoundToTimeline, isSoundSaved, toggleSavedSound } =
		useSoundsStore();
	const [isAdding, setIsAdding] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const isSaved = isSoundSaved({ soundId: sound.id });

	const handleClick = () => {
		onPlay({ sound });
	};

	const handleSaveClick = async ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		if (isSaving) return;
		setIsSaving(true);
		try {
			await toggleSavedSound({ soundEffect: sound });
		} finally {
			setIsSaving(false);
		}
	};

	const handleAddToTimeline = async ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		if (isAdding) return;
		setIsAdding(true);
		try {
			stopSoundPreview();
			await addSoundToTimeline({ sound });
		} finally {
			setIsAdding(false);
		}
	};
	return (
		<div className="group flex items-center gap-3 opacity-100 hover:opacity-75">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={handleClick}
				aria-label={`${isPlaying ? "Pausar" : "Ouvir"} ${sound.name}`}
			>
				<div className="bg-accent relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
					<div className="from-primary/20 absolute inset-0 bg-gradient-to-br to-transparent" />
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-5" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-5" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-sm font-medium">{sound.name}</p>
					<span className="text-muted-foreground block truncate text-xs">
						{sound.username}
						{showDuration && sound.duration
							? ` · ${formatSoundDuration(sound.duration)}`
							: ""}
					</span>
				</div>
			</button>

			<div className="flex items-center gap-3 pr-2">
				<Button
					variant="text"
					size="icon"
					className="text-muted-foreground hover:text-foreground w-auto !opacity-100"
					onClick={handleAddToTimeline}
					aria-label={`Adicionar ${sound.name} à timeline`}
					disabled={isAdding}
					title={isAdding ? "Adicionando..." : "Adicionar à timeline"}
				>
					{isAdding ? (
						<span className="px-1 text-[0.65rem]">...</span>
					) : (
						<HugeiconsIcon icon={PlusSignIcon} />
					)}
				</Button>
				<Button
					variant="text"
					size="icon"
					className={`hover:text-foreground w-auto !opacity-100 ${
						isSaved
							? "text-red-500 hover:text-red-600"
							: "text-muted-foreground"
					}`}
					onClick={handleSaveClick}
					disabled={isSaving}
					title={
						isSaving
							? "Salvando..."
							: isSaved
								? "Remover dos favoritos"
								: "Salvar nos favoritos"
					}
				>
					<HugeiconsIcon
						icon={FavouriteIcon}
						className={`${isSaved ? "fill-current" : ""}`}
					/>
				</Button>
			</div>
		</div>
	);
}
