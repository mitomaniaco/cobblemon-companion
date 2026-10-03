# Prontidão — consolidação das quatro frentes

Atualização: 02/10/2026. Estado: **adaptador aprovado no recorte; importação local e cálculo real contextual implementados; shell R1 do TrainerApp verificado em Electron com fixture sintética**. A UI preserva seleção e propostas por UUID, invalidação ao atualizar a captura e demonstração independente. O smoke atual não leu save real, não certifica batalha viva nem substitui a prova Medium, que permanece pendente. Veja [VALIDACAO.md](../VALIDACAO.md), [IMPORTACAO-PARTY.md](IMPORTACAO-PARTY.md), a [visão geral](../README.md) e o [handoff](../../HANDOFF.md).

## TrainerApp R1 — 02/10/2026

`npm.cmd run check` passou em typecheck, 46 testes e build. `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs` passou os fluxos reais do renderer com fixture sintética: Gardevoir normal/Synchronize liberado pelo catálogo v10, prévia, cálculo real, invalidação após refresh, demo independente com estados `current`/`cancelled`/`stale`/`failed` e layouts 1440/1200/800 CSS px e 200% de zoom, sem overflow horizontal. Capturas em `.runtime/diagnostics/trainer-ui-snvi41/`, incluindo `gardevoir-damage-result.png`. Nenhuma leitura real do save ocorreu nesse smoke; Medium e equivalência viva permanecem fora desta prova.

## Integração party/PC — 24/09/2026

O painel “Meus Pokémon” lê sob demanda party e PC pelo mundo indicado em `server.properties`, seleciona indivíduos por UUID e separa golpes equipados/aprendidos. A leitura permanece em memória, sem upload, banco ou escrita no jogo. O planejador escolhe um slot equipado e um candidato de `BenchedMoves` do mesmo UUID e mostra o antes/depois de uma única troca. Não calcula dano, não ordena golpes e não grava no save. A demonstração Pikachu/Floatzel continua fixa e não usa a seleção nem o rascunho.

Smoke-read local somente leitura: **6 party + 62 PC = 68**, capturado em **2026-09-24T07:31:12.246Z**. Nenhum nome, espécie ou UUID foi impresso. Uma execução anterior de `npm run check` registrou typecheck/build aprovados e Vitest **10/10** (6 importer, 4 comparação); o fixture `.cjs` baseado em `node:test` foi integrado ao Vitest após aparecer como “suite sem testes”. A última rechecagem documentada em 24/09/2026, após preservar IDs de origem, aprovou typecheck, Vitest **18/18** (4 comparação, 5 planejador de troca, 9 importer) e build. Os cinco testes novos cobrem domínio puro, não renderer nem Electron.

Revisão independente anterior no host elevado: Electron 44.4.3 com GPU ativa (`gpu_compositing: enabled`), perfil isolado e harness de importação saiu com código 0 (PID 25464). Pelo DOM, a leitura sob demanda apresentou 6/62, 68 opções por UUID iguais ao snapshot capturado, golpes equipados/aprendidos do indivíduo selecionado e demo inalterada. Dois screenshots do painel preenchido foram inspecionados; detalhes e grupos de golpes estavam legíveis. Nenhum processo Electron da rodada permaneceu. Essa aprovação é da integração de importação então exercitada; não é prova Electron da UI nova de planejamento de troca. Medium continua pendente. Evidência, artefatos e duas mensagens GPU sem efeito no resultado estão em [IMPORTACAO-PARTY.md](IMPORTACAO-PARTY.md).

## Estado da prova desktop

**Harness Electron standalone supervisionado — 24/09/2026, `D:\Dev\cobblemon-companion`:** Electron oficial 44.4.3 instalado; execução concluída com código 0, sem timeout. O harness verificou janela, IPC, importação, seleção party/PC e golpes, além de confirmar que a demonstração permanece independente; foram gerados dois PNGs e não restaram processos. A primeira execução direta foi inconclusiva. Esta prova não cobriu a UI move-swap nem substitui a prova Medium.

