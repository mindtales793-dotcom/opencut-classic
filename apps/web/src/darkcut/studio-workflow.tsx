"use client";
import { useEditor } from "@/editor/use-editor";
import { useProjectDraft } from "./project-draft";
import { useStudioNavigation } from "./studio-navigation";
import {
	useAssetsPanelStore,
	tabs,
	type Tab,
} from "@/components/editor/panels/assets/assets-panel-store";
import { useDarkCutProductionStore } from "@/components/editor/panels/assets/darkcut-production-store";
import type { DarkCutScene } from "@/components/editor/panels/assets/darkcut-automation";
import { ExportButton } from "@/components/editor/export-button";
export function StudioWorkflow() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const { section, setSection } = useStudioNavigation();
	const script = useDarkCutProductionStore((s) => s.script);
	const [scenes] = useProjectDraft<DarkCutScene[]>("scenes", []);
	const [narration] = useProjectDraft<string | null>("narration-asset", null);
	const hasTimeline = useEditor((e) => e.timeline.getTotalDuration() > 0);
	const ready = scenes.filter((s) => s.mediaId).length;
	const go = (tab: Tab, section: "script" | "scenes" | "setup" = "script") => {
		setSection(section);
		setActiveTab(tab);
	};
	const steps = [
		{
			label: "Roteiro",
			value: script.trim() ? "Concluído" : "Pendente",
			done: !!script.trim(),
			go: () => go("production"),
		},
		{
			label: "Narração",
			value: narration ? "Concluída" : "Pendente",
			done: !!narration,
			go: () => go("sync"),
		},
		{
			label: String(scenes.length),
			value: "cenas",
			done: !!scenes.length,
			go: () => go("production", "scenes"),
		},
		{
			label: String(ready),
			value: "mídias encontradas",
			done: ready > 0 && ready === scenes.length,
			go: () => go("media"),
		},
		{
			label: String(scenes.length - ready),
			value: "faltando",
			done: scenes.length > 0 && ready === scenes.length,
			go: () => go("videos"),
		},
		{
			label: "Timeline",
			value: hasTimeline ? "Pronta" : "Pendente",
			done: hasTimeline,
			go: () => go("production", "setup"),
		},
	];
	return (
		<>
			<div className="studio-workflow">
				<div className="studio-steps">
					{steps.map((s, i) => (
						<button key={i} onClick={s.go} className={s.done ? "complete" : ""}>
							<span className="studio-step-dot">
								{s.done ? "✓" : i === 4 ? "+" : "·"}
							</span>
							<strong>{s.label}</strong>
							<small>{s.value}</small>
						</button>
					))}
				</div>
				<ExportButton />
			</div>
			<nav className="studio-workflow-tabs" aria-label="Etapas de produção">
				{[
					{
						label: "Roteiro",
						tab: "production" as Tab,
						section: "script" as const,
						aria: "Roteiro",
					},
					{
						label: "Narração",
						tab: "sync" as Tab,
						section: "script" as const,
						aria: "Sincronização",
					},
					{
						label: `Cenas (${scenes.length})`,
						tab: "production" as Tab,
						section: "scenes" as const,
						aria: "Cenas",
					},
					{
						label: "Mídias",
						tab: "media" as Tab,
						section: "script" as const,
						aria: "Mídias da produção",
					},
					{
						label: "Auto Edit",
						tab: "production" as Tab,
						section: "setup" as const,
						aria: "Auto Edit da produção",
					},
				].map((item) => {
					const Icon = tabs[item.tab].icon;
					return (
						<button
							key={item.aria}
							aria-label={item.aria}
							aria-pressed={
								activeTab === item.tab &&
								(item.tab !== "production" || section === item.section)
							}
							onClick={() => go(item.tab, item.section)}
						>
							<Icon />
							<span>{item.label}</span>
						</button>
					);
				})}
			</nav>
		</>
	);
}
