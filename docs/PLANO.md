# Companion de progressão para Cobblemon

Estado em 24/09/2026: núcleo/adaptador offline existentes; primeira interface local implementada com importação manual somente leitura de party/PC e planejador de uma troca de golpe por UUID. O planejador apenas mostra o antes/depois a partir dos golpes equipados/aprendidos observados; não calcula dano nem ranqueia golpes. A comparação Pikachu/Floatzel permanece fixa e desconectada da seleção. O smoke-read do mundo configurado capturou 6 Pokémon na party e 62 no PC; isso valida acesso e contrato de leitura, não compatibilidade viva. A tela anterior de importação foi aprovada em Electron no host elevado; a UI nova do planejador ainda não foi testada em Electron e Medium segue pendente. Evidências em [PRONTIDAO.md](preflight/PRONTIDAO.md) e [importação da party](preflight/IMPORTACAO-PARTY.md). Próximos gates: Electron da UI nova e Medium → persistência/Windows. Visão atual e handoff: [README](README.md) e [HANDOFF](HANDOFF.md). O aceite continua limitado ao recorte offline.

Este documento substitui as propostas conflitantes do brainstorming. Registra a revisão aceita pelo usuário; detalhes que dependem de experimentação continuam abertos. Nome do app ainda não definido.

Documentos complementares: [decisões](DECISOES.md), [protocolo de validação](VALIDACAO.md), [resultados das provas](PROVA-COMPATIBILIDADE.md), [captura dos dados efetivos](CAPTURA-DADOS-EFETIVOS.md) e [importação da party](preflight/IMPORTACAO-PARTY.md).

Detalhamento de 19/09/2026: [casos de comparação](CASOS-COMPARACAO.md) têm 27 testes na versão final, incluindo C06, unidades de trace e uma ponte offline com cálculo real local. O comparador continua separado de scenario/search e da interface. Os 13 testes do contrato corrigido elevam a suíte conjunta a 40; frescor de fontes, rejeição de acessores e procedência selecionada foram revalidados independentemente. Política pareada provisória, sem calibração de benefício material.

## 1. Produto e limite da promessa

App desktop local para configurar a party e recomendar conjuntos de até quatro golpes utilizáveis no estágio atual de progressão. Foco em exploração PvE e encontros da campanha Radical Red instalada no All the Mons, inicialmente na versão 1.2.0 informada pelo usuário.

O resultado compara a build atual com uma recomendação e alternativas materialmente diferentes. Explica ganhos, perdas, requisitos e hipóteses usando fatos calculados e regras explícitas, sem LLM.

Não promete a melhor build universal, otimização global da party nem probabilidade de vencer uma batalha completa. A busca pode ser exaustiva dentro de um conjunto de candidatos sem tornar seu modelo de avaliação uma representação perfeita do jogo.

## 2. Primeiro produto utilizável

- Party de até seis indivíduos, inclusive dois da mesma espécie, com configuração manual.
- Espécie/forma, nível, habilidade, item, golpes equipados e golpes disponíveis. Atributos podem ser informados diretamente; IVs, EVs e nature são detalhes opcionais, nunca preenchidos silenciosamente como perfeitos.
- Análise de um Pokémon por vez, considerando os outros membros e suas builds fixos.
- Exploração: adversários de referência versionados, próximos do estágio informado. Sua composição é uma hipótese de avaliação, não uma distribuição de encontros observada.
- Ginásios/encontros: importação das definições locais e análise dos singles cujas mecânicas tenham sido validadas. Brock, Misty e Surge são casos de validação, não suporte já garantido.
- Comparação com a build atual, identificação das principais ameaças e explicações vinculadas às evidências da análise.
- Separação entre usar agora e adquirir depois. Recomendações futuras não competem no ranking das disponíveis agora.
- Salvamento local e exportação/restauração em formato aberto e versionado.

Não entram inicialmente: PvP, outras campanhas, recomendação de capturas, monitoramento ou importação automática de party/PC em background, controle completo de estoque, otimização de EVs ou de seis builds simultaneamente, simulador integral de batalha, duplas, automação de ações ou alterações no jogo.

O núcleo já implementado lê party/PC e recursos locais sob demanda, em modo somente leitura. O painel “Meus Pokémon” faz a leitura explícita pelo mundo configurado e mantém o snapshot apenas em memória. A UI não faz polling nem executa scripts descobertos nos mods. A seleção por UUID alimenta somente o planejador local de uma troca: ele escolhe um slot de `MoveSet` e um candidato de `BenchedMoves` do mesmo indivíduo e apresenta o antes/depois, sem calcular dano ou ordenar golpes. Essa seleção e o plano não alimentam a comparação fixa Pikachu/Floatzel nem constituem recomendação.

