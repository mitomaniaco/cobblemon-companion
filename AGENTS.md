# Instruções para agentes

Leia também `CLAUDE.md` (regras de privacidade, escopo e estado do projeto) e `docs/GUIA-TECNICO.md` antes de alterar código.

## Fluxo de trabalho (obrigatório para qualquer agente)

- Toda tarefa (Correção, Melhoria ou Nova função) começa com uma Issue no GitHub, com label `bug`, `enhancement` ou `feature`.
- Trabalhe numa branch `<tipo>/<numero-da-issue>-<slug>`. Nunca faça push direto na `main`.
- Todo código entra por Pull Request. A descrição do PR deve conter `Closes #<numero>` mencionando a Issue.
- O deploy acontece pelo merge do PR na `main`, somente com o CI verde.
- Commits seguem Conventional Commits.

## Padrões de qualidade

- Lint/format: Biome. Código morto: Knip. Contratos de arquitetura: dependency-cruiser. Commits: Commitlint. Mutação: Stryker.
- Testes: unitários e de integração (Vitest), end-to-end (Playwright), cobertura enviada ao Codecov.
- Observabilidade: OpenTelemetry + Sentry.
- UI: toda interface tem skeleton, lazy loading e animações de entrada, saída, carregamento e progresso, respeitando `prefers-reduced-motion`.

### Estado atual da adoção (02/10/2026)

O repositório tem `npm run check` (typecheck + Vitest + build), o harness Electron sintético (só local: exige `electron.exe` no Windows) e CI no GitHub Actions (`.github/workflows/ci.yml`: typecheck, testes e build em PRs e na `main`). Biome, Knip, dependency-cruiser, Commitlint, Stryker, Playwright, Codecov, OpenTelemetry e Sentry **ainda não estão instalados**; são metas deste padrão, não comportamento existente. Instale-os por Issue própria, sem declarar que já existem. Atualize esta seção a cada ferramenta adotada.

## Regras específicas deste projeto

- Nunca versionar `config.json`, saves, `.runtime/` ou logs locais (já estão no `.gitignore`). Fixtures em `test/fixtures/` são sintéticas.
- O app é local e não envia dados pela rede; Sentry/OpenTelemetry, quando adotados, não podem transmitir dados do jogador, caminhos locais ou UUIDs de jogador. Qualquer exportação de telemetria exige decisão explícita do usuário.

## Precedência entre skills

- Este arquivo é a fonte da verdade do projeto. Se qualquer skill ou plugin (Addy Osmani agent-skills, Superpowers, Ponytail etc.) sugerir outro fluxo de git, CI, observabilidade ou padrão de qualidade, siga o que está aqui.
- Minimalismo de código (ex.: Ponytail) nunca remove skeleton, animações, testes, observabilidade ou checagens de CI: esses itens são requisitos, não excesso.
