'use strict';

process.env.COMPANION_RUNTIME_TEST_MODE = '1';
process.env.COMPANION_TRAINER_UI_TEST_MODE = '1';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

const diagnosticsRoot = path.resolve(__dirname, '../.runtime/diagnostics');
fs.mkdirSync(diagnosticsRoot, {recursive: true});
const runDirectory = fs.mkdtempSync(path.join(diagnosticsRoot, 'trainer-ui-'));
const profileDirectory = path.join(runDirectory, 'electron-profile');
fs.mkdirSync(profileDirectory, {recursive: true});
app.setPath('userData', profileDirectory);
app.setPath('sessionData', profileDirectory);
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', path.join(runDirectory, 'electron.log'));

const screenshotPaths = Object.freeze({
  preview: path.join(runDirectory, 'move-preview.png'),
  demo: path.join(runDirectory, 'offline-demo-result.png'),
  gardevoirDamage: path.join(runDirectory, 'gardevoir-damage-result.png'),
  damageDefaultViewport: path.join(runDirectory, 'damage-default-viewport.png'),
  layout1440: path.join(runDirectory, 'layout-1440.png'),
  layout1440Result: path.join(runDirectory, 'layout-1440-result.png'),
  layout1200: path.join(runDirectory, 'layout-1200.png'),
  layout1200Result: path.join(runDirectory, 'layout-1200-result.png'),
  layout800: path.join(runDirectory, 'layout-800.png'),
  layout800Result: path.join(runDirectory, 'layout-800-result.png'),
  layout200Percent: path.join(runDirectory, 'layout-200-percent.png'),
  layout200PercentResult: path.join(runDirectory, 'layout-200-percent-result.png'),
  team1440: path.join(runDirectory, 'team-1440.png'),
  team1200: path.join(runDirectory, 'team-1200.png'),
  team800: path.join(runDirectory, 'team-800.png'),
  team200Percent: path.join(runDirectory, 'team-200-percent.png'),
  collection800: path.join(runDirectory, 'collection-800.png'),
  collection200Percent: path.join(runDirectory, 'collection-200-percent.png'),
  errorScreen: path.join(runDirectory, 'error-screen.png'),
});
require('../electron/main.cjs');

const timeoutMs = 15_000;
let finished = false;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

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
  throw new Error('A janela segura do aplicativo não carregou.');
}

async function evaluate(contents, expression) {
  return contents.executeJavaScript(expression);
}

async function waitFor(contents, expression, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(contents, expression)) return;
    await delay(25);
  }
  throw new Error(`Tempo esgotado: ${description}.`);
}

async function clickButton(contents, label) {
  await evaluate(
    contents,
    `(() => {
    const button = [...document.querySelectorAll('button')]
      .find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Botão acessível não encontrado.');
    button.click();
  })()`,
  );
}

async function navigate(contents, label) {
  await evaluate(
    contents,
    `(() => {
    const button = [...document.querySelectorAll('nav[aria-label="Vistas"] button')]
      .find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Rota acessível não encontrada.');
    button.click();
  })()`,
  );
}

async function selectIndividual(contents, uuid) {
  await evaluate(
    contents,
    `(() => {
    const item = [...document.querySelectorAll('[data-individual-id]')]
      .find(node => node.dataset.individualId === ${JSON.stringify(uuid)});
    if (!item) throw new Error('Indivíduo sintético não encontrado na coleção atual.');
    item.click();
  })()`,
  );
  await waitFor(
    contents,
    `(() => {
    const selected = [...document.querySelectorAll('[data-individual-id]')]
      .find(node => node.dataset.individualId === ${JSON.stringify(uuid)});
    return selected?.getAttribute('aria-selected') === 'true'
      && Boolean(document.querySelector('[data-testid="individual-details"]'));
  })()`,
    'seleção do UUID na coleção',
  );
}

async function clickTab(contents, label) {
  await evaluate(
    contents,
    `(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')]
      .find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!tab) throw new Error('A guia acessível do indivíduo não foi encontrada.');
    tab.click();
  })()`,
  );
}

async function openCaptureDetails(contents) {
  await evaluate(
    contents,
    `(() => {
    const button = [...document.querySelectorAll('[data-testid="individual-details"] button')]
      .find(item => item.textContent.includes('Dados da captura'));
    if (!button) throw new Error('A seção de captura não foi encontrada.');
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
  })()`,
  );
  await waitFor(
    contents,
    "Boolean([...document.querySelectorAll('[data-testid=\"individual-details\"] dt')].find(node => node.textContent.trim() === 'UUID'))",
    'detalhes sintéticos da captura',
  );
}

async function selectedUuid(contents) {
  return evaluate(
    contents,
    `(() => {
    const field = [...document.querySelectorAll('[data-testid="individual-details"] dt')]
      .find(node => node.textContent.trim() === 'UUID');
    return field?.parentElement?.querySelector('dd code')?.textContent.trim() || null;
  })()`,
  );
}

async function chooseSelect(contents, labelText, optionText) {
  const listboxName = `${labelText} opções`;
  await evaluate(
    contents,
    `(() => {
    const trigger = [...document.querySelectorAll('button[aria-haspopup]')].find(button =>
      (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === ${JSON.stringify(labelText)}));
    if (!trigger) throw new Error('O acionador acessível do seletor não foi encontrado.');
    trigger.click();
  })()`,
  );
  await waitFor(
    contents,
    `(() => [...document.querySelectorAll('[role="listbox"]')]
    .some(listbox => listbox.getAttribute('aria-label') === ${JSON.stringify(listboxName)}
      && listbox.getClientRects().length > 0))()`,
    `opções de ${labelText}`,
  );
  await evaluate(
    contents,
    `(() => {
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(listboxName)});
    const option = [...(listbox?.querySelectorAll('[role="option"]') || [])]
      .find(item => item.textContent.trim() === ${JSON.stringify(optionText)}
        && item.getClientRects().length > 0);
    if (!option) throw new Error('A opção acessível não foi encontrada.');
    option.click();
  })()`,
  );
}

