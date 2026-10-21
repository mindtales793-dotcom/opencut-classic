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
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
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
import { ZERO_MEDIA_TIME } from "@/wasm";
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
	const activeTab = useAssetsPanelStore((state) => state.activeTab);
	const isTimelineWorkspace = activeTab === "timeline";

	// Remain mounted while switching workspaces: the preview renderer is also
	// used by the export pipeline. Hiding it must not destroy rendering state.
	const hiddenPreview = (
		<div
			aria-hidden={!isTimelineWorkspace}
			className={
				isTimelineWorkspace
					? "relative h-full w-full"
					: "pointer-events-none invisible absolute left-0 top-0 z-[-1] h-[540px] w-[960px] overflow-hidden"
			}
		>
			<EditorPreview active={isTimelineWorkspace} />
		</div>
	);

	return (
		<ResizablePanelGroup
			key={isTimelineWorkspace ? "timeline-workspace" : "tool-workspace"}
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel({ panel: "mainContent", size: sizes[0] ?? panels.mainContent });
				setPanel({ panel: "timeline", size: sizes[1] ?? panels.timeline });
			}}
			data-darkcut-workspace={isTimelineWorkspace ? "timeline" : "tools"}
		>
			<ResizablePanel
				defaultSize={isTimelineWorkspace ? 54 : 67}
				minSize={30}
				maxSize={85}
				className="relative min-h-0 min-w-0 overflow-hidden rounded-md"
			>
				{hiddenPreview}
				{!isTimelineWorkspace && (
					<div className="relative size-full min-w-0 overflow-hidden">
						<AssetsPanel />
						{showProperties && activeTab !== "adjustment" && (
							<div className="studio-properties-overlay">
								<PropertiesPanel />
							</div>
						)}
					</div>
				)}
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel
				defaultSize={isTimelineWorkspace ? 46 : 33}
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
function EditorPreview({ active }: { active: boolean }) {
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	// Tool tabs keep the preview mounted, but should not subscribe to every
	// playback tick while the canvas is invisible.
	const currentTime = useEditor((editor) => active ? editor.playback.getCurrentTime() : ZERO_MEDIA_TIME);
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
			active={active}
			overlayControls={overlayControls}
			overlayInstances={overlaySource.instances}
			onOverlayVisibilityChange={setOverlayVisibility}
		/>
	);
}
