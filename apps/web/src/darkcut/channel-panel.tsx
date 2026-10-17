"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProjectDraft } from "./project-draft";
import { useDarkCutProductionStore } from "@/components/editor/panels/assets/darkcut-production-store";
type Channel = {
	id: string;
	name: string;
	description: string;
	thumbnail?: string;
	created: string;
	subscribers: string | null;
	views: string;
	videos: string;
};
export function ChannelPanel() {
	const [input, setInput] = useState(""),
		[busy, setBusy] = useState(false);
	const [channel, setChannel] = useProjectDraft<Channel | null>(
		"channel",
		null,
	);
	const keys = useDarkCutProductionStore((s) => s.youtubeApiKeys);
	const setChannelName = useDarkCutProductionStore((s) => s.setChannelName);
	const load = async () => {
		setBusy(true);
		try {
			const r = await fetch("/api/darkcut/channel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channel: input, keys }),
			});
			const c = await r.json();
			if (!r.ok) throw new Error(c.error);
			setChannel(c);
			setChannelName(c.name);
			toast.success("Canal cadastrado neste projeto.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha ao consultar canal.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="mt-3 space-y-2 rounded-md border bg-card p-3 text-xs">
			<h3 className="text-sm font-semibold">Canal do projeto</h3>
			<label className="block">
				ID, @handle ou link
				<input
					className="mt-1 w-full rounded border bg-background p-2"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="@jocainvesteOFICIAL"
				/>
			</label>
			<Button
				variant="secondary"
				disabled={busy || !input.trim()}
				onClick={load}
			>
				{busy ? "Consultando…" : "Importar informações do canal"}
			</Button>
			{channel && (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						{channel.thumbnail && (
							<img
								src={channel.thumbnail}
								alt=""
								className="size-10 rounded-full"
							/>
						)}
						<strong>✓ {channel.name}</strong>
					</div>
					<p>
						{channel.subscribers ?? "Ocultos"} inscritos • {channel.videos}{" "}
						vídeos • {channel.views} visualizações
					</p>
					<p>
						Criado em {new Date(channel.created).toLocaleDateString("pt-BR")}
					</p>
					<p className="max-h-20 overflow-auto text-muted-foreground">
						{channel.description}
					</p>
					<a
						href={`https://www.youtube.com/channel/${channel.id}`}
						target="_blank"
						rel="noreferrer"
						className="underline"
					>
						Abrir canal
					</a>
				</div>
			)}
		</section>
	);
}