**Gate Medium em 24/09/2026:** não executado. A shell host e o Explorer desktop do usuário local estão em integridade High, e o token host não tem par Medium vinculado (`TokenElevationTypeDefault`; `TokenLinkedToken` Win32 1312). A shell Medium da tarefa pertence a `<conta-sandbox>` e não é prova do app como o usuário local comum. Foi criado o launcher manual `apps/cobblemon-companion/run-medium-check.cmd`, que recusa High e exige confirmação do token no próprio Electron, com perfil isolado, logs e watchdog. Sintaxe do launcher e harness passou; execução funcional Medium aguarda uma sessão Explorer Medium existente e o retorno de seus artefatos. Instruções em [README.md](../../README.md) e evidência em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md). A prova visual no host High abaixo permanece válida no seu recorte.

**Estado vigente em 24/09/2026:** a pendência de captura visual da demo offline foi encerrada **no host elevado**. Um único run do harness visual, após remover a espera por `requestAnimationFrame` pausável, terminou com código `0` (PID 24388, Electron 44.4.3, GPU ativa, perfil isolado). A inspeção dos dois PNGs confirmou resultado Spark 36 → Thunderbolt 50, HP restante 34 → 20 e rastreabilidade/limites legíveis; a fixture declara que não é a party real. Os parágrafos abaixo preservam as falhas das execuções anteriores como histórico. A abertura sob o sandbox da tarefa e em integridade Medium segue sem aprovação; a DLL exata permanece desconhecida. Evidência e limites em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md).

Atualização de 24/09/2026 para a primeira fatia: execução única controlada com Electron 44.4.3, GPU ativa e `userData`/`sessionData` novos. A janela não carregou; o GPU child repetiu `0xC0000135` e o processo principal encerrou com `0x80000003`. A hipótese de perfil/cache padrão é insuficiente para explicar a falha. Nenhuma DLL foi identificada; runtime da primeira fatia permanece bloqueado antes do renderer. A prova aprovada no experimento isolado abaixo mantém seu escopo anterior. Detalhes em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md).

Captura WPR focal posterior: a solicitação elevada foi aprovada e o ETL de FileIO/Loader/processos foi salvo em `.runtime/diagnostics/wpr-gpu-loader-20260924T024419/electron-startup.etl` (597.688.320 bytes); a sessão foi parada. A execução Electron única repetiu a falha antes do renderer. A conversão do ETL não foi concluída na janela desta rodada e nenhum caminho de DLL foi confirmado; esse diagnóstico permanece pendente.

Contraste final de 24/09/2026: a única execução elevada no host, com mesmo Electron/harness/diretório, perfil novo e GPU ativa, passou o fluxo inteiro (PID 22372, código 0). Revisão visual posterior do PNG dessa execução viu “Calculando”, sem resultado; aquele screenshot não comprova saída visual. Sob o sandbox da tarefa, o run comparável falhou antes do renderer (PID 27356, GPU `0xC0000135`, principal `0x80000003`). O contraste aponta para o contexto de execução restrito, mas não separa sandbox de arquivos de diferenças de privilégio nem identifica DLL. O ETL permanece sem conversão; nenhuma DLL foi confirmada. Detalhes em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md).

Captura visual corrigida, 24/09/2026: `node --check` passou e uma execução única no host (PID 22784, Electron 44.4.3, perfil isolado, GPU ativa, código 0) observou IPC `current` e UI `status-result`; todos os asserts do harness passaram. A inspeção do PNG, porém, mostra apenas o topo/formulário: resultado e limites ficaram fora do viewport. Evidência visual **pendente**. Artefatos em `.runtime/diagnostics/visual-result-20260924T030919/`; a fixture Pikachu/Floatzel não é a party real.