async function chooseComboBox(contents, labelText, optionText) {
  const listboxName = `${labelText} opções`;
  await evaluate(
    contents,
    `(() => {
    const label = [...document.querySelectorAll('.real-damage-planner label')]
      .find(node => node.textContent.trim() === ${JSON.stringify(labelText)});
    const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error('O campo de busca acessível não foi encontrado.');
    input.focus();
    input.select();
  })()`,
  );
  await contents.insertText(optionText);
  await waitFor(
    contents,
    `(() => [...document.querySelectorAll('[role="listbox"]')]
    .some(listbox => listbox.getAttribute('aria-label') === ${JSON.stringify(listboxName)}
      && listbox.getClientRects().length > 0))()`,
    `opções de ${labelText}`,
  );
  await evaluate(
    contents,
    `(() => {
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(listboxName)});
    const option = [...(listbox?.querySelectorAll('[role="option"]') || [])]
      .find(item => item.textContent.trim() === ${JSON.stringify(optionText)});
    if (!option) throw new Error('A opção acessível não foi encontrada.');
    option.click();
  })()`,
  );
  await waitFor(
    contents,
    `(() => {
    const label = [...document.querySelectorAll('.real-damage-planner label')]
      .find(node => node.textContent.trim() === ${JSON.stringify(labelText)});
    return document.getElementById(label?.htmlFor || '')?.value === ${JSON.stringify(optionText)};
  })()`,
    `valor de ${labelText}`,
  );
}

async function pickOption(contents, listboxLabel, optionLabel) {
  const findOption = `(() => {
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(listboxLabel)});
    return [...(listbox?.querySelectorAll('[role="option"]') || [])]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(optionLabel)});
  })()`;
  await evaluate(
    contents,
    `(() => {
    const option = ${findOption};
    if (!option) throw new Error('A opção do seletor de golpes não foi encontrada.');
    option.click();
  })()`,
  );
  await waitFor(contents, `${findOption}?.getAttribute('aria-selected') === 'true'`, `seleção de ${optionLabel}`);
}

async function setLabeledInput(contents, labelText, value, groupLegend = null) {
  await evaluate(
    contents,
    `(() => {
    const labels = [...document.querySelectorAll('.real-damage-planner label')]
      .filter(node => node.textContent.trim() === ${JSON.stringify(labelText)});
    const label = labels.find(node => !${JSON.stringify(groupLegend)}
      || node.closest('fieldset')?.querySelector('legend')?.textContent.trim() === ${JSON.stringify(groupLegend)});
    const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error('Campo de entrada acessível não encontrado.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  })()`,
  );
}

async function capture(window, filePath, anchorSelector) {
  const resolved = path.resolve(filePath);
  check(resolved.startsWith(`${diagnosticsRoot}${path.sep}`), 'A captura solicitada está fora de .runtime/diagnostics.');
  await evaluate(
    window.webContents,
    `(() => {
    const target = document.querySelector(${JSON.stringify(anchorSelector)});
    if (!target) throw new Error('A superfície sintética da captura não foi encontrada.');
    let container = target.parentElement;
    while (container && container !== document.body) {
      const overflowY = getComputedStyle(container).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll')
        && container.scrollHeight > container.clientHeight) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) {
      target.scrollIntoView({block: 'center', behavior: 'instant'});
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top - 16;
  })()`,
  );
  const pageScroll = await evaluate(
    window.webContents,
    '({documentTop: document.documentElement.scrollTop, bodyTop: document.body.scrollTop})',
  );
  check(pageScroll.documentTop === 0 && pageScroll.bodyTop === 0, 'A captura deslocou a navegação global para fora do viewport.');
  await delay(50);
  const image = await window.capturePage();
  fs.writeFileSync(resolved, image.toPNG());
  check(image.getSize().width > 0 && image.getSize().height > 0, 'A captura de tela ficou vazia.');
}

async function waitForResponse(contents, status, minimumCount = 1) {
  await waitFor(
    contents,
    `window.cobblemonCompanion.test.getResponses().then(items => items.filter(item => item.status === ${JSON.stringify(status)}).length >= ${minimumCount})`,
    `resposta de demonstração ${status}`,
  );
}

function idSet(items) {
  return new Set(items.map((item) => item.uuid));
}

