# Visão do produto: guia de progressão

Aprovada em 05/10/2026 (Issue #87). Este documento descreve para onde o app vai; não descreve o que já está implementado. O estado atual está em [`GUIA-TECNICO.md`](GUIA-TECNICO.md) e no código. Cada entrega do roadmap só vale como implementada quando sua Issue for fechada por um PR.

## 1. Visão

O Companion vira um **guia de progressão** para a campanha Radical Red (RCT) no All the Mons. Ele lê party e PC sozinho, entende em que ponto da campanha o jogador está e responde, nesta ordem:

1. **Qual é o próximo objetivo?** O próximo líder RCT da série, ou PvE geral quando não houver líder ao alcance.
2. **Com que time eu vou?** Um time de 6 montado a partir dos indivíduos que o jogador já tem (party + PC), para aquele objetivo. Para cada membro: golpes já conhecidos, item sugerido e golpes a adquirir, com a explicação de cada escolha.
3. **Como eu venço esse líder?** Plano de batalha confronto a confronto (v2).
4. **O que eu faço até lá?** Capturas que fecham lacunas do time, evoluções e treino até o level cap (v3).

A tela **Guia** passa a ser a tela inicial. Equipe, PC, ficha e Dano continuam como telas de apoio e de conferência.

## 2. Princípios que continuam valendo

A visão muda o produto, não as regras de honestidade e segurança do projeto:

- **Local e somente leitura.** O app lê arquivos do jogo e o save; nunca grava no save, não envia comandos ao servidor, não executa scripts de mods e não usa rede durante o uso. Ver [`CLAUDE.md`](../CLAUDE.md).
- **Fail-closed.** Espécie, forma, golpe, habilidade ou mecânica fora do catálogo validado bloqueia a parte da recomendação que depende dela, com o motivo. Nada é preenchido por semelhança (D10).
- **Disponibilidade por indivíduo (D03).** Golpe conhecido vem de `MoveSet`/`BenchedMoves` do UUID. Golpe do learnset da espécie é “a adquirir”, com a rota (nível, TM, tutor, ovo), e nunca é tratado como disponível.
- **Explicação vinculada à evidência.** Cada escolha do time e do plano mostra o fato que a sustenta (tipo, dano calculado, velocidade, risco declarado na definição do líder). Sem LLM (D01).
- **Sem promessa de vitória.** Recomendação é contextual ao objetivo e declara hipóteses (HP/PP cheios, sem status, IA não modelada). Não existe “melhor time universal”.
- **Desconhecido é resultado válido.** Dado não capturado (item segurado `null`, IV/EV ausente, amizade, inventário) aparece como “não verificado”, nunca como satisfeito.

## 3. Roadmap

### v1 — Guia com time de 6 por objetivo

| Entrega | O que muda para o jogador |
|---|---|
| UX de seleção corrigida | Escolher indivíduo, golpe e slot sem atrito antes de construir o guia em cima dessas telas. O problema exato fica na Issue própria. |
| Dados: learnsets, evoluções e treinadores RCT | Base para “golpes a adquirir”, evoluções e objetivos. Gerados por script a partir dos arquivos do jogo, versionados e testados, como o catálogo de compatibilidade. |
| Motor de time de 6 por objetivo | Escolhe 6 indivíduos de party + PC para PvE geral ou para um líder RCT; para cada um, golpes conhecidos, item sugerido e golpes a adquirir, com explicações. |
| Monitoramento do save | O app percebe mudanças em party/PC e relê sozinho, com as mesmas garantias da leitura manual (read-only, hashes, invalidação do estado derivado). |
| Próximo objetivo sugerido | A partir da progressão do RCT, sugere o próximo líder e explica por quê. |
| Tela Guia como inicial | Objetivo, time de 6 e explicações na primeira tela. |

Fontes de dados já conferidas no modpack em 05/10/2026 (só arquivos do jogo):

- **Learnsets e evoluções:** `data/cobblemon/species/**` do JAR do Cobblemon 1.7.3 (1037 arquivos), mais `species_additions` de outros mods e de `kubejs/data/cobblemon/`. O campo `moves` usa os prefixos nível (`25:golpe`), `tm`, `tutor`, `egg`, `legacy`, `special` e `form_change`; `evolutions` usa as variantes `level_up`, `item_interact` e `trade`, com requisitos como nível, amizade, item segurado, horário, bioma e golpe conhecido. A elegibilidade por TM/tutor/ovo passa pelo SimpleTMs (`config/simpletms/main.json`, ver [`DECISOES.md`](DECISOES.md)).
- **Treinadores RCT:** `rctmod-neoforge-1.21.1-0.18.1-beta.jar`, `data/rctmod/trainers/<id>.json` (time, bolsa, `battleRules`, IA, `battleFormat`) e `data/rctmod/mobs/trainers/single/<id>.json` (`type`, `series`, `requiredDefeats`, `signatureItem`); séries em `data/rctmod/series/` (`radicalred.json`). O modpack acrescenta 143 arquivos em `kubejs/data/rctmod/` (séries `atm_team` e `contentcreators`).
- **Level cap:** `config/rctmod-server.toml` (`initialLevelCap=15`, `allowOverLeveling=false`). A regra de subida do cap precisa ser confirmada no RCT, não inferida desse arquivo.

Pontos da v1 que dependem de decisão antes do código:

- **Progresso do jogador no RCT.** Saber que treinadores o jogador já derrotou exige ler um arquivo do save que o importador não lê hoje. Isso é leitura nova do save e precisa de autorização explícita do dono do projeto; a alternativa é o jogador informar o progresso na tela.
- **Item sugerido sem inventário.** Leitura de inventário está fora (seção 4). O item aparece como sugestão, com o aviso de que o app não sabe se o jogador o tem.
- **PvE geral.** Usa adversários de referência versionados próximos do estágio do jogador (ver [`PLANO.md`](PLANO.md) §2); a composição é hipótese de avaliação, não distribuição observada de encontros.
- **Líderes em dupla.** Treinadores com `battleFormat: GEN_9_DOUBLES` (ex.: `boss_giovanni_0045`, `elite_four_lorelei_004d`) aparecem como objetivo “fora do escopo”, sem time recomendado.

### v2 — Plano de batalha contra o líder

| Função | Proposta |
|---|---|
| Plano de batalha contra o líder RCT escolhido: lead, respondedor e golpe por adversário, dano nos dois sentidos, ordem de ação e riscos declarados (Sturdy, Custap, Berry Juice, bolsa × `maxItemUses`, terreno, Mega). Só singles. | [#88](https://github.com/mitomaniaco/cobblemon-companion/issues/88) |

### v3 — Capturas, evoluções e treino

| Função | Proposta |
|---|---|
| Capturas recomendadas para fechar lacunas do time: espécie, bioma, nível, raridade e se a regra de captura do modpack libera agora. | [#89](https://github.com/mitomaniaco/cobblemon-companion/issues/89) |
| Evoluções do time: requisitos, alcance dentro do level cap e golpes ganhos ou perdidos ao evoluir. | [#90](https://github.com/mitomaniaco/cobblemon-companion/issues/90) |
| Treino até o level cap: golpes que chegam no caminho e EVs coerentes com o papel no time. | [#91](https://github.com/mitomaniaco/cobblemon-companion/issues/91) |

As propostas têm label `proposta` e só viram trabalho quando o revisor trocar a label para `feature`/`enhancement`. Cada uma traz dados necessários, fonte no modpack, esforço e critério de aceite.

## 4. Fora do escopo até nova decisão

- **Simulação de batalha.** Nem turno a turno, nem probabilidade de vitória, nem IA do RCT. O plano da v2 é confronto a confronto, com sequências curtas só onde a mecânica exige e o adaptador suporta.
- **Duplas.** Treinador em dupla é mostrado como fora do escopo, nunca avaliado como singles (D06).
- **Leitura de inventário.** Itens, Poké Balls, TMs e vitaminas da bolsa do jogador não são lidos; o app sugere e avisa que não verificou a posse.

## 5. Decisões anteriores revisadas por esta visão

Registradas também em [`DECISOES.md`](DECISOES.md) (D12–D14).

| Antes | Agora |
|---|---|
| D05: um Pokémon por vez, resto da party fixo; [`PLANO.md`](PLANO.md) §2 excluía otimizar seis builds. | Time de 6 por objetivo, escolhido em party + PC. Continua sem prometer ótimo global: o motor explica por que cada membro entrou. |
| `PLANO.md` §2 e `GUIA-TECNICO.md` §1: sem monitoramento nem polling do save. | Monitoramento read-only de party/PC na v1, com as garantias da leitura manual. |
| `PLANO.md` §2 excluía recomendação de capturas. | Capturas recomendadas na v3 (#89). |

Continuam valendo: D01 (sem LLM, foco Radical Red), D02/D11 (compatibilidade antes de números), D03, D06 (singles), D10 e o limite de não simular a batalha inteira.
