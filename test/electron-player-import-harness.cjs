'use strict';

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {readPlayerSnapshotFromConfig} = require('../electron/player-import.cjs');
const COMPATIBILITY = require('../electron/lib/combat-compatibility.json');

if (process.env.COMPANION_REQUIRE_MEDIUM === '1') {
  try {
    const user = execFileSync('whoami.exe', {encoding: 'utf8', timeout: 5000, windowsHide: true}).trim();
    const groups = execFileSync('whoami.exe', ['/groups'], {encoding: 'utf8', timeout: 5000, windowsHide: true});
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

const diagnosticsRoot = path.resolve(__dirname, '../.runtime/diagnostics');
fs.mkdirSync(diagnosticsRoot, {recursive: true});
const diagnostics = process.env.COMPANION_RUNTIME_PROFILE
  ? path.resolve(process.env.COMPANION_RUNTIME_PROFILE)
  : fs.mkdtempSync(path.join(diagnosticsRoot, 'player-import-host-'));
fs.mkdirSync(diagnostics, {recursive: true});
app.setPath('userData', diagnostics);
app.setPath('sessionData', diagnostics);
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', path.join(diagnostics, 'electron.log'));
const screenshotPath = process.env.COMPANION_RUNTIME_SCREENSHOT
  ? path.resolve(process.env.COMPANION_RUNTIME_SCREENSHOT)
  : path.join(diagnostics, 'move-swap-preview.png');

require('../electron/main.cjs');

const deadlineMs = 10_000;
let finished = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HarnessAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HarnessAssertionError';
  }
}

function check(condition, message) {
  if (!condition) throw new HarnessAssertionError(message);
}

async function waitForWindow() {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) return window;
    await delay(25);
  }
  throw new Error('A janela não carregou antes do limite do harness.');
}

async function evaluate(contents, expression) {
  return contents.executeJavaScript(expression);
}

async function waitFor(contents, expression, description) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await evaluate(contents, expression)) return;
    await delay(25);
  }
  throw new HarnessAssertionError(`Tempo esgotado: ${description}.`);
}

async function waitForSelection(contents, uuid) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const selected = await evaluate(
      contents,
      `(() => {
      const matching = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
        .filter(item => item.dataset.individualId === ${JSON.stringify(uuid)});
      return matching.length === 1 && matching[0].getAttribute('aria-selected') === 'true';
    })()`,
    );
    if (selected) return;
    await delay(25);
  }
  throw new HarnessAssertionError('A seleção pelo UUID não atualizou o item ativo da coleção.');
}

function sameSources(left, right) {
  return JSON.stringify(left.sources) === JSON.stringify(right.sources) && left.worldName === right.worldName;
}

function sameBattleStatsByUuid(left, right) {
  if (left.individuals.length !== right.individuals.length) return false;
  const rightByUuid = new Map(right.individuals.map((individual) => [individual.uuid, individual]));
  return left.individuals.every((individual) => {
    const matching = rightByUuid.get(individual.uuid);
    return matching !== undefined && JSON.stringify(individual.battleStats) === JSON.stringify(matching.battleStats);
  });
}

