import { create } from "zustand";
export const useStudioNavigation = create<{
	section: "script" | "scenes" | "setup";
	setSection: (section: "script" | "scenes" | "setup") => void;
}>((set) => ({ section: "script", setSection: (section) => set({ section }) }));
