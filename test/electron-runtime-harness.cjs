'use strict';

process.env.COMPANION_RUNTIME_TEST_MODE = '1';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

if (process.env.COMPANION_REQUIRE_MEDIUM === '1') {
  try {
    const user = execFileSync('whoami.exe', {encoding: 'utf8', timeout: 5000}).trim();
    const groups = execFileSync('whoami.exe', ['/groups'], {encoding: 'utf8', timeout: 5000});
    const integritySid = groups.match(/\bS-1-16-\d+\b/)?.[0] || null;
    console.log(`RUNTIME_TOKEN ${JSON.stringify({pid: process.pid, user, integritySid})}`);
    if (integritySid !== 'S-1-16-8192') {
      console.error('Electron não iniciou o teste: token do próprio runtime não é Medium.');
      process.exit(2);
    }
  } catch (error) {
    console.error(`Electron não iniciou o teste: falha ao verificar token (${error.message}).`);
    process.exit(2);
  }
}

const runtimeProfile = process.env.COMPANION_RUNTIME_PROFILE
  ? path.resolve(process.env.COMPANION_RUNTIME_PROFILE)
  : path.resolve(__dirname, '../.runtime/runtime-test-user-data');
fs.mkdirSync(runtimeProfile, {recursive: true});
app.setPath('userData', runtimeProfile);
app.setPath('sessionData', runtimeProfile);
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', path.join(runtimeProfile, 'electron.log'));
console.log(`RUNTIME_PROFILE ${JSON.stringify({userData: app.getPath('userData'), sessionData: app.getPath('sessionData')})}`);

require('../electron/main.cjs');

const timeoutMs = 8000;
let finished = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWindow() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) return window;
    await delay(25);
  }
  throw new Error('A janela Electron não carregou a primeira tela.');
}

async function waitFor(webContents, expression, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await webContents.executeJavaScript(expression)) return;
    await delay(25);
  }
  throw new Error(`Tempo esgotado aguardando: ${description}`);
}

async function evaluate(webContents, expression) {
  return webContents.executeJavaScript(expression);
}

function inViewportExpression(selectors) {
  return `(() => { const visible = selector => { const element = document.querySelector(selector); if (!element) return false; const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'; }; return ${JSON.stringify(selectors)}.every(visible); })()`;
}

