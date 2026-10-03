# Provas de compatibilidade

Data: 08/09/2026. Resultado: **viabilidade parcial demonstrada; equivalência com o servidor completo ainda não certificada**.

Referências: [plano](PLANO.md), [protocolo](VALIDACAO.md) e experimento reproduzível (`experiments/cobblemon-compatibility/README.md`).

## O que foi executado

O motor Showdown instalado foi carregado em Node, fora do Minecraft. Foram usadas batalhas sintéticas, não a party do usuário nem batalhas no mundo. O acesso do processo de testes aos arquivos do jogo foi limitado a leitura; as gravações foram restritas aos resultados do experimento.

O inventário examinou 402 JARs de nível superior e selecionou 143 recursos relacionados às espécies, treinadores e scripts do recorte. Não houve erros de leitura JSON nos recursos selecionados. Isso não constitui inventário completo de todos os recursos efetivos: JARs aninhados, packs gerados e alterações feitas apenas em código ainda exigem cobertura própria.

O experimento normalizou campos de 18 espécies/formas a partir dos JSONs locais e preservou amostras de Brock, Misty e Surge: 13 Pokémon, inclusive o Onix com três golpes e o Floatzel com Technician. Não declarou resolvida a escolha de itens contra o registro Minecraft em execução.

Foram aplicados em memória somente dois callbacks previamente inspecionados e com conteúdo fixado por hash: Manectite do Mega Showdown e ações do ZAMega. Isso criou um perfil controlado para teste, **não uma reconstrução completa da inicialização real**. Demais campos necessários das espécies vieram do Dex estático local, com essa dependência registrada.

## Resultados da primeira bateria

**24 testes passaram em duas execuções isoladas com resultados idênticos.** Foram reconferidos 64 arquivos-fonte registrados, sem mudança de hash entre a inspeção e a verificação final.

| Grupo | Resultado e alcance |
|---|---|
| 11 situações de dano | 176 resultados inteiros comparados com `@smogon/calc` 0.11.0, todos coincidentes: 16 sorteios por situação, sem críticos e sob as condições registradas. |
| 10 testes de eventos/sequências | Asserções passaram para imunidades de Nuzzle, Volt Absorb, Nuzzle/Electro Ball, Nasty Plot, Sturdy/Berry Juice, Custap, terreno/semente, Surge Surfer e Mega Manectric. Não representam todas as ramificações possíveis. |
| 3 testes de integridade/controle | Preservação das definições locais dos líderes, detecção do conflito de Mega Raichu e controle negativo de conversão de peso. |

Os casos de dano cobrem Spark, Thunder Shock, Grass Knot, Psyshock, Technician, Strong Jaw, terreno elétrico, preparação especial versus ataque físico, Eviolite e Hidden Power. Dez casos chamam o cálculo de dano em estados controlados; Hidden Power passa pelo fluxo de ações completo para aplicar a mudança de tipo antes do dano.

Exemplo reproduzido: Pikachu e Floatzel sintéticos no nível 20, nature neutra, IVs 31 e EVs 0, sem habilidades modificadoras. Spark produziu de 36 a 44 HP de dano, com igualdade dos 16 sorteios, não apenas dos extremos. Esses atributos são parâmetros de teste e não uma descrição dos Pokémon do usuário.

O controle negativo de peso inicialmente falhou por um problema no próprio teste: o calculador clona o Pokémon, descartando a alteração isolada do atributo. A corrupção intencional foi movida para o override da espécie, e o controle passou a detectar a diferença esperada. O ajuste não mudou o código do calculador nem do jogo.

## Ampliação: três primeiros líderes e carregamento de recursos

Segunda rodada em 08/09/2026, usando o mesmo perfil controlado. Preserva níveis, nature, IVs, EVs, habilidades, formas e gênero das definições locais dos treinadores. **A primeira alternativa de item é uma hipótese explícita do laboratório**, não uma resolução confirmada no registro Minecraft.

| Grupo adicional | Resultado e alcance |
|---|---|
| 169 cenários de dano | 2.704 resultados inteiros coincidentes, 16 por cenário. Incluem os golpes ofensivos das três equipes e ataques após Mega Evolução de Manectric. |
| 8 casos de eventos | Sleep Talk acordado/dormindo em Vulpix e Onix; Roost em Archen e Vikavolt; Nasty Plot em Raichu; Recover em Starmie. Passaram as asserções de estado e PP definidas, não todas as ramificações. |
| 6 verificações de resolução | Colisões de identificadores, invariância à ordem de enumeração e rejeição de prioridade de pack desconhecida para recursos de caminho idêntico. Resultado derivado do carregador inspecionado, não de exportação do registro ativo. |