async function exerciseCollectionAndDamage(window, snapshot) {
  const contents = window.webContents;
  const team = snapshot.individuals.filter((individual) => individual.location.container === 'party');
  const pc = snapshot.individuals.filter((individual) => individual.location.container === 'pc');
  const uniqueUuids = new Set(snapshot.individuals.map((individual) => individual.uuid));
  check(uniqueUuids.size === snapshot.individuals.length, 'Os indivíduos sintéticos não têm UUIDs únicos.');
  const repeatedSpecies = new Map();
  for (const individual of snapshot.individuals) {
    repeatedSpecies.set(individual.speciesId, [...(repeatedSpecies.get(individual.speciesId) || []), individual.uuid]);
  }
  check(
    [...repeatedSpecies.values()].some((uuids) => uuids.length > 1),
    'A fixture não contém indivíduos repetidos da mesma espécie.',
  );
  check(team.length > 0 && pc.length > 0, 'A fixture precisa conter indivíduos na equipe e no PC.');

  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="refresh-snapshot"]\'))', 'ação de atualização');
  await clickButton(contents, 'Atualizar do save');
  await waitFor(
    contents,
    `(() => {
    const items = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
      .map(node => node.dataset.individualId);
    return items.length === ${team.length};
  })()`,
    'carregamento sintético da equipe',
  );
  const teamIds = await evaluate(
    contents,
    "[...document.querySelectorAll('[data-testid=collection] [data-individual-id]')].map(node => node.dataset.individualId)",
  );
  assert.deepEqual(new Set(teamIds), idSet(team), 'A rota Equipe não corresponde aos UUIDs capturados.');

  const alternate = snapshot.individuals.find((individual) => individual.formId !== 'normal');
  const damageIndividual = snapshot.individuals.find(
    (individual) =>
      individual.equippedMovesKnown &&
      individual.learnedMovesKnown &&
      individual.equippedMoves.length > 0 &&
      individual.learnedMoves.length > 0,
  );
  const emptyKnown = snapshot.individuals.find(
    (individual) =>
      individual.equippedMovesKnown &&
      individual.learnedMovesKnown &&
      individual.equippedMoves.length === 0 &&
      individual.learnedMoves.length === 0,
  );
  check(alternate && damageIndividual && emptyKnown, 'A fixture não cobre forma alternativa, cálculo e listas vazias conhecidas.');
  check(
    damageIndividual.speciesId === 'cobblemon:gardevoir' &&
      damageIndividual.formId === 'normal' &&
      damageIndividual.observed.ability === 'cobblemon:synchronize',
    'A captura sintética não exercita Gardevoir normal com Synchronize no fluxo de dano.',
  );
  check(
    team.some((individual) => individual.uuid === alternate.uuid),
    'O indivíduo de forma alternativa não está na equipe sintética.',
  );

  await selectIndividual(contents, alternate.uuid);
  await openCaptureDetails(contents);
  check((await selectedUuid(contents)) === alternate.uuid, 'A ficha exibiu outro UUID para a espécie repetida.');
  const expectedLocation = alternate.location.container === 'party' ? `Equipe · slot ${alternate.location.slot + 1}` : null;
  const detailText = await evaluate(contents, 'document.querySelector(\'[data-testid="individual-details"]\').innerText');
  check(
    expectedLocation !== null && detailText.includes(expectedLocation) && !/posição \d/.test(detailText),
    'A ficha não mostra o slot em numeração a partir de 1.',
  );
  const alternateArtworkFallback = await evaluate(
    contents,
    'Boolean(document.querySelector(\'[data-testid="individual-details"] [role="img"][aria-label="Imagem indisponível"]\'))',
  );
  check(alternateArtworkFallback, 'A forma alternativa não usou o fallback acessível de artwork.');
  await clickTab(contents, 'Atributos');
  const unknownStats = await evaluate(
    contents,
    `(() => {
    const row = document.querySelector('[data-testid="individual-details"] tbody tr');
    return row ? [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()) : [];
  })()`,
  );
  check(
    unknownStats.length === 3 && unknownStats.every((value) => value === 'Não capturado'),
    'Os fatos desconhecidos foram confundidos com valores numéricos zero.',
  );
  await clickTab(contents, 'Golpes');
  const unknownMoveState = await evaluate(
    contents,
    `(() => [...document.querySelectorAll('[data-testid="individual-details"] h3')]
    .filter(node => ['Golpes equipados', 'Golpes aprendidos'].includes(node.textContent.trim()))
    .map(node => node.parentElement.querySelector('[role="status"]')?.textContent.trim() || null))()`,
  );
  check(
    unknownMoveState.length === 2 && unknownMoveState.every((value) => value === 'Lista de golpes não capturada.'),
    'Listas desconhecidas não foram apresentadas como desconhecidas.',
  );

  await navigate(contents, 'PC');
  await waitFor(
    contents,
    `document.querySelectorAll('[data-testid="collection"] [data-individual-id]').length === ${pc.length}`,
    'coleção do PC',
  );
  const pcIds = await evaluate(
    contents,
    "[...document.querySelectorAll('[data-testid=collection] [data-individual-id]')].map(node => node.dataset.individualId)",
  );
  assert.deepEqual(new Set(pcIds), idSet(pc), 'A rota PC não corresponde aos UUIDs capturados.');
  await selectIndividual(contents, emptyKnown.uuid);
  await openCaptureDetails(contents);
  check((await selectedUuid(contents)) === emptyKnown.uuid, 'A ficha do PC não manteve o UUID selecionado.');
  await clickTab(contents, 'Golpes');
  const zeroMoveStates = await evaluate(
    contents,
    `(() => [...document.querySelectorAll('[data-testid="individual-details"] h3')]
    .filter(node => ['Golpes equipados', 'Golpes aprendidos'].includes(node.textContent.trim()))
    .map(node => node.parentElement.querySelector('[role="status"]')?.textContent.trim() || null))()`,
  );
  check(
    zeroMoveStates.length === 2 && zeroMoveStates.every((value) => value === 'Nenhum golpe registrado nesta captura.'),
    'Uma lista conhecida vazia não foi distinguida de uma lista não capturada.',
  );
  await clickTab(contents, 'Atributos');
  const zeroStats = await evaluate(
    contents,
    `(() => {
    const row = document.querySelector('[data-testid="individual-details"] tbody tr');
    return row ? [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()) : [];
  })()`,
  );
  check(
    zeroStats.length === 3 && zeroStats[0] === '0' && zeroStats[2] === '0',
    'Valores numéricos zero não foram mantidos como fatos conhecidos.',
  );

  await navigate(contents, 'Ajuda e diagnóstico');
  await waitFor(contents, 'Boolean(document.querySelector(\'[aria-labelledby="help-title"]\'))', 'rota Ajuda e diagnóstico');
  await navigate(contents, 'Equipe');
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))', 'retorno à equipe após diagnóstico');
  await selectIndividual(contents, damageIndividual.uuid);
  await openCaptureDetails(contents);
  check((await selectedUuid(contents)) === damageIndividual.uuid, 'A espécie repetida selecionou outro indivíduo pelo UUID.');
  await clickTab(contents, 'Golpes');
  await pickOption(contents, 'Slot equipado para a prévia', 'Slot 1 · Tackle');
  await pickOption(contents, 'Golpe aprendido para a proposta', 'Seed Bomb');
  await waitFor(contents, 'Boolean(document.querySelector(\'[aria-label="Prévia da troca planejada"]\'))', 'prévia de troca antes/depois');
  check(
    await evaluate(contents, 'document.querySelectorAll(\'[data-testid="individual-details"] button[aria-haspopup]\').length === 0'),
    'A aba Golpes ainda expõe seletores em lista suspensa.',
  );
  const preview = await evaluate(
    contents,
    `(() => {
    const panel = document.querySelector('[aria-label="Prévia da troca planejada"]');
    return {text: panel?.innerText || '', values: [...(panel?.querySelectorAll('strong') || [])].map(node => node.textContent.trim())};
  })()`,
  );
  check(
    preview.values.length === 2 && preview.values[0] === 'Tackle' && preview.values[1] === 'Seed Bomb',
    'A prévia não corresponde aos golpes do UUID escolhido.',
  );
  await capture(window, screenshotPaths.preview, '[aria-label="Prévia da troca planejada"]');
  console.log('PASS preview de troca sintética e screenshot em diagnostics');

  await clickButton(contents, 'Abrir cálculo de dano');
  await waitFor(contents, "Boolean(document.querySelector('.real-damage-planner'))", 'navegação da prévia ao cálculo de dano');
}

