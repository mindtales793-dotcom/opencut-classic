"use client";

import { TabBar } from "@/components/editor/panels/assets/tabbar";
import "./studio.css";
import { DarkCutTaskBar } from "@/darkcut/tasks";
import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="darkcut-studio-shell dark bg-background flex h-screen w-screen flex-col overflow-hidden">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="flex min-h-0 flex-1">
						<TabBar />
						<div className="min-w-0 flex-1 flex flex-col">
							<DarkCutTaskBar />
							<div className="min-h-0 flex-1">
								<EditorLayout />
							</div>
						</div>
					</div>
					<Onboarding />
					<MigrationDialog />
					<ChangelogNotification />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>For the best experience, open OpenCut in Chrome.</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel, showProperties } = usePanelStore();
	const [toolsHidden, setToolsHidden] = useState(false);

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel({
					panel: "mainContent",
					size: sizes[0] ?? panels.mainContent,
				});
				setPanel({
					panel: "timeline",
					size: sizes[1] ?? panels.timeline,
				});
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="studio-workspace"
					onLayout={(sizes) => {
						setPanel({ panel: "preview", size: sizes[0] ?? panels.preview });
						if (sizes[1] !== undefined) {
							setPanel({ panel: "tools", size: sizes[1] });
						}
					}}
				>
					<ResizablePanel
						id="preview"
						order={1}
						defaultSize={toolsHidden ? 100 : panels.preview}
						minSize={toolsHidden ? 100 : 30}
						className="min-w-0 min-h-0"
					>
						<div className="relative size-full">
							<EditorPreview />
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="absolute right-3 top-3 z-40 h-8 border border-border/80 bg-background/90 px-3 text-xs shadow-md backdrop-blur"
								onClick={() => setToolsHidden((hidden) => !hidden)}
								title={toolsHidden ? "Mostrar painel de ferramentas" : "Ocultar painel e ampliar monitor"}
								aria-pressed={toolsHidden}
							>
								{toolsHidden ? "▤ Mostrar painel" : "▥ Ampliar monitor"}
							</Button>
						</div>
					</ResizablePanel>
					{!toolsHidden && (
						<>
							<ResizableHandle withHandle />
							<ResizablePanel
								id="assets"
								order={2}
								defaultSize={panels.tools}
								minSize={30}
								className="min-w-0 min-h-0 relative"
							>
								<AssetsPanel />
								{showProperties && (
									<div className="studio-properties-overlay">
										<PropertiesPanel />
									</div>
								)}
							</ResizablePanel>
						</>
					)}
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="studio-timeline min-h-0"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

// Keep playback updates inside the preview, away from the asset grid and timeline layout.
function EditorPreview() {
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	return (
		<PreviewPanel
			overlayControls={overlayControls}
			overlayInstances={overlaySource.instances}
			onOverlayVisibilityChange={setOverlayVisibility}
		/>
	);
}