As três baterias — inicial, equipes e carregamento — passaram novamente em **duas execuções separadas por bateria**, com resultados comparáveis idênticos. Foram verificados **66 arquivos-fonte únicos antes e depois**, sem alterações nos hashes observados. Isso cobre apenas o conjunto registrado, não garante um snapshot atômico do servidor inteiro.

A matriz usa 45 posições de golpes ofensivos das 13 criaturas contra três defensores sintéticos: Pikachu, Floatzel e Onix, no nível do atacante, sem habilidade ou item. São 135 cenários, mais 18 com terreno elétrico para Surge e 16 com Mega Manectric, totalizando 169. As ações atravessam o fluxo do motor local; comparam dano bruto antes de limite de HP, cura ou sobrevivência. Acerto é condicionado e críticos são excluídos. **Não são 169 confrontos completos nem uma estimativa de vitória.**

Os seis usos de golpes de status nas equipes são avaliados separadamente. Nos casos de Sleep Talk, os demais golpes não gastaram seus próprios PP ao serem chamados; apenas uma seleção de golpe com semente fixa foi observada para cada indivíduo dormindo. Nos casos de recuperação, HP reduzido foi injetado deliberadamente. Oran Berry de Archen e Sitrus Berry de Starmie ativaram antes da ação de cura. Roost removeu Flying temporariamente de Archen, mas não removeu Levitate de Vikavolt, que é Bug/Electric nesse perfil.

### Correções do instrumento de teste

- A primeira execução ampliada falhou em 30 cenários porque contava chamadas sem dano dos efeitos secundários como segundo ataque. O código local confirmou essa passagem; agora o teste exige que essas chamadas não tenham potência/identidade de golpe e retornem `undefined`. Dano numérico adicional continua causando falha.
- As primeiras asserções de recuperação ignoravam as berries equipadas nos próprios fixtures. Foram corrigidas para conferir a cura do item antes da ação, seu consumo e a cura do golpe, inclusive o limite de HP.
- O parser de Sleep Talk foi ajustado ao protocolo local sem espaço após `[from]`. O retorno `null` de `isGrounded` foi identificado como imunidade por habilidade, não como dado desconhecido; a imunidade a Ground também foi conferida pela interface booleana correspondente.

Esses ajustes corrigiram o laboratório. Não houve alteração do jogo, do Showdown instalado ou do calculador para obter aprovação.

### Mega Raichu: conflito explicado pelo carregador

Foram registradas seis classes instaladas, com hashes dos JARs e do bytecode inspecionado. A cadeia relevante é:

1. `MultiPackResourceManager.listResources` constrói um `TreeMap` de recursos.
2. `ResourceLocation.compareTo` ordena pelo caminho e depois pelo namespace.
3. `JsonDataRegistry.reload` usa namespace e **nome do arquivo sem extensão**, descartando as subpastas, como identificador de registro. Uma inserção posterior substitui a anterior com a mesma chave.

Assim, `species_additions/generation1/raichu_mega.json` e `species_additions/raichu_mega.json` convergem para `cobblemon:raichu_mega`. Sob esse carregador, a definição na raiz, do Mega Showdown, prevalece: **Mega X com Electric Surge e Mega Y com No Guard**. Há colisão análoga para Starmie Mega. Não é uma inferência baseada na ordem alfabética dos nomes dos mods.

Confiança: resolução sustentada pelo código instalado, **condicionada aos recursos chegarem a esse carregador sem transformações adicionais**. Falta confirmar o registro final em execução. Mega Raichu X/Y continuam fora do perfil de batalha, pois não são necessários aos três líderes examinados. O resolvedor experimental rejeita recursos de caminho idêntico cuja prioridade de pack ainda não foi estabelecida, em vez de inventar um vencedor.

Artefatos: matriz e eventos (`experiments/cobblemon-compatibility/results/gym-tests.json`), resolução (`experiments/cobblemon-compatibility/results/loader-tests.json`), manifesto das classes (`experiments/cobblemon-compatibility/results/loaders/manifest.json`) e verificação repetida (`experiments/cobblemon-compatibility/results/verification.json`).

## Inspeção das rotas de exportação

Uma rodada posterior em 08/09 examinou 14 classes do Cobblemon, RCT e KubeJS, sem executar comandos no servidor. A exportação de debug do KubeJS chama `reload`; a consulta JSON do Showdown omite funções; o comando de avaliação de JavaScript do KubeJS só é registrado fora do modo de produção. Seis testes de fronteira de serialização passaram em duas execuções iguais. Isso demonstra limitações da captura, **não amplia a cobertura de dano nem confirma registros vivos**.

