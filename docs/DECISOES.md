# Registro de decisões

Atualização de 09/09/2026: o usuário solicitou implementar a integração do calculador com party/PC e análise do time completo. O [núcleo executável da campanha](NUCLEO-BATALHA.md) acrescenta importação sob demanda, a cada execução, e ferramentas de avaliação de vários indivíduos, além do escopo inicial de D05. Isso não certifica otimização global, não equivale a monitoramento automático e não inicia a interface Electron. Os limites de D02, D10 e D11 continuam válidos.

Referência: [plano consolidado](PLANO.md). Data: 07/09/2026. Decisões de projeto aceitas após a revisão; nenhuma indica implementação concluída.

| ID | Decisão | Razão e consequência | Quando revisar |
|---|---|---|---|
| D01 | PvE de exploração e Radical Red local; sem LLM. | Atende à progressão real do usuário, com explicações reproduzíveis. Outras campanhas e PvP ficam fora. | Mudança explícita da necessidade do usuário. |
| D02 | Compatibilidade com o jogo antes da implementação principal. | Dados e scripts são compostos durante a execução. Copiar uma pasta não demonstra equivalência mecânica. | Após a prova técnica, para selecionar motor e perfil suportado. |
| D03 | Disponibilidade por indivíduo e por rotas alternativas. | Aprendido, adquirível agora e futuro têm implicações diferentes. Preservar observações e conflitos de importação. | Evidência local de uma regra de aquisição diferente. |
| D04 | Recomendação contextual comparada à build atual. | Evita prometer uma build universal ou sugerir trocas sem benefício relevante. Alternativas não têm quantidade obrigatória. | Resultados da bateria de avaliação. |
| D05 | Um Pokémon por vez, com restante da party fixo. | Controla a busca e entrega utilidade cedo. Não equivale a otimização global do time. | Caso de uso comprovado que exija otimização conjunta. |
| D06 | Singles primeiro; suporte por mecânica e encontro. | A campanha contém duplas e mecânicas especiais desde líderes iniciais. Importar não significa saber avaliar. | Testes específicos aprovarem cobertura adicional. |
| D07 | Electron/React/TypeScript/Vite em projeto modular único. | Mantém a stack já escolhida sem fragmentação prematura. Cálculo fora da interface. | Evidência de desempenho ou manutenção, não preferência abstrata. |
| D08 | SQLite centralizado e exportação aberta. | Coerência com acesso local, histórico e backups da aplicação. Substitui a proposta de Dexie/IndexedDB como armazenamento principal. | Problema concreto de integração ou mudança para produto web. |
| D09 | Regras contextuais e sequências curtas para efeitos suportados. | Etiquetas isoladas não demonstram valor de preparação, status ou recuperação. Motor e profundidade ainda dependem da prova. | Cobertura e custo medidos. |
| D10 | Desconhecimento e incompatibilidade são resultados válidos. | Não preencher atributos perfeitos nem esconder mecânicas ausentes para gerar recomendações. | Somente quando nova evidência resolver a lacuna. |
| D11 | Separar captura de dados, identificação de código e validação mecânica. | A exportação JSON instalada omite funções. Hashes de funções também não capturam todo o ambiente de execução; importação não aprova compatibilidade. | Novas evidências permitirem capturar e validar dependências hoje desconhecidas. |
| D12 | Time de 6 por objetivo, escolhido em party + PC (05/10/2026, [visão](VISAO.md)). | Revisa D05 e a exclusão de “otimizar seis builds” do plano: o guia monta o time para um líder RCT ou PvE geral e explica cada membro. Não promete ótimo global nem time universal. | Resultados do motor contra casos de validação. |
| D13 | Monitoramento read-only de party/PC (05/10/2026, [visão](VISAO.md)). | Revisa a exclusão de monitoramento/polling: o app relê sozinho ao detectar mudança, com as garantias da leitura manual. Ler outros arquivos do save (ex.: progresso RCT) continua exigindo autorização explícita. | Custo medido com o jogo aberto ou problema de concorrência com o servidor. |
| D14 | Fora até nova decisão: simulação de batalha, duplas e leitura de inventário (05/10/2026, [visão](VISAO.md)). | Plano de batalha (v2) é confronto a confronto; duplas aparecem como fora do escopo; itens são sugeridos sem verificar posse. Capturas recomendadas entram na v3. | Decisão explícita do dono do projeto. |

