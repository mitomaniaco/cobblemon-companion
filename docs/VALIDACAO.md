# Protocolo de validação

Referência: [plano](PLANO.md). Preparado em 07/09/2026.

## Registro histórico do núcleo offline — 19/09/2026

Comparador final com 27 testes, contrato corrigido com 13 e adaptador offline com 7; execução conjunta direta **47/47**, zero falhas. Os três contraexemplos foram revalidados e o adaptador cobre cálculo local, disponibilidade, frescor, cenário não suportado, determinismo, não mutação e slot calculado no recorte declarado. Detalhes em [PRONTIDAO.md](preflight/PRONTIDAO.md). As baterias mecânicas de 08/09 continuam históricas e não foram reexecutadas naquela integração. O status abaixo é a referência atual do app; este registro não descreve a UI entregue depois.

## 1. Base local observada

- Servidor examinado: `D:\Games\Minecraft`. `server.properties` define `level-name=world`; na reconferência, mundo e log tinham gravações em 08/09/2026. O log do cliente Prism examinado anteriormente era de 04/09/2026. Isso favorece investigar o servidor, mas não identifica sozinho a sessão de cada jogador nem prova todo o conjunto de recursos ativos.
- Cliente informado: `C:\Users\<usuário>\AppData\Roaming\PrismLauncher\instances\All the Mons - ATMons`.
- Arquivos instalados reconferidos: Cobblemon `1.7.3+1.21.1`; RCT Mod `0.18.1-beta`; RCT API `0.15.2-beta`; SimpleTMs `2.3.3`; Mega Showdown `1.9.3+1.7.3+1.21.1`. São versões nos nomes dos arquivos, não um manifesto completo de compatibilidade.
- `showdown/index.js` recebe dados de registros e scripts de golpes, habilidades e itens durante a execução. O módulo estático `showdown/data/mods/cobblemon/moves.js` examinado inicia `Moves` vazio.
- `config/simpletms/main.json`: TM, egg e tutor habilitados nas respectivas opções; level desabilitado nessa configuração de elegibilidade. A interpretação do código está registrada em [DECISOES.md](DECISOES.md).
- `config/rctmod-server.toml`: `initialLevelCap=15`, `relativeLevelCap=0`, `initialSeries="empty"`, `allowOverLeveling=false`. Não inferir a campanha atual do jogador nem uma regra de entrada em batalha desses valores isoladamente.

Definições lidas no JAR `rctmod-neoforge-1.21.1-0.18.1-beta.jar`, sob `data/rctmod/trainers/`:

| Identificador | Evidência estática útil |
|---|---|
| `leader_brock_019e` | Geodude alolan com Sturdy/Custap; Onix com Sturdy/Berry Juice e apenas três golpes; uma Potion na bolsa; `maxItemUses=2`. |
| `leader_misty_019f` | Floatzel definido com Technician; Lanturn com Volt Absorb; uma Super Potion na bolsa. |
| `leader_lt_surge_01a0` | Pincurchin com Electric Surge/Electric Seed; Raichu alolan com Surge Surfer; Manectric com lista de itens Manectite/Expert Belt. |
| `boss_giovanni_0045` | `battleFormat=GEN_9_DOUBLES`. |
| `elite_four_lorelei_004d` | `battleFormat=GEN_9_DOUBLES`. |

Os três líderes examinados não declaram `battleFormat` no arquivo individual. Na prova de 08/09, o construtor instalado `TrainerTeam` confirmou `GEN_9_SINGLES` como padrão; a inspeção não encontrou arquivos de grupos ancestrais correspondentes no recorte pesquisado. Isso sustenta o padrão usado nos fixtures, mas não certifica todas as fontes geradas em execução. Não confundir a definição desse identificador com qualquer rematch ou variante do mesmo personagem.

## 2. Prova técnica mínima — protocolo da etapa 0, em andamento

### A. Reconstruir a origem dos dados

1. Confirmar servidor, mundo e perfil escolhido; inventariar recursos relevantes de mods, datapacks habilitados, KubeJS, configurações e alterações executáveis.
2. Resolver precedência, herança de espécies/formas e fallback de treinadores. Registrar a ordem aplicada e a procedência dos valores finais.
3. Resolver nomes, namespaces, aspectos, unidades e identificadores de itens. No RCT, verificar a semântica da lista de itens e qual alternativa existe efetivamente no registro.
4. Produzir uma amostra normalizada versionada dos três líderes e dos Pokémon/golpes necessários aos testes. Não importar saves completos nem dados pessoais desnecessários.
5. Guardar hashes dos recursos relevantes e das versões de integração. Detectar recursos alterados durante a leitura; não publicar como consistente uma mistura de versões.

