# Padrão de interface

Regras que o dono do projeto repetiu durante o redesign do Trainer Card. Todo agente lê este arquivo antes de criar ou alterar qualquer tela, componente ou CSS. Quando uma regra daqui conflitar com um gosto pessoal ou com uma skill de design, vale este arquivo. O Trainer Card (`src/features/guide/TrainerCard.*` e `TeamDetail.*`) é a referência viva: em dúvida, copie o que ele faz.

## 1. Fluxo de design

1. **Analisar antes de desenhar.** Ler o código atual, as capturas do harness e o histórico de pedidos. Dizer o que está errado e por quê.
2. **Protótipo estático primeiro** (HTML em `C:\Users\<usuário>\Desktop\prototipo-guia`, fora do repositório), com dados reais ou sintéticos coerentes e capturas em 1280×680, 1568×742 e 1568×880. O dono aprova ou recusa; só então se implementa.
3. **Implementar em PRs pequenos**, uma tela por PR, seguindo o fluxo do `AGENTS.md`.
4. **Provar no app**: harness Electron e captura de tela conferida (largo e estreito). Protótipo bonito não prova nada.

## 2. Regras que o dono já cobrou (nesta ordem de gravidade)

1. **Nenhum espaço vazio.** É a reclamação mais repetida. Toda região é preenchida com conteúdo útil ou cresce para preencher. Cartão com pouco conteúdo aumenta arte e tipografia ou divide a linha com outro; nunca fica meio vazio. Antes de entregar, olhe cada coluna e cada faixa da captura procurando "buracos".
2. **Cabe na primeira dobra, sem rolagem.** A tela é para clicar, tirar a dúvida e seguir. Em janela larga o conteúdo ocupa exatamente a altura visível; o que não cabe vai para uma camada sob demanda (diálogo ou painel), não para uma rolagem.
3. **Tudo escala junto.** Um único tamanho-raiz (`--u`) deriva da altura e da largura disponíveis, e todo tamanho interno é `calc(n * var(--u))`. Nada de `px` ou `em` para caixas (exceção: componentes que só aceitam pixels, como `TrainerFace`). Em janela estreita (< 1100 px) o layout empilha com altura natural e sem rolagem horizontal.
4. **Sem brilho.** Nada de `text-shadow`, `box-shadow` colorido com blur, gradiente radial "aura" atrás de arte, nem `filter: drop-shadow` colorido. Cores são chapadas (tipo a ~24% sobre a superfície via `color-mix`) com borda de 1 px. Exceção: anel de foco e anel de seleção sem blur (`0 0 0 2px`).
5. **Centralizado de verdade.** Número dentro de bolinha e ícone dentro de chip: `display: grid; place-items: center; line-height: 1; padding: 0`, largura igual à altura. Conteúdo de banner e de cartão centralizado na vertical, sem cortar.
6. **Ícones sempre aparecem.** Ícone de tipo é `TypeIcon`/`TypeBadge` (máscara CSS), nunca `<img>` solto nem texto. Em protótipo aberto por `file://`, embuta o SVG (a máscara é bloqueada nesse protocolo).
7. **Reutilize o que o app já tem.** Antes de inventar um componente, procure em `src/ui/`. Golpe = `MoveChip variant="tile"` + `MovePpMeta` (categoria, tipo, ⚡ poder, `PP n` e três pontos de PP Up). Barra de dano = `HpBar`. Arte = `PokemonArtwork`. Rosto de treinador = `TrainerFace`. Não crie pílulas para precisão, contato, efeito ou outras propriedades; elas deixam os tamanhos inconsistentes.
8. **Sem enxame de pílulas.** Pílula só para estado (pronto, pendente, bloqueado) ou etiqueta curta e única. Dado numérico vai em texto ou barra, não em pílula.
9. **Cor tem significado.** Neutro = nada mudou. Verde = bom/entrou/pronto. Âmbar/amarelo = pendente ou atenção, e a troca de posição. Vermelho só para alerta real (perde, bloqueado por erro, falha). Tipos usam as cores `--type-*`, nunca o vermelho do botão primário.
10. **Informação onde a decisão acontece.** O dado fica junto do que se decide (quem responde a cada adversário fica na coluna do adversário; "Vale adquirir" diz por qual golpe trocar). Não repita o mesmo dado em duas áreas.
11. **Sem redundância óbvia.** Se o usuário já sabe (ex.: "guarde no PC" quando entra alguém), não escreva.
12. **Variantes e controles secundários são discretos.** Pequenos, na linha, nunca do tamanho de um cartão.
13. **Nada de componente nativo do Windows.** Dica ao passar o mouse é `data-tooltip` (e `data-tooltip-heading` para título), nunca o atributo `title`; o `TooltipLayer` (`src/ui/`) mostra o balão do app no hover e no foco do teclado. A barra de rolagem é a global de `global.css` (trilho escuro, polegar vermelho): não use `scrollbar-width` nem `scrollbar-color`, porque no Chromium eles desligam o estilo do app.

## 3. Linguagem

- Todo texto visível em português do Brasil, linguagem de quem joga Pokémon. Nomes de golpes e habilidades ficam em inglês (`moveDisplay`, `abilityName`); só as descrições são em português.
- Proibido no texto visível: "lead", "respondedor", ids técnicos (`namespace:id`, `evYield`, `maxItemUses`, "adaptador"), mensagens de implementação. Traduza o fato ("Pika Star de Paldea", não o id da conquista).
- Hipóteses e limites de cada cálculo ficam num único "Como calculamos" recolhido por tela, não em blocos repetidos.
- Bloqueado ou desconhecido aparece como cartão apagado com o motivo em português simples, nunca números inventados.

## 4. Estrutura e movimento (do `AGENTS.md`, valem sempre)

- Toda interface tem **skeleton**, **lazy loading**, animações de **entrada, saída, carregamento e progresso**, e respeita `prefers-reduced-motion` e `forced-colors`. Estado que só existe pela cor (anel, barra) precisa de equivalente em `forced-colors` (outline, `Highlight`).
- Tokens em `src/ui/tokens.css` (cores, `--type-*`, tipografia, `--space-*`, raios, durações). Não crie cor, raio ou duração fora deles.
- Acessibilidade: nome acessível coerente com o texto visível; `role="img"` só para ícone ou gráfico com `aria-label`; elemento clicável é `button` (ou item de `ListBox`), nunca `div`; foco visível; contraste mínimo de 4,5:1.
- Dado real só: a tela mostra o que o app realmente tem. Dado inexistente não entra "para preencher espaço".

## 5. Lista de conferência do PR de interface

- [ ] Protótipo aprovado pelo dono (link ou captura no PR).
- [ ] Captura larga (≥ 1440) sem rolagem, sem buraco, sem brilho.
- [ ] Captura estreita (800) empilhada, sem rolagem horizontal.
- [ ] Números e ícones centralizados; ícones de tipo visíveis.
- [ ] Componentes de `src/ui/` reaproveitados; nenhuma pílula nova para propriedade.
- [ ] Nenhum "lead", "respondedor" ou id técnico no texto visível.
- [ ] Skeleton, movimento e `prefers-reduced-motion`/`forced-colors` cobertos.
- [ ] Harness Electron verde e `npm run check`, `lint`, `arch`, `knip` sem regressão.