Tentativa focal posterior: `whoami /groups` confirmou que o contexto host aprovado é **High** (`S-1-16-12288`), então ele não prova execução como usuário Medium. Um único run com scroll e espera por paint explícitos (PID 34152) chegou ao resultado no stdout, mas atingiu o watchdog de 25 s antes de qualquer PNG; saída `1`, sem processos remanescentes. Logs e metadados em `.runtime/diagnostics/visual-viewport-20260924T033200/`. O harness recebeu depois um timeout interno, com sintaxe aprovada e sem reexecução. Permanecem pendentes screenshot legível do resultado/limites e teste Medium; a instrução de encerramento impediu nova tentativa. Nenhum contrato do app mudou, a baseline não foi repetida e a conclusão estática/DLL não identificada permanece igual. Detalhes em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md).

Complemento de 20/09/2026: **interrupção síncrona aprovada** no mesmo Electron 44.4.3 real. Uma execução completa de npm.cmd test passou com timeout (PID 20508 encerrado → recuperação 2280) e cancelamento (2280 encerrado → recuperação 28676), após entrada síncrona observada. Ambos exigiram evento exit e análise seguinte current com 36/50. Watchdog independente de 15 segundos armado; fuse finito de 2 segundos no filho, cujo término natural reprova o caso. Zero processos restantes na consulta final; três sintaxes afetadas aprovadas; baseline 51 não repetida. Detalhes e limites no relatório da prova.

O experimento autorizado foi implementado e revisado em experiments/cobblemon-desktop-proof (`experiments/cobblemon-desktop-proof/PROVA-DESKTOP.md`): janela invisível, preload allowlistado, `contextIsolation`/sandbox, validação de remetente e origem, schema, cálculo no `utilityProcess`, cancelamento, timeout, obsolescência e limpeza de erro. O ensaio usa somente a fixture congelada Pikachu/Floatzel e não lê save ou servidor.

Bloqueio de instalação resolvido nesta continuação: instalador oficial com electron_config_cache em .runtime/download-cache do workspace, checksums preservados; userData/sessionData em .runtime/user-data. Após três execuções que revelaram bugs pequenos (origem customizada, caminhos do worker e expressão do helper), o quarto npm.cmd test terminou com código 0. Electron 44.4.3, Chromium 152.0.7977.130, Node embarcado 24.21.0; utilityProcess PID 20348. A consulta final autorizada não encontrou processos do experimento. Saída integral e comandos em `experiments/cobblemon-desktop-proof/PROVA-DESKTOP.md`.

A revisão independente removeu dois falsos positivos do ensaio: `failureCleanup`/`cleanShutdown` deixaram de ser flags sem evidência e passaram a exigir recuperação do mesmo job e evento de saída do worker. Também foram corrigidos `postMessage` com falha, referência a worker encerrado, cancelamento/timeout e validação de origem por comparação exata. Essas mudanças não ampliam a prova para empacotamento, UI ou banco.

## Resultado vigente da revisão limitada

A correção delimitada passou **51/51 (47 anteriores + 4 novos)** e sintaxe dos dois arquivos de código alterados. Requisição de cálculo agora integra a referência pelo manifesto de fontes derivadas; `assessOfflineFreshness(reference, input)` reconstrói o envelope da entrada atual. Mudança de alvo invalida a referência antiga, IVs/EVs inválidos são rejeitados antes do cálculo e item planejado é bloqueado pelo recorte sem item. Controles legítimos e condições por desconhecidos foram preservados. Detalhes em [REVISAO-ADAPTADOR.md](REVISAO-ADAPTADOR.md).

**Revalidação independente executada: 51/51 (27 + 13 + 11), zero falhas; sintaxe dos dois arquivos aprovada.** Contraexemplos originais e controles legítimos passaram: alvo/locks invalidam a referência antiga, stats inválidos e item planejado são rejeitados. O consumidor chama `assessOfflineFreshness` com a entrada completa. A revisão desta rodada executou quatro `node --check` da prova, mas não repetiu a suíte-base porque não alterou o núcleo de batalha. **Prova desktop executada e aprovada no recorte existente.** Quatro sintaxes aprovadas nesta continuação; baseline 51/51 não repetida. A fixture continua `condicional` por fatos desconhecidos; não há certificação viva. Contagens de 47 no restante são histórico de 19/09, superado pela execução independente atual.

