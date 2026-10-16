"use client";

import { ChannelPanel } from "@/darkcut/channel-panel";
import { useProjectDraft } from "@/darkcut/project-draft";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { useAssetsPanelStore } from "../assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import {
	autoAssignLibraryMedia,
	assembleScenesOnTimeline,
	buildDarkCutScenes,
	downloadFlowZikaQueue,
	type DarkCutScene,
} from "../darkcut-automation";
import {
	type DarkCutProductionMode,
	useDarkCutProductionStore,
} from "../darkcut-production-store";

const DARKCUT_SAMPLE_SCRIPT = `Você trabalhou meses para juntar dinheiro. Todo mundo dizia que a única saída era financiar um carro novo e assumir parcelas por anos. Mas você resolveu fazer o contrário. Em vez de correr atrás do carro mais caro, você começou a pesquisar, comparar preços e guardar cada real. Enquanto seus amigos trocavam de carro e aumentavam as dívidas, você continuou focado. Até que apareceu uma oportunidade: um carro simples, bem cuidado e que cabia no seu orçamento. Você pagou à vista. No começo, ninguém entendeu. Alguns até riram. Meses depois, enquanto eles ainda reclamavam das parcelas, seguro e juros, você percebeu que tinha comprado mais do que um carro. Tinha comprado tranquilidade. A escolha que parecia pequena mudou completamente a forma como você enxergava dinheiro.`;

const modeCards: Array<{
	key: DarkCutProductionMode;
	title: string;
	description: string;
}> = [
	{
		key: "ai",
		title: "Imagens IA",
		description: "Gera prompts por cena e prepara a fila do FlowZika.",
	},
	{
		key: "broll",
		title: "B-roll / Vídeo",
		description: "Prioriza vídeos e imagens já importados para o projeto.",
	},
	{
		key: "hybrid",
		title: "Híbrido",
		description: "Combina mídia local com prompts de IA para preencher as lacunas.",
	},
];