O catálogo preserva os golpes conhecidos pelo perfil importado. Um golpe não é eliminado por reputação ou por não causar dano; suporte mecânico e elegibilidade são estados separados.

## 3. Contratos dos dados

| Entidade | Responsabilidade |
|---|---|
| PackSnapshot | Visão normalizada de espécies, formas, golpes, habilidades, itens, treinadores e regras. Contém procedência por campo, versões, hashes dos recursos relevantes, conflitos e limites de compatibilidade. |
| PlayerState | Indivíduos com identificadores estáveis, party, atributos, equipamento, golpes aprendidos e correções manuais. Não se identifica um indivíduo apenas pela espécie. |
| AccessContext | Progressão e meios de aquisição confirmados, indisponíveis ou desconhecidos. Registra requisitos e rotas alternativas, sem presumir posse de TM/item. |
| Scenario | Exploração ou encontro específico, adversários, formato, política de avaliação, estado inicial e hipóteses sobre HP, PP, status, campo e ações adversárias. |
| AnalysisResult | Referências às entradas e versões do motor/política, recomendações, comparação com a build atual, evidências, hipóteses, limitações e cobertura mecânica. |

Regras obrigatórias:

1. Distinguir golpe equipado, aprendido/relembrável, adquirível agora, futuro e disponibilidade desconhecida. Um golpe aprendido não depende de continuar possuindo a TM usada.
2. Disponibilidade por aquisição é satisfeita por uma rota válida e acessível; não exige simultaneamente nível, TM e tutor. Bloqueios informados pelo usuário devem ser explícitos.
3. Golpes observados no indivíduo não são descartados por divergência do learnset da espécie atual. Preservar e expor o conflito, sem afirmar legalidade universal.
4. Preservar dados desconhecidos. Usar atributos efetivos quando disponíveis; conflitos entre atributos informados e derivados exigem uma fonte escolhida e registrada. Nature alterada e atributos modificados não podem ser ignorados.
5. Estado de planejamento e estado temporário de batalha são separados. O padrão de preparação pode assumir HP/PP completos e ausência de status, mas deve informar essa hipótese e não afirmar que retrata o save atual.
6. Procedência é específica da informação: o save descreve o indivíduo; recursos/configurações efetivos descrevem regras; observações de batalha podem revelar divergências. Um log não substitui todo o catálogo.
7. Atualizações criam uma nova versão dos dados e invalidam análises afetadas. Preservar correções pessoais, sem aplicá-las cegamente a espécies ou formas que mudaram.
8. Importação de JSON não certifica mecânicas. Separar valores observados, identificação dos scripts e cobertura validada; funções omitidas, dependências não capturadas ou dados ausentes permanecem explícitos.

## 4. Avaliação e recomendação

Fluxo conceitual:

1. Validar entradas, cenário e compatibilidade. Se uma mecânica ausente compromete a conclusão, não emitir uma recomendação como validada.
2. Separar candidatos disponíveis agora dos adquiríveis/futuros. Permitir fixar golpes e respeitar bloqueios explícitos.
3. Calcular propriedades e interações reutilizáveis por golpe, adversário e estado relevante.
4. Enumerar conjuntos quando viável. Remover candidatos apenas por invalidade ou dominância demonstrada no contexto, não por etiquetas genéricas.
5. Avaliar conjuntos e sequências curtas de preparação, ataque ou recuperação nas famílias suportadas, contabilizando o turno gasto e respostas adversárias declaradas. Isso não simula toda a batalha.
6. Comparar consequências ofensivas, segurança, utilidade contextual, sustentabilidade e custo de mudança com a build atual. Considerar lacunas do restante da party, sem assumir que cobertura de tipo garante entrada segura.
7. Selecionar recomendação e alternativas realmente distintas. Produzir explicações a partir do mesmo registro de evidências usado na decisão.

Para exploração, confiabilidade, autonomia e amplitude de respostas orientam a comparação. Para um encontro conhecido, importam as ameaças específicas e a capacidade de executar a estratégia. Essas preferências não são fórmulas já calibradas.

A regra final de ordenação, seus limiares e o uso ou não de Pareto serão escolhidos com a bateria de avaliação. Não adotar onze dimensões por padrão nem substituir raciocínio contextual por bônus fixos de etiquetas.

Não declarar uma build superior quando a conclusão depende de atributos desconhecidos ou muda em hipóteses plausíveis: mostrar a condição da preferência. Não forçar um número mínimo de alternativas nem propor trocas irrelevantes.

## 5. Arquitetura aprovada

Um único projeto modular, sem servidor web próprio, conta ou serviço de nuvem obrigatório.