function importedLabel(id) {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function moveLabel(id) {
  return COMPATIBILITY.moves[id]?.name ?? importedLabel(id);
}

function moveKey(id) {
  return id.trim().toLowerCase();
}

function eligibleCandidates(individual) {
  const equippedKeys = new Set(individual.equippedMoves.map((move) => moveKey(move.id)));
  const seen = new Set();
  return individual.learnedMoves.flatMap((move) => {
    const key = moveKey(move.id);
    if (!key || equippedKeys.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [move.id];
  });
}

function expectedPlannerState(individual) {
  if (!individual.equippedMovesKnown && !individual.learnedMovesKnown) {
    return 'Inconclusivo: os golpes equipados e os golpes aprendidos não foram capturados nesta leitura.';
  }
  if (!individual.equippedMovesKnown) {
    return 'Inconclusivo: a lista de golpes equipados não foi capturada nesta leitura.';
  }
  if (!individual.learnedMovesKnown) {
    return 'Inconclusivo: BenchedMoves não foi capturado; não é possível confirmar os candidatos disponíveis.';
  }
  if (individual.equippedMoves.length === 0) {
    return 'Sem opções: não há golpes equipados registrados para escolher um slot.';
  }
  return 'Sem opções: BenchedMoves está vazio ou contém apenas golpes já equipados.';
}

function inViewportExpression(selectors) {
  return `(() => {
    const visible = selector => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight
        && rect.left >= 0 && rect.right <= innerWidth && style.display !== 'none'
        && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    return ${JSON.stringify(selectors)}.every(visible);
  })()`;
}

async function capture(window, filePath, anchor, visibleSelectors) {
  const {webContents} = window;
  await evaluate(webContents, `document.querySelector(${JSON.stringify(anchor)}).scrollIntoView({block: 'center', behavior: 'instant'})`);
  const viewport = inViewportExpression(visibleSelectors);
  await waitFor(webContents, viewport, 'planejador e prévia renderizados dentro do viewport');
  check(await evaluate(webContents, viewport), 'O conteúdo da captura ficou fora do viewport.');
  await evaluate(webContents, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const image = await window.capturePage();
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, image.toPNG());
  check(image.getSize().width > 0 && image.getSize().height > 0, 'A captura da janela ficou vazia.');
  return image.getSize();
}

const accessibleNameExpression = `element => {
  const explicit = element.getAttribute('aria-label');
  if (explicit) return explicit.trim();
  const referenced = (element.getAttribute('aria-labelledby') || '')
    .split(/\\s+/)
    .map(id => document.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
    .trim();
  if (referenced) return referenced;
  return (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ');
}`;

async function clickAccessibleButton(contents, label) {
  const clicked = await evaluate(
    contents,
    `(() => {
    const accessibleName = ${accessibleNameExpression};
    const matches = [...document.querySelectorAll('button')]
      .filter(button => accessibleName(button) === ${JSON.stringify(label)});
    if (matches.length !== 1) return false;
    matches[0].click();
    return true;
  })()`,
  );
  check(clicked, 'Não foi possível acionar o botão pelo nome acessível esperado.');
}

async function navigateToRoute(contents, label) {
  const clicked = await evaluate(
    contents,
    `(() => {
    const accessibleName = ${accessibleNameExpression};
    const matches = [...document.querySelectorAll('nav button')]
      .filter(button => accessibleName(button) === ${JSON.stringify(label)});
    if (matches.length !== 1) return false;
    matches[0].click();
    return true;
  })()`,
  );
  check(clicked, 'A navegação não disponibilizou a rota esperada como botão acessível.');
  await waitFor(
    contents,
    `(() => {
    const accessibleName = ${accessibleNameExpression};
    return [...document.querySelectorAll('nav button[aria-current="page"]')]
      .some(button => accessibleName(button) === ${JSON.stringify(label)});
  })()`,
    'rota selecionada na navegação',
  );
}

async function activateTab(contents, label) {
  const clicked = await evaluate(
    contents,
    `(() => {
    const accessibleName = ${accessibleNameExpression};
    const details = document.querySelector('[data-testid="individual-details"]');
    const matches = [...(details?.querySelectorAll('[role="tab"]') || [])]
      .filter(tab => accessibleName(tab) === ${JSON.stringify(label)});
    if (matches.length !== 1) return false;
    matches[0].click();
    return true;
  })()`,
  );
  check(clicked, 'A seção do indivíduo não disponibilizou a aba acessível esperada.');
  await waitFor(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    const selected = details?.querySelector('[role="tab"][aria-selected="true"]');
    return selected?.textContent?.trim() === ${JSON.stringify(label)};
  })()`,
    'aba selecionada do indivíduo',
  );
}

async function readAccessibleSelectOptions(contents, label) {
  const opened = await evaluate(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    const planner = [...(details?.querySelectorAll('section') || [])]
      .find(section => section.querySelector('h4')?.textContent?.trim() === 'Preparar uma troca de golpe');
    const triggers = [...(planner?.querySelectorAll('button[aria-haspopup]') || [])]
      .filter(button => (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === ${JSON.stringify(label)}));
    if (triggers.length !== 1) return false;
    triggers[0].click();
    return true;
  })()`,
  );
  check(opened, 'O controle React Aria não foi encontrado pelo rótulo acessível.');
  const listboxName = `${label} opções`;
  await waitFor(
    contents,
    `Boolean([...document.querySelectorAll('[role="listbox"]')]
    .find(listbox => listbox.getAttribute('aria-label') === ${JSON.stringify(listboxName)}))`,
    'opções do controle React Aria',
  );
  return evaluate(
    contents,
    `(() => {
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(listboxName)});
    return [...(listbox?.querySelectorAll('[role="option"]') || [])]
      .map(option => (option.innerText || option.textContent || '').trim());
  })()`,
  );
}

