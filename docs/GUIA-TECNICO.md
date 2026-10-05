# Guia técnico do Companion Cobblemon

Este documento consolida o contexto necessário para manter o pacote portátil deste projeto. Ele descreve o código que existe, separa esse código de propostas históricas e registra os bloqueios trazidos pelo usuário. **Quando este guia e o código divergirem, o comportamento deve ser confirmado no código atual e o documento corrigido.**

## 1. Produto e escopo

O projeto original visa apoiar a progressão PvE e ginásios/encontros da campanha Radical Red no modpack All the Mons, comparando mudanças de moveset com evidências e condições declaradas. O aplicativo que existe nesta pasta é uma fatia local e deliberadamente menor; não confundir a visão de longo prazo com funcionalidades entregues.

O pacote atual é um app desktop Electron + React. Ele importa party/PC sob demanda, mostra dados observados por indivíduo, permite rascunhar uma troca de golpe sem gravá-la no jogo, oferece uma rota restrita de dano real e mantém uma demonstração offline separada. Não há, neste pacote, uma simulação completa de batalha, recomendação geral de build/time, IA adversária, persistência de snapshots em banco, backup automático, monitoramento/polling do save ou CLI `battle-planner`.

## 2. Stack e comandos

A fonte dos scripts é `package.json`:

| Script | Efeito |
|---|---|
| `npm run build` | Build Vite em `dist/renderer`. |
| `npm run prepare:ui-assets` | Preparação explícita de recursos visuais; acessa a rede (PokéAPI/sprites: renders do Pokémon HOME e itens; duiker101/pokemon-type-svg-icons: tipos, ambos com revisão fixada; Pokémon Showdown: categorias, sem revisão fixada, só SHA-256 na proveniência) e cria `public/{pokemon,types,categories,items}`, `src/data/species-artwork.json` e `src/data/ui-icons.json`, tudo fora do git. É opcional e não roda durante o uso normal; sem ele a interface usa ícones neutros. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest (`vitest run`). Os testes de importação usam fontes sintéticas temporárias. |
| `npm run check` | Typecheck, Vitest e build, nessa ordem. |
| `npm run start` | Faz build e abre `electron/main.cjs`. O app não importa o save automaticamente; a leitura começa ao acionar **Atualizar do save**. |

O `package.json` exige Node.js **22 ou superior**. Nesta instalação Windows, os comandos documentados usam PowerShell e `npm.cmd`, por exemplo `npm.cmd run check` e `npm.cmd run start`. Prefira `npm ci` para instalar pelo lockfile.

Para executar o smoke sintético mais completo da interface Electron, a partir da raiz:

```powershell
node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs
```

Esse harness isola o perfil Electron, ativa `COMPANION_RUNTIME_TEST_MODE` e `COMPANION_TRAINER_UI_TEST_MODE`, usa `test/fixtures/electron-trainer-ui-snapshot.json` e grava capturas/logs em `.runtime/diagnostics/`. Não usa o `config.json` do jogador.

## 3. Arquitetura atual

A navegação é estado React em `TrainerApp`, não um roteador de URLs. O renderer não recebe `fs`, `require` ou IPC genérico.

| Camada | Arquivos principais | Responsabilidade |
|---|---|---|
| Inicialização do renderer | `src/main.tsx`, `src/App.tsx`, `src/app/TrainerApp.tsx` | Monta React/StrictMode, shell, navegação e composição dos workspaces. |
| Sessão do treinador | `src/app/useTrainerSession.ts`, `src/app/trainer-session-model.ts` | Importação acionada pelo usuário, snapshot em memória, seleção por UUID, estado de refresh e invalidação de resultados/prévias. |
| Tipos da bridge | `src/platform/api.ts` | Contratos TypeScript de `PlayerSnapshot`, cálculo real e `window.cobblemonCompanion`. |
| Equipe e PC | `src/features/collection/CollectionWorkspace.tsx` | Listas, busca/filtros e seleção de indivíduos por UUID. |
| Ficha e troca planejada | `src/features/individual/IndividualWorkspace.tsx`, `src/domain/move-swap.ts` | Resumo, golpes, atributos/procedência e prévia estrutural de uma troca. |
| Cálculo real | `src/features/damage/`, `electron/lib/real-damage.cjs`, `electron/lib/combat-compatibility.json` | Validação no renderer e no main, formulário/manual target, catálogo e cálculo restrito via `@smogon/calc`. |
| Demonstração | `src/features/demo/`, `src/domain/compare-flow.ts`, `electron/worker.cjs`, `electron/lib/offline-adapter.cjs`, `test/fixtures/offline-companion-snapshot.json` | Comparação fixa independente do save, em worker e com fixture offline. |
| Primitivos e estilo | `src/ui/`, `src/ui/global.css`, `src/ui/tokens.css` | Componentes acessíveis compartilhados e estilos/tokens. |
| Processo principal Electron | `electron/main.cjs`, `electron/preload.cjs`, `electron/player-import.cjs`, `electron/lib/nbt.cjs` | Janela, protocolo local, IPC, leitura NBT e validações do lado confiável. |
| Build/recursos | `vite.config.ts`, `index.html`, `scripts/prepare-ui-assets.mjs`, `src/data/species-artwork.json` | Build da UI e preparação local opcional de ilustrações. |

