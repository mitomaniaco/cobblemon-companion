# Casos de comparação de movesets

Data: 19/09/2026. Estado: componente consumidor, bateria sintética e adaptador offline de um recorte mecânico implementados. Interface e integração mecânica ampla pendentes.

Verificação realizada: 27 testes passaram em duas execuções independentes de processo; sintaxe do componente e links locais da documentação conferidos. Nenhum teste da suíte integrada ao save foi executado nesta entrega; nenhum arquivo do jogo foi lido ou modificado. Os 27 testes desta bateria são distintos dos testes históricos do núcleo de batalha.

Implementação: `battle-planner/src/compare-evidence.cjs`; entradas em `battle-planner/fixtures/comparison-cases.cjs`; testes em `battle-planner/test/compare-evidence.test.cjs`. As explicações são registros estruturados de ganhos/perdas/condições vinculados às evidências; não há renderização textual final nem persistência. O caso C01 usa HP restante após a ação, não dano bruto, e C02 testa resultados estipulados de três ações sem ampliar o horizonte do motor real.

Política inicial: comparação pareada sem pesos, com igualdade numérica exata; ganhos e perdas simultâneos permanecem condicionais. Qualquer ganho numérico sem perda conta nesta versão, ainda sem limiar de benefício material. Cobertura é declarada pelo produtor; este módulo não a comprova. Não adotar a política como ranking final antes da calibração.

Complementa [PLANO.md](PLANO.md) e [VALIDACAO.md](VALIDACAO.md). Os números abaixo são evidências sintéticas estipuladas, não resultados do calculador, dados do save ou mecânicas verificadas de golpes reais. Servem primeiro para testar decisões e explicações a partir de evidências conhecidas. A integração deverá produzir evidências equivalentes em fixtures mecânicos independentes e versionados.

## Contrato comum

- Um indivíduo fictício P; demais membros da party fixos. Cada caso tem um cenário e um conjunto explícito de candidatos, não representa uma busca global já realizada.
- Build observada e build planejada são separadas. Salvar a proposta não muda a observada nem os arquivos do jogo.
- IDs de golpes e alvos são abstratos. Todos os golpes usados estão confirmados como aprendidos, salvo indicação contrária. Nível, forma, atributos, habilidade e item são fixos entre as alternativas: não se ganha uma comparação alterando essas entradas silenciosamente.
- Em casos numéricos, o pequeno ambiente sintético é determinístico: acertos certos, sem críticos, efeitos secundários, troca, cura, itens ou campo, salvo regra explícita. Não extrapolar suas conclusões para encontros reais.
- Cada evidência deve identificar cenário, alvo, builds, estado inicial, ações/horizonte, resultado, hipóteses e cobertura. A explicação referencia essas mesmas evidências; não deriva do nome ou reputação do golpe.
- `actions` é um trace, não uma unidade universal de turnos. Se cada entrada representar um turno, declarar `scope.actionTraceUnit: "turns"`; então o consumidor exige uma entrada por turno do horizonte avaliado. Para logs descritivos, trocas obrigatórias ou ações de ambos os lados, declarar `"events"`; múltiplas entradas por turno são permitidas. Sem esse campo, a unidade é desconhecida e a cardinalidade não é usada para inferir turnos.
- `requiredHorizon` e `evaluatedHorizon` continuam números declarados pelo produtor. Este consumidor só verifica o mínimo e, com `actionTraceUnit: "turns"`, o tamanho do trace; não descobre a unidade, não converte eventos em turnos e não interpreta a semântica de uma entrada.
- Estados propostos: `preferencia-no-recorte`, `condicional`, `manter`, `inconclusivo`. São categorias de conclusão, não confiança percentual. Estabilidade exige declarar o conjunto de variações efetivamente testado.
- Comparação sem suporte relevante pode mostrar dados parciais, mas não apresentar a ordenação como completa. Ausência de avaliação não equivale a utilidade zero.

## C01 — Uma substituição útil no recorte

**Entrada:** build atual `[ataque-a, recurso-r, recurso-s, recurso-t]`; alternativa `[ataque-b, recurso-r, recurso-s, recurso-t]`. Os três recursos estão fixados. Objetivo: nocautear o alvo A em uma ação; A tem 50 HP. Os ataques têm mesma precisão, PP, prioridade e nenhum custo/efeito adicional neste fixture.

**Evidências estipuladas:** `C01-E1`: ataque-a causa 40 HP; ataque-b causa 60 HP. `C01-E2`: não existe outra diferença dentro do recorte; único slot alterável com candidatos a/b.

**Saída esperada:** `preferencia-no-recorte`, troca a → b. Exemplo de explicação: “Neste confronto, B alcança os 50 HP do alvo em uma ação; A deixa 10 HP. As demais opções da build foram preservadas.” Limitação visível: um alvo e uma ação, não exploração completa.

**Reprovar se:** chamar B de universalmente superior; inventar vantagem defensiva; apresentar porcentagem de vitória. Mutação de disponibilidade: se B deixa de ser aprendido e a aquisição fica desconhecida, excluí-lo do ranking ‘usar agora’, preservando-o apenas como requisito não confirmado.

## C02 — Preparação só vale se houver tempo para aproveitá-la

**Entrada:** atual `[ataque-c, recurso-r, recurso-s, recurso-t]`; alternativa substitui recurso-r por preparação-p. P tem 100 HP, age antes do alvo e recebe 20 HP por resposta. Alvo tem 100 HP. Ataque-c causa 30 HP; preparação-p causa zero e faz os ataques seguintes causarem 60 HP, enquanto P permanece ativo. Sem efeitos adicionais. Horizonte de três ações nossas.

