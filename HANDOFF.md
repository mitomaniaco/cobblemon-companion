# Handoff portátil — Companion de movesets

Este é o handoff operacional da cópia portátil; a raiz executável é a pasta que contém `package.json` e todos os comandos devem ser executados nessa raiz. `docs/HANDOFF.md` preserva contexto histórico ampliado do workspace ATM10 e não substitui estas instruções da instalação portátil. Prova standalone registrada em 24/09/2026, em `D:\Dev\cobblemon-companion`: `npm ci` instalou 119 pacotes, `npm run check` passou em typecheck, build e 20 testes, e a leitura local somente leitura retornou 6 indivíduos na party e 62 no PC com consistência best-effort. A leitura é uma captura daquele momento, não o estado permanente do save.

O harness standalone supervisionado de 24/09/2026 verificou janela, IPC e importação, mas não exercitou a UI move-swap. Essa limitação foi encerrada para o fluxo R1 em 02/10/2026: o harness Electron do `TrainerApp` passou com fixture sintética, incluindo prévia por UUID, cálculo real, invalidação por refresh, demo independente e layouts responsivos. Nenhum save real foi lido; integridade Medium continua sem aprovação.

Para assumir o projeto com Claude, leia primeiro [`CLAUDE.md`](./CLAUDE.md) e o [guia técnico](./docs/GUIA-TECNICO.md); use também o [índice da documentação completa](./docs/README.md), o [plano](./docs/PLANO.md), as [decisões](./docs/DECISOES.md) e a [prontidão](./docs/preflight/PRONTIDAO.md). Esses arquivos incluem propostas e provas datadas; o código atual e este handoff descrevem o estado do app portátil.

## Pacote mínimo

Para usar `npm ci`, `npm run check` e `npm run start`, copiar:

- `.gitignore`, `CLAUDE.md`, `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `vite.config.ts` e `config.example.json`;
- `electron/`, `src/` e `scripts/` (inclui o preparador opcional de artwork);
- `test/`, porque `npm run check` executa a suíte de testes;
- `README.md`, `CHANGELOG.md`, este `HANDOFF.md` e `docs/` para contexto de produto, decisões e histórico de validação.

`electron/` inclui `electron/lib/`; `test/` inclui a fixture offline usada pelo worker e pelos testes. A fixture mantém o cálculo Pikachu/Floatzel e usa UUIDs sintéticos reservados e caminhos relativos ao app. `config.json` contém `serverRoot` e `playerUuid` pessoais desta máquina: é privado, pode permanecer na instalação local em `D:\Dev`, mas não deve ser incluído em distribuição pública. Para outra instalação, use `config.example.json` e substitua ambos os valores. `.gitignore` exclui `config.json`, `node_modules/`, `dist/`, `.runtime/` e os arquivos de artwork/manifestos gerados. Não copiar `node_modules/`, `dist/` ou `.runtime/`. O importador, parser, adaptador e fixture estão dentro do app, sem dependência executável externa do battle-planner.

O inventário acima é o mínimo estático observado nesta revisão. Se o executor adicionar arquivos de configuração ou recursos internos, incluí-los conforme os imports reais e atualizar esta lista. Arquivos de evidência local ou configuração com caminho de servidor/UUID não devem ser distribuídos.

## Instalação e execução

Requisito declarado pelo `package.json`: Node.js 22 ou superior.

```powershell
npm ci
npm run prepare:ui-assets # opcional; requer rede e prepara ilustrações locais
npm run check
npm run start
```

Prefira `npm ci` para instalar conforme o lockfile. `prepare:ui-assets` é opcional, baixa fontes fixadas e prepara imagens apenas localmente; sem ela, o placeholder continua disponível e não há busca de artwork durante o uso. `check` roda typecheck, Vitest e build Vite; `start` constrói e abre o Electron. O build cria `dist/`. Em 02/10/2026, `npm run check` passou com 46 testes; o harness Electron do `TrainerApp` também passou com Gardevoir normal/Synchronize na fixture sintética e layouts em 1440, 1200, 800 CSS px e 200% de zoom. Não afirma leitura do save nem aprovação Medium.

## Configuração de leitura local

O importador lê `config.json` na raiz do app e valida um objeto com:

```json
{
  "serverRoot": "caminho absoluto para a raiz do servidor",
  "playerUuid": "UUID do jogador"
}
```

Não há campo de treinador, `trainerId`, cap ou tipos nessa configuração. O servidor deve ter `server.properties`; o importador lê o `level-name` e procura os dados da party e do PC do jogador naquele mundo. Copie `config.example.json` para `config.json` e preencha os valores daquela instalação. `config.json` é privado e não deve ser publicado nem incluído em pacote público. O usuário clica em **Atualizar do save** para iniciar cada captura.

O importador lê os arquivos do jogo de forma local e best-effort, sem escrever no save, enviar comandos ao servidor, executar código dos mods, criar banco ou enviar snapshot. Os dados permanecem na sessão. `PlayerSnapshot` v2 inclui `battleStats` com IVs base, overrides armazenados e EVs; ausência permanece desconhecida, nunca zero. Em `hyperTrainedIvs`, `{state: "known", value: null}` confirma somente ausência da chave num mapa capturado. `MoveSet` é o conjunto equipado; `BenchedMoves` é a lista aprendida observada naquele indivíduo.

## Implementado e demonstração

- A UI Electron/React importa party e PC sob demanda, separa indivíduos por UUID e apresenta resumo, golpes e atributos capturados. `PlayerSnapshot` v2 preserva IVs base, overrides armazenados, EVs e fatos desconhecidos; a aba Atributos não deriva valores ausentes.
- A prévia de troca é estrutural: escolhe um slot equipado e um candidato de `BenchedMoves` do mesmo indivíduo, preserva os outros slots e não equipa nem ensina golpes.
- A rota real usa o indivíduo selecionado, compara o primeiro golpe equipado com um candidato aprendido do mesmo UUID e exige perfil manual completo do alvo e confirmações explícitas do cenário.
- A demonstração continua independente: fixture sintética Pikachu/Floatzel, Spark/Thunderbolt, um alvo e uma ação; não recebe UUID nem build selecionada.

Referências dentro do pacote: [entrada](./src/main.tsx), [shell](./src/app/TrainerApp.tsx), [workspace individual](./src/features/individual/IndividualWorkspace.tsx), [workspace de dano](./src/features/damage/DamageWorkspace.tsx), [workspace da demo](./src/features/demo/DemoWorkspace.tsx), [lógica da troca](./src/domain/move-swap.ts), [processo Electron](./electron/main.cjs), [adaptador real](./electron/lib/real-damage.cjs), [importador](./electron/player-import.cjs), [worker da demonstração](./electron/worker.cjs), [preparador de artwork](./scripts/prepare-ui-assets.mjs) e [testes](./test).

## Cálculo real e limites

O adaptador `real-damage-adapter-v9` usa `@smogon/calc` 0.11.0 / Gen 9 e o catálogo Cobblemon 1.7.3+1.21.1 / Showdown 16. A lista atual contém 673 espécies, 320 golpes diretos, 285 habilidades e 25 naturezas; fingerprints, exclusões, entradas obrigatórias, assumptions e limites estão registrados em [Importação party/PC](docs/preflight/IMPORTACAO-PARTY.md).

A rota recalcula somente quando o snapshot atual, os hashes de party/PC, o UUID e todos os campos obrigatórios são válidos. Alvo sem perfil explícito, espécies/formas/golpes/habilidades não mapeados, IV/EV desconhecido, item observado, fonte alterada e qualquer confirmação ausente bloqueiam sem dano numérico. O mundo ativo e o estado de batalha não são detectados; a interface exige que a pessoa confirme o ruleset e o cenário sem item/status/boosts/campo/efeitos de troca ou habilidade não modelados.

O valor é mínimo–máximo dos 16 rolls em um acerto hipotético, não inclui precisão, crítico, efeitos secundários, nocaute, ações adversárias, ranking ou recomendação. Não é uma simulação completa nem uma garantia para configurações ou versões diferentes.

Integridade Medium não foi avaliada por decisão do usuário. A prova no host não implica aprovação Medium.

### Verificação da rota manual

Em 01/10/2026, `npm.cmd run check` passou em typecheck, 34 testes e build Vite. O harness `test/electron-real-damage-harness.cjs` confirmou o bloqueio do formulário sem perfil/confirmações, calculou duas faixas iguais às do adaptador e inspecionou a captura da tela; o log não expôs dados do save. O harness `test/electron-runtime-harness.cjs` manteve o resultado da demo em 36/50 e confirmou os estados `current`, `cancelled`, `stale` e `failed`.

Em 02/10/2026, `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs` passou todos os fluxos determinísticos do `TrainerApp`, incluindo a comparação fixa 36/50, estados `current`/`cancelled`/`stale`/`failed`, cálculo real de Gardevoir normal/Synchronize via snapshot sintético, refresh invalidante e layouts 1440/1200/800/200%. Capturas locais em `.runtime/diagnostics/trainer-ui-snvi41/`, incluindo `gardevoir-damage-result.png`; a pasta é ignorada e não faz parte do pacote.

## Registro da captura local

Na leitura registrada em 24/09/2026, o importador encontrou 6 indivíduos na party e 62 no PC. A captura foi local, somente leitura e best-effort. Esses números documentam apenas aquela leitura e não devem ser tratados como composição atual ou permanente do save.

Smoke-read v2 em 28/09/2026: a captura real continha novamente 6 indivíduos na party e 62 no PC. Cada grupo de stats reportou 408 conhecidos e 0 desconhecidos, com referências de fonte válidas. Os números descrevem somente essa leitura; a captura segue local, somente leitura e best-effort.

Qualquer análise de combate mais ampla permanece fora deste pacote: não há CLI do battle-planner incluída nem garantia de resultado de batalha.