`electron/lib/preflight-contracts.cjs` e `compare-evidence.cjs` fazem parte do adaptador de comparação offline. Isso não transforma a rota da demonstração em análise da party real nem em simulador de batalha.

## 4. Processo Electron e fronteiras de confiança

`electron/main.cjs` registra o protocolo local `cobblemon://app`, cria a `BrowserWindow` e instala handlers IPC. A janela usa `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`; janelas externas são negadas. O processo principal valida remetente, frame principal e origem `cobblemon://app` antes de aceitar os handlers.

`electron/preload.cjs` expõe uma allowlist pequena com `contextBridge`: `readPlayerSnapshot()`, `calculateRealDamage(request)`, `calculate(request)` e `cancel(jobId)`. A leitura do snapshot rejeita argumentos. A API de teste só aparece sob o modo de teste. Não adicione API de filesystem, `send/invoke` genérico ou execução de caminhos/código entregues pelo renderer.

Há dois caminhos de cálculo distintos:

1. A demonstração offline usa `utilityProcess` (`electron/worker.cjs`) e a fixture fixa; o main aplica timeout, cancelamento e descarte de respostas `stale`.
2. O cálculo real passa pelo handler de dano do main, que lê novamente o snapshot atual antes de chamar `calculateRealDamage`. A resposta depende de seleção/UUID e hashes ainda válidos.

## 5. Captura local party/PC

### Fluxo

1. A pessoa aciona **Atualizar do save**.
2. A bridge chama `companion:read-player-snapshot` sem argumentos.
3. `electron/player-import.cjs` lê a configuração privada da instalação, resolve `serverRoot`, interpreta `server.properties` para localizar o mundo e procura os arquivos Cobblemon de party/PC daquele jogador.
4. `electron/lib/nbt.cjs` interpreta NBT gzip ou bruto; o importador normaliza os indivíduos para `PlayerSnapshot` v2.
5. O resultado fica em memória na sessão do app. Um refresh invalida snapshot/seleção/prévia anteriores antes de publicar o novo estado.

A configuração usa somente `serverRoot` e `playerUuid`; há um `config.example.json` genérico. **O `config.json` real é privado e nunca deve aparecer em logs, handoffs públicos ou mensagens.** Nenhum valor dessa configuração foi lido nesta documentação.

### Propriedades do snapshot

`src/platform/api.ts` define `PlayerSnapshot` v2 e `PlayerIndividual`. Cada indivíduo tem UUID, espécie, forma, nível, localização, golpes equipados/aprendidos e fatos observados. `battleStats` separa IVs base, overrides de Hyper Training e EVs. Um fato de stat é `known` com valor e procedência ou `unknown/not-captured`; ausência não vira zero nem stat derivado.

- `MoveSet` é a lista equipada; `BenchedMoves` é a lista aprendida/disponível observada no indivíduo. Um learnset de espécie não prova desbloqueio individual.
- `equippedMovesKnown` e `learnedMovesKnown` distinguem lista conhecida vazia de dado não capturado.
- A chave operacional de seleção é o UUID, não a espécie; indivíduos da mesma espécie podem ter estado diferente.
- IDs namespaced são preservados literalmente. O contrato não converte namespace/forma por adivinhação.
- `consistency: "best-effort"` e hashes indicam observações das fontes, não uma transação atômica nem uma garantia de que o mundo não mudou após a leitura.

### Segurança da leitura

