"use client";
import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEditor } from "@/editor/use-editor";

// Browser persistence only; project media remains in the existing media database.
const useDrafts = create<{
	values: Record<string, unknown>;
	put: (key: string, value: unknown) => void;
}>()(
	persist(
		(set) => ({
			values: {},
			put: (key, value) =>
				set((s) => ({ values: { ...s.values, [key]: value } })),
		}),
		{ name: "darkcut-project-drafts-v1" },
	),
);
export function useProjectDraft<T>(
	field: string,
	initial: T,
): [T, (value: T | ((old: T) => T)) => void] {
	const projectId = useEditor((e) => e.project.getActive()?.metadata.id ?? "");
	const key = `${projectId}:${field}`;
	const stored = useDrafts((s) => s.values[key]);
	const set = useCallback(
		(value: T | ((old: T) => T)) => {
			const previous =
				(useDrafts.getState().values[key] as T | undefined) ?? initial;
			useDrafts
				.getState()
				.put(
					key,
					typeof value === "function"
						? (value as (old: T) => T)(previous)
						: value,
				);
		},
		[key, initial],
	);
	return [(stored as T | undefined) ?? initial, set];
}