A recomendação passou a ser preparar um coletor pontual com o KubeJS existente, separando dados finais, identificação de código e cobertura mecânica. Escopo, alternativas descartadas e condições de segurança estão em [CAPTURA-DADOS-EFETIVOS.md](CAPTURA-DADOS-EFETIVOS.md).

Na continuação, foi preparado o rascunho do núcleo da captura Java e seu adaptador: 32 testes de contrato passaram em duas execuções idênticas, sem acesso do processo de testes aos arquivos do jogo. O adaptador foi exercitado com objetos simulados, não com Java/Rhino reais. Nada foi instalado; comando, gravação real e coleta do Dex/callbacks seguem pendentes. Esses testes não ampliam a cobertura mecânica das baterias de dano.

## Descobertas que afetam o projeto

1. **O formato de entrada também é personalizado.** O motor local exige `movesInfo`, com PP atual e máximo por golpe. Um conjunto comum de Showdown não iniciou a primeira batalha até incluir esse contrato. PP não deve ser inferido como sempre maximizado.
2. **Hidden Power exige o fluxo correto de eventos.** Seu tipo é modificado durante a ação; consultar apenas a potência/tipo estáticos do golpe pode produzir uma conclusão errada. No caso local de Vulpix testado, os IVs resultaram em Grass e os 16 danos coincidiram.
3. **Há conflitos reais de dados entre mods.** Mega Showdown define Mega Raichu X com Electric Surge e Y com No Guard; ZAMega define essas mesmas formas com Levitate e Transistor. A segunda rodada explicou a colisão e identificou Mega Showdown como vencedor previsto pelo carregador inspecionado. Falta confirmação no registro ativo; as duas formas continuam fora do perfil de batalha.
4. **Pasta de datapacks vazia não significa ausência de packs.** A leitura de `level.dat` encontrou packs internos e gerados habilitados. O grupo `mod_data` não revela sozinho toda a precedência interna. Apenas os metadados dos packs foram exportados, não dados pessoais do save.
5. **Alguns contratos puderam ser confirmados no código instalado.** O construtor `TrainerTeam` define singles como padrão; o conversor do RCT percorre alternativas de item contra o registro Minecraft; a serialização de espécies divide peso e altura por dez. Essas confirmações não dispensam herança, remapeamentos e verificações de recursos efetivos.

Diferenças de slots de habilidades entre JSONs e Dex também foram registradas. Duplicar uma habilidade em outro slot não demonstra, por si só, uma alteração no seu efeito em batalha.

## Conclusão técnica e próximo recorte

`@smogon/calc` 0.11.0 permanece como **candidato preferencial para a camada de dano**, agora com evidência executável no recorte testado. O Showdown local é útil como referência de laboratório para eventos e sequências. Não há, por enquanto, decisão de embarcar dois motores completos no app.

A prova agora exercita cada golpe listado nas três equipes, mas **não valida todos os efeitos e estados desses golpes**. Não validou IA do RCT, decisões de cura/troca, reprodução de batalhas observadas, algoritmo de recomendação ou desempenho do produto. Por exemplo, dano de Volt Switch não aprova a política de troca, e um acerto de Protean não prova suas regras de reutilização. Smogon e Showdown também compartilham origem conceitual; concordância entre eles não substitui confirmação contra o jogo real quando a integração Java ou outro mod altera o comportamento.

A etapa 0 continua aberta, com próximo recorte concreto:

- Concluir a integração e a publicação do coletor delimitado na [inspeção de captura](CAPTURA-DADOS-EFETIVOS.md), cujo núcleo da parte A já passou nos testes locais. A obtenção do registro final de espécies/formas, alternativas de itens e scripts continua pendente, com aprovação separada para instalação/execução.
- Confrontar uma amostra com observações reais suficientemente completas e ampliar as interações que afetarem as recomendações. Não tratar a ausência de protocolos de combate nos arquivos `latest.log` e `debug.log` consultados como prova de ausência de qualquer mecanismo de registro. Uma linha isolada de log não prova uma distribuição.
- Decidir o motor e a cobertura inicial com essas evidências; medir desempenho do trabalho representativo, sem usar tempos desta bateria como promessa para o app.

Se a confirmação exigir exportador, comandos no servidor, reinício ou novas batalhas no mundo do usuário, solicitar essa intervenção explicitamente. Nenhuma dessas ações foi realizada.
