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
  guide1440: path.join(runDirectory, 'guide-1440.png'),
  guideCapExcluded: path.join(runDirectory, 'guide-cap-excluded.png'),
  guideCapIgnored: path.join(runDirectory, 'guide-cap-ignored.png'),
  guide1200: path.join(runDirectory, 'guide-1200.png'),
  guide800: path.join(runDirectory, 'guide-800.png'),
  battlePlan: path.join(runDirectory, 'battle-plan.png'),
  battlePlan1200: path.join(runDirectory, 'battle-plan-1200.png'),
  battlePlan800: path.join(runDirectory, 'battle-plan-800.png'),
  captures: path.join(runDirectory, 'captures.png'),
  training: path.join(runDirectory, 'training.png'),
  evolutions: path.join(runDirectory, 'evolutions.png'),
  evolutions1200: path.join(runDirectory, 'evolutions-1200.png'),
  evolutions800: path.join(runDirectory, 'evolutions-800.png'),
  captures1200: path.join(runDirectory, 'captures-1200.png'),
  captures800: path.join(runDirectory, 'captures-800.png'),
  damageCompact: path.join(runDirectory, 'damage-800.png'),
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
  const listboxVisible = `(() => [...document.querySelectorAll('[role="listbox"]')]
    .some(listbox => listbox.getAttribute('aria-label') === ${JSON.stringify(listboxName)}
      && listbox.getClientRects().length > 0))()`;
  let opened = false;
  // A abertura da lista depende de foco real na janela; tenta de novo em vez de depender de uma única corrida.
  for (let attempt = 0; attempt < 4 && !opened; attempt += 1) {
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
    contents.focus();
    await contents.insertText(optionText);
    try {
      await waitFor(contents, listboxVisible, `opções de ${labelText}`);
      opened = true;
    } catch {
      opened = false;
    }
  }
  check(opened, `As opções de ${labelText} não abriram depois de digitar.`);
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
  const point = await evaluate(
    contents,
    `(() => {
    const option = ${findOption};
    if (!option) throw new Error('A opção do seletor de golpes não foi encontrada.');
    option.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = option.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`,
  );
  contents.sendInputEvent({type: 'mouseMove', x: point.x, y: point.y});
  contents.sendInputEvent({type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1});
  contents.sendInputEvent({type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1});
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

