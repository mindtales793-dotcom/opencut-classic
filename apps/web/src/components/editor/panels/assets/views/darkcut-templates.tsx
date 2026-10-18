"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSubtitleTextElement } from "@/subtitles/build-subtitle-text-element";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	motionAnimations,
	transitionAnimations,
	applyFixedDuration,
	applyRandomMotions,
	applyRandomTransitions,
	autoEditWithNarration,
	applyMotionPreset,
	applyTransitionPreset,
	syncVisualsToNarration,
} from "@/timeline/darkcut-tools";
import {
	useTimelineStore,
	type DarkCutEffectIntensity,
	type DarkCutMotionPreset,
	type DarkCutTransitionPreset,
} from "@/timeline/timeline-store";
import {
	buildElementFromMedia,
	buildTextElement,
	buildEffectElement,
} from "@/timeline/element-utils";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import { useAssetsPanelStore } from "../assets-panel-store";
import type { ImageElement, TimelineElement } from "@/timeline/types";
import type { ElementRef, TScene } from "@/timeline/types";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import { useProjectDraft } from "@/darkcut/project-draft";
import { useDarkCutProductionStore } from "../darkcut-production-store";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SoundEffect } from "@/sounds/types";
import { buildCrisSoundTimeline, isCrisAutoSoundLicense } from "@/darkcut/cris-sound-design";
import { DarkCutRemotionPreview } from "@/remotion/darkcut-composer";
import {
	RETRO_VISUAL_MODES,
	retroTextStyle,
	type RetroVisualMode,
} from "@/darkcut/retro-automotive";
import { describeTemplateScene, getTemplateVisualProfile } from "@/darkcut/template-visual-profiles";
import {
	buildLocalCrisPlan,
	type CrisEditPlan,
	type CrisTemplateContext,
	type CrisVisualEffect,
} from "@/darkcut/cris";

type TemplateCategory =
	"Todos" | "POV" | "Financeiro" | "Documentário" | "Educativo" | "Social";

type DarkCutTemplate = {
	id: string;
	title: string;
	tagline: string;
	description: string;
	category: Exclude<TemplateCategory, "Todos">;
	idealFor: string;
	durationSeconds: number;
	motions: DarkCutMotionPreset[];
	transitions: DarkCutTransitionPreset[];
	intensity: DarkCutEffectIntensity;
	effects: CrisVisualEffect[];
	badge: string;
	accent: string;
};

const FAVORITES_KEY = "darkcut-template-favorites";

