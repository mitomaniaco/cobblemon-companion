# Frente 4 — arquitetura e prontidão

Data: 20/09/2026  
Estado: revisão cruzada concluída; C-01/C-02/C-03 corrigidos e revalidados, aceite limitado ao recorte offline em [PRONTIDAO.md](PRONTIDAO.md). A prova desktop mínima passou em Electron 44.4.3 real na continuação de 20/09/2026; ver resultado e limites em PRONTIDAO.  
Escopo: Electron/React/TypeScript/Vite/SQLite/Zod, fronteiras de processo, cancelamento e obsolescência, empacotamento Windows, testes determinísticos e desempenho.  
Fora do escopo desta frente: reimplementar compatibilidade, comparador, prova de cálculo ou contratos de dados; iniciar a interface; instalar pacotes; alterar jogo, servidor ou save.

## Resumo executivo

O repositório não contém ainda um projeto Electron/React/Vite de produto. O que existe é um núcleo offline em CommonJS/Node no diretório `battle-planner/` e uma prova mínima isolada em `experiments/cobblemon-desktop-proof/`; esta última foi executada e aprovada no recorte do ensaio Electron 44.4.3. A arquitetura do app continua sendo contrato de integração proposto, não implementação de produto auditada.

A recomendação desta revisão é uma aplicação modular única, com quatro fronteiras explícitas:

1. **Renderer React:** apresentação e estado efêmero; sem Node, filesystem, SQLite, shell ou caminhos arbitrários.
2. **Preload:** uma API pequena e tipada via `contextBridge`; nunca expor `ipcRenderer` bruto.
3. **Main Electron:** janelas, autorização dos remetentes, arquivos escolhidos pelo usuário, SQLite, migrações, cache e registro dos trabalhos.
4. **UtilityProcess de análise:** cálculo e busca a partir de entrada serializada e imutável; sem escrita no banco e sem carregar scripts arbitrários encontrados no jogo.

O primeiro produto utilizável deve importar um snapshot versionado, mostrar sua procedência, permitir a configuração de um indivíduo e de uma build planejada, executar uma análise suportada com evidências e limitações visíveis, cancelar um trabalho e persistir/restaurar o planejamento. A importação é somente leitura e sob demanda. Monitoramento do jogo, otimização global de seis builds, batalha integral e execução de código de mods ficam fora dessa fatia.

Não há base para declarar prontidão do produto. A revisão cruzada e o adaptador offline com teste fim a fim estão concluídos no recorte sintético limitado. O código da prova desktop contém a janela mínima, ponte, UtilityProcess e ensaios de obsolescência/cancelamento/limpeza, e passou no Electron 44.4.3 após resolver o cache no workspace e corrigir origem customizada, caminhos do worker e helper de teste. O ensaio Electron/Node/SQLite ainda impede chamar o cálculo desktop ou o pacote Windows de suportados. Polimento visual, atualização automática e cobertura ampla de mecânicas são validações posteriores.

## Evidências da inspeção

