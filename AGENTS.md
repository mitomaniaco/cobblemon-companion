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
- Testes: unitários e de integração (Vitest), end-to-end pelo harness Electron sintético (`test/electron-trainer-ui-harness.cjs`), cobertura enviada ao Codecov.
- Observabilidade: local-first (tela de erro diagnóstica sanitizada), sem Sentry/OpenTelemetry.
- UI: toda interface tem skeleton, lazy loading e animações de entrada, saída, carregamento e progresso, respeitando `prefers-reduced-motion`.

### Exceções deliberadas ao padrão (decididas em 03/10/2026)

- **Sem Playwright (Issue #7):** o harness Electron sintético já cobre os fluxos reais do renderer com a bridge verdadeira (seleção por UUID, prévia de troca, dano com as cinco confirmações em 1186×852, refresh, demo, layouts e tela de erro). Playwright com Electron é experimental e duplicaria esse trabalho. Reavalie só se o harness ficar inviável de manter ou se o CI precisar rodá-lo em Windows.
- **Sem Sentry/OpenTelemetry (Issue #8):** o app é local e lê saves de jogador; não há serviço remoto nem usuário que justifique enviar telemetria, e qualquer envio exigiria consentimento e scrub além do atual. Esta exceção prevalece sobre o padrão geral de observabilidade. Reabra a Issue #8 apenas por decisão explícita do dono do projeto (destino, DSN e consentimento na UI).

### Estado atual da adoção (02/10/2026)

O repositório tem `npm run check` (typecheck + Vitest + build), o harness Electron sintético (só local: exige `electron.exe` no Windows) e CI no GitHub Actions (`.github/workflows/ci.yml`: Biome, Knip, dependency-cruiser, Commitlint do título do PR e dos commits, typecheck, testes com cobertura, Codecov e build em PRs e na `main`). Biome (`npm run lint`, `npm run format`) e Knip (`npm run knip`) estão instalados; o baseline tem 0 erros e avisos conhecidos (regras que exigem mudança de comportamento ou de acessibilidade ficaram em `warn` em `biome.json`, e exports sem uso em `knip.json`): reduza-os por Issue própria, nunca promova `warn` para silêncio. Commitlint roda localmente via Lefthook (`commit-msg`, instalado por `npm install` através de `prepare`) e no CI; o título do PR também é validado porque vira a mensagem do squash. Contratos de arquitetura ficam em `.dependency-cruiser.cjs` (`npm run arch`); `features-isoladas` está em `warn` por uma violação conhecida (`individual` → `damage/MovePreparation`). Cobertura: `npm run test:coverage` (Vitest v8; o resumo aparece no Job Summary do CI). O envio ao Codecov só ocorre quando o secret `CODECOV_TOKEN` existe no repositório; sem ele o passo é ignorado e não há badge. Mutação: `npm run test:mutation` (Stryker, restrito a domínio, modelos e adaptadores) roda em `.github/workflows/mutation.yml` em PRs para `main` que toquem esses caminhos e semanalmente; é informativo (`break: null`), não bloqueia. Playwright, Sentry e OpenTelemetry **não serão instalados** (veja as exceções deliberadas acima). Atualize esta seção a cada ferramenta adotada.

## Regras específicas deste projeto

- Nunca versionar `config.json`, saves, `.runtime/` ou logs locais (já estão no `.gitignore`). Fixtures em `test/fixtures/` são sintéticas.
- O app é local e não envia dados pela rede; Sentry/OpenTelemetry, quando adotados, não podem transmitir dados do jogador, caminhos locais ou UUIDs de jogador. Qualquer exportação de telemetria exige decisão explícita do usuário.
- Observabilidade local-first já adotada: `src/app/AppErrorBoundary.tsx` mostra um diagnóstico sanitizado (`src/platform/diagnostics.ts`) em vez de uma janela vazia, sem rede e sem IPC. Todo texto de erro exibido ou copiado deve passar por `scrubDiagnosticText`. Telemetria externa só entra por decisão explícita do dono do projeto e com o mesmo scrub.

## Precedência entre skills

- Este arquivo é a fonte da verdade do projeto. Se qualquer skill ou plugin (Addy Osmani agent-skills, Superpowers, Ponytail etc.) sugerir outro fluxo de git, CI, observabilidade ou padrão de qualidade, siga o que está aqui.
- Minimalismo de código (ex.: Ponytail) nunca remove skeleton, animações, testes, observabilidade ou checagens de CI: esses itens são requisitos, não excesso.
