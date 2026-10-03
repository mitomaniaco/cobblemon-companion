# Frente 1 — dados e compatibilidade

Data: 19/09/2026  
Estado: **prontidão parcial; fontes estáticas coerentes, snapshot de packs atualizado, registro efetivo e ponte viva ainda não certificados**.  
Escopo: procedência, precedência, limites do coletor, hashes, snapshots, cobertura e bloqueios para a primeira fatia. Não houve revisão de party/PC nem recomendação de Pokémon.

## Resumo executivo

O experimento sustenta uma reconstrução offline útil para laboratório, mas ainda não sustenta o rótulo “dados efetivos do servidor”. A evidência histórica de 08/09 continua internamente consistente para os arquivos que ela hashou. O `level.dat` ativo mudou desde então; gerei um snapshot novo e versionado dos packs sem substituir o histórico. A lista de packs continua igual (35 habilitados, 13 desabilitados), mas isso cobre apenas metadados do mundo, não o registro Cobblemon em memória.

Conclusão operacional:

- **Pode avançar:** testes sintéticos, reconstrução offline e um primeiro slice explicitamente rotulado como laboratório/reconstrução.
- **Não pode declarar:** compatibilidade viva, equivalência com o registro atual, resolução final de conflitos ou suporte mecânico geral.
- **Bloqueio principal:** concluir uma captura autorizada no contexto do servidor, com procedência, versões, scripts relevantes e mapeamento de itens/treinadores; o rascunho atual não registra comando nem publica snapshot real.

Não iniciei interface/app, não instalei dependências, não executei código de mod remoto, não alterei servidor, mundo, save ou `battle-planner`.

## Achados priorizados

### P0 — o snapshot histórico do mundo estava obsoleto

O servidor/mundo verificado continua sendo `D:\Games\Minecraft`, com `server.properties` apontando `level-name=world`. O hash registrado em `experiments/cobblemon-compatibility/results/world-packs.json` era:

```text
08/09: 3037ab46d8ac51428c533e0be750249995144b893e92b655637ace29d27e6794
19/09: 6ecf86ff3f74faf47ad20111c198e606c8d814430b545be0a034bcd183adf9ae
```

O `level.dat` atual foi gravado em 19/09. Portanto, o artefato antigo não podia ser usado como snapshot atual, mesmo que os JARs e configurações estáticas permanecessem iguais.

Foi criada uma saída separada em `experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19-final.json`. A leitura confirmou o hash atual `c0b3e6fd80c1e6100bd83f27b26696ce82aaec0332d2722ee36d5fa26c625a0f`, profundidade máxima NBT registrada de 128, 35 packs habilitados e 13 desabilitados. A comparação com o snapshot antigo não encontrou diferença nas listas de packs. Isso **reduz** o risco conhecido de mudança de pack, mas não prova que os registros finais em memória ou scripts carregados sejam iguais.

Para não destruir a evidência histórica, `experiments/cobblemon-compatibility/world-packs.cjs` agora aceita saída opcional e limite NBT opcional, mantendo 64 como padrão e 128 como máximo. O parser relê o arquivo no fim e rejeita uma captura cujo hash mudou durante a leitura. O README do experimento documenta a invocação versionada. Isso detecta gravação concorrente, mas não garante snapshot atômico do servidor.

### P1 — inventário amplo, resolução efetiva estreita

O inventário (`experiments/cobblemon-compatibility/results/inventory.json`) de 08/09 lista 402 JARs e 143 recursos selecionados:

| Categoria | Quantidade | Estado |
|---|---:|---|
| Recursos Showdown | 118 | texto/dados selecionados; scripts não equivalem ao runtime inteiro |
| Espécies | 14 | recorte fixo, não catálogo completo |
| Adições de espécie | 6 | inclui as duas definições conflitantes de Mega Raichu e as duas de Mega Starmie |
| Treinadores | 5 | Brock, Misty, Surge, Giovanni e Lorelei |
| JARs com hash no inventário | 9 de 402 | somente os JARs que contribuíram recursos selecionados |

As cinco configurações registradas e os JARs selecionados/referenciados pelos manifestos de loader/exportação foram conferidos novamente: **38 checagens de arquivo, todas `MATCH`**, com sobreposição entre manifestos. Isso é uma boa garantia de que a reconstrução reproduz as entradas registradas; não é um hash do conjunto efetivo inteiro.