| ID | Evidência observada | Consequência arquitetural |
|---|---|---|
| A-01 | `battle-planner/package.json` é privado, CommonJS e exige Node `>=22`; os scripts usam `node:test`. Não há manifesto de Electron, React, TypeScript, Vite, SQLite, Zod, Vitest ou Playwright no núcleo; o manifesto Electron está isolado em `experiments/cobblemon-desktop-proof`. | Não existe implementação desktop de produto para auditar nem runtime validado. A prova isolada prepara a fronteira mínima; o Electron real ainda precisa ser executado. |
| A-02 | `src/cli.cjs` lê configuração e arquivos, instancia o núcleo de forma síncrona e grava `output/status.json` e relatórios. A captura pode ler party/PC e recursos do mundo configurado. | O app não deve chamar a CLI nem herdar seus caminhos/configuração diretamente no renderer. Deve usar um adaptador de importação controlado e saídas versionadas; arquivos de jogo continuam somente leitura. |
| A-03 | `src/search.cjs` limita profundidade a 1–2 e tem `maxNodes`, mas a busca é síncrona e não aceita `AbortSignal`/deadline. `src/analysis.cjs` também percorre confrontos em chamadas síncronas. | Um botão “cancelar” não pode depender de cancelamento cooperativo inexistente. O primeiro isolamento deve ser um `UtilityProcess` terminável; a UI deve tratar o resultado como obsoleto quando a geração mudou. |
| A-04 | `src/compare-evidence.cjs` é puro, não acessa save, motor ou UI, e a bateria descrita em `CASOS-COMPARACAO.md` é sintética. | É uma boa fronteira para o primeiro adaptador: validar entrada/saída uma vez e manter a decisão explicável. Evidência sintética deve aparecer identificada como laboratório, nunca como confirmação no jogo vivo. |
| A-05 | `src/engine.cjs` carrega módulos locais do Showdown/calculador e dados de compatibilidade por caminho de configuração; a documentação proíbe executar JavaScript arbitrário de mods. | O app não pode aceitar um caminho de módulo fornecido pelo usuário nem fazer `require` de scripts exportados do servidor. O runtime embarcado deve ser revisado, versionado e permitido por manifesto; snapshot de dados e código executável são categorias distintas. |
| A-06 | `PLANO.md` ainda lista importação automática de party/PC entre os itens fora do início, enquanto o README do núcleo e a implementação registram a importação read-only acrescentada em 09/09/2026. | A contradição foi resolvida nesta revisão: a capacidade existente pode alimentar a primeira fatia por snapshot/importação sob demanda; monitoramento ou importação automática em background continua fora do início. |
| A-07 | `VALIDACAO.md`, `PROVA-COMPATIBILIDADE.md` e `CASOS-COMPARACAO.md` distinguem laboratório, reconstrução offline e jogo vivo; a interface ainda não foi construída. | O app precisa transportar `snapshotId`, procedência, hashes, versão do motor/política, hipóteses, cobertura e limitações até a tela e o resultado persistido. Não converter estado “inconclusivo” em recomendação positiva. |
| A-08 | O núcleo declara Node `>=22` e `engine.cjs` resolve `@smogon/calc` e arquivos do Showdown em `experiments/cobblemon-compatibility/node_modules` por caminho externo. O fixture da Frente 2 usa a mesma dependência local, corretamente, como prova offline. | O futuro UtilityProcess usa o Node embutido no Electron, não o Node do terminal. O spike precisa comprovar compatibilidade da versão embutida, resolução/bundle do runtime revisado e hashes sem depender de `../experiments` fora do pacote. |

Nenhum teste do app, spike de empacotamento, benchmark ou integração com SQLite foi executado nesta revisão. Nenhum jogo, servidor ou save foi alterado; a interface não foi iniciada.

## Arquitetura proposta, sem congelar versões

### Separação de processos

O renderer deve ser um cliente de uma API de domínio, não um cliente de filesystem. A janela deve ser criada com `nodeIntegration: false`, `contextIsolation: true`, sandbox ativo e CSP restritiva. A navegação e a criação de janelas devem ser limitadas ao conteúdo local do app. A API de preload expõe somente operações nomeadas, por exemplo:

```text
workspace.openSnapshot(fileToken) -> SnapshotSummary
workspace.savePlannedBuild(input) -> PlannedBuild
analysis.start(request) -> AnalysisJob
analysis.cancel(jobId) -> CancelAck
analysis.onProgress(listener) -> unsubscribe
analysis.onCompleted(listener) -> unsubscribe
```

Os nomes acima são um desenho de contrato, não uma API já implementada. Cada argumento e retorno deve ser validado no main com Zod; validação no renderer melhora a UX, mas não é uma barreira de segurança. O main deve conferir o `sender` contra uma janela conhecida, o canal contra uma allowlist e a origem contra o protocolo local esperado. Não expor `ipcRenderer.send`, `ipcRenderer.invoke`, `shell`, `fs`, SQL ou `process` diretamente.

O main controla a abertura de arquivos selecionados, com limites de tamanho, extensão/formato e diretório de saída. O importador transforma o arquivo em um snapshot canônico, rejeitando JSON parcial, tipos desconhecidos perigosos, referências cíclicas, funções, acessores e caminhos de módulos. A importação deve guardar a origem e o hash; não publicar um snapshot parcial como completo.

### Cálculo, cancelamento e obsolescência

Cada execução recebe um envelope imutável, alinhado ao contrato v1 da Frente 3:

```text
jobId
snapshotId
playerRevision
workspaceRevision
individualId / scenarioId
engineVersion / policyVersion
seed
maxNodes / maxMillis
inputDigest
```

O main registra a geração mais recente por workspace. O resultado só pode ser aplicado ou persistido se `jobId`, `workspaceRevision`, `snapshotId`, `playerRevision`, `inputDigest`, versão do motor e versão da política ainda corresponderem ao estado atual. Um resultado válido que chega depois de uma nova edição é descartado como **obsoleto**, não comparado silenciosamente com a build nova. `inputDigest` é a trava de frescor do contrato; não é prova de que os valores físicos estão corretos.

Para a primeira integração, o UtilityProcess recebe somente dados serializados e devolve mensagens de progresso/resultados. O worker não escreve SQLite, não escolhe caminhos e não executa scripts oriundos do snapshot. Como o núcleo existente não observa cancelamento durante os loops síncronos, o cancelamento tem duas fases: solicitar encerramento e aguardar um intervalo curto; se não houver confirmação, terminar o processo e marcar o job como cancelado. O main nunca persiste um resultado de processo terminado sem mensagem final válida.

`maxNodes` é limite de segurança já existente na busca; `maxMillis` e limite de payload precisam existir no envelope do app antes de publicar análises longas. O deadline não deve ser apresentado como garantia de cancelamento instantâneo: a garantia prática vem da terminação do processo separado. Pool/reuso de workers, progresso detalhado e cancelamento cooperativo podem ser melhorias posteriores, após medir custo de inicialização.

O cache deve usar uma chave derivada da entrada canônica, snapshot, versão do motor, versão da política e versão do schema. Não usar horário, ordem de objeto ou texto de interface na chave. Invalidar ao mudar dados, regras, motor, política ou hipóteses que influenciem a conclusão.

### SQLite e persistência

SQLite continua adequado para um app local de usuário único, mas o binding nativo só deve ser escolhido depois de ensaio no Electron e no pacote Windows. O main deve ser o único dono da conexão e do SQL. O worker calcula; o main grava uma transação curta depois de validar o retorno.

O local do banco deve ser `app.getPath('userData')`, nunca a pasta de instalação, o `resources` ou o `app.asar`. Migrações são transacionais e usam `PRAGMA user_version` como contador de schema da aplicação; não confundir com `schema_version` interno do SQLite. A primeira fatia pode guardar payloads canônicos JSON validados dentro de tabelas pequenas, sem normalizar todo o domínio prematuramente:

```text
snapshots (id, schema_version, source_hash, provenance_json, payload_json)
workspaces (id, current_snapshot_id, revision)
planned_builds (id, workspace_id, individual_id, payload_json, observed_hash)
analysis_runs (id, request_hash, status, result_json, created_at)
```

Esse esquema é uma proposta de menor custo; o contrato v1 da Frente 3 tem precedência. `schema_version` no quadro acima é o campo/payload exportado, enquanto a versão operacional da base é `PRAGMA user_version`; uma tabela de histórico só deve ser adicionada se houver necessidade concreta de auditoria. A build observada nunca deve ser sobrescrita pela planejada. Exportar/restaurar um pacote aberto deve incluir schema, hashes e versões, e deve ser escrito por arquivo temporário seguido de substituição segura. Para cópia de uma base viva, preferir a Online Backup API do SQLite; não copiar apenas o arquivo enquanto houver transação aberta. Erro de migração ou restauração conserva a versão anterior.

Não habilitar WAL por reflexo. Com um único escritor no main e o cálculo fora do banco, o journal padrão pode ser suficiente. Se benchmark justificar WAL, o backup/export deve tratar também os arquivos `-wal`/`-shm`, e a política de checkpoint deve ser testada; WAL não funciona em filesystem de rede e ainda permite apenas um escritor.

### TypeScript, Vite e Zod

TypeScript deve cobrir main, preload, renderer e adaptador de cálculo, mas a migração do CommonJS existente pode ser incremental. Um módulo adaptador tipado deve encapsular `require` do núcleo atual; não espalhar tipos implícitos do CommonJS pelo renderer.

Vite deve ter entradas separadas para renderer, preload e main/utility quando aplicável. O bundle do renderer não pode importar `node:fs`, SQLite ou o motor de batalha. `vite build` prova somente a compilação do bundle; não prova o carregamento do Electron empacotado, o caminho do UtilityProcess ou o binding nativo.