async function exerciseDemo(contents) {
  await navigate(contents, 'Demonstração');
  await waitFor(
    contents,
    `(() => {
    const route = [...document.querySelectorAll('nav[aria-label="Vistas"] button')]
      .find(button => button.textContent.trim() === 'Demonstração');
    const heading = [...document.querySelectorAll('h2')]
      .find(node => node.textContent.trim() === 'Demonstração offline');
    return route?.getAttribute('aria-current') === 'page'
      && Boolean(heading?.getClientRects().length && document.querySelector('#demo-form-title') && window.cobblemonCompanion.test);
  })()`,
    'rota independente da demonstração',
  );
  const fixedFacts = await evaluate(contents, "document.querySelector('[aria-label=\"Dados fixos da demonstração\"]')?.innerText || ''");
  check(/Pikachu/.test(fixedFacts) && /Floatzel/.test(fixedFacts), 'A demonstração não manteve sua fixture offline fixa.');
  await clickButton(contents, 'Executar comparação');
  await waitFor(contents, "Boolean(document.querySelector('#demo-result-title'))", 'resultado inicial da demonstração offline');
  await waitForResponse(contents, 'current');
  const initialResult = await evaluate(
    contents,
    `(() => ({
    text: document.querySelector('[aria-label="Dano mínimo e HP restante, golpe atual e proposto"]')?.innerText || '',
    panel: document.querySelector('#demo-result-title')?.closest('section')?.innerText || '',
  }))()`,
  );
  check(
    /Thunderbolt/.test(initialResult.text) && /36/.test(initialResult.text) && /50/.test(initialResult.text),
    'O resultado worker-driven da demo deixou de exibir a comparação esperada.',
  );
  check(/Rastreabilidade e limites/.test(initialResult.panel), 'A demo não apresentou rastreabilidade e limites.');
  const trace = await evaluate(
    contents,
    `(() => {
    const summary = [...document.querySelectorAll('summary')].find(node => node.textContent.trim() === 'Rastreabilidade e limites');
    if (summary) summary.parentElement.open = true;
    return Boolean(summary);
  })()`,
  );
  check(trace, 'A rastreabilidade acessível da demo não foi encontrada.');
  await capture(BrowserWindow.getAllWindows()[0], screenshotPaths.demo, '#demo-result-title');
  console.log('PASS rota Demonstração independente, resultado 36/50 e screenshot em diagnostics');

  await evaluate(contents, "window.cobblemonCompanion.test.setBehavior('delay')");
  await clickButton(contents, 'Executar comparação');
  await waitFor(
    contents,
    "[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Cancelar')",
    'ação de cancelar demo',
  );
  await clickButton(contents, 'Cancelar');
  await waitFor(
    contents,
    "document.querySelector('[data-phase]')?.getAttribute('data-phase') === 'cancelled'",
    'cancelamento visual da demo',
  );
  await waitForResponse(contents, 'cancelled');
  check(
    !(await evaluate(contents, "Boolean(document.querySelector('#demo-result-title'))")),
    'O cancelamento publicou um resultado antigo.',
  );
  console.log('PASS cancelamento da demo sem resultado');

  await evaluate(contents, "window.cobblemonCompanion.test.setBehavior('delay')");
  await evaluate(
    contents,
    `(() => {
    const form = document.querySelector('#demo-form-title')?.closest('section')?.querySelector('form');
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
  })()`,
  );
  await waitFor(contents, "document.querySelector('[data-phase]')?.getAttribute('data-phase') === 'running'", 'primeira requisição stale');
  await evaluate(
    contents,
    `(() => {
    const form = document.querySelector('#demo-form-title')?.closest('section')?.querySelector('form');
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
  })()`,
  );
  await waitForResponse(contents, 'current', 2);
  await waitForResponse(contents, 'stale');
  await waitFor(
    contents,
    "Boolean(document.querySelector('#demo-result-title')) && !document.querySelector('[role=alert]')",
    'resultado atual preservado após resposta stale',
  );
  console.log('PASS resposta antiga da demo marcada stale e ignorada');

  await evaluate(contents, "window.cobblemonCompanion.test.setBehavior('failure')");
  await clickButton(contents, 'Executar comparação');
  await waitFor(contents, "Boolean(document.querySelector('[role=alert]'))", 'falha do worker da demo');
  await waitForResponse(contents, 'failed');
  const failureText = await evaluate(contents, "document.querySelector('[role=alert]')?.innerText || ''");
  check(/Falha de fixture solicitada pelo harness/.test(failureText), 'A falha sintética do worker não foi apresentada na interface.');
  check(
    !(await evaluate(contents, "Boolean(document.querySelector('#demo-result-title'))")),
    'A falha da demo preservou um resultado anterior.',
  );
  console.log('PASS falha do worker apresentada sem resultado anterior');
}