## Conclusão e próximo passo

As correções de Turing passaram pela revisão independente: 40/40 testes-base e os três contraexemplos resolvidos. O adaptador offline fecha a ligação entre snapshot, contrato, cálculo revisado, evidência pareada e explicação: 47/47 testes passam, sem mutar a fixture.

O smoke supervisionado de 24/09 verificou janela, IPC, importação party/PC, golpes e independência da demo, mas não cobriu a UI move-swap. Essa lacuna de fluxo foi fechada em 02/10: o harness do TrainerApp passou a prévia, cálculo real via snapshot sintético, invalidação por refresh, estados concorrentes da demo e layouts responsivos. A prova Medium permanece pendente; o harness sintético não certifica batalha real, todos os cenários de identidade nem equivalência com o servidor.

## Evidências verificadas

| Evidência | Execução nesta integração | Alcance |
|---|---|---|
| Comparador final de Locke | 27/27 na execução conjunta final | Contratos pareados, equipado fora do catálogo, `actionTraceUnit`, ponte de dano local |
| Contrato corrigido de Turing | 13/13 na execução conjunta final | Fixtures sintéticos e regressões de C-01/C-02/C-03 |
| Suíte-base conjunta final | **40/40, uma execução independente após os fixes**, zero falhas | Comparador + contrato; não inclui a ponte nova |
| Adaptador offline | **7/7 testes novos** | Snapshot congelado → contrato v1 → cálculo suportado → evidência → `compareEvidence` → explicação |
| Suíte desta etapa | **47/47**, zero falhas | Execução direta de 27 + 13 + 7; não é prova de produto ou servidor vivo |
| Revisão adversarial adicional | Três contraexemplos reexecutados em memória e resolvidos; controles legítimos passaram | Fonte alterada invalida, getter rejeitado sem execução, contexto selecionado exige fonte |
| Revisão da prova desktop | Corrigidos origem customizada, caminhos do worker e helper de rejeição | Controles existentes passaram em Electron real |
| Instalação oficial da prova | Instalador 44.4.3 terminou com código 0, cache local no workspace | Binário oficial disponível, checksums preservados |
| Ensaio Electron | **Código 0**, runtime 44.4.3 / Windows x64 | Janela invisível, IPC/utilityProcess, rejeições, stale, cancelamento/timeout por timer, recuperação e saída; zero processos restantes |
| Harness standalone supervisionado em 24/09/2026 | **Código 0**, sem timeout; dois PNGs; zero processos restantes | Janela, IPC, importação/seleção party-PC/golpes e independência da demo; não cobriu a UI move-swap nem Medium |
| Harness Electron do TrainerApp em 02/10/2026 | **Todos os fluxos passaram**; screenshots em `.runtime/diagnostics/trainer-ui-snvi41/` | Gardevoir normal/Synchronize, snapshot sintético, UUID, prévia, cálculo real, refresh invalidante, demo e 1440/1200/800 CSS px e 200% zoom; não leu save real nem provou Medium |
| Sintaxe | 6 arquivos passaram na revisão anterior; os 2 arquivos de contrato alterados passaram novamente após os fixes | Checagem sintática separada dos 40 testes funcionais |
| Metadados de packs | JSON final inspecionado: 35 habilitados, 13 desabilitados | Captura de metadados de `level.dat`; não atualiza indivíduos |
| Snapshot de indivíduos | JSON histórico inspecionado: gerado em 09/09/2026, 68 indivíduos | Não foi recapturado; party/PC não foram atualizados nesta integração |
| Checagens da Frente 1 | Relatório registra 38 comparações de hash, 8 sintaxes JS e 6 parses PS | Resultados da frente autora, não reexecuções desta integração nem testes funcionais |
| Documentação alterada pelo integrador | 33 links locais conferidos, zero destinos ausentes | Seis documentos autorizados; contagens antigas do comparador removidas do status atual |

Comando da suíte conjunta, a partir da raiz:

```text
node --test battle-planner/test/compare-evidence.test.cjs battle-planner/test/preflight-contracts.test.cjs battle-planner/test/offline-adapter.test.cjs
```