O importador usa limites de tamanho, hashes SHA-256 e rechecagem de metadata/hash das fontes; rejeita mudanças durante leitura. A resolução valida que os caminhos canônicos permaneçam dentro do servidor/mundo configurado. O parser limita tamanho/profundidade e rejeita truncamento, bytes extras e chaves duplicadas. A captura é local e read-only: não grava no save, não envia comandos ao servidor, não executa scripts/mods, não envia o snapshot pela rede e não persiste snapshot em banco.

## 6. Workspaces

### Equipe/PC e ficha

A coleção mantém seleção por UUID. A ficha individual separa resumo, golpes e atributos, exibindo procedência e desconhecidos em vez de preencher valores. Um refresh remove o estado derivado antigo imediatamente; falha de leitura não deve deixar análise/prévia de outro snapshot aparentando estar atual.

### Prévia de troca

`src/domain/move-swap.ts` faz uma operação estrutural: seleciona um slot equipado e um golpe observado em `learnedMoves` do mesmo indivíduo; a prévia substitui só esse slot e preserva os outros. Ela não ensina nem equipa nada no jogo. O botão `Abrir cálculo de dano` abre direto o cálculo contextual com o mesmo indivíduo/UUID, sem caixa de confirmação; não equivale a recomendar que a troca seja feita.

### Dano real

