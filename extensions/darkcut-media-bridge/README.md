# DarkCut — Ponte de Mídias Locais

Extensão **genérica e opcional** para Chrome, Manifest V3. Não lê/automatiza sites externos, não executa geração em serviços terceiros, nem acessa contas, cookies ou credenciais de provedores.

## Instalação no Chrome

1. Abra `chrome://extensions` e habilite o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta `extensions/darkcut-media-bridge`.
3. Abra seu projeto no **DarkCut Studio Windows** e vá a **Produção → Conectar mídias às cenas**.
4. Copie o código do projeto e a chave temporária do DarkCut para o popup da extensão.
5. Clique em **Verificar conexão local**. Selecione mídias previamente exportadas com permissão para uso.
6. Os arquivos com nomes `cena-001.png`, `cena-002.jpg` etc. serão vinculados às cenas correspondentes (ou indique a cena manualmente).
7. A importação automática no DarkCut é opcional e funciona apenas enquanto o projeto está aberto. Ela **não sobrescreve** cenas que já possuam mídia escolhida.

### Segurança e limites

- O servidor atende somente em `127.0.0.1:3217`, usando chave aleatória alterada a cada inicialização.
- A extensão tem permissão de rede apenas para `http://127.0.0.1:3217/*`; não solicita acesso a URLs de serviços de terceiros.
- A extensão não envia arquivos silenciosamente: precisa da sua seleção e clique.
- Arquivos permitidos: PNG, JPG/JPEG, WebP, MP4, WebM, até **64 MB por arquivo**. A conexão é local.
- O estado dos envios fica na pasta de dados do DarkCut e arquivos são associados por código de projeto + cena.
- Serviço externo não é incluído nem contornado; respeite as condições de uso e elegibilidade de onde cada mídia foi obtida.
- A importação do arquivo na biblioteca é distinta da montagem na timeline: confirme a mídia antes de clicar em **Montar projeto na timeline**.

Para alterações futuras, use o mesmo protocolo de `/api/darkcut/media-bridge` com autenticacão, sem permitir scripts dentro de sites nem ler cookies.
