# Companion Cobblemon — documentação do projeto

Esta pasta acompanha o app independente. Comece pelo [handoff portátil](../HANDOFF.md) para o estado executável e use os documentos abaixo para decisões, plano e evidências históricas. Alguns relatórios antigos citam `battle-planner/`, `experiments/` e `AGENTS.md`, que não fazem parte deste pacote. Essas referências aparecem como texto de código, sem link navegável, e preservam os caminhos relativos à raiz do workspace completo de origem (`<raiz do workspace de origem>`). Não são dependências do app atual. O [handoff histórico](HANDOFF.md) preserva esse contexto ampliado; para a instalação portátil, vale o [handoff na raiz do app](../HANDOFF.md).

Para continuidade com Claude, leia primeiro o [entrypoint do projeto](../CLAUDE.md) e o [guia técnico consolidado](GUIA-TECNICO.md). O handoff portátil continua sendo a referência de instalação/cópia; o guia técnico registra arquitetura, segurança, comandos, escopo e pendências atuais.

## Objetivo

Aplicação desktop local para apoiar exploração PvE e ginásios/encontros da campanha Radical Red no modpack All the Mons. O produto pretendido compara uma build com alternativas de até quatro golpes no estágio de progressão observado e explica evidências, condições e requisitos. Não promete build universal, ranking perfeito nem vitória.

## Estado verificado no código — 02/10/2026

- **Shell e dados:** entrada Electron/React/TypeScript/Vite com `TrainerApp`; workspaces de Equipe, PC, Dano, Demonstração e Ajuda/diagnóstico. Party/PC são lidos localmente, somente sob ação explícita, e indivíduos são identificados por UUID.
- **Ficha individual:** resumo, golpes e atributos capturados em abas separadas. `PlayerSnapshot` IPC v2 preserva IVs base, overrides de Hyper Training, EVs, desconhecidos e procedência; valores ausentes não são derivados. A prévia estrutural troca um único slot usando golpes observados em `BenchedMoves` do mesmo UUID.
- **Cálculo real:** o workspace usa o indivíduo capturado, perfil manual completo do alvo e confirmações explícitas; campos desconhecidos e condições fora do recorte bloqueiam o resultado.
- **Demonstração:** comparação offline fixa de Pikachu/Floatzel, Spark/Thunderbolt, um alvo e uma ação. Fixture e worker são independentes da captura e da equipe.
- **Ilustrações:** preparador explícito opcional com fontes/revisões fixadas e manifestos locais ignorados pelo Git. O app não busca imagens durante o uso; a tela Ajuda informa atribuição e limites de direitos.
- **Gates restantes:** o `battle-planner/` não está no pacote. Não há recomendação universal, simulação completa, leitura automática de cenário, persistência/backup nem prova de integridade Medium ou equivalência com batalha viva.

`npm.cmd run check` passou em typecheck, 46 testes e build em 02/10/2026. O harness Electron do `TrainerApp` passou com Gardevoir normal/Synchronize em snapshot sintético, exercitando a rota real do renderer e layouts 1440, 1200, 800 CSS px e 200% de zoom; não leu o save durante essa verificação. Evidências históricas de importação estão em [IMPORTACAO-PARTY.md](preflight/IMPORTACAO-PARTY.md) e [VALIDACAO.md](VALIDACAO.md).

## Arquitetura

A raiz do app é a pasta acima de `docs/`. `src/main.tsx` e `src/App.tsx` carregam `src/app/TrainerApp.tsx`; `src/app/trainer-session-model.ts` e `useTrainerSession.ts` mantêm identidade e invalidação do estado. `electron/main.cjs` controla IPC e leitura dos arquivos; o preload expõe uma API limitada; `electron/player-import.cjs` lê o save sob demanda; `src/domain/move-swap.ts` monta a prévia estrutural; `src/features/damage/` contém o workspace e o controlador reais. A demonstração usa `electron/worker.cjs`, `electron/lib/offline-adapter.cjs` e fixture local. `scripts/prepare-ui-assets.mjs` prepara artwork apenas quando chamado explicitamente. O CLI `battle-planner/` citado em relatórios históricos é separado e não está incluído aqui.

## Mapa de leitura
- [Guia técnico consolidado para agentes](GUIA-TECNICO.md)
- [Instruções de contexto para Claude](../CLAUDE.md)
- [Visão do produto e roadmap v1/v2/v3](VISAO.md)
- [Plano, escopo e arquitetura](PLANO.md)
- [Decisões fixas e provisórias](DECISOES.md)
- [Protocolo e gates de validação](VALIDACAO.md)
- [Consolidação de prontidão e evidências datadas](preflight/PRONTIDAO.md)
- [Contrato e prova da importação party/PC](preflight/IMPORTACAO-PARTY.md)
- [Critérios para planejar troca no indivíduo](preflight/TROCA-SELECIONADO.md) — revisão inicial; conferir o código atual antes de tratar seu estado como vigente
- [Núcleo de batalha e limites do CLI](NUCLEO-BATALHA.md)
- [Casos do comparador offline](CASOS-COMPARACAO.md)
- [Provas históricas de compatibilidade](PROVA-COMPATIBILIDADE.md)
- [Procedência dos dados efetivos](CAPTURA-DADOS-EFETIVOS.md)
- [README do app e execução local](../README.md)
- [Changelog do app](../CHANGELOG.md)
- [Handoff portátil para continuação](../HANDOFF.md)
- [Handoff histórico com contexto ampliado](HANDOFF.md)

## Comandos seguros para verificação offline

Na raiz deste app:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
```

Esse script roda typecheck, testes do app e build Vite; grava artefatos locais em `dist/`, sem ler ou gravar o save. Para abrir o app, `npm run start` também constrói a UI; a leitura do jogo só ocorre ao clicar em **Atualizar do save**.

O CLI `battle-planner/` mencionado nos documentos históricos não está neste pacote. Não execute comandos desses relatórios como se fossem comandos do app independente.

## Privacidade e limites

A leitura do save é local, iniciada por ação explícita e mantida em memória na sessão do app; não há banco nem envio de snapshot. O importador não executa scripts de mods, não envia comandos ao servidor e não escreve no jogo. Arquivos de saída do battle-planner podem conter dados locais do jogador: trate-os como privados. Preserve a automação de vitaminas e as schematics, que são trabalhos separados.