async function selectAccessibleOption(contents, label, index, expectedOptions, failureMessage) {
  const options = await readAccessibleSelectOptions(contents, label);
  check(JSON.stringify(options) === JSON.stringify(expectedOptions), failureMessage);
  const selectedLabel = expectedOptions[index];
  check(selectedLabel !== undefined, 'O índice da opção React Aria não existe no snapshot.');
  const listboxName = `${label} opções`;
  const clicked = await evaluate(
    contents,
    `(() => {
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(listboxName)});
    const option = listbox?.querySelectorAll('[role="option"]')?.[${index}];
    if (!option) return false;
    option.click();
    return true;
  })()`,
  );
  check(clicked, 'A opção React Aria do snapshot não pôde ser selecionada.');
  await waitFor(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    const planner = [...(details?.querySelectorAll('section') || [])]
      .find(section => section.querySelector('h4')?.textContent?.trim() === 'Preparar uma troca de golpe');
    const trigger = [...(planner?.querySelectorAll('button[aria-haspopup]') || [])]
      .find(button => (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === ${JSON.stringify(label)}));
    return (trigger?.innerText || trigger?.textContent || '').trim().includes(${JSON.stringify(selectedLabel)});
  })()`,
    'valor selecionado no controle React Aria',
  );
}

async function readRenderedMoves(contents) {
  return evaluate(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    return [...(details?.querySelectorAll('section') || [])]
      .filter(section => ['Golpes equipados', 'Golpes aprendidos']
        .includes(section.querySelector('h3')?.textContent?.trim()))
      .map(section => ({
        title: section.querySelector('h3')?.textContent?.trim(),
        moves: [...section.querySelectorAll('ul > li > span:first-child')]
          .map(node => node.textContent.trim()),
        state: section.querySelector('[role="status"]')?.textContent?.trim() || null,
      }));
  })()`,
  );
}

function assertRenderedMoves(rendered, individual) {
  check(rendered.length === 2, 'A ficha não separou os dois grupos de golpes.');
  const expected = [
    {title: 'Golpes equipados', known: individual.equippedMovesKnown, moves: individual.equippedMoves},
    {title: 'Golpes aprendidos', known: individual.learnedMovesKnown, moves: individual.learnedMoves},
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const group = expected[index];
    check(rendered[index].title === group.title, 'Os grupos de golpes exibidos estão fora de ordem.');
    if (!group.known) {
      check(
        rendered[index].moves.length === 0 && rendered[index].state === 'Lista de golpes não capturada.',
        'O estado desconhecido dos golpes diverge do snapshot.',
      );
    } else if (group.moves.length === 0) {
      check(
        rendered[index].moves.length === 0 && rendered[index].state === 'Nenhum golpe registrado nesta captura.',
        'A ficha não distinguiu uma lista capturada vazia.',
      );
    } else {
      check(
        rendered[index].state === null &&
          JSON.stringify(rendered[index].moves) === JSON.stringify(group.moves.map((move) => moveLabel(move.id))),
        'Os golpes exibidos divergem dos dados do UUID selecionado.',
      );
    }
  }
}

async function readMovePreparation(contents) {
  return evaluate(
    contents,
    `(() => {
    const details = document.querySelector('[data-testid="individual-details"]');
    const planner = [...(details?.querySelectorAll('section') || [])]
      .find(section => section.querySelector('h4')?.textContent?.trim() === 'Preparar uma troca de golpe');
    if (!planner) return null;
    const triggerFor = label => [...planner.querySelectorAll('button[aria-haspopup]')]
      .find(button => (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === label)) || null;
    const preview = planner.querySelector('[aria-label="Prévia da troca planejada"]');
    const groups = [...(preview?.querySelectorAll(':scope > div') || [])];
    return {
      state: planner.querySelector('[role="status"]')?.textContent?.trim() || null,
      slot: triggerFor('Slot equipado para a prévia')?.textContent?.trim() || null,
      candidate: triggerFor('Golpe aprendido para a proposta')?.textContent?.trim() || null,
      preview: Boolean(preview),
      beforeLabel: groups[0]?.querySelector('span')?.textContent?.trim() || null,
      beforeMove: groups[0]?.querySelector('strong')?.textContent?.trim() || null,
      afterLabel: groups[1]?.querySelector('span')?.textContent?.trim() || null,
      afterMove: groups[1]?.querySelector('strong')?.textContent?.trim() || null,
    };
  })()`,
  );
}

