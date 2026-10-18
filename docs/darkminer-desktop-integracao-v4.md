# DarkMiner Desktop 3.6.1 + Extensão 3.9 + DarkCut Studio

## Diagnóstico do ZIP original fornecido
- Backend **FastAPI** (`main.py`), interface HTML/CSS/JS (`static/`), banco SQLite e chaves YouTube locais.
- Servidor oficial do Desktop: `127.0.0.1:8000`, podendo trocar para 8001–8010 caso ocupado.
- As telas originais incluem Dashboard, Descobrir, Ranking TOP30, Oportunidades, Outliers, Novidades, Canais, Meu Canal, Similares, Anotações, Salvos, Produção, Temas e demanda, DNA de títulos, Tropicalização, Monitor, Automação, Estatísticas, Regras, Ajustes, Aparência, Extensão e APIs.
- O executável da versão 3.6.1 inicia FastAPI, **mas também abre uma janela própria** via pywebview.
- A extensão 3.9 separada já se comunica com DarkCut via ponte local na porta 3217. A extensão antiga embutida no pacote Desktop é 3.2 e **não** deve ser instalada junto com a 3.9 porque elas disputam a interface do YouTube.

## Integração implementada no DarkCut
1. Aba `DarkMiner` → cartão **DarkMiner Desktop completo** com status e contagens locais.
2. Detectar o DarkMiner 3.6.1 via `GET /api/status` somente em `127.0.0.1:8000..8010`.
3. Buscar, sem gravar no banco, favoritos, monitoramento, outliers e fila de produção de APIs já existentes. Retornar apenas dados de vídeos (título, canal, views, inscritos, datas, VPH, outlier calculado pelo próprio backend).
4. Unir por `video_id` ao material que a extensão 3.9 envia ao DarkCut, preservando informações mais ricas, sem substituir as bases originais.
5. Botão **Abrir DarkMiner completo dentro do DarkCut**: dashboard original em overlay responsivo de tela cheia, sem remover timeline nem outros painéis.
6. No Windows, um preload Electron isolado dá acesso somente a `chooseAndStart`, `startSaved` e `connection`. O caminho do EXE é escolhido pelo usuário em diálogo nativo; não é enviado em requisições do site ou executado arbitrariamente.
7. Persistência local só do caminho do EXE; não leva banco, cookies, credenciais ou chaves do DarkMiner para o GitHub.
8. Ao sair do DarkCut, seu subprocesso DarkMiner iniciado pelo DarkCut é encerrado; uma instância já aberta por você não é terminada.

## Uma janela em vez de duas
O ZIP complementar `DarkMiner_DarkCut_Integracao_4.0_SEM_CHAVES.zip`, entregue na conversa, inclui:
- fontes essenciais **sem `.env`, sem SQLite privado e sem artefatos de ambiente virtual**;
- `DarkMiner-Servidor.spec`, `darkminer_server.py` e `GERAR_SERVIDOR_SEM_JANELA.bat` para gerar `DarkMiner-Servidor.exe` uma vez no Windows com Python e PyInstaller;
- extensão Chrome 3.9 com a ponte para DarkCut.

Selecionando o servidor sem janela no DarkCut, o dashboard original é mostrado só dentro do DarkCut. Selecionando o EXE antigo, ele continua abrindo sua janela própria também.

## Questões a validar no PC
- Executar o novo servidor sem janela com as configurações persistentes de `%LOCALAPPDATA%\\DarkMiner`.
- Verificar que o iframe abre na porta ativa, que a extensão envia Salvos/Monitor e que a lista mescla sem duplicatas.
- Verificar chaves YouTube intactas, limites de busca originais e Gemini com a chave cadastrada no DarkCut.
- Validar montagem da timeline e a manutenção das demais abas; nenhuma lógica de edição foi alterada.

## Segurança
- **Nunca publicar o ZIP original:** ele inclui `.env` e `data/dark_miner.sqlite3` que podem conter segredos, canais e histórico pessoal.
- A bridge não altera o banco antigo. A extensão 3.9 não transfere API keys.
- A bridge atende a loopback e não aceita endereços de internet fornecidos por usuários.