O resolvedor testado em `experiments/cobblemon-compatibility/results/loader-tests.json` tem seis verificações e encontra duas colisões. Para Mega Raichu, ele prevê a definição raiz do Mega Showdown sobre a definição em `generation1`, sob o caminho de carregamento inspecionado. A conclusão depende de os recursos chegarem a esse loader sem transformações adicionais e da prioridade de packs upstream. Não foi observada a registry final em execução.

Limites concretos:

- prioridade de packs para recursos de caminho idêntico não é reconstruída de forma geral;
- JARs aninhados e outras fontes de loader permanecem fora;
- alterações somente em bytecode/código não aparecem no JSON selecionado;
- a ausência de duplicata no inventário é ausência no recorte encontrado, não prova de ausência no registro final;
- `showdownMapping` dos itens continua não capturado.

### P1 — KubeJS executável não está no snapshot de fontes efetivas

O coletor estático lê `kubejs/data` apenas quando encontra recursos no padrão selecionado; ele não inventaria/hashia a árvore executável `kubejs/server_scripts`, `kubejs/startup_scripts` nem toda a configuração KubeJS. Há scripts relevantes no ambiente lido, por exemplo:

- `kubejs/startup_scripts/catch_restrictions.js` registra `BATTLE_STARTED_PRE` e contém caminhos que cancelam uma batalha conforme região/progressão;
- `kubejs/server_scripts/mods/Radical Cobblemon Trainers/joey_migration.js` acessa memória de batalha do RCT e avança progresso;
- `kubejs/server_scripts/Tweaks/disable_mons.js` gera alterações de pools de spawn;
- `kubejs/config/common.json` foi modificado em 19/09 e não está entre os hashes do inventário antigo.

A leitura desses arquivos foi estática e não executou KubeJS. Não há evidência de que todos alterem o dano dos líderes examinados, mas há evidência suficiente para não tratá-los como inexistentes. A primeira captura viva deve classificar/hashiar os scripts e configurações relevantes ou declarar formalmente por que cada um está fora do recorte.

### P1 — coletor preparado, porém não instalável nem vivo

O rascunho do coletor (`experiments/cobblemon-compatibility/collector-draft.js`) tem um adaptador Java explícito e boas salvaguardas: IDs de treinador verificados antes do getter, limites, rejeição de funções/acessores/ciclos, duas passagens e detecção limitada de mudança. Porém:

- não registra comando;
- não chama Graal/Rhino real;
- não escreve publicação real;
- não garante snapshot atômico;
- não captura callbacks, Dex vivo, packs de origem, desbloqueios individuais ou política da IA;
- resolve presença de item no registro Minecraft, mas não prova o mapeamento para o item de batalha.

Os 32 testes do coletor usam objetos Java simulados. Eles validam contratos do adaptador, não a ponte Java/KubeJS no servidor. O próprio artefato marca `liveCapture=false` e `javaInteropValidated=false`.

### P2 — cobertura mecânica não equivale a suporte do jogo

Os resultados offline são reprodutíveis:

- 24 testes-base passaram;
- 169 cenários de dano passaram, com 2.704 rolagens coincidentes;
- 8 casos de eventos passaram;
- 6 verificações de loader passaram;
- 6 testes de fronteira de serialização passaram;
- 32 testes de contrato do coletor passaram.

Esses testes cobrem fixtures sintéticos e uma reconstrução controlada do Showdown local. Não validam IA RCT, decisões de cura/troca, distribuição de RNG no jogo, registro vivo, toda a procedência de itens, todos os callbacks ou a qualidade do recomendador. Giovanni e Lorelei aparecem no inventário estático como `GEN_9_DOUBLES`; os três líderes do primeiro recorte não declaram formato no JSON individual e o padrão singles foi confirmado apenas no construtor inspecionado. Giovanni não deve ser usado como padrão de progressão.

A configuração estática registrada inclui `initialLevelCap=15`, `relativeLevelCap=0` e `allowOverLeveling=false`, mas isso não identifica sozinho o cap atual do jogador nem substitui a confirmação do encontro/estado de progressão.

## Distinção de estados de evidência

| Estado | O que está demonstrado | O que continua proibido concluir |
|---|---|---|
| Sintético | contratos do coletor, limites, casos de dano/eventos e comparação determinística | que o servidor carregará as mesmas classes/objetos |
| Reconstrução offline | recursos selecionados de JARs, scripts fixados por hash e regras derivadas de bytecode | que a precedência efetiva, callbacks e registro final são idênticos |
| Jogo vivo | nenhum registro de batalha ou registry foi capturado nesta frente | compatibilidade atual, IA, itens resolvidos ou vitória |
| Packs do mundo atual | `level.dat` atual lido, hash conferido e listas 35/13 iguais ao snapshot anterior | snapshot atômico do servidor ou equivalência dos registros em memória |

