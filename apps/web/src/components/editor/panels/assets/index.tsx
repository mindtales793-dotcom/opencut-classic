"use client";

import { Separator } from "@/components/ui/separator";
import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { StudioWorkflow } from "@/darkcut/studio-workflow";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Captions } from "@/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { StickersView } from "@/stickers/components/assets-view";
import { TextView } from "@/text/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { DarkCutProductionView } from "./views/darkcut-production";
import { DarkCutSyncView } from "./views/darkcut-sync";
import { DarkCutSrtStudio } from "./views/darkcut-srt-studio";
import { DarkMinerWorkspace } from "./views/darkcut-miner-workspace";
import { DarkCutVideosView } from "./views/darkcut-videos";
import { DarkCutTemplatesView } from "./views/darkcut-templates";
import { DarkCutTransitionsView } from "./views/darkcut-transitions";

export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		timeline: null,
		production: <DarkCutProductionView />,
		sync: <DarkCutSyncView />,
		"script-srt": <DarkCutSrtStudio />,
		darkminer: <DarkMinerWorkspace />,
		videos: <DarkCutVideosView />,
		media: <MediaView />,
		sounds: <SoundsView />,
		text: <TextView />,
		stickers: <StickersView />,
		effects: <EffectsView />,
		templates: <DarkCutTemplatesView />,
		transitions: <DarkCutTransitionsView />,
		captions: <Captions />,
		adjustment: <PropertiesPanel />,
		settings: <SettingsView />,
	};

	return (
		<div className="studio-assets panel flex h-full flex-col overflow-hidden">
			{activeTab !== "darkminer" && <StudioWorkflow />}
			<div className={"studio-assets-scroll min-h-0 flex-1 " + (activeTab === "darkminer" ? "overflow-hidden" : "overflow-y-auto overscroll-contain")}>
				<div className={activeTab === "darkminer" ? "h-full min-w-0" : "min-h-full min-w-0"}>
					{viewMap[activeTab]}
				</div>
			</div>
		</div>
	);
}