async function exerciseRealDamage(contents) {
  await navigate(contents, 'Equipe');
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))', 'retorno à equipe após demonstração');
  const collectionSelectedUuid = await evaluate(
    contents,
    "document.querySelector('[data-testid=collection] [data-individual-id][aria-selected=true]')?.dataset.individualId || null",
  );
  check(collectionSelectedUuid, 'A navegação da demo removeu a seleção da equipe.');
  await navigate(contents, 'Demonstração');
  await waitFor(contents, "Boolean(document.querySelector('#demo-form-title'))", 'demonstração independente da seleção');
  await navigate(contents, 'Equipe');
  const selectedAfterDemo = await evaluate(
    contents,
    "document.querySelector('[data-testid=collection] [data-individual-id][aria-selected=true]')?.dataset.individualId || null",
  );
  check(selectedAfterDemo === collectionSelectedUuid, 'A rota da demo alterou o indivíduo capturado selecionado.');

  const window = BrowserWindow.getAllWindows()[0];
  window.setContentSize(1186, 852);
  await waitFor(contents, 'window.innerWidth === 1186', 'viewport reportado de 1186px');
  await navigate(contents, 'Dano');
  await waitFor(contents, "Boolean(document.querySelector('.real-damage-planner'))", 'rota de cálculo real');
  await waitFor(contents, "Boolean(document.querySelector('.real-damage-form'))", 'formulário real de dano');
  const initialGate = await evaluate(
    contents,
    `(() => {
    const submit = [...document.querySelectorAll('.real-damage-planner button')]
      .find(button => button.textContent.trim() === 'Calcular rolls de dano');
    const checks = [...document.querySelectorAll('.real-confirmations input[type="checkbox"]')];
    return Boolean(submit?.disabled && checks.length === 5 && checks.every(check => !check.checked));
  })()`,
  );
  check(initialGate, 'O cálculo real não começou bloqueado pelas cinco confirmações acessíveis.');

  await chooseComboBox(contents, 'Espécie', 'Abra');
  await setLabeledInput(contents, 'Nível', '50');
  await chooseSelect(contents, 'Natureza', 'Modest');
  await chooseSelect(contents, 'Habilidade', 'Synchronize');
  const stats = ['HP', 'Ataque', 'Defesa', 'Ataque especial', 'Defesa especial', 'Velocidade'];
  for (const label of stats) {
    await setLabeledInput(contents, label, '31', 'IVs · 0–31');
    await setLabeledInput(contents, label, '0', 'EVs · 0–252, soma até 510');
  }
  const stillBlocked = await evaluate(
    contents,
    `([...document.querySelectorAll('.real-damage-planner button')]
    .find(button => button.textContent.trim() === 'Calcular rolls de dano'))?.disabled === true`,
  );
  check(stillBlocked, 'A confirmação incompleta habilitou o cálculo real.');
  const confirmationChecks = await evaluate(
    contents,
    `[...document.querySelectorAll('.real-confirmations input[type="checkbox"]')]
    .map(check => check.checked)`,
  );
  check(
    confirmationChecks.length === 5 && confirmationChecks.every((value) => value === false),
    'O formulário não apresentou as cinco confirmações inicialmente desmarcadas.',
  );
  for (let index = 0; index < 5; index += 1) {
    await evaluate(contents, `document.querySelectorAll('.real-confirmations input[type="checkbox"]')[${index}].click()`);
    if (index === 0) {
      await waitFor(
        contents,
        `(() => {
        const planner = document.querySelector('.real-damage-planner');
        const form = document.querySelector('.real-damage-form');
        const rect = form?.getBoundingClientRect();
        return Boolean(planner && form && form.innerText.trim()
          && rect && rect.width > 0 && rect.height > 0
          && rect.bottom > 0 && rect.top < window.innerHeight
          && document.querySelector('.real-confirmations input[type="checkbox"]')?.checked);
      })()`,
        'formulário visível após marcar a primeira confirmação',
      );
      await capture(window, screenshotPaths.damageDefaultViewport, '.real-damage-planner');
    }
  }
  await waitFor(
    contents,
    `([...document.querySelectorAll('.real-damage-planner button')]
    .find(button => button.textContent.trim() === 'Calcular rolls de dano'))?.disabled === false`,
    'confirmações completas',
  );
  await clickButton(contents, 'Calcular rolls de dano');
  await waitFor(
    contents,
    "Boolean(document.querySelector('.real-damage-result') || document.querySelector('.real-damage-error'))",
    'resposta do cálculo com snapshot sintético',
  );
  await evaluate(contents, "document.querySelector('.real-damage-trace').open = true");
  const calculation = await evaluate(
    contents,
    `(() => ({
    ranges: [...document.querySelectorAll('.real-damage-ranges strong')].map(node => node.textContent.trim()),
    ruleset: document.querySelector('.real-damage-trace')?.innerText || '',
    error: document.querySelector('.real-damage-error')?.textContent.trim() || null,
  }))()`,
  );
  check(
    !calculation.error &&
      calculation.ranges.length === 2 &&
      calculation.ranges.every((value) => /\d+–\d+\s*HP/.test(value)) &&
      /cobblemon-1\.7\.3/.test(calculation.ruleset) &&
      /[a-f0-9]{64}/.test(calculation.ruleset),
    'O cálculo real sintético não apresentou os dois ranges, catálogo e digest.',
  );
  await capture(BrowserWindow.getAllWindows()[0], screenshotPaths.gardevoirDamage, '.real-damage-result');
  console.log('PASS cálculo real Gardevoir via snapshot sintético e screenshot em diagnostics');
  window.setContentSize(1440, 1000);
  contents.setZoomFactor(1);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport padrão do harness');
}

async function exerciseRefreshInvalidation(window, snapshot) {
  const contents = window.webContents;
  const partyIndividual = snapshot.individuals.find((individual) => individual.location.container === 'party');
  check(Boolean(partyIndividual), 'A fixture não tem seleção inicial na equipe.');
  check(
    await evaluate(contents, "Boolean(document.querySelector('.real-damage-result'))"),
    'O cenário de refresh não começou com um resultado de dano ativo.',
  );
  await clickButton(contents, 'Voltar à equipe');
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))', 'retorno da rota de dano');
  await clickTab(contents, 'Golpes');
  check(
    await evaluate(contents, 'Boolean(document.querySelector(\'[aria-label="Prévia da troca planejada"]\'))'),
    'O cenário de refresh não começou com uma prévia de troca ativa.',
  );
  await navigate(contents, 'Demonstração');
  await waitFor(contents, "Boolean(document.querySelector('#demo-form-title'))", 'navegação sem afetar a captura');
  await navigate(contents, 'Equipe');
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="refresh-snapshot"]\'))', 'ação de refresh');
  await clickButton(contents, 'Atualizar do save');
  await waitFor(
    contents,
    'Boolean(document.querySelector(\'[data-testid="collection"] [data-individual-id]\'))',
    'snapshot sintético atualizado',
  );
  await selectIndividual(contents, partyIndividual.uuid);
  await clickTab(contents, 'Golpes');
  check(
    !(await evaluate(contents, 'Boolean(document.querySelector(\'[aria-label="Prévia da troca planejada"]\'))')),
    'O refresh preservou a prévia de troca anterior.',
  );
  await navigate(contents, 'Dano');
  await waitFor(contents, "Boolean(document.querySelector('.real-damage-planner'))", 'planner após refresh');
  check(
    !(await evaluate(contents, "Boolean(document.querySelector('.real-damage-result'))")),
    'O refresh preservou um resultado de cálculo real anterior.',
  );
  console.log('PASS refresh invalida prévia e resultado de dano');
}

