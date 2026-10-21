"use client";

import dynamic from "next/dynamic";
import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
// Keep every existing panel, but only load its editor bundle when opened.
// Importing all panels eagerly made startup and every first project load heavier.
const panelLoading = () => <div className="p-5 text-sm text-muted-foreground">Carregando ferramentas…</div>;
const PropertiesPanel = dynamic(() => import("@/components/editor/panels/properties").then((module) => module.PropertiesPanel), { loading: panelLoading });
const Captions = dynamic(() => import("@/subtitles/components/assets-view").then((module) => module.Captions), { loading: panelLoading });
const MediaView = dynamic(() => import("./views/assets").then((module) => module.MediaView), { loading: panelLoading });
const SettingsView = dynamic(() => import("./views/settings").then((module) => module.SettingsView), { loading: panelLoading });
const SoundsView = dynamic(() => import("@/sounds/components/assets-view").then((module) => module.SoundsView), { loading: panelLoading });
const TextView = dynamic(() => import("@/text/components/assets-view").then((module) => module.TextView), { loading: panelLoading });
const EffectsView = dynamic(() => import("@/effects/components/assets-view").then((module) => module.EffectsView), { loading: panelLoading });
const DarkCutProductionView = dynamic(() => import("./views/darkcut-production").then((module) => module.DarkCutProductionView), { loading: panelLoading });
const DarkCutSyncView = dynamic(() => import("./views/darkcut-sync").then((module) => module.DarkCutSyncView), {
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
		"script-srt": null,
		darkminer: null,
		videos: null,
		media: <MediaView />,
		sounds: <SoundsView />,
		text: <TextView />,
		stickers: null,
		effects: <EffectsView />,
		templates: <DarkCutTemplatesView />,
		transitions: <DarkCutTransitionsView />,
		captions: <Captions />,
		adjustment: <PropertiesPanel />,
		settings: <SettingsView />,
	};

	return (
		<div className="studio-assets panel flex h-full flex-col overflow-hidden">
			<div className="studio-assets-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div className="min-h-full min-w-0">
					{viewMap[activeTab]}
				</div>
			</div>
		</div>
	);
}
