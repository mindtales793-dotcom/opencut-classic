"use client";

import { useEffect, useMemo, useState } from "react";
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

export function DarkCutTemplatesView() {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
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

		toast.success(`${template.title} aplicado.`, {
			description: `${changed} cena(s) atualizadas. Tudo continua editável na timeline.`,
		});
	};

	return (
		<div className="flex h-full flex-col overflow-hidden p-4">
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
							Aplique ritmo, duração, movimento e transições sem perder a
							edição manual. Se houver narração, o Auto Edit sincroniza os
							visuais automaticamente.
						</p>
					</div>
					<div className="rounded-lg border bg-background px-3 py-2 text-right">
						<div className="text-lg font-semibold">{TEMPLATES.length}</div>
						<div className="text-[0.65rem] text-muted-foreground">estilos</div>
					</div>
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
								className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
							>
								<div
									className={cn(
										"relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br",
										template.accent,
									)}
								>
									<div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,transparent_49%,hsl(var(--border))_50%,transparent_51%)] [background-size:36px_36px]" />
									<div className="relative text-4xl transition-transform duration-200 group-hover:scale-110">
										{template.badge}
									</div>
									<button
										type="button"
										aria-label={favorite ? "Remover dos favoritos" : "Favoritar template"}
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
										<span className="font-medium text-foreground">Ideal para:</span>{" "}
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
											✨ {template.intensity === "soft"
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
