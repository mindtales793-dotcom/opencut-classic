import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DarkCutProductionMode = "ai" | "broll" | "hybrid";
export type DarkCutProductionStage =
	| "project"
	| "script"
	| "scenes"
	| "sources"
	| "queue";

interface DarkCutProductionState {
	channelName: string;
	projectName: string;
	mode: DarkCutProductionMode;
	sceneSeconds: number;
	script: string;
	narrationPath: string;
	srtPath: string;
	selectedNarratorId: string;
	useFlowZika: boolean;
	useYoutube: boolean;
	useStock: boolean;
	useLocal: boolean;
	stage: DarkCutProductionStage;
	setChannelName: (value: string) => void;
	setProjectName: (value: string) => void;
	setMode: (value: DarkCutProductionMode) => void;
	setSceneSeconds: (value: number) => void;
	setScript: (value: string) => void;
	setNarrationPath: (value: string) => void;
	setSrtPath: (value: string) => void;
	setSelectedNarratorId: (value: string) => void;
	setSource: (
		key: "useFlowZika" | "useYoutube" | "useStock" | "useLocal",
		value: boolean,
	) => void;
	setStage: (value: DarkCutProductionStage) => void;
}

export const useDarkCutProductionStore = create<DarkCutProductionState>()(
	persist(
		(set) => ({
			channelName: "",
			projectName: "",
			mode: "hybrid",
			sceneSeconds: 5,
			script: "",
			narrationPath: "",
			srtPath: "",
			selectedNarratorId: "04736e4d6a644abab81e601a7d2ae4b9",
			useFlowZika: true,
			useYoutube: true,
			useStock: true,
			useLocal: true,
			stage: "project",
			setChannelName: (channelName) => set({ channelName }),
			setProjectName: (projectName) => set({ projectName }),
			setMode: (mode) => set({ mode }),
			setSceneSeconds: (sceneSeconds) => set({ sceneSeconds }),
			setScript: (script) => set({ script }),
			setNarrationPath: (narrationPath) => set({ narrationPath }),
			setSrtPath: (srtPath) => set({ srtPath }),
			setSelectedNarratorId: (selectedNarratorId) => set({ selectedNarratorId }),
			setSource: (key, value) => set({ [key]: value }),
			setStage: (stage) => set({ stage }),
		}),
		{ name: "darkcut-production" },
	),
);
