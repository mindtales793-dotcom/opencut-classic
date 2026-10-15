"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { TracksSnapshotCommand } from "@/commands/timeline";
import { generateUUID } from "@/utils/id";
import type { TimelineElement } from "@/timeline/types";
import {
	addMediaTime,
	mediaTimeFromSeconds,
	ZERO_MEDIA_TIME,
	type MediaTime,
} from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useFileUpload } from "@/media/use-file-upload";
import { invokeAction } from "@/actions";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import { useTimelineStore } from "@/timeline/timeline-store";
import type { MediaAsset } from "@/media/types";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function MediaView() {
	const editor = useEditor();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const {
		mediaViewMode,
		setMediaViewMode,
		highlightMediaId,
		clearHighlight,
		mediaSortBy,
		mediaSortOrder,
		setMediaSort,
	} = useAssetsPanelStore();

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
	const [isAddingBatch, setIsAddingBatch] = useState(false);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const imageDurationSeconds = useTimelineStore(
		(state) => state.darkcutDurationSeconds,
	);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files,
						onProgress: (progress: { progress: number }) =>
							setProgress(progress.progress),
					});
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
					}
					return {
						uploadedCount: processedAssets.length,
						assetNames: processedAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Error processing files:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "image/*,video/*,audio/*",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const openFolderPicker = () => {
		const input = folderInputRef.current;
		if (!input) return;
		input.setAttribute("webkitdirectory", "");
		input.setAttribute("directory", "");
		input.click();
	};

	const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const allFiles = Array.from(event.target.files ?? []);
		const mediaFiles = allFiles.filter((file) => {
			const type = file.type.toLowerCase();
			if (
				type.startsWith("image/") ||
				type.startsWith("video/") ||
				type.startsWith("audio/")
			) {
				return true;
			}

			return /\.(png|jpe?g|webp|gif|bmp|mp4|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg)$/i.test(
				file.name,
			);
		});

		if (mediaFiles.length === 0) {
			toast.error("Essa pasta não possui imagens, vídeos ou áudios compatíveis.");
		} else {
			processFiles({ files: mediaFiles });
		}

		event.target.value = "";
	};

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};

	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	const filteredMediaItems = useMemo(() => {
		const filtered = mediaFiles.filter((item) => !item.ephemeral);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, mediaSortBy, mediaSortOrder]);
	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);

	const batchSelectableItems = useMemo(
		() =>
			filteredMediaItems.filter(
				(item) => item.type === "image" || item.type === "video",
			),
		[filteredMediaItems],
	);
	const batchSelectableIds = useMemo(
		() => batchSelectableItems.map((item) => item.id),
		[batchSelectableItems],
	);
	const batchSelectedSet = useMemo(
		() => new Set(batchSelectedIds),
		[batchSelectedIds],
	);
	const allBatchSelected =
		batchSelectableIds.length > 0 &&
		batchSelectableIds.every((id) => batchSelectedSet.has(id));
	const someBatchSelected = batchSelectedIds.length > 0;

	useEffect(() => {
		const available = new Set(batchSelectableIds);
		setBatchSelectedIds((current) =>
			current.filter((id) => available.has(id)),
		);
	}, [batchSelectableIds]);

	const toggleBatchSelection = (id: string) => {
		setBatchSelectedIds((current) =>
			current.includes(id)
				? current.filter((candidate) => candidate !== id)
				: [...current, id],
		);
	};

	const toggleSelectAll = () => {
		setBatchSelectedIds(allBatchSelected ? [] : batchSelectableIds);
	};

	const addSelectedToTimeline = async () => {
		if (isAddingBatch) return;

		const selectedSet = new Set(batchSelectedIds);
		const selectedItems = batchSelectableItems.filter((item) =>
			selectedSet.has(item.id),
		);
		if (selectedItems.length === 0) {
			toast.error("Selecione uma ou mais imagens/vídeos.");
			return;
		}

		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) {
			toast.error("Nenhuma cena ativa.");
			return;
		}

		setIsAddingBatch(true);
		const toastId = `darkcut-batch-${Date.now()}`;
		toast.loading(
			`Preparando ${selectedItems.length} mídia(s) para a timeline...`,
			{ id: toastId },
		);

		try {
			// Deixa o navegador pintar o feedback antes do lote pesado.
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

			const beforeTracks = scene.tracks;
			const mainTrack = beforeTracks.main;
			const hadVisuals = mainTrack.elements.length > 0;
			let cursor = mainTrack.elements.reduce<MediaTime>((max, element) => {
				const elementEnd = addMediaTime({
					a: element.startTime,
					b: element.duration,
				});
				return elementEnd > max ? elementEnd : max;
			}, ZERO_MEDIA_TIME);
			const batchStart = cursor;
			const newElements: TimelineElement[] = [];

			for (const asset of selectedItems) {
				const duration =
					asset.type === "image"
						? mediaTimeFromSeconds({
								seconds: Math.max(0.1, imageDurationSeconds),
							})
						: asset.duration != null
							? mediaTimeFromSeconds({ seconds: asset.duration })
							: DEFAULT_NEW_ELEMENT_DURATION;

				const element = buildElementFromMedia({
					mediaId: asset.id,
					mediaType: asset.type,
					name: asset.name,
					duration,
					startTime: cursor,
				});

				newElements.push({
					...element,
					id: generateUUID(),
				} as TimelineElement);

				cursor = addMediaTime({ a: cursor, b: duration });
			}

			const afterTracks = {
				...beforeTracks,
				main: {
					...mainTrack,
					elements: [...mainTrack.elements, ...newElements],
				},
			};

			editor.command.execute({
				command: new TracksSnapshotCommand({
					before: beforeTracks,
					after: afterTracks,
				}),
			});

			// Em lotes grandes, mostrar imediatamente o começo do material inserido.
			if (!hadVisuals) {
				const viewState = editor.project.getTimelineViewState();
				editor.project.setTimelineViewState({
					viewState: {
						...viewState,
						zoomLevel: 1,
						scrollLeft: 0,
						playheadTime: batchStart,
					},
				});
			}
			editor.playback.seek({ time: batchStart });
			setBatchSelectedIds([]);

			toast.success(
				`${selectedItems.length} mídia(s) adicionadas à V1.`,
				{
					id: toastId,
					description: `Inserção em lote concluída. Imagens: ${Math.max(
						0.1,
						imageDurationSeconds,
					).toFixed(1)}s cada.`,
				},
			);
		} catch (error) {
			console.error("Falha ao adicionar lote à timeline:", error);
			toast.error("Não foi possível adicionar as mídias à timeline.", {
				id: toastId,
				description:
					error instanceof Error ? error.message : "Erro desconhecido.",
			});
		} finally {
			setIsAddingBatch(false);
		}
	};

	return (
		<>
			<input {...fileInputProps} />

			<PanelView
				title="Assets"
				actions={
					<MediaActions
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isProcessing || isAddingBatch}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onImport={openFilePicker}
						onImportFolder={openFolderPicker}
						selectedCount={batchSelectedIds.length}
						allSelected={allBatchSelected}
						someSelected={someBatchSelected}
						onToggleSelectAll={toggleSelectAll}
						onAddSelected={() => void addSelectedToTimeline()}
					/>
				}
				className={cn(isDragOver && "bg-accent/30")}
				contentClassName="h-full"
				{...dragProps}
			>
				{isDragOver || filteredMediaItems.length === 0 ? (
					<MediaDragOverlay
						isVisible={true}
						isProcessing={isProcessing}
						progress={progress}
						onClick={openFilePicker}
					/>
				) : (
					<SelectableSurface
						ariaLabel="Assets"
						orderedIds={orderedMediaIds}
						revealId={highlightMediaId}
						onRevealComplete={clearHighlight}
					>
						<MediaScopeRegistrar />
						<MediaItemList
							items={filteredMediaItems}
							mode={mediaViewMode}
							onRemove={handleRemove}
							batchSelectedIds={batchSelectedIds}
							onToggleBatchSelection={toggleBatchSelection}
						/>
					</SelectableSurface>
				)}
			</PanelView>
		</>
	);
}

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function MediaItemWithContextMenu({
	item,
	children,
	onRemove,
}: {
	item: MediaAsset;
	children: React.ReactNode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const { isSelected, selectedIds } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1 ? `Delete ${idsToDelete.length} items` : "Delete";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>Export clips</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function MediaItemList({
	items,
	mode,
	onRemove,
	batchSelectedIds,
	onToggleBatchSelection,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
	batchSelectedIds: string[];
	onToggleBatchSelection: (id: string) => void;
}) {
	const isGrid = mode === "grid";

	return (
		<div
			className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
			style={
				isGrid ? { gridTemplateColumns: "repeat(auto-fill, 7rem)" } : undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu item={item} onRemove={onRemove} key={item.id}>
					<SelectableItem className={cn(!isGrid && "w-full")} id={item.id}>
						{item.type === "image" || item.type === "video" ? (
							<label
								className="absolute top-1 left-1 z-20 flex size-6 cursor-pointer items-center justify-center rounded bg-background/90 shadow-sm backdrop-blur"
								title="Selecionar para adicionar em lote"
								onMouseDown={(event) => event.stopPropagation()}
								onClick={(event) => event.stopPropagation()}
							>
								<input
									type="checkbox"
									checked={batchSelectedIds.includes(item.id)}
									onChange={() => onToggleBatchSelection(item.id)}
									className="size-4 accent-primary"
									aria-label={`Selecionar ${item.name}`}
								/>
							</label>
						) : null}
						<MediaAssetDraggable
							item={item}
							preview={
								<MediaPreview
									item={item}
									variant={isGrid ? "grid" : "compact"}
								/>
							}
							variant={isGrid ? "card" : "compact"}
							isRounded={isGrid ? false : undefined}
						/>
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
}) {
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
				</div>
			);
		}

		return (
			<MediaTypePlaceholder
				icon={Video01Icon}
				label="Video"
				duration={item.duration}
				variant="muted"
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label="Audio"
				duration={item.duration}
				variant="bordered"
			/>
		);
	}

	return (
		<MediaTypePlaceholder icon={Image02Icon} label="Unknown" variant="muted" />
	);
}

