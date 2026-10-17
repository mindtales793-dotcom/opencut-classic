"use client";

import { DarkCutTemplatesView } from "./darkcut-templates";
import { useStudioNavigation } from "@/darkcut/studio-navigation";
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
		description:
			"Combina mídia local com prompts de IA para preencher as lacunas.",
	},
];

export function DarkCutProductionView() {
	const editor = useEditor();
	const { section, setSection } = useStudioNavigation();
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
		setSection("scenes");
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
			toast.error(
				"Importe imagens ou vídeos na aba Mídia para preencher as cenas.",
			);
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
				error instanceof Error ? error.message : "Falha ao montar a timeline.",
			);
		}
	};

	return (
		<div className="studio-production h-full overflow-y-auto">
			{section === "script" && (
				<div className="studio-script-grid">
					<section className="studio-script-card">
						<header>
							<h2>Roteiro do vídeo</h2>
							<button onClick={generateScenes} disabled={!script.trim()}>
								✦ Gerar cenas
							</button>
						</header>
						<textarea
							aria-label="Roteiro do vídeo"
							value={script}
							onChange={(event) => setScript(event.target.value)}
							placeholder="Cole ou escreva seu roteiro aqui. Sua história começa com uma ideia…"
						/>
						<footer>
							<small>
								{script.length.toLocaleString("pt-BR")} caracteres ·{" "}
								{scenes.length} cenas
							</small>
							<button
								onClick={() =>
									document
										.querySelector<HTMLTextAreaElement>(
											'textarea[aria-label="Roteiro do vídeo"]',
										)
										?.focus()
								}
							>
								Editar roteiro
							</button>
						</footer>
						<details className="studio-script-options">
							<summary>Opções do roteiro e do projeto</summary>
							<label>
								Canal
								<input
									value={channelName}
									onChange={(e) => setChannelName(e.target.value)}
									placeholder="Nome do canal"
								/>
							</label>
							<label>
								Projeto
								<input
									value={projectName}
									onChange={(e) => setProjectName(e.target.value)}
									placeholder="Nome da produção"
								/>
							</label>
							<label>
								Segundos por cena
								<input
									type="number"
									min={2}
									max={30}
									value={sceneSeconds}
									onChange={(e) =>
										setSceneSeconds(
											Math.max(2, Math.min(30, Number(e.target.value) || 5)),
										)
									}
								/>
							</label>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => setScript(DARKCUT_SAMPLE_SCRIPT)}
							>
								Usar roteiro de teste
							</Button>
						</details>
					</section>
					<DarkCutTemplatesView compact />
				</div>
			)}
			<div hidden={section === "script"} className="p-3">
				<div className="flex flex-wrap items-center gap-2 mb-3">
					<Button onClick={generateScenes}>Gerar cenas e prompts</Button>
					<Button
						variant="secondary"
						aria-label="Vídeos"
						onClick={() => setActiveTab("videos")}
					>
						Buscar vídeos
					</Button>
					<Button
						variant="secondary"
						onClick={() => setSection(section === "setup" ? "scenes" : "setup")}
					>
						{section === "setup" ? "Ver cenas" : "Opções de produção"}
					</Button>
				</div>
				<details className="mb-3 rounded-lg border p-3">
					<summary className="cursor-pointer text-sm">
						Canal e informações da produção
					</summary>
					<ChannelPanel />
				</details>

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
						<Button
							variant="outline"
							size="sm"
							onClick={() => setActiveTab("media")}
						>
							Abrir Mídia
						</Button>
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
						<SourceToggle
							label="FlowZika"
							checked={useFlowZika}
							onChange={(value) => setSource("useFlowZika", value)}
						/>
						<SourceToggle
							label="YouTube"
							checked={useYoutube}
							onChange={(value) => setSource("useYoutube", value)}
						/>
						<SourceToggle
							label="Bancos"
							checked={useStock}
							onChange={(value) => setSource("useStock", value)}
						/>
						<SourceToggle
							label="Arquivos locais"
							checked={useLocal}
							onChange={(value) => setSource("useLocal", value)}
						/>
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
									Confira rapidamente o que está pronto e o que ainda precisa de
									mídia.
								</div>
							</div>
							<div className="flex gap-2 text-[0.65rem]">
								<span className="rounded border bg-background px-2 py-1">
									{stats.withMedia} com mídia
								</span>
								<span
									className={cn(
										"rounded border px-2 py-1",
										stats.missing
											? "border-destructive/40 bg-destructive/5 text-destructive"
											: "bg-background",
									)}
								>
									{stats.missing} faltando
								</span>
							</div>
						</div>
						<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
							{scenes.map((scene) => (
								<div
									key={scene.id}
									className="rounded-lg border bg-background p-3 text-xs"
								>
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
												scene.status === "ready" &&
													"bg-constructive/15 text-constructive",
												scene.status === "review" &&
													"bg-caution/15 text-caution",
												scene.status === "missing" &&
													"bg-destructive/15 text-destructive",
											)}
										>
											{scene.status === "ready"
												? "✓ Pronta"
												: scene.status === "review"
													? "Revisar"
													: "Sem mídia"}
										</span>
									</div>
									<p className="mt-2 line-clamp-2 text-muted-foreground">
										{scene.text}
									</p>
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
								<span className="block font-medium">
									Adicionar texto na timeline
								</span>
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
							<div>
								{stats.withMedia}/{scenes.length || 0} cenas com mídia
							</div>
							<div>{timelineVisualCount} itens na timeline</div>
						</div>
					</div>
					<Button className="mt-3 w-full" onClick={assemble}>
						🚀 Montar projeto na timeline
					</Button>
				</section>
			</div>
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
			<span>
				{done ? "✓ " : ""}
				{label}
			</span>
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
				checked
					? "border-primary bg-primary/5"
					: "bg-background hover:bg-accent",
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