| Parte | Escolha |
|---|---|
| Aplicação/interface | Electron, React, TypeScript e Vite. |
| Organização | Módulos de interface, importação, domínio, análise e persistência; sem obrigação de pacotes separados. |
| Dados persistentes | SQLite sob responsabilidade da aplicação, com migrações e exportação aberta. Binding a selecionar e testar no empacotamento. |
| Validação | Zod nas fronteiras de importação, armazenamento e comunicação. |
| Testes | Vitest para contratos, mecânicas e recomendação; Playwright para fluxos do app empacotado quando aplicável. |
| Cálculo | Execução fora da interface, cancelável e com limite de trabalho. `@smogon/calc` 0.11.0 é candidato preferencial para dano após a prova parcial; motor global e cobertura ainda não certificados. |
| Dependências | pnpm e versões fixadas quando começar a implementação. |

O processo principal controla acesso a arquivos e IPC; o renderer não recebe Node, filesystem, SQLite ou shell. A interface Electron/React já existe, com uma ponte limitada para importação e um fluxo separado de comparação fixa. A prova anterior em Electron aprovou a integração de importação no host elevado, mas não testou a UI nova do planejador de troca; Medium segue pendente. A integração completa proposta para cálculo e busca — schema Zod, envelope de trabalho (`snapshotId`, `playerRevision`, `workspaceRevision`, `inputDigest`), limites, cancelamento por terminação do processo e descarte de resultados obsoletos — ainda não foi confirmada como produto integrado. O rascunho de troca atual não executa cálculo.

Arquivos do jogo são somente leitura. Importar dados não autoriza executar JavaScript arbitrário encontrado em mods; a integração executável precisa ser conhecida e versionada. Processo separado não é, sozinho, uma barreira de segurança.

Caches dependem das entradas relevantes, do snapshot e das versões do motor e da política. Mudanças durante uma análise não podem fazer um resultado antigo substituir o atual. Medir memória, CPU e latência com Minecraft aberto; metas numéricas dependem da prova técnica.

## 6. Ordem de execução e condições de passagem

| Etapa | Entrega | Condição para avançar |
|---|---|---|
| 0 — Compatibilidade | Inventário efetivo, casos reproduzíveis e decisão do motor. | Demonstrar a procedência e reprodução das mecânicas dos casos escolhidos; registrar explicitamente o que não funciona. |
| 1 — Núcleo útil | Um snapshot versionado, um indivíduo configurável, build atual/planejada e recomendação explicada. | Respeitar disponibilidade; cálculos suportados corretos; avaliação da recomendação contra referência simples; schemas, hash e fronteira de processo definidos; revisão dos casos difíceis. |
| 2 — Contexto PvE | Party, exploração e encontros singles validados. | Verificar interações relevantes e indicar encontros incompatíveis. Importação isolada não aprova suporte. |
| 3 — Confiabilidade | Persistência, restauração, invalidação, cancelamento e empacotamento testados. | Testes de dados e fluxos aprovados e desempenho medido no ambiente-alvo. |

Persistência e testes são construídos ao longo das etapas; a etapa 3 é sua aprovação final, não o primeiro momento em que são considerados.

Expansão da campanha vem depois, por necessidade real. Duplas e novas mecânicas exigem novo escopo e validação próprios.

## 7. O que ainda está aberto

- **Antes da implementação principal:** como reconstruir o estado efetivo das mecânicas e qual motor atende ao perfil instalado.
- **Por experimentação no núcleo:** bateria de exploração, política de ordenação, limites das sequências curtas e tratamento de empates relevantes.
- **Por medição técnica:** orçamento de desempenho, integração SQLite/empacotamento Windows, cancelamento real e diferença de custo com Minecraft aberto/fechado.
- **Por integração do app:** a ponte do snapshot já usa IPC sem payload e lê apenas a configuração local; outras integrações CommonJS ainda devem evitar `require` de paths arbitrários e execução de JavaScript importado de mods.

Não falta outra rodada genérica de brainstorming. A bateria inicial e a ampliação para os golpes das três equipes passaram nos contextos de laboratório testados; faltam confirmações de integração antes de encerrar a etapa 0. A rota recomendada usa um coletor pequeno via KubeJS existente. O núcleo da captura Java e seu adaptador foram preparados como rascunho, com 32 testes locais; não estão validados no servidor. Faltam comando, publicação real e acesso à parte mecânica/Graal, conforme o documento específico. Nada foi instalado. Inspecionar fontes não autoriza instalar o coletor, executar comandos, reiniciar o servidor ou iniciar batalhas. A afirmação de que “o experimento não iniciou a construção do app” descreve aquela etapa de compatibilidade, não o estado atual da interface local. A revisão arquitetural inicial também não executou testes Electron, SQLite, empacotamento ou benchmarks; os gates da arquitetura completa permanecem explícitos em [04-ARQUITETURA-PRONTIDAO.md](preflight/04-ARQUITETURA-PRONTIDAO.md).