## Testes e verificações executados nesta atualização

Todos foram locais, somente leitura do servidor/instalação ou escrita no diretório do experimento. Não houve comando no Minecraft, reload, reinício ou instalação.

1. Conferência de existência do servidor, mundo e `level.dat`; `level-name=world` confirmado.
2. Conferência de hashes dos arquivos previamente registrados: 38 checagens, todas coincidentes.
3. Reconciliação dos hashes cruzados de `inventory.json`, `runtime-tests.json`, `gym-tests.json` e manifesto de exportação: três relações, todas coincidentes.
4. Primeira tentativa do parser atual: falhou com `NBT depth limit` em 64, sem produzir saída.
5. A primeira leitura com profundidade 128 gravou uma captura intermediária, mas o pós-check mostrou nova gravação do mundo; ela ficou classificada como diagnóstico. Após a proteção contra mudança durante a leitura, a captura final com profundidade 128 passou; o hash do artefato confere com o arquivo atual no pós-check e as listas de packs foram comparadas sem diferenças.
6. `node --check` em oito scripts do experimento: 8/8 passaram.
7. Parser estático do PowerShell em seis scripts de inspeção/verificação: 6/6 passaram.

Os relatórios históricos registram duas execuções determinísticas das baterias; não as reexecutei contra a saída padrão para não sobrescrever timestamps e resultados históricos. Depois da pequena alteração em `world-packs.cjs`, o hash do script mudou; portanto, o `verification.json` histórico continua sendo evidência da versão anterior e não é apresentado como verificação da nova versão.

## Pendências e critérios de passagem

### Próximas ações locais seguras

- manter separados o snapshot antigo, a captura intermediária instável `experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19.json` e o snapshot final conferido (`experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19-final.json`);
- produzir um manifesto atual de hashes dos scripts/configurações KubeJS relevantes, sem executar esses scripts;
- resolver e documentar precedência efetiva para as fontes que entram na primeira análise, rejeitando colisões desconhecidas;
- atualizar uma verificação versionada do experimento contra os novos artefatos, sem reclassificar automaticamente mecânicas novas como suportadas;
- confrontar a amostra de dados com observação de batalha/log suficientemente completa quando houver evidência autorizada.

### Intervenção que exige autorização explícita

Para confirmar registro vivo, callbacks e alternativas de item em memória, será necessário executar um coletor conhecido dentro do servidor, com comando administrativo, destino de saída fora do save e procedimento de instalação/reinício previamente aprovado. O `kubejs export debug` não é uma consulta neutra porque chama `reload`; `kubejs eval` não deve ser presumido em produção; servidor web não deve ser habilitado para contornar isso. Nenhuma dessas intervenções foi feita.

Uma confirmação mecânica adicional pode exigir nova batalha no mundo do usuário ou um log completo. Isso também depende de autorização e deve ser classificado como confirmação no jogo vivo, não como teste sintético.

### Gate para a primeira fatia do app

O primeiro slice offline pode começar somente se expuser claramente `snapshotId`, data/hash, procedência, estado de cobertura e limitações. O gate de compatibilidade viva exige, no mínimo:

1. snapshot atual identificável do registro efetivo e dos recursos relevantes;
2. precedência/colisão resolvida ou marcada como incompatível;
3. trainer IDs exatos, formato, regras de item e alternativas de item confirmados;
4. scripts/callbacks relevantes identificados sem execução arbitrária no app;
5. ao menos uma amostra comparada com comportamento observado;
6. nova verificação com hashes versionados, preservando os artefatos de 08/09.

Até esses itens, o resultado correto é “reconstrução offline” ou “inconclusivo”, nunca “confirmado no jogo vivo”.

## Arquivos alterados nesta frente

- [01-DADOS-COMPATIBILIDADE.md](01-DADOS-COMPATIBILIDADE.md) — este relatório.
- `experiments/cobblemon-compatibility/world-packs.cjs` — saída e limite NBT opcionais, sem mudar o padrão histórico.
- README.md do experimento (`experiments/cobblemon-compatibility/README.md`) — documentação da saída versionada.
- `experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19.json` — captura intermediária mantida como diagnóstico de mudança concorrente.
- `experiments/cobblemon-compatibility/results/world-packs-live-2026-09-19-final.json` — snapshot de metadados conferido contra o `level.dat` atual no pós-check.

Não foram editados documentos compartilhados, `battle-planner`, JARs, configurações do servidor, mundo, saves ou arquivos de party/PC.
