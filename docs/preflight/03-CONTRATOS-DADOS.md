# Frente 3 — contratos e segurança dos dados

Data: 19/09/2026. Escopo: preparar os contratos antes do app, sem iniciar interface, banco, servidor, jogo ou captura viva.

Estado: **contrato proposto v1 e prova isolada implementados; integração com a captura, import/export persistente, backup/migração e confirmação viva ainda pendentes**.

## Resumo executivo

O bloqueio principal não é falta de um schema JSON. É a possibilidade de uma análise antiga ou parcialmente conhecida ser apresentada como estado atual e utilizável. O snapshot disponível em `battle-planner/output/snapshot.json` foi gerado em 09/09/2026, tem 68 indivíduos — seis na party e 62 no PC — e declara `offline-static-profile; registros dinamicos do servidor nao capturados`. Ele é evidência de reconstrução offline, não confirmação do jogo vivo.

O núcleo atual já faz três coisas importantes: lê arquivos sem escrever neles, mantém UUIDs distintos e preserva party/PC completos. Ainda não há, porém, um contrato comum que obrigue cada valor a dizer se foi observado, desconhecido ou conflitante; que separe uma build planejada do estado observado; que prove a disponibilidade de um golpe por indivíduo; ou que invalide resultados antigos quando a entrada muda.

A entrega desta frente é deliberadamente menor que um app:

- `battle-planner/src/preflight-contracts.cjs` valida um envelope JSON versionado, limitado e sem conteúdo executável; calcula um digest de entrada; registra disponibilidade por indivíduo; e avalia frescor de referências de análise.
- `battle-planner/test/preflight-contracts.test.cjs` contém treze casos sintéticos, todos aprovados na execução isolada; os três últimos são regressões independentes da revisão cruzada de Mill.
- Este documento diferencia o que foi implementado do que continua apenas proposto.

Nada nesta entrega confirma registros em memória do servidor, legalidade universal de golpes, mecânicas de batalha ou o snapshot de 09/09/2026 como atual.

## Correções da revisão independente de Mill

Mill reproduziu três falhas concretas no contrato v1. As correções ficaram restritas ao validador, à sua suíte e a este relatório.

| ID | Causa demonstrada | Correção | Regressão independente |
|---|---|---|---|
| C-01 | `computeInputDigest` incluía snapshot, contexto, jogador e política, mas omitia `sources`; trocar somente o SHA-256 de uma fonte mantinha `fresh: true`. | O digest agora inclui o manifesto completo `sources`, mantendo ordenação determinística das chaves. | Altera apenas `sources[0].sha256` e exige `fresh: false` com `input-digest-mismatch`. |
| C-02 | `jsonValue` acessava `value[name]` antes da serialização. Um getter enumerável foi executado quatro vezes. | A fronteira inspeciona descritores próprios antes de ler valores; rejeita accessors, propriedades não enumeráveis/símbolos e arrays esparsos ou com propriedades extras. O getter não é executado. | Instala getter em `exportId`, exige rejeição por accessor e `calls === 0`. |
| C-03 | `context.sourceIds` aceitava `min: 0` mesmo com `state: selected`. | O mínimo passa a ser 1 para contexto selecionado e permanece 0 para contexto não selecionado. | Remove todas as fontes de um contexto selecionado e exige rejeição. |

Os três casos são sintéticos e exercitam a API em memória; não simulam servidor, migração ou captura viva.

## Achados priorizados

