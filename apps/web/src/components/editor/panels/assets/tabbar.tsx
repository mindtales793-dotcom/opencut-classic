"use client";
import { LITE_TAB_KEYS, tabs, useAssetsPanelStore } from "./assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { useStudioNavigation } from "@/darkcut/studio-navigation";
export function TabBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const setSection = useStudioNavigation((s) => s.setSection);
	const mediaCount = useEditor((e) => e.media.getAssets().length);
	return (
		<aside className="studio-sidebar" aria-label="Ferramentas do editor">
			<nav className="studio-navigation">
				{LITE_TAB_KEYS.map(
					(key) => {
						const tab = tabs[key];
						const active = activeTab === key;
						return (
							<button
								key={key}
								type="button"
								aria-label={tab.label}
								aria-current={active ? "page" : undefined}
								className={active ? "is-active" : ""}
								onClick={() => {
									if (key === "production") setSection("script");
									setActiveTab(key);
								}}
							>
								<tab.icon />
								<span>{tab.label}</span>
							</button>
						);
					},
				)}
			</nav>
			<div className="studio-sidebar-footer">
				<div className="studio-storage">
					<span>Biblioteca do projeto</span>
					<strong>{mediaCount} arquivos</strong>
					<div className="studio-storage-line" />
					<small>Salvos neste dispositivo</small>
				</div>
				<div className="studio-edition">
					<strong>DarkCut Studio</strong>
					<p>Seu espaço de criação.</p>
					<button
						onClick={() => {
							setSection("script");
							setActiveTab("production");
						}}
					>
						Abrir roteiro
					</button>
				</div>
			</div>
		</aside>
	);
}
