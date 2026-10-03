# Diagnóstico estático do Electron

Data: 24/09/2026  
Escopo: inspeção estática do pacote Electron e de suas dependências Windows. Nenhum Electron foi iniciado; nenhum código, configuração, arquivo do jogo ou save foi alterado.

## Conclusão

Não encontrei DLL ausente nas tabelas PE de imports estáticos ou delay-load do pacote. O executável e todos os 73 arquivos da distribuição correspondem ao ZIP oficial 44.4.3 em cache. O runtime VC++ x64 também está registrado como instalado. Portanto, esta inspeção não identifica a causa da falha observada.

O código `-1073741515` corresponde a `0xC0000135` (`STATUS_DLL_NOT_FOUND`): indica uma falha de resolução de componente, mas não informa por si só qual componente nem prova que seja um import estático do executável. A informação `0x80000003` no processo principal foi recebida como contexto desta tarefa; não há log bruto no workspace que permita associá-la à mesma execução ou à falha do filho GPU. A revisão runtime anterior registra a saída do filho gráfico e `GPU process isn't usable. Goodbye.`, mas não salva a transcrição bruta nem uma captura identificável por PID/horário. A consulta ao log Application do Windows nos três dias anteriores não retornou evento com `electron`, `chromium` ou `cobblemon`.

## Pacote e integridade

- Versão em `apps/cobblemon-companion/node_modules/electron/dist/version`: `44.4.3`.
- Executável: `apps/cobblemon-companion/node_modules/electron/dist/electron.exe`, 246.236.160 bytes; SHA-256 `BF0FE749904CA9F713CCFB2427C519FA39D0BBD0337BA411BA08785802E8D548`.
- ZIP Windows x64 encontrado no cache local: `electron-v44.4.3-win32-x64.zip`; SHA-256 `790A355B684D5C7CC8DC3CDD8C4CCA7C4B2D054685427C7554A956879A82E70B`, igual ao valor de `electron-v44.4.3-win32-x64.zip` em `node_modules/electron/checksums.json`.
- Comparação SHA-256 entre o conteúdo do ZIP e `dist`: 73 entradas verificadas, 73 arquivos locais, zero ausentes e zero divergências.
- O `electron.exe` do experimento aprovado em `experiments/cobblemon-desktop-proof/node_modules/electron/dist/` tem o mesmo tamanho e SHA-256. Isso confirma identidade do executável, não equivalência de toda a linha de inicialização.

## Imports PE e resolução no host

Foram lidos os imports do `electron.exe` e das seis DLLs PE presentes na raiz da distribuição: `d3dcompiler_47.dll`, `dxcompiler.dll`, `dxil.dll`, `ffmpeg.dll`, `vk_swiftshader.dll` e `vulkan-1.dll`.

- 32 referências de import estático e 52 referências delay-load; nenhum erro de leitura PE.
- Nenhuma DLL física referenciada ficou sem arquivo correspondente no diretório da distribuição, no Windows/System32, no diretório Windows ou nos diretórios do `PATH` examinados. Isso cobre os imports registrados nas tabelas, não APIs carregadas posteriormente com `LoadLibrary` nem todos os caminhos de busca específicos de cada processo.
- As referências `api-ms-win-*`/`ext-ms-win-*` foram tratadas como contratos de API Set, não como nomes de arquivos que precisariam existir. A Microsoft documenta que o loader resolve esses contratos pelo schema do Windows para um DLL hospedeiro; não confirmei individualmente o mapeamento de cada contrato no schema deste host.
- O registro x64 de Visual C++ indica `Installed=1`, versão `14.51.36247.00`; `System32` contém `vcruntime140.dll` e `msvcp140.dll`. Não há evidência de runtime VC++ ausente.

Assim, a hipótese “falta uma DLL listada nos imports PE da distribuição” não é sustentada pelos arquivos disponíveis. Permanecem fora deste método DLLs solicitadas dinamicamente, resolução dependente do processo/contexto e outros erros que terminem com o mesmo código. Ausência de evidência estática não invalida o código de saída relatado.

## Comparação com o ensaio aprovado

