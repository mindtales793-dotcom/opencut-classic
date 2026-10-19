# DarkMiner 3.6.1 incluído no DARKCUT

A fonte original foi sanitizada e arquivada em `vendor/darkminer-sources.tar.xz`. Contém a UI, FastAPI, análise de canais, SQLite e a extensão Chrome, sem arquivos `.env`, sem SQLite do usuário e sem executáveis/venvs.

O GitHub Actions extrai essa fonte no runner, compila um processo de serviço `DarkMiner-Service.exe` via PyInstaller e inclui o executável em `resources/tools/darkminer/` no instalador DarkCut Windows.

Ao iniciar o DARKCUT, o serviço é iniciado automaticamente em modo `DARKMINER_EMBEDDED=1`, sem uma janela separada. A interface da aba DarkMiner usa o serviço no loopback. Se uma versão existente já responde na porta 8000, ela é reutilizada.

Os dados continuam exclusivamente no PC: `%LOCALAPPDATA%\\DarkMiner\\data\\dark_miner.sqlite3` e `%LOCALAPPDATA%\\DarkMiner\\.env`. O ZIP original do usuário, com chaves e banco pessoal, não é publicado.

Extensão Chrome (opcional): baixar o artefato `DarkMiner-YouTube-Chrome` no GitHub Actions e carregar por `chrome://extensions`. A extensão não é instalada sem consentimento.

Este pacote integra o **DarkMiner 3.6.1 original**. Os recursos de design e métricas inspirados no Dotti Finder são uma etapa futura, não estão prontos neste pacote.