async function scrollIntoViewport(webContents, anchorSelector, visibleSelectors, description) {
  let watchdog;
  try {
    await Promise.race([
      (async () => {
        await evaluate(
          webContents,
          `document.querySelector(${JSON.stringify(anchorSelector)}).scrollIntoView({block: 'center', behavior: 'auto'})`,
        );
        const condition = inViewportExpression(visibleSelectors);
        await waitFor(webContents, condition, description);
        assert.equal(await evaluate(webContents, condition), true, `${description} fora do viewport após scroll`);
      })(),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`Tempo esgotado aguardando viewport: ${description}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

async function waitForResponse(webContents, status, minimumCount = 1) {
  await waitFor(
    webContents,
    `window.cobblemonCompanion.test.getResponses().then(items => items.filter(item => item.status === ${JSON.stringify(status)}).length >= ${minimumCount})`,
    `resposta IPC ${status}`,
  );
}

function submitExpression() {
  return "document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))";
}

function clickButtonExpression(label) {
  return `(() => { const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Botão acessível não encontrado.'); button.click(); })()`;
}

async function chooseCandidate(webContents, label) {
  await evaluate(
    webContents,
    `(() => {
    const trigger = [...document.querySelectorAll('button[aria-haspopup]')].find(button =>
      (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === 'Golpe proposto'));
    if (!trigger) throw new Error('Combobox acessível não encontrado.');
    trigger.click();
  })()`,
  );
  await waitFor(
    webContents,
    'Boolean(document.querySelector(\'[role="listbox"][aria-label="Golpe proposto opções"]\'))',
    'opções acessíveis de golpe',
  );
  await evaluate(
    webContents,
    `(() => { const option = [...document.querySelectorAll('[role="option"]')].find(item => item.innerText.trim().startsWith(${JSON.stringify(label)})); if (!option) throw new Error('Opção acessível não encontrada.'); option.click(); })()`,
  );
}

async function run() {
  const window = await waitForWindow();
  const {webContents} = window;
  await waitFor(
    webContents,
    'Boolean(window.cobblemonCompanion?.test && window.cobblemonCompanion?.calculate && window.cobblemonCompanion?.cancel)',
    'ponte de cálculo offline e teste',
  );
  assert.equal(
    await evaluate(webContents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))'),
    false,
    'A demonstração offline carregou dados do save antes da atualização explícita.',
  );
  await evaluate(webContents, clickButtonExpression('Demonstração'));
  await waitFor(
    webContents,
    "Boolean(document.querySelector('form') && !document.querySelector('form').closest('[hidden]') && [...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Demonstração' && button.getAttribute('aria-current') === 'page'))",
    'rota Demonstração acessível',
  );
  const initial = await evaluate(webContents, 'document.body.innerText');
  assert.match(initial, /Pikachu → Floatzel/);
  assert.match(initial, /Recorte congelado/i);
  const fixedFacts = await evaluate(webContents, "document.querySelector('[aria-label=\"Dados fixos da demonstração\"]')?.innerText || ''");
  assert.match(fixedFacts, /Pikachu/);
  assert.match(fixedFacts, /Floatzel/);
  assert.match(fixedFacts, /Spark/);
  console.log('PASS rota Demonstração acessível e fixture independente dos dados do save');

  await evaluate(webContents, "document.querySelector('form button[type=submit]').click()");
  await waitFor(webContents, "Boolean(document.querySelector('#demo-result-title'))", 'resultado da comparação inicial');
  await waitForResponse(webContents, 'current');
  await evaluate(
    webContents,
    "(() => { const details = [...document.querySelectorAll('details')].find(item => item.querySelector('summary')?.innerText.trim() === 'Rastreabilidade e limites'); if (details) details.open = true; })()",
  );
  await waitFor(
    webContents,
    `(() => {
    const visible = element => {
      if (!element || element.getClientRects().length === 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const title = document.querySelector('#demo-result-title');
    const result = title?.closest('section');
    const phase = document.querySelector('strong[data-phase]');
    const damage = result?.querySelector('[role="group"][aria-label="Dano mínimo e HP restante, golpe atual e proposto"]');
    const details = [...document.querySelectorAll('details')]
      .find(item => item.querySelector('summary')?.innerText.trim() === 'Rastreabilidade e limites');
    const summary = details?.querySelector('summary');
    const limitsHeading = [...(details?.querySelectorAll('h4') || [])]
      .find(item => item.innerText.trim() === 'Limites');
    const limitContent = limitsHeading?.nextElementSibling;
    return Boolean(phase?.dataset.phase === 'result' && visible(title)
      && /Thunderbolt/.test(result?.innerText || '')
      && visible(damage) && visible(damage.querySelector('p strong')) && details?.open
      && visible(summary) && visible(details.querySelector('dl')) && visible(limitContent));
  })()`,
    'resultado current, rastreabilidade e limites visíveis',
  );
  const resultText = await evaluate(webContents, "document.querySelector('#demo-result-title')?.closest('section')?.innerText || ''");
  assert.match(resultText, /Thunderbolt/);
  assert.match(resultText, /Rastreabilidade e limites/);
  const traceFacts = await evaluate(
    webContents,
    "(() => { const details = [...document.querySelectorAll('details')].find(item => item.querySelector('summary')?.innerText.trim() === 'Rastreabilidade e limites'); return [...(details?.querySelectorAll('dl > div') || [])].map(row => ({label: row.querySelector('dt')?.innerText.trim(), value: row.querySelector('dd')?.innerText.trim()})); })()",
  );
  for (const label of ['Snapshot', 'Fontes', 'Evidências', 'Análise', 'Digest', 'Motor', 'Política']) {
    assert.ok(traceFacts.find((item) => item.label === label)?.value, `A rastreabilidade não apresentou ${label}.`);
  }
  assert.match(resultText, /Limites/);
  const damageValues = await evaluate(
    webContents,
    "(() => { const damage = document.querySelector('[role=\"group\"][aria-label=\"Dano mínimo e HP restante, golpe atual e proposto\"]'); return [...(damage?.querySelectorAll('p') || [])].map(node => node.querySelector('strong')?.textContent.trim()).filter(Boolean); })()",
  );
  assert.deepEqual(damageValues, ['36', '50'], 'A demonstração fixa não exibiu os danos mínimos 36/50.');
  console.log('PASS formulário → IPC → worker real → resultado exibido (36/50)');

  const screenshotPath = process.env.COMPANION_RUNTIME_SCREENSHOT || path.join(os.tmpdir(), 'cobblemon-companion-runtime-result.png');
  const damageSelector = '[role="group"][aria-label="Dano mínimo e HP restante, golpe atual e proposto"]';
  await scrollIntoViewport(webContents, damageSelector, ['#demo-result-title', damageSelector], 'resultado e dano visíveis no viewport');
  const screenshot = await window.capturePage();
  fs.writeFileSync(screenshotPath, screenshot.toPNG());
  console.log(`SCREENSHOT ${screenshotPath} ${screenshot.getSize().width}x${screenshot.getSize().height}`);

  const limitsScreenshotPath = path.join(path.dirname(screenshotPath), `${path.parse(screenshotPath).name}-limits.png`);
  await scrollIntoViewport(webContents, 'details ul', ['details summary', 'details ul'], 'rastreabilidade e limites visíveis no viewport');
  const limitsScreenshot = await window.capturePage();
  fs.writeFileSync(limitsScreenshotPath, limitsScreenshot.toPNG());
  console.log(`SCREENSHOT_LIMITS ${limitsScreenshotPath} ${limitsScreenshot.getSize().width}x${limitsScreenshot.getSize().height}`);

  await chooseCandidate(webContents, 'Spark (igual ao atual)');
  await waitFor(
    webContents,
    "!document.querySelector('#demo-result-title') && document.body.innerText.includes('Escolha Thunderbolt para comparar uma mudança com Spark.')",
    'invalidação após editar o formulário',
  );
  console.log('PASS edição remove resultado e mostra validação');

  await chooseCandidate(webContents, 'Thunderbolt');
  await waitFor(
    webContents,
    "!document.body.innerText.includes('Escolha Thunderbolt para comparar uma mudança com Spark.')",
    'restauração do formulário válido',
  );

  await evaluate(webContents, "window.cobblemonCompanion.test.setBehavior('delay')");
  await evaluate(webContents, "document.querySelector('form button[type=submit]').click()");
  await waitFor(
    webContents,
    "Boolean([...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Cancelar'))",
    'botão de cancelar',
  );
  await evaluate(webContents, clickButtonExpression('Cancelar'));
  await waitFor(
    webContents,
    "document.querySelector('strong[data-phase]')?.dataset.phase === 'cancelled'",
    'estado cancelado na interface',
  );
  await waitForResponse(webContents, 'cancelled');
  assert.equal(await evaluate(webContents, "Boolean(document.querySelector('#demo-result-title'))"), false);
  console.log('PASS cancelamento IPC sem publicar resultado');

  await evaluate(webContents, "window.cobblemonCompanion.test.setBehavior('delay')");
  await evaluate(webContents, submitExpression());
  await waitFor(
    webContents,
    "document.querySelector('strong[data-phase]')?.dataset.phase === 'running'",
    'primeira request do cenário stale',
  );
  await evaluate(webContents, submitExpression());
  await waitForResponse(webContents, 'current', 2);
  await waitForResponse(webContents, 'stale');
  await waitFor(
    webContents,
    "Boolean(document.querySelector('#demo-result-title')) && !document.querySelector('[role=\"alert\"]')",
    'resultado atual preservado após resposta antiga',
  );
  console.log('PASS resposta antiga marcada stale e ignorada pela tela');

  await evaluate(webContents, "window.cobblemonCompanion.test.setBehavior('failure')");
  await evaluate(webContents, submitExpression());
  await waitFor(webContents, 'Boolean(document.querySelector(\'[role="alert"]\'))', 'erro de cálculo na interface');
  await waitForResponse(webContents, 'failed');
  const errorText = await evaluate(webContents, "document.querySelector('[role=\"alert\"]')?.innerText || ''");
  assert.match(errorText, /Falha de fixture solicitada pelo harness/);
  assert.equal(await evaluate(webContents, "Boolean(document.querySelector('#demo-result-title'))"), false);
  console.log('PASS falha do worker apresentada sem resultado antigo');

  const statuses = await evaluate(webContents, 'window.cobblemonCompanion.test.getResponses()');
  console.log(`RESPONSES ${JSON.stringify(statuses)}`);
  console.log('PASS captura de tela via BrowserWindow.capturePage');
}

async function finish(error) {
  if (finished) return;
  finished = true;
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
  const window = BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed()) window.close();
  app.quit();
}

const safetyTimer = setTimeout(() => {
  void finish(new Error('Harness excedeu o limite total de execução.'));
}, 30000);

app
  .whenReady()
  .then(() => run())
  .then(
    () => finish(),
    (error) => finish(error),
  )
  .finally(() => clearTimeout(safetyTimer));

process.on('uncaughtException', (error) => {
  void finish(error);
});
process.on('unhandledRejection', (error) => {
  void finish(error);
});
