# Handoff histórico — Companion Cobblemon

Esta é a fotografia documental do workspace ATM10 registrada em 24/09/2026, não o estado atual do app portátil. Para a execução e o estado vigente, use o [HANDOFF portátil na raiz do app](../HANDOFF.md). O contexto ampliado abaixo preserva decisões e evidências do workspace completo de origem (`C:\mnt\c\Users\caio\Documents\ChatGPT\atm10`), incluindo ferramentas e arquivos que não foram incluídos no pacote. Esta síntese reflete inspeção documental e estática; nenhuma CLI, app, teste, save ou servidor foi executado/acessado naquela tarefa.

## Objetivo e escopo

Construir um companion desktop local para exploração PvE e ginásios/encontros da campanha Radical Red no All the Mons. O fluxo pretendido configura party, compara a build de um indivíduo com mudanças de golpes utilizáveis no estágio atual e expõe evidência, hipóteses, limitações e requisitos. Escopo aceito: contexto local, sem LLM, um Pokémon analisado por vez com o restante da party fixo, singles primeiro e cobertura declarada. Não inclui PvP, outras campanhas, otimização conjunta de seis builds, batalha integral ou automação de ações.

## Estado do app observado em 24/09/2026

Naquele corte, o app importava party/PC sob demanda e somente para leitura, selecionava por UUID, mostrava golpes equipados e aprendidos separadamente e oferecia uma **prévia estrutural** de troca de um slot. Essa prévia usava apenas golpes de `BenchedMoves` conhecidos daquele UUID, removia golpes já equipados e não calculava dano, utilidade nem superioridade.

A comparação de dano era então uma demonstração desconectada: fixture congelada Pikachu/Floatzel, Spark/Thunderbolt, um alvo/uma ação. `App.tsx` não incluía o UUID selecionado no pedido de cálculo; `worker.cjs` lia a fixture fixa e chamava o adaptador offline. Portanto, nem o snapshot importado nem a prévia de troca alimentavam a comparação. Esse estado foi substituído pela rota real descrita no [handoff operacional atual](../HANDOFF.md).

O `battle-planner/` é um núcleo CLI separado, que lê os arquivos locais e grava/atualiza relatórios em `output/`. A busca cobre horizonte curto e respostas modeladas; não executa a IA do RCT nem simula a luta inteira.

## Decisões fixas e provisórias

**Fixas:** dados do jogo são leitura; a pessoa inicia a importação; seleção e identidade são por UUID, não espécie; desconhecido não vira zero nem ausência confirmada; golpes equipados, aprendidos e adquiríveis são estados distintos; resultado contextual deve ser comparado à build atual e vinculado às evidências; nenhuma recomendação atual pode depender silenciosamente de TM, item ou treino futuro. Renderer não recebe filesystem/Node; não executar código arbitrário vindo de mods.

**Provisórias ou ainda sem gate:** política de ordenação `pairwise-evidence-v1` não tem pesos/limiar material calibrados e só permite preferência no recorte evidenciado; `@smogon/calc` é candidato para contextos testados, não perfil mecânico global aprovado; SQLite é a direção decidida, mas binding/integração Windows, migrações, restauração e backup não foram aprovados; custos de desempenho, empacotamento e cobertura viva continuam abertos.

## Componentes e caminhos

- [App README](../README.md): instalação, verificação e prova manual Medium.
- [UI](../src/App.tsx): importação, seleção UUID, prévia de troca e demo fixa.
- [Domínio da troca estrutural](../src/domain/move-swap.ts) e [testes](../test/move-swap.test.ts).
- [Fluxo da demo](../src/domain/compare-flow.ts) e [testes](../test/compare-flow.test.ts): revisão do formulário, cancelamento e resposta atrasada; não cobre vínculo com UUID/snapshot.
- [Processo principal e IPC](../electron/main.cjs), [preload](../electron/preload.cjs), [importador](../electron/player-import.cjs) e [teste do importador](../test/player-import.test.js).
- [Worker da demo](../electron/worker.cjs): fixture local fixa; não lê snapshot de jogador.
- CLI e modelo de batalha (`battle-planner/README.md`), `battle-planner/src/cli.cjs`, `capture.cjs`, `files.cjs`, `analysis.cjs`, `scenario.cjs`, `search.cjs`, `compare-evidence.cjs` e `offline-adapter.cjs`.
- Fixtures da ponte offline (`battle-planner/src/test/fixtures/offline-companion-snapshot.json`) e `battle-planner/test/offline-adapter.test.cjs`.
- [Plano](PLANO.md), [decisões](DECISOES.md), [validação](VALIDACAO.md), [prontidão](preflight/PRONTIDAO.md), [contrato de importação](preflight/IMPORTACAO-PARTY.md) e [preflight da troca](preflight/TROCA-SELECIONADO.md).