## Propostas arquiteturais da revisão inicial — 19/09/2026

Estas propostas foram cruzadas com as três frentes; não são provas de implementação. A [consolidação](preflight/PRONTIDAO.md) encerrou C-01/C-02/C-03 após revisão independente e 40/40 testes-base. O adaptador offline mantém o envelope da Frente 3 e mapeia disponibilidade somente para o subconjunto equipado/aprendido aceito pelo comparador; não transforma `acquirable-now` em `learnedMoves`. Próximo passo: prova desktop isolada.

- **P-A1 — Primeira fatia por snapshot versionado:** importar um snapshot sob demanda conforme o contrato v1, mostrar procedência/estado de cobertura e permitir analisar um indivíduo/build planejada. A importação read-only de party/PC já existe no núcleo, mas monitoramento e polling ficam fora. Isso resolve a contradição entre o plano inicial e o núcleo entregue sem dar ao app acesso direto ao save.
- **P-A2 — Ponte mínima e cálculo isolado:** renderer React sem Node; preload com `contextBridge` allowlistado; main dono de arquivos/SQLite/IPC; cálculo em `UtilityProcess` com envelope validado. O núcleo CommonJS existente entra por adaptador, não por importação direta no renderer.
- **P-A3 — Cancelamento e obsolescência como contrato:** cada trabalho carrega `snapshotId`, `playerRevision`, `workspaceRevision`, `inputDigest`, versão de motor/política, seed e limites de nós/tempo. Resultado atrasado é descartado e não sobrescreve a análise atual. Como o núcleo atual é síncrono, terminar o processo é a garantia de cancelamento da primeira versão.
- **P-A4 — SQLite sem versão de binding congelada:** banco em `userData`, migrações transacionais com `PRAGMA user_version`, backup consistente e exportação aberta; uma conexão e um escritor no main. A escolha do binding e eventual WAL dependem de spike/benchmark no Electron Windows; não instalar nem fixar pacote por documentação apenas. A falta desse ensaio inicia o spike, mas impede declarar persistência empacotada pronta.
- **P-A5 — Runtime permitido, sem código arbitrário de mods:** snapshots podem carregar diagnóstico e dados, mas o app não aceita `require` de caminho fornecido pelo usuário nem executa scripts exportados do servidor. O runtime compatível deve ser empacotado, revisado e identificado por manifesto/hash.

## Correções explícitas do brainstorming

- `levelMovesLearnable: false` no SimpleTMs não desativa aprendizado natural por nível. A inspeção do método de elegibilidade do mod, feita na revisão, relacionou a opção ao ensino via TM/TR. O valor do arquivo foi reconferido nesta consolidação.
- Um learnset da espécie não demonstra que o indivíduo desbloqueou o golpe; também não autoriza apagar um golpe já observado por conflito de dados.
- Chance secundária de 100% não significa efeito garantido independentemente de acerto, imunidades e bloqueios. Recomendações anteriores de Nuzzle/Double Team eram exemplos não validados, não referências de qualidade para os testes.
- O adaptador de dados de `@smogon/calc` não importa automaticamente scripts personalizados do Cobblemon.
- Pareto e muitas dimensões não comprovam qualidade. Essa combinação deixou de ser requisito arquitetural.
- “Análise exata do líder” foi substituída por cálculos e recomendações com condições e cobertura declaradas. Não estimar vitória da batalha inteira a partir de confrontos isolados.
- A configuração local de cap examinada controla ganho de experiência; uma proibição de entrar em batalha acima do cap precisa de evidência própria.
- Terreno elétrico e Mega Evolução não podem ser ignorados para validar Surge. Duplas não podem ser avaliadas silenciosamente como singles.