Sintaxe final conferida: `compare-evidence.cjs`, seu teste, `src/test/fixtures/evidence-real-calculation.cjs`, `preflight-contracts.cjs`, seu teste e `experiments/cobblemon-compatibility/world-packs.cjs`. A sintaxe de `fixtures/comparison-cases.cjs` também foi conferida na revisão anterior. As contagens anteriores de 21 e 24 testes do comparador foram substituídas por 27.

O fixture de cálculo resolve a dependência local `@smogon/calc` cujo manifesto informa 0.11.0. A prova usa indivíduos sintéticos, atributos declarados e dano bruto do calculador padrão; o adaptador passa esses valores pelo contrato v1 e produz evidência estruturada. Confirma o transporte e o frescor no recorte declarado; não confirma legalidade dos sets fictícios, batalha completa, perfil customizado, ordem, IA ou equivalência viva. As execuções usaram Node diretamente, sem instalação ou reparo.

## Defeitos encontrados e encerrados após revisão independente

As evidências e reproduções originais abaixo documentam a descoberta; não descrevem o estado final do código. Turing corrigiu os três itens e adicionou regressões.

### P1 / C-01 — mudança de fonte não invalida análise

Evidência: `computeInputDigest` usa `snapshot`, `context`, `player` e `policy`, mas omite `sources`. O fingerprint recebido no snapshot é validado apenas como string SHA-256; não é recalculado ou conferido contra as fontes. Portanto, essa omissão não está compensada por uma verificação de consistência.

Reprodução executada: criar referência pelo `makeAnalysisRef` do bundle válido da suíte; copiar esse bundle; alterar somente `sources[0].sha256` para outro hash válido; chamar `assessFreshness` com a mesma versão de motor. Resultado observado: `{fresh: true, reasons: []}`.

Correção exigida: incluir o manifesto relevante de fontes no digest, ou derivar/verificar o fingerprint das fontes antes de aceitar a referência. Definir explicitamente o algoritmo e testar mudança de conteúdo de fonte referenciada mantendo IDs/revisão externos iguais. Passagem: mudança relevante rejeitada ou `fresh: false`; alteração de ordem de chaves continua determinística.

**Encerrado:** `sources` integra o digest. Na reprodução final, alteração somente do SHA-256 retornou `{fresh: false, reasons: ['input-digest-mismatch']}`. Bundle inalterado permaneceu fresco e reordenar chaves dos objetos preservou o digest. A ordem dos arrays permanece significativa; isso pode invalidar conservadoramente, não comprova equivalência viva.

### P1 / C-02 — acesso executável atravessa a fronteira declarada JSON

Evidência: `jsonValue` percorre propriedades por `value[name]` e depois serializa. Não verifica descritores antes de acessar valores, apesar da promessa de rejeitar acessores.

Reprodução executada: no bundle válido, substituir `exportId` por propriedade enumerável com getter que incrementa contador e retorna o texto válido anterior. Resultado observado: validação aceita, getter chamado **4 vezes**.

Correção exigida: rejeitar acessores por descritores antes de ler/serializar propriedades, incluindo arrays e propriedades especiais relevantes. Passagem: getter/setter rejeitado sem executar getter (`calls === 0`); objetos JSON comuns continuam aceitos. Isto é uma falha da API que aceita objetos em memória; não significa que um JSON textual sozinho possa conter getters.

**Encerrado:** inspeção de descritores precede leitura dos valores. Getter de `exportId` rejeitado com zero chamadas. Testes independentes adicionais rejeitaram array esparso, propriedade extra, símbolo e getter no índice, também sem executar getter; JSON comum permaneceu aceito.

### P1 / C-03 — encontro selecionado sem procedência é aceito

Evidência: `context.sourceIds` admite zero entradas mesmo em `state: 'selected'`, contrariando o contrato descrito no relatório 03.

Reprodução executada: bundle válido, `context.sourceIds = []`, mantendo treinador/cap/tipos e estado selecionado. Resultado observado: `validatePreflight` aceita.