Zod deve validar somente nas fronteiras: importação/exportação, IPC, mensagens do UtilityProcess, migrações e leitura de resultados persistidos. Os tipos internos podem ser inferidos dos schemas. Envelopes de job/IPC devem ser estritos e discriminados; snapshots externos devem preservar diagnóstico de campos desconhecidos sem executá-los. Números devem ser finitos, arrays limitados e movimentos limitados a quatro por build.

### Empacotamento Windows

O primeiro spike deve gerar uma pasta não instalada e, em seguida, um instalador somente em ambiente de teste. Ele precisa comprovar:

- o renderer carrega a build Vite a partir do pacote local;
- o preload resolve o caminho empacotado;
- o UtilityProcess consegue iniciar com o app empacotado, inclusive se o entrypoint precisar ficar fora do `asar`;
- o binding SQLite nativo corresponde ao Electron/arquitetura do pacote;
- o banco é criado em `userData`, sobrevive a reinício e não tenta escrever na instalação;
- caminhos Windows com espaços, acentos e diretórios protegidos falham de modo explicável;
- logs de falha não expõem paths pessoais, UUIDs ou payloads sensíveis sem necessidade.

Electron recomenda ferramentas de empacotamento do ecossistema e assinatura para distribuição. Isso não obriga escolher Electron Forge nem qualquer versão nesta etapa. Assinatura EV, atualização automática e distribuição pública são gates de lançamento, não gates da primeira prova local; ainda assim, o formato de artefato e a estratégia de assinatura devem ser definidos antes de publicar para terceiros.

## Primeira fatia utilizável

Com os relatórios revisados, a sequência mínima recomendada é:

1. **Fronteira offline:** adaptador que consome fixture versionado pelo contrato v1 existente e produz comparação com evidência; teste fim a fim de procedência, disponibilidade e frescor. Na prova desktop seguinte, acrescentar schemas Zod equivalentes e envelope de job sem substituir o contrato por outro divergente.
2. **Shell seguro:** uma janela React local, preload allowlistado e um comando de abrir snapshot. Nenhuma descoberta automática de `D:\Games\Minecraft` e nenhuma execução de script importado.
3. **Persistência mínima:** banco SQLite em `userData`, migração inicial, salvar/restaurar snapshot e build planejada sem alterar a observada.
4. **Uma análise:** um indivíduo, um cenário suportado, uma execução no UtilityProcess, progresso mínimo, cancelamento e descarte de resultado obsoleto.
5. **Evidência visível:** resultado estruturado com status `preferência-no-recorte`, `condicional`, `manter` ou `inconclusivo`, fontes, hipóteses, cobertura e requisitos. Resultado sintético/reconstruído deve ser rotulado.
6. **Exportação aberta:** salvar um pacote restaurável com versões e hashes; validar que uma falha não substitui o estado anterior.

Essa fatia já entrega valor sem prometer vitória, party ótima ou equivalência com o servidor vivo. A party/PC pode aparecer quando o snapshot contiver todos os indivíduos, aproveitando o núcleo existente; a UI não deve reimplementar a leitura de NBT nem fazer polling do save. O app só deve liberar o rótulo “confirmado no jogo vivo” quando a compatibilidade da Frente 1 e os casos do motor da Frente 2 sustentarem isso.

## Ordem de implementação e gates

| Ordem | Entrega | Gate para passar | Não bloqueia a ordem inicial |
|---|---|---|---|
| 0 — concluído | Consolidar 01/02/03 e corrigir contratos | 40/40 e contraexemplos revalidados; limites registrados | Branding, otimização global, auto-updater |
| 1 — concluído no recorte | Adaptador offline e primeira comparação em memória | Fixture determinístico; procedência, IDs, disponibilidade e frescor preservados | Electron, SQLite, IA RCT completa, duplas |
| 2 — preparado, pendente de execução | Prova desktop isolada | IPC, cálculo, obsolescência/cancelamento e runtime revisado | UI completa, persistência, Windows empacotado, cobertura viva |
| 2 | Spike Vite/Electron + preload + UtilityProcess | Build local, runtime permitido, IPC validado, cancelamento e stale-result testados | UI completa |
| 3 | SQLite/migrações/exportação | Reabrir, migrar, falhar sem corromper e restaurar fixture | WAL, múltiplas janelas |
| 4 | Fluxo React de um indivíduo/build | Evidências e limitações não se perdem na renderização; planejada não sobrescreve observada | Busca de seis builds |
| 5 | Spike Windows empacotado | `win-unpacked`/instalador de teste, SQLite nativo, UtilityProcess e paths verificados | Assinatura pública se não houver distribuição |
| 6 | Medição com e sem Minecraft aberto | Relatório de cold/warm, CPU/RSS, importação, cálculo, cancelamento e UI; metas só então | Prometer números antes da medição |

