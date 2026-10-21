"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import { buildConstantRetime } from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	clampRetimeRate,
} from "@/retime/rate";
import type { AudioElement, VideoElement } from "@/timeline";

export interface GroupAudioTarget {
	trackId: string;
	element: AudioElement | VideoElement;
}

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const volumeOf = (element: AudioElement | VideoElement): number => {
	const value = element.params.volume;
	return typeof value === "number" ? value : 0;
};

const rateOf = (element: AudioElement | VideoElement): number =>
	clampRetimeRate({ rate: element.retime?.rate ?? DEFAULT_RETIME_RATE });

const commonValue = (values: number[]): number | null =>
	values.every((value) => Math.abs(value - values[0]) < 1e-6) ? values[0] : null;

/**
 * Volume, mute and speed for several clips at once, e.g. after selecting a
 * whole music track. Each change is one undo step.
 */
export function GroupAudioPanel({
	targets,
	title,
}: {
	targets: GroupAudioTarget[];
	title: string;
}) {
	const editor = useEditor();
	const commonVolume = commonValue(targets.map((t) => volumeOf(t.element)));
	const commonRate = commonValue(targets.map((t) => rateOf(t.element)));
	const allMuted = targets.every((t) => t.element.params.muted === true);
	// Value while dragging the slider; null means "show what the clips have".
	const [dragVolume, setDragVolume] = useState<number | null>(null);
	const volumeDraft = dragVolume ?? commonVolume ?? 0;

	const commitVolume = (db: number) => {
		setDragVolume(null);
		const volume = Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, db));
		editor.timeline.updateElements({
			updates: targets.map(({ trackId, element }) => ({
				trackId,
				elementId: element.id,
				patch: { params: { ...element.params, volume } },
			})),
		});
	};

	const commitMuted = (muted: boolean) => {
		editor.timeline.updateElements({
			updates: targets.map(({ trackId, element }) => ({
				trackId,
				elementId: element.id,
				patch: { params: { ...element.params, muted } },
			})),
		});
	};

	const commitRate = (nextRate: number) => {
		const rate = clampRetimeRate({ rate: nextRate });
		editor.timeline.updateElements({
			updates: targets.map(({ trackId, element }) => ({
				trackId,
				elementId: element.id,
				patch: {
					retime:
						rate === DEFAULT_RETIME_RATE && !element.retime?.maintainPitch
							? undefined
							: buildConstantRetime({
									rate,
									maintainPitch: element.retime?.maintainPitch ?? false,
								}),
				},
			})),
		});
	};

	return (
		<div className="flex w-full flex-col gap-4 p-3 text-sm">
			<div>
				<p className="font-medium">{title}</p>
				<p className="text-muted-foreground text-xs">
					{targets.length} clipes selecionados. As mudanças valem para todos e
					podem ser desfeitas de uma vez (Ctrl+Z).
				</p>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<label htmlFor="group-volume">Volume</label>
					<span className="text-muted-foreground text-xs tabular-nums">
						{commonVolume === null ? "Misto · " : ""}
						{volumeDraft.toFixed(1)} dB
					</span>
				</div>
				<Slider
					id="group-volume"
					aria-label="Volume dos clipes selecionados"
					min={VOLUME_DB_MIN}
					max={VOLUME_DB_MAX}
					step={0.5}
					value={[volumeDraft]}
					onValueChange={([value]) => setDragVolume(value)}
					onValueCommit={([value]) => commitVolume(value)}
				/>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground text-xs underline"
					onClick={() => commitVolume(0)}
				>
					Voltar para 0 dB
				</button>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<label htmlFor="group-speed">Velocidade</label>
					<span className="text-muted-foreground text-xs tabular-nums">
						{commonRate === null ? "Misto" : `${commonRate}x`}
					</span>
				</div>
				<div id="group-speed" className="flex flex-wrap gap-1">
					{SPEED_PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => commitRate(preset)}
							aria-pressed={commonRate === preset}
							className={`rounded border px-2 py-1 text-xs ${
								commonRate === preset
									? "bg-primary text-primary-foreground"
									: "bg-background hover:bg-accent"
							}`}
						>
							{preset}x
						</button>
					))}
				</div>
			</div>

			<div className="flex items-center justify-between">
				<label htmlFor="group-muted">Silenciar</label>
				<Switch
					id="group-muted"
					checked={allMuted}
					onCheckedChange={commitMuted}
				/>
			</div>
		</div>
	);
}
