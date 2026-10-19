# Gerar DARKCUT 0.3.0 com DarkMiner 3.6.2 — Windows

Este procedimento **ainda nao e um instalador pronto**. Ele gera o instalador no seu proprio computador, usando o codigo em revisao da PR #22. **Nao instale o ZIP original do DarkMiner com .env / banco privado no GitHub.**

## Antes de tudo
Instale no Windows 64 bits estas ferramentas gratuitas usando seus sites oficiais e reinicie o computador depois:
- **Node.js LTS**: https://nodejs.org/
- **Bun 1.2.18 ou compativel**: https://bun.sh/
- **Python 3.12** (com Python Launcher `py`): https://www.python.org/downloads/windows/
- **Rust / rustup** (incluindo os requisitos de ferramentas MSVC mostrados no instalador): https://rustup.rs/

Deixe disponivel espaco livre suficiente (varios gigabytes) para compilar e baixar FFmpeg.

## Instrucoes simples
1. Abra [a branch de integracao no GitHub](https://github.com/mindtales793-dotcom/opencut-classic/tree/feat/darkminer-bundled-intelligence-20261019).
2. Clique em **Code > Download ZIP** e extraia a pasta no computador.
3. Abra a pasta extraida e clique duas vezes em **`MONTAR-DARKCUT-COM-DARKMINER.cmd`**. Ele chama o script .ps1 no mesmo diretorio; nao mova os dois separadamente.
4. Aguarde: a instalacao de dependencias e a compilacao completa podem demorar bastante. O script fara o build do FastAPI com PyInstaller, motor de audio, interface Next.js, testes de exportacao MP4 e empacotamento Electron.
5. **Se passar em tudo**, a pasta `apps/darkcut-desktop/dist/` abrira com `DarkCut-Studio-Setup-0.3.0-x64.exe` e `DarkCut-Studio-Portable-0.3.0-x64.exe`.
6. Feche a versao antiga do DarkMiner antes de abrir o novo DARKCUT. Clique na aba DarkMiner; a versao embutida devera aparecer automaticamente.
7. Se der erro, a janela **nao desaparece**. Tire uma captura da mensagem e envie para corrigirmos.

## Avisos importantes
- Nenhum script modifica os dados existentes em `%LOCALAPPDATA%/DarkMiner` para criacao do instalador. A validacao da API usa um diretorio isolado.
- O arquivo `darkminer-bin/DarkMiner-Service.exe` e criado durante o processo de compilacao e incluido no instalador do DARKCUT.
- A extensao antiga do DarkMiner fica apenas no pacote como `extension-legacy`, **nao e instalada automaticamente**. Nao misture extensoes antigas e atuais.
- A compilacao deste metodo no Windows real **ainda nao foi comprovada nesta PR**, apesar de passar nas verificacoes de codigo.
- Esta integracao NAO significa paridade com todos os recursos e design do Dotti Finder. Essa ampliacao e outro conjunto de tarefas pendentes.
- Ate que o instalador e suas funcoes sejam verificados, mantenha a versao 0.2.1 instalada e seus projetos com backup.