Correção exigida: exigir fonte de contexto selecionado, ou modelar explicitamente declaração manual com sua própria procedência. Passagem: selecionado sem evidência rejeitado; contexto não selecionado continua permitido sem treinador/cap implícitos.

**Encerrado:** `selected` com fontes vazias foi rejeitado. Controle legítimo `unselected`, sem treinador/cap/tipos e com fontes vazias, foi aceito. Ausência de seleção não exige inventar procedência de encontro.

As reproduções reutilizaram a fábrica `validBundle()` existente no teste, avaliada apenas até antes do primeiro registro `test(...)`, e converteram o resultado para objeto JSON local antes das mutações. Nenhum arquivo de código foi criado/editado pela integração.

## Revisão cruzada e contratos de integração

- **Envelope único:** conservar `snapshotId`, `playerRevision`, `inputDigest`, `engineVersion` e `policyVersion` da Frente 3. `jobId` e revisão da edição da UI são metadados de execução externos; não inventar outro formato persistido concorrente. O digest corrigido inclui fontes; o adaptador ainda precisa transportar e conferir a referência.
- **Disponibilidade:** o contrato permite `acquirable-now`, enquanto o comparador atual só habilita golpes equipados/aprendidos. Na primeira fatia, comparar o subconjunto confirmado equipado/aprendido. Preservar os adquiríveis como plano/requisitos; não copiá-los para `learnedMoves` para contornar o comparador. Ampliar esse fluxo requer prova explícita de aquisição e evolução do adaptador.
- **Identificadores:** o importador do app agora preserva literalmente os IDs de origem (inclusive namespaces distintos) e não acrescenta namespace a IDs unnamespaced; strings fora do formato/limite são rejeitadas ou mantidas como desconhecidas conforme obrigatoriedade. O mapeamento para IDs do motor continua pendente: deve ser explícito e rejeitar colisões. A apresentação atual do renderer ainda pode ocultar namespace; isso não pode servir de chave.
- **Observado/plano:** `current` deve vir da build observada daquele indivíduo. A planejada não pode promover seus próprios golpes a disponibilidade observada.
- **Tempo:** `actionTraceUnit: turns` permite conferir cardinalidade; `events` e unidade ausente não permitem inferir turnos do número de strings. `scenario/search` têm traces próprios. O produtor deve declarar a unidade do horizonte e como extraiu turnos efetivos; o comparador não a descobre.
- **Cobertura:** `completeCoverage` continua declaração do produtor. Primeira comparação mostra alvos, ramos, condições e exclusões; não equivale a ranking global nem vitória. O envelope de fatos da Frente 3 ainda não é schema completo de cenário/AnalysisResult.
- **Compatibilidade:** metadados atuais de packs não fecham as lacunas de precedência, KubeJS, mapeamento de itens ou callbacks apontadas pela Frente 1.

## Snapshots: o que é atual e o que é histórico

`experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19-final.json` contém a captura final de metadados de packs feita por Laplace. O SHA-256 registrado é `c0b3e6fd80c1e6100bd83f27b26696ce82aaec0332d2722ee36d5fa26c625a0f`; 35 packs habilitados e 13 desabilitados. “Atual” significa o instante capturado e conferido pela Frente 1, não uma garantia contínua. O arquivo intermediário sem `-final` foi preservado como diagnóstico de gravação concorrente.

`battle-planner/output/snapshot.json` permanece de **09/09/2026**, com **68 indivíduos (6 party, 62 PC)** conforme o relatório 03; a integração reconferiu a data e o total. Não foi regenerado. A lista de packs presente nele também não o torna atual. Não recomendar a party atual com esse histórico sem nova leitura completa.

O parser final foi inspecionado: limite configurável até 128, segunda leitura/hash antes de gravar, falha quando o hash muda. Essa verificação detecta mudanças entre as leituras, mas não garante atomicidade do servidor nem exclui mudanças posteriores/ABA. A integração não reexecutou o parser contra o mundo nem as baterias históricas que sobrescrevem resultados.

