"use client";

import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	applyFixedDuration,
	applyRandomMotions,
	applyRandomTransitions,
	autoEditWithNarration,
} from "@/timeline/darkcut-tools";
import {
	useTimelineStore,
	type DarkCutEffectIntensity,
	type DarkCutMotionPreset,
	type DarkCutTransitionPreset,
} from "@/timeline/timeline-store";
import type { ElementRef, TScene } from "@/timeline/types";
import { toast } from "sonner";

type DarkCutTemplate = {
	id: string;
	title: string;
	tagline: string;
	description: string;
	durationSeconds: number;
	motions: DarkCutMotionPreset[];
	transitions: DarkCutTransitionPreset[];
	intensity: DarkCutEffectIntensity;
	badge: string;
};

const TEMPLATES: DarkCutTemplate[] = [
	{
		id: "documentary",
		title: "Documentário",
		tagline: "OBSERVAR • CONTEXTUALIZAR",
		description:
			"Ritmo contido, movimentos discretos e transições suaves para vídeos narrados.",
		durationSeconds: 5,
		motions: ["documentary", "zoom-in", "ken-burns"],
		transitions: ["fade", "ken-burns"],
		intensity: "soft",
		badge: "🎥",
	},
	{
		id: "pov",
		title: "POV",
		tagline: "PERSONAGEM • EMOÇÃO",
		description:
			"Mais proximidade, aproximações de câmera e mudanças de intensidade.",
		durationSeconds: 3,
		motions: ["push-in", "zoom-in", "pan-left-right"],
		transitions: ["zoom", "pop", "fade"],
		intensity: "normal",
		badge: "🎭",
	},
	{
		id: "vox",
		title: "VOX • Explainer",
		tagline: "EXPLICAR • MOSTRAR EVIDÊNCIAS",
		description:
			"Montagem editorial mais dinâmica, movimentos laterais e cortes curtos.",
		durationSeconds: 3.5,
		motions: ["pan-left-right", "pan-right-left", "zoom-in"],
		transitions: ["slide-left", "slide-right", "fade"],
		intensity: "normal",
		badge: "📺",
	},
	{
		id: "cinematic",
		title: "Cinematográfico",
		tagline: "ATMOSFERA • CONTEMPLAÇÃO",
		description:
			"Planos mais longos, movimentos lentos e transições discretas.",
		durationSeconds: 7,
		motions: ["ken-burns", "pull-out", "zoom-out"],
		transitions: ["fade"],
		intensity: "soft",
		badge: "🎬",
	},
	{
		id: "educational",
		title: "Educativo",
		tagline: "CLAREZA • PASSO A PASSO",
		description:
			"Ritmo equilibrado para tutoriais, explicações e conteúdo didático.",
		durationSeconds: 4,
		motions: ["zoom-in", "pan-up-down", "documentary"],
		transitions: ["fade", "slide-left"],
		intensity: "soft",
		badge: "🧠",
	},
	{
		id: "list",
		title: "Lista dinâmica",
		tagline: "RITMO • DESTAQUES",
		description:
			"Cortes curtos e movimentos variados para listas e vídeos de alta cadência.",
		durationSeconds: 2.8,
		motions: ["zoom-in", "push-in", "pan-right-left"],
		transitions: ["pop", "zoom", "slide-right"],
		intensity: "normal",
		badge: "⚡",
	},
];

function collectVisualRefs(scene: TScene | null) {
	if (!scene) return [] as ElementRef[];
	const tracks = [scene.tracks.main, ...scene.tracks.overlay];
	const refs: ElementRef[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "image" || element.type === "video") {
				refs.push({ trackId: track.id, elementId: element.id });
			}
		}
	}
	return refs;
}

export function DarkCutTemplatesView() {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const {
		setDarkcutDurationSeconds,
		setDarkcutMotionPreset,
		setDarkcutTransitionPreset,
		setDarkcutEffectIntensity,
	} = useTimelineStore();

	const applyTemplate = (template: DarkCutTemplate) => {
		if (!scene) {
			toast.error("Abra um projeto antes de aplicar o template.");
			return;
		}

		const refs = collectVisualRefs(scene);
		if (refs.length === 0) {
			toast.error("Adicione imagens ou vídeos à timeline primeiro.");
			return;
		}

		setDarkcutDurationSeconds(template.durationSeconds);
		setDarkcutMotionPreset(template.motions[0] ?? "zoom-in");
		setDarkcutTransitionPreset(template.transitions[0] ?? "fade");
		setDarkcutEffectIntensity(template.intensity);

		const hasNarration = scene.tracks.audio.some(
			(track) =>
				track.name.includes("Narração") &&
				track.elements.some((element) => element.type === "audio"),
		);

		let changed = refs.length;
		if (hasNarration) {
			const result = autoEditWithNarration({
				editor,
				refs,
				motionPresets: template.motions,
				transitionPresets: template.transitions,
				intensity: template.intensity,
			});
			changed = result.changed;
		} else {
			applyFixedDuration({
				editor,
				refs,
				seconds: template.durationSeconds,
			});
			applyRandomMotions({
				editor,
				refs,
				presets: template.motions,
				intensity: template.intensity,
			});
			applyRandomTransitions({
				editor,
				refs,
				presets: template.transitions,
			});
		}

		toast.success(`${template.title} aplicado.`, {
			description: `${changed} cena(s) atualizadas. Tudo continua editável na timeline.`,
		});
	};

	return (
		<div className="flex h-full flex-col overflow-hidden p-4">
			<div className="mb-3">
				<h2 className="text-base font-semibold">Templates do DarkCut</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Um clique aplica ritmo, duração, movimento e transições. Depois você
					pode mover e editar cada clipe normalmente na timeline.
				</p>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto pr-1">
				<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
					{TEMPLATES.map((template) => (
						<div
							key={template.id}
							className="rounded-xl border bg-card p-4 shadow-sm"
						>
							<div className="flex items-start gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
									{template.badge}
								</div>
								<div className="min-w-0 flex-1">
									<h3 className="font-semibold">{template.title}</h3>
									<p className="mt-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-primary">
										{template.tagline}
									</p>
								</div>
							</div>

							<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
								{template.description}
							</p>

							<div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] text-muted-foreground">
								<span className="rounded border px-2 py-1">
									✂ {template.durationSeconds}s
								</span>
								<span className="rounded border px-2 py-1">
									🎥 {template.motions.length} movimentos
								</span>
								<span className="rounded border px-2 py-1">
									🎞 {template.transitions.length} transições
								</span>
								<span className="rounded border px-2 py-1">
									✨ {template.intensity}
								</span>
							</div>

							<Button
								className="mt-4 w-full"
								onClick={() => applyTemplate(template)}
							>
								✓ Aplicar template
							</Button>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
