# Revisão independente limitada do adaptador offline

Fechamento da revalidação independente: 20/09/2026. **APROVADO NO RECORTE**, com R-01/R-02/R-03 encerrados. A revalidação não usou agentes, app, Electron, jogo, servidor ou alterações de save. A prova desktop posterior foi preparada separadamente; sua continuação passou em Electron 44.4.3 real, conforme PROVA-DESKTOP.md; isso não reexecuta esta baseline.

## Aceite independente vigente

Executada novamente a suíte conjunta: **51/51 (27 comparador + 13 contrato + 11 adaptador), zero falhas e zero skips**. `node --check` passou no adaptador e no teste. As contagens abaixo de 47 são históricas.

Contraexemplos originais reexecutados separadamente em memória: SpD do alvo 0→252 muda dano 50→32 e retorna `fresh:false` para a referência antiga tanto em `assessOfflineFreshness` quanto no checker genérico contra o bundle novo; mudança de locks também invalida. Entrada inalterada e referência nova contra entrada nova retornam `fresh:true`. IV nulo do atacante, IV 999 do alvo e Choice Specs planejado foram rejeitados. Controles legítimos de IV 0/31, EV 0/252 e total 510, item de plano ausente/nulo, desconhecidos condicionais, determinismo e não mutação passaram. A suíte também cobre ausência, strings, frações e limites inválidos de IV/EV em ambos os lados, além de fontes/contexto/build e reordenação de chaves.

O caminho consumidor foi inspecionado: `adaptOfflineComparison` obtém `analysisRef` do bundle com a fonte derivada e chama `assessOfflineFreshness(analysisRef, input)`. Essa função reconstrói a fonte da requisição atual antes de delegar ao checker genérico. Portanto, alvo/locks não ficam fora da referência nem dependem de um digest fornecido pelo chamador. O uso genérico remanescente nos testes examina bundles completos; não substitui o caminho público.

Integração genuína e conclusões limitadas ao primeiro golpe/roll mínimo confirmadas. A fixture permanece `condicional`, sem preferência incondicional ou certificação viva. Prova desktop posterior executada e aprovada no recorte, registrada em experiments/cobblemon-desktop-proof (`experiments/cobblemon-desktop-proof/PROVA-DESKTOP.md`). Nesta revalidação o runtime Electron ficou fora; o relatório da prova distingue os bloqueios históricos da execução real posterior aprovada.

O restante registra a correção do implementador e o histórico da revisão bloqueada; seus estados pendentes foram encerrados pelo aceite acima.

## Correção delimitada de R-01/R-02/R-03 — 20/09/2026

- **R-01:** a requisição completa de cálculo e a versão do adaptador geram uma fonte derivada `memory:offline-adapter/calculation-request-v2`, com SHA-256 do JSON de chaves ordenadas e tamanho UTF-8. É uma declaração em memória, não arquivo do jogo. Essa fonte entra no envelope v1, cujo digest já cobre fontes, contexto, snapshot, observado e plano. IDs/caminhos reservados são recusados. `assessOfflineFreshness(reference, input)` reconstrói essa fonte da mesma entrada aceita pelo adaptador, sem calcular dano; `assessFreshness` também invalida a referência contra o novo bundle produzido. Não reutilizar um bundle antigo para avaliar uma requisição modificada. Versão do motor inclui `/adapter-v2`.
- **R-02:** atacante e alvo passam pela mesma validação numérica: IVs inteiros 0–31, EVs inteiros 0–252 e total até 510, nível 1–100. Nulos, ausentes, strings e frações não recebem defaults. Fatos desconhecidos continuam bloqueados quando necessários ao cálculo.
- **R-03:** item planejado não nulo é explicitamente recusado pelo recorte sem item. Item de plano ausente/nulo continua aceito; item observado desconhecido conserva a condição existente.

Resultado desta correção: **51/51 (27 + 13 + 11)**, os 47 anteriores mais quatro testes. Regressões verificam dano 50→32 e referência antiga inválida, alterações de locks/contexto/build/atributos/fontes, entrada inalterada e chaves reordenadas frescas, limites legítimos de IV/EV e rejeição do item planejado. Sintaxe de adaptador e teste aprovada. Comando conjunto permanece o registrado abaixo; sintaxe: `node --check battle-planner/src/offline-adapter.cjs` e `node --check battle-planner/test/offline-adapter.test.cjs`.

Alterados nesta correção: somente adaptador, seu teste, README, PRONTIDAO e este relatório. Contratos-base, comparador e fixture preservados. A skill `sync-project-docs` orientou o registro da decisão de reutilizar o envelope v1 e a distinção entre testes do autor e aceite independente. Próximo gate: revalidar os três casos com o mesmo revisor; suporte mecânico permanece inalterado. O restante deste relatório registra o parecer anterior às correções.

## Integração e recorte