## Execução e verificação — contexto histórico

Verificação do app portátil, na raiz atual `D:\Dev\cobblemon-companion`:

```powershell
npm.cmd run check
```

O script faz typecheck, suíte Vitest do app e build; build escreve `dist/`, mas esse fluxo não chama o CLI nem lê o save. `npm run start` abre o Electron; a leitura party/PC só começa no botão **Atualizar do save**. Não foi executado neste handoff.

O comparador offline abaixo pertence ao workspace completo histórico. O diretório `battle-planner/` e seus comandos não estão incluídos na cópia portátil e não podem ser executados a partir dela. No workspace de origem, o comparador isolado era executado a partir de `battle-planner/`:

```powershell
npm run test:comparison
```

Não executar `node src/cli.cjs analyze/search/scenario` como teste inofensivo no workspace de origem: a CLI faz nova captura e atualiza `output/`. Naquele workspace, antes de qualquer uso era necessário ler `battle-planner/README.md` e conferir `battle-planner/config.json`, `trainerId`, cap, tipos, cenário e saídas. O `trainerId` então observado no arquivo local apontava para `boss_giovanni_015c`; isso era configuração do planejador, não prova de que Giovanni fosse o próximo encontro. Nunca usar Giovanni como padrão da progressão: selecionar explicitamente o adversário real e conferir seus pré-requisitos. Esses comandos são registro histórico, não instruções para o app portátil.

## Invariantes de segurança e qualidade

- Não editar save, party, PC, mundo ou configuração para obter uma prova; não enviar comando, instalar coletor/mod, usar reload, reiniciar servidor ou provocar batalha.
- Ler dados pessoais só quando necessário. Snapshot e `output/` contêm dados locais; não publicar nomes, UUIDs ou arquivos completos sem necessidade.
- Reimportar party **e PC inteiros** antes de qualquer recomendação de equipe. O snapshot persistido em `battle-planner/output/` é histórico, não estado atual.
- Respeitar `MoveSet` como equipado e `BenchedMoves` como aprendido no indivíduo. Não substituir por learnset de espécie nem promover TM/tutor/item a disponibilidade confirmada.
- Para plano de batalha conferir ordem e sobrevivência: Speed efetiva, prioridade, dano recebido antes de agir, HP depois da troca, consumíveis já usados, multi-hit, status, crítico, cura e retirada adversária. Snarl perde o debuff se o alvo trocar; Focus Sash não concede por si só outro turno.
- A busca curta/heurística e os ranges de dano são diagnósticos. Não prometer ranking ótimo, probabilidade ou garantia de vitória; modelar ramos de troca do time adversário e explicitar sementes/condições.
- Projeções de nível, EVs ou nature precisam ser marcadas como projeção. Não inventar item, golpe, forma, aquisição ou mecânica customizada.
- Preservar arquivos da automação de vitaminas e schematics; são escopo separado.

## Gates para ligar a troca selecionada ao cálculo

1. Incluir UUID, fingerprint/revisão do snapshot e fontes, slot substituído, build observada/candidata e versões de motor/política no pedido e no resultado. Seleção nova ou início de refresh invalida resultado visível; falha de refresh não pode deixar análise antiga apresentada como atual; respostas atrasadas não podem ser publicadas.
2. Mapear IDs namespaced/unnamespaced para o motor com tabela explícita e versionada; rejeitar ID não mapeado ou colisão. A UI deve desambiguar espécies/formas e namespaces quando necessário.
3. Bloquear cálculo quando forma/aspects, stats ou lista necessária forem desconhecidos/não suportados. Lista conhecida vazia e lista ausente são estados diferentes. Sem stats efetivos/derivação validada, permitir no máximo rascunho estrutural.
4. Preservar exatamente os outros três slots e comparar a build atual à proposta no mesmo indivíduo, alvo, snapshot e condições; não incluir no conjunto candidatos já equipados, duplicados ou sem evidência individual.
5. Resultado deve citar evidências, origem dos golpes, hipóteses, cobertura e condições pendentes. Rotular preferência apenas dentro do recorte. Mecânica sem suporte vira bloqueio/inconclusão, nunca efeito neutro presumido.
6. Acrescentar testes determinísticos para UUIDs duplicados de espécie, listas conhecidas/ausentes/vazias, IDs com colisão, seleção/refresh concorrentes, erro de refresh, stale response e preservação dos slots; depois validar a UI renderizada e acessível separadamente.

