"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useEditor } from "@/editor/use-editor";
import {
	useAssetsPanelStore,
	type Tab,
} from "@/components/editor/panels/assets/assets-panel-store";
export type TaskProgress = {
	projectId: string;
	label: string;
	detail?: string;
	startedAt?: number;
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
	set: (id, value) =>
		set((s) => ({
			tasks: {
				...s.tasks,
				[id]: {
					...value,
					startedAt:
						s.tasks[id]?.status === "running" &&
						s.tasks[id]?.projectId === value.projectId
							? s.tasks[id].startedAt
							: Date.now(),
				},
			},
		})),
}));
export function TaskStatus({ task }: { task: TaskProgress }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (task.status !== "running") return;
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [task.status, task.startedAt]);
	const seconds = Math.max(
		0,
		Math.floor((now - (task.startedAt ?? now)) / 1000),
	);
	return (
		<span
			className="flex flex-wrap items-center gap-2"
			data-task-status={task.status}
		>
			<span>
				{task.detail ??
					(task.status === "running"
						? "Em andamento"
						: task.status === "done"
							? "Concluído"
							: task.status === "paused"
								? "Pausado"
								: "Falhou — tente novamente")}
			</span>
			{task.total !== undefined && task.total > 0 ? (
				<>
					<progress
						aria-label={task.label}
						className="h-2 w-24"
						max={task.total}
						value={task.done ?? 0}
					/>
					<span>
						{task.done ?? 0}/{task.total}
					</span>
				</>
			) : (
				task.status === "running" && (
					<progress aria-label={task.label} className="h-2 w-24" />
				)
			)}
			{task.status === "running" && (
				<span className="tabular-nums" aria-live="off">
					{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
				</span>
			)}
		</span>
	);
}
export function DarkCutTaskBar() {
	const editor = useEditor();
	const tasks = useDarkCutTasks((s) => s.tasks);
	const id = useEditor((e) => e.project.getActive()?.metadata.id);
	const exp = useEditor((e) => e.project.getExportState());
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const visible = Object.values(tasks).filter((t) => t.projectId === id);
	return (
		<div
			hidden={!visible.length && !exp.isExporting}
            className="studio-taskbar flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-1 text-xs"
			aria-live="polite"
			data-darkcut-running={
				exp.isExporting ||
				Object.values(tasks).some((t) => t.status === "running")
					? "true"
					: "false"
			}
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
					<TaskStatus task={t} />
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
