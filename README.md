# Companion local de movesets Cobblemon

Aplicativo desktop Electron/React para ler a party e o PC do jogador e rascunhar uma troca de golpe em um indivíduo identificado por UUID. Este diretório é a raiz do app: a pasta que contém `package.json` é onde os comandos abaixo devem ser executados.

Documentação completa: [índice do projeto](./docs/README.md), [guia técnico para agentes](./docs/GUIA-TECNICO.md), [contexto automático do Claude](./CLAUDE.md), [plano](./docs/PLANO.md), [decisões](./docs/DECISOES.md), [validação](./docs/VALIDACAO.md), [changelog](./CHANGELOG.md), [contrato do cálculo real](./docs/preflight/IMPORTACAO-PARTY.md) e [handoff para outro agente](./HANDOFF.md).

## Uso como pasta independente

O pacote pretendido contém somente este app, por exemplo em `D:\Dev\cobblemon-companion`. Copie os arquivos listados em [HANDOFF.md](./HANDOFF.md), abra um terminal nessa pasta e use Node.js 22 ou superior com npm:

```powershell
npm ci
npm run prepare:ui-assets # opcional; preparação local explícita de ilustrações
npm run check
npm run start
```

Prefira `npm ci`, que instala conforme o `package-lock.json`. `prepare:ui-assets` baixa recursos de fontes externas (renders do Pokémon HOME, ícones de tipo, categoria e item; revisões fixadas, exceto os ícones de categoria do Pokémon Showdown) e requer rede, mas é opcional; sem ele, a interface mostra “Imagem indisponível”, ícones neutros e não busca imagens durante o uso. `check` executa typecheck, testes e build. `start` também constrói a interface e abre o Electron. O build gera `dist/`; essa saída não precisa ser copiada.

Prova standalone registrada em 24/09/2026 em `D:\Dev\cobblemon-companion`: `npm ci` instalou 119 pacotes e `npm run check` passou em typecheck, build e 20 testes. A leitura local, somente leitura e best-effort, encontrou 6 indivíduos na party e 62 no PC. Esses totais pertencem àquela captura, não descrevem permanentemente o save.

Na prova standalone de 24/09/2026, o harness supervisionado Electron 44.4.3 confirmou janela, IPC e importação; aquela execução não exercitou a UI move-swap. Em 02/10/2026, o harness Electron do `TrainerApp` confirmou prévia por UUID, cálculo real via snapshot sintético, invalidação após refresh, independência e estados da demonstração, além de layouts em 1440, 1200, 800 CSS px e 200% de zoom. Nenhum save real foi lido nessa verificação. Integridade Medium continua sem aprovação.

## Configuração local do save

A importação precisa apenas do caminho absoluto `serverRoot` do servidor e do `playerUuid` do jogador. Não precisa de trainer ID, treinador, cap ou configuração de tipos. O `serverRoot` aponta para o diretório que contém `server.properties`; o nome do mundo é lido desse arquivo. A pessoa inicia cada leitura no botão **Atualizar do save**.

O importador lê `config.json` na raiz desta pasta e usa apenas `serverRoot` e `playerUuid`. O arquivo presente nesta cópia contém dados pessoais do servidor e jogador: trate-o como privado e não o inclua em distribuição pública. Para outra instalação, copie [`config.example.json`](./config.example.json) para `config.json` e substitua os dois valores. A configuração pessoal pode permanecer na instalação local de `D:\Dev` para uso imediato.

Essa configuração não escolhe treinador, cap ou tipos. O save continua sendo lido somente quando a pessoa aciona a atualização.

## O que o app faz

- Lê party e PC localmente e sob demanda; identifica cada indivíduo por UUID e exibe separadamente os golpes equipados (`MoveSet`) e aprendidos (`BenchedMoves`). O snapshot IPC v2 também captura IVs base, overrides de Hyper Training e EVs com valores desconhecidos preservados; a aba **Atributos** apresenta esses fatos sem derivar valores ausentes.
- Permite montar em memória uma prévia estrutural de troca de um slot por um golpe observado como aprendido naquele indivíduo. O botão “Abrir cálculo de dano” leva direto ao workspace real de dano com o mesmo UUID e o slot escolhido, sem caixa de confirmação; não equipa nem ensina golpes.
- “Calcular dano com este indivíduo” usa o perfil capturado do atacante e um perfil manual completo do alvo para comparar dano mínimo–máximo de golpes compatíveis. É uma rota separada e bloqueia dados desconhecidos ou condições não confirmadas.
- A demonstração offline continua fixa em Pikachu/Floatzel: Spark contra Thunderbolt, um alvo e uma ação. O formulário e a fixture são independentes da seleção do save e do rascunho de troca.
- `src/main.tsx` monta `TrainerApp`, com workspaces próprios de Equipe, PC, Dano, Demonstração e Ajuda/diagnóstico. As ilustrações locais são opcionais e usam fontes/revisões fixadas; os avisos de direitos estão na interface.

O app não recomenda uma build geral, não simula a luta inteira nem prevê a IA adversária. A rota real apresenta apenas rolls se o golpe acertar, dentro do subconjunto e das condições declaradas; não estima precisão, críticos, nocaute ou ranking. A importação não grava no save, não envia comandos ao servidor, não executa scripts de mods e não persiste snapshots em banco.

## Portabilidade e limites

Worker, adaptador, parser NBT e catálogo versionado estão dentro das pastas do app; não há dependência executável do battle-planner fora desta pasta. A fixture mantém a demonstração Pikachu/Floatzel fixa, usa UUIDs sintéticos e registra caminhos relativos ao app. Os harnesses Electron cobrem importação, prévia de troca e as rotas real/demo. Integridade Medium não foi avaliada por decisão do usuário; a prova no host não implica aprovação Medium.

O cálculo real usa `@smogon/calc` 0.11.0 / Gen 9 e o subconjunto Cobblemon 1.7.3+1.21.1 identificado em [Importação party/PC](./docs/preflight/IMPORTACAO-PARTY.md). O app não detecta a versão do mundo ativo: exige perfil manual completo do alvo e confirmação explícita das condições sem defaults. Formas/aspectos alternativos, mecânicas com estado ausente, outras versões e simulação de batalha permanecem fora do escopo.

Consulte [HANDOFF.md](./HANDOFF.md) para o inventário mínimo de cópia, riscos e estado estático desta entrega.