Leitura segura de arquivos locais existentes já está autorizada. Instrumentação, instalação de coletor/mod, reload, reinício ou comandos no servidor exigem autorização específica. Um log existente pode ser lido; provocar uma batalha ou reiniciar não decorre dessa autorização.

## Sequência e critérios de começo

| Ordem | Trabalho concreto | Critério para avançar |
|---|---|---|
| 1 — Preflight concluído | C-01/C-02/C-03 corrigidos e revalidados | Cumprido: 40/40 |
| 2 — Adaptador offline | Converter snapshot/fixture para contrato v1; manter ausentes como desconhecidos; produzir comparação | **Cumprido no recorte limitado:** 7 testes novos, 47/47 conjunta |
| 3 — Prova desktop isolada | Janela mínima, preload, validação, UtilityProcess, cancelamento e descarte de resposta atrasada | **Cumprido no recorte existente:** Electron 44.4.3 real, código 0; limites no relatório |
| 4 — Primeira fatia local | Importar snapshot e selecionar indivíduo; planejador atual mostra uma troca de um slot por UUID. Comparação de build e evidências continua separada e incompleta. | Sem recomendação baseada em dado histórico silencioso; UI nova ainda requer prova Electron; recorte e requisitos explícitos |
| 5 — Persistência | SQLite em `userData`, migração transacional, export/backup/restauração | Reabrir e restaurar sem perder observados/planos; falha conserva versão anterior |
| 6 — Windows/desempenho | Runtime e binding empacotados, caminhos Windows, cancelamento; medir sem/com Minecraft | Artefato funciona sem depender de Node global ou pasta `experiments`; métricas documentadas |
| 7 — Distribuição/cobertura viva | Definir distribuição/assinatura; confirmar mecânicas dependentes de registro vivo | Evidência específica do estágio; instrumentação somente se aprovada |

A falta de SQLite, instalador, assinatura, auto-update e benchmark não bloqueia os módulos offline nem a prova desktop. Persistência precisa passar antes de guardar dados reais. Auto-update é opcional e não deve virar exigência da primeira distribuição; se escolhido, ganha seu próprio gate. Compatibilidade viva é gate para afirmações sobre o servidor vivo, não para demonstrar a fatia sintética.

## Checklist de início e limites

- [x] Três relatórios lidos; versão final do comparador distinguida da entrega de 24 testes.
- [x] Suíte final de 40 testes aprovada em execução conjunta independente.
- [x] Dados de packs separados do histórico de indivíduos.
- [x] Primeira fatia e sequência definidas; stack do produto não ampliada; prova fixa `electron@44.4.3`.
- [x] C-01/C-02/C-03 corrigidos e revalidados pelo integrador, com controles legítimos.
- [x] Adaptador offline conectado por teste fim a fim em fixture congelada; escopo mecânico limitado e explícito.
- [x] IPC, cancelamento/timeout por timer e de carga síncrona, stale e cleanup ensaiados no Electron real da prova.
- [ ] SQLite/empacotamento ensaiados; ainda não implementados.
- [ ] Desempenho medido sem/com Minecraft; nenhum número de produto prometido.
- [ ] Registro vivo/mecânicas confirmados nos recortes que exigirem essa prova.

Registro histórico da continuação da prova desktop: aquela rodada executou somente o harness Electron invisível, sem acessar jogo/save/servidor e sem deixar processos do experimento. As alterações então descritas foram no main, worker e documentação de status; nenhuma UI, persistência ou empacotamento foi iniciada por aquela prova. A UI local de importação e o planejador descritos no estado atual são entregas separadas; a nova UI ainda aguarda prova Electron, e Medium continua pendente.

Relatórios: [dados/compatibilidade](01-DADOS-COMPATIBILIDADE.md), [motor/evidências](02-MOTOR-EVIDENCIAS.md), [contratos](03-CONTRATOS-DADOS.md), [arquitetura](04-ARQUITETURA-PRONTIDAO.md). Aceite da revisão offline concluído; gates de produto e confirmação viva permanecem explicitamente pendentes.