async function readDemoState(contents) {
  return evaluate(
    contents,
    `(() => {
    const isVisible = node => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const heading = [...document.querySelectorAll('h2')]
      .find(node => node.textContent.trim() === 'Demonstração offline');
    const fixedFacts = document.querySelector('[aria-label="Dados fixos da demonstração"]');
    const section = heading?.closest('section');
    if (!section || !isVisible(heading) || !isVisible(fixedFacts)) return null;
    return {
      text: (section.innerText || '').trim(),
      fixedFacts: (fixedFacts.innerText || '').trim(),
    };
  })()`,
  );
}

async function selectIndividual(contents, uuid) {
  const itemState = await evaluate(
    contents,
    `(() => {
    const matches = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
      .filter(item => item.dataset.individualId === ${JSON.stringify(uuid)});
    if (matches.length !== 1) return {count: matches.length, visible: false};
    const item = matches[0];
    const rect = item.getBoundingClientRect();
    const style = getComputedStyle(item);
    return {
      count: 1,
      visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
    };
  })()`,
  );
  check(itemState.count === 1, 'O UUID capturado não identificou um único item na coleção atual.');
  if (!itemState.visible) {
    const currentRoute = await evaluate(
      contents,
      `(() => {
      const accessibleName = ${accessibleNameExpression};
      const active = document.querySelector('nav button[aria-current="page"]');
      return active ? accessibleName(active) : null;
    })()`,
    );
    check(currentRoute === 'Equipe' || currentRoute === 'PC', 'A seleção por UUID não estava em uma rota de coleção.');
    await clickAccessibleButton(contents, currentRoute === 'PC' ? 'Voltar ao PC' : 'Voltar à equipe');
    await waitFor(
      contents,
      `(() => {
      const item = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
        .find(node => node.dataset.individualId === ${JSON.stringify(uuid)});
      const rect = item?.getBoundingClientRect();
      return Boolean(item && rect.width > 0 && rect.height > 0);
    })()`,
      'coleção visível para selecionar pelo UUID',
    );
  }
  const clicked = await evaluate(
    contents,
    `(() => {
    const matches = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
      .filter(item => item.dataset.individualId === ${JSON.stringify(uuid)});
    if (matches.length !== 1) return false;
    matches[0].scrollIntoView({block: 'center', behavior: 'instant'});
    matches[0].click();
    return true;
  })()`,
  );
  check(clicked, 'O UUID capturado não identificou um único item selecionável na coleção atual.');
  await waitForSelection(contents, uuid);
  await waitFor(contents, 'Boolean(document.querySelector(\'[data-testid="individual-details"]\'))', 'ficha do UUID selecionado');
}

