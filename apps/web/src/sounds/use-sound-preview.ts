"use client";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import type { SoundEffect } from "./types";

// One browser audio element for the entire library, including pending play().
let current: HTMLAudioElement | null = null;
let playingId: number | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export function stopSoundPreview() {
	const previous = current;
	current = null;
	playingId = null;
	if (previous) {
		previous.pause();
		previous.removeAttribute("src");
		previous.load();
	}
	notify();
}
export function playSound({ sound }: { sound: SoundEffect }) {
	const wasSelected = playingId === sound.id;
	stopSoundPreview();
	if (wasSelected) return;
	if (!sound.previewUrl) {
		toast.error("Prévia indisponível.");
		return;
	}
	const audio = new Audio(sound.previewUrl);
	current = audio;
	playingId = sound.id;
	notify();
	audio.onended = () => {
		if (current === audio) stopSoundPreview();
	};
	audio.onerror = () => {
		if (current === audio) {
			stopSoundPreview();
			toast.error("Não foi possível carregar a prévia.");
		}
	};
	void audio
		.play()
		.then(() => {
			if (current !== audio) audio.pause();
		})
		.catch(() => {
			if (current === audio) {
				stopSoundPreview();
				toast.error("Falha ao reproduzir a prévia.");
			}
		});
}
export function useSoundPreview() {
	const activeTab = useAssetsPanelStore((s) => s.activeTab);
	const id = useSyncExternalStore(
		(fn) => {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
		() => playingId,
		() => null,
	);
	useEffect(() => {
		if (activeTab !== "sounds") stopSoundPreview();
	}, [activeTab]);
	useEffect(() => () => stopSoundPreview(), []);
	return { playingId: id, playSound };
}
