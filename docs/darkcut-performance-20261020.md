# DARKCUT — otimização de desempenho (20/10/2026)

## Objetivo
Melhorar o uso diário do DARKCUT Studio, especialmente em computadores com gráficos integrados, 12 GB de RAM e armazenamento HDD, **sem remover** recursos, templates, efeitos, logo, cores ou opções de exportação.

## Alterações implementadas
- **Carregamento por demanda**: as abas pesadas (mídias, áudio, propriedades, legendas, texto, stickers, efeitos, configurações e produção) são importadas dinamicamente quando abertas. As abas já adiadas anteriormente continuam iguais. Espera-se redução do JS inicial, mas o tempo exato exige medição real.
- **Miniaturas econômicas**: bibliotecas usam prévias JPEG com dimensão máxima **480×270**, em vez de 1280×720 em prévias de vídeos; imagens importadas passam de um teto de 720×405 a **480×270**. O arquivo original permanece intacto para edição e exportação.
- **Biblioteca progressiva**: inicialmente monta até **96 cartões**, ampliando o conjunto conforme a rolagem ou pelo botão **Carregar mais mídias**. Mantém seleção em lote baseada na lista inteira e suporta revelar um item recém-adicionado via ID.
- **Catálogo de templates**: descarrega imagens e interrompe a animação de prévias fora da área visível com `IntersectionObserver`; a prévia retoma quando volta à tela.
- **Timeline**: agrupa múltiplos eventos de rolagem da forma de onda em um único `requestAnimationFrame`; cancela quadros pendentes ao desmontar.

## Preservado
- Arquivos originais, resolução/FPS/codec e qualidade configurados na exportação.
- Templates, transições, narração, legendas, músicas, FlowZika, DarkMiner, logo e tema visual.
- Fluxos de exportação e renderização existentes, sem alteração de FFmpeg.
- Ordenação de mídias e seleção para montar cenas.

## Validação
- `bun test apps/web/src/media/__tests__/thumbnail-bounds.test.ts`
- Testes existentes + `bun run build:web` via GitHub Actions `DarkCut Checks`.
- Workflow Windows existente deve construir o instalador, sem teste de desempenho real em um computador Intel HD 620.

## QA manual recomendado
1. Abrir o DARKCUT; alternar entre Produção, Mídias, Modelos, Áudio, Legendas e Timeline.
2. Importar uma pasta com 250+ imagens; rolar até o fim, selecionar mídias além da 96ª, usar **Selecionar tudo**, ordenar e revelar mídia importada.
3. Abrir templates e rolar o catálogo: confirmar as prévias ativas e a aplicação do estilo.
4. Rolar rapidamente a timeline com duas faixas de áudio e zoom variável; a forma de onda deve acompanhar sem piscar.
5. Exportar um vídeo em 1080p com a qualidade e o formato escolhidos: o limite das **miniaturas** não deve alterar a exportação.

**Nota:** ganho real de FPS/tempo de inicialização não foi quantificado. Mudanças devem ser medidas em build empacotado e no hardware alvo antes de declarar aceleramento percentual.
