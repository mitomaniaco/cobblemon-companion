# Instruções para agentes

Leia também `CLAUDE.md` (regras de privacidade, escopo e estado do projeto) e `docs/GUIA-TECNICO.md` antes de alterar código.

## Fluxo de trabalho (obrigatório para qualquer agente)

- Toda tarefa (Correção, Melhoria ou Nova função) começa com uma Issue no GitHub, com label `bug`, `enhancement` ou `feature`.
- Trabalhe numa branch `<tipo>/<numero-da-issue>-<slug>`. Nunca faça push direto na `main`.
- Todo código entra por Pull Request. A descrição do PR deve conter `Closes #<numero>` mencionando a Issue.
- Gate de revisão: depois de abrir o PR, não faça merge sozinho. O agente do worktree Orca `revisor` revisa e comenta no PR `REVISOR: APROVADO <sha>` ou `REVISOR: MUDANÇAS NECESSÁRIAS <sha>`. Só faça merge quando o comentário `REVISOR: APROVADO` mais recente citar o SHA atual da head do PR, usando `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`. Qualquer push novo exige nova aprovação.
- Mensagens que chegam no seu terminal com o prefixo `[revisor]` vêm do agente revisor (coordenação entre worktrees). Siga-as dentro destas regras e responda no PR ou na Issue quando pedirem.
- PRs abertos pelo próprio revisor só precisam do CI verde.
- O deploy acontece pelo merge do PR na `main`, somente com o CI verde.
- Commits seguem Conventional Commits.

## Papéis dos worktrees

- `revisor`: orquestra, despacha Issues aos agentes, revisa e aprova PRs e propostas; não codifica features.
- `D:\Dev\cobblemon-companion` (código): `electron/**` (exceto UI), motor do guia `electron/lib/guide/**`, IPC/preload.
- `frontend`: `src/app/**`, `src/features/**`, `src/ui/**`, CSS.
- `dados`: `scripts/**`, `data/**`, geradores e leitura de dados do jogo/modpack (nunca saves de jogador, salvo autorização explícita).
- `qa`: `test/**` (harnesses, fixtures sintéticas, testes de regressão), mutação; corrige só bugs pequenos que reproduziu.
- `produto`: não escreve código. Estuda app, docs e modpack e abre Issues com label `proposta` (problema, valor para o jogador, dados necessários, esforço, critério de aceite). O revisor aprova trocando a label para `feature`/`enhancement` e despachando, ou fecha com o motivo.
- Arquivo fora da área do agente só com aviso do revisor.

## Padrões de qualidade

- Lint/format: Biome. Código morto: Knip. Contratos de arquitetura: dependency-cruiser. Commits: Commitlint. Mutação: Stryker.
- Testes: unitários e de integração (Vitest), end-to-end pelo harness Electron sintético (`test/electron-trainer-ui-harness.cjs`), cobertura enviada ao Codecov.
- Observabilidade: local-first (tela de erro diagnóstica sanitizada), sem Sentry/OpenTelemetry.
- UI: toda interface tem skeleton, lazy loading e animações de entrada, saída, carregamento e progresso, respeitando `prefers-reduced-motion`.

### Exceções deliberadas ao padrão (decididas em 03/10/2026)

