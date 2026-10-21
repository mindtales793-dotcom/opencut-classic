/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DarkCutTransitionPreset =
	| "fade"
	| "zoom"
	| "slide-left"
	| "slide-right"
	| "ken-burns"
	| "pop";

export type DarkCutMotionPreset =
	| "zoom-in"
	| "zoom-out"
	| "pan-left-right"
	| "pan-right-left"
	| "pan-up-down"
	| "pan-down-up"
	| "ken-burns"
	| "push-in"
	| "pull-out"
	| "documentary";

export type DarkCutEffectIntensity = "soft" | "normal" | "strong";

interface TimelineStore {
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;
	expandedElementIds: Set<string>;
	toggleElementExpanded: (elementId: string) => void;
	darkcutDurationSeconds: number;
	setDarkcutDurationSeconds: (seconds: number) => void;
	darkcutTransitionPreset: DarkCutTransitionPreset;
	setDarkcutTransitionPreset: (preset: DarkCutTransitionPreset) => void;
	darkcutTransitionFavorites: DarkCutTransitionPreset[];
	toggleDarkcutTransitionFavorite: (preset: DarkCutTransitionPreset) => void;
	darkcutMotionPreset: DarkCutMotionPreset;
	setDarkcutMotionPreset: (preset: DarkCutMotionPreset) => void;
	darkcutMotionFavorites: DarkCutMotionPreset[];
	toggleDarkcutMotionFavorite: (preset: DarkCutMotionPreset) => void;
	darkcutEffectIntensity: DarkCutEffectIntensity;
	setDarkcutEffectIntensity: (intensity: DarkCutEffectIntensity) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	persist(
		(set) => ({
			snappingEnabled: true,

			toggleSnapping: () => {
				set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			},

			rippleEditingEnabled: false,

			darkcutDurationSeconds: 5,
			setDarkcutDurationSeconds: (darkcutDurationSeconds) =>
				set({ darkcutDurationSeconds }),

			darkcutTransitionPreset: "fade",
			setDarkcutTransitionPreset: (darkcutTransitionPreset) =>
				set({ darkcutTransitionPreset }),

			darkcutTransitionFavorites: ["fade", "zoom"],
			toggleDarkcutTransitionFavorite: (preset) =>
				set((state) => ({
					darkcutTransitionFavorites: state.darkcutTransitionFavorites.includes(
						preset,
					)
						? state.darkcutTransitionFavorites.filter(
								(candidate) => candidate !== preset,
							)
						: [...state.darkcutTransitionFavorites, preset],
				})),

			darkcutMotionPreset: "zoom-in",
			setDarkcutMotionPreset: (darkcutMotionPreset) =>
				set({ darkcutMotionPreset }),

			darkcutMotionFavorites: ["zoom-in", "zoom-out", "ken-burns"],
			toggleDarkcutMotionFavorite: (preset) =>
				set((state) => ({
					darkcutMotionFavorites: state.darkcutMotionFavorites.includes(preset)
						? state.darkcutMotionFavorites.filter(
								(candidate) => candidate !== preset,
							)
						: [...state.darkcutMotionFavorites, preset],
				})),

			darkcutEffectIntensity: "soft",
			setDarkcutEffectIntensity: (darkcutEffectIntensity) =>
				set({ darkcutEffectIntensity }),

			toggleRippleEditing: () => {
				set((state) => ({
					rippleEditingEnabled: !state.rippleEditingEnabled,
				}));
			},

			expandedElementIds: new Set<string>(),

			toggleElementExpanded: (elementId) => {
				set((state) => {
					const next = new Set(state.expandedElementIds);
					if (next.has(elementId)) {
						next.delete(elementId);
					} else {
						next.add(elementId);
					}
					return { expandedElementIds: next };
				});
			},
		}),
		{
			name: "timeline-store",
			partialize: (state) => ({
				snappingEnabled: state.snappingEnabled,
				rippleEditingEnabled: state.rippleEditingEnabled,
				darkcutDurationSeconds: state.darkcutDurationSeconds,
				darkcutTransitionPreset: state.darkcutTransitionPreset,
				darkcutTransitionFavorites: state.darkcutTransitionFavorites,
				darkcutMotionPreset: state.darkcutMotionPreset,
				darkcutMotionFavorites: state.darkcutMotionFavorites,
				darkcutEffectIntensity: state.darkcutEffectIntensity,
			}),
		},
	),
);
