# Frente 2 — confiabilidade do motor de evidências

Data: 19/09/2026  
Estado: **camada pareada e ponte offline aprovadas apenas para o recorte revisado; integração mecânica ampla, recomendação global e confirmação no jogo continuam pendentes.**

## Escopo e segurança

Foram lidos `battle-planner/README.md`, `docs/cobblemon-companion/CASOS-COMPARACAO.md`, a prova local de compatibilidade do calculador, `src/compare-evidence.cjs`, seus fixtures e testes. A análise não iniciou a interface/app, não leu nem alterou save/servidor/jogo, não editou engine, capture, config ou package e não instalou dependências.

O componente auditado é um consumidor puro. Ele não prova que dano, ações, cobertura ou disponibilidade declarados sejam verdadeiros; verifica se estão pareados e completos segundo o contrato recebido.

## Achados priorizados

### P1 — cobertura completa ainda é uma afirmação não verificável pelo consumidor

`scope.completeCoverage` pode ser `true` mesmo quando o produtor forneceu apenas um alvo, uma condição ou uma linha. O consumidor confere que `requiredEvidenceIds` não ficaram faltando e rejeita evidência fora da lista, mas não conhece o conjunto de confrontos que deveria existir. Assim, `preferencia-no-recorte` é seguro como nome de escopo, mas não é certificação de superioridade, vitória ou ranking global.

Decisão: manter a política pareada sem fingir verificação de cobertura. A integração deverá fornecer, em etapa própria, um manifesto de cobertura com alvos, ramos, condições, horizonte e motivo de exclusão. Até lá, qualquer recomendação de produto que dependa de `completeCoverage` deve mostrar a procedência e o recorte.

### P1 — disponibilidade confundia movimento equipado com movimento não adquirido

Defeito reproduzido antes da correção: com o movimento `legacy` em `current.moves` mas ausente de `learnedMoves`, uma alternativa que conservava exatamente o estado equipado recebia `candidate-ineligible` e requisito `not-confirmed-learned`. Isso é incorreto para o caso conservador em que o catálogo está incompleto, mas o movimento está efetivamente equipado no indivíduo observado.

Correção: um movimento do candidato é utilizável agora quando está confirmado em `learnedMoves` **ou** já está equipado em `current.moves`. Um movimento novo que não satisfaz nenhuma dessas condições continua exigindo aquisição não confirmada. O caso C06 cobre a regressão; C01 continua cobrindo a recusa de aquisição desconhecida.

Limite: isso não inventa TM, tutor, item, treinamento ou disponibilidade futura. A confirmação de `learnedMoves` e a captura do indivíduo continuam sendo responsabilidade do produtor da evidência.

### P1 — horizonte e trace de ações não têm unidade universal

A auditoria adicional confirmou que `actions` não representa turnos em todos os consumidores. O `compare-evidence` atual é standalone; `scenario/search` usam estruturas próprias com `trace.turn`, escolhas de jogador/oponente e logs, e não importam este módulo. Portanto, um log com vários eventos por turno ou uma ação de cada lado não pode ser contado como turnos por inferência.

Correção: `scope.actionTraceUnit` é opcional e, quando presente, precisa ser `turns` ou `events`.

- `turns`: cada entrada de `actions` representa exatamente um turno avaliado; o tamanho precisa ser `evaluatedHorizon`.
- `events`: `actions` é um trace descritivo/eventual e pode conter várias entradas por turno, incluindo registros de ambos os lados; não há igualdade automática com o horizonte.
- ausente: unidade desconhecida; não se infere que cada entrada seja turno e não se rejeita cardinalidade por esse motivo.

A regra de horizonte mínimo (`evaluatedHorizon < requiredHorizon`) continua bloqueando conclusão. O consumidor compara os números declarados, mas não descobre nem normaliza sua unidade; o produtor deve declarar no escopo/hipóteses como o horizonte foi medido. O caso adversarial de trilha fora do horizonte agora exige explicitamente `actionTraceUnit: 'turns'`.

Limite: o consumidor ainda não interpreta a semântica das ações/eventos. Uma string é um registro estruturado, não prova de ordem efetiva, dano recebido antes de agir, prioridade, troca, cura, item consumido, multi-hit ou IA.

### P2 — política de ganho não tem limiar material nem pesos

Qualquer ganho finito em métrica declarada, sem perda declarada, pode produzir `preferencia-no-recorte`, ainda que a diferença seja pequena. Isso é conhecido e explícito na política `pairwise-evidence-v1`; não foi transformado em uma “nota” nem em porcentagem de vitória.

Decisão: conservar a política provisória para explicar fatos sem inventar pesos. Antes de ordenar candidatos no produto, definir limiar de benefício, relevância dos alvos e política para conflitos como C03. Ganho em uma métrica omitida pelo produtor continua fora do alcance do consumidor e deve ser tratado como risco de cobertura, não como zero.

## Auditoria por propriedade