async function detailArtworkState(contents) {
  return evaluate(
    contents,
    `(() => {
    const figure = document.querySelector('[data-testid="individual-details"] figure[data-artwork]');
    return {
      source: figure?.dataset.artwork || null,
      shiny: figure?.dataset.shiny || null,
      marked: [...(figure?.querySelectorAll('[role="img"]') || [])].map(node => node.getAttribute('aria-label')),
      caption: figure?.querySelector('figcaption')?.textContent.trim() || null,
    };
  })()`,
  );
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
  // Leitura inicial automática (#137): o snapshot aparece sem clicar em "Atualizar do save"; o convite nunca chega a ser necessário.
  await waitFor(
    contents,
    `(() => {
    const active = [...document.querySelectorAll('nav[aria-label="Vistas"] button')].find(button => button.getAttribute('aria-current') === 'page');
    return active?.textContent.trim() === 'Guia' && document.body.innerText.includes('Captura de') && !document.body.innerText.includes('Atualize do save para montar o time');
  })()`,
    'captura carregada sozinha ao abrir, sem clique',
  );
  check(
    await evaluate(contents, "document.querySelector('[data-testid=\"refresh-snapshot\"]')?.textContent.trim() === 'Atualizar do save'"),
    'Depois da leitura inicial o botão manual deve continuar disponível como releitura.',
  );
  await navigate(contents, 'Equipe');
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
  const alternateArtwork = await evaluate(
    contents,
    `(() => {
    const figure = document.querySelector('[data-testid="individual-details"] figure[data-artwork]');
    return {
      source: figure?.dataset.artwork || null,
      marked: Boolean(figure?.querySelector('[role="img"][aria-label="Sem arte da forma"]')),
      caption: figure?.querySelector('figcaption')?.textContent.trim() || null,
    };
  })()`,
  );
  check(
    alternateArtwork.source === 'base-form' && alternateArtwork.marked && alternateArtwork.caption === 'Sem arte da forma: forma normal',
    'A forma alternativa não mostrou a arte da forma normal marcada como tal.',
  );
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
  const missingShiny = await detailArtworkState(contents);
  check(
    emptyKnown.shiny === true && missingShiny.shiny === 'shiny-missing' && missingShiny.marked.includes('Sem arte shiny'),
    'Shiny sem arte shiny deve mostrar a arte normal marcada "Sem arte shiny" (nunca como se fosse a shiny).',
  );
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
  const shinyArt = await detailArtworkState(contents);
  check(
    damageIndividual.shiny === true &&
      shinyArt.shiny === 'shiny' &&
      shinyArt.marked.includes('Shiny') &&
      shinyArt.caption === 'Ilustração shiny',
    'Shiny com arte shiny deve mostrar a arte shiny com o selo e a legenda.',
  );
  await clickTab(contents, 'Atributos');
  const evView = await evaluate(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    const rows = [...(details?.querySelectorAll('tbody tr') || [])].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()));
    return {text: details?.innerText || '', ivs: rows.map(cells => cells[0]), evs: rows.map(cells => cells[2])};
  })()`,
  );
  check(
    evView.text.includes('EVs 510/510') && JSON.stringify(evView.evs) === JSON.stringify(['6', '0', '0', '252', '0', '252']),
    'Os EVs 252/252/6 do indivíduo sintético não aparecem no formato do jogo (por atributo e total 510).',
  );
  check(
    evView.ivs.every((value) => /^\d+$/.test(value) && Number(value) <= 31),
    'Os IVs não aparecem como números de 0 a 31.',
  );
  await clickTab(contents, 'Golpes');
  const plannerText = () =>
    evaluate(
      contents,
      `(() => [...document.querySelectorAll('[data-testid="individual-details"] section')]
      .find(section => section.querySelector('h4')?.textContent?.trim() === 'Planejar troca')?.innerText || '')()`,
    );
  check(
    (await plannerText()).includes('1. Clique no golpe equipado que sairia.'),
    'A troca não instruiu a escolher o golpe equipado primeiro.',
  );
  await pickOption(contents, 'Slot equipado para a prévia', 'Slot 1 · Tackle');
  check(
    (await plannerText()).includes('2. Agora clique no golpe aprendido que entraria no lugar de Tackle.'),
    'A troca não instruiu a escolher o golpe aprendido depois do slot.',
  );
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
  const itemCopy = await evaluate(
    contents,
    `(() => ({
    matchup: document.querySelector('.real-damage-planner')?.innerText || '',
    checklist: document.querySelector('.real-confirmations')?.innerText || '',
  }))()`,
  );
  check(
    itemCopy.matchup.includes('Item não registrado no save') && !itemCopy.matchup.includes('Item: nenhum'),
    'O planejador não disse que o item não está registrado no save (heldItem null).',
  );
  check(
    /nem item/.test(itemCopy.checklist) && /Confirme que ele não segura nenhum item/.test(itemCopy.checklist),
    'O checklist não exige confirmar a ausência de item quando heldItem é null.',
  );

  await chooseComboBox(contents, 'Espécie', 'Abra');
  const abraArtwork = await evaluate(
    contents,
    `(() => {
    const figure = [...document.querySelectorAll('.real-damage-planner figure[data-artwork]')].find(node => node.querySelector('[title="Abra"]'));
    return {
      source: figure?.dataset.artwork || null,
      label: figure?.querySelector('[role="img"]')?.getAttribute('aria-label') || null,
      name: figure?.querySelector('[title="Abra"]')?.innerText.trim() || null,
    };
  })()`,
  );
  check(
    abraArtwork.source === 'none' && abraArtwork.label === 'Imagem indisponível' && abraArtwork.name === 'Abra',
    'Espécie sem arte nenhuma deve mostrar o placeholder com o próprio nome.',
  );
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
  window.setContentSize(800, 1000);
  await waitFor(contents, 'window.innerWidth === 800', 'viewport compacto de 800px na rota Dano');
  const compact = await evaluate(
    contents,
    `(() => {
    const root = document.documentElement;
    const battle = document.querySelector('[aria-label="Painel de batalha"]');
    const inputs = document.querySelector('.real-damage-inputs');
    return {
      overflow: root.scrollWidth > root.clientWidth,
      battleFirst: Boolean(battle && inputs
        && battle.getBoundingClientRect().top < inputs.getBoundingClientRect().top),
    };
  })()`,
  );
  check(!compact.overflow, 'A rota Dano em 800px gerou rolagem horizontal.');
  check(compact.battleFirst, 'No layout compacto o painel de batalha deve vir antes das entradas.');
  await capture(window, screenshotPaths.damageCompact, '.real-damage-planner');
  console.log('PASS rota Dano em 800px: painel de batalha antes das entradas, sem overflow horizontal');
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
  // O snapshot simulado e a recarga anteriores invalidaram o plano de troca: monta a prévia de novo.
  await pickOption(contents, 'Slot equipado para a prévia', 'Slot 1 · Tackle');
  await pickOption(contents, 'Golpe aprendido para a proposta', 'Seed Bomb');
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

async function setViewport(window, width, height, description) {
  const contents = window.webContents;
  window.setContentSize(width, height);
  try {
    await waitFor(contents, `window.innerWidth === ${width}`, description);
  } catch (error) {
    const inner = await evaluate(contents, '({width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio})');
    const display = require('electron').screen.getDisplayMatching(window.getBounds());
    throw new Error(
      `${error.message} Observado: ${JSON.stringify({
        inner,
        contentSize: window.getContentSize(),
        bounds: window.getBounds(),
        maximized: window.isMaximized(),
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
      })}.`,
    );
  }
}

async function exerciseShellScrollLock(window, snapshot) {
  const contents = window.webContents;
  const member = snapshot.individuals.find((individual) => individual.location.container === 'party');
  check(member, 'A fixture não tem indivíduo na equipe para o teste de rolagem da casca.');
  await setViewport(window, 1568, 839, 'viewport 1568×839 para a casca');
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
  await setViewport(window, 1440, 1000, 'retorno ao viewport desktop');
  console.log('PASS casca fixa sem rolagem fantasma em 1568×839');
}

async function exerciseSnapshotChanged(contents) {
  const received = () =>
    evaluate(
      contents,
      `(async () => {
    const api = window.cobblemonCompanion;
    const seen = [];
    const unsubscribe = api.onSnapshotChanged((snapshot) => seen.push(snapshot.sources[0].sha256));
    const on = await api.test.simulateSnapshotChange();
    await api.setAutoRefresh(false);
    const off = await api.test.simulateSnapshotChange();
    await api.setAutoRefresh(true);
    unsubscribe();
    const afterUnsubscribe = await api.test.simulateSnapshotChange();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {seen, on, off, afterUnsubscribe};
  })()`,
    );
  const result = await received();
  check(
    result.on.sent === true && result.off.sent === false && result.afterUnsubscribe.sent === true,
    'O auto-refresh não ligou e desligou o aviso de mudança do save.',
  );
  check(
    result.seen.length === 1 && result.seen[0] === 'c'.repeat(64),
    'O renderer não recebeu exatamente um snapshot-changed enquanto inscrito e com auto-refresh ligado.',
  );
  console.log('PASS aviso snapshot-changed respeita inscrição e auto-refresh');
}
async function exerciseProgressChanged(contents) {
  const result = await evaluate(
    contents,
    `(async () => {
    const api = window.cobblemonCompanion;
    const progressEvents = [];
    const snapshotEvents = [];
    const offProgress = api.onProgressChanged((progress) => progressEvents.push(progress));
    const offSnapshot = api.onSnapshotChanged((snapshot) => snapshotEvents.push(snapshot));
    const on = await api.test.simulateProgressChange();
    await api.setAutoRefresh(false);
    const off = await api.test.simulateProgressChange();
    await api.setAutoRefresh(true);
    offProgress();
    offSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {progressEvents, snapshotEvents, on, off};
  })()`,
  );
  check(result.on.sent === true && result.off.sent === false, 'O aviso de progresso não respeitou o auto-refresh.');
  check(
    result.progressEvents.length === 1 &&
      result.progressEvents[0].defeated.includes('rctmod:leader_brock_019e') &&
      result.progressEvents[0].levelCap === 21 &&
      result.snapshotEvents.length === 0,
    'A mudança de progresso não foi notificada no canal separado do snapshot.',
  );
  console.log('PASS aviso progress-changed separado do snapshot');
}

async function exerciseGuideContract(contents) {
  const result = await evaluate(
    contents,
    `(async () => {
    const api = window.cobblemonCompanion;
    const snapshot = await api.readPlayerSnapshot();
    const trainers = await api.listGuideTrainers();
    const nextGoal = await api.guideNextGoal();
    const progress = await api.readGuideProgress();
    const sources = snapshot.sources.map(({kind, sha256}) => ({kind, sha256}));
    const guide = await api.buildGuide({sources, goal: {kind: 'trainer', trainerId: trainers[0].id}});
    // Rejeição intencional (loga no main): fontes que não correspondem ao snapshot atual devem ser recusadas.
    const capped = await api.buildGuide({sources, goal: {kind: 'trainer', trainerId: trainers[0].id}, levelCap: 1});
    const uncapped = await api.buildGuide({sources, goal: {kind: 'trainer', trainerId: trainers[0].id}, levelCap: null});
    const stale = await api.buildGuide({sources: [], goal: {kind: 'pve'}}).then(() => 'built', (error) => error.message);
    const member = guide.team[0];
    const battlePlan = await api.buildBattlePlan({sources, trainerId: trainers[0].id, team: [{uuid: member.uuid, moveIds: member.moves.map((move) => move.id), itemId: member.item.id}]});
    // Rejeição intencional (loga no main): pedido de plano com fontes e time vazios deve ser recusado.
    const stalePlan = await api.buildBattlePlan({sources: [], trainerId: trainers[0].id, team: []}).then(() => 'built', (error) => error.message);
    const evolution = await api.buildEvolutionPlan({sources, team: [{uuid: member.uuid, usefulMoveIds: member.moves.map((move) => move.id)}], levelCap: null});
    // Rejeição intencional (loga "request.team precisa ter de 1 a 6 membros" no main): pedido de evoluções inválido.
    const staleEvolution = await api.buildEvolutionPlan({sources: [], team: [], levelCap: null}).then(() => 'built', (error) => error.message);
    const capture = await api.buildCapturePlan({sources, goal: {kind: 'trainer', trainerId: trainers[0].id}, teamUuids: [member.uuid], gapOpponentIds: guide.opponents.map((opponent) => opponent.id), pikaStar: (await api.readGuideProgress()).pikaStar});
    const staleCapture = await api.buildCapturePlan({sources: [], goal: {kind: 'pve'}, teamUuids: [], gapOpponentIds: [], pikaStar: (await api.readGuideProgress()).pikaStar}).then(() => 'built', (error) => error.message);
    const invalidCapture = await api.buildCapturePlan({sources, goal: {kind: 'trainer', trainerId: trainers[0].id}, teamUuids: [member.uuid], gapOpponentIds: guide.opponents.map((opponent) => opponent.id), pikaStar: {...(await api.readGuideProgress()).pikaStar, kanto: 'unknown'}}).then(() => 'built', (error) => error.message);
    const training = await api.buildTrainingPlan({sources, team: [{uuid: member.uuid, usefulMoveIds: []}], levelCap: 21, capOrigin: 'informado'});
    const noCap = await api.buildTrainingPlan({sources, team: [{uuid: member.uuid, usefulMoveIds: []}], levelCap: null, capOrigin: 'desconhecida'});
    const staleTraining = await api.buildTrainingPlan({sources: [], team: [], levelCap: null, capOrigin: 'desconhecida'}).then(() => 'built', (error) => error.message);
    return {trainers, nextGoal, progress, guide, capped, uncapped, stale, battlePlan, stalePlan, evolution, staleEvolution, capture, staleCapture, invalidCapture, training, noCap, staleTraining};
  })()`,
  );
  check(
    result.trainers.length === 1 && result.trainers[0].format === 'singles',
    'A lista de treinadores sintética não tem 1 treinador singles.',
  );
  check(
    result.nextGoal.trainerId === result.trainers[0].id &&
      result.nextGoal.basis === 'progresso' &&
      result.nextGoal.stage?.variants.length === 1,
    'O próximo objetivo sintético não veio da campanha de progresso.',
  );
  check(
    result.progress.currentSeries === 'radicalred' &&
      result.progress.levelCap === 15 &&
      result.progress.pikaStar.kanto === false &&
      result.progress.pikaStar.paldea === false &&
      result.progress.victoryCounts !== null,
    'A bridge não expôs o progresso sintético com o level cap derivado.',
  );
  const card = result.guide.team[0];
  check(card && card.reason.length > 0 && card.item.status === 'obter', 'O guia sintético não trouxe um card com reason e item a obter.');
  check(
    result.guide.team.length <= 6 && result.guide.team.every((member) => member.moves.length <= 4),
    'O guia sintético passou de 6 membros ou 4 golpes.',
  );
  const plan = result.battlePlan;
  check(
    plan.status === 'plano' && plan.entries.length === 2 && plan.entries[0].responder && plan.entries[1].status === 'bloqueado',
    'O plano sintético não trouxe um confronto planejado e um bloqueado.',
  );
  check(
    plan.entries[0].heldItemAlternatives.length === 2 && plan.assumptions.length > 0,
    'O plano sintético perdeu as alternativas de item ou as hipóteses.',
  );
  const evolved = result.evolution.members;
  check(
    result.evolution.levelCap === null && evolved.some((member) => member.status === 'evolui' && member.options[0].withinCap === null),
    'O plano de evoluções sintético não deixou o alcance não verificado sem level cap.',
  );
  check(
    evolved.some((member) => member.status === 'bloqueado' && member.blockedReason),
    'O plano de evoluções sintético não bloqueou a forma regional com motivo.',
  );
  const gap = result.capture.gaps[0];
  check(
    gap && gap.owned.length > 0 && gap.candidates.length > 0,
    'O plano de capturas sintético não trouxe um indivíduo possuído e um candidato.',
  );
  const pikaRequirement = gap.candidates[0].requirements.find((requirement) => requirement.kind === 'pika-star');
  check(
    result.progress.pikaStar.paldea === false && pikaRequirement?.text.includes('paldea') && pikaRequirement.status === 'pendente',
    'O plano sintético não representou o Pika Star de Paldea conhecido como pendente.',
  );
  const trained = result.training.members[0];
  check(
    trained.levelCap === 21 && trained.targetLevel === trained.level,
    'O treino sintético não respeitou o cap conhecido quando o membro já estava acima dele.',
  );
  check(
    result.noCap.members[0].targetLevel === null && result.noCap.members[0].targetNote === 'cap não determinado',
    'O plano de treino sem cap calculou um nível-alvo.',
  );
  check(result.staleTraining !== 'built', 'O plano de treino aceitou um pedido inválido.');
  check(result.staleCapture !== 'built', 'O plano de capturas aceitou fontes que não correspondem ao snapshot atual.');
  check(result.invalidCapture.includes('request.pikaStar.kanto'), 'O IPC aceitou um valor Pika Star inválido.');
  check(result.staleEvolution !== 'built', 'O plano de evoluções aceitou um pedido inválido.');
  check(result.stalePlan !== 'built', 'O plano aceitou um pedido inválido.');
  check(
    result.capped.team.length === 0 && result.capped.excluded.some((entry) => entry.reason === 'acima do level cap (1)'),
    'Com o cap abaixo do nível do membro, ele precisa aparecer em excluídos (acima do level cap) e não no time.',
  );
  check(
    result.uncapped.assumptions.some((line) => line.includes('level cap não foi informado')),
    'Sem cap, o guia precisa avisar que o cap não foi considerado.',
  );
  check(result.stale !== 'built', 'O guia aceitou fontes que não correspondem ao snapshot atual.');
  console.log('PASS contrato do guia no modo sintético (treinadores, próximo objetivo, card e fontes)');
}

async function setLevelCapField(contents, value) {
  await evaluate(
    contents,
    `(() => {
    const label = [...document.querySelectorAll('label')].find(node => node.textContent.trim().startsWith('Level cap atual'));
    const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error('Campo do level cap não encontrado.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', {bubbles: true}));
  })()`,
  );
}

async function exerciseGuideWorkspace(window) {
  const contents = window.webContents;
  await navigate(contents, 'Guia');
  await waitFor(
    contents,
    `document.querySelector('[aria-label="Progresso do mundo"]')?.innerText.includes('Level cap padrão')`,
    'progresso do mundo no guia',
  );
  const progressText = await evaluate(contents, `document.querySelector('[aria-label="Progresso do mundo"]')?.innerText || ''`);
  check(
    progressText.includes('Level cap padrão') &&
      progressText.includes('Pika Star por região') &&
      progressText.includes('Kanto') &&
      progressText.includes('Não obtido'),
    'A tela Guia não mostrou o cap nem o estado Pika Star conhecido na leitura sintética.',
  );
  const defaultCap = await evaluate(
    contents,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(node => node.textContent.trim().startsWith('Level cap atual'));
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
      return {placeholder: input?.getAttribute('placeholder'), required: Boolean(input?.closest('[data-required="true"]'))};
    })()`,
  );
  check(defaultCap.placeholder === '21' && !defaultCap.required, 'O cap do progresso não foi aplicado como padrão editável.');
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 0 && document.querySelector('[aria-label="Excluídos pelo level cap"]')?.innerText.includes('acima do level cap (21)')`,
    'o cap padrão do progresso exclui o Gardevoir acima do limite',
  );
  await setLevelCapField(contents, 30);
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 1`,
    'time do guia montado com o override manual do cap',
  );
  const text = await evaluate(
    contents,
    "document.querySelector('[aria-labelledby]')?.closest('main')?.innerText || document.body.innerText",
  );
  for (const expected of [
    'Próxima etapa',
    'Próxima etapa de radicalred',
    'Gardevoir entra porque vence 1 de 2 adversários',
    'Choice Specs aumenta as vitórias de 1 para 2.',
    'obter',
    'Comparado à sua party',
    'Vale adquirir',
    'Moonblast',
  ]) {
    check(text.includes(expected), `A tela Guia não mostrou "${expected}".`);
  }
  check(
    progressText.includes('Próxima etapa') && progressText.includes('Atual:') && progressText.includes('Level cap da etapa: 15 → 21.'),
    'O painel de progresso não explicou a próxima etapa e a progressão de level cap da campanha.',
  );
  // Cap abaixo do nível do membro (Gardevoir Nv. 30): ele sai do time e aparece como excluído pelo level cap.
  await setLevelCapField(contents, 20);
  await waitFor(
    contents,
    `document.body.innerText.includes('Fora do time pelo level cap') && document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 0`,
    'time remontado sem o membro acima do level cap',
  );
  const capText = await evaluate(contents, `document.querySelector('section[aria-label="Excluídos pelo level cap"]')?.innerText || ''`);
  check(
    capText.includes('Gardevoir') && capText.includes('acima do level cap (20)'),
    'O membro acima do level cap não aparece em "Fora do time pelo level cap" com o motivo.',
  );
  await capture(window, screenshotPaths.guideCapExcluded, 'section[aria-label="Excluídos pelo level cap"]');
  const respectedWarning = await evaluate(contents, `document.querySelector('section[aria-label="Acima do level cap"]')?.innerText || ''`);
  check(
    respectedWarning.includes('impede a luta contra o treinador') && respectedWarning.includes('guarde no PC'),
    'Com o cap respeitado, o membro da party fora do time deve avisar que bloqueia a luta e precisa ir para o PC.',
  );
  // Toggle desligado: ninguém é excluído e o aviso pede baixar o nível ou guardar no PC.
  await evaluate(
    contents,
    `(() => {
    const toggle = [...document.querySelectorAll('input[role="switch"]')].find(node => node.closest('label')?.innerText.includes('Respeitar level cap'));
    if (!toggle) throw new Error('Toggle Respeitar level cap não encontrado.');
    toggle.click();
  })()`,
  );
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 1 && !document.body.innerText.includes('Fora do time pelo level cap')`,
    'time ideal sem exclusão com o toggle desligado',
  );
  const ignoredWarning = await evaluate(contents, `document.querySelector('section[aria-label="Acima do level cap"]')?.innerText || ''`);
  check(
    ignoredWarning.includes('Gardevoir') && ignoredWarning.includes('baixe o nível para 20'),
    'Com o toggle desligado, o membro acima do cap deve avisar para baixar o nível ou guardar no PC.',
  );
  await capture(window, screenshotPaths.guideCapIgnored, 'section[aria-label="Acima do level cap"]');
  await evaluate(
    contents,
    `[...document.querySelectorAll('input[role="switch"]')].find(node => node.closest('label')?.innerText.includes('Respeitar level cap'))?.click()`,
  );
  await waitFor(contents, `document.body.innerText.includes('Fora do time pelo level cap')`, 'toggle religado volta a excluir');
  await setLevelCapField(contents, '');
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 0 && document.body.innerText.includes('acima do level cap (21)')`,
    'limpar o cap manual restaura o cap padrão do progresso',
  );
  await evaluate(
    contents,
    `[...document.querySelectorAll('input[role="switch"]')].find(node => node.closest('label')?.innerText.includes('Respeitar level cap'))?.click()`,
  );
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 1`,
    'time mantido com cap do progresso e respeito desligado',
  );
  await capture(window, screenshotPaths.guide1440, '[aria-label="Time recomendado"]');
  const guideArtwork = await evaluate(
    contents,
    `[...document.querySelectorAll('ol[aria-label="Time recomendado"] figure[data-artwork]')].map(node => node.dataset.artwork)`,
  );
  check(
    guideArtwork.length > 0 && guideArtwork.every((source) => source !== 'none'),
    'Alguma espécie das fixtures do Guia apareceu sem imagem (ícone neutro).',
  );

  await clickButton(contents, 'Ver plano de batalha');
  await waitFor(
    contents,
    `Boolean(document.querySelector('ol[aria-label="Confronto por adversário"] > li'))`,
    'plano de batalha do motor sintético',
  );
  const planText = await evaluate(contents, `document.querySelector('[aria-label="Plano de batalha"]')?.innerText || ''`);
  for (const expected of ['Plano de batalha contra', 'Sugestão de lead', 'Riscos do treinador', 'Hipóteses', 'Limites']) {
    check(planText.includes(expected), `O plano de batalha não mostrou "${expected}".`);
  }
  check(!/vit[óo]ria garantida|vai vencer|voc[êe] vence|garant/i.test(planText), 'O plano de batalha contém texto que promete vitória.');
  await capture(window, screenshotPaths.battlePlan, '[aria-label="Plano de batalha"]');
  const entries = await evaluate(
    contents,
    `[...document.querySelectorAll('ol[aria-label="Confronto por adversário"] > li')].map(item => {
    const facts = Object.fromEntries([...item.querySelectorAll('dl > div')].map(row => [row.querySelector('dt').textContent.trim(), row.querySelector('dd').textContent.trim()]));
    return {status: item.dataset.status, blocked: item.textContent.includes('Confronto bloqueado'), facts};
  })`,
  );
  check(entries.length >= 1, 'O plano de batalha não listou adversários.');
  for (const entry of entries) {
    check(
      entry.blocked || (entry.facts.Respondedor?.includes(' com ') && entry.facts['Ordem de ação']),
      'Um adversário do plano não mostrou o respondedor com o golpe sugerido e a ordem de ação.',
    );
  }
  for (const layout of [
    {width: 1200, shot: 'battlePlan1200'},
    {width: 800, shot: 'battlePlan800'},
  ]) {
    window.setContentSize(layout.width, 1000);
    await waitFor(contents, `window.innerWidth === ${layout.width}`, `viewport do plano de batalha em ${layout.width}px`);
    const overflow = await evaluate(contents, '(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)()');
    check(!overflow, `O plano de batalha em ${layout.width}px gerou rolagem horizontal.`);
    await capture(window, screenshotPaths[layout.shot], '[aria-label="Plano de batalha"]');
  }
  window.setContentSize(1440, 1000);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport padrão após o plano de batalha');

  await clickButton(contents, 'Ver evoluções do time');
  await waitFor(contents, `Boolean(document.querySelector('ol[aria-label="Evoluções por membro"] > li'))`, 'evoluções do motor sintético');
  const evolutionText = await evaluate(
    contents,
    `([...document.querySelectorAll('h3')].find(node => node.textContent.trim() === 'Evoluções do time')?.closest('section')?.innerText) || ''`,
  );
  for (const expected of ['Evoluções do time', 'Level cap usado: 21.', 'não verificado', 'Hipóteses', 'Limites']) {
    check(evolutionText.includes(expected), `A seção de evoluções não mostrou "${expected}".`);
  }
  await capture(window, screenshotPaths.evolutions, 'ol[aria-label="Evoluções por membro"]');

  // Cap padrão do progresso: o plano usa o valor, sem confundi-lo com um cap digitado.
  const capBeforeTraining = await evaluate(
    contents,
    `(() => {
      const label = [...document.querySelectorAll('label')].find((node) => node.textContent.trim().startsWith('Level cap atual'));
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
      const respectLevelCap = [...document.querySelectorAll('input[role="switch"]')].find((node) =>
        node.closest('label')?.innerText.includes('Respeitar level cap'),
      );
      return {input: input?.value, placeholder: input?.getAttribute('placeholder'), respected: respectLevelCap?.checked};
    })()`,
  );
  check(
    capBeforeTraining.input === '' && capBeforeTraining.placeholder === '21' && capBeforeTraining.respected === false,
    'O campo manual ou o level cap padrão não estava no estado esperado para o treino.',
  );
  await clickButton(contents, 'Ver treino do time');
  await waitFor(contents, `document.body.innerText.includes('cap conhecido')`, 'treino usando o cap conhecido do progresso');
  const progressTraining = await evaluate(
    contents,
    `([...document.querySelectorAll('h3')].find(node => node.textContent.trim() === 'Treino até o level cap')?.closest('section')?.innerText) || ''`,
  );
  for (const expected of ['Gardevoir', 'cap conhecido', 'já no cap 21; não suba mais']) {
    check(progressTraining.includes(expected), `O treino não usou o cap padrão do progresso "${expected}".`);
  }

  await clickButton(contents, 'Ver capturas recomendadas');
  await waitFor(contents, `Boolean(document.querySelector('ol[aria-label="Lacunas do time"] > li'))`, 'capturas do motor sintético');
  const captureText = await evaluate(
    contents,
    `([...document.querySelectorAll('h3')].find(node => node.textContent.trim() === 'Capturas recomendadas')?.closest('section')?.innerText) || ''`,
  );
  for (const expected of [
    'Lacuna contra Floatzel',
    'Você já tem',
    'Blastoise',
    'Candidatos de captura',
    'Swampert',
    'River',
    'com chuva',
    'Nv. 25–30',
    'incomum',
    'Captura liberada',
    'pendente',
    'Hipóteses',
    'Limites',
  ]) {
    check(captureText.includes(expected), `A seção de capturas não mostrou "${expected}".`);
  }
  const pikaStatus = await evaluate(
    contents,
    `(() => {
      const requirements = [...document.querySelectorAll('ul[aria-label="Requisitos para capturar Swampert"] li')];
      const pika = requirements.find((item) => item.textContent.includes('advancement Pika Star de paldea'));
      return pika?.querySelector('[data-status]')?.textContent.trim() || null;
    })()`,
  );
  check(pikaStatus === 'pendente', 'A UI não mostrou o status Pika Star de Paldea devolvido pelo plano sintético.');
  check(
    captureText.indexOf('Você já tem') < captureText.indexOf('Candidatos de captura'),
    'O que o jogador já tem deve aparecer antes dos candidatos de captura.',
  );
  await capture(window, screenshotPaths.captures, 'ol[aria-label="Lacunas do time"]');
  for (const layout of [
    {width: 1200, evolutions: 'evolutions1200', captures: 'captures1200'},
    {width: 800, evolutions: 'evolutions800', captures: 'captures800'},
  ]) {
    window.setContentSize(layout.width, 1000);
    await waitFor(contents, `window.innerWidth === ${layout.width}`, `viewport de evoluções e capturas em ${layout.width}px`);
    const overflow = await evaluate(contents, '(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)()');
    check(!overflow, `Evoluções e capturas em ${layout.width}px geraram rolagem horizontal.`);
    await capture(window, screenshotPaths[layout.evolutions], 'ol[aria-label="Evoluções por membro"]');
    await capture(window, screenshotPaths[layout.captures], 'ol[aria-label="Lacunas do time"]');
  }
  window.setContentSize(1440, 1000);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport padrão após evoluções e capturas');
  // Informar o cap remonta o time de líder (cap 30 não exclui a Gardevoir Nv. 30); os planos derivados do time antigo são descartados.
  await setLevelCapField(contents, 30);
  // Confirme o resultado atualizado com o cap efetivo 30, não só o valor recém-digitado.
  await clickButton(contents, 'Exclusões, hipóteses e limites');
  await waitFor(
    contents,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(node => node.textContent.trim().startsWith('Level cap atual'));
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
      const team = document.querySelector('ol[aria-label="Time recomendado"]');
      const result = team?.closest('[data-stale]');
      const assumptions = document.querySelector('section[aria-label="Hipóteses"]');
      return input?.value === '30' &&
        team?.children.length === 1 &&
        result?.getAttribute('data-stale') !== 'true' &&
        !document.querySelector('[aria-label="Acima do level cap"]') &&
        assumptions &&
        !assumptions.innerText.includes('level cap não foi informado');
    })()`,
    'time do guia recalculado com o level cap efetivo 30',
  );
  await clickButton(contents, 'Ver evoluções do time');
  await waitFor(contents, `document.body.innerText.includes('Level cap usado: 30.')`, 'evoluções recalculadas com o level cap informado');

  // Treino com cap informado: recalcula só a seção de treino (os botões "Calcular de novo" das outras seções ficam intactos).
  await evaluate(
    contents,
    `(() => {
    const section = [...document.querySelectorAll('h3')].find(node => node.textContent.trim() === 'Treino até o level cap')?.closest('section');
    const button = [...(section?.querySelectorAll('button') || [])].find(node => node.textContent.trim() === 'Ver treino do time');
    if (!button) throw new Error('Botão do treino não encontrado.');
    button.click();
  })()`,
  );
  await waitFor(contents, `document.body.innerText.includes('cap conhecido')`, 'treino recalculado com o level cap manual');
  const informedTraining = await evaluate(
    contents,
    `([...document.querySelectorAll('h3')].find(node => node.textContent.trim() === 'Treino até o level cap')?.closest('section')?.innerText) || ''`,
  );
  for (const expected of [
    'Nv. 24 → 30 (cap 30)',
    'Psychic',
    'Moonblast',
    'útil para o objetivo',
    'Atacante especial',
    'Soma sugerida 510/510',
    'não há espécies para treinar EVs',
  ]) {
    check(informedTraining.includes(expected), `O treino com cap informado não mostrou "${expected}".`);
  }
  check(
    informedTraining.indexOf('Psychic') < informedTraining.indexOf('Moonblast') && !/nível-alvo não determinado/.test(informedTraining),
    'O treino com cap informado deve listar os golpes por nível e ter nível-alvo.',
  );
  await capture(window, screenshotPaths.training, 'ol[aria-label="Treino por membro"]');

  await clickButton(contents, 'Ver detalhes');
  await waitFor(contents, "document.body.innerText.includes('Ver cálculo')", 'detalhes do card do guia');
  await evaluate(
    contents,
    `(() => {
    const item = [...document.querySelectorAll('ul li')].find(node => node.textContent.includes('Confusion') && node.querySelector('button'));
    if (!item) throw new Error('Linha de cálculo do golpe não encontrada.');
    item.querySelector('button').click();
  })()`,
  );
  await waitFor(contents, "Boolean(document.querySelector('.real-damage-planner'))", 'Dano aberto pelo Ver cálculo do guia');
  check(
    await evaluate(
      contents,
      `(() => {
      const listbox = [...document.querySelectorAll('.real-damage-planner [role="listbox"]')]
        .find(item => item.getAttribute('aria-label') === '2. Golpe aprendido para comparar');
      return listbox?.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('aria-label') === 'Confusion';
    })()`,
    ),
    'Ver cálculo não pré-selecionou o golpe aprendido do guia no Dano.',
  );
  // Confusion está fora do subconjunto compatível do Dano; devolve um candidato calculável para os fluxos seguintes.
  await pickOption(contents, '2. Golpe aprendido para comparar', 'Seed Bomb');
  await clickButton(contents, 'Voltar ao guia');
  await waitFor(
    contents,
    `document.querySelectorAll('ol[aria-label="Time recomendado"] > li').length === 1`,
    'retorno ao guia sem perder o time',
  );

  for (const layout of [
    {width: 1200, shot: screenshotPaths.guide1200},
    {width: 800, shot: screenshotPaths.guide800},
  ]) {
    window.setContentSize(layout.width, 1000);
    await waitFor(contents, `window.innerWidth === ${layout.width}`, `viewport do guia em ${layout.width}px`);
    const overflow = await evaluate(contents, '(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)()');
    check(!overflow, `A tela Guia em ${layout.width}px gerou rolagem horizontal.`);
    await capture(window, layout.shot, '[aria-label="Time recomendado"]');
  }
  window.setContentSize(1440, 1000);
  await waitFor(contents, 'window.innerWidth === 1440', 'retorno ao viewport padrão após o guia');
  console.log('PASS tela Guia: objetivo sugerido, time com explicações, Ver cálculo no Dano e layouts 1200/800');
}