## Escolhas ainda não encerradas

Implementação incremental de 19/09/2026: `compare-evidence.cjs` consome pares de builds e evidências estipuladas, sem importar jogo ou motor. Usa preferência sem perda observada, conflito condicional, manutenção e inconclusão; devolve razões estruturadas com procedência. Não estabelece pesos, limiar material ou ranking global. Revisar a política após integração mecânica e casos independentes. Preservada a stack do app; CommonJS e `node:test` seguem apenas o núcleo de laboratório existente.

Em 19/09/2026, o detalhamento do primeiro fluxo foi registrado em [CASOS-COMPARACAO.md](CASOS-COMPARACAO.md): comparação vinculada a evidências, ganhos e perdas explícitos, manutenção como resultado válido e separação entre build observada e planejada. Os cinco exemplos alimentam a bateria sintética implementada, não fecham a fórmula de ordenação nem a validação mecânica. Revisar conforme integração e casos independentes.

A revisão cruzada foi realizada. A arquitetura da primeira fatia, cancelamento/obsolescência, renderer/main/UtilityProcess e SQLite/Windows continuam propostas a ensaiar. A suíte final do comparador tem 27 testes; `actionTraceUnit` só restringe cardinalidade quando vale `turns`. A decisão de início e os três defeitos concretos do contrato estão em [PRONTIDAO.md](preflight/PRONTIDAO.md). Leitura local segura já está autorizada; instrumentação/reload/mutação do servidor exige autorização própria.

O motor, a política final de ordenação, a bateria de exploração, os limites de busca e a integração concreta de SQLite dependem das evidências previstas em [VALIDACAO.md](VALIDACAO.md). São decisões delimitadas; uma prova parcial não aprova toda a integração.

## Orientação técnica provisória — 08/09/2026

Após as [provas executáveis](PROVA-COMPATIBILIDADE.md), `@smogon/calc` 0.11.0 é o candidato preferencial para dano nos contextos suportados. O Showdown local permanece referência de laboratório para eventos/sequências. Razão: 176 resultados de dano coincidentes na primeira bateria e mais 2.704 na matriz das equipes, incluindo Mega Manectric, além das asserções de eventos. São cenários condicionais, não probabilidades de vitória nem certificação de todas as interações.

Consequência: o próximo foco é confirmar os registros e scripts efetivos do servidor para os três líderes, sem começar o app nem decidir pelo embarque de dois motores completos. Uma biblioteca de dano não recebe a responsabilidade de decidir ações, gasto de PP, cura, troca ou valor de uma build. Rever a preferência se aparecer divergência relevante ou custo de adaptação excessivo.

Mega Raichu X/Y permanecem fora do perfil de batalha. A inspeção do carregador explicou a colisão por nome de arquivo sem subpastas e prevê a definição do Mega Showdown como vencedora, sob as condições registradas no relatório. Falta confirmar o registro ativo; isso não autoriza generalizar a prioridade para outros conflitos ou habilitar essas formas no app.

## Rota recomendada para captura — 08/09/2026

A [inspeção das ferramentas instaladas](CAPTURA-DADOS-EFETIVOS.md) recomenda um coletor temporário via KubeJS, com comando explícito e sem mod novo inicialmente. O núcleo da parte A e um adaptador Java já foram preparados como rascunho: 32 testes locais passaram, com objetos Java simulados. Isso não valida a integração viva nem autoriza instalação. Comando, publicação real e parte B/Graal continuam pendentes; solicitar autorização com destinos e procedimento exatos antes de qualquer intervenção no servidor.

Não usar `kubejs export debug` como consulta neutra: o código executa `reload`. Não depender de `kubejs eval` em produção, nem habilitar o servidor web desativado para essa finalidade. Rever a escolha por KubeJS se a integração, o contexto de execução ou os limites de captura exigirem uma ponte dedicada.