| Propriedade | Verificação atual | Resultado honesto |
|---|---|---|
| Disponibilidade | Candidato precisa estar aprendido ou já equipado no `current`; movimento novo desconhecido gera requisito | Corrigido para preservar equipamento observado; não valida aquisição externa |
| Locks | Cada lock precisa estar em `current`; sua remoção torna o candidato inelegível | Protegido; locks são restrições de retenção, não prova de posse de itens |
| Pareamento | `buildId`, snapshot, escopo, indivíduo, estado inicial e horizonte são comparados por igualdade estrutural | Protegido; `target` e `condition` continuam rótulos declarados pelo produtor |
| Cobertura | IDs obrigatórios faltantes, evidência extra, evidência vazia e cobertura parcial bloqueiam | Protegido estruturalmente; completude sem manifesto não é certificada |
| Horizonte | Horizonte avaliado precisa atingir o requerido; tamanho só é comparado quando `actionTraceUnit: 'turns'` | Corrigido sem presumir que logs/eventos sejam turnos |
| Condições | Condições pendentes produzem `condicional`; bloqueios e lacunas produzem `inconclusivo` | Protegido; a verdade semântica da condição não é inferida |
| Ganhos/perdas | Direção `higher/lower`, métricas finitas e cobertura de métricas exata; ganho+perda permanece condicional | Protegido no recorte; sem limiar material |
| Não-superioridade artificial | Estado é `preferencia-no-recorte`, nunca “universalmente superior”; conflitos não recebem peso inventado | Protegido por política e explicação; depende da cobertura declarada |

## Prova isolada: cálculo real → evidência → comparação → explicação

Foi adicionada uma fixture offline usando a dependência local já revisada `@smogon/calc` 0.11.0. O experimento é sintético: Pikachu e Floatzel no nível 20, nature Hardy, IVs 31, EVs 0, geração 9, sem save e sem servidor.

- Spark: 16 rolls de 36–44; no mínimo, Floatzel de 70 HP termina com 34 HP.
- Thunderbolt: 16 rolls de 50–60; no mínimo, Floatzel termina com 20 HP.
- A comparação recebe esses HP restantes, `enemyHP: lower`, horizonte 1 e a evidência `REAL-CALC-E1`.
- A saída é `preferencia-no-recorte`, com o ganho vinculado a `REAL-CALC-E1` na explicação estruturada.

Esta prova confirma a passagem de valores reais do calculador para o contrato de evidência e depois para a explicação. Não confirma precisão, crítico, Speed, prioridade, troca, cura, itens, IA, sequência de batalha, equivalência com o servidor ou qualidade de uma party.

## Testes e resultados

Comando executado a partir de `battle-planner`:

```text
node --test test/compare-evidence.test.cjs
27 testes passaram; 0 falharam.
```

Também passaram `node --check` para os quatro arquivos JavaScript editados/afetados.

Antes das correções, foram reproduzidos os dois defeitos descritos acima. Depois, a bateria cobriu:

- C01: ganho, delta exato e aquisição desconhecida;
- C02: preparação, horizonte curto e resposta fatal;
- C03: ganho e perda sem vencedor artificial;
- C04: manutenção e cobertura interrompida;
- C05: Speed incerta, mecânica não suportada e evidência parcial;
- IDs, snapshots, indivíduo, estado inicial, métricas, valores não finitos, duplicatas, locks e imutabilidade;
- C06: movimento equipado ausente do catálogo;
- trilha fora do horizonte com unidade explícita de turnos, traces de eventos com múltiplas entradas e unidade ausente sem inferência;
- ponte real com `@smogon/calc`.

`npm run test:comparison` também foi tentado, mas o npm do ambiente falhou antes de iniciar qualquer teste porque aponta para `C:\Users\<usuário>\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js`, que não existe. Nenhuma instalação ou reparo foi feito; a execução direta com o Node validou a suíte.

## Arquivos desta frente

- `battle-planner/src/compare-evidence.cjs` — disponibilidade conservadora e validação de tamanho do horizonte.
- `battle-planner/test/compare-evidence.test.cjs` — 24 regressões/contratos isolados.
- `battle-planner/fixtures/comparison-cases.cjs` — caso C06 de movimento equipado fora do catálogo.
- `battle-planner/src/test/fixtures/evidence-real-calculation.cjs` — fixture da ponte offline com calculador local revisado.
- `docs/cobblemon-companion/preflight/02-MOTOR-EVIDENCIAS.md` — este relatório.

## Pendências e critérios de passagem

Esta frente passa somente o contrato estrutural offline. Ainda falta, antes de chamar o recomendador de robusto:

1. produzir evidências a partir de cálculo/motor local real, com procedência, estado inicial, ramo de troca, prioridade, Speed efetiva, dano recebido antes da ação, HP, item, multi-hit, status, crítico, cura e retirada;
2. adicionar manifesto de cobertura verificável e comparar o time completo, não apenas um alvo ou uma semente;
3. validar disponibilidade por indivíduo a partir da captura atual e distinguir movimento equipado, aprendido, TM/item necessário e dado ausente;
4. calibrar horizonte, relevância dos confrontos, limiar material e conflitos multiobjetivo;
5. confrontar uma amostra suficientemente completa com batalha viva/log observável.

Critério de passagem desta frente: a bateria isolada permanece verde, movimentos novos não são promovidos sem disponibilidade, equipamento observado não é perdido por catálogo incompleto, trilhas declaradas como turnos não excedem o horizonte, traces de eventos não são rejeitados por cardinalidade presumida e toda conclusão continua rotulada como recorte/condição. Isso não autoriza iniciar o app nem declarar vitória no jogo.