## Testes determinísticos exigidos

Os testes devem separar quatro camadas e não misturar uma execução viva com um fixture sintético:

1. **Puros/contratos:** schemas, limites, canonicalização, hash, migrações em banco temporário e exportação/restauração. Fixar relógio/UUID ou removê-los da comparação. Ordenar explicitamente indivíduos, movimentos e evidências.
2. **Motor/reconstrução offline:** inputs completos, seed explícita, ações e estado inicial explícitos, resultado inteiro e trace esperado. Registrar quando o teste usa Showdown local, `@smogon/calc`, reconstrução ou fixture sintético.
3. **Processo/IPC:** remetente inválido, payload inválido, processo que termina, timeout, cancelamento, mensagem atrasada e resultado com geração antiga. Verificar que nenhuma conclusão velha é persistida.
4. **Fluxo empacotado:** abertura, importação, análise, cancelamento, persistência, exportação e restauração no executável Windows. Playwright só deve afirmar fluxo de produto depois que o executável realmente abrir.

O teste histórico `battle-planner/test/core.test.cjs` importa o save durante o carregamento; ele é uma verificação de integração do ambiente local, não uma unidade determinística nem um teste adequado para cada execução do app. Deve permanecer identificado como integração/reconstrução e não ser usado como prova de ausência de regressão em qualquer máquina.

Regras de teste: não usar `Date.now()`, locale, ordem de filesystem, aleatoriedade implícita ou resultado de rede como expectativa; não comparar relatório inteiro que contém timestamps; não transformar uma seed favorável em garantia; e não contar um teste de compilação como teste de empacotamento.

## Desempenho: plano de medição, não promessa

Medir a mesma entrada canônica em duas condições:

- **Sem Minecraft:** fixture e recursos copiados para área de teste, sem processos do jogo/servidor e sem lock externo. Separar cold start, captura/importação, carga do runtime, cálculo, serialização e SQLite.
- **Com Minecraft aberto:** repetir com o ambiente autorizado já aberto, sem enviar comando, reiniciar, recarregar ou escrever no save. Se não houver uma captura válida e reproduzível, registrar “não medido” em vez de inferir.

Para ambas, usar conjuntos de 15 e 30 golpes e cenários representativos do horizonte suportado, além de uma party/PC real somente quando a captura estiver autorizada. Registrar máquina, versão do sistema, Electron/Node/binding depois do spike, tamanho do snapshot, número de indivíduos, candidatos, nós, seed, cache frio/quente, tempo p50/p95, CPU, RSS, tamanho do banco e latência de cancelamento. Medir UI separadamente do cálculo.

O critério inicial não é um número inventado: não bloquear a interface, não persistir resultado obsoleto e terminar dentro de `maxMillis` ou pelo kill do processo em um limite documentado. As metas de latência, memória e tamanho de pacote só entram no plano depois dos números observados.

## Pré-requisitos, gates de sequência e validações posteriores

### Pré-requisitos antes de iniciar a primeira fatia

- Cumprido: relatórios 01/02/03 revisados; comparador final com 27 testes e CASOS-COMPARACAO sincronizado; contrato com 13 testes e C-01/C-02/C-03 revalidados.
- Próxima execução: iniciar a prova desktop isolada já preparada sobre a fixture de integração entregue; procedência, cobertura limitada e status de validação devem continuar explícitos.
- O contrato de entrada/saída precisa proibir `require` de caminhos arbitrários e execução de JavaScript importado dos mods; o runtime real pode continuar pendente enquanto o spike usa fixture/recurso revisado.
- O envelope de job precisa existir no desenho do spike: geração, hash canônico, versão do motor/política, seed e limites; sem isso, a primeira UI não deve iniciar análise assíncrona.