## Ordem recomendada para próxima continuação

1. Fazer a prova Electron da UI nova de troca por UUID, incluindo apresentação legível e interação do fluxo. A prova anterior cobriu o painel de importação e a demo fixa no host elevado; não exercitou esse planejador. A execução Medium segue pendente.
2. Antes de ligar qualquer cálculo ao indivíduo, fechar identidade e frescor: pedido/resultado devem vincular UUID, fingerprint/fontes do snapshot, slot, golpes e versões; seleção, refresh, falha e resposta atrasada não podem deixar uma análise antiga como atual.
3. Implementar o mapeamento explícito e versionado dos IDs namespaced/unnamespaced, com colisões e desconhecidos bloqueados, e desambiguar a UI. Stats, forma/aspects e qualquer campo ausente devem bloquear dano, salvo derivação comprovada; por enquanto a prévia permanece estrutural.
4. Completar testes determinísticos do domínio e da integração de seleção/refresh, incluindo indivíduos da mesma espécie, listas conhecidas/ausentes/vazias, IDs, slots preservados e obsolescência; validar UI renderizada e acessível.
5. Integrar somente um recorte de cálculo que passe esses gates, mantendo a demo fixa claramente separada até a substituição estar comprovada. Depois avançar persistência/backup/restauração, empacotamento Windows, desempenho e mecânicas adicionais.

## Critérios de aceite e riscos

Aceitar a primeira integração selecionada apenas quando identidade, snapshot, build, fontes e versões estiverem ligados de ponta a ponta; refresh/erro/concorrência não exibirem conclusão obsoleta; o candidato for comprovadamente aprendido naquele UUID; desconhecidos e mecânicas fora do recorte bloquearem a conclusão; a mudança alterar um único slot; e UI/evidência usarem linguagem de preferência condicional no escopo observado, sem ranking geral nem chance de vitória.

Riscos principais: a comparação atual ignora seleção e o refresh não limpa `flow` (a fixture é independente hoje; isso vira requisito de invalidação quando o cálculo for ligado ao snapshot); namespace pode perder clareza na apresentação; app não captura os stats necessários para cálculo real; forma/aspects podem estar ausentes; seleção/rascunho só existe em memória; snapshot best-effort não é transação atômica com o servidor; registro estático dos mods não garante mecânica runtime.

## Fatos atuais versus histórico

- **Inspeção estática de código registrada em 24/09/2026:** planejador estrutural de troca está conectado à UI e tem testes unitários; cálculo selecionado segue desconectado. Nenhum teste foi reexecutado nesta sincronização documental.
- **Prova datada, não estado atual:** `preflight/IMPORTACAO-PARTY.md` registra smoke-read de 24/09/2026 com 6 na party e 62 no PC e `npm run check` aprovado. Esses totais pertencem à captura daquele instante e não devem ser usados como composição atual.
- **Última verificação de app registrada:** `IMPORTACAO-PARTY.md` documenta typecheck/build e 18/18 testes em 24/09/2026. `PRONTIDAO.md` preserva a execução anterior 10/10 e a ampliação posterior; são registros datados, não uma prova atual.
- **Última prova Electron documentada:** importação e demo fixa foram observadas no host elevado; a UI nova do planejador não foi exercitada em Electron e Medium segue pendente. Isso não prova persistência, empacotamento, cálculo ligado à party ou compatibilidade viva.
- **Documentação sincronizada nesta continuação:** os resumos atuais de `PLANO.md`, `PRONTIDAO.md`, `VALIDACAO.md`, `TROCA-SELECIONADO.md` e os READMEs distinguem implementação estrutural, demo desconectada e gates remanescentes. As fotografias anteriores permanecem como histórico.

Referência canônica e mapa documental: [README](README.md). O workspace completo de origem também tinha `AGENTS.md` com as regras da campanha; esse arquivo e o planejador não estão incluídos no pacote portátil.
