# Captura dos dados efetivos do servidor

Data: 08/09/2026. Estado: **rotas instaladas inspecionadas; protótipo da parte A preparado e testado fora do jogo; integração viva, comando e gravação ainda pendentes**. Nada foi instalado. Complementa o [plano](PLANO.md) e as [provas de compatibilidade](PROVA-COMPATIBILIDADE.md).

## Conclusão

Nas rotas examinadas, não foi encontrada uma exportação pronta que cubra, sozinha, os dados finais e as alterações mecânicas necessárias. Há APIs úteis para construir um coletor pequeno usando o **KubeJS já instalado**, sem exigir inicialmente outro mod.

A preparação local começou pelo núcleo e pelo adaptador de leitura Java descritos abaixo. Ainda é necessário concluir a integração e testá-la antes de solicitar autorização para instalação. A captura será pontual, acionada explicitamente, sem alterar a party, os treinadores ou as regras. O app continuará independente do Minecraft depois da importação; isso não muda a decisão de não incluir um servidor web próprio.

Não é necessário exportar todo o jogo para começar: o recorte continua sendo Brock, Misty, Surge e as espécies/formas usadas no laboratório. Mega Raichu pode ser consultado como sentinela do conflito, sem ganhar suporte no recomendador por isso.

## O que já existe e por que não basta

| Rota instalada | Resultado da inspeção | Decisão para esta prova |
|---|---|---|
| `kubejs export debug` | Cria `DataExport` e executa `reload`. Também escreve arquivos de diagnóstico e pode remover arquivos antigos da pasta de exportação. | Não usar como consulta neutra nem acionar silenciosamente. |
| `kubejs export pack-zips` / `pack-folders` | Seleciona packs que implementam `ExportablePackResources`, com extensão via proxy. Não é uma exportação geral dos registros finais do Cobblemon/Showdown. Pode substituir saídas anteriores. | Material auxiliar, não solução principal. |
| `kubejs dump registry …` | Consulta registros Minecraft e envia entradas ao chat/console, incluindo nomes e informações de classe. | Útil para diagnóstico de identificadores, não para copiar a mecânica de batalha. |
| `cobblemon info` | Metadados de versão/build. | Identificação, não catálogo efetivo. |
| `querylearnset` | Consulta a elegibilidade de um golpe no learnset da forma do Pokémon selecionado. | Não exporta o catálogo nem prova que aquele indivíduo desbloqueou o golpe. |
| `ShowdownService.getRegistryData(type)` | O serviço Graal chama `getData` em JavaScript, que faz `JSON.stringify(registry.all())`. | Útil para dados declarativos; funções são omitidas. Não é um backup executável das mecânicas. |
| Servidor web do KubeJS | `enabled=false` no arquivo consultado. | Não habilitar uma interface de rede para resolver esta captura local. |

O comando `kubejs eval` só é registrado quando `FMLLoader.isProduction()` é falso no código instalado. Não contar com sua disponibilidade na instalação normal, nem mudar esse modo para contornar a restrição.

Limite da busca: inspeção direcionada dos comandos e APIs do Cobblemon, RCT e KubeJS, com 14 classes registradas. Não é prova de inexistência de qualquer exportador em todos os 402 JARs.

## Prova da perda de informação

Foram executados seis testes de fronteira de serialização, duas vezes, com resultados idênticos. São testes no perfil de laboratório, não consultas ao servidor em memória.

- **Grass Knot:** o JSON mantém `basePower: 0`, mas perde `basePowerCallback`, que define a potência variável. Interpretar esse zero como ausência de dano seria incorreto.
- **Volt Absorb:** perde `onTryHit`, responsável pela interceptação do golpe.
- **Nasty Plot:** preserva `{spa: 2}` em `boosts`; alguns efeitos são dados declarativos e sobrevivem à exportação.
- A API lista cinco registros: habilidade, item de bolsa, item segurado, golpe e espécie. Scripts globais e tabela de tipos não são categorias dessa API.
- Dois objetos podem gerar JSON idêntico e conter funções diferentes.
- Duas funções podem ter o mesmo texto e usar valores diferentes capturados do ambiente. Portanto, **hash de função é identificação de código, não prova completa de comportamento**.

