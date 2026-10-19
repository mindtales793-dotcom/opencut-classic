# ACE-Step 1.5 — trilhas IA locais no DarkCut Studio

O DarkCut usa **ACE-Step 1.5**, não o ACE-Step v1 original, porque a versão 1.5 tem API HTTP assíncrona documentada. Repositório oficial: https://github.com/ace-step/ACE-Step-1.5. API: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md.

## Windows

1. Instale a versão 1.5 seguindo o README oficial ou pacote portátil oficial.
2. Execute `start_api_server.bat` dentro da pasta do ACE-Step 1.5 e espere os modelos carregarem. O servidor deve ficar em `http://127.0.0.1:8001`.
3. Abra o EXE do DarkCut Studio, entre na aba **Áudio → IA · Trilhas**, clique em **Verificar** e selecione um estilo de música.
4. Descreva o instrumental, escolha duração e clique **Gerar trilha instrumental**. O botão acompanha a fila. Quando estiver pronto, é possível ouvir, baixar MP3 ou adicionar à **A2 • Música de fundo**.
5. Na seção **Mixagem automática**, ajuste o ducking da música quando a narração A1 estiver ativa.

Não é necessário contratar API de IA. Os modelos são baixados separadamente e geram áudio com seu próprio processador/GPU; velocidade e viabilidade dependem do computador. O DarkCut não instala drivers, Python nem modelos automaticamente, nem abre portas externas. O processo ACE-Step é opcional. A primeira execução não funciona offline se o modelo ainda precisar ser baixado.

### Limites da integração

- O DarkCut encaminha somente pedidos para `127.0.0.1:8001` quando está no runtime desktop; a interface não aceita endereço externo.
- O backend gera **uma trilha instrumental por tarefa** e consulta status por ID. A trilha gerada entra na timeline como mídia local importada. Não há promessa de música em tempo real.
- A trilha pode ter de dez segundos a dez minutos. A geração pode ser lenta ou falhar em máquinas com pouca memória de vídeo. Modelos de menor porte e CPU offload são configurados no próprio ACE-Step.
- O código do ACE-Step 1.5 usa licença MIT; os modelos têm termos próprios a conferir no repositório/model card. Nenhum modelo de IA garante que a composição não lembre músicas protegidas. Revise antes de publicar.

A integração HTTP pode ser testada pelo pipeline web em CI, mas o teste **real de geração de música requer o ACE-Step 1.5 instalado com pesos de modelo** no computador do usuário; não deve ser descrito como validado sem isso.
