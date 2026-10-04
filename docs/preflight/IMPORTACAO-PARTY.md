# Importação local da party e do PC

Atualização: 01/10/2026. O painel “Meus Pokémon” e o leitor local estão implementados. `PlayerSnapshot` v2 captura IVs base, overrides observados e EVs com desconhecidos explícitos e procedência. Uma rota separada calcula dano real somente para o subconjunto versionado, com indivíduo selecionado e perfil manual obrigatório do alvo. Execução Medium permanece fora do escopo aprovado; nenhum resultado do host é apresentado como aprovação Medium.

## Fluxo e limites

- A leitura começa somente quando a pessoa aciona **Atualizar do save**. Não há polling nem leitura automática ao abrir o app.
- O processo principal usa `config.json` na raiz do app para obter o diretório do servidor e o UUID do jogador. `server.properties` determina o `level-name`; se a chave simples aparecer mais de uma vez, vale a última ocorrência. A partir do mundo contido no diretório configurado, o leitor acessa os arquivos de party e PC sob seus diretórios Cobblemon.
- O IPC `companion:read-player-snapshot` não aceita argumentos. O preload também rejeita chamadas com argumentos, e o processo principal confere a origem/remetente antes de ler. O renderer não recebe acesso ao filesystem.
- A captura usa somente leitura. Nenhum snapshot é salvo em banco ou arquivo pelo app, enviado ou escrito no jogo. A seleção existe apenas em memória nesta sessão.
- O snapshot informa `capturedAt`, `worldName` e `consistency: "best-effort"`. Isso não é uma transação com o servidor: hashes/metadata são verificados antes e depois da leitura, mas o mundo pode mudar após a verificação. Alterações ainda não salvas no jogo não aparecem.

## Revisão do contrato

- NBT gzip e NBT bruto são aceitos. A descompressão e a entrada têm limites; o parser rejeita truncamento, bytes extras e nomes de chave duplicados em qualquer compound, sem sobrescrever a ocorrência anterior.
- Configuração, `server.properties`, party e PC são lidos com tamanho limitado, hash SHA-256 e comparação da leitura repetida. Mudança observada durante o processo invalida a captura.
- A resolução do mundo e dos arquivos verifica que os caminhos permaneçam dentro do diretório configurado. A importação falha se as fontes necessárias não existirem ou se o mundo não puder ser resolvido.
- UUID é formado a partir dos quatro inteiros NBT. UUID ausente/inválido ou repetido entre party e PC faz a captura falhar; espécie repetida continua permitida porque a chave de seleção é o UUID.
- `MoveSet` representa golpes equipados e `BenchedMoves` representa golpes aprendidos/disponíveis naquele indivíduo. Os campos `equippedMovesKnown` e `learnedMovesKnown` distinguem lista vazia observada de campo ausente; ausência não é mostrada como “nenhum golpe”.
- IDs de espécie, golpe, natureza, habilidade e item são preservados literalmente; IDs namespaced permanecem distintos e os sem namespace continuam sem prefixo. `FormId` passa pela mesma validação, mas o sentinel `unknown` continua representando valor ausente/inválido. O formato aceito é `(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+`, ASCII minúsculo, até 256 caracteres. Campo obrigatório inválido rejeita a captura; campo opcional inválido vira desconhecido com aviso. O contrato de captura não mapeia IDs para o motor; quando o envelope v1 ou o motor exigir namespace, a conversão precisa ser explícita e evidenciada, ou o campo fica bloqueado.
- Nível/PP zero observado permanece zero. Os fatos de `battleStats` diferenciam `known` e `unknown`; ausência não vira zero. Em `hyperTrainedIvs`, `{state: "known", value: null}` significa que a chave não existe em um mapa `HyperTrained` capturado, não que o mapa estivesse ausente.

- O contrato IPC leve `PlayerSnapshot` usa `schemaVersion: 2`, independente do envelope preflight v1 e da fixture de dano. Cada indivíduo carrega `battleStats.ivs` (IVs base), `hyperTrainedIvs` (overrides armazenados) e `evs`. Cada fact inclui `sourceKind` e caminho NBT relativo; `sources` fornece o hash SHA-256 correspondente.
- O mapeamento NBT é estrito: `cobblemon:hp`, `cobblemon:attack`, `cobblemon:defence`, `cobblemon:special_attack`, `cobblemon:special_defence` e `cobblemon:speed`. IVs/overrides aceitam inteiros 0–31; EVs aceitam 0–252 por atributo e soma observada até 510. Ausências ficam desconhecidas, sem defaults; chave/forma/valor não suportados e soma acima de 510 recusam com `ERR_IMPORT_STATS`. Não há IV efetivo, atributo derivado ou cálculo de dano nesta captura.

