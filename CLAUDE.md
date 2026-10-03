# Contexto do projeto para Claude

Este repositório é um aplicativo desktop local para Cobblemon. Leia este arquivo e, antes de modificar código, leia também [`docs/GUIA-TECNICO.md`](docs/GUIA-TECNICO.md), [`HANDOFF.md`](HANDOFF.md) e o [índice documental](docs/README.md). O guia técnico consolida arquitetura, contratos, comandos seguros, limites e os bloqueios atuais.

## Regras de trabalho obrigatórias

- **Privacidade:** não leia, imprima, copie ou distribua `config.json`, saves Cobblemon, `.runtime` ou logs locais que possam conter dados do jogador sem autorização explícita. O `config.json` desta instalação é privado. Não peça que o usuário o envie. Fixtures sob `test/fixtures/` são sintéticas.
- **Servidor:** não instale scripts/mods, execute comandos de jogo, faça reload/restart, nem grave no save. Qualquer instrumentação ou intervenção no servidor precisa de autorização própria.
- **Integridade Medium:** não execute `run-medium-check.cmd`, `test/electron-medium-launcher.cjs` nem testes que o launcher dispara sem autorização explícita. Medium não está aprovado.
- **Compatibilidade:** preserve o fail-closed. Não adicione IDs ao catálogo por semelhança com Showdown, não mapeie namespace/forma implicitamente e não suprima bloqueios para produzir números. Consulte `docs/preflight/IMPORTACAO-PARTY.md` antes de alterar o cálculo real.
- **Escopo:** o app portátil não é o antigo CLI `battle-planner`, não tem banco SQLite, não recomenda uma equipe universal e não simula a batalha inteira. Planos e relatórios históricos não provam que uma proposta esteja implementada.
- **Validação:** para mudanças normais, `npm.cmd run check` roda typecheck, Vitest e build. Para a UI Electron com fixture sintética, use `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs`. Evite `test/electron-player-import-harness.cjs` e `test/electron-real-damage-harness.cjs` sem autorização: ambos exercitam leitura do save/configuração local. Consulte a matriz completa de segurança dos comandos no guia técnico.
- **Honestidade:** separe comportamento verificado no código, evidência de uma execução datada e proposta futura. Não chame resultado sintético de validação em batalha viva.

## Estado que precisa sobreviver à troca de agente

- A aplicação usa Electron 44, React 19, TypeScript, Vite e `@smogon/calc` 0.11.0. A importação party/PC é acionada manualmente, local, read-only e best-effort; cada indivíduo é selecionado por UUID.
- A prévia de troca altera somente estado em memória. A rota de dano real exige perfil manual do alvo e confirmações de cenário.
- A revisão de catálogo é `cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v10`: 673 espécies, 320 golpes diretos, 285 habilidades e 25 naturezas; somente forma normal. Gardevoir normal foi adicionado com `Synchronize`/`Telepathy`; `Trace` permanece bloqueada. Isso **não** equivale à Pokédex completa nem a um simulador.
- O usuário pediu cobertura “tudo completo”. A expansão segura está bloqueada pela ausência, no pacote, de um manifesto completo e reproduzível dos registros finais do servidor/datapacks. Não invente uma lista com os dados genéricos do calculador; é preciso obter e validar espécies, formas, habilidades, golpes e desvios mecânicos do ambiente ativo.
- O usuário reportou que a janela ficou vazia após marcar uma caixa. A captura não mostra a exceção. O harness sintético agora repete a primeira confirmação em 1186×852 CSS px e passa, mas **a falha da execução real continua sem diagnóstico**. Não afirme que foi corrigida; peça o rótulo exato da caixa e a primeira exceção do Console do renderer, sem solicitar `config.json` ou save.
- A última execução registrada de `npm run check` passou com 46 testes e build. O harness `electron-trainer-ui-harness.cjs` foi executado depois disso e passou, incluindo a tela de 1186×852 e os layouts responsivos; as evidências locais ficam em `.runtime/diagnostics/` e não devem ser empacotadas.

## Fontes de verdade

Para comportamento, use o código atual em `src/`, `electron/`, `test/` e `package.json`. Para o contrato atual de importação e dano, use [`docs/preflight/IMPORTACAO-PARTY.md`](docs/preflight/IMPORTACAO-PARTY.md). Use `README.md` e `HANDOFF.md` para execução/portabilidade, e `docs/README.md` para navegar no acervo. Os documentos históricos indicados no guia devem ser conferidos contra o código antes de se tornarem requisitos ou afirmações de implementação.