Saída exigida: mapa de origem dos dados, amostra reproduzível e lista de lacunas. Arquivos estáticos lidos não equivalem a registro efetivo validado.

Avanço registrado: o código instalado permite resolver condicionalmente a colisão de Mega Raichu por chave de arquivo, sem ordenar mods arbitrariamente. A [inspeção das rotas de captura](CAPTURA-DADOS-EFETIVOS.md) encontrou APIs aproveitáveis, mas não uma saída pronta suficiente nas rotas examinadas. Seis testes de serialização demonstraram perdas de funções e limites de hashes. O rascunho da parte A do coletor passou em 32 testes locais; comando, publicação real e ponte viva continuam pendentes. Nenhum registro ativo foi capturado, nenhuma alternativa de item foi confirmada em memória e a parte B dos scripts não foi implementada. Qualquer intervenção no servidor precisa de autorização própria.

### B. Verificar mecânicas antes de escolher o motor

Comparar o candidato de cálculo com uma referência independente e suficientemente observável da instalação. Não considerar que o motor validou a si mesmo apenas porque duas funções compartilham a mesma implementação.

Para cada caso, registrar entradas completas, estado de campo, ações, resultados esperados, fonte e hipótese. Comparar dano em unidades inteiras e distribuição quando obtível, não apenas percentual arredondado. Em sequências, comparar ordem dos eventos, consumo de item, mudanças de estado e HP final.

Um evento isolado de log pode confirmar compatibilidade com um resultado possível, mas não valida todos os sorteios nem a distribuição. Se a referência não for observável o suficiente, marcar o teste como inconclusivo.

| Caso | Verificação necessária |
|---|---|
| Ataque físico e especial simples | Atributos efetivos, bônus de tipo, efetividade, precisão e arredondamento. |
| Nuzzle e Electro Ball | Imunidades, aplicação de status, relação de velocidades e custo do turno de suporte. |
| Nasty Plot e ataques físicos/especiais | Não creditar benefício a Spark; avaliar se preparar permite uma sequência útil. |
| Sturdy, Custap e Berry Juice do Brock | Limiar de HP, ativação, ordem de ação e consequência em sequência. |
| Floatzel e Lanturn da Misty | Preservar habilidade personalizada da definição e respeitar absorção elétrica. |
| Campo e forma na equipe do Surge | Terreno, elegibilidade de seus efeitos, Surge Surfer, forma Mega e resolução de item. |
| Hidden Power e Grass Knot locais | Tipo/potência e dependências corretas do perfil instalado; não assumir comportamento só pelo nome da geração. |
| Bolsa e regras do treinador | Preservar quantidade, limite e possibilidade de cura sem inventar a política de uso da IA. |
| Definição em dupla | Impedir análise de encontro como singles suportado. |

Decisão resultante: adotar o calculador com adaptações explícitas e testadas se suficiente; caso contrário, avaliar integração do motor efetivo ou reduzir a cobertura declarada. Não desenvolver silenciosamente um simulador completo para contornar uma incompatibilidade.

Se for necessário instalar um exportador, modificar servidor, reiniciar o jogo ou provocar novas batalhas no mundo do usuário, apresentar essa necessidade antes. A etapa documental não autoriza essas ações. Uma prova futura deve preferir material existente ou ambiente de teste separado.

### C. Medir a viabilidade

Usar conjuntos representativos, incluindo 15 e 30 golpes elegíveis: respectivamente 1.365 e 27.405 conjuntos de quatro, antes de restrições. Medir custo de cálculo e de sequências separadamente; não extrapolar o tempo só pelo número de conjuntos.

Medir início frio, recomputação, memória, CPU, cancelamento e resposta da interface com Minecraft aberto. Registrar máquina, carga e política de cache. Reaproveitar cálculos apenas quando estado e dependências relevantes forem iguais.

Saída exigida: orçamento de trabalho e metas mensuráveis para o produto. Não prometer duração ou memória antes de medir; não certificar desempenho apenas porque uma interface vazia responde bem.

## 3. Validação do recomendador — após a prova mecânica

Em 19/09/2026, [CASOS-COMPARACAO.md](CASOS-COMPARACAO.md) registra a versão final com 27 testes, substituindo as contagens 21/24. Execute `node --test battle-planner/test/compare-evidence.test.cjs` a partir da raiz. As entradas são em sua maioria estipuladas; `REAL-CALC-E1` usa cálculo local em cenário sintético. `actionTraceUnit: turns` exige cardinalidade igual ao horizonte; `events` ou unidade ausente não permitem contar turnos por strings. scenario/search continuam separados do comparador. Cobertura e disponibilidade dependem do produtor; essa suíte não certifica mecânicas do servidor nem qualidade global.

