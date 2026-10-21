"use client";

import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	DARKCUT_TRANSITIONS,
	applyRandomTransitions,
	applyTransitionPreset,
	clearDarkCutTransitions,
} from "@/timeline/darkcut-tools";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	type DarkCutTransitionPreset,
	useTimelineStore,
} from "@/timeline/timeline-store";
import { cn } from "@/utils/ui";
import { toast } from "sonner";

const PREVIEW: Record<
	DarkCutTransitionPreset,
	{ icon: string; description: string; className: string }
> = {
	fade: {
		icon: "◐",
		description: "Entrada e saída suave. Funciona bem em documentário e POV.",
		className: "from-slate-500/10 via-white/10 to-slate-500/10",
	},
	zoom: {
		icon: "⊕",
		description: "Aproximação suave para dar energia sem cortar bruscamente.",
		className: "from-cyan-500/15 via-blue-500/5 to-indigo-500/15",
	},
	"slide-left": {
		icon: "←",
		description: "Deslizamento horizontal para mudanças de assunto e listas.",
		className: "from-purple-500/15 via-transparent to-fuchsia-500/15",
	},
	"slide-right": {
		icon: "→",
		description: "Deslizamento no sentido oposto para alternar o ritmo visual.",
		className: "from-fuchsia-500/15 via-transparent to-purple-500/15",
	},
	"ken-burns": {
		icon: "⌗",
		description: "Transição discreta com escala, indicada para imagens e narração.",
		className: "from-amber-500/15 via-orange-500/5 to-red-500/10",
	},
	pop: {
		icon: "✦",
		description: "Entrada mais marcada para listas, Shorts e momentos de destaque.",
		className: "from-rose-500/15 via-pink-500/5 to-orange-500/15",
	},
};

export function DarkCutTransitionsView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const preset = useTimelineStore((state) => state.darkcutTransitionPreset);
	const setPreset = useTimelineStore(
		(state) => state.setDarkcutTransitionPreset,
	);
	const favorites = useTimelineStore(
		(state) => state.darkcutTransitionFavorites,
	);
	const toggleFavorite = useTimelineStore(
		(state) => state.toggleDarkcutTransitionFavorite,
	);

	const apply = (nextPreset: DarkCutTransitionPreset) => {
		if (!selectedElements.length) {
			toast.error("Selecione uma ou mais imagens/vídeos na timeline.");
			return;
		}
		setPreset(nextPreset);
		const changed = applyTransitionPreset({
			editor,
			refs: selectedElements,
			preset: nextPreset,
			fallbackToAll: false,
		});
		if (!changed) {
			toast.error("A seleção não possui imagens ou vídeos.");
			return;
		}
		const label =
			DARKCUT_TRANSITIONS.find((item) => item.id === nextPreset)?.label ??
			nextPreset;
		toast.success(`${label} aplicado em ${changed} item(ns).`);
	};

	const randomize = () => {
		const changed = applyRandomTransitions({
			editor,
			refs: selectedElements,
			presets: favorites,
		});
		if (!changed) {
			toast.error("Não encontrei imagens ou vídeos na timeline.");
			return;
		}
		toast.success(`Transições automáticas aplicadas em ${changed} item(ns).`, {
			description: favorites.length
				? "Usando somente suas favoritas."
				: "Usando toda a biblioteca DarkCut.",
		});
	};

	const clear = () => {
		if (!selectedElements.length) {
			toast.error("Selecione os itens que devem ficar sem transição.");
			return;
		}
		const changed = clearDarkCutTransitions({
			editor,
			refs: selectedElements,
		});
		if (!changed) {
			toast.error("A seleção não possui imagens ou vídeos.");
			return;
		}
		toast.success(`Transições removidas de ${changed} item(ns).`);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden p-4">
			<div className="mb-3 rounded-xl border bg-card p-4">
				<p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary">
					DarkCut Transitions
				</p>
				<h2 className="mt-1 text-base font-semibold">Biblioteca de transições</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Selecione clipes na timeline e aplique uma transição. As favoritas
					alimentam o modo aleatório.
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<div className="rounded-md border bg-background px-3 py-2 text-xs">
						<span className="font-semibold">{selectedElements.length}</span>{" "}
						<span className="text-muted-foreground">selecionado(s)</span>
					</div>
					<Button variant="secondary" size="sm" onClick={randomize}>
						✨ Aleatório
					</Button>
					<Button variant="outline" size="sm" onClick={clear}>
						Limpar seleção
					</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto pr-1">
				<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
					{DARKCUT_TRANSITIONS.map((transition) => {
						const meta = PREVIEW[transition.id];
						const favorite = favorites.includes(transition.id);
						const active = preset === transition.id;
						return (
							<div
								key={transition.id}
								className={cn(
									"overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/50",
									active && "border-primary ring-1 ring-primary/20",
								)}
							>
								<div
									className={cn(
										"relative flex h-24 items-center justify-center bg-gradient-to-r",
										meta.className,
									)}
								>
									<div className="absolute left-5 h-12 w-20 rounded-lg border bg-background/70 shadow-sm" />
									<div className="absolute right-5 h-12 w-20 rounded-lg border bg-background/70 shadow-sm" />
									<span className="relative z-10 flex size-10 items-center justify-center rounded-full border bg-background text-xl shadow">
										{meta.icon}
									</span>
								</div>
								<div className="p-4">
									<div className="flex items-start justify-between gap-2">
										<div>
											<h3 className="text-sm font-semibold">{transition.label}</h3>
											<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
												{meta.description}
											</p>
										</div>
										<button
											type="button"
											className="flex size-8 shrink-0 items-center justify-center rounded-full border text-base hover:bg-accent"
											onClick={() => toggleFavorite(transition.id)}
											title={favorite ? "Remover dos favoritos" : "Favoritar"}
										>
											{favorite ? "★" : "☆"}
										</button>
									</div>
									<Button
										className="mt-3 w-full"
										variant={active ? "default" : "secondary"}
										onClick={() => apply(transition.id)}
									>
										{active ? "✓ Aplicar novamente" : "Aplicar transição"}
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