async function exerciseResponsiveLayout(window, snapshot) {
  const contents = window.webContents;
  await navigate(contents, 'Demonstração');
  await waitFor(
    contents,
    `(() => {
    const route = [...document.querySelectorAll('nav[aria-label="Vistas"] button')]
      .find(button => button.textContent.trim() === 'Demonstração');
    const heading = [...document.querySelectorAll('h2')]
      .find(node => node.textContent.trim() === 'Demonstração offline');
    const form = document.querySelector('#demo-form-title');
    return route?.getAttribute('aria-current') === 'page'
      && Boolean(heading?.getClientRects().length && form?.getClientRects().length
        && window.cobblemonCompanion.test);
  })()`,
    'rota Demonstração na revisão responsiva',
  );
  await evaluate(contents, "window.cobblemonCompanion.test.setBehavior('normal')");
  await clickButton(contents, 'Executar comparação');
  await waitFor(contents, "Boolean(document.querySelector('#demo-result-title'))", 'resultado para revisão responsiva');
  await waitForResponse(contents, 'current', 3);
  await evaluate(
    contents,
    `(() => {
    const details = [...document.querySelectorAll('details')]
      .find(item => item.querySelector('summary')?.textContent.trim() === 'Rastreabilidade e limites');
    if (details) details.open = true;
  })()`,
  );

  const layouts = [
    {
      label: '1440px',
      width: 1440,
      zoom: 1,
      screenshot: screenshotPaths.layout1440,
      resultScreenshot: screenshotPaths.layout1440Result,
    },
    {
      label: '1200px',
      width: 1200,
      zoom: 1,
      screenshot: screenshotPaths.layout1200,
      resultScreenshot: screenshotPaths.layout1200Result,
    },
    {
      label: '800px',
      width: 800,
      zoom: 1,
      screenshot: screenshotPaths.layout800,
      resultScreenshot: screenshotPaths.layout800Result,
    },
    {
      label: '200% zoom',
      width: 1440,
      zoom: 2,
      screenshot: screenshotPaths.layout200Percent,
      resultScreenshot: screenshotPaths.layout200PercentResult,
    },
  ];
  for (const layout of layouts) {
    window.setContentSize(layout.width, 1000);
    contents.setZoomFactor(layout.zoom);
    const expectedWidth = Math.round(layout.width / layout.zoom);
    try {
      await waitFor(contents, `window.innerWidth === ${expectedWidth}`, `viewport ${layout.label}`);
    } catch (error) {
      const actual = await evaluate(contents, '({inner: window.innerWidth, dpr: window.devicePixelRatio, screen: screen.availWidth})');
      throw new Error(`${error.message} Observado: ${JSON.stringify(actual)}; zoom ${contents.getZoomFactor()}.`);
    }
    const geometry = await evaluate(
      contents,
      `(() => {
      const root = document.documentElement;
      const form = document.querySelector('#demo-form-title')?.closest('section');
      const result = document.querySelector('#demo-result-title')?.closest('section');
      return {
        viewportWidth: window.innerWidth,
        clientWidth: root.clientWidth,
        documentWidth: root.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        formWidth: form?.getBoundingClientRect().width ?? 0,
        resultWidth: result?.getBoundingClientRect().width ?? 0,
        activeDemo: [...document.querySelectorAll('nav[aria-label="Vistas"] button')]
          .some(button => button.textContent.trim() === 'Demonstração'
            && button.getAttribute('aria-current') === 'page'),
      };
    })()`,
    );
    check(
      geometry.viewportWidth === expectedWidth &&
        geometry.documentWidth <= geometry.clientWidth &&
        geometry.bodyWidth <= geometry.viewportWidth &&
        geometry.formWidth > 0 &&
        geometry.resultWidth > 0 &&
        geometry.activeDemo,
      `O layout ${layout.label} excedeu a largura disponível ou ocultou o fluxo da demonstração.`,
    );
    await capture(window, layout.screenshot, '#demo-form-title');
    await capture(window, layout.resultScreenshot, '#demo-result-title');
    console.log(`PASS layout ${layout.label}: ${geometry.viewportWidth} CSS px sem overflow horizontal`);
  }
  const damageIndividual = snapshot.individuals.find(
    (individual) =>
      individual.equippedMovesKnown &&
      individual.learnedMovesKnown &&
      individual.equippedMoves.length > 0 &&
      individual.learnedMoves.length > 0,
  );
  check(damageIndividual, 'A fixture não oferece uma ficha elegível para revisão responsiva.');
  window.setContentSize(1440, 1000);
  contents.setZoomFactor(1);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport desktop');
  await navigate(contents, 'Equipe');
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))', 'coleção para revisão responsiva');
  await selectIndividual(contents, damageIndividual.uuid);
  await clickTab(contents, 'Golpes');
  await pickOption(contents, 'Slot equipado para a prévia', 'Slot 1 · Tackle');
  await pickOption(contents, 'Golpe aprendido para a proposta', 'Seed Bomb');
  await waitFor(contents, 'Boolean(document.querySelector(\'[aria-label="Prévia da troca planejada"]\'))', 'prévia responsiva');

  const trainerLayouts = [
    {label: '1440px', width: 1440, zoom: 1, screenshot: screenshotPaths.team1440},
    {label: '1200px', width: 1200, zoom: 1, screenshot: screenshotPaths.team1200},
    {
      label: '800px',
      width: 800,
      zoom: 1,
      screenshot: screenshotPaths.team800,
      collectionScreenshot: screenshotPaths.collection800,
    },
    {
      label: '200% zoom',
      width: 1440,
      zoom: 2,
      screenshot: screenshotPaths.team200Percent,
      collectionScreenshot: screenshotPaths.collection200Percent,
    },
  ];
  for (const layout of trainerLayouts) {
    window.setContentSize(layout.width, 1000);
    contents.setZoomFactor(layout.zoom);
    const expectedWidth = Math.round(layout.width / layout.zoom);
    const expectedWide = expectedWidth >= 1100;
    await waitFor(
      contents,
      `window.innerWidth === ${expectedWidth}
      && document.querySelector('[data-wide]')?.getAttribute('data-wide') === '${expectedWide}'`,
      `layout compacto ou amplo ${layout.label}`,
    );
    const geometry = await evaluate(
      contents,
      `(() => {
      const root = document.documentElement;
      const grid = document.querySelector('[data-wide]');
      const collection = document.querySelector('[data-testid="collection"]');
      const detail = document.querySelector('[data-testid="individual-details"]');
      const preview = document.querySelector('[aria-label="Prévia da troca planejada"]');
      const selected = [...document.querySelectorAll('[data-individual-id]')]
        .find(item => item.dataset.individualId === ${JSON.stringify(damageIndividual.uuid)});
      return {
        viewportWidth: window.innerWidth,
        clientWidth: root.clientWidth,
        documentWidth: root.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        wide: grid?.dataset.wide === 'true',
        panel: grid?.dataset.panel ?? null,
        collectionVisible: Boolean(collection?.getClientRects().length),
        detailVisible: Boolean(detail?.getClientRects().length),
        previewVisible: Boolean(preview?.getClientRects().length),
        selected: selected?.getAttribute('aria-selected') === 'true',
        activeTeam: [...document.querySelectorAll('nav[aria-label="Vistas"] button')]
          .some(button => button.textContent.trim() === 'Equipe'
            && button.getAttribute('aria-current') === 'page'),
      };
    })()`,
    );
    check(
      geometry.viewportWidth === expectedWidth &&
        geometry.documentWidth <= geometry.clientWidth &&
        geometry.bodyWidth <= geometry.viewportWidth &&
        geometry.wide === expectedWide &&
        geometry.collectionVisible === expectedWide &&
        geometry.detailVisible &&
        geometry.previewVisible &&
        geometry.selected &&
        geometry.activeTeam &&
        (expectedWide || geometry.panel === 'detail'),
      `A ficha da equipe excedeu o viewport ou perdeu a troca planejada em ${layout.label}.`,
    );
    await capture(window, layout.screenshot, '[data-testid="individual-details"]');

    if (!expectedWide) {
      await clickButton(contents, 'Voltar à equipe');
      await waitFor(
        contents,
        `(() => {
        const grid = document.querySelector('[data-wide]');
        const collection = document.querySelector('[data-testid="collection"]');
        const detail = document.querySelector('[data-testid="individual-details"]');
        return grid?.dataset.panel === 'collection'
          && Boolean(collection?.getClientRects().length)
          && (!detail || detail.getClientRects().length === 0);
      })()`,
        `coleção compacta ${layout.label}`,
      );
      const collectionGeometry = await evaluate(
        contents,
        `(() => ({
        clientWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        panel: document.querySelector('[data-wide]')?.dataset.panel ?? null,
        collectionVisible: Boolean(document.querySelector('[data-testid="collection"]')?.getClientRects().length),
        detailVisible: Boolean(document.querySelector('[data-testid="individual-details"]')?.getClientRects().length),
      }))()`,
      );
      check(
        collectionGeometry.panel === 'collection' &&
          collectionGeometry.collectionVisible &&
          !collectionGeometry.detailVisible &&
          collectionGeometry.documentWidth <= collectionGeometry.clientWidth &&
          collectionGeometry.bodyWidth <= expectedWidth,
        `A coleção compacta excedeu o viewport em ${layout.label}.`,
      );
      await capture(window, layout.collectionScreenshot, '[data-testid="collection"] h2');
      await selectIndividual(contents, damageIndividual.uuid);
      await clickTab(contents, 'Golpes');
      await waitFor(
        contents,
        'Boolean(document.querySelector(\'[aria-label="Prévia da troca planejada"]\'))',
        `retorno à ficha compacta ${layout.label}`,
      );
    }
    console.log(`PASS equipe ${layout.label}: ficha e estado ${expectedWide ? 'amplo' : 'compacto'} sem overflow`);
  }
}