const TEMPLATES: DarkCutTemplate[] = [
	{
		id: "retro-automotive",
		title: "Arquivo Automotivo Premium",
		tagline: "ARQUIVOS • COMPARAÇÕES • DADOS",
		description:
			"Documentário investigativo inspirado em cartões de arquivo retrô: números gigantes, comparações, mapas técnicos, evidências e tela dividida. A Cris escolhe a composição conforme a fala.",
		category: "Documentário",
		idealFor: "listas de carros, regras, comparações, financiamento, histórias automotivas",
		durationSeconds: 4.5,
		motions: ["documentary", "push-in", "pan-left-right", "ken-burns"],
		transitions: ["fade", "slide-left", "slide-right"],
		intensity: "normal",
		effects: ["none"],
		badge: "🗂️",
		accent: "from-[#a81818]/25 via-[#f4eedb]/10 to-[#d4a359]/25",
	},
	{
		id: "pov-finance",
		title: "POV Financeiro",
		tagline: "HOOK • DECISÃO • CONSEQUÊNCIA",
		description:
			"Pensado para histórias financeiras com narração forte, viradas e cenas frequentes sem exagerar nos efeitos.",
		category: "Financeiro",
		idealFor: "carro, dívida, CLT, investimento e escolhas financeiras",
		durationSeconds: 4.5,
		motions: ["push-in", "documentary", "zoom-in", "ken-burns"],
		transitions: ["fade", "zoom", "slide-left"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "💸",
		accent: "from-emerald-500/20 via-transparent to-cyan-500/10",
	},
	{
		id: "pov-car",
		title: "POV Carro",
		tagline: "PERSONAGEM • CARRO • EMOÇÃO",
		description:
			"Ritmo para narrativas de compra, financiamento, Uber, troca de carro e decisões automotivas.",
		category: "POV",
		idealFor: "carros, financiamento, Uber e histórias de conquista",
		durationSeconds: 4,
		motions: ["push-in", "zoom-in", "pan-left-right"],
		transitions: ["zoom", "fade", "pop"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "🚗",
		accent: "from-red-500/20 via-transparent to-orange-500/10",
	},
	{
		id: "dark-channel",
		title: "Dark Channel",
		tagline: "TENSÃO • NARRAÇÃO • IMERSÃO",
		description:
			"Movimentos discretos, ritmo controlado e transições suaves para vídeos narrados sem aparecer em câmera.",
		category: "Documentário",
		idealFor: "dark channels, curiosidades, histórias e documentários narrados",
		durationSeconds: 5,
		motions: ["documentary", "ken-burns", "pull-out"],
		transitions: ["fade", "ken-burns"],
		intensity: "soft",
		effects: ["none", "blur"],
		badge: "🌑",
		accent: "from-violet-500/20 via-transparent to-slate-500/10",
	},
	{
		id: "documentary",
		title: "Documentário",
		tagline: "OBSERVAR • CONTEXTUALIZAR",
		description:
			"Ritmo contido, movimentos discretos e transições suaves para vídeos narrados.",
		category: "Documentário",
		idealFor: "histórias longas, contexto, investigação e narrativa",
		durationSeconds: 5,
		motions: ["documentary", "zoom-in", "ken-burns"],
		transitions: ["fade", "ken-burns"],
		intensity: "soft",
		effects: ["none", "blur"],
		badge: "🎥",
		accent: "from-blue-500/20 via-transparent to-indigo-500/10",
	},
	{
		id: "pov",
		title: "POV Dinâmico",
		tagline: "PERSONAGEM • EMOÇÃO",
		description:
			"Mais proximidade, aproximações de câmera e mudanças de intensidade.",
		category: "POV",
		idealFor: "histórias em primeira pessoa e storytelling emocional",
		durationSeconds: 3,
		motions: ["push-in", "zoom-in", "pan-left-right"],
		transitions: ["zoom", "pop", "fade"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "🎭",
		accent: "from-fuchsia-500/20 via-transparent to-rose-500/10",
	},
	{
		id: "vox",
		title: "VOX • Explainer",
		tagline: "EXPLICAR • MOSTRAR EVIDÊNCIAS",
		description:
			"Montagem editorial mais dinâmica, movimentos laterais e cortes curtos.",
		category: "Educativo",
		idealFor: "explicações, dados, gráficos e conteúdo informativo",
		durationSeconds: 3.5,
		motions: ["pan-left-right", "pan-right-left", "zoom-in"],
		transitions: ["slide-left", "slide-right", "fade"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "📺",
		accent: "from-sky-500/20 via-transparent to-cyan-500/10",
	},
	{
		id: "cinematic",
		title: "Cinematográfico",
		tagline: "ATMOSFERA • CONTEMPLAÇÃO",
		description:
			"Planos mais longos, movimentos lentos e transições discretas.",
		category: "Documentário",
		idealFor: "aberturas, momentos emocionais e cenas de impacto",
		durationSeconds: 7,
		motions: ["ken-burns", "pull-out", "zoom-out"],
		transitions: ["fade"],
		intensity: "soft",
		effects: ["none", "blur"],
		badge: "🎬",
		accent: "from-amber-500/20 via-transparent to-orange-500/10",
	},
	{
		id: "educational",
		title: "Educativo",
		tagline: "CLAREZA • PASSO A PASSO",
		description:
			"Ritmo equilibrado para tutoriais, explicações e conteúdo didático.",
		category: "Educativo",
		idealFor: "tutoriais, aulas, passo a passo e explicações",
		durationSeconds: 4,
		motions: ["zoom-in", "pan-up-down", "documentary"],
		transitions: ["fade", "slide-left"],
		intensity: "soft",
		effects: ["none", "blur"],
		badge: "🧠",
		accent: "from-lime-500/20 via-transparent to-emerald-500/10",
	},
	{
		id: "list",
		title: "Lista Dinâmica",
		tagline: "RITMO • DESTAQUES",
		description:
			"Cortes curtos e movimentos variados para listas e vídeos de alta cadência.",
		category: "Social",
		idealFor: "rankings, listas, curiosidades e vídeos rápidos",
		durationSeconds: 2.8,
		motions: ["zoom-in", "push-in", "pan-right-left"],
		transitions: ["pop", "zoom", "slide-right"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "⚡",
		accent: "from-yellow-500/20 via-transparent to-red-500/10",
	},
	{
		id: "storytelling",
		title: "Storytelling",
		tagline: "GANCHO • CONFLITO • VIRADA",
		description:
			"Equilibra cenas curtas e médias para contar uma história sem deixar o vídeo visualmente repetitivo.",
		category: "POV",
		idealFor: "superação, mudança de vida, fracasso, conquista e transformação",
		durationSeconds: 4.2,
		motions: ["documentary", "push-in", "pan-right-left", "zoom-in"],
		transitions: ["fade", "slide-right", "zoom"],
		intensity: "normal",
		effects: ["none", "blur"],
		badge: "📖",
		accent: "from-purple-500/20 via-transparent to-pink-500/10",
	},
];

const CATEGORIES: TemplateCategory[] = [
	"Todos",
	"POV",
	"Financeiro",
	"Documentário",
	"Educativo",
	"Social",
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

/**
 * Lightweight 2D thumbnail for the retro template grid.
 * A single canvas is animated at ~10 fps only while hovered/focused.
 */
function drawRetroAutomotiveCard(
	ctx: CanvasRenderingContext2D,
	time: number,
	secondsPerShot: number,
	active: boolean,
) {
	const index = Math.floor(time / secondsPerShot) % 3;
	const motion = active ? Math.min(1, (time % secondsPerShot) / 0.6) : 1;
	ctx.clearRect(0, 0, 480, 270);
	ctx.fillStyle = index === 1 ? "#222323" : "#f4eedb";
	ctx.fillRect(0, 0, 480, 270);
	ctx.strokeStyle = index === 1 ? "#444443" : "#d2cab7";
	ctx.lineWidth = 1;
	for (let px = 0; px < 480; px += 24) {
		ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, 270); ctx.stroke();
	}
	for (let py = 0; py < 270; py += 24) {
		ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(480, py); ctx.stroke();
	}
	ctx.save();
	ctx.globalAlpha = motion;
	ctx.translate(0, (1 - motion) * 21);
	if (index === 0) {
		ctx.strokeStyle = "#151515"; ctx.lineWidth = 3;
		ctx.strokeRect(17, 22, 446, 228);
		ctx.fillStyle = "#d4a359"; ctx.fillRect(38, 18, 174, 32);
		ctx.fillStyle = "#151515"; ctx.font = "bold 15px monospace";
		ctx.fillText("ARQUIVO / FILE 001", 49, 39);
		ctx.fillStyle = "#a81818"; ctx.font = "900 42px Impact, Arial";
		ctx.fillText("CARROS SOB", 38, 111);
		ctx.fillText("INVESTIGAÇÃO", 38, 154);
		ctx.fillStyle = "#151515"; ctx.fillRect(38, 170, 393, 3);
		ctx.font = "bold 14px monospace"; ctx.fillText("EVIDÊNCIAS • DOCUMENTOS • REGRAS", 38, 200);
	} else if (index === 1) {
		ctx.fillStyle = "#f4eedb"; ctx.font = "bold 14px monospace";
		ctx.textAlign = "center"; ctx.fillText("DOCUMENTÁRIO FINANCEIRO", 240, 52);
		ctx.fillStyle = "#a81818"; ctx.fillRect(238, 67, 4, 34);
		ctx.font = "900 107px Impact, Arial"; ctx.fillText("R$ 12 MIL", 240, 183);
		ctx.fillStyle = "#f4eedb"; ctx.font = "bold 20px monospace";
		ctx.fillText("VALOR À VISTA", 240, 226);
		ctx.textAlign = "left";
	} else {
		ctx.fillStyle = "#151515"; ctx.font = "bold 15px monospace";
		ctx.fillText("ARQUIVO / COMPARAÇÃO", 26, 38);
		ctx.fillStyle = "#a81818"; ctx.font = "900 38px Impact, Arial";
		ctx.fillText("DUAS ESCOLHAS", 24, 87);
		ctx.strokeStyle = "#151515"; ctx.lineWidth = 3; ctx.strokeRect(25, 107, 208, 121);
		ctx.strokeStyle = "#a81818"; ctx.strokeRect(248, 107, 207, 121);
		ctx.fillStyle = "#151515"; ctx.font = "bold 15px monospace";
		ctx.fillText("FINANCIAR", 49, 137);
		ctx.fillStyle = "#a81818"; ctx.fillText("PAGAR À VISTA", 267, 137);
		ctx.fillStyle = "#2d2d2d"; ctx.fillRect(53, 160, 147, 8);
		ctx.fillStyle = "#a81818"; ctx.fillRect(274, 160, 147, 8);
		ctx.fillStyle = "#adadad"; ctx.fillRect(53, 182, 103, 7);
		ctx.fillStyle = "#c99a6e"; ctx.fillRect(274, 182, 84, 7);
	}
	ctx.restore();
	ctx.fillStyle = index === 1 ? "#d4a359" : "#a81818";
	ctx.fillRect(0, 265, 480 * (time / (secondsPerShot * 3)), 5);
}

function TemplatePreview({
	template,
	active,
	title,
	ending,
	posterUrl,
}: {
	template: DarkCutTemplate;
	active: boolean;
	title: string;
	ending: string;
	posterUrl?: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const ctx = canvas.current?.getContext("2d");
		if (!ctx) return;
		const duration = template.durationSeconds;
		const elements = [0, 1, 2].map((index) => {
			const element = {
				...buildElementFromMedia({
					mediaId: "demo",
					mediaType: "image",
					name: "Demo",
					duration: mediaTimeFromSeconds({ seconds: duration }),
					startTime: mediaTimeFromSeconds({ seconds: 0 }),
				}),
				id: `demo-${index}`,
			} as ImageElement;
			element.animations = motionAnimations({
				element,
				preset: template.motions[index % template.motions.length],
				intensity: template.intensity,
			});
			element.animations = transitionAnimations({
				element,
				preset: template.transitions[index % template.transitions.length],
			});
			return element;
		});
		const poster = new Image();
		poster.src = posterUrl || "/darkcut/studio-reference.png";
		const demoCrops: Record<string, [number, number, number, number]> = {
			"pov-finance": [1205, 264, 137, 80],
			"pov-car": [1359, 264, 141, 80],
			"dark-channel": [1514, 264, 137, 80],
			storytelling: [1205, 407, 137, 79],
			documentary: [1359, 407, 141, 79],
			vox: [1514, 407, 137, 79],
		};
		const crop =
			demoCrops[template.id] ??
			demoCrops[template.category === "POV" ? "pov-finance" : "documentary"];
		let timer = 0;
		const start = performance.now();
		const draw = (now: number) => {
			const time = active
				? ((now - start) / 1000) % (duration * 3)
				: duration * 0.4;
			const index = Math.floor(time / duration);
			const localTime = time % duration;
			if (template.id === "retro-automotive") {
				drawRetroAutomotiveCard(ctx, time, duration, active);
				return;
			}
			const animations = elements[index].animations;
			const value = (propertyPath: string, fallbackValue: number) =>
				resolveAnimationPathValueAtTime({
					animations,
					propertyPath,
					localTime: mediaTimeFromSeconds({ seconds: localTime }),
					fallbackValue,
				});
			ctx.fillStyle = "#080c16";
			ctx.fillRect(0, 0, 480, 270);
			ctx.save();
			ctx.globalAlpha = value("opacity", 1);
			ctx.translate(
				240 + value("transform.positionX", 0) / 4,
				135 + value("transform.positionY", 0) / 4,
			);
			ctx.scale(value("transform.scaleX", 1), value("transform.scaleY", 1));
			ctx.rotate((value("transform.rotate", 0) * Math.PI) / 180);
			const hue = (TEMPLATES.indexOf(template) * 33 + index * 20) % 360;
			const gradient = ctx.createLinearGradient(-240, -135, 240, 135);
			gradient.addColorStop(0, `hsl(${hue} 50% 22%)`);
			gradient.addColorStop(1, "#101525");
			ctx.fillStyle = gradient;
			ctx.fillRect(-300, -200, 600, 400);
			// Original illustrative scenery; no remote media or audio downloads.
			for (let n = 0; n < 12; n++) {
				ctx.fillStyle = `hsl(${hue} 35% ${20 + (n % 3) * 7}%)`;
				ctx.fillRect(n * 48 - 280, 15 - ((n * 37 + index * 19) % 110), 35, 200);
			}
			ctx.fillStyle = `hsl(${hue} 90% 75%)`;
			ctx.beginPath();
			ctx.arc(145, -65, 35, 0, Math.PI * 2);
			ctx.fill();
			if (poster?.complete && poster.naturalWidth) {
				const scale = Math.max(
					480 / poster.naturalWidth,
					270 / poster.naturalHeight,
				);
				if (posterUrl)
					ctx.drawImage(
						poster,
						(-poster.naturalWidth * scale) / 2,
						(-poster.naturalHeight * scale) / 2,
						poster.naturalWidth * scale,
						poster.naturalHeight * scale,
					);
				else
					ctx.drawImage(
						poster,
						crop[0],
						crop[1],
						crop[2],
						crop[3],
						-240,
						-135,
						480,
						270,
					);
				ctx.fillStyle = "rgba(0,0,0,0.3)";
				ctx.fillRect(-240, -135, 480, 270);
			}
			ctx.fillStyle = "#ffffff";
			ctx.textAlign = "center";
			ctx.font = "48px sans-serif";
			if (!poster.complete) ctx.fillText(template.badge, 0, -15);
			ctx.font = "bold 22px sans-serif";
			if (active)
				ctx.fillText(
					index === 0
						? title
						: index === 2
							? ending
							: template.tagline.split(" • ")[1] || "Sua história",
					0,
					40,
					420,
				);
			ctx.restore();
			ctx.fillStyle = "#ffffffaa";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "left";
			if (active) ctx.fillText(`DEMONSTRAÇÃO • CENA ${index + 1}/3`, 16, 25);
			ctx.fillStyle = "#ffffff88";
			ctx.fillRect(0, 267, (480 * time) / (duration * 3), 3);
		};
		draw(start);
		if (active) {
			// Template previews are demonstrations, not the main monitor.
			// ~10 FPS is enough to show motion while keeping CPU/GPU usage low.
			timer = window.setInterval(() => draw(performance.now()), 100);
		}
		if (poster && !active) poster.onload = () => draw(start);
		return () => {
			if (timer) window.clearInterval(timer);
			if (poster) poster.onload = null;
		};
	}, [template, active, title, ending, posterUrl]);
	return (
		<canvas
			ref={canvas}
			width={480}
			height={270}
			className="h-full w-full object-cover"
			aria-label={`Demonstração de ${template.title}`}
			data-preview-playing={active}
		/>
	);
}

export function DarkCutTemplatesView({
	compact = false,
}: {
	compact?: boolean;
}) {
	const editor = useEditor();
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
	const [isCrisAnalyzing, setIsCrisAnalyzing] = useState(false);
	const [isCrisSoundApplying, setIsCrisSoundApplying] = useState(false);
	const [soundProgress, setSoundProgress] = useState("");
	const applyingRef = useRef(false);
	const [analysisStep, setAnalysisStep] = useState("");
	const [narrationTrackId, setNarrationTrackId] = useState("");
	const [crisPlan, setCrisPlan] = useProjectDraft<CrisEditPlan | null>(
		"cris-edit-plan",
		null,
	);
	const {
		script,
		geminiApiKey,
		openRouterApiKey,
		geminiApiKeys,
		openRouterApiKeys,
		crisPrimaryProvider,
		crisFallbackProvider,
		geminiModel,
		openRouterModel,
		freesoundApiKey,
	} = useDarkCutProductionStore();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const activeTab = useAssetsPanelStore((s) => s.activeTab);
	const soundCues = useMemo(() => {
		if (!scene || !crisPlan) return [];
		const refs = collectVisualRefs(scene);
		const visuals = [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
			track.elements.map((element) => ({ trackId: track.id, element }))
		);
		const timings = refs.map((ref) => {
			const match = visuals.find((item) => item.trackId === ref.trackId && item.element.id === ref.elementId);
			if (!match) return null;
			return {
				startSeconds: mediaTimeToSeconds({ time: match.element.startTime }),
				durationSeconds: mediaTimeToSeconds({ time: match.element.duration }),
			};
		});
		return buildCrisSoundTimeline({ scenes: crisPlan.scenes, timings });
	}, [scene, crisPlan]);
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [retroPreviewMode, setRetroPreviewMode] = useState<RetroVisualMode>("auto");
	const [intensityChoice, setIntensityChoice] = useProjectDraft<
		DarkCutEffectIntensity | "template"
	>("template-intensity-choice", "template");
	const [addTitles, setAddTitles] = useState(true);
	const [opening, setOpening] = useState("Uma decisão muda tudo");
	const [ending, setEnding] = useState("E você, o que faria?");
	useEffect(() => {
		setPreviewId(null);
	}, [activeTab]);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<TemplateCategory>("Todos");
	const [favorites, setFavorites] = useState<string[]>([]);
	const {
		setDarkcutDurationSeconds,
		setDarkcutMotionPreset,
		setDarkcutTransitionPreset,
		setDarkcutEffectIntensity,
	} = useTimelineStore();

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(FAVORITES_KEY);
			if (stored) setFavorites(JSON.parse(stored) as string[]);
		} catch {
			// Favoritos são conveniência visual; falhas de armazenamento não bloqueiam edição.
		}
	}, []);

	const filteredTemplates = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase("pt-BR");
		return TEMPLATES.filter((template) => {
			const categoryMatch =
				category === "Todos" || template.category === category;
			const textMatch =
				!normalized ||
				[
					template.title,
					template.tagline,
					template.description,
					template.idealFor,
				].some((value) =>
					value.toLocaleLowerCase("pt-BR").includes(normalized),
				);
			return categoryMatch && textMatch;
		}).sort((a, b) => {
			const aFavorite = favorites.includes(a.id) ? 1 : 0;
			const bFavorite = favorites.includes(b.id) ? 1 : 0;
			return bFavorite - aFavorite;
		});
	}, [category, favorites, query]);

	const composerTemplate =
		TEMPLATES.find((template) => template.id === selectedTemplate) ??
		TEMPLATES.find((template) => template.id === previewId) ??
		TEMPLATES.find((template) => template.id === "documentary")!;
	const composerScene = crisPlan?.scenes?.[0];
	const composerIntensity =
		intensityChoice === "template"
			? composerTemplate.intensity
			: intensityChoice;

	const toggleFavorite = (id: string) => {
		setFavorites((current) => {
			const next = current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id];
			try {
				window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
			} catch {
				// Mantém a sessão funcionando mesmo se o navegador bloquear storage.
			}
			return next;
		});
	};

	const requestCrisPlan = async (
		template: DarkCutTemplate,
		visualCount: number,
		analysisScript = script,
	): Promise<CrisEditPlan> => {
		const templateContext: CrisTemplateContext = {
			id: template.id,
			title: template.title,
			motions: template.motions,
			transitions: template.transitions,
			intensity: template.intensity,
			effects: template.effects,
		};
		if (!analysisScript.trim()) {
			return buildLocalCrisPlan({
				script: "",
				visualCount,
				template: templateContext,
			});
		}

		try {
			const response = await fetch("/api/darkcut/cris", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode: "analyze",
					script: analysisScript,
					visualCount,
					template: templateContext,
					primaryProvider: crisPrimaryProvider,
					fallbackProvider: crisFallbackProvider,
					geminiApiKey,
					openRouterApiKey,
					geminiApiKeys,
					openRouterApiKeys,
					geminiModel,
					openRouterModel,
				}),
			});
			const data = (await response.json()) as {
				plan?: CrisEditPlan;
				provider?: string;
				fallbackUsed?: boolean;
				warning?: string;
				error?: string;
			};
			if (!response.ok || !data.plan)
				throw new Error(data.error || "A Cris não conseguiu criar o plano.");
			if (data.warning) {
				toast.info("Cris usou o analisador local.", {
					description: data.warning,
				});
			}
			return data.plan;
		} catch (error) {
			console.error(error);
			toast.info("Cris offline: usando análise local.");
			return buildLocalCrisPlan({
				script: analysisScript,
				visualCount,
				template: templateContext,
			});
		}
	};

	const templateTextParams = (content: string, pixelsAt1080: number) => {
		const canvasSize = editor.project.getActive().settings.canvasSize;
		return buildSubtitleTextElement({
			index: 0,
			canvasSize,
			caption: {
				text: content,
				startTime: 0,
				duration: 1,
				style: {
					fontSizeRatioOfPlayHeight:
						(pixelsAt1080 / 1080) *
						Math.min(1, canvasSize.width / canvasSize.height),
					placement: {
						verticalAlign: "middle",
						marginLeftRatio: 0.1,
						marginRightRatio: 0.1,
					},
					background: {
						enabled: true,
						color: "#0b0d12d9",
						paddingX: 20,
						paddingY: 12,
					},
				},
			},
		}).params;
	};

	const applyCrisPlan = ({
		plan,
		refs,
		template,
	}: {
		plan: CrisEditPlan;
		refs: ElementRef[];
		template: DarkCutTemplate;
	}) => {
		for (const [index, ref] of refs.entries()) {
			const item = plan.scenes[index];
			if (!item) continue;
			applyMotionPreset({
				editor,
				refs: [ref],
				preset: item.motion,
				intensity: item.intensity,
			});
			applyTransitionPreset({
				editor,
				refs: [ref],
				preset: item.transition,
			});
		}

		const updated = editor.scenes.getActiveScene();
		const oldTextTrack = updated.tracks.overlay.find(
			(track) => track.type === "text" && track.name === "T • Cris",
		);
		if (oldTextTrack?.elements.length) {
			editor.timeline.deleteElements({
				elements: oldTextTrack.elements.map((element) => ({
					trackId: oldTextTrack.id,
					elementId: element.id,
				})),
			});
		}
		const textTrackId =
			oldTextTrack?.id ??
			editor.timeline.addTrack({ type: "text", name: "T • Cris" });

		const afterMotion = editor.scenes.getActiveScene();
		const visualByRef = new Map(
			[afterMotion.tracks.main, ...afterMotion.tracks.overlay]
				.flatMap((track) =>
					track.elements.map((element) => ({
						ref: `${track.id}:${element.id}`,
						element,
					})),
				)
				.filter(
					(item) =>
						item.element.type === "image" || item.element.type === "video",
				)
				.map((item) => [item.ref, item.element] as const),
		);

		for (const [index, ref] of refs.entries()) {
			const item = plan.scenes[index];
			if (!item) continue;
			const isRetro = template.id === "retro-automotive";
			const retroHighlight = item.visualSlot !== "default" ||
				item.sceneType === "hook" ||
				item.sceneType === "number" ||
				item.sceneType === "turn";
			// Keep long documentary projects responsive: show a card for meaningful
			// moments, and at most one optional context card per five shots.
			const displayContext = isRetro
				? retroHighlight || index % 5 === 0
				: retroHighlight && index % (template.durationSeconds > 5 ? 4 : 3) === 0;
			const overlayText = item.overlayText.trim() ||
				(displayContext ? item.summary.slice(0, 58) : "");
			if (!overlayText) continue;
			const visual = visualByRef.get(`${ref.trackId}:${ref.elementId}`);
			if (!visual) continue;
			const visualStyle = isRetro
				? retroTextStyle({
					visualSlot: item.visualSlot,
					sceneType: item.sceneType,
					intensity: template.intensity,
				})
				: describeTemplateScene({
					profileId: template.id,
					visualSlot: item.visualSlot,
					sceneType: item.sceneType,
					intensity: template.intensity,
				});
			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId: textTrackId },
				element: buildTextElement({
					startTime: visual.startTime,
					raw: {
						name: `Cris • ${visualStyle.label} • ${template.title}`,
						duration: visual.duration,
						params: {
							...templateTextParams(
								overlayText,
								visualStyle.fontSize,
							),
							fontWeight: "bold",
							color: visualStyle.color,
							"background.enabled": true,
							"background.color": visualStyle.background,
							"background.paddingX": visualStyle.paddingX,
							"background.paddingY": visualStyle.paddingY,
						},
					},
				}),
			});
		}

		const refreshed = editor.scenes.getActiveScene();
		const oldFxTrack = refreshed.tracks.overlay.find(
			(track) => track.type === "effect" && track.name === "FX • Cris",
		);
		if (oldFxTrack?.elements.length) {
			editor.timeline.deleteElements({
				elements: oldFxTrack.elements.map((element) => ({
					trackId: oldFxTrack.id,
					elementId: element.id,
				})),
			});
		}
		const blurItems = refs
			.map((ref, index) => ({ ref, item: plan.scenes[index] }))
			.filter(({ item }) => item?.effect === "blur");
		if (blurItems.length) {
			const fxTrackId =
				oldFxTrack?.id ??
				editor.timeline.addTrack({ type: "effect", name: "FX • Cris" });
			const nowScene = editor.scenes.getActiveScene();
			const elements = new Map(
				[nowScene.tracks.main, ...nowScene.tracks.overlay].flatMap((track) =>
					track.elements.map(
						(element) => [`${track.id}:${element.id}`, element] as const,
					),
				),
			);
			for (const { ref } of blurItems) {
				const visual = elements.get(`${ref.trackId}:${ref.elementId}`);
				if (!visual || (visual.type !== "image" && visual.type !== "video"))
					continue;
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: fxTrackId },
					element: buildEffectElement({
						effectType: "blur",
						startTime: visual.startTime,
						duration: mediaTimeFromSeconds({
							seconds: Math.min(
								0.45,
								Math.max(
									0.18,
									mediaTimeToSeconds({ time: visual.duration }) * 0.12,
								),
							),
						}),
					}),
				});
			}
		}
	};

	const applyTemplate = async (sourceTemplate: DarkCutTemplate) => {
		const template: DarkCutTemplate = {
			...sourceTemplate,
			intensity: intensityChoice === "template" ? sourceTemplate.intensity : intensityChoice,
		};
		if (applyingRef.current) return;
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
				track.name.toLocaleLowerCase("pt-BR").includes("narra") &&
				track.elements.some((element) => element.type === "audio"),
		);

		let changed = refs.length;
		applyingRef.current = true;
		setIsCrisAnalyzing(true);
		setAnalysisStep("Preparando template…");
		try {
			let analysisScript = script;
			if (narrationTrackId) {
				const track = scene.tracks.audio.find(
					(item) => item.id === narrationTrackId,
				);
				if (!track || !track.elements.length)
					throw new Error("A faixa de narração selecionada está vazia.");
				setAnalysisStep("Preparando áudio da narração…");
				const audioBlob = await extractTimelineAudio({
					tracks: {
						...scene.tracks,
						main: { ...scene.tracks.main, elements: [] },
						overlay: [],
						audio: [{ ...track, muted: false }],
					},
					mediaAssets: editor.media.getAssets(),
					totalDuration: editor.timeline.getTotalDuration(),
				});
				const { samples } = await decodeAudioToFloat32({
					audioBlob,
					sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
				});
				const transcript = await transcriptionService.transcribe({
					audioData: samples,
					onProgress: (progress) => {
						setAnalysisStep(
							progress.status === "loading-model"
								? `Baixando modelo de voz: ${Math.round(progress.progress)}%`
								: "Transcrevendo narração…",
						);
					},
				});
				if (!transcript.segments.length)
					throw new Error("Não foi possível identificar fala na narração.");
				analysisScript = `TRANSCRIÇÃO REAL (segundos na timeline):\n${transcript.segments.map((segment) => `[${segment.start.toFixed(2)}–${segment.end.toFixed(2)}] ${segment.text}`).join("\n")}\n\nROTEIRO DE REFERÊNCIA:\n${script}`;
			}
			if (editor.scenes.getActiveSceneOrNull()?.id !== scene.id)
				throw new Error(
					"O projeto mudou durante a análise. Aplique o template no projeto atual.",
				);
			setAnalysisStep("Cris: analisando roteiro e montando cenas…");
			if (narrationTrackId) {
				// Keep the existing media intervals when analyzing a specific voice track.
			} else if (hasNarration) {
				const result = syncVisualsToNarration({ editor, refs });
				changed = result.changed || refs.length;
			} else {
				applyFixedDuration({
					editor,
					refs,
					seconds: template.durationSeconds,
				});
			}
			const current = editor.scenes.getActiveScene();
			const targets = [current.tracks.main, ...current.tracks.overlay].flatMap(
				(track) =>
					track.elements.map((element) => ({ trackId: track.id, element })),
			);
			const timings = refs
				.map((ref, index) => {
					const target = targets.find(
						(item) =>
							item.trackId === ref.trackId && item.element.id === ref.elementId,
					)?.element;
					if (!target) return "";
					const start = mediaTimeToSeconds({ time: target.startTime });
					return `Cena ${index}: ${start.toFixed(2)}–${(start + mediaTimeToSeconds({ time: target.duration })).toFixed(2)} segundos`;
				})
				.join("\n");
			const plan = await requestCrisPlan(
				template,
				refs.length,
				`${analysisScript}\n\nINTERVALOS DAS MÍDIAS (respeite a fala correspondente a cada intervalo):\n${timings}`,
			);
			if (editor.scenes.getActiveSceneOrNull()?.id !== scene.id)
				throw new Error("O projeto mudou durante a análise.");
			setCrisPlan(plan);
			applyCrisPlan({ plan, refs, template });
		} catch (error) {
			console.error(error);
			if (narrationTrackId) {
				toast.error(
					error instanceof Error
						? error.message
						: "Falha ao transcrever ou montar. Tente novamente.",
				);
				return;
			}
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
			toast.error("A Cris falhou; o template básico foi aplicado.");
		} finally {
			setIsCrisAnalyzing(false);
			applyingRef.current = false;
			setAnalysisStep("");
		}

		if (addTitles) {
			const updated = editor.scenes.getActiveScene();
			const visuals = [updated.tracks.main, ...updated.tracks.overlay]
				.flatMap((t) => t.elements as TimelineElement[])
				.filter((e) => e.type === "image" || e.type === "video");
			const start = Math.min(
				...visuals.map((e) => mediaTimeToSeconds({ time: e.startTime })),
			);
			const end = Math.max(
				...visuals.map(
					(e) =>
						mediaTimeToSeconds({ time: e.startTime }) +
						mediaTimeToSeconds({ time: e.duration }),
				),
			);
			const length = Math.min(template.durationSeconds, (end - start) / 2);
			const old = updated.tracks.overlay.find((t) => t.name === "T • Template");
			if (old?.elements.length)
				editor.timeline.deleteElements({
					elements: old.elements.map((e) => ({
						trackId: old.id,
						elementId: e.id,
					})),
				});
			const trackId =
				old?.id ??
				editor.timeline.addTrack({ type: "text", name: "T • Template" });
			for (const [content, seconds, name] of [
				[opening.trim(), start, "Abertura"],
				[ending.trim(), end - length, "Encerramento"],
			] as const) {
				if (!content || length <= 0) continue;
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId },
					element: buildTextElement({
						startTime: mediaTimeFromSeconds({ seconds }),
						raw: {
							name: `${name} • ${template.title}`,
							duration: mediaTimeFromSeconds({ seconds: length }),
							params: {
								...templateTextParams(content, 64),
								fontWeight: "bold",
								color: "#ffffff",
								"background.enabled": true,
								"background.color": "#101525cc",
								"background.paddingX": 24,
								"background.paddingY": 16,
							},
						},
					}),
				});
			}
		}
		setSelectedTemplate(template.id);
		toast.success(`${template.title} aplicado pela Cris.`, {
			description: `${changed} cena(s) montadas. Movimentos, transições, textos e efeitos continuam editáveis.`,
		});
	};

	const applyCrisSoundDesign = async () => {
		if (isCrisSoundApplying || !scene || !crisPlan) return;
		if (!freesoundApiKey.trim()) {
			toast.error("Cadastre a chave Freesound em Configurações > APIs.");
			return;
		}
		if (!soundCues.length) {
			toast.info("A Cris preferiu silêncio nestas cenas. Aplique um template com roteiro ou narração.");
			return;
		}
		const existing = scene.tracks.audio.find((track) => track.name === "A3 • Efeitos CRIS" && track.elements.length);
		if (existing) {
			toast.info("A trilha CRIS já tem efeitos. Revise/remova os existentes antes de gerar novamente.");
			return;
		}
		const sceneId = scene.id;
		const projectId = editor.project.getActive().metadata.id;
		const cues = soundCues.slice(0, 16);
		const soundCache = new Map<string, SoundEffect | null>();
		let inserted = 0;
		let skipped = 0;
		setIsCrisSoundApplying(true);
		try {
			for (const [index, cue] of cues.entries()) {
				if (editor.project.getActive().metadata.id !== projectId || editor.scenes.getActiveSceneOrNull()?.id !== sceneId) {
					throw new Error("Projeto/cena alterado. Interrompendo aplicação de efeitos.");
				}
				setSoundProgress(`Som ${index + 1}/${cues.length}: ${cue.query}`);
				let sound = soundCache.get(cue.query);
				if (sound === undefined) {
					const qs = new URLSearchParams({
						q: cue.query, type: "effects", commercial_only: "true",
						min_rating: "0", page_size: "30", sort: "score",
					});
					const response = await fetch(`/api/sounds/search?${qs}`, {
						headers: { "x-darkcut-freesound-key": freesoundApiKey.trim() },
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({})) as { error?: string };
						throw new Error(err.error || `Busca Freesound HTTP ${response.status}`);
					}
					const data = await response.json() as { results?: SoundEffect[] };
					sound = data.results?.find((item) =>
						isCrisAutoSoundLicense(item.license) && Boolean(item.downloadUrl || item.previewUrl)
					) ?? null;
					soundCache.set(cue.query, sound);
				}
				if (!sound) { skipped += 1; continue; }
				const added = await useSoundsStore.getState().addSoundToTimeline({
					sound,
					startSeconds: cue.startSeconds,
					maxDurationSeconds: cue.maxDurationSeconds,
					volumeDb: cue.volumeDb,
					trackName: "A3 • Efeitos CRIS",
				});
				if (added) inserted += 1; else skipped += 1;
			}
			if (soundCues.length > cues.length) {
				toast.info(`Cris aplicou até 16 sugestões por rodada. ${soundCues.length - cues.length} aguardam revisão para preservar a performance.`);
			}
			toast.success(`Cris: ${inserted} efeito(s) na timeline; ${skipped} ignorado(s).`, {
				description: "Sons CC0, faixa dedicada, duração limitada e volume discreto. Você pode editar cada um.",
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível completar a edição sonora.");
		} finally {
			setSoundProgress("");
			setIsCrisSoundApplying(false);
		}
	};

	const narrationControls = (
		<div className="space-y-2 p-2">
			<label className="block text-xs">
				Fonte da fala para a Cris
				<select
					className="mt-1 w-full rounded border bg-background p-2"
					value={narrationTrackId}
					disabled={isCrisAnalyzing}
					onChange={(event) => setNarrationTrackId(event.target.value)}
				>
					<option value="">Usar roteiro (sem transcrever)</option>
					{scene?.tracks.audio.map((track) => (
						<option key={track.id} value={track.id}>
							Transcrever: {track.name}
						</option>
					))}
				</select>
			</label>
			<p className="text-xs text-muted-foreground">
				Selecione a faixa de voz, sem música. Whisper baixa o modelo no primeiro
				uso.
			</p>
			{crisPlan && (
				<div className="rounded-lg border bg-card p-3 text-xs space-y-2">
					<div className="flex items-center justify-between gap-2">
						<strong>🔊 CRIS • Efeitos sonoros</strong>
						<span className="text-muted-foreground">{soundCues.length} sugestões</span>
					</div>
					{soundCues.slice(0, 4).map((cue) => (
						<p key={`${cue.sceneIndex}-${cue.startSeconds}`} className="text-muted-foreground">
							{cue.startSeconds.toFixed(1)}s · {cue.query}
						</p>
					))}
					<Button size="sm" className="w-full" disabled={isCrisSoundApplying || isCrisAnalyzing || soundCues.length === 0} onClick={applyCrisSoundDesign}>
						{isCrisSoundApplying ? "Inserindo efeitos…" : "🔊 Aplicar efeitos da CRIS à timeline"}
					</Button>
					{soundProgress && <p role="status">{soundProgress}</p>}
					<p className="text-muted-foreground">Até 16 sons por rodada, com licença CC0, sem substituir áudio existente. Confira os efeitos antes de exportar.</p>
				</div>
			)}
			{isCrisAnalyzing && (
				<p role="status" aria-live="polite" className="text-xs text-primary">
					{analysisStep}
				</p>
			)}
		</div>
	);

	if (compact)
		return (
			<section className="studio-template-gallery">
				<header>
					<h2>Templates</h2>
					<button onClick={() => setActiveTab("templates")}>Ver todos ›</button>
				</header>
				{narrationControls}
				<div className="studio-template-grid">
					{[
						...TEMPLATES
					]
						.map((template) => (
							<div
								key={template.id}
								className={`studio-template-card ${selectedTemplate === template.id ? "selected" : ""}`}
								onMouseEnter={() => {
									if (
										!window.matchMedia("(prefers-reduced-motion: reduce)")
											.matches
									)
										setPreviewId(template.id);
								}}
								onMouseLeave={() => setPreviewId(null)}
							>
								<button
									className="studio-template-poster"
									aria-label={`Aplicar ${template.title}`}
									disabled={isCrisAnalyzing}
									onClick={() => applyTemplate(template)}
									onFocus={() => {
										if (
											!window.matchMedia("(prefers-reduced-motion: reduce)")
												.matches
										)
											setPreviewId(template.id);
									}}
									onBlur={() => setPreviewId(null)}
								>
									<TemplatePreview
										template={template}
										active={
											previewId === template.id && activeTab === "production"
										}
										title={opening}
										ending={ending}
									/>
									{selectedTemplate === template.id && (
										<span className="studio-template-check">✓</span>
									)}
								</button>
								<button
									className="studio-template-caption"
									disabled={isCrisAnalyzing}
									onClick={() => applyTemplate(template)}
								>
									<strong>{template.title}</strong>
									<small>{template.tagline.split(" • ").join(" · ")}</small>
								</button>
							</div>
						))}
				</div>
			</section>
		);

	return (
		<div
			data-template-library="true"
			className="flex h-full flex-col overflow-hidden p-4"
		>
			{narrationControls}
			<div className="mb-3 rounded-xl border bg-card p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary">
							DarkCut Style Engine
						</p>
						<h2 className="mt-1 text-base font-semibold">
							Templates profissionais
						</h2>
						<p className="mt-1 max-w-xl text-xs text-muted-foreground">
							Escolha o template depois de colocar suas imagens/vídeos. A Cris
							analisa o roteiro e monta movimentos, transições, textos e efeitos
							de acordo com cada cena. Tudo continua editável.
						</p>
					</div>
					<div className="rounded-lg border bg-background px-3 py-2 text-right">
						<div className="text-lg font-semibold">{TEMPLATES.length}</div>
						<div className="text-[0.65rem] text-muted-foreground">estilos</div>
					</div>
				</div>

				<div className="mt-3 space-y-2 rounded-lg border p-3 text-xs">
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={addTitles}
							onChange={(e) => setAddTitles(e.target.checked)}
						/>
						Incluir abertura e encerramento editáveis
					</label>
					{addTitles && (
						<>
							<input
								aria-label="Texto de abertura"
								value={opening}
								onChange={(e) => setOpening(e.target.value)}
								className="w-full rounded border bg-background p-2"
							/>
							<input
								aria-label="Texto de encerramento"
								value={ending}
								onChange={(e) => setEnding(e.target.value)}
								className="w-full rounded border bg-background p-2"
							/>
						</>
					)}
					<div className="space-y-1.5">
						<label htmlFor="darkcut-template-intensity" className="block text-xs font-semibold">
							Intensidade das animações
						</label>
						<select
							id="darkcut-template-intensity"
							value={intensityChoice}
							disabled={isCrisAnalyzing}
							onChange={(event) => setIntensityChoice(event.target.value as DarkCutEffectIntensity | "template")}
							className="h-9 w-full rounded border bg-background px-2 text-xs"
						>
							<option value="template">Padrão do template</option>
							<option value="soft">Discreta • animações suaves</option>
							<option value="normal">Equilibrada • ritmo editorial</option>
							<option value="strong">Cinematográfica • mais movimento</option>
						</select>
						<p className="text-[0.68rem] text-muted-foreground">
							O ajuste vale para novos planos da Cris e movimentos da timeline.
							A prévia usa só um player de 15 FPS para economizar CPU.
						</p>
					</div>
					<p className="text-muted-foreground">
						Fluxo: roteiro → narração → mídias → template → Cris monta a edição.
						Se a API estiver sem cota, o analisador local assume
						automaticamente.
					</p>
				</div>
				<div className="mt-3 flex flex-col gap-2">
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Buscar template: carro, POV, financeiro, documentário..."
						className="h-9 w-full rounded-md border bg-background px-3 text-xs outline-none focus:border-primary"
					/>
					<div className="flex flex-wrap gap-1.5">
						{CATEGORIES.map((item) => (
							<button
								key={item}
								type="button"
								onClick={() => setCategory(item)}
								className={cn(
									"rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors",
									category === item
										? "border-primary bg-primary/10 text-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-foreground",
								)}
							>
								{item}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
				<div className="mb-2 flex items-center justify-between gap-2">
					<div>
						<div className="text-xs font-semibold">Remotion Composer • Preview avançado</div>
						<div className="text-[0.68rem] text-muted-foreground">
							A Cris escolhe a linguagem visual; o Remotion anima números, localização, listas, viradas e títulos sem abrir vários players ao mesmo tempo.
						</div>
					</div>
					<span className="rounded bg-primary/15 px-2 py-1 text-[0.62rem] font-medium text-primary">
						PRO
					</span>
				</div>
				{composerTemplate.id === "retro-automotive" && (
					<div className="mb-2 flex items-center gap-2">
						<label htmlFor="retro-preview-type" className="shrink-0 text-[0.7rem] text-muted-foreground">
							Cena:
						</label>
						<select
							id="retro-preview-type"
							className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
							value={retroPreviewMode}
							onChange={(event) => setRetroPreviewMode(event.target.value as RetroVisualMode)}
						>
							{RETRO_VISUAL_MODES.map(({ id, label }) => (
								<option key={id} value={id}>{label}</option>
							))}
						</select>
					</div>
				)}
				<DarkCutRemotionPreview
					templateId={composerTemplate.id}
					intensity={composerIntensity}
					retroMode={retroPreviewMode}
					templateTitle={composerTemplate.title}
					sceneType={composerScene?.sceneType ?? "hook"}
					visualSlot={composerScene?.visualSlot ?? "default"}
					overlayText={composerScene?.overlayText || opening || composerTemplate.title}
					summary={composerScene?.summary || composerTemplate.description}
					fps={15}
				/>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto pr-1">
				<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
					{filteredTemplates.map((template) => {
						const favorite = favorites.includes(template.id);
						return (
							<div
								key={template.id}
								onMouseEnter={() => {
									if (
										!window.matchMedia("(prefers-reduced-motion: reduce)")
											.matches
									)
										setPreviewId(template.id);
								}}
								onMouseLeave={() =>
									setPreviewId((id) => (id === template.id ? null : id))
								}
								onFocus={() => {
									if (
										!window.matchMedia("(prefers-reduced-motion: reduce)")
											.matches
									)
										setPreviewId(template.id);
								}}
								onBlur={(e) => {
									if (!e.currentTarget.contains(e.relatedTarget))
										setPreviewId((id) => (id === template.id ? null : id));
								}}
								className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
							>
								<div
									className={cn(
										"relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br",
										template.accent,
									)}
								>
									<TemplatePreview
										template={template}
										active={
											previewId === template.id && activeTab === "templates"
										}
										title={opening.trim() || template.title}
										ending={ending.trim() || "Sua história continua"}
									/>
									<button
										type="button"
										aria-label={`Prévia de ${template.title}`}
										onClick={() =>
											setPreviewId(
												previewId === template.id ? null : template.id,
											)
										}
										className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white"
									>
										{previewId === template.id ? "Pausar prévia" : "▶ Prévia"}
									</button>
									<button
										type="button"
										aria-label={
											favorite ? "Remover dos favoritos" : "Favoritar template"
										}
										onClick={() => toggleFavorite(template.id)}
										className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border bg-background/80 text-base backdrop-blur transition-transform hover:scale-105"
									>
										{favorite ? "★" : "☆"}
									</button>
									<div className="absolute bottom-2 left-2 rounded-full border bg-background/80 px-2 py-1 text-[0.62rem] font-medium backdrop-blur">
										{template.category}
									</div>
								</div>

								<div className="p-4">
									<h3 className="font-semibold">{template.title}</h3>
									<p className="mt-0.5 text-[0.62rem] font-semibold tracking-[0.16em] text-primary">
										{template.tagline}
									</p>
									<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
										{template.description}
									</p>
									<p className="mt-2 text-[0.68rem] text-muted-foreground">
										<span className="font-medium text-foreground">
											Ideal para:
										</span>{" "}
										{template.idealFor}
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
											FX{" "}
											{template.effects.includes("blur")
												? "blur inteligente"
												: "limpo"}
										</span>
										<span className="rounded border px-2 py-1">
											🤖 Cris + texto automático
										</span>
										<span className="rounded border px-2 py-1">
											✨{" "}
											{template.intensity === "soft"
												? "suave"
												: template.intensity === "strong"
													? "forte"
													: "normal"}
										</span>
									</div>

									<Button
										className="mt-4 w-full"
										disabled={isCrisAnalyzing}
										onClick={() => applyTemplate(template)}
									>
										✨ Aplicar template
									</Button>
								</div>
							</div>
						);
					})}
				</div>

				{filteredTemplates.length === 0 && (
					<div className="rounded-xl border border-dashed p-8 text-center">
						<p className="text-sm font-medium">Nenhum template encontrado.</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Tente outra busca ou categoria.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