async function run() {
  check(!app.commandLine.hasSwitch('disable-gpu'), 'GPU desativada por argumento.');
  const window = await waitForWindow();
  const contents = window.webContents;
  await waitFor(
    contents,
    'Boolean(document.querySelector(\'[data-testid="refresh-snapshot"]\') && window.cobblemonCompanion?.readPlayerSnapshot)',
    'TrainerApp e bridge',
  );
  await waitFor(
    contents,
    `(() => {
    const accessibleName = ${accessibleNameExpression};
    return [...document.querySelectorAll('nav button[aria-current="page"]')]
      .some(button => accessibleName(button) === 'Equipe');
  })()`,
    'rota inicial Equipe',
  );
  check(
    await evaluate(
      contents,
      `(() => {
    const accessibleName = ${accessibleNameExpression};
    const labels = [...document.querySelectorAll('nav button')].map(accessibleName);
    return ['Equipe', 'PC', 'Dano', 'Demonstração', 'Ajuda e diagnóstico']
      .every(label => labels.includes(label));
  })()`,
    ),
    'A navegação não expôs as rotas acessíveis do TrainerApp.',
  );
  check(
    await evaluate(
      contents,
      `!document.querySelector('[data-testid="collection"]')
    && !document.querySelector('[data-testid="individual-details"]')
    && document.querySelector('main')?.innerText.includes('Nenhuma captura ainda')`,
    ),
    'A sessão não começou sem importação do save.',
  );
  console.log('PASS janela, bridge e estado inicial');

  await navigateToRoute(contents, 'Ajuda e diagnóstico');
  check(
    await evaluate(contents, 'Boolean(document.querySelector(\'[aria-labelledby="help-title"]\'))'),
    'A rota Ajuda e diagnóstico não foi renderizada.',
  );
  await clickAccessibleButton(contents, 'Abrir demonstração');
  await waitFor(
    contents,
    `(() => {
    const isVisible = node => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const heading = [...document.querySelectorAll('h2')]
      .find(node => node.textContent.trim() === 'Demonstração offline');
    return isVisible(heading)
      && isVisible(document.querySelector('[aria-label="Dados fixos da demonstração"]'));
  })()`,
    'rota de demonstração independente',
  );
  const demoBefore = await readDemoState(contents);
  check(
    demoBefore?.fixedFacts && /Pikachu → Floatzel/.test(demoBefore.text) && /não acompanha a seleção/i.test(demoBefore.text),
    'A demonstração fixa não estava disponível no estado inicial.',
  );
  await navigateToRoute(contents, 'Equipe');

  const expected = readPlayerSnapshotFromConfig();
  const initialRefresh = await evaluate(
    contents,
    `(() => {
    const button = document.querySelector('[data-testid="refresh-snapshot"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`,
  );
  check(initialRefresh, 'O botão acessível de atualização do save não estava disponível.');
  await waitFor(
    contents,
    'Boolean(document.querySelector(\'[data-testid="collection"]\') || document.querySelector(\'[role="alert"]\'))',
    'resultado da importação',
  );
  check(
    await evaluate(contents, 'Boolean(document.querySelector(\'[data-testid="collection"]\'))'),
    'A importação do save não disponibilizou a coleção.',
  );

  let bridgeSnapshot;
  try {
    bridgeSnapshot = await evaluate(contents, 'window.cobblemonCompanion.readPlayerSnapshot()');
  } catch (error) {
    if (/mudou durante a leitura|mudaram durante a leitura/i.test(error?.message ?? '')) {
      throw new HarnessAssertionError('As fontes party/PC mudaram durante a leitura pela bridge; estabilize e repita.');
    }
    throw error;
  }
  const current = readPlayerSnapshotFromConfig();
  check(sameSources(expected, current), 'As fontes party/PC mudaram entre leituras; repita após estabilizar os dados.');
  check(
    bridgeSnapshot.schemaVersion === 2 && current.schemaVersion === 2,
    'A bridge ou a leitura independente não retornou schemaVersion 2.',
  );
  check(
    sameSources(current, bridgeSnapshot),
    'As fontes party/PC mudaram entre a leitura pela bridge e a leitura independente; estabilize e repita.',
  );
  check(sameBattleStatsByUuid(current, bridgeSnapshot), 'Os battleStats da bridge divergiram da leitura independente por UUID.');

  const captured = bridgeSnapshot;
  const orderedUuids = (snapshot, container) =>
    snapshot.individuals
      .filter((individual) => individual.location.container === container)
      .sort((first, second) =>
        container === 'party'
          ? first.location.slot - second.location.slot
          : first.location.box - second.location.box || first.location.slot - second.location.slot,
      )
      .map((individual) => individual.uuid);
  const renderedUuids = () =>
    evaluate(
      contents,
      `([...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')])
    .map(item => item.dataset.individualId)`,
    );
  const partyUuids = orderedUuids(captured, 'party');
  const pcUuids = orderedUuids(captured, 'pc');
  await navigateToRoute(contents, 'Equipe');
  check(
    JSON.stringify(await renderedUuids()) === JSON.stringify(partyUuids),
    'A coleção Equipe não corresponde aos UUIDs individuais capturados.',
  );
  await navigateToRoute(contents, 'PC');
  check(
    JSON.stringify(await renderedUuids()) === JSON.stringify(pcUuids),
    'A coleção PC não corresponde aos UUIDs individuais capturados.',
  );
  const partyCount = partyUuids.length;
  const pcCount = pcUuids.length;
  console.log(`PASS importação DOM: equipe=${partyCount}, pc=${pcCount}, UUIDs conferidos sem imprimir identidades`);

  const withCandidates = (individual) =>
    individual.equippedMovesKnown &&
    individual.learnedMovesKnown &&
    individual.equippedMoves.length > 0 &&
    eligibleCandidates(individual).length > 0;
  const swapTarget =
    captured.individuals.find((item) => item.location.container === 'pc' && withCandidates(item)) ||
    captured.individuals.find(withCandidates);
  const target = swapTarget || captured.individuals.find((item) => item.location.container === 'pc') || captured.individuals[0];
  check(target, 'O snapshot não contém indivíduos para selecionar.');
  const routeFor = (individual) => (individual.location.container === 'pc' ? 'PC' : 'Equipe');
  await navigateToRoute(contents, routeFor(target));
  await selectIndividual(contents, target.uuid);
  const initialSelectedTab = await evaluate(
    contents,
    'document.querySelector(\'[data-testid="individual-details"] [role="tab"][aria-selected="true"]\')?.textContent?.trim() || null',
  );
  check(initialSelectedTab === 'Resumo', 'A ficha do UUID selecionado não abriu na aba de resumo.');
  await activateTab(contents, 'Golpes');
  assertRenderedMoves(await readRenderedMoves(contents), target);
  const initialPlanner = await readMovePreparation(contents);
  check(initialPlanner, 'A aba Golpes não renderizou Preparar uma troca de golpe.');

  async function buildPreview(individual) {
    const candidates = eligibleCandidates(individual);
    const equippedKeys = new Set(individual.equippedMoves.map((move) => moveKey(move.id)));
    check(
      candidates.length > 0 && candidates.every((id) => !equippedKeys.has(moveKey(id))),
      'O snapshot não contém candidatos distintos dos golpes equipados.',
    );
    const before = await readMovePreparation(contents);
    check(
      before && !before.preview && before.slot === 'Escolha um slot' && before.candidate === 'Escolha um golpe aprendido',
      'A prévia apareceu antes da seleção de slot e candidato.',
    );
    const slotOptions = individual.equippedMoves.map((move, index) => `Slot ${index + 1} · ${moveLabel(move.id)}`);
    const candidateOptions = candidates.map(moveLabel);
    await selectAccessibleOption(
      contents,
      'Slot equipado para a prévia',
      0,
      slotOptions,
      'As opções de slot React Aria não correspondem aos golpes do UUID selecionado.',
    );
    await selectAccessibleOption(
      contents,
      'Golpe aprendido para a proposta',
      0,
      candidateOptions,
      'As opções React Aria de candidato não correspondem ao BenchedMoves elegível deste UUID.',
    );
    await waitFor(
      contents,
      'Boolean(document.querySelector(\'[data-testid="individual-details"] [aria-label="Prévia da troca planejada"]\'))',
      'prévia antes/depois',
    );
    const preview = await readMovePreparation(contents);
    const candidateId = candidates[0];
    check(
      preview.beforeLabel === 'Antes · slot 1' &&
        preview.beforeMove === moveLabel(individual.equippedMoves[0].id) &&
        preview.afterLabel === 'Depois · proposta' &&
        preview.afterMove === moveLabel(candidateId) &&
        preview.slot === slotOptions[0] &&
        preview.candidate === candidateOptions[0],
      'A prévia não corresponde ao slot e candidato selecionados para o UUID.',
    );
    assertRenderedMoves(await readRenderedMoves(contents), individual);
  }

  let positiveSwapProven = false;
  if (swapTarget) {
    await buildPreview(swapTarget);
    const controlSelectors = await evaluate(
      contents,
      `(() => {
      const details = document.querySelector('[data-testid="individual-details"]');
      const planner = [...(details?.querySelectorAll('section') || [])]
        .find(section => section.querySelector('h4')?.textContent?.trim() === 'Preparar uma troca de golpe');
      const selectors = ['Slot equipado para a prévia', 'Golpe aprendido para a proposta'];
      const controls = [...(planner?.querySelectorAll('button[aria-haspopup]') || [])]
        .filter(button => (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
          .some(id => selectors.includes(document.getElementById(id)?.textContent.trim())));
      return controls.map(button => {
        const labelId = (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
          .find(id => selectors.includes(document.getElementById(id)?.textContent.trim()));
        return 'button[aria-labelledby~="' + labelId + '"]';
      });
    })()`,
    );
    check(controlSelectors.length === 2, 'A prévia não expôs os dois controles acessíveis do MovePreparation.');
    const size = await capture(window, screenshotPath, '[aria-label="Prévia da troca planejada"]', [
      ...controlSelectors,
      '[aria-label="Prévia da troca planejada"]',
    ]);
    check(size.width > 0 && size.height > 0, 'A captura da troca não contém dimensões válidas.');
    positiveSwapProven = true;
    console.log('PASS candidato do mesmo UUID, slot, preview antes/depois e golpes restantes');
    console.log('SCREENSHOT_READY move-swap-preview');
  } else {
    check(
      !initialPlanner.preview && initialPlanner.slot === null && initialPlanner.candidate === null,
      'A UI mostrou controles apesar de não existir cenário elegível no snapshot.',
    );
    check(initialPlanner.state === expectedPlannerState(target), 'A UI não distinguiu corretamente estado inconclusivo ou sem opções.');
    await capture(window, screenshotPath, '[data-testid="individual-details"] h4', ['[data-testid="individual-details"] h4']);
    console.log('NOT_PROVEN nenhum candidato elegível nesta captura; estado inconclusivo/sem opções conferido');
  }

  const overviewPath = path.join(diagnostics, 'player-import-overview.png');
  const detailsPath = path.join(diagnostics, 'player-import-details.png');
  await capture(window, overviewPath, '[data-testid="collection"] h2', ['[data-testid="collection"] h2']);
  await capture(window, detailsPath, '[data-testid="individual-details"] h2', ['[data-testid="individual-details"] h2']);

  const other =
    captured.individuals.find(
      (item) => item.uuid !== target.uuid && item.location.container !== target.location.container && withCandidates(item),
    ) ||
    captured.individuals.find((item) => item.uuid !== target.uuid && item.location.container !== target.location.container) ||
    captured.individuals.find((item) => item.uuid !== target.uuid && withCandidates(item)) ||
    captured.individuals.find((item) => item.uuid !== target.uuid);
  check(other, 'O snapshot não contém um segundo UUID para verificar o reset da seleção.');
  await navigateToRoute(contents, routeFor(other));
  await selectIndividual(contents, other.uuid);
  const resetTab = await evaluate(
    contents,
    'document.querySelector(\'[data-testid="individual-details"] [role="tab"][aria-selected="true"]\')?.textContent?.trim() || null',
  );
  check(resetTab === 'Resumo', 'A troca de UUID não redefiniu a aba da ficha.');
  await activateTab(contents, 'Golpes');
  assertRenderedMoves(await readRenderedMoves(contents), other);
  const reset = await readMovePreparation(contents);
  check(reset && !reset.preview, 'A prévia antiga sobreviveu à seleção de outro UUID.');
  if (withCandidates(other)) {
    check(
      reset.slot === 'Escolha um slot' && reset.candidate === 'Escolha um golpe aprendido',
      'Os controles React Aria não foram limpos ao trocar de UUID.',
    );
  } else {
    check(
      reset.slot === null && reset.candidate === null && reset.state === expectedPlannerState(other),
      'O estado do planejador do segundo UUID divergiu de seus dados.',
    );
  }
  await navigateToRoute(contents, 'Demonstração');
  const demoAfterSelection = await readDemoState(contents);
  check(JSON.stringify(demoAfterSelection) === JSON.stringify(demoBefore), 'A seleção de outro UUID alterou a demonstração offline.');
  console.log('PASS troca de UUID limpa a prévia e mantém a demonstração independente');

  await navigateToRoute(contents, routeFor(target));
  await selectIndividual(contents, target.uuid);
  await activateTab(contents, 'Golpes');
  assertRenderedMoves(await readRenderedMoves(contents), target);
  if (swapTarget) {
    await buildPreview(swapTarget);
    check((await readMovePreparation(contents))?.preview, 'Não foi possível restaurar a prévia antes do teste de invalidação do refresh.');
  }

  const loadingState = await evaluate(
    contents,
    `(() => new Promise((resolve, reject) => {
    const main = document.querySelector('main');
    if (!main) {
      reject(new Error('A área principal não foi encontrada.'));
      return;
    }
    const inspect = () => {
      const busy = [...main.querySelectorAll('[aria-busy="true"]')].length > 0;
      if (busy) {
        observer.disconnect();
        resolve({
          busy: true,
          snapshotGone: !document.querySelector('[data-testid="collection"]'),
          selectionGone: !document.querySelector('[data-testid="individual-details"]')
            && document.querySelectorAll('[data-individual-id]').length === 0,
          previewGone: !document.querySelector('[aria-label="Prévia da troca planejada"]'),
        });
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(main, {attributes: true, childList: true, subtree: true});
    const button = document.querySelector('[data-testid="refresh-snapshot"]');
    if (!button || button.disabled) {
      observer.disconnect();
      reject(new Error('O botão de refresh não estava disponível.'));
      return;
    }
    button.click();
    inspect();
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Refresh não publicou o estado de loading.'));
    }, ${deadlineMs});
  }))()`,
  );
  check(
    loadingState.busy && loadingState.snapshotGone && loadingState.selectionGone && loadingState.previewGone,
    'O refresh não removeu snapshot, seleção e prévia imediatamente.',
  );
  await waitFor(
    contents,
    'Boolean(document.querySelector(\'[data-testid="collection"]\') || document.querySelector(\'[role="alert"]\'))',
    'resultado do refresh',
  );
  const refreshResult = await evaluate(
    contents,
    `(() => ({
    loaded: Boolean(document.querySelector('[data-testid="collection"]')),
    preview: Boolean(document.querySelector('[aria-label="Prévia da troca planejada"]')),
  }))()`,
  );
  check(!refreshResult.preview, 'O refresh preservou uma prévia antiga.');
  let finalSource;
  try {
    finalSource = readPlayerSnapshotFromConfig();
  } catch {
    throw new HarnessAssertionError('Não foi possível confirmar fontes estáveis após o refresh; repita após estabilizar os dados.');
  }
  check(sameSources(expected, finalSource), 'As fontes party/PC mudaram entre leituras; repita após estabilizar os dados.');
  if (refreshResult.loaded) {
    let refreshedBridge;
    try {
      refreshedBridge = await evaluate(contents, 'window.cobblemonCompanion.readPlayerSnapshot()');
    } catch {
      throw new HarnessAssertionError('A bridge não retornou o snapshot após o refresh.');
    }
    check(
      sameSources(finalSource, refreshedBridge) && sameBattleStatsByUuid(finalSource, refreshedBridge),
      'O snapshot atualizado pela bridge divergiu das fontes estáveis.',
    );
    const refreshRoute = finalSource.individuals.some((item) => item.location.container === 'party') ? 'Equipe' : 'PC';
    await navigateToRoute(contents, refreshRoute);
    check(
      JSON.stringify(await renderedUuids()) === JSON.stringify(orderedUuids(finalSource, refreshRoute === 'Equipe' ? 'party' : 'pc')),
      'A coleção após refresh divergiu dos UUIDs das fontes estáveis.',
    );
    const refreshedSelection = finalSource.individuals
      .filter((item) => item.location.container === (refreshRoute === 'Equipe' ? 'party' : 'pc'))
      .sort((first, second) =>
        refreshRoute === 'Equipe'
          ? first.location.slot - second.location.slot
          : first.location.box - second.location.box || first.location.slot - second.location.slot,
      )[0];
    if (refreshedSelection) {
      const selectedUuid = await evaluate(
        contents,
        `(() => {
        const selected = [...document.querySelectorAll('[data-testid="collection"] [data-individual-id]')]
          .find(item => item.getAttribute('aria-selected') === 'true');
        return selected?.dataset.individualId || null;
      })()`,
      );
      check(selectedUuid === refreshedSelection.uuid, 'O refresh não selecionou o primeiro UUID estável da coleção.');
      await activateTab(contents, 'Golpes');
      assertRenderedMoves(await readRenderedMoves(contents), refreshedSelection);
      const emptyPlan = await readMovePreparation(contents);
      check(emptyPlan && !emptyPlan.preview, 'O refresh bem-sucedido preservou uma prévia antiga.');
      if (withCandidates(refreshedSelection)) {
        check(
          emptyPlan.slot === 'Escolha um slot' && emptyPlan.candidate === 'Escolha um golpe aprendido',
          'O refresh bem-sucedido preservou slot ou candidato antigos.',
        );
      } else {
        check(
          emptyPlan.slot === null && emptyPlan.candidate === null && emptyPlan.state === expectedPlannerState(refreshedSelection),
          'O plano após refresh divergiu do estado do UUID selecionado.',
        );
      }
    }
    console.log('PASS refresh carrega snapshot estável sem plano antigo');
  } else {
    const cleanError = await evaluate(
      contents,
      `Boolean(document.querySelector('[role="alert"]'))
      && !document.querySelector('[data-testid="collection"]')
      && !document.querySelector('[data-testid="individual-details"]')
      && !document.querySelector('[aria-label="Prévia da troca planejada"]')`,
    );
    check(cleanError, 'O erro do refresh deixou snapshot ou prévia antigos visíveis.');
    console.log('PASS erro de refresh remove snapshot e plano antigo');
  }
  await navigateToRoute(contents, 'Demonstração');
  check(JSON.stringify(await readDemoState(contents)) === JSON.stringify(demoBefore), 'O refresh alterou a demonstração offline.');
  if (!positiveSwapProven) process.exitCode = 2;
}

async function finish(error) {
  if (finished) return;
  finished = true;
  if (error) {
    const message = error instanceof HarnessAssertionError ? error.message : 'Falha inesperada durante o harness de importação.';
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  }
  const window = BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed()) window.close();
  app.quit();
}

const watchdog = setTimeout(() => {
  void finish(new HarnessAssertionError('Watchdog de 30 segundos excedido.'));
}, 30_000);
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