| Prioridade | Achado e evidência | Consequência | Passagem exigida |
|---|---|---|---|
| P0 | O snapshot existente é antigo, offline e não captura registros dinâmicos. A própria captura grava essa limitação em `compatibility`. | Não pode alimentar uma recomendação “atual” sem uma nova captura autorizada após salvar/reconectar. | Captura nova identificada como viva ou offline, com instante, fontes e hashes; divergências reabrem a análise afetada. |
| P0 | `normalizeIndividual` preserva `equipped`/`benched`, mas usa `null`, `''` e defaults para representar ausência. Ex.: `p.Status||null`, `HeldItem` vazio e EV ausente convertido para `0`. | “Sem status”, “não capturado” e “zero observado” podem ser confundidos. | Todo campo relevante deve ser `known`, `unknown` ou `conflict`, com procedência. |
| P0 | A captura tem hashes e leituras estáveis por arquivo, mas não registra um digest formal do conjunto nem garante visão atômica de todos os recursos lidos. Depois só rechecava estabilidade dos três arquivos do jogador. | Um relatório pode misturar fontes de instantes diferentes ou sobreviver a uma atualização relevante. | Snapshot com `id`, espécie de captura, completude, atomicidade declarada, fontes hashadas e revisão do estado do jogador; análise deve ficar stale em qualquer mudança relevante. |
| P1 | A disponibilidade atual é representada apenas por golpes equipados e benched. Não há estado por indivíduo para “adquirível agora”, “futuro” ou “desconhecido”, nem prova de posse de TM/item. | Uma recomendação futura pode competir indevidamente com uma mudança executável agora. | Cada candidato planejado declara `equipped`, `learned`, `acquirable-now`, `future`, `unknown` ou `unavailable`, rota, requisitos e evidência. |
| P1 | A identidade atual já usa UUID e forma, mas o validador do núcleo aceita uma lista NBT de quatro inteiros sem exigir UUID canônico, e o output não valida ocupação de slot como contrato. | Duplicata, forma ambígua ou arquivo inconsistente podem contaminar o inventário. | UUID canônico, espécie/forma/aspectos, localização única e fonte de identidade obrigatórios. |
| P1 | `schemaVersion: 1` aparece nos outputs, mas não existe importador geral, round-trip versionado, migração ou teste de restauração. `showdown.txt` é exportação de sets, não backup do estado. | Não há recuperação confiável nem regra para rejeitar versões futuras. | Import rejeita versão desconhecida; migrações explícitas e testadas; export aberto preserva observados, planos, fontes e limitações. |
| P1 | O armazenamento SQLite foi decidido no plano, mas ainda não existe. Não há backup, retenção, restauração ou migração implementados. | Não é seguro declarar a persistência pronta assumindo que cópia de arquivo basta. Isso não bloqueia iniciar módulos do app que não dependam de persistência. | Definir política e testar backup/restauração antes de declarar a etapa de confiabilidade concluída. |
| P2 | A captura e o núcleo já impõem alguns limites: NBT aninhado/listas, entradas ZIP e fontes são limitados em partes diferentes. O contrato novo precisa ser a fronteira única de JSON. | Limites diferentes podem produzir falhas inconsistentes ou payloads excessivos. | Aplicar o contrato antes de persistir ou enviar dados à análise; manter limites documentados e testes de rejeição. |

Evidência quantitativa do output datado: 48 dos 68 indivíduos aparecem sem item segurado e 61 com `savedStatus: null`; isso não prova que 48 não têm item nem que 61 estados foram observados como “sem status”, porque a normalização atual não distingue ausência capturada de valor nulo conhecido. Há espécies repetidas (Salazzle, Nidorino, Toxtricity e Duraludon), confirmando por dados que espécie não é identidade.

## Contrato proposto v1

O envelope aceito pelo validador tem as partes abaixo. O formato usa JSON puro; scripts, funções, acessores, objetos cíclicos, protótipos especiais e valores não finitos são rejeitados. O limite atual da prova é 5 MiB, profundidade 32, 2.048 itens por array, 128 chaves por objeto, 10.000 indivíduos e 128 golpes learned/benched por indivíduo. Esses números são limites de entrada do contrato, não limites do jogo.

```text
format, schemaVersion, exportId, createdAt
sources[]
snapshot
context
player
policy
```

### Envelope, fontes e snapshot

- `format` é `cobblemon-companion/preflight` e `schemaVersion` é `1`. Versões futuras não são aceitas por fallback silencioso.
- Cada `source` tem `id`, categoria, caminho, tamanho, instante, sensibilidade e SHA-256 do conteúdo. O hash identifica o bytes observado; não certifica a mecânica que um script executaria.
- `snapshot.kind` é obrigatório: `live-capture`, `offline-reconstruction` ou `synthetic-fixture`. Essa distinção acompanha todos os relatórios.
- `snapshot.completeness` é `complete` ou `partial`; `atomicity` é `atomic`, `best-effort` ou `unknown`. O contrato não transforma `best-effort` em atômico.
- `snapshot.fingerprint` é SHA-256 do fingerprint do snapshot, e `sourceIds` lista explicitamente as fontes que o sustentam.
- `context.state` é `selected` ou `unselected`. Se não houver encontro escolhido, `trainerId` e `levelCap` devem ser `null`; o contrato não permite um Giovanni implícito. Em contexto selecionado, treinador, cap, tipos permitidos e fontes da regra são obrigatórios.

### Identidade e disponibilidade por indivíduo

Cada entrada de `player.individuals` exige:

- `identity.uuid` canônico, `speciesId` namespaced, `formId`, `aspects` e fonte da identidade;
- `location` única: party/slot ou PC/box/slot;
- `observed`, que contém somente fatos do indivíduo capturado;
- `planned`, que contém somente a build pretendida (`none` ou `draft`).

`observed` exige explicitamente nível, nature original/mintada, habilidade, item, amizade, HP/status salvo, Tera Type, IVs e EVs. Cada valor usa:

- `known` + `value` + `provenance`;
- `unknown` + `reason` + `provenance`;
- `conflict` + motivo + pelo menos dois candidatos preservados.

`null` só é válido dentro de `known` quando o valor nulo tem significado confirmado, por exemplo item realmente ausente ou status realmente ausente. Um campo não fornecido deve ser `unknown`, não `null`, `''` ou zero por conveniência.

Moves observados distinguem `equipped` de `learned`; o primeiro tem no máximo quatro e exige PP/PP Ups explícitos ou desconhecidos. O segundo não substitui o golpe equipado. Os IDs são namespaced e cada entrada aponta sua fonte.

Uma build `planned` não altera `observed`. Cada golpe e item planejado declara um acesso:

| Estado | Pode entrar em “usar agora”? | Exigência mínima |
|---|---:|---|
| `equipped` | sim | O golpe/item deve estar observado nesse indivíduo. |
| `learned` | sim | O golpe deve estar observado como conhecido nesse indivíduo. |
| `acquirable-now` | sim | Rota não vazia e `evidenceIds` de fontes declaradas não vazios; posse não é inventada. |
| `future` | não | Requisitos futuros explícitos. |
| `unknown` | não | Motivo da incerteza explícito. |
| `unavailable` | não | Motivo do bloqueio explícito. |

O validador não decide se uma TM ou tutor realmente está acessível no jogo; ele impede que essa decisão seja omitida. Essa resolução requer evidência de progressão/inventário que ainda não existe no contrato do núcleo.

### Invalidação de análises

Uma análise v1 referencia `snapshotId`, `playerRevision`, `inputDigest`, `engineVersion` e `policyVersion`. `assessFreshness` retorna `fresh: false` com razões explícitas quando qualquer um diverge. Isso cobre:

- troca de save/PC/party ou mudança na revisão do jogador;
- mudança de fontes ou do contexto do encontro;
- mudança da política de avaliação;
- mudança do motor/versão declarada.

O digest é determinístico sobre `sources`, `snapshot`, `context`, `player` e `policy`; ele é uma trava de frescor, não uma prova de que os valores físicos estão corretos.

## Implementado nesta frente versus ainda proposto

| Área | Implementado agora | Ainda não implementado/confirmado |
|---|---|---|
| Validação de JSON | Validador puro com schema v1, limites, campos desconhecidos rejeitados, ciclos/funções/números inválidos rejeitados. | Aplicação na fronteira real da captura, CLI ou futura ponte do app. |
| Identidade | UUID canônico, forma/aspectos, fonte, slot único e duplicatas rejeitados no fixture. | Adaptar o output existente para emitir esse envelope sem perder formas/IDs reais. |
| Observado versus planejado | Dois ramos obrigatórios no indivíduo; plano não muta o observado. | UI, persistência e reconciliação com uma edição real do jogador. |
| Desconhecido/conflito | Fatos com estado explícito e procedência; `null` ambíguo rejeitado. | Reclassificar todos os campos capturados pelo núcleo atual. |
| Disponibilidade | Estados por golpe/item, rota, requisitos e evidências; plano indisponível não é `usableNow`. | Consultar progresso, inventário ou rotas reais; posse de TM/item continua desconhecida. |
| Procedência | Fonte hashada e referência por campo/fato no contrato. | Procedência por campo na captura atual; hoje ela é sobretudo por arquivo/recurso. |
| Snapshot | `kind`, completude, atomicidade, fontes e fingerprint no contrato; digest de input para análise. | Snapshot atômico vivo, comparação de duas leituras e captura de registros em memória. |
| Invalidação | `makeAnalysisRef`/`assessFreshness` puros e testados. | Integrar invalidade a cache, relatórios e qualquer armazenamento. |
| Import/export | Contrato de importação validável e versão única. | Gravador, round-trip de export aberto, migrações e rejeição operacional de arquivos futuros. |
| Backups/migrações | Decisão e plano abaixo; nenhum arquivo de banco criado. | SQLite, cópia consistente, restauração e migração executadas/testadas. |

## Backup e migração — proposta, não entrega

