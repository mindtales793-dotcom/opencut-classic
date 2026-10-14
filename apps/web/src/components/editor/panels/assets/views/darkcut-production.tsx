"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

type ProductionMode = "ai" | "broll" | "hybrid";

export function DarkCutProductionView() {
	const [mode, setMode] = useState<ProductionMode>("hybrid");

	const modes: Array<{ key: ProductionMode; title: string; description: string }> = [
		{ key: "ai", title: "Imagens IA", description: "FlowZika e imagens geradas por cena." },
		{ key: "broll", title: "B-roll / Vídeo", description: "YouTube, bancos e arquivos locais." },
		{ key: "hybrid", title: "Híbrido", description: "Combina IA, vídeos e bancos automaticamente." },
	];

	return (
		<div className="h-full overflow-y-auto p-4">
			<div className="mb-4">
				<p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
					DarkCut Studio
				</p>
				<h2 className="mt-1 text-lg font-semibold">Produção automática</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Escolha como o DarkCut deve montar as cenas antes de enviar tudo para a timeline.
				</p>
			</div>

			<div className="grid gap-2">
				{modes.map((item) => (
					<button
						key={item.key}
						type="button"
						onClick={() => setMode(item.key)}
						className={cn(
							"rounded-md border p-3 text-left transition-colors",
							mode === item.key
								? "border-primary bg-primary/10"
								: "border-border bg-card hover:bg-accent",
						)}
					>
						<div className="text-sm font-medium">{item.title}</div>
						<div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
					</button>
				))}
			</div>

			<div className="mt-4 rounded-md border bg-card p-3">
				<div className="text-sm font-medium">Fluxo do projeto</div>
				<div className="mt-2 space-y-2 text-xs text-muted-foreground">
					<div>1. Roteiro e narração</div>
					<div>2. Separação em cenas</div>
					<div>3. Prompts e busca de mídia</div>
					<div>4. Seleção automática</div>
					<div>5. Montagem na timeline</div>
				</div>
			</div>

			<Button className="mt-4 w-full" disabled>
				Produzir projeto
			</Button>
			<p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
				O motor automático será conectado nas próximas etapas da migração.
			</p>
		</div>
	);
}
