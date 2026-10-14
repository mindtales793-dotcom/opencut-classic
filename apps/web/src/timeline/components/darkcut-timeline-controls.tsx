"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	DARKCUT_MOTIONS,
	DARKCUT_TRANSITIONS,
	applyFixedDuration,
	applyMotionPreset,
	applyRandomMotions,
	autoEditWithNarration,
	applyRandomTransitions,
	applyTransitionPreset,
	clearDarkCutTransitions,
	syncVisualsToNarration,
} from "@/timeline/darkcut-tools";
import {
	type DarkCutEffectIntensity,
	type DarkCutMotionPreset,
	type DarkCutTransitionPreset,
	useTimelineStore,
} from "@/timeline/timeline-store";

export function DarkCutTimelineControls() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const durationSeconds = useTimelineStore(
		(state) => state.darkcutDurationSeconds,
	);
	const setDurationSeconds = useTimelineStore(
		(state) => state.setDarkcutDurationSeconds,
	);
	const transitionPreset = useTimelineStore(
		(state) => state.darkcutTransitionPreset,
	);
	const setTransitionPreset = useTimelineStore(
		(state) => state.setDarkcutTransitionPreset,
	);
	const favorites = useTimelineStore(
		(state) => state.darkcutTransitionFavorites,
	);
	const toggleFavorite = useTimelineStore(
		(state) => state.toggleDarkcutTransitionFavorite,
	);
	const isFavorite = favorites.includes(transitionPreset);
	const motionPreset = useTimelineStore((state) => state.darkcutMotionPreset);
	const setMotionPreset = useTimelineStore(
		(state) => state.setDarkcutMotionPreset,
	);
	const motionFavorites = useTimelineStore(
		(state) => state.darkcutMotionFavorites,
	);
	const toggleMotionFavorite = useTimelineStore(
		(state) => state.toggleDarkcutMotionFavorite,
	);
	const effectIntensity = useTimelineStore(
		(state) => state.darkcutEffectIntensity,
	);
	const setEffectIntensity = useTimelineStore(
		(state) => state.setDarkcutEffectIntensity,
	);
	const isMotionFavorite = motionFavorites.includes(motionPreset);

	const applyDuration = () => {
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			toast.error("Informe uma duração maior que zero.");
			return;
		}
		if (selectedElements.length === 0) {
			toast.error("Selecione uma ou mais imagens/vídeos na timeline.");
			return;
		}

		const result = applyFixedDuration({
			editor,
			refs: selectedElements,
			seconds: durationSeconds,
		});
		if (!result.changed) {
			toast.error("A seleção não possui imagens ou vídeos.");
			return;
		}
		toast.success(
			`${result.changed} item(ns) ajustados para ${durationSeconds.toFixed(1)}s.`,
			result.clamped
				? {
						description: `${result.clamped} vídeo(s) atingiram o limite de velocidade permitido.`,
					}
				: undefined,
		);
	};

	const syncNarration = () => {
		const result = syncVisualsToNarration({
			editor,
			refs: selectedElements,
		});
		if (!result.narrationSeconds) {
			toast.error(
				"Não encontrei uma narração na timeline. Gere/adicione a narração primeiro.",
			);
			return;
		}
		if (!result.changed) {
			toast.error("Não há imagens ou vídeos para sincronizar.");
			return;
		}

		toast.success(
			`${result.changed} item(ns) sincronizados com ${Math.round(result.narrationSeconds)}s de narração.`,
			{
				description: `Média de ${result.secondsEach.toFixed(2)}s por item.${
					result.clamped
						? ` ${result.clamped} vídeo(s) chegaram ao limite de velocidade.`
						: ""
				}`,
			},
		);
	};

	const applyTransition = () => {
		const changed = applyTransitionPreset({
			editor,
			refs: selectedElements,
			preset: transitionPreset,
			fallbackToAll: false,
		});
		if (!changed) {
			toast.error("Selecione uma ou mais imagens/vídeos para aplicar a transição.");
			return;
		}
		const label =
			DARKCUT_TRANSITIONS.find((item) => item.id === transitionPreset)?.label ??
			transitionPreset;
		toast.success(`${label} aplicado em ${changed} item(ns).`);
	};

	const randomizeTransitions = () => {
		const changed = applyRandomTransitions({
			editor,
			refs: selectedElements,
			presets: favorites,
		});
		if (!changed) {
			toast.error("Não há imagens ou vídeos na timeline.");
			return;
		}
		toast.success(
			`Transições aleatórias aplicadas em ${changed} item(ns).`,
			{
				description:
					favorites.length > 0
						? "Usando apenas suas transições favoritas."
						: "Usando todos os presets DarkCut.",
			},
		);
	};

	const applyMotion = () => {
		const changed = applyMotionPreset({
			editor,
			refs: selectedElements,
			preset: motionPreset,
			intensity: effectIntensity,
			fallbackToAll: false,
		});
		if (!changed) {
			toast.error("Selecione uma ou mais imagens/vídeos para aplicar movimento.");
			return;
		}
		const label =
			DARKCUT_MOTIONS.find((item) => item.id === motionPreset)?.label ??
			motionPreset;
		toast.success(`${label} aplicado em ${changed} item(ns).`);
	};

	const randomizeMotions = () => {
		const changed = applyRandomMotions({
			editor,
			refs: selectedElements,
			presets: motionFavorites,
			intensity: effectIntensity,
		});
		if (!changed) {
			toast.error("Não há imagens ou vídeos na timeline.");
			return;
		}
		toast.success(`Movimentos automáticos aplicados em ${changed} item(ns).`, {
			description:
				motionFavorites.length > 0
					? "Usando apenas seus movimentos favoritos."
					: "Usando todos os movimentos DarkCut.",
		});
	};

	const autoEdit = () => {
		const result = autoEditWithNarration({
			editor,
			refs: selectedElements,
			motionPresets: motionFavorites,
			transitionPresets: favorites,
			intensity: effectIntensity,
		});
		if (!result.narrationSeconds) {
			toast.error(
				"Adicione a narração à timeline antes de usar o Auto Edit.",
			);
			return;
		}
		if (!result.changed) {
			toast.error("Não encontrei imagens ou vídeos para editar.");
			return;
		}
		toast.success(`DarkCut Auto Edit concluído em ${result.changed} item(ns).`, {
			description: `Sincronizado com ${Math.round(
				result.narrationSeconds,
			)}s de narração + ${result.motions} movimentos + ${result.transitions} transições.`,
		});
	};

	const clearTransitions = () => {
		if (selectedElements.length === 0) {
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
		<div className="flex items-center gap-1">
			<div className="bg-border mx-1 h-6 w-px" />

			<div
				className="flex h-8 items-center rounded-md border bg-background"
				title="Definir duração exata para os itens selecionados"
			>
				<input
					type="number"
					min={0.1}
					step={0.1}
					value={durationSeconds}
					onChange={(event) =>
						setDurationSeconds(
							Math.max(0.1, Number(event.target.value) || 0.1),
						)
					}
					onKeyDown={(event) => {
						if (event.key === "Enter") applyDuration();
					}}
					className="h-full w-14 bg-transparent px-2 text-center text-xs outline-none"
					aria-label="Duração em segundos"
				/>
				<span className="pr-1 text-[0.65rem] text-muted-foreground">s</span>
			</div>
			<Button
				variant="secondary"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={applyDuration}
				title="Aplicar duração aos itens selecionados"
			>
				Aplicar
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={syncNarration}
				title="Distribuir as imagens/vídeos para preencher toda a duração da narração"
			>
				Sync voz
			</Button>

			<div className="bg-border mx-1 h-6 w-px" />

			<select
				value={transitionPreset}
				onChange={(event) =>
					setTransitionPreset(event.target.value as DarkCutTransitionPreset)
				}
				className="h-8 max-w-32 rounded-md border bg-background px-2 text-xs outline-none"
				aria-label="Transição DarkCut"
				title="Escolher transição"
			>
				{DARKCUT_TRANSITIONS.map((transition) => (
					<option key={transition.id} value={transition.id}>
						{transition.label}
					</option>
				))}
			</select>
			<Button
				variant={isFavorite ? "secondary" : "text"}
				size="icon"
				className="size-8 text-base"
				onClick={() => toggleFavorite(transitionPreset)}
				title={isFavorite ? "Remover dos favoritos" : "Favoritar transição"}
			>
				{isFavorite ? "★" : "☆"}
			</Button>
			<Button
				variant="secondary"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={applyTransition}
				title="Aplicar a transição escolhida aos itens selecionados"
			>
				Transição
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={randomizeTransitions}
				title="Aplicar transições aleatórias; usa favoritas se houver"
			>
				Aleatório
			</Button>
			<Button
				variant="text"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={clearTransitions}
				title="Remover transições dos itens selecionados"
			>
				Limpar
			</Button>

			<div className="bg-border mx-1 h-6 w-px" />

			<select
				value={motionPreset}
				onChange={(event) =>
					setMotionPreset(event.target.value as DarkCutMotionPreset)
				}
				className="h-8 max-w-36 rounded-md border bg-background px-2 text-xs outline-none"
				aria-label="Movimento DarkCut"
				title="Escolher movimento/efeito"
			>
				{DARKCUT_MOTIONS.map((motion) => (
					<option key={motion.id} value={motion.id}>
						{motion.label}
					</option>
				))}
			</select>
			<Button
				variant={isMotionFavorite ? "secondary" : "text"}
				size="icon"
				className="size-8 text-base"
				onClick={() => toggleMotionFavorite(motionPreset)}
				title={
					isMotionFavorite
						? "Remover movimento dos favoritos"
						: "Favoritar movimento"
				}
			>
				{isMotionFavorite ? "★" : "☆"}
			</Button>
			<select
				value={effectIntensity}
				onChange={(event) =>
					setEffectIntensity(event.target.value as DarkCutEffectIntensity)
				}
				className="h-8 rounded-md border bg-background px-2 text-xs outline-none"
				aria-label="Intensidade do efeito"
				title="Intensidade dos movimentos"
			>
				<option value="soft">Suave</option>
				<option value="normal">Normal</option>
				<option value="strong">Forte</option>
			</select>
			<Button
				variant="secondary"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={applyMotion}
				title="Aplicar movimento aos itens selecionados"
			>
				Movimento
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={randomizeMotions}
				title="Aplicar movimentos aleatórios sem repetir consecutivamente"
			>
				FX aleatório
			</Button>
			<Button
				size="sm"
				className="h-8 px-3 text-xs font-semibold"
				onClick={autoEdit}
				title="Sincronizar com narração e aplicar movimentos e transições"
			>
				✨ Auto Edit
			</Button>
		</div>
	);
}