Construir uma bateria pequena e versionada de situações representativas e adversariais. Separar casos usados para ajustar regras daqueles reservados para avaliação. Referências simples: build atual e seleção por força/cobertura de ataques com a mesma disponibilidade; documentar a regra exata de cada referência.

Avaliar o resultado pelo objetivo do cenário, não pelo próprio score que o recomendador está tentando maximizar. Usar consequências de confrontos observáveis onde possível e revisão explícita das decisões condicionais. Se houver amostragem, registrar sementes e cenários comparáveis; não transformar frequência de vitória contra uma política artificial em chance contra a IA real.

Critérios para avançar:

- Nenhuma recomendação apresentada como utilizável agora exige aquisição não confirmada.
- Nenhuma divergência mecânica conhecida é escondida em um resultado apresentado como validado.
- Casos relevantes demonstram benefício sobre referências simples; regressões são investigadas e documentadas, não ocultadas pela média.
- Explicações correspondem às evidências que influenciaram a escolha e incluem perdas importantes.
- Pequenas perturbações não geram trocas sem benefício material; limiares reais de velocidade ou nocaute podem legitimamente alterar a preferência.
- Se a complexidade adicional não demonstrar benefício, simplificar o algoritmo.

## 4. Testes de integridade e limites do produto

| Situação | Invariante esperado |
|---|---|
| Golpe adquirido antes de evoluir | Preservar a observação; registrar eventual conflito com o catálogo atual. |
| TM disponível antes do nível de aprendizado | Considerar a rota acessível sem exigir as duas condições. |
| Nature/IVs/EVs desconhecidos | Hipóteses identificadas, sem preencher perfeição; preferência condicional quando necessário. |
| Mint, atributos modificados ou dados conflitantes | Usar fonte efetiva escolhida e informar divergência. |
| Zero a três golpes equipados | Aceitar entrada incompleta; não inventar golpes para completar quatro. |
| Dois indivíduos da mesma espécie | Configuração, histórico e disponibilidade independentes. |
| Pack alterado ou importação interrompida | Não substituir snapshot válido por parcial; análises antigas identificadas como desatualizadas. |
| Entrada muda durante o cálculo | Cancelar ou descartar conclusão antiga; não sobrescrever análise nova. |
| Nova disponibilidade é adicionada | Na busca completa, a opção anterior continua candidata; resultado não deve piorar pelo mero aumento de opções. |
| Exportação/restauração e migração | Preservar estado e correções; erros não corrompem a versão anterior. |
| Script ou identificador desconhecido | Preservar diagnóstico e limitar a análise; não executar nem substituir arbitrariamente. |
| Campos herdados, itens alternativos e formatos | Resolver conforme perfil instalado; ausência não vira automaticamente zero, vazio ou singles. |
| RCT retorna objeto padrão para ID ausente | Conferir existência antes de consultar; não aceitar o fallback vazio como treinador capturado. |
| JSON sem callbacks ou assinatura de função conhecida | Registrar a cobertura real; não certificar efeito, dependências ou estado capturado pelo ambiente só pelo JSON/hash. |

## 5. Referências externas usadas na revisão

Fontes de apoio, não substitutas dos recursos locais. Documentação `latest` e código `master` podem divergir das versões instaladas; fixar revisão apropriada ao executar a prova.