### Gates que entram na sequência antes de habilitar o produto correspondente

Estes itens não bloqueiam começar a prova isolada. Bloqueiam declarar o respectivo estágio utilizável:

1. **Spike Electron/Node:** comprovar que o Node embutido no Electron executa o adaptador CommonJS e que o runtime revisado não depende do caminho externo `../experiments`. Até passar, usar apenas fixture controlado e rotular o cálculo empacotado como não validado.
2. **Spike SQLite:** escolher/testar o binding no Electron, executar migração, transação, restauração e exportação em `userData`. Até passar, não persistir estado de usuário no app; um protótipo pode manter fixture efêmero.
3. **Spike UtilityProcess/asar:** iniciar, cancelar, terminar e reabrir o processo a partir do layout empacotado. Até passar, não prometer cancelamento nem pacote funcional.
4. **Gate Windows:** verificar executável, caminhos Unicode/espaços, binding nativo, `userData` e logs. Até passar, o artefato é somente de laboratório.
5. **Gate de distribuição:** definir assinatura e formato de entrega antes da publicação. Atualização automática é opcional e exige validação própria se adotada. Não bloqueia a primeira fatia local.

### Validações posteriores, não pré-requisitos da primeira prova

- Confirmação no jogo vivo dos registros e mecânicas que as Frentes 1 e 2 classificarem como pendentes.
- Party/PC atualizados em toda execução, monitoramento, polling e importação automática em background.
- Política da IA RCT, busca de batalha completa, otimização conjunta de seis builds, duplas, Tera/Dynamax/Z e novas mecânicas.
- Benchmark em máquina-alvo com Minecraft aberto, múltiplas janelas, WAL e cache quente/frio.
- Assinatura pública, distribuição, atualização automática, crash reporting e recuperação de versão.

### Sequência operacional necessária

1. Revisão cruzada de 01/02/03 concluída; conservar os nomes e estados aprovados de snapshot/procedência, disponibilidade, evidência/horizonte e frescor.
2. Adaptador offline snapshot → contrato → comparação concluído sem UI/persistência; não ampliar o recorte mecânico antes da prova desktop.
3. Executar o spike isolado já preparado com fixture versionado: janela local, preload allowlistado, `UtilityProcess` e teste de resultado obsoleto/cancelamento. Não usar save nem runtime externo.
4. Testar Node embutido, resolução do runtime revisado e SQLite nativo no mesmo spike. Se falhar, ajustar a fronteira ou reduzir a cobertura; não mascarar com dependência global.
5. Implementar a primeira fatia somente com o caminho que passou: importar snapshot → selecionar indivíduo → salvar planejada → executar análise suportada → exibir evidência/limitação → restaurar.
6. Empacotar para Windows e executar os gates de artefato. Só depois decidir assinatura/distribuição.
7. Somente após os gates locais, confrontar resultados com confirmação viva e ampliar cobertura mecânica.

## Critérios de passagem desta frente

O aceite do produto futuro exige os itens abaixo. A consolidação documental pode registrar gates pendentes; não depende de construir/abrir o app nesta tarefa:

- os relatórios 01/02/03 foram lidos em conjunto e conflitos foram resolvidos ou encaminhados ao usuário;
- o primeiro slice e seus estados de validação não prometem mais que a cobertura do núcleo;
- IPC, preload, main e cálculo têm fronteiras testáveis, com cancelamento e descarte de resultado obsoleto;
- schema, hash, migração e exportação preservam a distinção entre observado e planejado;
- o runtime embarcado não executa código arbitrário de mods nem recebe paths livres do usuário;
- o pacote Windows abre, encontra o UtilityProcess, carrega o SQLite nativo e escreve apenas em `userData`;
- testes sintéticos, reconstrução offline e confirmação viva aparecem separados nos relatórios;
- desempenho sem/com Minecraft foi medido ou explicitamente marcado como pendente, sem metas inventadas.

## Revisão cruzada — resultado final

O relatório [02-MOTOR-EVIDENCIAS.md](02-MOTOR-EVIDENCIAS.md) foi lido. O resultado é aceito para o recorte estrutural offline, não para compatibilidade mecânica, cobertura completa ou recomendação global.

