"use client";

import dynamic from "next/dynamic";
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
const DarkCutSyncView = dynamic(() => import("./views/darkcut-sync").then((module) => module.DarkCutSyncView), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});
const DarkCutSrtStudio = dynamic(() => import("./views/darkcut-srt-studio").then((module) => module.DarkCutSrtStudio), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});
const DarkMinerWorkspace = dynamic(() => import("./views/darkcut-miner-workspace").then((module) => module.DarkMinerWorkspace), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});
const DarkCutVideosView = dynamic(() => import("./views/darkcut-videos").then((module) => module.DarkCutVideosView), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});
const DarkCutTemplatesView = dynamic(() => import("./views/darkcut-templates").then((module) => module.DarkCutTemplatesView), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});
const DarkCutTransitionsView = dynamic(() => import("./views/darkcut-transitions").then((module) => module.DarkCutTransitionsView), {
	loading: () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>,
});

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