O leitor reconhece a forma usual `level-name=...`; não interpreta continuações ou escapes da gramática completa de Java Properties. O mundo ativo deve usar essa forma simples, como no `server.properties` gerado normalmente pelo servidor.

## Smoke-read e verificação

Execução local somente leitura em 24/09/2026: `capturedAt` **2026-09-24T07:31:12.246Z**; **6** indivíduos na party e **62** no PC (**68** no total). A saída do smoke continha somente estado, timestamp e contagens; nenhum nome, espécie ou UUID foi impresso.

Rechecagem de 24/09/2026 após preservar IDs de origem: `C:\Program Files\nodejs\npm.cmd run check` passou em typecheck, Vitest **18/18** (4 `compare-flow`, 5 `move-swap`, 9 importer) e build Vite. A suíte do importer cobre leitura gzip/bruta, zero versus desconhecido, listas de golpes ausentes/vazias, UUID duplicado/ausente, mudança durante a captura, preservação literal de IDs namespaced/unnamespaced e rejeição de IDs malformados ou acima do limite. A cobertura de `move-swap` pertence ao fluxo em evolução e não prova o mapeamento de IDs para o motor.

Verificação desta entrega em 28/09/2026: `npm run check` passou em typecheck, Vitest **26/26** (4 `compare-flow`, 5 `move-swap`, 2 `offline-adapter`, 15 importer) e build Vite. A suíte focada passou em **20/20**. Os casos novos cobrem mapeamento dos seis atributos, procedência party/PC, estados ausentes/vazios/parciais, zero e limites IV/EV, dados malformados, totais EV acima de 510, chaves duplicadas e mudança de fonte durante leitura.

Smoke do snapshot real em 28/09/2026: versão **2**, **408 known / 0 unknown** em cada grupo (`ivs`, `hyperTrainedIvs`, `evs`) e todas as referências de fonte válidas. O log não incluiu UUIDs, espécies, valores de stats ou golpes. Uma fixture independente também verificou o mapeamento da API importada sem usar o normalizador para montar os esperados.

## Revisão independente no Electron host

Uma execução monitorada em 24/09/2026 usou Electron 44.4.3, perfil isolado, GPU sem desativação (`gpu_compositing: enabled`) e o harness focado `test/electron-player-import-harness.cjs`. O processo principal (PID 25464) saiu com código **0** e não deixou processos Electron da rodada. Antes dela, uma invocação direta não reteve stdout nem produziu PNG; uma comparação literal de capitalização no harness foi corrigida antes da execução monitorada. Nenhuma alteração de produto foi necessária.

Pelo DOM, o harness confirmou janela e bridge, estado inicial sem leitura, clique em **Atualizar do save**, resposta IPC e **6 party + 62 PC**. As fontes do snapshot foram reconferidas antes/depois; as contagens, o mundo e os 68 valores de seleção por UUID coincidiram com a leitura atual, sem imprimir espécies ou UUIDs no log. A seleção de um indivíduo do PC exibiu os golpes equipados e aprendidos correspondentes ao seu snapshot; o texto da demonstração Pikachu/Floatzel permaneceu igual e declarou sua independência da seleção.

As capturas `apps/cobblemon-companion/.runtime/diagnostics/player-import-host-zoogXL/player-import-overview.png` e `player-import-details.png` foram inspecionadas: metadados, seletor, detalhes e ambos os grupos de golpes aparecem legíveis, com a demonstração em seção separada. O stderr registrou duas mensagens `GPU state invalid after WaitForGetOffsetInRange` depois dos asserts; não impediram o resultado nem as imagens. Não houve investigação adicional da GPU.

Nova execução Electron monitorada em 28/09/2026: o harness focado terminou com código **0** antes do limite externo de 40 s, sem processos descendentes restantes. Após o clique, uma chamada sem argumentos à bridge retornou schema v2; `battleStats` e fontes coincidiram com a leitura independente por UUID. O DOM confirmou **6 party + 62 PC**, a seleção/prévia continuou funcional e separada da demo. As três capturas PNG do perfil isolado foram inspecionadas; o harness não imprimiu identidades nem valores privados.

A demo Electron foi executada separadamente no perfil isolado: DOM confirmou **36/50**, respostas `current`, `cancelled`, `stale` e `failed`, código **0** e nenhum processo descendente. Nenhum dado de party/PC foi ligado à fixture.

A prova de importação supervisionada de 28/09 vale para o host elevado e os arquivos persistidos naquele instante. Ela não certifica atomicidade do save, mudanças ainda não salvas, execução Medium, persistência, ligação da seleção ao cálculo ou recomendação de batalha; a ligação do cálculo real é descrita e exercitada abaixo.

## Cálculo real com perfil manual (implementado)

