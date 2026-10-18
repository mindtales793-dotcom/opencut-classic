# SKILL — DarkMiner: Dobra de Nicho, Mercado Cultural e Títulos Originais
Versão: 1.0 | integração: `apps/web/src/darkcut/niche-miner.ts` / `apps/web/src/app/api/darkcut/miner/ideas/route.ts`

## Objetivo
Identificar hipóteses de oportunidades editoriais em canais narrativos (POV, finanças, veículos, documentário, educativo, histórias, listas), comparar formatos e desenvolver novos títulos em idiomas e culturas específicos. Preserve a integridade do DarkMiner existente e use evidências verificáveis.

## Entradas necessárias
1. Um tema/ângulo inicial ou vídeo de oportunidade selecionado.
2. Idioma e mercado cultural concretos (não apenas tradução genérica).
3. Formato narrativo escolhido (POV, documentário, storytelling, educativo, etc.).
4. Exemplo do padrão de título desejado pelo autor.
5. Opcional: vídeos retornados pela extensão Dark Miner 3.8.1+, com IDs, views, inscritos, data, outlier e VPH.

## Processo obrigatório
1. **Higienizar fontes:** aceitar apenas vídeos com IDs válidos do YouTube, título e métricas numéricas. Nunca enviar ou importar chaves API da extensão.
2. **Medir evidência, não adivinhar demanda:** outlier = visualizações / mediana de vídeos longos recentes; views/inscrito é apenas proxy; VPH da extensão = média histórica desde a publicação, não velocidade atual. Ausência de dados reduz confiança.
3. **Identificar padrão do título:** protagonista, verbo, conflito, escolha, consequência, resultado, aspiração, palavras pesquisáveis. Não copiar títulos de terceiros.
4. **Aplicar dobra de nicho:** manter a mecânica narrativa geral e trocar legitimamente sujeito/público/objeto/conflito. Exemplo: a escolha entre financiamento e carro quitado pode virar uma decisão sobre mobilidade, compra usada, deslocamento ou poupança — mediante dados pertinentes.
5. **Tropicalizar:** revisar moeda, terminologia, regime de trabalho, regras financeiras, transporte, cultura cotidiana e nível de linguagem do país escolhido. Não converter valores por intuição e não inventar regulações.
6. **Estudar concorrência:** criar consultas de pesquisa por idioma para YouTube e recomendar validação na extensão. Não afirmar que já pesquisou toda a plataforma quando recebeu somente vídeos salvos.
7. **Gerar oito títulos originais:** alternar estruturas POV, Como, Por que, Maior Erro, Escolha → Consequência e Resultado. Garantir naturalidade da língua local.
8. **Validar riscos editoriais:** clichê, saturação, similaridade com referência, promessa financeira enganosa, tradução literal, cultura mal representada.
9. **Entregar decisões acionáveis:** três dobras de nicho (público/ângulo/porquê/adaptação/como validar), oito títulos, sugestões de pesquisa e notas de confiança.

## Escala de evidências
- **E0:** somente tema digitado pelo autor; todos os achados são ideias, nunca resultados de pesquisa.
- **E1:** títulos/views de vídeos importados; classificar potencial na amostra, sem alegar demanda.
- **E2:** inscrições, histórico do canal, outlier e VPH confiáveis; ordenar oportunidades por score heurístico.
- **E3:** verificação de concorrentes no mercado-alvo por resultados atuais da plataforma, com datas/consulta/amostra; permitir comparações explícitas entre mercados.
Nunca elevar E0/E1 para E3 sem pesquisa real.

## Especificação para o Gemini
Usar Gemini 2.5 Flash-Lite como opção econômica (inclusive nível gratuito sujeito a limites). Enviar somente tema, mercado, padrão de título, formato e pequena amostra dos vídeos validados. JSON de resposta:
`summary`, `nicheDoubles[] {angle, audience, originality, why, culturalAdaptation, validation}`,
`titles[] {title, angle, hook, risk}`, `searchQueries[]`, `culturalChecks[]`, `confidenceNotes[]`.
Os títulos devem estar no idioma-alvo; o resumo em português. Nunca usar a IA para fabricar visualizações, títulos de vídeos existentes, inscritos ou scores reais.

## Integração com o DarkCut
- O usuário escolhe uma oportunidade dentro da aba DarkMiner.
- A IA oferece títulos em novo idioma/mercado e explica escolhas.
- Ao clicar **Enviar à Produção**, o título é colocado no campo de roteiro somente após confirmação quando houver texto anterior.
- Depois o autor desenvolve o roteiro, gera narração, usa Roteiro → SRT e monta a timeline.
- O DarkMiner Chrome continua a executar Radar, Método Malandro e busca avançada. A ponte transfere apenas listas que o usuário enviou explicitamente.

## Privacidade
Não copiar cookies, credenciais, tokens de YouTube ou listas privadas para os prompts Gemini. Credenciais de API permanecem sob controle do usuário. Não oferecer bypass de cotas.
