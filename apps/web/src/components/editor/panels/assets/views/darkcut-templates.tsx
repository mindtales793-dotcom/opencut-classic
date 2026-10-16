"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	motionAnimations,
	transitionAnimations,
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
import {
	buildElementFromMedia,
	buildTextElement,
} from "@/timeline/element-utils";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import { useAssetsPanelStore } from "../assets-panel-store";
import type { ImageElement, TimelineElement } from "@/timeline/types";
import type { ElementRef, TScene } from "@/timeline/types";
import { cn } from "@/utils/ui";
import { toast } from "sonner";

type TemplateCategory =
	| "Todos"
	| "POV"
	| "Financeiro"
	| "Documentário"
	| "Educativo"
	| "Social";

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
	badge: string;
	accent: string;
};

const FAVORITES_KEY = "darkcut-template-favorites";

const TEMPLATES: DarkCutTemplate[] = [
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
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const activeTab = useAssetsPanelStore((s) => s.activeTab);
	const [previewId, setPreviewId] = useState<string | null>(null);
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
				track.name.toLocaleLowerCase("pt-BR").includes("narra") &&
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
								content,
								fontSize: 64,
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
		toast.success(`${template.title} aplicado.`, {
			description: `${changed} cena(s) atualizadas. Tudo continua editável na timeline.`,
		});
	};

	if (compact)
		return (
			<section className="studio-template-gallery">
				<header>
					<h2>Templates</h2>
					<button onClick={() => setActiveTab("templates")}>Ver todos ›</button>
				</header>
				<div className="studio-template-grid">
					{[
						"pov-finance",
						"pov-car",
						"dark-channel",
						"storytelling",
						"documentary",
						"vox",
					]
						.map((id) => TEMPLATES.find((t) => t.id === id)!)
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
							Aplique ritmo, duração, movimento e transições sem perder a edição
							manual. Se houver narração, o Auto Edit sincroniza os visuais
							automaticamente.
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
					<p className="text-muted-foreground">
						Usa seus vídeos e imagens. Inclui ritmo, câmera, transições e
						títulos; sincroniza com a narração existente. Música e voz são
						adicionadas nas abas correspondentes.
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