function safeErrorText(error) {
  return String(error?.message || 'falha inesperada')
    .replace(/[A-Z]:\\[^\s)]+/gi, '[caminho local]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, '[uuid sintético]')
    .replace(/\b[0-9a-f]{64}\b/gi, '[hash sintético]');
}

async function exerciseErrorScreen(window) {
  const contents = window.webContents;
  const synthetic = 'Falha sintética em D:\\Dev\\segredo\\config.json do jogador 123e4567-e89b-12d3-a456-426614174000';
  await evaluate(contents, `window.dispatchEvent(new ErrorEvent('error', {error: new Error(${JSON.stringify(synthetic)})}))`);
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="app-error"]\'))', 'tela de erro diagnóstica');
  const shown = await evaluate(
    contents,
    `(() => ({
    role: document.querySelector('[data-testid="app-error"]')?.getAttribute('role'),
    report: document.querySelector('[data-testid="app-error"] textarea')?.value || '',
    appShellGone: !document.querySelector('nav[aria-label="Vistas"]'),
  }))()`,
  );
  check(
    shown.role === 'alert' && shown.appShellGone && shown.report.includes('Falha sintética'),
    'A tela de erro não substituiu a interface com o diagnóstico.',
  );
  check(!/segredo|Dev|123e4567/.test(shown.report), 'O diagnóstico exibido vazou caminho local ou UUID.');
  await waitFor(
    contents,
    "getComputedStyle(document.querySelector('[data-testid=\"app-error\"]')).opacity === '1'",
    'fim da animação da tela de erro',
  );
  await capture(window, screenshotPaths.errorScreen, '[data-testid="app-error"] h1');
  console.log('PASS tela de erro diagnóstica sanitizada e screenshot em diagnostics');
}

const SHELL_READY = 'Boolean(document.querySelector(\'nav[aria-label="Vistas"]\') && window.cobblemonCompanion?.readPlayerSnapshot)';