**Evidências estipuladas:** `C02-E1`: ataque/ataque/ataque causa 90 HP, recebe três respostas e termina com P em 40 HP e alvo em 10 HP. `C02-E2`: preparação/ataque/ataque causa 120 HP; recebe duas respostas, nocauteia antes da terceira e termina com P em 60 HP. `C02-E3`: preparação/ataque e ataque/ataque empatam em dano total nas primeiras duas ações; o ganho descrito surge na terceira. O recurso removido não tem efeito neste cenário, mas sua perda funcional deve ser identificada fora dele.

**Saída esperada:** preferência condicionada ao horizonte e às respostas declaradas, vinculando preparação e ataque. Explicar o turno sem dano e o momento em que o investimento se paga.

**Contracaso:** dano recebido passa para 50 HP por resposta. Após preparar e atacar, P é nocauteado antes da terceira ação; a sequência já não sustenta o benefício anterior. Não reutilizar a conclusão de E2.

**Limite atual:** o núcleo documenta busca de até dois turnos. Este caso especifica um requisito de avaliação; não autoriza aumentar a busca nem apresentar três turnos como funcionalidade entregue. Uma implementação limitada a dois turnos deve declarar que não estabeleceu o benefício tardio.

## C03 — Ganho e perda que impedem um vencedor absoluto

**Entrada:** atual `[finalizador-q, recurso-r, recurso-s, recurso-t]`; alternativa troca finalizador-q por cobertura-d. Dois confrontos separados, sem persistência de HP entre eles. P tem 20 HP. No alvo A, com 30 HP, ambos os ataques agem primeiro: q causa 10 HP e d causa 35 HP; se sobreviver, A causa 20 HP. No alvo B, com 10 HP, q tem prioridade maior e causa 10 HP; d tem prioridade normal, causa 35 HP e age depois de B, que causa 20 HP.

**Evidências estipuladas:** `C03-E1`: d resolve A antes da resposta fatal, q não. `C03-E2`: q resolve B antes da resposta fatal, d não chega a agir. Só dano potencial não descreve E2.

**Saída esperada:** `condicional`; comparar explicitamente as duas consequências. Se a relevância de A/B não está definida, não inventar pesos nem declarar uma build vencedora. Uma política de cenário explicitamente escolhida pode estabelecer preferência, mantendo a perda visível.

**Reprovar se:** recomendar d só por causar mais dano; esconder a perda de prioridade; alegar que outro membro cobre B sem avaliar condições de entrada e seu estado fixo.

## C04 — Manter é uma conclusão útil

**Entrada:** atual `[ataque-e, recurso-r, recurso-s, recurso-t]`; alternativa troca e por ataque-f. Conjunto elegível e finito contém apenas essas duas builds. Em todos os confrontos deste fixture, e/f têm resultados idênticos de dano, ordem, precisão, PP e efeitos. Mesmas hipóteses e cobertura completa para esse recorte.

**Evidências estipuladas:** `C04-E1`: vetores de consequências idênticos; alternativa exige uma mudança e a atual não.

**Saída esperada:** `manter`. Explicação: “Não encontramos vantagem em trocar E por F nos confrontos avaliados.” Não gerar alternativas apenas para preencher a interface.

**Reprovar se:** inventar superioridade estética ou por reputação; concluir que não existe melhora fora do conjunto pesquisado. Se a pesquisa foi interrompida ou podada sem garantia, declarar cobertura parcial em vez de apresentar equivalência exaustiva.

## C05 — Informação insuficiente muda a conclusão

**Entrada:** comparação depende de agir primeiro, mas a Speed efetiva de P é desconhecida. Dois valores plausíveis, estipulados para teste, são 49 e 51; alvo tem Speed 50, sem modificadores de prioridade. Cada lado pode nocautear o outro com uma ação.

**Evidências estipuladas:** `C05-E1`: com Speed 49, P é nocauteado antes de agir. `C05-E2`: com Speed 51, P age primeiro. Não há fundamento para escolher silenciosamente um desses atributos.

**Saída esperada:** `condicional` quando os dois ramos podem ser avaliados: “Esta opção depende de superar 50 de Speed nas condições avaliadas; informe o atributo efetivo.” Não tratar o empate em 50 como agir primeiro garantido.

**Variante de incompatibilidade:** habilidade personalizada relevante altera a ordem ou o dano e não está modelada. Esperado: `inconclusivo`, nomear a lacuna, permitir inspecionar os dados parciais e suspender a recomendação que depende dela. Não resolver com atributo presumido, habilidade genérica ou utilidade zero.

## Como transformar em testes

1. **Decisão/explicação (implementado):** fornecer evidências sintéticas ao componente de comparação. A bateria verifica conclusão, deltas, requisitos, perdas e referências às evidências; não exige uma frase literal. Dados malformados são rejeitados; lacunas explicitamente declaradas produzem inconclusão. Retorno não compartilha objetos mutáveis com a entrada. A bateria atual tem 27 testes, incluindo disponibilidade equipada fora do catálogo, trace de turnos explícito, trace de eventos e unidade ausente.
2. **Integração mecânica:** escolher fixtures do perfil compatível com entradas completas e resultados de referência independentes. Os números deste documento não viram resultados esperados de golpes reais por associação de nomes.
3. **Interface:** apresentar esses resultados com identificação de demonstração, testar comparação e salvar a planejada sem mudar a observada. Essa etapa ainda não foi iniciada.

Estes são casos de desenvolvimento, não uma avaliação independente da qualidade final. Reservar casos adicionais não usados para ajustar as regras. Critérios ainda abertos: relevância dos adversários de exploração, horizonte viável, limiar de benefício material e política de ordenação em conflitos como C03.
