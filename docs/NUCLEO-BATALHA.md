# Núcleo executável da campanha — 09/09/2026

Adição isolada de 19/09/2026: consumidor de evidências (`battle-planner/src/compare-evidence.cjs`) e testes sintéticos (`battle-planner/test/compare-evidence.test.cjs`) cobrem comparação de duas builds e explicações estruturadas. Não estão conectados ao CLI ou ao motor; não alteram a busca de dois turnos nem encerram a avaliação da qualidade das recomendações. Ver [casos](CASOS-COMPARACAO.md).

A solicitação de usar calculadores de dano na party do Caio foi implementada em battle-planner (`battle-planner/README.md`). O núcleo importa party/PC automaticamente e analisa o encontro selecionado. Essa ampliação foi pedida explicitamente após as provas técnicas; o aplicativo desktop do plano original ainda não foi implementado.

Reutiliza `@smogon/calc` 0.11.0 do experimento e o Showdown instalado com hashes verificados. Adapta dados locais de espécie/forma e carrega callbacks examinados. Não altera o servidor.

Entrega atual: matriz completa de confrontos, exportação Showdown, comparação de itens confirmados, requisitos de Speed, execução de sequências e busca minimax de até dois turnos com golpes, trocas, poções e Mega disponível. Relatórios indicam hipóteses e erros. Uma reconstrução estática continua sem certificar os registros vivos do servidor.

A busca usa uma função explícita de saldo de HP/nocautes, semente fixa e dano/hits desfavoráveis. Não promete otimização global, probabilidade de vitória, simulação da política RCT nem abrangência de todo RNG. A shortlist de seis Pokémon é uma heurística para orientar cenários, não recomendação final validada.

Validação nesta entrega: 21 testes aprovados, incluindo 96 rolagens iguais entre Smogon e o pipeline de ataque do Showdown local. O caso histórico Gardevoir/Nidoking foi congelado como fixture. Há testes de Sash, Sturdy, prioridade, multi-hit, Snarl após troca, Haze, Protect consecutivo, críticos e bag limitada. Os testes comparam um perfil offline; não são replays conectados ao servidor.

Instalação examinada: Cobblemon 1.7.3, RCT 0.18.1-beta. Captura inicial: 68 indivíduos, 476 pares considerando sete variantes adversárias para os cinco slots do Giovanni. Esses números são resultados datados, não constantes do produto.

Continuam abertos: captura de registros em memória, otimização conjunta de seis builds/estoque, busca mais longa com tratamento probabilístico, avaliação da qualidade das recomendações e interface do Companion. Nenhuma dessas partes é apresentada como concluída.
