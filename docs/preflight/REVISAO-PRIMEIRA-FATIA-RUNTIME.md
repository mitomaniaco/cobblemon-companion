# Revisão de runtime da primeira fatia

Data: 23/09/2026  
Estado: checks locais aprovados; ensaio Electron bloqueado antes de carregar a janela.  
Escopo: processo principal, preload, worker, formulário da primeira fatia e encerramento. A fonte da tela é a fixture offline Pikachu/Floatzel; esta revisão não atualiza nem representa party/PC.

## Resultado verificável

Com as dependências já presentes, o comando agregado executado pelo npm oficial foi:

```text
& 'C:\Program Files\nodejs\npm.cmd' run check
```

Resultado: `typecheck` passou; Vitest passou com 4/4 testes de estado do fluxo; o build Vite passou. A primeira tentativa com o shim `npm` do PATH falhou ao procurar um `npm-cli.js` global ausente; não foi necessário instalar dependências.

Também passaram `node --check` em `electron/main.cjs`, `electron/preload.cjs`, `electron/worker.cjs` e `test/electron-runtime-harness.cjs`.

Comandos e resultados registrados:

```text
npm run check
Falhou no shim global: MODULE_NOT_FOUND em C:\Users\caio\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js

& 'C:\Program Files\nodejs\npm.cmd' run check
Passou: typecheck; Vitest 4/4; Vite build.

node --check electron/main.cjs; node --check electron/preload.cjs; node --check electron/worker.cjs; node --check test/electron-runtime-harness.cjs
Passou: os quatro comandos retornaram código 0.
```

## Ensaio Electron e bloqueio

O Electron local é 44.4.3. Tentei iniciar o harness com o executável instalado no projeto. A primeira inicialização terminou com falhas de cache/perfil e o subprocesso gráfico Chromium encerrou com código `-1073741515`, seguido de `GPU process isn't usable. Goodbye.`. O harness não chegou a imprimir aprovações nem a carregar a janela.

Fiz uma única repetição com `--disable-gpu` e um perfil temporário isolado. O subprocesso gráfico encerrou com o mesmo código e mensagem fatal antes do início dos cenários. Encerrei o Electron remanescente pelo PID depois de confirmar que apontava para o executável desta instalação; a consulta posterior não encontrou processos `electron` em execução.

Comandos de inicialização usados, a partir de `apps/cobblemon-companion`:

```powershell
& .\node_modules\electron\dist\electron.exe .\test\electron-runtime-harness.cjs

$companionRuntimeProfile = Join-Path ([System.IO.Path]::GetTempPath()) ('companion-runtime-' + [guid]::NewGuid().ToString('N'))
& .\node_modules\electron\dist\electron.exe --disable-gpu "--user-data-dir=$companionRuntimeProfile" .\test\electron-runtime-harness.cjs

Stop-Process -Id 13284 -Force
Get-Process electron -ErrorAction SilentlyContinue
```

Ambas as inicializações falharam antes do harness. O PID 13284 foi confirmado como o Electron deste projeto antes de ser encerrado; a última consulta não retornou processos.

Assim, não há evidência desta rodada para interação visual, resultado renderizado, cancelamento, resposta stale, erro do worker ou encerramento gracioso. `BrowserWindow.capturePage()` também não foi alcançado e nenhum screenshot foi produzido. O problema observado é de inicialização do runtime gráfico no ambiente, não um resultado negativo dos cenários do produto.

## Harness preparado, ainda sem aprovação runtime

`test/electron-runtime-harness.cjs` inicia o `main.cjs` real em modo de teste isolado. O harness envia submissões pelo DOM, atravessa preload, IPC e `utilityProcess`, e espera observar os status `current`, `cancelled`, `stale` e `failed`. O caso stale dispara um segundo evento `submit` sintético no formulário enquanto o botão está desabilitado para exercitar concorrência; os demais começam pelos controles da tela. Nenhum cenário chama o worker diretamente.

O modo de teste permite atraso e falha controlados por mensagem e expõe a leitura dos status somente quando a URL contém `?runtime-test`; a aplicação normal não ativa esses controles. O harness captura a tela do resultado usando `BrowserWindow.capturePage()` se conseguir chegar ao cenário inicial. Essas afirmações descrevem o código preparado, não testes que tenham passado nesta máquina.

Ao revisar o caminho de encerramento, ajustei o `before-quit` para aguardar a parada do worker antes de chamar `app.quit()` novamente. É uma correção preventiva de lifecycle; o Electron bloqueado impediu confirmar esse comportamento em runtime.

## Escopo e limites

- A fixture é o recorte declarado Pikachu → Floatzel, Spark → Thunderbolt, uma ação, roll mínimo e sem item. Não é uma captura atual da party.
- Os quatro testes Vitest cobrem a máquina de estados do renderer, não Electron/IPC/worker nem apresentação visual.
- A captura da UI, as transições do harness e a limpeza do worker permanecem pendentes de uma máquina em que o Electron 44.4.3 consiga iniciar o Chromium.
- Não houve instalação de dependências, leitura ou escrita em saves, servidor ou arquivos do jogo.
- A pasta fornecida não contém metadados `.git`; não foi possível produzir status/diff Git nem distinguir alterações anteriores no workspace.
- Este relatório registra a rodada runtime. Os documentos de prontidão anteriores foram lidos, mas não editados dentro do escopo de ownership desta revisão.

## Arquivos deste recorte

Arquivos de fonte/documentação editados explicitamente:

- `apps/cobblemon-companion/electron/main.cjs` — controle exclusivo do harness e encerramento aguardando o worker.
- `apps/cobblemon-companion/electron/preload.cjs` — ponte de teste restrita à rota do harness.
- `apps/cobblemon-companion/electron/worker.cjs` — atraso/falha determinísticos usados somente pelo harness.
- `apps/cobblemon-companion/test/electron-runtime-harness.cjs` — ensaio pela janela e pelos eventos do DOM.
- `docs/cobblemon-companion/preflight/REVISAO-PRIMEIRA-FATIA-RUNTIME.md` — evidência, bloqueio e limites desta rodada.

O comando agregado também regenerou `apps/cobblemon-companion/dist/renderer/index.html`, `dist/renderer/assets/index-CuUdugY4.css` e `dist/renderer/assets/index-BwGOuURJ.js`. Sem metadados Git no workspace, não foi possível comparar seu conteúdo com o estado anterior.