O relatório `experiments/cobblemon-desktop-proof/PROVA-DESKTOP.md` registra que o Electron 44.4.3 iniciou e aprovou o harness com sandbox Chromium ativo e sem `--disable-gpu`. O launcher do experimento usa `node src/run-test.cjs`, que inicia `electron . --test` a partir da pasta do experimento; o main define `userData` e `sessionData` para `.runtime/user-data` antes de `ready`.

A revisão da primeira fatia registra inicialização direta de `electron.exe` a partir de `apps/cobblemon-companion`; a segunda tentativa combinou `--disable-gpu` com `--user-data-dir` temporário e manteve a falha. Versão e hash do executável coincidem entre os dois projetos. Como launcher, diretório de trabalho, app carregado e perfil diferem, o ensaio aprovado prova que esse binário consegue iniciar neste host, mas não isola a causa da falha da primeira fatia. A captura mencionada no contexto não foi associada por evidência bruta a uma dessas execuções.

## Teste discriminante da hipótese do perfil — executado

O teste foi executado com o mesmo Electron 44.4.3, harness, diretório de trabalho e GPU ativa, mudando somente o perfil para um caminho novo via `app.setPath('userData'/'sessionData')`. A falha do processo GPU `0xC0000135` persistiu; a hipótese de perfil/cache padrão fica enfraquecida como explicação suficiente. A janela não carregou. PID, horários, saída e limites estão em [DIAGNOSTICO-ELECTRON-DYNAMIC.md](DIAGNOSTICO-ELECTRON-DYNAMIC.md). A conclusão estática sobre imports PE permanece inalterada.

## Referências

- [Microsoft: tabela de valores NTSTATUS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) — `0xC0000135` é `STATUS_DLL_NOT_FOUND`.
- [Microsoft: Windows API Sets](https://learn.microsoft.com/en-us/windows/win32/apiindex/windows-apisets) e [operação do loader](https://learn.microsoft.com/en-us/windows/win32/apiindex/api-set-loader-operation) — contratos podem ser resolvidos pelo schema do sistema sem um arquivo com o nome do contrato.

## ETL existente: leitura inconclusiva

Data: 24/09/2026. Inspecionei somente os metadados do diretório `apps/cobblemon-companion/.runtime/diagnostics/wpr-gpu-loader-20260924T024419/` e tentei consultar o ETL identificado ali como `electron-startup.etl` (597.688.320 bytes). Não li o `wpr-raw.xml` adjacente nem iniciei conversão; ele já existia no diretório e tem cerca de 3,2 GB. Não gerei artefatos.

O metadata declara início local às 02:45:03, PID principal 27356, processos Electron observados 27356/31236/26568 e saída `0x80000003`. Esses valores não foram confirmados por eventos do ETL e não bastam para atribuir processo ou papel aos PIDs.

`Get-WinEvent` e `tracerpt.exe` estão disponíveis; `wpa.exe` não foi encontrado pelo comando local. Uma consulta `Get-WinEvent -Path` usou XPath limitado aos providers `Microsoft-Windows-Kernel-Process`, `Microsoft-Windows-Kernel-Image` e `Microsoft-Windows-Kernel-File`, janela UTC de 10 segundos antes a 60 segundos depois do início indicado no metadata, e os PIDs 27356/31236/26568 no contexto do evento ou nos dados. Não houve saída visível na primeira espera de 30 segundos. Quando verifiquei a leitura para encerrá-la, o processo já havia terminado e seu resultado não estava recuperável; por isso, não interpreto o silêncio como zero eventos. Não executei `tracerpt` nem exportação completa.

Resultado: não confirmei PIDs, nomes de processo, eventos de carga de imagem/File I/O ou qualquer arquivo faltante pela trilha. O diagnóstico estático acima permanece inalterado; `PRONTIDAO.md` não foi sincronizado porque nenhuma conclusão mudou.

Para retomar esta análise sem exportar o ETL inteiro, é necessário um leitor que consiga filtrar o próprio ETL por provider, payload de PID e intervalo temporal (por exemplo, Windows Performance Analyzer com exportação filtrada, ou parser ETW equivalente). O filtro deve preservar eventos Kernel-Process, Kernel-Image/Loader e Kernel-File/File I/O e correlacionar `NAME NOT FOUND` com novas tentativas e eventual sucesso para o mesmo módulo; a ocorrência isolada não identifica DLL ausente.