- **Sem Playwright (Issue #7):** o harness Electron sintético já cobre os fluxos reais do renderer com a bridge verdadeira (seleção por UUID, prévia de troca, dano com as cinco confirmações em 1186×852, refresh, demo, layouts e tela de erro). Playwright com Electron é experimental e duplicaria esse trabalho. Reavalie só se o harness ficar inviável de manter ou se o CI precisar rodá-lo em Windows.
- **Sem Sentry/OpenTelemetry (Issue #8):** o app é local e lê saves de jogador; não há serviço remoto nem usuário que justifique enviar telemetria, e qualquer envio exigiria consentimento e scrub além do atual. Esta exceção prevalece sobre o padrão geral de observabilidade. Reabra a Issue #8 apenas por decisão explícita do dono do projeto (destino, DSN e consentimento na UI).

### Estado atual da adoção (02/10/2026)

O repositório tem `npm run check` (typecheck + Vitest + build), o harness Electron sintético (só local: exige `electron.exe` no Windows) e CI no GitHub Actions (`.github/workflows/ci.yml`: Biome, Knip, dependency-cruiser, Commitlint do título do PR e dos commits, typecheck, testes com cobertura, Codecov e build em PRs e na `main`). Biome (`npm run lint`, `npm run format`) e Knip (`npm run knip`) estão instalados; o Biome tem 0 erros e 0 avisos com as regras recomendadas, todas como erro (não rebaixe para `warn`; supressões só com `biome-ignore` e motivo concreto); os exports sem uso do Knip seguem em `warn` em `knip.json` e devem ser reduzidos por Issue própria. Commitlint roda localmente via Lefthook (`commit-msg`, instalado por `npm install` através de `prepare`) e no CI; o título do PR também é validado porque vira a mensagem do squash. Contratos de arquitetura ficam em `.dependency-cruiser.cjs` (`npm run arch`); `features-isoladas` está em `warn` por uma violação conhecida (`individual` → `damage/MovePreparation`). Cobertura: `npm run test:coverage` (Vitest v8; o resumo aparece no Job Summary do CI). O envio ao Codecov só ocorre quando o secret `CODECOV_TOKEN` existe no repositório; sem ele o passo é ignorado e não há badge. Mutação: `npm run test:mutation` (Stryker, restrito aos módulos TypeScript puros: `src/domain`, `trainer-session-model` e `damage/model`; baseline de 86% de mutantes mortos, excluindo mutantes de string literal. Os adaptadores CommonJS de `electron/` não são instrumentados pelo runner do Vitest (carregados por `createRequire`); são medidos à parte por `npm run test:mutation:cjs` (runner `command`, ~25 min, só no workflow semanal/manual `mutation-cjs.yml`): nbt 100%, player-import 83,1% (Issue #37; medido com concorrência 4 — com 12 o runner gera timeouts por carga e infla o número) e real-damage 92,2% em 03/10/2026, medidos depois da Issue #24; player-import foi remedido sem mudança de código nem de testes desde o registro anterior de 80,4%, então aquele número não se reproduz; os sobreviventes ficam em `reports/mutation-cjs/` (local, ignorado)) roda em `.github/workflows/mutation.yml` em PRs para `main` que toquem esses caminhos e semanalmente; é informativo (`break: null`), não bloqueia. Playwright, Sentry e OpenTelemetry **não serão instalados** (veja as exceções deliberadas acima). Atualize esta seção a cada ferramenta adotada.

## Regras específicas deste projeto

- O mapa `species` de `electron/lib/combat-compatibility.json` é gerado: altere as regras em `scripts/lib/compat-catalog.mjs` ou o conjunto de habilidades e rode `npm run catalog:generate -- --instance <pasta com mods/> --write`; nunca edite espécies à mão. O gerador só lê arquivos do jogo (mods, datapacks), nunca saves ou `config.json`.
- Nunca versionar `config.json`, saves, `.runtime/` ou logs locais (já estão no `.gitignore`). Fixtures em `test/fixtures/` são sintéticas.
- O app é local e não envia dados pela rede; Sentry/OpenTelemetry, quando adotados, não podem transmitir dados do jogador, caminhos locais ou UUIDs de jogador. Qualquer exportação de telemetria exige decisão explícita do usuário.
- Observabilidade local-first já adotada: `src/app/AppErrorBoundary.tsx` mostra um diagnóstico sanitizado (`src/platform/diagnostics.ts`) em vez de uma janela vazia, sem rede e sem IPC. Todo texto de erro exibido ou copiado deve passar por `scrubDiagnosticText`. Telemetria externa só entra por decisão explícita do dono do projeto e com o mesmo scrub.

## Precedência entre skills

- Este arquivo é a fonte da verdade do projeto. Se qualquer skill ou plugin (Addy Osmani agent-skills, Superpowers, Ponytail etc.) sugerir outro fluxo de git, CI, observabilidade ou padrão de qualidade, siga o que está aqui.
- Minimalismo de código (ex.: Ponytail) nunca remove skeleton, animações, testes, observabilidade ou checagens de CI: esses itens são requisitos, não excesso.