function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
	onImport,
	onImportFolder,
	selectedCount,
	allSelected,
	someSelected,
	onToggleSelectAll,
	onAddSelected,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onImport: () => void;
	onImportFolder: () => void;
	selectedCount: number;
	allSelected: boolean;
	someSelected: boolean;
	onToggleSelectAll: () => void;
	onAddSelected: () => void;
}) {
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? "Switch to list view"
								: "Switch to grid view"}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label="Name"
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Type"
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Duration"
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="File size"
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							Sort by {sortBy} (
							{sortOrder === "asc" ? "ascending" : "descending"})
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs">
				<input
					type="checkbox"
					checked={allSelected}
					ref={(input) => {
						if (input) input.indeterminate = someSelected && !allSelected;
					}}
					onChange={onToggleSelectAll}
					className="size-4 accent-primary"
					aria-label="Selecionar todas as imagens e vídeos"
				/>
				Selecionar todas
			</label>
			<Button
				variant={selectedCount > 0 ? "default" : "outline"}
				onClick={onAddSelected}
				disabled={isProcessing || selectedCount === 0}
				size="sm"
				className="items-center justify-center gap-1.5"
				title="Adicionar selecionadas em sequência na timeline"
			>
				+ Timeline{selectedCount > 0 ? ` (${selectedCount})` : ""}
			</Button>
			<Button
				variant="outline"
				onClick={onImportFolder}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				Pasta
			</Button>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				Arquivos
			</Button>
		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
