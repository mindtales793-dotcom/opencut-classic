import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DarkCutProductionMode = "ai" | "broll" | "hybrid";
export type CrisProvider = "gemini" | "openrouter";
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
	youtubeApiKeys: string[];
	fishApiKeys: string[];
	jamendoClientId: string;
	freesoundApiKey: string;
	geminiApiKey: string;
	openRouterApiKey: string;
	crisPrimaryProvider: CrisProvider;
	crisFallbackProvider: CrisProvider;
	geminiModel: string;
	openRouterModel: string;
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
	setYoutubeApiKey: (index: number, value: string) => void;
	setFishApiKey: (index: number, value: string) => void;
	setJamendoClientId: (value: string) => void;
	setFreesoundApiKey: (value: string) => void;
	setGeminiApiKey: (value: string) => void;
	setOpenRouterApiKey: (value: string) => void;
	setCrisPrimaryProvider: (value: CrisProvider) => void;
	setCrisFallbackProvider: (value: CrisProvider) => void;
	setGeminiModel: (value: string) => void;
	setOpenRouterModel: (value: string) => void;
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
			youtubeApiKeys: ["", "", ""],
			fishApiKeys: ["", "", ""],
			jamendoClientId: "",
			freesoundApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
			crisPrimaryProvider: "gemini",
			crisFallbackProvider: "openrouter",
			geminiModel: "gemini-2.5-flash-lite",
			openRouterModel: "openrouter/free",
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
			setYoutubeApiKey: (index, value) =>
				set((state) => {
					const youtubeApiKeys = [
						...(state.youtubeApiKeys?.length
							? state.youtubeApiKeys
							: ["", "", ""]),
					];
					while (youtubeApiKeys.length < 3) youtubeApiKeys.push("");
					youtubeApiKeys[index] = value;
					return { youtubeApiKeys: youtubeApiKeys.slice(0, 3) };
				}),
			setFishApiKey: (index, value) =>
				set((state) => {
					const fishApiKeys = [
						...(state.fishApiKeys?.length
							? state.fishApiKeys
							: ["", "", ""]),
					];
					while (fishApiKeys.length < 3) fishApiKeys.push("");
					fishApiKeys[index] = value;
					return { fishApiKeys: fishApiKeys.slice(0, 3) };
				}),
			setJamendoClientId: (jamendoClientId) => set({ jamendoClientId }),
			setFreesoundApiKey: (freesoundApiKey) => set({ freesoundApiKey }),
			setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
			setOpenRouterApiKey: (openRouterApiKey) => set({ openRouterApiKey }),
			setCrisPrimaryProvider: (crisPrimaryProvider) =>
				set({ crisPrimaryProvider }),
			setCrisFallbackProvider: (crisFallbackProvider) =>
				set({ crisFallbackProvider }),
			setGeminiModel: (geminiModel) => set({ geminiModel }),
			setOpenRouterModel: (openRouterModel) => set({ openRouterModel }),
			setSource: (key, value) => set({ [key]: value }),
			setStage: (stage) => set({ stage }),
		}),
		{ name: "darkcut-production" },
	),
);
