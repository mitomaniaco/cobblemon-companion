# Changelog

## Não lançado

- Revisão do motor de batalha, do guia e da UI (Issues #175–#191): `damageRolls` normaliza dano fixo e multi-hit do calc; catálogo v14 com espécies habilitadas por adição, 158 formas alternativas e golpes com mecânica modelada (Sucker Punch, Fake Out só no primeiro turno, multi-hit, dano fixo); forma do jogador (`formId`) e do adversário (`aspects`) resolvidas pelo catálogo; plano de batalha de volta ao fail-closed, com clima, terreno, Intimidate, itens alternativos pelo pior caso e lead do slot 0; simulação determinística da batalha inteira (D16); estabilidade do time pela recomendação anterior com aviso de mudança; golpes do save sem namespace deixam de ser sugeridos como aquisição; progresso do RCT com ids `rctmod:` e leitura fail-closed; guia em abas por ferramenta com cálculo ao abrir; tinta das cores de tipo com contraste ≥ 4,5:1 e tipos/arte de forma pela chave `formId` sem tabelas de alias.

- Planos de captura agora recebem o progresso regional Pika Star de `GuideProgress` e marcam o requisito como cumprido, pendente ou não verificado conforme conhecido.

- Lê progresso RCT e Pika Star somente leitura, deriva o level cap e o próximo objetivo da campanha quando os dados estão disponíveis, e notifica mudanças de progresso por IPC separado do snapshot.
- Conta na descoberta de contas que nomes ASCII diferenciam maiúsculas/minúsculas sem depender da locale e rejeita `server.properties` acima de 1 MiB.
- Catálogo de compatibilidade v11: 841 espécies (eram 673), derivadas de `data/compat/manifest.json` por `npm run catalog:generate`. Inclui espécies com formas alternativas (só a forma normal é calculada), como Charizard, Alakazam e Gengar. O gerador confere o JAR do Cobblemon fixado, exclui espécies cujos dados de batalha outro provedor altera e compara golpes/habilidades do catálogo com o Showdown do Mega Showdown por AST (8 habilidades revisadas, só troca de forma). Golpes (320) e habilidades (285) não mudaram.
- Adiciona uma tela de erro diagnóstica na raiz do renderer: exceções de renderização ou erros globais mostram um diagnóstico sanitizado e copiável em vez de uma janela vazia. Nada é enviado pela rede e não há novo IPC.
- Redesign temático (fase A): novos tokens (azul-noite, cor por tipo, Rubik), `PokeBallMark`, primitivos restilizados, nova casca com sidebar agrupada, detalhes da captura em diálogo, Ajuda e Dano carregados sob demanda e contenção de rolagem da casca (`overflow: clip`, `focus({preventScroll})`).
- Redesign temático (fase B): equipe em seis slots e PC em grade de caixa de 6 colunas, com tipos, nomes e poder dos golpes exibidos a partir dos dados do `@smogon/calc` (módulo virtual `virtual:display-dex`, só exibição). Golpes fora do catálogo passam a mostrar o nome do Showdown (`Calm Mind`). Slots passam a ser exibidos a partir de 1.
- Redesign temático (fase C): ficha do indivíduo com hero colorido pelo tipo, resumo com natureza (aumento/redução), golpes como tiles e chips por tipo (`MoveChip`) e radar de IVs (`IvRadar`) com barras decorativas na tabela de atributos.
- Redesign temático (fase D): demonstração como prévia de batalha, com faixa de confronto Pikachu → Floatzel (tipos), duas colunas por container query e `HpBar` (HP restante, faixa hachurada entre dano mínimo e máximo) no resultado.
- Redesign temático (fase E): planejador de dano com faixa de confronto, checklist do cenário (rótulo + detalhe), resultado com `HpBar` e diferença entre golpes; a prévia de troca de golpe mostra os tipos e não exige mais a caixa "Confirmo que esta é apenas uma proposta local" (o cálculo continua exigindo as cinco confirmações do cenário).

## 2026-10-02 — R1: Central de treinador

- Substitui a apresentação inicial por workspaces de Equipe, PC, Dano, Demonstração e Ajuda; o detalhe individual separa resumo, golpes e atributos capturados.
- Mantém identidade e propostas por UUID, invalida prévias e resultados dependentes quando a captura muda e encaminha ao cálculo real; as cinco confirmações do cenário continuam obrigatórias para habilitar o cálculo.
- Preserva a demonstração Pikachu/Floatzel como fluxo offline independente da captura do jogador.
- Adiciona preparação local e explícita de artwork com fontes e revisões fixadas. A preparação é opcional, não ocorre durante o uso e não autoriza redistribuir as imagens.
- Exercita os fluxos do TrainerApp no Electron com fixture sintética e verifica layouts em 1440, 1200, 800 CSS px e 200% de zoom.
- Inclui Gardevoir normal no catálogo compatível v10 com `Synchronize` e `Telepathy`; `Trace` permanece excluída por depender de copiar habilidade contextual. O adaptador continua v9 e os fingerprints das fontes não mudam.
