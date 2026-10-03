# Revisão da primeira fatia — UI e acessibilidade

Data: 23/09/2026. Escopo: primeira tela da fixture offline Pikachu/Floatzel. A revisão não representa a party atual nem uma avaliação da aplicação Electron integrada.

## Observações e correções

- A etiqueta “party · observado” fazia o Pikachu da fixture parecer parte da party real. Os dados fixos de Pikachu e Floatzel agora aparecem como valores somente leitura; a etiqueta identifica explicitamente a fixture e o nível fixo.
- “Golpe atual” usava `<label>` associado a um `div`, sem associação HTML válida. Pikachu, alvo e golpe atual agora são grupos nomeados; a única seleção editável continua sendo o golpe proposto. As condições fixas e a comparação também têm semântica de grupo, e as barras decorativas ficam fora da árvore acessível.
- O título anterior afirmava que o alvo ficava sem HP, e o resumo dizia que a proposta sempre reduzia o HP restante. Ambos agora descrevem a comparação calculada sem pressupor o resultado.
- Ao enviar uma opção inválida, o foco vai para o golpe proposto. Depois de editar entradas, o estado pede nova comparação; cancelamento recebe mensagem de recuperação.
- `--quiet` tinha contraste WCAG 2 de 3,00:1 no fundo da página e 3,27:1 na superfície, abaixo de 4,5:1 para texto normal. Com `oklch(50% 0.025 145)`, os pares passaram a 5,14:1 e 5,61:1, respectivamente. O indicador de foco também usa a cor de sistema `Highlight` em modo de cores forçadas.

## Evidência e verificações

- Inspecionei `App.tsx`, `styles.css`, `main.tsx`, `compare-flow.ts`, `api.ts`, o README do módulo e os documentos de escopo/decisões. O fluxo já incrementava a revisão, removia o resultado ao editar e ignorava resposta de job ou revisão que deixou de estar ativa; não alterei essa lógica de domínio.
- Iniciei `vite --host 127.0.0.1`: Vite 7.1.5 ficou disponível em `http://127.0.0.1:5173/`; encerrei o processo ao concluir a inspeção.
- A captura visual não foi possível. A inicialização do browser-use falhou com “No Codex IAB backends were discovered”; o inventário de navegador mostrou somente o IAB, sem abas. Não abri Electron porque a outra frente está verificando runtime. Portanto, a inspeção visual foi estática, pelo JSX e CSS; não houve screenshot visto nem validação de layout renderizado.
- `git status --short` falhou porque esta cópia do workspace não contém metadados Git. Não pude comparar com um diff anterior.
- Por orientação de encerrar apenas o comando ativo, não executei typecheck, build ou testes após as mudanças. A compilação e a integração das alterações de UI continuam sem verificação.
- O README já declara a fixture congelada, o escopo de uma ação e os limites offline; revisei e não precisei alterá-lo. Não instalei dependências nem acessei jogo, servidor ou saves.

## Arquivos alterados nesta revisão

- `apps/cobblemon-companion/src/App.tsx`
- `apps/cobblemon-companion/src/styles.css`
- `docs/cobblemon-companion/preflight/REVISAO-PRIMEIRA-FATIA-UI.md` (este relatório)

## Pendências para fechar a integração

- Rodar typecheck, testes pertinentes e build da integração.
- Revisar screenshot da janela ou de preview funcional quando o navegador/runtime da integração estiver disponível; conferir layout estreito e percurso por teclado no render real.

A revisão confirma correções de conteúdo, semântica e contraste no código. O parecer visual permanece parcial até a tela renderizada ser inspecionada.