export function DarkCutProductionView() {
	const editor = useEditor();
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const visualMediaCount = useEditor(
		(e) =>
			e.media
				.getAssets()
				.filter((asset) => asset.type === "image" || asset.type === "video")
				.length,
	);
	const timelineVisualCount = useEditor((e) => {
		const scene = e.scenes.getActiveSceneOrNull();
		if (!scene) return 0;
		return [scene.tracks.main, ...scene.tracks.overlay].reduce(
			(total, track) =>
				total +
				track.elements.filter(
					(element) => element.type === "image" || element.type === "video",
				).length,
			0,
		);
	});
	const {
		channelName,
		projectName,
		mode,
		sceneSeconds,
		script,
		useFlowZika,
		useYoutube,
		useStock,
		useLocal,
		setChannelName,
		setProjectName,
		setMode,
		setSceneSeconds,
		setScript,
		setSource,
	} = useDarkCutProductionStore();

	const [scenes, setScenes] = useProjectDraft<DarkCutScene[]>("scenes", []);
	const [narrationAssetId] = useProjectDraft<string | null>(
		"narration-asset",
		null,
	);
	const [addCaptions, setAddCaptions] = useState(true);

	const stats = useMemo(() => {
		const ready = scenes.filter((scene) => scene.status === "ready").length;
		const review = scenes.filter((scene) => scene.status === "review").length;
		const missing = scenes.filter((scene) => scene.status === "missing").length;
		const withMedia = scenes.filter((scene) => Boolean(scene.mediaId)).length;
		return { ready, review, missing, withMedia };
	}, [scenes]);

	const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
	const pipeline = [
		{
			label: "Roteiro",
			value: script.trim() ? "Concluído" : "Pendente",
			done: Boolean(script.trim()),
			onClick: () => undefined,
		},
		{
			label: "Narração",
			value: narrationAssetId ? "Concluída" : "Pendente",
			done: Boolean(narrationAssetId),
			onClick: () => setActiveTab("sync"),
		},
		{
			label: "Cenas",
			value: scenes.length ? `${scenes.length}` : "0",
			done: scenes.length > 0,
			onClick: () => undefined,
		},
		{
			label: "Mídias",
			value: scenes.length ? `${stats.withMedia}/${scenes.length}` : "0/0",
			done: scenes.length > 0 && stats.withMedia === scenes.length,
			onClick: () => setActiveTab("media"),
		},
		{
			label: "Timeline",
			value: timelineVisualCount ? `${timelineVisualCount} itens` : "Pendente",
			done: timelineVisualCount > 0,
			onClick: () => undefined,
		},
	];

	const generateScenes = () => {
		const next = buildDarkCutScenes({ script, sceneSeconds });
		setScenes(next);
		if (!next.length) {
			toast.error("Cole um roteiro antes de gerar as cenas.");
			return;
		}
		toast.success(`${next.length} cenas criadas.`);
	};

	const assignMedia = () => {
		if (!scenes.length) {
			toast.error("Gere as cenas primeiro.");
			return;
		}
		const next = autoAssignLibraryMedia({ scenes, editor });
		setScenes(next);
		const filled = next.filter((scene) => scene.mediaId).length;
		if (!filled) {
			toast.error("Importe imagens ou vídeos na aba Mídia para preencher as cenas.");
			return;
		}
		toast.success(`${filled} cenas receberam mídia da biblioteca.`);
	};

	const assemble = () => {
		if (!scenes.some((scene) => scene.mediaId)) {
			toast.error("Associe mídias às cenas antes de montar a timeline.");
			return;
		}
		try {
			const inserted = assembleScenesOnTimeline({
				scenes,
				editor,
				addCaptions,
			});
			if (!inserted) {
				toast.error("Nenhuma cena pôde ser adicionada à timeline.");
				return;
			}
			toast.success(`${inserted} cenas adicionadas à timeline.`);
		} catch (error) {
			console.error(error);
			toast.error(
				error instanceof Error
					? error.message
					: "Falha ao montar a timeline.",
			);
		}
	};

	return (
		<div className="h-full overflow-y-auto bg-background p-4">
			<section className="mb-4 overflow-hidden rounded-xl border bg-card">
				<div className="border-b bg-gradient-to-r from-primary/10 via-card to-card p-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary">
								DarkCut Studio
							</p>
							<h2 className="mt-1 text-lg font-semibold">Produção</h2>
							<p className="mt-1 text-xs text-muted-foreground">
								Roteiro → narração → cenas → mídias → timeline → exportação.
							</p>
						</div>
						<div className="rounded-lg border bg-background/80 px-3 py-2 text-right">
							<div className="text-sm font-semibold">
								{stats.missing > 0 ? stats.missing : "✓"}
							</div>
							<div className="text-[0.62rem] text-muted-foreground">
								{stats.missing > 0 ? "mídias faltando" : "fluxo saudável"}
							</div>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-5 gap-px bg-border">
					{pipeline.map((step, index) => (
						<button
							key={step.label}
							type="button"
							onClick={step.onClick}
							className="group bg-card p-3 text-left transition-colors hover:bg-accent"
						>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"flex size-5 items-center justify-center rounded-full border text-[0.62rem] font-bold",
										step.done
											? "border-primary bg-primary text-primary-foreground"
											: "border-border bg-background text-muted-foreground",
									)}
								>
									{step.done ? "✓" : index + 1}
								</span>
								<span className="truncate text-[0.68rem] font-medium">
									{step.label}
								</span>
							</div>
							<div
								className={cn(
									"mt-1 pl-7 text-[0.62rem]",
									step.done ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{step.value}
							</div>
						</button>
					))}
				</div>
			</section>

			<div className="mb-3 grid grid-cols-5 gap-2">
				<WorkflowButton active label="Roteiro" badge={scriptWords ? String(scriptWords) : undefined} />
				<WorkflowButton label="Narração" done={Boolean(narrationAssetId)} onClick={() => setActiveTab("sync")} />
				<WorkflowButton label="Cenas" badge={scenes.length ? String(scenes.length) : undefined} />
				<WorkflowButton label="Mídias" badge={stats.missing ? String(stats.missing) : undefined} warning={stats.missing > 0} onClick={() => setActiveTab("media")} />
				<WorkflowButton label="Auto Edit" onClick={() => setActiveTab("templates")} />
			</div>

			<ChannelPanel />

			<section className="space-y-3 rounded-xl border bg-card p-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-semibold">Projeto e roteiro</div>
						<div className="text-[0.68rem] text-muted-foreground">
							O roteiro alimenta a narração, as cenas e os prompts.
						</div>
					</div>
					<div className="rounded-md border bg-background px-2 py-1 text-[0.65rem] text-muted-foreground">
						{scriptWords} palavras
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<label className="block text-xs text-muted-foreground">
						Canal
						<input
							value={channelName}
							onChange={(event) => setChannelName(event.target.value)}
							placeholder="Ex.: Joca Investe"
							className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
						/>
					</label>
					<label className="block text-xs text-muted-foreground">
						Nome do projeto
						<input
							value={projectName}
							onChange={(event) => setProjectName(event.target.value)}
							placeholder="Ex.: POV carro quitado"
							className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
						/>
					</label>
				</div>

				<div className="flex items-center justify-between gap-2">
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<span>Duração base das cenas</span>
						<input
							type="number"
							min={2}
							max={30}
							value={sceneSeconds}
							onChange={(event) =>
								setSceneSeconds(
									Math.max(2, Math.min(30, Number(event.target.value) || 5)),
								)
							}
							className="h-8 w-16 rounded-md border bg-background px-2 text-foreground"
						/>
						<span>s</span>
					</label>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setScript(DARKCUT_SAMPLE_SCRIPT)}
					>
						Usar roteiro de teste
					</Button>
				</div>

				<textarea
					value={script}
					onChange={(event) => setScript(event.target.value)}
					placeholder="Cole ou escreva aqui o roteiro completo que será narrado..."
					className="min-h-44 w-full resize-y rounded-lg border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary"
				/>

				<div className="grid grid-cols-3 gap-2">
					<Button variant="secondary" onClick={generateScenes}>
						✨ Gerar cenas e prompts
					</Button>
					<Button
						variant="outline"
						disabled={!script.trim()}
						onClick={() => setActiveTab("sync")}
					>
						🎙 Narração
					</Button>
					<Button
						disabled={!scenes.length}
						onClick={() => setActiveTab("templates")}
					>
						✨ Templates / Auto Edit
					</Button>
				</div>

				{scenes.length > 0 && (
					<div className="grid grid-cols-4 gap-2 text-center text-[0.7rem]">
						<StatCard value={scenes.length} label="Cenas" />
						<StatCard value={stats.ready} label="Prontas" tone="good" />
						<StatCard value={stats.review} label="Revisar" tone="warn" />
						<StatCard value={stats.missing} label="Sem mídia" tone="bad" />
					</div>
				)}
			</section>

			<section className="mt-3 rounded-xl border bg-card p-4">
				<div className="mb-3 flex items-center justify-between">
					<div>
						<div className="text-sm font-semibold">Modo de produção</div>
						<div className="text-[0.68rem] text-muted-foreground">
							Escolha como o DarkCut vai preencher as cenas.
						</div>
					</div>
					<span className="rounded-full border bg-background px-2 py-1 text-[0.62rem] text-muted-foreground">
						{visualMediaCount} mídias importadas
					</span>
				</div>
				<div className="grid gap-2 xl:grid-cols-3">
					{modeCards.map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() => setMode(item.key)}
							className={cn(
								"rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5",
								mode === item.key
									? "border-primary bg-primary/10 shadow-sm"
									: "border-border bg-background hover:bg-accent",
							)}
						>
							<div className="text-sm font-medium">{item.title}</div>
							<div className="mt-1 text-xs leading-relaxed text-muted-foreground">
								{item.description}
							</div>
						</button>
					))}
				</div>
			</section>

			<section className="mt-3 rounded-xl border bg-card p-4">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-semibold">Fontes de mídia</div>
						<div className="text-[0.68rem] text-muted-foreground">
							Ative quantas fontes quiser. O Híbrido combina automaticamente.
						</div>
					</div>
					<Button variant="outline" size="sm" onClick={() => setActiveTab("media")}>
						Abrir Mídia
					</Button>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<SourceToggle label="FlowZika" checked={useFlowZika} onChange={(value) => setSource("useFlowZika", value)} />
					<SourceToggle label="YouTube" checked={useYoutube} onChange={(value) => setSource("useYoutube", value)} />
					<SourceToggle label="Bancos" checked={useStock} onChange={(value) => setSource("useStock", value)} />
					<SourceToggle label="Arquivos locais" checked={useLocal} onChange={(value) => setSource("useLocal", value)} />
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<Button variant="secondary" onClick={assignMedia}>
						🔎 Preencher com biblioteca
					</Button>
					<Button
						variant="secondary"
						disabled={!scenes.length || !useFlowZika}
						onClick={() => downloadFlowZikaQueue(scenes)}
					>
						↓ Fila de prompts FlowZika
					</Button>
				</div>
			</section>

			{scenes.length > 0 && (
				<section className="mt-3 rounded-xl border bg-card p-4">
					<div className="mb-3 flex items-center justify-between">
						<div>
							<div className="text-sm font-semibold">Fila de cenas</div>
							<div className="text-[0.68rem] text-muted-foreground">
								Confira rapidamente o que está pronto e o que ainda precisa de mídia.
							</div>
						</div>
						<div className="flex gap-2 text-[0.65rem]">
							<span className="rounded border bg-background px-2 py-1">{stats.withMedia} com mídia</span>
							<span className={cn("rounded border px-2 py-1", stats.missing ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-background")}>
								{stats.missing} faltando
							</span>
						</div>
					</div>
					<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
						{scenes.map((scene) => (
							<div key={scene.id} className="rounded-lg border bg-background p-3 text-xs">
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<span className="flex size-6 items-center justify-center rounded-md border bg-card text-[0.65rem] font-semibold">
											{scene.index}
										</span>
										<span className="font-medium">Cena {scene.index}</span>
									</div>
									<span
										className={cn(
											"rounded-full px-2 py-0.5 text-[0.62rem]",
											scene.status === "ready" && "bg-constructive/15 text-constructive",
											scene.status === "review" && "bg-caution/15 text-caution",
											scene.status === "missing" && "bg-destructive/15 text-destructive",
										)}
									>
										{scene.status === "ready" ? "✓ Pronta" : scene.status === "review" ? "Revisar" : "Sem mídia"}
									</span>
								</div>
								<p className="mt-2 line-clamp-2 text-muted-foreground">{scene.text}</p>
								{scene.mediaName ? (
									<p className="mt-2 truncate rounded border bg-card px-2 py-1 text-[0.65rem] text-foreground">
										🎞 {scene.mediaName}
									</p>
								) : (
									<p className="mt-2 rounded border border-dashed border-destructive/30 bg-destructive/5 px-2 py-1 text-[0.65rem] text-destructive">
										Mídia ainda não encontrada
									</p>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			<section className="mt-3 rounded-xl border bg-card p-4">
				<div className="flex items-center justify-between gap-4">
					<label className="flex flex-1 items-center justify-between gap-3 text-xs">
						<span>
							<span className="block font-medium">Adicionar texto na timeline</span>
							<span className="text-muted-foreground">
								Cria uma faixa de texto sincronizada com cada cena.
							</span>
						</span>
						<input
							type="checkbox"
							checked={addCaptions}
							onChange={(event) => setAddCaptions(event.target.checked)}
							className="size-4 accent-[var(--primary)]"
						/>
					</label>
					<div className="h-10 w-px bg-border" />
					<div className="text-right text-[0.65rem] text-muted-foreground">
						<div>{stats.withMedia}/{scenes.length || 0} cenas com mídia</div>
						<div>{timelineVisualCount} itens na timeline</div>
					</div>
				</div>
				<Button className="mt-3 w-full" onClick={assemble}>
					🚀 Montar projeto na timeline
				</Button>
			</section>
		</div>
	);
}

function WorkflowButton({
	label,
	badge,
	active = false,
	done = false,
	warning = false,
	onClick,
}: {
	label: string;
	badge?: string;
	active?: boolean;
	done?: boolean;
	warning?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex min-h-10 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors",
				active
					? "border-primary bg-primary/10 text-foreground"
					: "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			<span>{done ? "✓ " : ""}{label}</span>
			{badge && (
				<span
					className={cn(
						"rounded-full border px-1.5 py-0.5 text-[0.6rem]",
						warning
							? "border-destructive/40 bg-destructive/10 text-destructive"
							: "bg-background text-muted-foreground",
					)}
				>
					{badge}
				</span>
			)}
		</button>
	);
}

function StatCard({
	value,
	label,
	tone,
}: {
	value: number;
	label: string;
	tone?: "good" | "warn" | "bad";
}) {
	return (
		<div className="rounded-lg border bg-background p-2">
			<div
				className={cn(
					"text-base font-semibold",
					tone === "good" && "text-constructive",
					tone === "warn" && "text-caution",
					tone === "bad" && "text-destructive",
				)}
			>
				{value}
			</div>
			<div className="text-muted-foreground">{label}</div>
		</div>
	);
}

function SourceToggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-colors",
				checked ? "border-primary bg-primary/5" : "bg-background hover:bg-accent",
			)}
		>
			<span>{label}</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="size-4 accent-[var(--primary)]"
			/>
		</label>
	);
}