O indivíduo selecionado é o atacante; o cálculo compara o golpe do slot escolhido com um golpe aprendido compatível ainda não equipado. Stats/natureza/habilidade vêm da captura; IV desconhecido, EV desconhecido, item fora do catálogo compatível ou campos inválidos bloqueiam; um item segurado do catálogo entra no cálculo. `heldItem: null` é desconhecido (o importador não prova ausência de item): a UI diz “Item não registrado no save” e a confirmação do atacante do checklist passa a exigir atestar que o Pokémon está sem item (Issue #75). O alvo é um perfil manual completo, não é lido da batalha. O formulário exige cinco confirmações porque versão e estado do combate não são detectados automaticamente.

O adaptador valida novamente, em processo confiável, fontes, UUID, IDs, nível, natureza, habilidade, IV/EV, EV total e premissas. O resultado mostra dois ranges mínimo–máximo dos **16 rolls** por golpe se acertar. Ele não estima precisão, crítico, efeitos secundários, nocaute, adversário, turnos futuros, ranking ou recomendação.

### Demonstração offline

A demonstração é uma fixture fixa Pikachu/Floatzel, Spark/Thunderbolt, um alvo e uma ação. Ela não recebe UUID nem build selecionada e permanece independente da captura. O resultado/scope da demo não deve ser usado como prova do estado atual do save ou de uma batalha real.

## 7. Catálogo e limites de compatibilidade

Revisão ativa: `cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v13`. O adaptador é `real-damage-adapter-v11`, com `@smogon/calc` 0.11.0/Gen 9 e fingerprints documentados em `docs/preflight/IMPORTACAO-PARTY.md`.

O catálogo atualmente tem **841 espécies, 401 golpes diretos (320 da lista-base revisada em `data/compat/base-moves.json` + 81 derivados pelo gerador), 285 habilidades e 25 naturezas**. IDs aceitos são explícitos; só forma normal é liberada, mesmo para espécies com formas alternativas. As espécies são derivadas por `npm run catalog:generate -- --instance <pasta com mods/> [--write]` (scripts/generate-compat-catalog.mjs, regras puras em scripts/lib/compat-catalog.mjs) e registradas em `data/compat/manifest.json`; um teste garante que o catálogo é exatamente o derivado do manifesto. Gardevoir normal está incluído: `Synchronize` e `Telepathy` são aceitas; `Trace` permanece bloqueada porque copiar a habilidade do alvo não faz parte do estado modelado.
No JSON, golpes, habilidades e naturezas têm uma chave `cobblemon:` e outra sem namespace para cada entrada canônica; a contagem bruta de chaves é 802/570/50, mas a cobertura é de 401/285/25 entradas, respectivamente.

O bloqueio “fora do catálogo” significa que o mapeamento não foi validado; não prova que a espécie não exista no jogo. Para uma espécie entrar, os dados da forma normal precisam ser idênticos aos do @smogon/calc e nenhum outro provedor (mods, datapacks) pode alterá-los; o motivo de cada exclusão está no gerador e em `docs/preflight/IMPORTACAO-PARTY.md`. Não libere IDs à mão nem em massa a partir do dataset genérico do calc: rode o gerador. Limites: o gerador lê uma instalação (cliente) e não detecta lógica em tempo de execução; confira o servidor rodando-o na pasta dele.

Também são excluídos golpes/habilidades que dependem de histórico, estado, forma ou efeitos não capturados. A relação vigente e suas razões estão em `docs/preflight/IMPORTACAO-PARTY.md`; revise-a junto do catálogo e do adaptador ao alterar cobertura. Remover bloqueios só para fazer o formulário avançar pode produzir dano incorreto.

## 8. Dados locais, privacidade e recursos gerados

- `config.json` e os arquivos party/PC do servidor contêm informações privadas. Não ler, publicar, copiar para fixtures, imprimir valores ou anexar em relatórios sem autorização explícita.
- `.runtime/` contém perfis Electron, logs e screenshots locais; pode revelar dados. Não distribua nem use como corpus de documentação. As imagens citadas abaixo são da fixture sintética.
- `dist/`, `node_modules/`, `.runtime/` e saídas/manifests de artwork não pertencem ao pacote mínimo; confira `.gitignore`/`HANDOFF.md` antes de copiar uma instalação.
- `npm run prepare:ui-assets` é a exceção intencional de rede: baixa artefatos quando executado manualmente (revisões fixadas, exceto os ícones de categoria do Pokémon Showdown, cuja URL não é versionada; o SHA-256 de cada um fica em `public/pokemon/provenance.json`). O app não busca artwork a cada uso.
- Não há banco SQLite implementado no app portátil, embora decisões/propostas antigas mencionem essa arquitetura.

## 9. Testes e risco de cada harness

| Comando/arquivo | Fonte exercitada | Regra para agentes |
|---|---|---|
| `npm.cmd run check` | Typecheck, testes Vitest com fixtures e build. | Smoke padrão após mudança relevante; não importa o save real. |
| `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs` | Fixture `electron-trainer-ui-snapshot.json`; modo UI/runtime de teste e perfil isolado. | Smoke Electron sintético recomendado para a interface/fluxos. Grava somente artefatos de diagnóstico local em `.runtime/`. |
| `node_modules/electron/dist/electron.exe test/electron-runtime-harness.cjs` | Demonstração offline e estados current/cancelled/stale/failed. | Não aciona o refresh do save no fluxo atual; confirme o código se o cenário mudar. |
| `test/electron-player-import-harness.cjs` | Chama `readPlayerSnapshotFromConfig()` e aciona refresh da instalação real. | **Lê `config.json` e party/PC atuais. Não executar sem autorização explícita.** |
| `test/electron-real-damage-harness.cjs` | Abre a UI normal, aciona refresh e calcula com um indivíduo compatível do snapshot local. | **Também lê o save/configuração atuais. Não executar sem autorização explícita.** Prefira o harness UI sintético. |
| `run-medium-check.cmd` / `test/electron-medium-launcher.cjs` | Verifica token de integridade e dispara o harness de importação acima. | **Medium não foi aprovado. Não executar sem autorização explícita; pode ler save real e criar logs/screenshots.** |
| `test/player-import.test.js`, `test/real-damage.test.js`, `test/damage-model.test.ts`, `test/move-swap.test.ts`, `test/trainer-session.test.ts`, `test/compare-flow.test.ts`, `test/offline-adapter.test.js` | Parser/importador com fontes sintéticas, domínio, estado e adaptadores. | Base normal para regressões; não substitui o smoke Electron. |

Antes de executar qualquer outro arquivo `electron-*-harness.cjs`, confira se o código define modo de fixture ou chama o importador real. O nome “harness” não garante isolamento.

## 10. Estado verificado e continuação

### Evidência disponível

- `npm run check` passa com 565 testes e build Vite na `main` (a7eac29, 05/10/2026). Quando este guia foi escrito, eram 46 testes.
- Nesta continuação, `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs` passou todos os fluxos sintéticos do `TrainerApp`: prévia de troca, demo isolada, cálculo de Gardevoir normal/Synchronize, invalidação por refresh e layouts 1440/1200/800 CSS px e 200% de zoom.
- O mesmo harness agora verifica 1186×852 CSS px: depois de marcar a primeira confirmação do dano, o formulário continua visível e o cálculo completa. Capturas sintéticas locais foram inspecionadas em `.runtime/diagnostics/trainer-ui-DCFyK0/`, incluindo `damage-default-viewport.png` e `gardevoir-damage-result.png`. O diretório é ignorado e não deve ser tratado como artefato portátil.
- Nenhum `config.json` nem save real foi lido nesta continuação. Não há aprovação Medium. O bundle principal do renderer tem ~844 KB (aviso do Vite acima de 500 KB, sem falhar o build; Issue #76).

### Bloqueios atuais solicitados pelo usuário

1. **Tela vazia depois de marcar uma caixa (Issue #10):** a captura enviada mostra a área do renderer vazia, mas não contém stacktrace. O teste sintético na largura reportada não reproduz a falha. Hipótese não verificada: uma exceção de renderização desmonta a árvore React e deixa a janela vazia. Desde a Issue #19 existe `AppErrorBoundary`, que substitui a janela vazia por uma tela com diagnóstico sanitizado (sem caminhos locais, UUIDs ou hashes) e botão de cópia; ela também captura erros síncronos globais com objeto de erro e ignora ruídos sem objeto, como o aviso do `ResizeObserver`. O defeito real segue aberto e não deve ser declarado resolvido: se voltar, peça ao usuário o texto da tela de erro e o rótulo exato da caixa, sem solicitar `config.json`/save. Se a janela continuar vazia sem a tela de erro, a causa está fora do React.
2. **Cobertura completa de Pokémon:** o usuário pediu “tudo completo”. Espécies: resolvido pelo gerador (841). Golpes: a lista-base revisada (320) mais os golpes de dano que o gerador deriva por regra estrutural (81; Physical/Special, alvo simples, sem multi-hit, dano fixo, OHKO, autodestruição, crítico garantido, Z/Max/LGPE nem callbacks, presentes no calc e idênticos nos outros pacotes). Imunidade de tipo aparece como 0–0 HP. Habilidades seguem no conjunto revisado (285); os demais golpes de dano do Showdown estão fora (nos dados, os 320 têm alvo `normal` e nenhum tem `critRatio`, multi-hit, dano fixo, OHKO ou autodestruição; os de fora incluem alvo `any`, golpes em área e callbacks de potência) e ampliar isso é uma decisão de escopo separada, com revisão de mecânica por categoria (Issue aberta).
3. **Batalha completa:** se “completo” significar turnos e não apenas catálogo do dano direto, isso é expansão de produto: requer estado de batalha, itens, status, clima/terreno, boosts, precisão/crítico, efeitos secundários, mudanças de forma/tipo, ordem de ação, múltiplas ações e evidência dos callbacks/scripts do servidor. O app atual não implementa essa simulação.
4. **Medium:** permanece explicitamente não aprovado; não converter smoke do host em aprovação de integridade.

Definição conservadora para continuar sem enganar: fechar primeiro a cobertura verificável do ambiente real mantendo o contrato explícito de dano direto; tratar simulação turno-a-turno como projeto separado, salvo nova decisão explícita do usuário.

## 11. Mapa da documentação existente

| Documento | Uso correto |
|---|---|
| `README.md` | Visão do app portátil e comandos de uso. |
| `HANDOFF.md` (raiz) | Instalação/cópia, limites e evidências do pacote portátil. |
| `docs/README.md` | Índice geral, estado resumido e mapa de arquitetura. |
| `docs/preflight/IMPORTACAO-PARTY.md` | Fonte documental mais atual para snapshot, cálculo real, catálogo, exclusões e prova. |
| `docs/VALIDACAO.md`, `docs/preflight/PRONTIDAO.md` | Protocolos e evidências datadas; não confundir resultados históricos com aprovação atual. |
| `CHANGELOG.md` | Alterações do pacote por revisão. |
| `docs/PLANO.md`, `docs/DECISOES.md`, `docs/HANDOFF.md`, `docs/preflight/TROCA-SELECIONADO.md` | Contexto/propostas históricas. Conferir implementação atual antes de usar itens como requisito vigente. `DECISOES.md` inclui propostas como SQLite que não existem no app portátil. |
| `docs/CAPTURA-DADOS-EFETIVOS.md`, `docs/PROVA-COMPATIBILIDADE.md`, relatórios `docs/preflight/*` | Evidências de laboratório/propostas de coleta. Não provam que toda mecânica de um servidor atual esteja capturada. Algumas referências apontam para arquivos/workspaces que não vêm neste pacote. |
| `docs/GUIA-TECNICO.md` | Este manual consolidado para novos agentes. |
| `CLAUDE.md` | Instruções de entrada e limites que Claude deve ler antes do trabalho. |

A documentação do workspace histórico pode mencionar `battle-planner/`, `experiments/` ou `AGENTS.md`. A raiz portátil não contém necessariamente esses caminhos; o próprio `docs/README.md` avisa para não executar comandos desses relatórios como se fossem comandos do app.