Consequência: separar **dados observados**, **identificação das alterações de código** e **cobertura mecânica validada**. Nunca aprovar automaticamente uma mecânica porque seu JSON foi importado ou seu callback recebeu um hash.

## Coletor mínimo recomendado

### A. Dados efetivamente carregados

1. **Identificação da captura:** versão do formato/coletor, instante, versões dos mods relevantes e estado de carregamento. Distinguir captura viva de reconstrução estática ou fixture sintético.
2. **Espécies e formas:** consultar os objetos finais do `PokemonSpecies`, por identificador completo, e copiar somente os campos necessários por acesso explícito. Preservar aspectos, unidades e dados de aprendizado; não deduzir desbloqueios do jogador.
3. **Treinadores:** consultar os três IDs exatos em `TrainerManager`. Conferir `isValidId` **antes** de `getData(String)`: o método retorna um novo objeto padrão quando o ID não existe. Não transformar ausência em equipe válida.
4. **Itens:** registrar as alternativas originais, quais IDs existem no registro Minecraft e a primeira alternativa válida segundo a regra inspecionada do RCT. Registrar separadamente o mapeamento para o item de batalha; existência de um item Minecraft não prova esse mapeamento.
5. **Recursos efetivos:** registrar o pack de origem dos recursos relevantes quando a API o informar. Uma origem não recuperável permanece desconhecida; não inventar procedência por campo a partir do valor final.

Não instanciar Pokémon ou treinadores só para converter dados: isso pode gerar UUIDs, atributos ou outros estados desnecessários. Não ler party, PC, UUIDs dos jogadores, inventário, credenciais ou histórico de batalhas nesta captura de catálogo.

### B. Integração com o motor de batalha

Comparar os dados Java com os valores efetivos do Dex e registrar as alterações relevantes em golpes, habilidades, itens, condições, tabela de tipos e scripts globais. Acessar somente as estruturas explicitamente revisadas; não serializar todo o contexto JavaScript ou objetos Java por reflexão indiscriminada.

Callbacks devem ser tratados como evidência para revisão e comparação com perfis conhecidos, **não como código para executar automaticamente no app**. Fechamentos, referências globais e dependências não capturadas precisam constar nas limitações. A confirmação de dano/eventos continua necessária.

As partes A e B têm cobertura independente. Se A funcionar e B falhar, o resultado pode servir para inspecionar os dados, mas não certifica as mecânicas do encontro.

## Segurança e consistência

- Preferir um arquivo pequeno de `server_scripts` do KubeJS que apenas registre um comando administrativo; nenhuma coleta automática a cada tick ou ao iniciar uma batalha.
- Carregar o coletor em uma reinicialização normal **combinada com o usuário**. Não provocar `reload` ou reinício para instalá-lo sem autorização. Não habilitar HTTP, RCON ou modo de desenvolvimento.
- Restringir a saída a uma pasta exclusiva fora do save, definida na instalação, sem substituir exports anteriores. Arquivo parcial não deve ser publicado como captura completa.
- Conferir prontidão e interromper a captura se houver recarregamento. Copiar os dados em contexto de execução apropriado e mover apenas a escrita de cópias imutáveis para outra thread, se necessário.
- **`ShowdownThread.queue` não é garantia de execução em outra thread:** após a inicialização, o código inspecionado chama a ação imediatamente na thread chamadora. Não usá-lo como mecanismo de isolamento/serialização sem validar o contexto.
- Não forçar inicialização, reiniciar, invalidar caches ou recarregar o motor para obter um resultado. A própria consulta do Dex pode preencher caches internos; leitura de catálogo não significa ausência absoluta de efeitos internos.
- Definir limites de tamanho/tempo e rejeitar tipos desconhecidos, referências cíclicas e acessores não revisados. Não mascarar falhas de captura como dados vazios.
- A conclusão deve identificar a cobertura por seção. Hashes antes/depois detectam mudanças nas fontes observadas; não garantem sozinhos consistência de todos os objetos em memória.

## Protótipo preparado após a inspeção