- [RCT: treinadores](https://srcmc.gitlab.io/rct/docs/latest/configuration/data_pack/trainers/) — campos, formatos, itens alternativos e regras.
- [RCT: fallback](https://srcmc.gitlab.io/rct/docs/latest/configuration/fallback_data_system/) — herança e resolução.
- [Smogon damage-calc](https://github.com/smogon/damage-calc) e [mecânicas](https://github.com/smogon/damage-calc/blob/master/calc/src/mechanics/gen789.ts) — interface adaptável e implementação dos comportamentos.
- [Showdown: geração de equipes](https://github.com/smogon/pokemon-showdown/blob/master/data/random-battles/gen9/teams.ts) — precedente de regras contextuais; não é solução pronta para a campanha.
- [Electron: segurança](https://www.electronjs.org/docs/latest/tutorial/security) — fronteiras de acesso da aplicação.
- [SQLite: usos apropriados](https://www.sqlite.org/whentouse.html) — adequação a aplicações locais.

## 6. App: estado atual e gates arquiteturais

### Estado atual — 02/10/2026

A entrada padrão do app é `src/main.tsx` → `src/App.tsx` → `src/app/TrainerApp.tsx`. O shell apresenta workspaces de Equipe, PC, Dano, Demonstração e Ajuda/diagnóstico; a ficha por UUID separa resumo, golpes e atributos capturados. A prévia estrutural permanece distinta do cálculo real. Este usa o indivíduo capturado, perfil manual completo do alvo e confirmações explícitas; a demo continua fixa e independente.

`npm.cmd run check` passou em typecheck, 46 testes e build. O harness `node_modules/electron/dist/electron.exe test/electron-trainer-ui-harness.cjs` passou em Electron com fixture/snapshot sintéticos: seleção e dados por UUID, prévia, cálculo real de Gardevoir normal com Synchronize, invalidação por refresh, demo `current`/`cancelled`/`stale`/`failed` e layouts 1440/1200/800 CSS px e 200% de zoom. A captura do resultado está em `.runtime/diagnostics/trainer-ui-snvi41/gardevoir-damage-result.png`. O smoke não leu save real nem provou integridade Medium ou equivalência de batalha. O catálogo passou à revisão v10 (673 espécies); `Trace` segue excluída. O build também reportou um bundle JS acima de 500 kB; a otimização de chunks não fez parte deste recorte.

### Fotografia histórica do preflight arquitetural — 19/09/2026

A revisão de arquitetura definiu testes necessários, mas não os executou porque, **naquela data**, ainda não havia projeto Electron/React/Vite/SQLite/Zod no repositório e a interface não fazia parte daquela etapa. Essa justificativa é histórica: Electron/React/Vite e a UI existem agora. A tabela preserva a fotografia de status de 19/09/2026; seus critérios de passagem continuam futuros quando não há evidência atual de conclusão.

| Área | Teste exigido | Estado em 19/09/2026 | Critério de passagem |
|---|---|---|---|
| Fronteira de dados | Parse do contrato v1 e depois adaptação Zod de snapshot/build/scenario, limites, campos desconhecidos e hash canônico | Contrato puro corrigido: 13/13 na suíte conjunta final e controles independentes; Zod/app pendente | Entrada inválida rejeitada sem mutação; mesma entrada canônica produz a mesma chave |
| IPC | Sender/origem/canal allowlistados; payload/retorno validados | Pendente; preload/main não existem | Renderer não acessa Node/SQL/fs; remetente inválido é rejeitado |
| Cálculo | Job em processo separado com `maxNodes`/`maxMillis`, erro e término controlado | Pendente; núcleo atual é síncrono sem abort cooperativo | Cancelamento não bloqueia a janela; processo terminado não publica resultado parcial |
| Obsolescência | Edição ou nova captura durante job | Pendente | Resultado de geração antiga é descartado e não sobrescreve o atual |
| SQLite | Migração com `PRAGMA user_version`, transação, Online Backup API/exportação, restauração e erro sem corrupção | Pendente; nenhum binding escolhido | Estado observado/planned permanece separado; falha preserva versão anterior |
| Windows | Build empacotada, UtilityProcess, binding nativo, `userData`, caminhos com Unicode/espaços | Pendente; nenhum empacotamento feito | Executável abre em pasta de teste e grava somente em destino permitido |
| Determinismo | Fixture sintético, seed, relógio/UUID controlados e comparação sem timestamps | Parcial somente no núcleo de laboratório; não é teste do app | Reexecução independente produz resultados equivalentes e status de cobertura igual |
| Desempenho | Cold/warm, CPU/RSS, cancelamento e UI sem/com Minecraft aberto | Pendente | Metas publicadas somente após medição; diferença de ambiente fica registrada |

### Critérios futuros de integração

O fluxo previsto de snapshot versionado → seleção de UUID → prévia → cálculo suportado → evidência/limites está implementado e foi exercitado no harness com snapshot sintético, incluindo invalidação após refresh. Isso verifica os contratos locais da UI, não substitui uma captura real autorizada, a prova Medium nem confirmação no jogo vivo. Persistência, restauração, empacotamento e equivalência com a partida continuam gates separados.

Os testes que envolvem o jogo devem continuar separados: arquivos locais são fontes de leitura; nenhuma validação arquitetural autoriza instalar coletor, recarregar KubeJS, reiniciar servidor, iniciar batalha ou escrever save. A matriz acima é o registro histórico dos estados de 19/09/2026; use o resumo atual no início desta seção para o estado do app e preserve os critérios de passagem como gates futuros.
