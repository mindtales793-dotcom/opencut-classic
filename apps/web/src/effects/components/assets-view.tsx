"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";

const GROUPS = [
	{ label: "Todos", match: (_type: string) => true },
	{ label: "Cinema", match: (type: string) => /cinematic|golden|noir|teal|night|thriller|mono|movie|grade/.test(type) },
	{ label: "Retrô", match: (type: string) => /retro|vintage|matte|winter|sepia/.test(type) },
	{ label: "Cores", match: (type: string) => /color|vibrant|summer|pop|cold|clean|toon/.test(type) },
	{ label: "Documentário", match: (type: string) => /documentary|portrait|soft|bw/.test(type) },
	{ label: "Desfoque", match: (type: string) => type === "blur" },
] as const;

export function EffectsView() {
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<string>("Todos");
	const effects = effectsRegistry.getAll();
	const visible = useMemo(() => effects.filter((effect) => {
		const q = query.trim().toLocaleLowerCase("pt-BR");
		const searchable = [effect.name, effect.type, ...effect.keywords].join(" ").toLocaleLowerCase("pt-BR");
		const category = GROUPS.find((item) => item.label === group) ?? GROUPS[0];
		return category.match(effect.type) && (!q || searchable.includes(q));
	}), [effects, query, group]);

	return (
		<PanelView title={`Efeitos e filtros · ${visible.length}/${effects.length}`}>
			<div className="mb-3 space-y-3 px-1">
				<input
					type="search"
					aria-label="Pesquisar filtros e efeitos"
					placeholder="Buscar cinema, P&B, vintage, contraste…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
				/>
				<div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorias de filtros">
					{GROUPS.map((category) => (
						<button key={category.label} type="button" aria-pressed={group === category.label}
							onClick={() => setGroup(category.label)}
							className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${group === category.label ? "border-primary bg-primary/15 text-primary" : "border-border bg-card hover:border-primary/40"}`}>
							{category.label}
						</button>
					))}
				</div>
				<p className="text-xs text-muted-foreground">Clique em + ou arraste um filtro para a timeline. Visualize a prévia e ajuste a intensidade nas propriedades. O resultado acompanha a exportação MP4.</p>
			</div>
			{visible.length ? (
				<EffectsGrid effects={visible} />
			) : (
				<div role="status" className="rounded-md border p-5 text-center text-xs text-muted-foreground">
					Nenhum filtro encontrado para esta busca.
					<button type="button" className="mt-2 block w-full text-primary underline" onClick={() => { setQuery(""); setGroup("Todos"); }}>Mostrar todos os filtros</button>
				</div>
			)}
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();

	const handleAddToTimeline = useCallback(() => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
