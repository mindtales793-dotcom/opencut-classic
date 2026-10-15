"use client";
import { create } from "zustand";
import { useEditor } from "@/editor/use-editor";
import {
	useAssetsPanelStore,
	type Tab,
} from "@/components/editor/panels/assets/assets-panel-store";
export type TaskProgress = {
	projectId: string;
	label: string;
	done?: number;
	total?: number;
	tab: Tab;
	status: "running" | "done" | "paused" | "error";
};
export const useDarkCutTasks = create<{
	tasks: Record<string, TaskProgress>;
	set: (id: string, value: TaskProgress) => void;
}>((set) => ({
	tasks: {},
	set: (id, value) => set((s) => ({ tasks: { ...s.tasks, [id]: value } })),
}));
export function DarkCutTaskBar() {
	const editor = useEditor();
	const tasks = useDarkCutTasks((s) => s.tasks);
	const id = useEditor((e) => e.project.getActive()?.metadata.id);
	const exp = useEditor((e) => e.project.getExportState());
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const visible = Object.values(tasks).filter((t) => t.projectId === id);
	return (
		<div
			className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-1 text-xs"
			aria-live="polite"
			data-darkcut-running={exp.isExporting || Object.values(tasks).some(t=>t.status === "running") ? "true" : "false"}
		>
			<span className="font-semibold">Produção</span>
			{!visible.length && !exp.isExporting && (
				<span className="text-muted-foreground">
					Pronto • tarefas continuam ao trocar de aba
				</span>
			)}
			{visible.map((t, i) => (
				<button
					key={i}
					className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent"
					onClick={() => setActiveTab(t.tab)}
				>
					<span>
						{t.status === "done"
							? "✓"
							: t.status === "error"
								? "!"
								: t.status === "paused"
									? "Ⅱ"
									: "◌"}{" "}
						{t.label}
					</span>
					{t.total !== undefined && t.total > 0 && (
						<>
							<progress
								className="h-1 w-20"
								max={t.total}
								value={t.done ?? 0}
							/>
							<span>
								{t.done ?? 0}/{t.total}
							</span>
						</>
					)}
				</button>
			))}
			{exp.isExporting && (
				<div className="flex items-center gap-2 rounded-md bg-accent/40 px-2 py-1">
					<span className="font-medium">Exportando</span>
					<progress className="h-1 w-28" max={1} value={exp.progress} />
					<span>{Math.round(exp.progress * 100)}%</span>
					<button
						type="button"
						className="rounded border px-2 py-0.5 text-[0.68rem] hover:bg-background"
						onClick={() => editor.project.cancelExport()}
					>
						Cancelar
					</button>
				</div>
			)}
		</div>
	);
}