A tela “Calcular dano com este indivíduo” usa uma rota Electron própria (`companion:calculate-real-damage`), separada do worker, adaptador e fixture offline Pikachu/Floatzel. O processo principal relê o snapshot confiável a cada requisição e calcula apenas quando a seleção continua vinculada a exatamente um UUID e às fontes atuais. Atualizar o save invalida a análise antiga; o app não grava snapshots.

### Entradas e cenário

- O atacante é o indivíduo selecionado, identificado por UUID. O golpe atual é somente o primeiro slot equipado; o candidato precisa constar em `learnedMoves` do mesmo UUID e ainda não pode estar equipado. Nenhum outro slot é alterado.
- Espécie, nível, natureza, habilidade, IVs, Hyper Training e EVs do atacante vêm do snapshot. O IV efetivo usa o override numérico Hyper Trained quando conhecido; `value: null` confirma ausência da chave e então exige IV base conhecido. Cada um dos seis EVs também precisa ser conhecido e válido; não há defaults para facts desconhecidos.
- Um item segurado observado bloqueia. `heldItem: null` no snapshot v2 não prova ausência, por isso a pessoa precisa confirmar explicitamente que o atacante está sem item. Status, HP, aspectos, formas de batalha e condições de campo que o snapshot não captura também exigem confirmações explícitas; nenhum desconhecido é convertido silenciosamente em ausência.
- O alvo não é fixture: o formulário exige espécie compatível, forma normal, nível, natureza, habilidade, seis IVs e seis EVs. IVs/EVs do alvo não recebem valores presumidos; EVs obedecem aos limites individuais e a soma máxima de 510.
- Antes de habilitar o cálculo, a pessoa confirma que o mundo ativo corresponde às versões declaradas (o app não detecta a versão do servidor), o atacante e o alvo começam com HP cheio e sem condições não modeladas, e o cenário não tem clima/terreno/efeitos de campo, barreiras, salas, boosts, Terastallization ou efeitos de troca/habilidade. O perfil manual do alvo não é persistido nem atribuído a um Pokémon do save.
- Cada fato inválido, ausente, desatualizado ou fora do subconjunto resulta em bloqueio sem valor numérico. O processo principal valida novamente o snapshot e as fontes antes de chamar o adaptador.

### Subconjunto compatível versionado

O catálogo exige correspondência entre Cobblemon **1.7.3+1.21.1**, os dados Showdown **16** empacotados no JAR instalado e `@smogon/calc` **0.11.0** / Gen 9. A revisão ativa é `cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v12`; os fingerprints SHA-256 fixados são:

| Fonte | SHA-256 |
| --- | --- |
| JAR Cobblemon | `962d75df4fb649d94863a7a7d130d4d2b3de4da9b3cae4c44b1ce90f37ec0ed5` |
| `showdown.zip` embutido | `1c398031f28fefcb2ce6b44a5ca289061ed4c5d0dccefaae0f7c070b3f7e8d10` |
| Registros de espécies comparados (`data/compat/manifest.json`, seção `species`, JSON canônico) | `5e4ccaf2ba1230fc9d3906692feacd8ae17fdc4daeaf54f85187501ebfba1d27` |

O catálogo publicado contém **841** espécies compatíveis, **320** golpes diretos, **285** habilidades e **25** naturezas. Os IDs aceitos são explícitos; namespace ou forma não são inferidos por sufixo, e apenas aliases literais incluídos no catálogo são reconhecidos. Só a **forma normal** é calculada (o adaptador recusa qualquer `formId` diferente de `normal`), mas a espécie pode ter formas alternativas no Cobblemon, como Gardevoir (Mega). Gardevoir tem somente as habilidades catalogadas `Synchronize` e `Telepathy`; `Trace` continua bloqueada porque copiar a habilidade do oponente não é modelado.

As espécies do catálogo são **derivadas, não digitadas**: `npm run catalog:generate -- --instance <pasta com mods/> [--write]` lê o JAR do Cobblemon fixado (o hash é conferido) e os demais provedores instalados, e grava `data/compat/manifest.json` e o mapa `species`. Uma espécie entra quando (1) está implementada, (2) tipos, atributos-base e peso da forma normal são idênticos aos do `@smogon/calc` Gen 9, (3) nenhum outro provedor altera esses dados de batalha (arquivo de espécie com o mesmo nome ou `species_additions` tocando tipos, atributos, peso ou habilidades) e (4) ao menos uma habilidade da espécie está entre as 285 compatíveis (as habilidades oferecidas são as da espécie nesse conjunto, na ordem original). Dos 1025 arquivos de espécie do JAR, 174 não estão implementados, 9 não têm habilidade compatível (Porygon, Porygon2, Kecleon, Komala, Mimikyu, Wishiwashi, Eiscue, Morpeko, Palafin) e 1 não existe no calc com o nome da espécie-base (Aegislash). A mesma regra reproduz, entrada por entrada, as 673 espécies do v10.