Verificação independente desta integração, sem save/servidor/jogo e sem instalação:

- a versão final tem **27 testes** do comparador; a entrega anterior de 24 foi substituída;
- a execução conjunta final de `compare-evidence.test.cjs` e `preflight-contracts.test.cjs` passou **40/40 em uma execução independente após os fixes** (27 + 13), substituindo o resultado anterior de 37. Executar juntas não conecta suas APIs;
- `node --check` passou em `src/compare-evidence.cjs`, `test/compare-evidence.test.cjs`, `fixtures/comparison-cases.cjs` e `src/test/fixtures/evidence-real-calculation.cjs`;
- o fixture da ponte real offline importa `@smogon/calc` por caminho relativo estável; o caminho resolve para o diretório existente em `experiments/cobblemon-compatibility/node_modules/@smogon/calc`, cujo `package.json` local informa a versão `0.11.0`;
- `npm run test:comparison` não foi usado como prova: a tentativa registrada pela Frente 2 falhou antes de iniciar porque o npm do ambiente aponta para um `npm-cli.js` inexistente. Não houve instalação ou reparo.

Os casos novos reforçam dois contratos: (a) transportar horizonte e unidade; comparar cardinalidade apenas quando `actionTraceUnit: turns`, sem contar logs de scenario/search como turnos; (b) preservar disponibilidade de golpe equipado mesmo fora do catálogo, sem promover golpe novo desconhecido. `completeCoverage` continua declaração do produtor; a UI precisa expor o recorte.

O comparador final passou no recorte revisado. Os três defeitos da Frente 3 foram corrigidos por Turing e revalidados independentemente: alterar hash de fonte retorna `fresh: false`; getter é rejeitado com zero chamadas; contexto selecionado sem fonte é recusado. Entrada inalterada continua fresca, ordem de chaves não muda digest e contexto não selecionado permite fontes vazias. Arrays esparsos, propriedades extras, símbolos e getter em índice também foram recusados; os dois arquivos alterados passaram novamente em `node --check`. O contrato recebe aceite neste recorte, sem prova de integração fim a fim. Histórico e resultados em [PRONTIDAO.md](PRONTIDAO.md). CASOS-COMPARACAO permanece sincronizado para 27.

A Frente 1 atualizou somente metadados de packs (35/13). O snapshot de indivíduos continua de 09/09, com 68 indivíduos. Hashes/sintaxe relatados por Laplace não foram somados aos testes funcionais. O código final do parser foi inspecionado e passou sintaxe; nenhuma nova captura do mundo foi executada pelo integrador.

## Fontes oficiais consultadas

- [Electron — Security](https://www.electronjs.org/docs/latest/tutorial/security): isolamento, sandbox, CSP, navegação limitada, validação de remetentes IPC e evitar APIs privilegiadas expostas.
- [Electron — Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation): `contextBridge` e risco de expor APIs IPC genéricas.
- [Electron — Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) e [Utility Process](https://www.electronjs.org/docs/latest/api/utility-process): separação main/renderer e processo para trabalho CPU-intensive/crash-prone.
- [Electron — Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution) e [Distribution Overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview): empacotamento, assinatura e distribuição.
- [Vite — Building for Production](https://vite.dev/guide/build): build de produção; o comando não substitui o ensaio do executável Electron.
- [SQLite — Appropriate Uses](https://www.sqlite.org/whentouse.html), [Application File Format](https://www.sqlite.org/appfileformat.html) e [WAL](https://www.sqlite.org/wal.html): adequação local, backup/formato e limites de concorrência/checkpoint.

## Estado da consolidação

A consolidação das três frentes e o adaptador offline estão concluídos no recorte documentado em [PRONTIDAO.md](PRONTIDAO.md). A prova desktop real passou em Electron 44.4.3 / Windows x64, código 0, sem processos restantes. Cancelamento/timeout foram exercitados com timer e, no complemento de 20/09, interrompendo carga síncrona isolada por kill do utilityProcess, com saída e recuperação comprovadas. Persistência, Windows empacotado, benchmarks e compatibilidade viva permanecem sem validação. Próximo gate do plano: primeira fatia local, em trabalho separado. Leitura local segura já está autorizada; instrumentação/reload/mutação de servidor exige autorização específica.