async function exerciseUnhandledRejection(window) {
  const contents = window.webContents;
  contents.reload();
  await waitFor(contents, SHELL_READY, 'TrainerApp após recarregar');
  await evaluate(contents, "setTimeout(() => Promise.reject(new Error('Rejeição sintética em D:\\\\Dev\\\\x')), 0)");
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="app-error"]\'))', 'tela de erro para rejeição não tratada');
  const report = await evaluate(contents, "document.querySelector('[data-testid=\"app-error\"] textarea')?.value || ''");
  check(report.includes('Rejeição sintética') && !/Dev/.test(report), 'A rejeição não tratada não gerou diagnóstico sanitizado.');
  console.log('PASS rejeição não tratada vira tela de erro sanitizada');
}

async function exerciseRendererCrash(window) {
  const contents = window.webContents;
  contents.reload();
  await waitFor(contents, SHELL_READY, 'TrainerApp antes da queda');
  const logPath = path.join(profileDirectory, 'diagnostics.log');
  contents.forcefullyCrashRenderer();
  const deadline = Date.now() + 5000;
  let logged = false;
  while (Date.now() < deadline && !logged) {
    logged = fs.existsSync(logPath) && /render-process-gone reason=(crashed|killed)/.test(fs.readFileSync(logPath, 'utf8'));
    if (!logged) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(logged, 'A queda do renderer não foi registrada em diagnostics.log.');
  contents.reload();
  await waitFor(contents, SHELL_READY, 'TrainerApp após a queda');
  console.log('PASS queda do renderer registrada em diagnostics.log');
}

async function exerciseDetailContainment(window, snapshot) {
  const contents = window.webContents;
  const member = snapshot.individuals.find((individual) => individual.location.container === 'party');
  check(member, 'A fixture não tem indivíduo na equipe para a contenção da ficha.');
  window.setContentSize(1186, 852);
  await waitFor(contents, 'window.innerWidth === 1186', 'viewport 1186×852 para contenção da ficha');
  await navigate(contents, 'Equipe');
  await selectIndividual(contents, member.uuid);
  await clickTab(contents, 'Golpes');
  const box = await evaluate(
    contents,
    `(() => {
    const aside = document.querySelector('[data-testid="individual-details"]');
    return {scroll: aside.scrollHeight, client: aside.clientHeight};
  })()`,
  );
  check(box.scroll <= box.client + 1, 'A ficha do indivíduo transbordou a própria borda.');
  window.setContentSize(1440, 1000);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport desktop');
  console.log('PASS ficha do indivíduo contém a lista de golpes em 1186×852');
}

async function exerciseShellScrollLock(window, snapshot) {
  const contents = window.webContents;
  const member = snapshot.individuals.find((individual) => individual.location.container === 'party');
  check(member, 'A fixture não tem indivíduo na equipe para o teste de rolagem da casca.');
  window.setContentSize(1568, 839);
  await waitFor(contents, 'window.innerWidth === 1568', 'viewport 1568×839 para a casca');
  await navigate(contents, 'Equipe');
  await selectIndividual(contents, member.uuid);
  await clickTab(contents, 'Golpes');
  const geometry = await evaluate(
    contents,
    `(() => ({
    doc: document.scrollingElement.scrollTop,
    main: document.querySelector('main').scrollTop,
    shellTop: document.querySelector('aside[aria-label="Navegação principal"]').getBoundingClientRect().top,
    collectionTop: document.querySelector('[data-testid="collection"]').getBoundingClientRect().top,
    mainTop: document.querySelector('main').getBoundingClientRect().top,
  }))()`,
  );
  check(
    geometry.doc === 0 && geometry.main === 0 && geometry.shellTop === 0 && geometry.collectionTop >= geometry.mainTop - 1,
    'A casca rolou e escondeu a coleção em 1568×839.',
  );
  window.setContentSize(1440, 1000);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport desktop');
  console.log('PASS casca fixa sem rolagem fantasma em 1568×839');
}

async function run() {
  const window = await waitForWindow();
  window.setSize(1440, 1300);
  const contents = window.webContents;
  contents.setBackgroundThrottling(false);
  window.show();
  window.focus();
  check(contents.getURL().startsWith('cobblemon://app/'), 'O harness não abriu o protocolo local seguro.');
  await waitFor(
    contents,
    'Boolean(document.querySelector(\'nav[aria-label="Vistas"]\') && window.cobblemonCompanion?.readPlayerSnapshot && window.cobblemonCompanion?.calculateRealDamage && window.cobblemonCompanion?.test)',
    'TrainerApp e ponte de teste local',
  );
  const snapshot = await evaluate(contents, 'window.cobblemonCompanion.readPlayerSnapshot()');
  check(
    snapshot.schemaVersion === 2 && snapshot.worldName === 'synthetic-trainer-ui',
    'A ponte retornou outro snapshot em vez da fixture sintética.',
  );
  await exerciseCollectionAndDamage(window, snapshot);
  await exerciseDetailContainment(window, snapshot);
  await exerciseShellScrollLock(window, snapshot);
  await exerciseDemo(contents);
  await exerciseRealDamage(contents);
  await exerciseRefreshInvalidation(window, snapshot);
  await exerciseResponsiveLayout(window, snapshot);
  await exerciseErrorScreen(window);
  await exerciseUnhandledRejection(window);
  await exerciseRendererCrash(window);
  console.log('PASS todos os fluxos determinísticos do TrainerApp');
}

async function finish(error) {
  if (finished) return;
  finished = true;
  if (error) {
    console.error(`FAIL harness determinístico do TrainerApp: ${safeErrorText(error)}`);
    process.exitCode = 1;
  }
  const window = BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed()) window.close();
  app.quit();
}

const watchdog = setTimeout(() => {
  void finish(new Error('Watchdog do harness determinístico excedido.'));
}, 60_000);
app
  .whenReady()
  .then(run)
  .then(
    () => finish(),
    (error) => finish(error),
  )
  .finally(() => clearTimeout(watchdog));
process.on('uncaughtException', (error) => {
  void finish(error);
});
process.on('unhandledRejection', (error) => {
  void finish(error);
});
