# Referências audiovisuais para a CRIS — 2026-10-18

A CRIS deve aprender **princípios gerais de edição**, nunca duplicar cenas, personagens, efeitos ou layouts específicos dos autores.

## Referências e confiabilidade

1. **Eu Te Explico — POV: Você LARGOU a CLT para entrar na ESA...**  
   https://youtu.be/FMTTRb1h3og — 10:41  
   Fonte: análise audiovisual estruturada do vídeo.  
   Evidência de estilo: animação 2D minimalista, personagens expressivos, predominância de cortes diretos, planos frequentemente entre 3 e 5 segundos, reenquadramentos modestos, paleta suave, objetos explicativos na cena, efeitos pontuais sincronizados a ações, trilha instrumental baixa e CTA visual intermediário.  
   Aplicação original: POV, POV Carro, Educativo, Documentário, Storytelling. Não copiar identidade gráfica.

2. **Pincel Capital — Sua Vida em Cada Nível de Salário no Brasil**  
   https://youtu.be/3fj76r96_qM — 13:45  
   Fonte: transcrição completa, **sem análise visual**.  
   Evidência narrativa: progressão do salário mínimo até níveis elevados de renda; cada segmento segue contexto cotidiano, dilema, transformação e lição. Mostra evolução financeira em degraus sem perder um protagonista em segunda pessoa.  
   Aplicação original: POV Financeiro, Lista Dinâmica, VOX, Arquivo Automotivo. A cadência de cortes e efeitos desse vídeo ainda não foi verificada.

3. **POV Brasil — POV: Você Virou Agiota no Brasil**  
   https://youtu.be/EeUz380aY0o — 12:57  
   Fonte: título, descrição e metadados, **sem análise audiovisual**.  
   Evidência narrativa: protagonismo em POV, ascensão e consequências, tensão crescente.  
   Possível aplicação autoral: Dark Channel, com foco em suspense narrativo e pausas. Não inferir uma técnica concreta de edição, trilha, FX ou paleta a partir de descrição.

4. **Dentro do Sistema — Sua Vida Como Agente Secreto da ABIN**  
   https://youtu.be/8uTmNQkQtng — 14:32  
   Fonte: título, descrição e metadados, **sem análise audiovisual**.  
   Evidência narrativa: trajetória em estágios e progressão de responsabilidades.  
   Possível aplicação autoral: Cinematográfico, com capítulos e tensão controlada. Sem afirmações sobre duração média de planos ou efeitos do vídeo.

## Regras de automação

- A transcrição/SRT e o início/fim real de cada elemento da timeline prevalecem sobre durações médias estimadas.
- Cada template tem um perfil original próprio em `reference-editing-styles.ts`; o sistema não deve convergir tudo para um estilo único.
- Não adicionar efeitos sonoros obrigatórios em todas as cenas. Vincular sons às ações visíveis e à intenção dramática.
- Controle da transição, do movimento e das sobreposições permanece com os recursos existentes da timeline.
- Manter protagonistas consistentes, objetos de cena informativos e variedade de enquadramentos.
- Preservar legibilidade em 16:9 e texto de overlay conciso.
- Novas referências só entram como 'visualmente verificadas' depois de análise de frames e som. Transcrição por si só não valida estética.

## Próximos testes manuais no Windows

1. Gerar um roteiro curto com todos os onze templates e verificar que cada plano da CRIS usa seu perfil.
2. Importar narração, selecionar a faixa de voz e conferir o sincronismo das decisões por intervalo.
3. Inserir efeitos CC0 com o botão CRIS e escutar o balanço com a narração.
4. Desfazer/revisar as inserções e exportar; conferir que os templates antigos e a timeline não regrediram.
