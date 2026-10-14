"use client";

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

	const [scenes, setScenes] = useState<DarkCutScene[]>([]);
	const [addCaptions, setAddCaptions] = useState(true);

	const stats = useMemo(() => {
		const ready = scenes.filter((scene) => scene.status === "ready").length;
		const review = scenes.filter((scene) => scene.status === "review").length;
		const missing = scenes.filter((scene) => scene.status === "missing").length;
		return { ready, review, missing };
	}, [scenes]);

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
		<div className="h-full overflow-y-auto p-4">
			<div className="mb-4">
				<p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
					DarkCut Studio
				</p>
				<h2 className="mt-1 text-lg font-semibold">Produção automática</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Comece pelo roteiro. Depois siga para Sincronização para gerar a narração.
				</p>
			</div>

			<section className="space-y-3 rounded-md border bg-card p-3">
				<div className="text-sm font-medium">Projeto</div>
				<label className="block text-xs text-muted-foreground">
					Canal
					<input
						value={channelName}
						onChange={(event) => setChannelName(event.target.value)}
						placeholder="Ex.: Mentes Financeiras"
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
			</section>

			<section className="mt-3 space-y-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
					<div className="text-sm font-medium">Roteiro</div>
					<div className="text-[0.7rem] text-muted-foreground">
						O mesmo roteiro é usado para a narração e para criar as cenas.
					</div>
				</div>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<span>Duração</span>
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
				</div>
				<div className="flex justify-end">
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
					className="min-h-36 w-full resize-y rounded-md border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
				/>
				<div className="grid grid-cols-2 gap-2">
					<Button variant="secondary" onClick={generateScenes}>
						Gerar cenas e prompts
					</Button>
					<Button
						disabled={!script.trim()}
						onClick={() => setActiveTab("sync")}
					>
						Continuar para narração →
					</Button>
				</div>
				{scenes.length > 0 && (
					<div className="grid grid-cols-4 gap-2 text-center text-[0.7rem]">
						<div className="rounded-md border p-2">
							<div className="text-base font-semibold">{scenes.length}</div>
							<div className="text-muted-foreground">Cenas</div>
						</div>
						<div className="rounded-md border p-2">
							<div className="text-base font-semibold text-constructive">
								{stats.ready}
							</div>
							<div className="text-muted-foreground">Prontas</div>
						</div>
						<div className="rounded-md border p-2">
							<div className="text-base font-semibold text-caution">
								{stats.review}
							</div>
							<div className="text-muted-foreground">Revisar</div>
						</div>
						<div className="rounded-md border p-2">
							<div className="text-base font-semibold text-destructive">
								{stats.missing}
							</div>
							<div className="text-muted-foreground">Sem mídia</div>
						</div>
					</div>
				)}
			</section>

			<section className="mt-3 rounded-md border bg-card p-3">
				<div className="mb-2 text-sm font-medium">Tipo de produção</div>
				<div className="grid gap-2">
					{modeCards.map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() => setMode(item.key)}
							className={cn(
								"rounded-md border p-3 text-left transition-colors",
								mode === item.key
									? "border-primary bg-primary/10"
									: "border-border bg-background hover:bg-accent",
							)}
						>
							<div className="text-sm font-medium">{item.title}</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{item.description}
							</div>
						</button>
					))}
				</div>
			</section>

			<section className="mt-3 rounded-md border bg-card p-3">
				<div className="flex items-center justify-between">
					<div className="text-sm font-medium">Fontes de mídia</div>
					<span className="text-[0.7rem] text-muted-foreground">
						{visualMediaCount} arquivos visuais importados
					</span>
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
				<div className="mt-3 grid gap-2">
					<Button variant="secondary" onClick={assignMedia}>
						Selecionar mídia da biblioteca
					</Button>
					<Button
						variant="secondary"
						disabled={!scenes.length || !useFlowZika}
						onClick={() => downloadFlowZikaQueue(scenes)}
					>
						Baixar fila de prompts para FlowZika
					</Button>
				</div>
			</section>

			{scenes.length > 0 && (
				<section className="mt-3 rounded-md border bg-card p-3">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-sm font-medium">Fila de cenas</div>
						<span className="text-[0.7rem] text-muted-foreground">
							{scenes.length} itens
						</span>
					</div>
					<div className="max-h-56 space-y-2 overflow-y-auto pr-1">
						{scenes.map((scene) => (
							<div
								key={scene.id}
								className="rounded-md border bg-background p-2 text-xs"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">Cena {scene.index}</span>
									<span
										className={cn(
											"rounded px-1.5 py-0.5 text-[0.65rem]",
											scene.status === "ready" &&
												"bg-constructive/15 text-constructive",
											scene.status === "review" &&
												"bg-caution/15 text-caution",
											scene.status === "missing" &&
												"bg-destructive/15 text-destructive",
										)}
									>
										{scene.status === "ready"
											? "Pronta"
											: scene.status === "review"
												? "Revisar"
												: "Sem mídia"}
									</span>
								</div>
								<p className="mt-1 line-clamp-2 text-muted-foreground">
									{scene.text}
								</p>
								{scene.mediaName && (
									<p className="mt-1 truncate text-[0.68rem] text-foreground">
										{scene.mediaName}
									</p>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			<section className="mt-3 rounded-md border bg-card p-3">
				<label className="flex items-center justify-between gap-3 text-xs">
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
				<Button className="mt-3 w-full" onClick={assemble}>
					🚀 Montar projeto na timeline
				</Button>
			</section>
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
				"flex cursor-pointer items-center justify-between rounded-md border p-2",
				checked && "border-primary bg-primary/5",
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
