/**
 * Original editorial direction for every existing DarkCut template.
 *
 * Reference confidence:
 * - visual: audiovisual walkthrough was available.
 * - transcript: structure was examined through a transcript, not video frames.
 * - metadata: only creator description and title were available.
 *
 * Directions describe reusable editing ideas, not copies of reference media.
 */
export type CrisStyleEvidence = "visual" | "transcript" | "metadata" | "design";
export type CrisReferenceStyle = {
  id: string;
  label: string;
  referenceVideoId?: string;
  evidence: CrisStyleEvidence;
  pacing: string;
  camera: string;
  graphics: string;
  sound: string;
  rule: string;
};

export const CRIS_REFERENCE_STYLES: Record<string, CrisReferenceStyle> = {
  "retro-automotive": {
    id: "retro-automotive", label: "Comparações automotivas por capítulos",
    referenceVideoId: "3fj76r96_qM", evidence: "transcript",
    pacing: "Organize as cenas em estágios de escolha, custo e resultado; evite reiniciar o assunto a cada corte.",
    camera: "Alternar o objeto principal com enquadramentos de detalhes comprovados pelo roteiro; movimentos discretos.",
    graphics: "Fichas de preços, custos de manutenção, comparação lado a lado, número e consequência em cada etapa.",
    sound: "Reservar efeitos para mudança de etapa e ações visíveis, não para cada valor financeiro.",
    rule: "Evite números inventados; apresente escolhas financeiras com contexto claro.",
  },
  "pov-finance": {
    id: "pov-finance", label: "Jornada financeira em níveis",
    referenceVideoId: "3fj76r96_qM", evidence: "transcript",
    pacing: "Evolução em etapas com situação concreta, dilema, decisão e consequência; progressão natural.",
    camera: "Priorizar rotina visual e close apenas nas decisões; manter coerência do protagonista.",
    graphics: "Valores, escalas e comparativos curtos; trocar informação só quando a narração trouxer dados.",
    sound: "Uso parcimonioso: ambiente sutil ou escolha explícita. Pausas importantes sem efeito artificial.",
    rule: "Cada nível precisa ensinar algo novo; não repetir a mesma cena de conta bancária.",
  },
  "pov-car": {
    id: "pov-car", label: "POV de escolha e conquista 2D",
    referenceVideoId: "FMTTRb1h3og", evidence: "visual",
    pacing: "Cenas frequentemente entre 3 e 5 segundos, mas respeitar a fala e a ação visível.",
    camera: "Preferir enquadramentos 2D expressivos, cortes diretos e zooms suaves apenas quando o impacto da fala justificar.",
    graphics: "Personagem consistente, objetos informativos dentro da cena, comparações de carros e despesas visualmente legíveis.",
    sound: "Porta, partida, passos e ambiente apenas se a imagem mostrar a ação. Trilha discreta sob a narração.",
    rule: "Evitar transição ornamental em toda cena; explorar mudança real de situação e cenário.",
  },
  "dark-channel": {
    id: "dark-channel", label: "Suspense narrativo crescente",
    referenceVideoId: "EeUz380aY0o", evidence: "metadata",
    pacing: "Tensão cresce pelas consequências; alternar revelações com momentos de respiro.",
    camera: "Movimentos lentos e foco seletivo em objetos narrativamente importantes; sem movimentos excessivos.",
    graphics: "Informação mínima, silhuetas e pistas contextuais originais; nunca copiar personagens ou cenas do vídeo de referência.",
    sound: "Ambientes discretos, silêncio intencional e impactos raros no ponto de virada.",
    rule: "Preservar clareza e evitar glamourizar comportamentos perigosos.",
  },
  documentary: {
    id: "documentary", label: "Documentário narrado com evidências",
    referenceVideoId: "FMTTRb1h3og", evidence: "visual",
    pacing: "Separar cronologia, contexto, obstáculo e resultado; cortar no final de uma ideia.",
    camera: "Fotografias e arquivos em movimentos muito sutis; cenas com espaço para compreender o dado.",
    graphics: "Mapas simples, calendários, documentos e dados tratados como partes visuais da explicação.",
    sound: "Trilha baixa e contínua; SFX apenas para ações reais ou marcos de capítulo.",
    rule: "Datas e informações devem vir do roteiro ou da fonte usada pelo autor.",
  },
  pov: {
    id: "pov", label: "POV 2D emocional e expressivo",
    referenceVideoId: "FMTTRb1h3og", evidence: "visual",
    pacing: "Cortes na cadência da voz, evitando planos repetidos; subir o ritmo nos conflitos e aliviar na resolução.",
    camera: "Plano médio para ação, close para reação, pequeno zoom pontual; evitar movimento sem propósito.",
    graphics: "Expressões faciais claras, personagem consistente e objetos do cotidiano.",
    sound: "Efeitos pontuais sincronizados a ações visíveis; não mascarar narração.",
    rule: "A transformação da história deve aparecer nas ações, não depender apenas de textos flutuantes.",
  },
  vox: {
    id: "vox", label: "Explainer editorial e dados",
    referenceVideoId: "3fj76r96_qM", evidence: "transcript",
    pacing: "Dividir explicação em perguntas, exemplos e respostas; cortes quando entra um novo conceito.",
    camera: "Panorâmicas contidas entre cartões e gráficos; usar movimento para guiar o olhar.",
    graphics: "Diagramas, escala, rótulos curtos e comparações graduais entre níveis.",
    sound: "Transições sonoras discretas entre capítulos, sem efeitos em cada número.",
    rule: "Priorizar clareza matemática e legibilidade a animações vistosas.",
  },
  cinematic: {
    id: "cinematic", label: "Narrativa cinematográfica contemplativa",
    referenceVideoId: "8uTmNQkQtng", evidence: "metadata",
    pacing: "Crescimento de responsabilidade por etapas; introdução, descoberta, dilema e resultado.",
    camera: "Planos mais longos, aproximação lenta e revelação de ambientes originais.",
    graphics: "Cartelas discretas apenas para situar etapa, lugar e passagem de tempo.",
    sound: "Camadas ambientais suaves, alterações graduais de música e silêncio em decisões importantes.",
    rule: "Nada de efeito alto constante; usar contraste entre tensão e tranquilidade.",
  },
  educational: {
    id: "educational", label: "Explicação progressiva acessível",
    referenceVideoId: "FMTTRb1h3og", evidence: "visual",
    pacing: "Cada trecho apresenta um único conceito; alternar exemplos práticos e ilustração simples.",
    camera: "Câmera estável, cortes secos e zoom digital contido.",
    graphics: "Quadros, diagramas básicos, calendário, legenda contextual curta e ícones simples.",
    sound: "Som ambiente leve, efeitos apenas quando um objeto se move ou surge um marco de aprendizado.",
    rule: "Evitar legenda gigante e manter contraste de leitura dentro do enquadramento.",
  },
  list: {
    id: "list", label: "Ranking e níveis com progressão",
    referenceVideoId: "3fj76r96_qM", evidence: "transcript",
    pacing: "Cada item traz um exemplo novo, consequência e gancho para a próxima posição.",
    camera: "Cortes ágeis nas entradas de itens e pausas suficientes para ler números.",
    graphics: "Numeração constante, barra ou escala progressiva e comparativo recorrente sem repetição visual.",
    sound: "Sinal leve de mudança de item, sem bip constante a cada frase.",
    rule: "Os níveis precisam ser distintos e sustentados pelo conteúdo do roteiro.",
  },
  storytelling: {
    id: "storytelling", label: "Transformação em atos POV",
    referenceVideoId: "FMTTRb1h3og", evidence: "visual",
    pacing: "Escolha, resistência, tentativa, queda, virada e resultado; variar o ritmo conforme emoção.",
    camera: "Personagem recorrente em cenários diferentes; close em decisões e plano aberto para consequências.",
    graphics: "Objetos de cena comunicam conflitos; CTA apenas em pausa narrativa adequada.",
    sound: "Ambiente discreto, efeitos cômicos pontuais quando cabíveis e silêncio na virada emocional.",
    rule: "Manter identidade do protagonista, tempo e lugar entre cenas; não repetir enquadramentos sem motivo.",
  },
};

export function getCrisReferenceStyle(id: string): CrisReferenceStyle {
  return CRIS_REFERENCE_STYLES[id] ?? CRIS_REFERENCE_STYLES.documentary;
}

export function crisStylePromptLines(id: string): string[] {
  const style = getCrisReferenceStyle(id);
  return [
    `Direção editorial original: ${style.label}.`,
    `Ritmo desejado: ${style.pacing}`,
    `Câmera: ${style.camera}`,
    `Elementos gráficos: ${style.graphics}`,
    `Edição sonora: ${style.sound}`,
    `Regra essencial: ${style.rule}`,
    "As referências inspiram técnicas genéricas; produza cenas originais, sem imitar literalmente obras alheias.",
    "Duração e timing devem respeitar o SRT/transcrição e os intervalos reais da timeline.",
  ];
}
