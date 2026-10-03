# Diagnóstico dinâmico do Electron

Data: 24/09/2026 (UTC−03:00)  
Estado: contraste confirmado entre o run sob sandbox da tarefa (falha antes do renderer) e a execução elevada no host (harness completo passou). O caminho exato da DLL continua não identificado.

## Gate de integridade Medium

Em 24/09/2026, a shell padrão da tarefa mostrou `<máquina>\<conta-sandbox>`, sessão `1`, integridade **Medium** (`S-1-16-8192`); ela usa uma conta e restrições diferentes do host. No contexto host aprovado, a shell era `<máquina>\<usuário>`, sessão `1`, **High** (`S-1-16-12288`). A consulta direta ao token do Explorer desktop (PID `7772`) mostrou o mesmo usuário/sessão e **High**. Na shell host, `GetTokenInformation(TokenElevationType)` retornou `1` (`Default`) e `TokenLinkedToken` falhou com Win32 `1312`: não existe token Medium vinculado para lançar com `CreateProcessWithTokenW`. O `runas` oficial requer credenciais, fora do recorte sem senha. São fatos sobre este contexto, não sobre o sandbox do Chromium. Fontes: [tipos de elevação](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-token_elevation_type), [token vinculado](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_linked_token), [CreateProcessWithTokenW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithtokenw), [runas](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc771525%28v%3Dws.11%29).

Nenhum Electron foi iniciado para este gate. Foi preparado `apps/cobblemon-companion/run-medium-check.cmd` com `test/electron-medium-launcher.cjs`: exige Medium antes de abrir o app, usa o mesmo Electron 44.4.3/harness com GPU ativa e perfil novo em `.runtime/diagnostics/medium-manual-*`, redireciona stdout/stderr, aplica watchdog de 30 s e, em timeout, encerra somente a árvore do PID que lançou. O harness, sob `COMPANION_REQUIRE_MEDIUM=1`, registra `RUNTIME_TOKEN` com seu próprio PID, usuário e SID de integridade antes da janela; o launcher exige esse registro e código `0` para aprovar. `node --check` passou nos dois arquivos JS alterados. O fluxo manual ainda não foi executado; seu funcionamento e a primeira tela Medium seguem **pendentes**. O Explorer atual High será recusado sem lançar Electron. O README explica o duplo clique a partir de uma sessão Explorer Medium existente e quais logs/imagens devolver.

## Verificação visual final do harness

Em 24/09/2026, corrigi apenas `test/electron-runtime-harness.cjs`: a etapa de scroll deixou de esperar dois `requestAnimationFrame` no renderer, que podem ficar pausados em uma janela em segundo plano. A confirmação de geometria no viewport e o watchdog interno de 8 s foram preservados; `BrowserWindow.capturePage()` foi chamado após o DOM `current` e o scroll. `node --check` passou. Nenhum código do app foi alterado.

Houve **uma** execução elevada no host, com `node_modules/electron/dist/electron.exe test/electron-runtime-harness.cjs`, diretório `apps/cobblemon-companion`, Electron 44.4.3, GPU ativa e `userData`/`sessionData` isolados em `.runtime/diagnostics/visual-harness-final-20260924T034131/electron-profile/`. O timeout externo era de 40 s. O PID principal `24388` executou de 03:41:31.748 a 03:41:33.219 -03:00, saiu com código `0` e não atingiu o timeout. O stderr ficou vazio. O stdout aprovou tela inicial, formulário → IPC → worker → resultado, edição/validação, cancelamento, descarte `stale`, falha controlada e as duas capturas. A verificação final por caminho do executável e perfil exclusivo não encontrou processo remanescente; nenhum PID foi encerrado à força.

Inspecionei diretamente os PNGs de 1184×795. `runtime-result.png` mostra o painel de comparação legível: Spark `36` e Thunderbolt `50` de dano mínimo; HP restante do alvo `34` e `20` de `70`, status “Condicional” e condições explícitas. `runtime-result-limits.png` mostra “Rastreabilidade e limites” aberto, identificadores de snapshot/evidência/motor e os limites da demonstração, incluindo que não representa a party real, não simula IA/troca/batalha inteira e não certifica vitória. As capturas anteriores fora do viewport continuam artefatos históricos; esta rodada fecha a pendência visual **somente no host elevado**.

Artefatos: `.runtime/diagnostics/visual-harness-final-20260924T034131/runtime-result.png` e `runtime-result-limits.png`, além do perfil isolado. O contraste com o sandbox da tarefa permanece: este resultado não comprova execução em integridade Medium nem sob o token restrito. A DLL da falha antiga continua desconhecida.