Os 320 golpes e as 285 habilidades **não** são ampliados por esse gerador: ele apenas confere, por comparação de AST (o código do Showdown nunca é executado), que nenhum outro provedor altera essas regras em relação ao Showdown do Cobblemon. Resultado em 03/10/2026 com o Mega Showdown 1.9.3 (que embarca cópias completas de `moves.js` e `abilities.js`): os 320 golpes são idênticos e 8 habilidades diferem; todas foram lidas e só mexem em troca de forma de batalha ou no agrupamento de uma condição (`data/compat/reviewed-overrides.json`). Uma diferença nova bloqueia o gerador até ser revisada.

Limites desta garantia: o gerador lê **uma instalação** (o cliente `All the Mons - ATMons` nesta máquina); o servidor deve rodar o mesmo pacote e o app não detecta se roda. Para conferir, execute o gerador também apontando para a pasta do servidor e compare. Não são cobertos: scripts e comandos que alterem dados em tempo de execução, KubeJS com lógica (somente arquivos de dados de espécie em `kubejs/data`, `global_packs`, `datapacks` e `world/datapacks` são lidos) e a ordem de carga entre provedores (por isso qualquer divergência em dados de batalha exclui a espécie em vez de escolher um vencedor).

Não encontrar um ID no catálogo significa que o mapeamento ainda não foi validado neste recorte; não significa que o Pokémon não exista no servidor.

Os fingerprints identificam as fontes consultadas; a prova de cobertura é o manifesto versionado e reproduzível, não o fingerprint isolado.

Golpes de carga com múltiplas ações (`Dig`, `Dive`, `Electro Shot`, `Freeze Shock`, `Ice Burn`, `Meteor Beam`, `Phantom Force`, `Shadow Force`, `Skull Bash`) e golpes dependentes de histórico/estado não capturado (`Belch`, `Burn Up`, `Double Shock`, `Fake Out`, `First Impression`, `Last Resort`, `Focus Punch`, `Sucker Punch`, `Thunderclap`, `Upper Hand`, `Dream Eater`, `Snore`) não estão no catálogo. Também são excluídos os golpes Z/Max identificados nos dados (`isZ`/`isMax`), `Poltergeist` (exige item do alvo), `Raging Bull` (forma) e `Tera Starstorm` (Tera/forma). Os golpes de histórico dependem de uso prévio/consumo, ausência de interrupção, status ou escolha do golpe do alvo, fatos não representados na captura. Também são removidas habilidades com dependências incompatíveis com o estado recebido, entre elas `Rivalry` (gênero), `Analytic` (ordem de ação), `Download` (boost de entrada), `Protean`/`Libero` (tipo por ativação), `Parental Bond` (golpe adicional), `Supreme Overlord` (equipe derrotada), além de habilidades que copiam habilidade, mudam tipo/forma ou dependem de estado de combate ausente. O catálogo e o teste de compatibilidade listam os bloqueios vigentes.

### Resultado e limites

Para cada golpe, o motor calcula os 16 rolls de dano e mostra somente mínimo–máximo **se acertar**. O perfil usa Gen 9, singles, um alvo e uma ação direta; não estima precisão, crítico, efeitos secundários, nocaute, turnos futuros, ranking ou recomendação. Não é simulação da batalha nem garantia do resultado real contra regras/configurações de servidor diferentes.

Cada resultado inclui a revisão do catálogo/adaptador, versões e fingerprints, metadados de captura e hashes das fontes, vínculo pelo UUID e digest SHA-256 das entradas. O hash não transforma a captura best-effort em transação atômica nem confirma que o estado de batalha corresponda às declarações manuais.

### Verificação

Em 01/10/2026, `npm.cmd run check` passou em typecheck, **34/34 testes** e build Vite. `npm.cmd exec electron -- test/electron-real-damage-harness.cjs` confirmou que o formulário inicia bloqueado, permanece bloqueado até todas as confirmações, calcula duas faixas iguais ao adaptador e exibe revisão/digest; o log contém somente resultados agregados e a captura foi inspecionada visualmente. `npm.cmd exec electron -- test/electron-runtime-harness.cjs` confirmou a demo independente em **36/50**, além dos estados `current`, `cancelled`, `stale` e `failed`.

Uma revisão adicional de `test/electron-trainer-ui-harness.cjs` executou o fluxo de dano com snapshot sintético em viewport de **1186×852 CSS px**: após marcar a primeira confirmação, o formulário permaneceu renderizado e o cálculo completo apresentou seus dois ranges. Essa prova cobre a fixture sintética, não identifica a causa de uma tela vazia em outro ambiente.