O plano existente escolhe SQLite, mas não autoriza criar o banco nesta frente. Quando a persistência for iniciada, a política mínima proposta é:

1. antes de alterar schema, criar backup imutável do banco e export aberto validado; guardar hash, versão do schema, data e versão da aplicação;
2. fazer migração em transação, de uma versão para a seguinte, sem apagar campos desconhecidos silenciosamente;
3. validar integridade, importar o export para uma base temporária e comparar contagens/UUIDs/builds antes de substituir a base ativa;
4. se qualquer passo falhar, manter a base anterior e restaurar somente após uma verificação explícita; nunca alterar o save do jogo como parte desse processo;
5. testar restauração em caminho separado e registrar quais campos foram preservados, desconhecidos ou migrados;
6. rejeitar versões de export mais novas que o app, em vez de tentar “melhorar” o JSON por heurística.

Para SQLite, a documentação primária recomenda a Online Backup API para obter uma cópia consistente de uma base viva e descreve `PRAGMA user_version` como o inteiro disponível à aplicação para versionar o schema. `schema_version` é controlado pelo próprio SQLite e não deve ser usado como contador de migração da aplicação. Ver [SQLite Online Backup API](https://www.sqlite.org/backup.html), [PRAGMA user_version/schema_version](https://www.sqlite.org/pragma.html) e [formato de arquivo SQLite](https://sqlite.org/fileformat.html).

Decisões ainda necessárias do usuário: diretório/quantidade de backups retidos, se exports compartilháveis devem sempre redigir caminhos absolutos e UUID do jogador, e se uma restauração deve exigir confirmação manual antes de substituir a base ativa. Minha recomendação provisória é manter pelo menos três backups locais rotacionados, export privado por padrão e restauração para arquivo temporário antes de qualquer substituição.

## Segurança de dados e limites

- O contrato não executa scripts encontrados em mods, não abre URL, não desserializa classes e não aceita callbacks. Scripts podem ser evidência externa do perfil, mas ficam fora deste envelope de fatos.
- Fontes de save são marcadas `private`; caminhos absolutos e UUID do jogador são dados sensíveis para exportação. Uma cópia redigida deve substituir o caminho por um identificador estável sem remover o hash necessário à comparação local.
- A captura existente é somente leitura e os testes desta frente usam fixtures em memória. Não foram enviados comandos, não houve instalação, reload, reinício, alteração de save, servidor ou app.
- O SHA-256 identifica bytes e detecta mudança; não demonstra equivalência mecânica. A [documentação do Node sobre crypto](https://nodejs.org/api/crypto.html) descreve `crypto.createHash`/SHA-256 como digest de dados, não como prova de comportamento do código.
- A documentação oficial atual do Cobblemon lista formatos de armazenamento NBT, JSON e MongoDB e um intervalo de salvamento configurável. Portanto, uma futura captura não deve assumir NBT nem “estado salvo” sem registrar formato efetivo e instante. Ver [Configuração oficial do Cobblemon](https://wiki.cobblemon.com/index.php/Config) e [repositório oficial do Cobblemon](https://github.com/Cobblemon-Global/Cobblemon). Essa é referência externa versionável; a instalação local e o save ativo continuam prevalecendo.

## Casos de aceitação e critérios de passagem

### Testes sintéticos — executados

1. Bundle `offline-reconstruction` válido preserva UUID, fonte, forma e conta disponibilidade agora.
2. Aquisição `unknown` não entra em `usableNow`.
3. `acquirable-now` exige rota e evidência; `learned` de golpe não observado é rejeitado.
4. `unknown` é aceito com motivo; `null` cru é rejeitado.
5. UUID duplicado e slot party/PC duplicado são rejeitados.
6. Campo obrigatório ausente, fonte sem SHA-256 e procedência sem fonte são rejeitados.
7. Script/campo desconhecido, ciclo e excesso de golpes não atravessam a importação.
8. A validação devolve cópia isolada e não muta o payload original.
9. Snapshot, revisão do jogador, digest, engine e policy tornam análise stale quando mudam.
10. Contexto não selecionado não pode carregar treinador/cap padrão.
11. Alteração do hash de uma fonte referenciada invalida uma análise com os demais identificadores iguais.
12. Getter enumerável é rejeitado antes da execução (`calls === 0`).
13. Contexto selecionado sem fonte declarada é rejeitado; contexto não selecionado continua válido sem fonte.

Resultado executado em 19/09/2026: `13/13` aprovados em `node --test battle-planner/test/preflight-contracts.test.cjs`. A suíte sintética conjunta com o comparador passou `40/40` (`27 + 13`). É prova sintética do contrato, não prova de compatibilidade do servidor.

### Reconstrução offline — parcialmente demonstrada

- O output de 09/09/2026 comprova leitura offline de 68 indivíduos, UUIDs distintos no processo, party/PC e fontes com hashes.
- A mesma reconstrução não satisfaz o envelope v1: não tem estados `known/unknown/conflict` por campo, `snapshot.kind` formal, fingerprint de input, revisão do jogador, plano separado ou disponibilidade por rota.
- O próximo passo local seguro é um adaptador de normalização que produza o envelope apenas a partir de um snapshot já lido, sem ler o jogo de novo nem alterar os arquivos dos outros agentes. Ele deve marcar como `unknown` o que o output atual não consegue provar, em vez de preencher defaults.

### Confirmação no jogo vivo — pendente e fora desta entrega

A leitura local segura de arquivos existentes já está autorizada no escopo desta campanha: ela deve permanecer somente leitura e não exige nova autorização. O que continua exigindo autorização explícita, antes de qualquer execução, é instrumentação do servidor, instalação de coletor/mod, `reload`, reinício, habilitação de interface, comando administrativo ou qualquer mutação no servidor/save. A validação abaixo trata de uma captura/runtime instrumentada e não deve ser confundida com a leitura local já permitida:

1. confirmar mundo/servidor ativo, formato de storage e salvar/reconectar;
2. obter captura com instante, prontidão, fontes e hashes, sem scripts executáveis no app;
3. verificar que todas as fontes esperadas foram lidas de forma consistente e classificar atomicidade como `atomic` somente com evidência própria;
4. comparar party/PC/UUID/formas e valores observados com o perfil offline;
5. se houver divergência, invalidar apenas o que depende da fonte divergente e repetir os testes mecânicos relevantes;
6. confrontar pelo menos uma amostra de observação de batalha completa — ordem, Speed, HP, item, status, troca e cura — sem usar a ausência de log como prova de ausência do evento.

Até lá, nenhum relatório pode dizer que a party, o catálogo de regras ou a mecânica estão confirmados no jogo vivo.

## Decisões pendentes do usuário

- Se uma captura em runtime for necessária em etapa futura, aprovar separadamente o arquivo, destino, instrumentação, reinício/reload e procedimento exatos antes da execução. A leitura local segura de arquivos já existentes não depende dessa autorização adicional.
- Definir se o export compartilhável deve redigir sempre caminho absoluto, UUID do jogador e nomes de mundo. Recomendação: sim; conservar o export privado completo localmente.
- Definir retenção e local dos backups SQLite. Recomendação: três backups locais rotacionados mais um export aberto por migração. A ausência desse backend não impede iniciar a implementação de módulos não persistentes; impede apenas declarar a persistência/migração pronta.
- Definir se “acquirable-now” pode ser comprovado apenas por regra de aquisição ou se também exige inventário/progressão. Recomendação: regra e rota devem estar confirmadas; posse física continua uma condição separada.
- Definir política para forma desconhecida: recomendo bloquear apenas conclusões que dependam da forma, mantendo o indivíduo visível e explicitando o bloqueio.

## Arquivos e testes

- Implementação: `battle-planner/src/preflight-contracts.cjs`
- Prova: `battle-planner/test/preflight-contracts.test.cjs`
- Evidência examinada: `battle-planner/output/snapshot.json`, `battle-planner/output/analysis.json`, `battle-planner/README.md`
- Núcleo examinado: `battle-planner/src/capture.cjs`, `battle-planner/src/files.cjs`, `battle-planner/src/compare-evidence.cjs`
- Documentos-base: [`PLANO.md`](../PLANO.md), [`DECISOES.md`](../DECISOES.md), [`CAPTURA-DADOS-EFETIVOS.md`](../CAPTURA-DADOS-EFETIVOS.md), [`NUCLEO-BATALHA.md`](../NUCLEO-BATALHA.md)

Testes executados nesta frente: `node --test battle-planner/test/preflight-contracts.test.cjs` — 13 aprovados, incluindo C-01/C-02/C-03; suíte conjunta `node --test battle-planner/test/compare-evidence.test.cjs battle-planner/test/preflight-contracts.test.cjs` — 40 aprovados. `node --check` passou nos dois arquivos desta frente. Não foram executados `analyze`, `search`, a interface, testes que importam o save, nem qualquer comando no jogo/servidor.