A ligação é real: `adaptOfflineComparison` adapta o indivíduo ao contrato v1, chama `@smogon/calc` 0.11.0 instalado, constrói evidência com os danos calculados e chama `compareEvidence`; a explicação vem desse consumidor. Os danos não são constantes no adaptador. Alterar SpD do alvo muda o resultado, comprovando sensibilidade aos inputs.

O recorte é Gen 9 singles, espécies mapeadas Pikachu/Floatzel, Spark/Thunderbolt no primeiro slot, uma ação, roll mínimo, sem efeitos secundários ou resposta adversária. Os outros slots são preservados; não são avaliados. Não prova moveset completo, turno com duas ações, vitória, party, IA ou equivalência viva. Disponibilidade observada/aprendida, locks, rejeição de mudança fora do primeiro slot, doubles, determinismo e não mutação têm verificações na suíte. Fontes/hash da fixture são declarações sintéticas (`aaaa…`, `bbbb…`, `cccc…`), não hashes verificados dos arquivos reais.

## Correções parciais realizadas nesta revisão

- Versão informada passou a ser lida do manifesto instalado e exigida como 0.11.0.
- Forma diferente de `normal` ou aspectos não vazios são rejeitados.
- Habilidade/item/status/Tera observados conhecidos não nulos são rejeitados conservadoramente; desconhecidos aparecem como condições, conservando os ganhos numéricos e impedindo preferência incondicional. A fixture passa a retornar `condicional`.
- Adicionado digest determinístico da requisição de cálculo, incluindo alvo/locks e digest do bundle; transportado na procedência. **Correção incompleta de frescor**, conforme R-01.
- Regressões incorporadas aos sete testes existentes: unknown stat, habilidade/item conhecidos, forma alternativa, condições e alteração do digest do cálculo. A contagem permanece sete.

## Bloqueios reproduzidos após as correções

**R-01 / P1 — referência de análise não cobre o cálculo completo.** Clonar a fixture, alterar somente `calculation.target.evs.spd = 252` e executar ambas. Thunderbolt mínimo passa de 50 para 32. `calculation.inputDigest` muda, mas `analysisRef.inputDigest` permanece igual. `assessFreshness(a.analysisRef, b.preflight.bundle, {engineVersion: ENGINE_VERSION})` retorna `{fresh:true,reasons:[]}`. O alvo está fora do envelope v1 e o digest novo não é consumido pela verificação de frescor. É uma lacuna na fronteira entre requisição e referência; não foi reimplementado o contrato nesta revisão. Passagem: mudança de alvo ou lock deve invalidar a referência da análise pelo caminho público efetivamente usado, com controle de entrada inalterada.

**R-02 / P1 — stats inválidos chegam ao calculador.** Em cópias independentes da fixture: `player.individuals[0].observed.ivs.spa = null` foi aceito e produziu Thunderbolt mínimo 38; `calculation.target.ivs.spd = 999` foi aceito e produziu mínimo 8. Ambos retornaram `condicional`, sem bloqueio do input inválido. `knownFact` apenas extrai valores; o contrato valida fatos, não limites físicos de IV/EV. Passagem: validar valores relevantes de atacante e alvo antes do cálculo, sem defaults/coerções silenciosos.

**R-03 / P1 — item planejado ignorado.** Definir `player.individuals[0].planned.item = {id:'cobblemon:choice_specs',access:{status:'acquirable-now',route:'fixture',evidenceIds:['fixture-snapshot']}}` é aceito; Thunderbolt permanece 50. A checagem nova inspeciona apenas o item observado. Passagem: rejeitar plano com item fora do recorte sem item, sem implementar a mecânica.

Os contraexemplos acima foram executados em memória, separados dos 47 testes. Não são regressões já resolvidas. O parecer para aqui devido à lacuna estrutural R-01; ajustes parciais foram preservados para revisão.

## Testes realmente executados

Na etapa anterior da mesma revisão: suíte original 47/47; após ajustes parciais, 47/47. Na retomada de 20/09, nova execução direta:

```text
node --test battle-planner/test/compare-evidence.test.cjs battle-planner/test/preflight-contracts.test.cjs battle-planner/test/offline-adapter.test.cjs
47 testes; 47 pass; 0 fail; 0 skipped
```

Distribuição: 27 comparador + 13 contrato + 7 adaptador. O teste de digest adicional verifica mudança de hash, mas não invalidação da referência antiga: por isso a bateria verde não resolve R-01. Não foi executada a suíte `core`, que importa save.

## Arquivos e próximo gate

Alterados nesta revisão: `battle-planner/src/offline-adapter.cjs`, `battle-planner/test/offline-adapter.test.cjs`, `battle-planner/README.md`, `docs/cobblemon-companion/preflight/PRONTIDAO.md` e este relatório. A fixture foi lida e preservada. A skill `sync-project-docs` orientou a atualização do estado vigente e a distinção entre resultados históricos e aceite atual.

Próximo gate: decidir a ligação entre requisição completa e referência de análise, corrigir R-01/R-02/R-03 e executar regressões mais a suíte conjunta. Prova desktop permanece posterior. Nenhuma funcionalidade futura é exigida para resolver esses bloqueios.