async function exerciseSaveAccountSelection(contents) {
  await evaluate(
    contents,
    `(() => {
      const button = document.querySelector('button[aria-label="Detalhes da captura"]');
      if (!button) throw new Error('O botão de detalhes da captura não foi encontrado.');
      button.click();
    })()`,
  );
  await waitFor(
    contents,
    `Boolean(document.querySelector('[role="dialog"] #save-accounts-title'))`,
    'lista de contas no diálogo de captura',
  );

  const initial = await evaluate(
    contents,
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const options = [...(dialog?.querySelectorAll('ul[aria-label="Contas de save disponíveis"] button') || [])];
      const text = dialog?.innerText || '';
      const unavailable = options.find(button => button.textContent.includes('Sem arquivo local de party/PC'));
      const selectable = options.filter(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
      return {
        duplicateWarning: text.includes('Há outra entrada com o mesmo nome'),
        newerWarning: text.includes('Há dados mais recentes de outra conta'),
        options: options.length,
        unavailableDisabled: unavailable?.disabled === true,
        selectableCount: selectable.length,
      };
    })()`,
  );
  check(initial.duplicateWarning, 'A conta duplicada com o mesmo nome não foi avisada.');
  check(initial.newerWarning, 'A conta alternativa com party mais recente não foi avisada.');
  check(initial.options === 3 && initial.unavailableDisabled, 'A entrada sem arquivos locais deveria aparecer desabilitada.');
  check(initial.selectableCount === 1, 'Deveria existir exatamente uma conta alternativa selecionável.');

  await evaluate(contents, `window.cobblemonCompanion.test.setAccountBehavior({selectionDelayMs: 300, failSelection: true})`);
  await evaluate(
    contents,
    `(() => {
      const options = [...document.querySelectorAll('ul[aria-label="Contas de save disponíveis"] button')];
      const alternative = options.find(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
      if (!alternative) throw new Error('A conta alternativa selecionável não foi encontrada.');
      alternative.click();
    })()`,
  );
  await delay(100);
  check(
    await evaluate(
      contents,
      `([...document.querySelectorAll('header [role="status"]')].some(node => node.textContent.includes('Salvando a seleção da conta…')))`,
    ),
    'O progresso da seleção não foi anunciado fora do diálogo.',
  );
  await delay(350);
  const selectionFeedback = await evaluate(contents, `document.body.innerText`);
  check(
    selectionFeedback.includes('Não foi possível selecionar essa conta') ||
      selectionFeedback.includes('Não foi possível selecionar a conta'),
    `A falha de seleção não ficou acessível: ${selectionFeedback}`,
  );
  check(
    await evaluate(contents, `!document.querySelector('header [role="status"]')?.textContent.includes('Salvando a seleção da conta…')`),
    'O estado de progresso persistiu após o erro de seleção.',
  );
  check(
    await evaluate(
      contents,
      `(() => {
        const selected = document.querySelector('[aria-label="Conta selecionada"]');
        const expected = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'})
          .format(Date.parse('2001-01-01T10:00:00.000Z'));
        return selected?.textContent.includes(expected) === true;
      })()`,
    ),
    'A conta inicial não foi mantida após a falha de persistência.',
  );

  await evaluate(
    contents,
    `window.cobblemonCompanion.test.setAccountBehavior({selectionDelayMs: 0, failSelection: false, failNextList: true})`,
  );
  await evaluate(
    contents,
    `(() => {
      const options = [...document.querySelectorAll('ul[aria-label="Contas de save disponíveis"] button')];
      const alternative = options.find(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
      if (!alternative) throw new Error('A conta alternativa não estava disponível para a falha de reload.');
      alternative.click();
    })()`,
  );
  await waitFor(
    contents,
    `Boolean([...document.querySelectorAll('header [role="alert"]')].some(node => node.textContent.includes('horários desconhecidos')))`,
    'erro de reload e timestamps desconhecidos anunciados fora do diálogo',
  );
  check(
    await evaluate(contents, `!document.querySelector('[aria-label="Conta selecionada"]')`),
    'A UI apresentou metadados antigos como atuais após falha ao atualizar a lista.',
  );

  await evaluate(
    contents,
    `(() => {
    if (!document.querySelector('[role="dialog"]')) document.querySelector('button[aria-label="Detalhes da captura"]').click();
    })()`,
  );
  await clickButton(contents, 'Atualizar lista de contas');
  await waitFor(
    contents,
    `Boolean(document.querySelector('[aria-label="Conta selecionada"]'))`,
    'metadados disponibilizados após uma listagem bem-sucedida',
  );
  check(
    await evaluate(
      contents,
      `(() => {
        const selected = document.querySelector('[aria-label="Conta selecionada"]');
        const expected = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'})
          .format(Date.parse('2003-01-01T10:00:00.000Z'));
        return selected?.textContent.includes(expected) === true;
      })()`,
    ),
    'A UI não exibiu metadados atuais após o reload.',
  );
  await evaluate(
    contents,
    `(() => {
      const options = [...document.querySelectorAll('ul[aria-label="Contas de save disponíveis"] button')];
      const previousAccount = options.find(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
      if (!previousAccount) throw new Error('A conta anterior não estava disponível para seleção após reload.');
      previousAccount.click();
    })()`,
  );
  await waitFor(contents, `!document.querySelector('[role="dialog"]')`, 'fechamento após seleção concluída');
  await waitFor(
    contents,
    `(() => {
      const selected = document.querySelector('[aria-label="Conta selecionada"]');
      const expected = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'})
        .format(Date.parse('2001-01-01T10:00:00.000Z'));
      return selected?.textContent.includes(expected) === true;
    })()`,
    'atualização do resumo após seleção concluída',
  );
  const successfulSelection = await evaluate(contents, 'window.cobblemonCompanion.listSaveAccounts()');
  const selectedAfterSuccess = successfulSelection.accounts.find((account) => account.isSelected);
  check(selectedAfterSuccess?.partyLastWriteAt === '2001-01-01T10:00:00.000Z', 'A seleção concluída não atualizou a conta configurada.');
  console.log('PASS seleção de conta: fluxo IPC, erros de seleção/reload, metadados desconhecidos e recuperação');
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
    `Boolean(document.querySelector('nav[aria-label="Vistas"]') && window.cobblemonCompanion?.readPlayerSnapshot && window.cobblemonCompanion?.calculateRealDamage && window.cobblemonCompanion?.test)`,
    'TrainerApp e ponte de teste local',
  );
  const snapshot = await evaluate(contents, 'window.cobblemonCompanion.readPlayerSnapshot()');
  check(
    snapshot.schemaVersion === 2 && snapshot.worldName === 'synthetic-trainer-ui',
    'A ponte retornou outro snapshot em vez da fixture sintética.',
  );
  await exerciseSaveAccountSelection(contents);
  await exerciseCollectionAndDamage(window, snapshot);
  await exerciseDetailContainment(window, snapshot);
  await exerciseSnapshotChanged(contents);
  await exerciseProgressChanged(contents);
  // O app também assina o aviso: o snapshot simulado (hash 'c…') passou a ser o da sessão. Volta à captura da fixture.
  await clickButton(contents, 'Atualizar do save');
  await delay(150);
  await waitFor(
    contents,
    "document.querySelector('[data-testid=\"refresh-snapshot\"]')?.textContent.trim() === 'Atualizar do save'",
    'recarga da fixture depois do snapshot simulado',
  );
  await exerciseGuideContract(contents);
  await exerciseGuideWorkspace(window);
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