O rascunho do coletor (`experiments/cobblemon-compatibility/collector-draft.js`) contém um núcleo sem acesso ao jogo e um adaptador Java com acessos explícitos às APIs inspecionadas. **Não é um arquivo pronto para copiar para `server_scripts`: não registra comando, não publica arquivos e não acessa Graal.**

Parte A implementada no rascunho:

- Escopo fixo de 14 espécies, suas formas e os três IDs de treinadores. Preserva tipos, atributos-base, peso/altura na unidade original, nomes e prioridades de habilidades, rotas de aprendizado, equipe, bolsa e regras.
- Preserva nature/IVs/EVs desconhecidos e conjuntos com menos de quatro golpes. Captura um formato doubles como doubles, sem aprovar sua análise.
- Verifica o treinador antes de chamar o getter com fallback. Resolve alternativas de item por presença no registro e possibilidade de obter um stack padrão não vazio; não afirma conhecer o mapeamento para Showdown.
- Compara duas leituras, verifica prontidão e identidade do gerenciador de recursos e rejeita mudanças observadas. É detecção limitada de inconsistência, não prova de snapshot atômico.
- Rejeita campos obrigatórios ausentes, funções, acessores não revisados, ciclos, valores não finitos, arrays esparsos e entradas acima dos limites configurados.
- Preserva formas distintas que compartilham um identificador de batalha e registra a relação. Identificador Showdown não é tratado como chave única de toda forma visual.
- Mantém a preparação da saída separada da publicação. O contrato de publicação foi testado com um armazenamento simulado; o gravador real ainda não existe.

**32 testes locais passaram em duas execuções com resultados idênticos.** A camada Java foi exercitada com objetos simulados que oferecem as mesmas chamadas esperadas; isso verifica o mapeamento, não a compatibilidade com Rhino, permissões do KubeJS ou o servidor real. O processo desses testes não recebeu permissão de leitura dos arquivos do jogo.

Foram registradas ainda 17 classes de apoio às APIs do adaptador, separadas das 14 classes da investigação inicial. A parte B continua não implementada. O protótipo marca explicitamente como não capturados: Dex vivo, callbacks, packs de origem, condições adicionais da seleção de habilidades, desbloqueios individuais e política da IA. Nenhum teste do coletor aprovou novas mecânicas de batalha.

## Próxima execução delimitada

1. Núcleo da parte A e testes de contrato preparados. Próximo trabalho local: concluir o empacotamento KubeJS, o comando restrito e a publicação em destino exclusivo, sem instalar nada automaticamente.
2. Validar a ponte KubeJS/Java e definir o acesso à parte B/Graal no contexto correto. Se essa ponte não permitir uma captura segura, reconsiderar um pequeno mod dedicado; não assumir que ele já é necessário. O rascunho atual não oferece a parte B.
3. Solicitar aprovação com o arquivo, destino e procedimento exatos antes de qualquer instalação ou execução no servidor. Informar como remover o coletor depois.
4. Obter uma captura autorizada, compará-la com o perfil de laboratório e repetir apenas os testes afetados. Divergências reabrem a cobertura correspondente.

Ainda não estão confirmados: funcionamento da ponte no servidor, registros finais em memória, custo da captura e equivalência com batalhas observadas. Esta inspeção não encerra a etapa 0 nem inicia a interface do app.

## Evidência reproduzível

- Manifesto das 14 classes e fontes (`experiments/cobblemon-compatibility/results/export-inspection/manifest.json`).
- Testes de serialização (`experiments/cobblemon-compatibility/results/export-boundary-tests.json`).
- Duas execuções e sete fontes diretas reconferidas (`experiments/cobblemon-compatibility/results/export-verification.json`).
- Contratos do coletor e duas execuções (`experiments/cobblemon-compatibility/results/collector-verification.json`).
- APIs de apoio ao adaptador (`experiments/cobblemon-compatibility/results/collector-api/manifest.json`).
- Como reproduzir (`experiments/cobblemon-compatibility/README.md`).

Somente evidências de laboratório foram gravadas nesta rodada. Nenhum comando foi enviado ao jogo; não houve instalação, recarregamento, reinício ou alteração de configuração.