## Evidência anterior consultada

Li `AGENTS.md`, `REVISAO-PRIMEIRA-FATIA-RUNTIME.md` e o log Electron mais recente disponível. O log foi gravado em 23/09/2026 às 06:26:47 e registra o processo GPU terminando com `-1073741515` (`0xC0000135`), nove repetições e `GPU process isn't usable`. Não identifica uma DLL. A revisão anterior relata ainda um breakpoint `0x80000003` no processo principal. A proximidade temporal é uma correlação, não prova de uma causa comum; a captura de tela mencionada pode pertencer a outra execução.

## Tentativa controlada

Não havia `ProcMon` nem `ProcDump` instalado em PATH ou nos diretórios locais consultados. Escolhi o WPR que já acompanha o Windows: o perfil File I/O inclui atividade de arquivos, Loader e eventos de criação de processos. Consultei a [documentação Microsoft dos perfis WPR](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/built-in-recording-profiles) e das [opções de linha de comando](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/wpr-command-line-options), além da documentação oficial do [Electron para depuração no Windows](https://www.electronjs.org/docs/latest/development/debugging-on-windows).

Comando executado:

```powershell
wpr.exe -start FileIO -filemode -recordtempto "apps/cobblemon-companion/.runtime/diagnostics/electron-startup-20260924T023009/wpr-temp"
```

Resultado: `Access is denied`, código Win32 `0x80070005` (saída `-2147024891`). A sessão WPR não começou. Por isso, o comando que iniciaria `electron.exe` com `electron/main.cjs`, perfil isolado e limite de 12 segundos não foi executado: metadados registram `processId: null` e `argv: []`. Não houve segunda tentativa.

## Artefatos e limpeza

- Retido: `apps/cobblemon-companion/.runtime/diagnostics/electron-startup-20260924T023009/capture-metadata.json`, com comando, erro e estado da tentativa.
- Não criado: ETL, dump, screenshot ou log Electron desta rodada.
- As pastas vazias `wpr-temp` e `user-data`, criadas para a tentativa, foram removidas.
- `wpr -status` confirmou `WPR is not recording`; a consulta de processos não encontrou Electron. Nenhum processo foi iniciado por esta tentativa, portanto não havia processo a encerrar.
- Nenhum arquivo do app foi editado. A pasta fixa do perfil de teste também não foi usada.

## Conclusão

Esta rodada não confirmou nem refutou `0xC0000135`, não observou PIDs GPU/renderer e não identificou módulo ou DLL. Não é possível atribuir a falha a uma DLL com a evidência existente. O bloqueio concreto é a negação de acesso do WPR sob o token atual `<máquina>\<conta-sandbox>` (não administrador). Para uma captura futura será necessário um capturador com permissão de coleta concedida, por exemplo executar WPR com elevação aprovada. Não foi alterado o launcher nem qualquer configuração global.

## Execução discriminante com perfil novo

Para não deixar o harness sobrescrever `--user-data-dir`, foi necessário permitir que `COMPANION_RUNTIME_PROFILE` escolha o argumento de `app.setPath`. A alteração ficou restrita a `test/electron-runtime-harness.cjs`; sem a variável, o caminho padrão anterior continua igual. `userData` e `sessionData` foram ambos apontados para o mesmo diretório novo por meio da API oficial `app.setPath`.

Execução única em 24/09/2026, 02:38:47.190–02:38:56.803 -03:00 (05:38:47.190–05:38:56.803 UTC), Electron 44.4.3:

```powershell
$env:COMPANION_RUNTIME_PROFILE = 'apps/cobblemon-companion/.runtime/diagnostics/profile-only-20260924T023847/electron-profile'
$env:COMPANION_RUNTIME_SCREENSHOT = 'apps/cobblemon-companion/.runtime/diagnostics/profile-only-20260924T023847/runtime-result.png'
& '.\node_modules\electron\dist\electron.exe' '.\test\electron-runtime-harness.cjs'
```

Diretório de trabalho: `apps/cobblemon-companion`. Executável, entrypoint, argumentos e diretório de trabalho mantiveram-se iguais ao comando original que falhou. Só o perfil foi mudado; o caminho do screenshot foi redirecionado para o diretório de diagnóstico. GPU ativa: não foi passado `--disable-gpu`.

PID principal `30424`; código de saída `-2147483645` (`0x80000003`). Um segundo PID do mesmo `electron.exe`, `30788`, foi observado durante a execução; seu papel Chromium não foi identificado. O log do processo principal registra nove saídas do processo GPU com `-1073741515` (`0xC0000135`), seguidas de `GPU process isn't usable. Goodbye.`. O stdout registrou `Renderer process launch-failed` duas vezes. O marcador de janela carregada não apareceu; o screenshot não foi criado e as interações do harness não começaram. O limite externo de 25 s não foi atingido.

Arquivos retidos em `.runtime/diagnostics/profile-only-20260924T023847/`: `run-metadata.json`, `stdout.txt`, `stderr.txt`, o `electron.log` dentro de `electron-profile/` e os dados do perfil isolado. `runtime-result.png` não existe. A consulta de cleanup confirmou que os PIDs `30424` e `30788` já não estavam em execução; nenhum processo precisou ser encerrado à força e não restou Electron desta execução.

O perfil/cache padrão fica enfraquecido como explicação suficiente: a falha `0xC0000135` persistiu com `userData`/`sessionData` novos e GPU ativa. A captura não revela qual DLL falta; `0x80000003` agora está associado por PID/horário ao processo principal desta execução, mas não identifica a causa do filho GPU.

## Execução elevada no host, sem WPR

Em 24/09/2026, a chamada `exec_command` elevada foi aprovada. Com o token `<máquina>\<usuário>` (administrador), executei uma vez o mesmo Electron 44.4.3, entrypoint e diretório de trabalho, com perfil workspace novo configurado pelo `app.setPath` existente. GPU ativa; nenhum `--disable-gpu`; sandbox Chromium/contextIsolation e código permaneceram inalterados.

```powershell
$env:COMPANION_RUNTIME_PROFILE = 'apps/cobblemon-companion/.runtime/diagnostics/elevated-host-20260924T025922/electron-profile'
$env:COMPANION_RUNTIME_SCREENSHOT = 'apps/cobblemon-companion/.runtime/diagnostics/elevated-host-20260924T025922/runtime-result.png'
& '.\node_modules\electron\dist\electron.exe' '.\test\electron-runtime-harness.cjs'
```

Diretório de trabalho: `apps/cobblemon-companion`. Execução: 02:59:22.764–02:59:24.712 -03:00. PID principal `22372`, saída `0` (`0x00000000`); a janela “Companion de campanha” carregou. O harness passou tela inicial, formulário → IPC → worker → resultado, edição/validação, cancelamento, resposta `stale` e falha do worker. Foi produzido um PNG de 1184×795, mas a revisão visual posterior do arquivo reportou o status “Calculando” e nenhum resultado visível; portanto, essa captura não prova resultado visual. `stderr.txt` vazio. O limite de 25 s não foi atingido.

PIDs Electron filhos observados: `24724`, `24916`, `31576` e `24452`; papéis Chromium não foram identificados. O app saiu normalmente e a rotina não registrou processos remanescentes nem precisou forçar encerramento. Os artefatos estão em `.runtime/diagnostics/elevated-host-20260924T025922/`: `run-metadata.json`, `stdout.txt`, `stderr.txt`, `electron-profile/electron.log` e `runtime-result.png`.

Comparação: no run sob sandbox da tarefa, PID `27356` saiu com `0x80000003`; o GPU child repetiu `0xC0000135` nove vezes e o renderer falhou. No host elevado, PID `22372` saiu com código 0 e todos os cenários passaram. Isso associa a falha ao contexto restrito de execução como um todo; não isola uma ACL específica nem prova que o sandbox de arquivos, separado do token administrador, seja a causa. O run elevado não identifica uma DLL ausente. O ETL WPR anterior continua preservado e não foi convertido nesta etapa.

## Captura visual com espera por `current`

Em 24/09/2026, alterei somente `test/electron-runtime-harness.cjs`: após a resposta IPC `current`, o harness abre “Rastreabilidade e limites” e aguarda o estado React `status-result`, título/valores do resultado e conteúdo dos limites no DOM, com estilos visíveis. `node --check test/electron-runtime-harness.cjs` passou. A condição usa presença no layout (`getClientRects`) e não espera temporal arbitrária.

Uma execução no host ocorreu entre `03:09:19.249` e `03:09:23.966 -03:00`, com Electron 44.4.3, diretório de trabalho `apps/cobblemon-companion`, mesmo entrypoint, GPU ativa e sem alterações de sandbox/contextIsolation. Perfil `userData`/`sessionData` novo: `.runtime/diagnostics/visual-result-20260924T030919/electron-profile/`. PID principal `22784`, processo pai `31408`, saída `0`, timeout externo de 25 s não atingido. O stdout confirma janela, resposta `current`, resultado/asserts, edição, cancelamento, `stale` e falha; `stderr.txt` ficou vazio.

A inspeção de `runtime-result.png` (1184×795) **não aprova a evidência visual**: a captura mostra o topo da página/formulário e o status “Condicional”; o painel do resultado e os limites não aparecem no viewport capturado. Embora o harness tenha confirmado os nós e conteúdo no DOM, `getClientRects()` não garante que estejam dentro da área visível da janela. Isto demonstra uma lacuna de posicionamento/viewport na captura, não que a UI tenha deixado de renderizar após `current`; não comprova defeito da UI. Não houve nova tentativa. O screenshot identifica o recorte Pikachu → Floatzel como demonstração offline, não como party real.

Artefatos preservados em `.runtime/diagnostics/visual-result-20260924T030919/`: `run-metadata.json`, `stdout.txt`, `stderr.txt`, `electron-profile/electron.log` e `runtime-result.png`. O processo principal saiu normalmente; a verificação dos cinco PIDs Electron observados (`22784`, `16644`, `19628`, `21748`, `31108`) não encontrou processo remanescente; não foi necessário forçar encerramento. Continua pendente uma captura cujo viewport inclua resultado e limites; nenhuma DLL foi identificada e a conclusão estática não mudou.

## Tentativa de captura com viewport e paint explícitos

Em 24/09/2026, `whoami /user` e `whoami /groups` no contexto host de `exec_command` elevado mostraram `<máquina>\<usuário>`, administradores habilitados e **High Mandatory Level** (`S-1-16-12288`). Portanto, os runs host anteriores não comprovam execução em integridade Medium. O sandbox de arquivos da tarefa e o sandbox do Chromium são contextos distintos; nenhum deles foi desabilitado aqui.

Foi alterado somente `apps/cobblemon-companion/test/electron-runtime-harness.cjs`: depois de `current`/`status-result`, ele tenta levar cabeçalho/dados e, separadamente, rastreabilidade/limites ao viewport, aguarda dois `requestAnimationFrame` e prevê dois PNGs. `node --check` passou antes da execução. O run único usou o mesmo `electron.exe` 44.4.3 e entrypoint, diretório `apps/cobblemon-companion`, GPU ativa e perfil isolado `.runtime/diagnostics/visual-viewport-20260924T033200/electron-profile/`, sem flags de segurança novas. PID principal `34152`, pai `33932`, 03:32:00.645–03:32:26.086 -03:00. O stdout registrou tela inicial e formulário → IPC → worker → resultado; não registrou `SCREENSHOT`. O watchdog externo de 25 s encerrou a árvore; saída `1`, `stderr.txt` vazio. Não foi produzido nenhum dos dois PNGs, de modo que não há imagem nova para aprovar. O ponto exato do bloqueio dentro da preparação do primeiro capture não foi identificado.

Artefatos preservados em `.runtime/diagnostics/visual-viewport-20260924T033200/`: `run-metadata.json`, `stdout.txt`, `stderr.txt`, `host-token.txt` e `electron-profile/electron.log`. Após o encerramento por timeout, a verificação dos cinco PIDs observados (`34152`, `34300`, `34344`, `34372`, `34636`) não encontrou remanescentes. Não houve segunda reprodução. Após o run, o harness recebeu um watchdog interno de 8 s para a etapa viewport/paint; sua sintaxe passou, mas essa última edição não teve execução funcional. Resultado e limites ainda carecem de captura legível. A execução Medium não foi tentada nesta rodada, por instrução de encerramento; não existe prova de usuário comum. A conclusão estática e o estado da DLL permanecem inalterados.

## Captura WPR focal

Em 24/09/2026, a elevação solicitada foi aprovada. `wpr.exe -start FileIO -filemode -recordtempto <diagnostics/wpr-temp>` iniciou com código 0; o perfil inclui File I/O, Loader e eventos de processo. Uma única reprodução Electron ocorreu entre 02:45:03.884 e 02:45:08.859 -03:00, com perfil novo e GPU ativa. PID principal `27356` saiu com `0x80000003`; o log repetiu nove vezes `0xC0000135`. PIDs Electron adicionais observados: `31236` e `26568`, sem classificação de papel Chromium. Janela e renderer não carregaram.

`wpr.exe -stop ... -skipPdbGen` salvou `electron-startup.etl` com sucesso (código 0; 597.688.320 bytes). WPR não está mais gravando. A tentativa local de converter o ETL com `tracerpt` ainda estava processando quando a análise foi encerrada; não foi extraído caminho de DLL. O processo `tracerpt` PID `32692` já não existia quando a limpeza foi tentada. O ETL permanece local em `.runtime/diagnostics/wpr-gpu-loader-20260924T024419/`; stdout, stderr, log Electron e metadados também estão nessa pasta. Nenhum dump foi produzido ou publicado. A DLL exata continua não identificada.
