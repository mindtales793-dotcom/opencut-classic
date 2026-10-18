/** DarkMiner Studio | data-driven, original editorial analysis (not predictions). */
export type MinerVideo = {
  videoId: string; title: string; channel: string; views: number;
  subscribers: number | null; publishedAt?: string; language?: string;
  outlier?: number | null; vph?: number | null;
};
export type Opportunity = { video: MinerVideo; score: number; reasons: string[]; cautions: string[] };
export type TargetMarket = { language: string; country: string; label: string; culturalLens: string };
export const NICHE_MARKETS: TargetMarket[] = [
  { language: "pt-BR", country: "BR", label: "Português • Brasil", culturalLens: "CLT, preço em reais, financiamentos, transporte público e custo de vida local" },
  { language: "es-MX", country: "MX", label: "Espanhol • México", culturalLens: "pesos mexicanos, trabalho assalariado, custos de automóveis e família" },
  { language: "es-ES", country: "ES", label: "Espanhol • Espanha", culturalLens: "euros, contratos de trabalho, custos de transporte e regulamentação local" },
  { language: "en-US", country: "US", label: "Inglês • Estados Unidos", culturalLens: "dólares, crédito, commuting, seguro de veículos e emprego" },
  { language: "en-GB", country: "GB", label: "Inglês • Reino Unido", culturalLens: "libras, transporte, car finance e custos cotidianos" },
  { language: "fr-FR", country: "FR", label: "Francês • França", culturalLens: "euros, pouvoir d'achat, consumo e mobilidade" },
  { language: "de-DE", country: "DE", label: "Alemão • Alemanha", culturalLens: "euros, carros usados, leasing e trabalho" },
  { language: "it-IT", country: "IT", label: "Italiano • Itália", culturalLens: "euros, emprego, custo de manutenção e família" },
  { language: "ja-JP", country: "JP", label: "Japonês • Japão", culturalLens: "ienes, transporte ferroviário, custos de carro e estilo de trabalho" },
  { language: "hi-IN", country: "IN", label: "Hindi • Índia", culturalLens: "rúpias, transporte, emprego e contextos regionais" },
];
export function sanitizeMinerVideo(input: unknown): MinerVideo | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const videoId = String(a.videoId ?? a.video_id ?? "").trim();
  const title = String(a.title ?? "").trim().slice(0, 220);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title) return null;
  const views = Math.max(0, Math.round(Number(a.views ?? a.viewCount ?? 0) || 0));
  const subValue = a.subscribers ?? a.subs;
  const subscribers = subValue == null ? null : Math.max(0, Math.round(Number(subValue) || 0));
  const ratio = Number(a.outlier ?? a.outlier_ratio);
  const vph = Number(a.vph);
  return {
    videoId, title, channel: String(a.channel ?? a.channelTitle ?? a.channel_name ?? "Canal sem nome").slice(0, 150),
    views: Math.min(1e12, views), subscribers,
    publishedAt: typeof a.publishedAt === "string" ? a.publishedAt.slice(0, 40) : undefined,
    language: typeof a.language === "string" ? a.language.slice(0, 20) : undefined,
    outlier: Number.isFinite(ratio) && ratio > 0 ? ratio : null,
    vph: Number.isFinite(vph) && vph > 0 ? vph : null,
  };
}
export function rankMinerOpportunities(items: MinerVideo[], now = Date.now()): Opportunity[] {
  return items.map(video => {
    const reasons: string[] = [], cautions: string[] = [];
    let score = 0;
    if (video.outlier && video.outlier > 0) {
      score += Math.min(45, 12 * Math.log2(1 + video.outlier));
      reasons.push(`Outlier ${video.outlier.toFixed(1)}x vs. mediana do canal`);
    } else cautions.push("Sem mediana validada; outlier desconhecido");
    if (video.vph && video.vph > 0) {
      score += Math.min(25, 4.2 * Math.log2(video.vph + 1));
      reasons.push(`VPH médio: ${Math.round(video.vph)} (não aceleração atual)`);
    } else cautions.push("Sem VPH informado");
    if (video.subscribers != null && video.subscribers > 0) {
      const ratio = video.views / video.subscribers;
      score += Math.min(20, Math.max(0, Math.log2(ratio + 1)) * 6);
      if (ratio >= 2) reasons.push("Alcance maior que a base de inscritos");
    } else cautions.push("Inscritos indisponíveis; comparação incompleta");
    if (video.publishedAt) {
      const age = (now - Date.parse(video.publishedAt)) / 86400000;
      if (Number.isFinite(age) && age >= 0 && age <= 90) { score += Math.max(0, 10 - age / 9); reasons.push("Publicação recente"); }
    }
    return { video, score: Math.min(100, Math.round(score)), reasons, cautions };
  }).sort((a,b)=>b.score-a.score);
}
export function localTitleAngles(subject: string, market: TargetMarket, example?: string): string[] {
  const trimmed = subject.replace(/\s+/g," ").trim().slice(0,110) || "uma escolha financeira";
  const exampleHint = example ? " (ângulo inspirado em uma oportunidade, sem copiar o título)" : "";
  const templates = [
    `Por que as pessoas estão repensando ${trimmed}?`,
    `POV: Você decidiu mudar ${trimmed} — e viu as consequências`,
    `Como ${trimmed} pode mudar sua vida na prática?`,
    `O maior erro de quem tenta ${trimmed}`,
    `A escolha que ninguém entendeu: ${trimmed}`,
  ];
  return templates.map(x => x + exampleHint);
}
export function buildNicheSkillPrompt(args: { title: string; subject: string; market: TargetMarket; candidates: Opportunity[]; format: string }): string {
  const evidence = args.candidates.slice(0,5).map(o=>({
    title:o.video.title, views:o.video.views, subscribers:o.video.subscribers,
    outlier:o.video.outlier, vph:o.video.vph, score:o.score,
  }));
  return [
    "Você é o analista editorial DarkMiner de oportunidades em canais narrativos de vídeo.",
    "Analise diferenciação de ângulo, dobra de nicho, tropicalização e títulos ORIGINAIS. Não copie títulos.",
    "NUNCA invente dados de busca, demanda, público ou concorrência; diferencie dados fornecidos e hipóteses.",
    "Dobra de nicho = transferir estrutura narrativa para outro público/subtema com conflito original e contexto real.",
    "Tropicalização = adaptar referências (moeda, leis, exemplos, gírias, necessidades) ao mercado alvo, sem estereótipos.",
    "Não afirme validação cultural sem pesquisa adicional. Dados de vídeo não demonstram demanda por si só.",
    `Mercado: ${args.market.label}; língua: ${args.market.language}; referências locais: ${args.market.culturalLens}.`,
    `Assunto escolhido: ${args.subject.slice(0,200)}. Padrão de título desejado: ${args.title.slice(0,200)}.`,
    `Formato: ${args.format.slice(0,60)}.`,
    "Evidências reais da extensão (scores são heurísticos, VPH é média desde publicação):",
    JSON.stringify(evidence),
    "Responda em JSON contendo keys: summary (string), nicheDoubles (3 objetos: angle,audience,originality,why,culturalAdaptation,validation), titles (8 objetos: title,angle,hook,risk), searchQueries (6 strings), culturalChecks (4 strings), confidenceNotes (3 strings).",
    "Escreva os títulos no idioma do mercado alvo e o resumo em português brasileiro.",
    "Considere as próprias limitações do algoritmo e evite alegar probabilidade de viralizar.",
  ].join("\n");
}
