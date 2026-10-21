"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
  applyFixedDuration,
  applyMotionPreset,
  applyTransitionPreset,
  syncVisualsToNarration,
} from "@/timeline/darkcut-tools";
import type { DarkCutEffectIntensity, DarkCutMotionPreset, DarkCutTransitionPreset } from "@/timeline/timeline-store";
import { toast } from "sonner";

type TemplateCategory = "Todos" | "POV" | "Financeiro" | "Documentário" | "Educativo" | "Social";
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
  effects: Array<"none" | "blur">;
  badge: string;
  accent: string;
};

// Existing visual presets are preserved; only the AI planning and Remotion Player were removed.
const TEMPLATES: DarkCutTemplate[] = [
	{
		id: "retro-automotive",
		title: "Arquivo Automotivo Premium",
		tagline: "ARQUIVOS • COMPARAÇÕES • DADOS",
		description:
			"Documentário investigativo inspirado em cartões de arquivo retrô: números gigantes, comparações, mapas técnicos, evidências e tela dividida. Aplique movimentos e transições conforme o estilo.",
		category: "Documentário",
		idealFor: "listas de carros, regras, comparações, financiamento, histórias automotivas",
		durationSeconds: 4.5,
		motions: ["documentary", "push-in", "pan-left-right", "ken-burns"],
		transitions: ["fade", "slide-left", "slide-right"],
		intensity: "normal",
		effects: ["none"],
		badge: "🗂️",
		accent: "from-[#a81818]/25 via-[#f4eedb]/10 to-[#d4a359]/25",
	},
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
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
		effects: ["none", "blur"],
		badge: "📖",
		accent: "from-purple-500/20 via-transparent to-pink-500/10",
	},
	{
		id: "shorts-hook",
		title: "Shorts • Gancho",
		tagline: "GANCHO • RITMO • RETENÇÃO",
		description: "Cortes rápidos, zooms e entradas marcadas para Shorts e Reels. Ajuste o projeto para 9:16 quando necessário.",
		category: "Social",
		idealFor: "shorts, reels, chamadas, dicas rápidas",
		durationSeconds: 2.4,
		motions: ["push-in","zoom-in","pan-right-left"],
		transitions: ["pop","zoom","fade"],
		intensity: "strong",
		effects: ["none"],
		badge: "📱",
		accent: "from-rose-500/25 via-fuchsia-500/10 to-orange-500/20",
	},
	{
		id: "tech-neon",
		title: "Tecnologia Neon",
		tagline: "CÓDIGO • FUTURO • DESTAQUES",
		description: "Contraste ciano, movimento lateral e zoom para tecnologia, ferramentas e tutoriais.",
		category: "Educativo",
		idealFor: "tecnologia, aplicativos, inteligência artificial e games",
		durationSeconds: 3.2,
		motions: ["pan-left-right","push-in","zoom-in"],
		transitions: ["slide-left","zoom","fade"],
		intensity: "normal",
		effects: ["none","blur"],
		badge: "💻",
		accent: "from-cyan-500/25 via-sky-500/10 to-indigo-500/20",
	},
	{
		id: "news-brief",
		title: "Noticiário Express",
		tagline: "FATOS • CONTEXTO • RESUMO",
		description: "Ritmo editorial, enquadramentos estáveis e textos de contexto para notícias e entrevistas.",
		category: "Documentário",
		idealFor: "notícias, entrevistas, atualidades e reportagens",
		durationSeconds: 3.8,
		motions: ["documentary","pan-left-right","zoom-in"],
		transitions: ["fade","slide-left"],
		intensity: "soft",
		effects: ["none"],
		badge: "📰",
		accent: "from-blue-500/20 via-slate-500/10 to-red-500/15",
	},
	{
		id: "podcast-cuts",
		title: "Cortes de Podcast",
		tagline: "VOZ • FRASE • DESTAQUE",
		description: "Cortes guiados pela fala, zooms pontuais e títulos curtos para entrevistas e podcasts.",
		category: "Social",
		idealFor: "podcasts, entrevistas, depoimentos e cortes narrados",
		durationSeconds: 3.5,
		motions: ["zoom-in","pull-out","documentary"],
		transitions: ["fade","pop"],
		intensity: "soft",
		effects: ["none"],
		badge: "🎙️",
		accent: "from-violet-500/20 via-purple-500/10 to-indigo-500/20",
	},
	{
		id: "minimal-clean",
		title: "Minimalista Clean",
		tagline: "ESPAÇO • CLAREZA • ELEGÂNCIA",
		description: "Transições suaves e tipografia limpa para tutoriais, apresentações e marcas.",
		category: "Educativo",
		idealFor: "aulas, tutoriais, portfólios e apresentações",
		durationSeconds: 5,
		motions: ["documentary","zoom-in","pull-out"],
		transitions: ["fade"],
		intensity: "soft",
		effects: ["none"],
		badge: "◻️",
		accent: "from-slate-400/20 via-white/5 to-sky-400/10",
	},
	{
		id: "meme-reaction",
		title: "Meme & Reação",
		tagline: "HUMOR • CORTE • IMPACTO",
		description: "Zooms e entradas pop para humor leve, reações e curiosidades rápidas.",
		category: "Social",
		idealFor: "memes, reações, curiosidades e humor",
		durationSeconds: 2.1,
		motions: ["push-in","zoom-in","pan-up-down"],
		transitions: ["pop","zoom","slide-right"],
		intensity: "strong",
		effects: ["none"],
		badge: "😂",
		accent: "from-yellow-400/25 via-orange-400/10 to-pink-500/20",
	},
	{
		id: "travel-vlog",
		title: "Vlog de Viagem",
		tagline: "LUGAR • MOVIMENTO • MEMÓRIA",
		description: "Panorâmicas, Ken Burns e transições leves para mostrar lugares e experiências.",
		category: "POV",
		idealFor: "viagens, passeios, cidades, natureza e vlogs",
		durationSeconds: 3.4,
		motions: ["pan-left-right","ken-burns","pull-out"],
		transitions: ["fade","slide-left","ken-burns"],
		intensity: "normal",
		effects: ["none"],
		badge: "✈️",
		accent: "from-emerald-500/20 via-cyan-500/10 to-amber-400/20",
	},
	{
		id: "real-estate",
		title: "Imóveis Premium",
		tagline: "ESPAÇO • DETALHE • VALOR",
		description: "Passeios visuais suaves e cartelas de informação para imóveis, arquitetura e negócios.",
		category: "Financeiro",
		idealFor: "imóveis, arquitetura, apartamentos e apresentação de produtos",
		durationSeconds: 4.8,
		motions: ["pan-left-right","zoom-in","ken-burns"],
		transitions: ["fade","slide-right"],
		intensity: "soft",
		effects: ["none","blur"],
		badge: "🏡",
		accent: "from-amber-400/20 via-slate-500/10 to-emerald-500/15",
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


export function DarkCutTemplatesView({ compact = false }: { compact?: boolean }) {
  const editor = useEditor();
  const { selectedElements } = useElementSelection();
  const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
  const [category, setCategory] = useState<TemplateCategory>("Todos");
  const [alignNarration, setAlignNarration] = useState(false);
  const [adjustDurations, setAdjustDurations] = useState(false);
  const allRefs = useMemo(() => scene
    ? [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
        track.elements.filter((element) => element.type === "image" || element.type === "video")
          .map((element) => ({ trackId: track.id, elementId: element.id })))
    : [], [scene]);
  const filtered = TEMPLATES.filter((template) => category === "Todos" || template.category === category);

  const applyTemplate = (template: DarkCutTemplate) => {
    const refs = selectedElements.length ? selectedElements : allRefs;
    if (!refs.length) {
      toast.error("Adicione imagens ou vídeos à timeline primeiro.");
      return;
    }
    // Native keyframes, deterministic preset choice; no model inference or background service.
    const duration = adjustDurations
      ? applyFixedDuration({ editor, refs, seconds: template.durationSeconds })
      : { changed: 0, clamped: 0 };
    const motion = applyMotionPreset({
      editor, refs, preset: template.motions[0], intensity: template.intensity,
    });
    const transition = applyTransitionPreset({
      editor, refs, preset: template.transitions[0],
    });
    if (alignNarration) {
      const result = syncVisualsToNarration({ editor, refs });
      if (!result.narrationSeconds) toast.info("Sem narração na timeline; duração padrão aplicada.");
    }
    toast.success(template.title + ": " + Math.max(duration.changed, motion, transition) + " clipes ajustados.");
  };

  return (
    <div className="space-y-4 p-4">
      <header>
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Presets locais de duração, movimentos e transições. Sem IA e sem Remotion.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs">
          Categoria
          <select
            className="ml-2 rounded-md border bg-background px-2 py-1"
            value={category}
            onChange={(event) => setCategory(event.target.value as TemplateCategory)}
          >
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={adjustDurations} onChange={(event) => setAdjustDurations(event.target.checked)} />
          Aplicar duração sugerida (altera tempos)
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={alignNarration} onChange={(event) => setAlignNarration(event.target.checked)} />
          Sincronizar com a narração ao aplicar
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedElements.length ? String(selectedElements.length) + " clipes selecionados" : "Sem seleção: aplica a todos os clipes visuais da cena."}
      </p>
      <div className={compact ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
        {filtered.map((template) => (
          <article key={template.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">{template.badge}</span>
              <div>
                <h3 className="text-sm font-semibold">{template.title}</h3>
                <p className="text-xs text-muted-foreground">{template.tagline}</p>
              </div>
            </div>
            <p className="mt-3 text-xs">{template.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {template.durationSeconds}s por cena · {template.motions.length} movimentos · {template.transitions.length} transições
            </p>
            <Button className="mt-3 w-full" size="sm" onClick={() => applyTemplate(template)}>
              Aplicar template
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
