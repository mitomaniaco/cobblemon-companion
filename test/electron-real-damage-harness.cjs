'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {COMPATIBILITY, calculateRealDamage} = require('../electron/lib/real-damage.cjs');

const diagnosticsRoot = path.resolve(__dirname, '../.runtime/diagnostics');
fs.mkdirSync(diagnosticsRoot, {recursive: true});
const diagnostics = process.env.COMPANION_RUNTIME_PROFILE
  ? path.resolve(process.env.COMPANION_RUNTIME_PROFILE)
  : fs.mkdtempSync(path.join(diagnosticsRoot, 'real-damage-'));
fs.mkdirSync(diagnostics, {recursive: true});
app.setPath('userData', diagnostics);
app.setPath('sessionData', diagnostics);
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', path.join(diagnostics, 'electron.log'));
const screenshotPath = process.env.COMPANION_RUNTIME_SCREENSHOT
  ? path.resolve(process.env.COMPANION_RUNTIME_SCREENSHOT)
  : path.join(diagnostics, 'real-damage.png');

require('../electron/main.cjs');

const timeoutMs = 12_000;
let finished = false;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForWindow() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) return window;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('A janela Electron não carregou.');
}

async function waitFor(contents, expression, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await contents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Tempo esgotado: ${description}.`);
}

function makeRequest(snapshot, individual, candidateMoveId) {
  return {
    sources: snapshot.sources.map(source => ({kind: source.kind, sha256: source.sha256})),
    individualUuid: individual.uuid,
    candidateMoveId,
    target: {
      speciesId: 'cobblemon:abra',
      formId: 'normal',
      level: 50,
      nature: 'cobblemon:modest',
      ability: 'cobblemon:synchronize',
      ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
      evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
    },
    assumptions: {
      rulesetMatchesActiveWorld: true,
      actorBaselineConfirmed: true,
      actorFullHpConfirmed: true,
      targetBaselineConfirmed: true,
      fieldBaselineConfirmed: true,
    },
  };
}

function findRunnable(snapshot) {
  for (const individual of snapshot.individuals) {
    const species = COMPATIBILITY.species[individual.speciesId];
    const nature = individual.observed.nature;
    const abilityId = individual.observed.ability;
    if (!species || individual.formId !== 'normal' || individual.observed.heldItem !== null) continue;
    if (!nature || !COMPATIBILITY.natures[nature] || !abilityId || !COMPATIBILITY.abilities[abilityId]) continue;
    const canonicalAbility = abilityId.startsWith('cobblemon:') ? abilityId : `cobblemon:${abilityId}`;
    if (!species.abilities.includes(canonicalAbility)) continue;
    if (!individual.equippedMovesKnown || !individual.learnedMovesKnown || !individual.equippedMoves[0]) continue;
    if (!COMPATIBILITY.moves[individual.equippedMoves[0].id]) continue;
    for (const move of individual.learnedMoves) {
      if (individual.equippedMoves.some(equipped => equipped.id === move.id) || !COMPATIBILITY.moves[move.id]) continue;
      try {
        const result = calculateRealDamage(snapshot, makeRequest(snapshot, individual, move.id));
        return {individual, candidateMoveId: move.id, result};
      } catch { /* A stricter adapter condition excludes this candidate. */ }
    }
  }
  return null;
}

async function clickButtonByAccessibleName(contents, name, testId = null) {
  await contents.executeJavaScript(`(() => {
    const expected = ${JSON.stringify(name)};
    const expectedTestId = ${JSON.stringify(testId)};
    const matchesName = element => {
      const labelledBy = (element.getAttribute('aria-labelledby') || '')
        .split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent || '')
        .join(' ')
        .replace(/\\s+/g, ' ')
        .trim();
      const names = [
        element.getAttribute('aria-label'),
        labelledBy,
        element.innerText || element.textContent,
      ];
      return names.some(value => value?.replace(/\\s+/g, ' ').trim() === expected);
    };
    const buttons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(matchesName)
      .filter(element => expectedTestId === null || element.getAttribute('data-testid') === expectedTestId);
    if (buttons.length !== 1) throw new Error('Ação acessível não encontrada de forma única.');
    buttons[0].click();
  })()`);
}

async function chooseReactAriaOption(contents, label, optionName) {
  const listboxName = `${label} opções`;
  await contents.executeJavaScript(`(() => {
    const expected = ${JSON.stringify(label)};
    const triggers = [...document.querySelectorAll('.real-damage-planner button[aria-labelledby]')].filter(button =>
      (button.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .some(id => document.getElementById(id)?.textContent.trim() === expected));
    if (triggers.length !== 1) throw new Error('Campo acessível não encontrado de forma única.');
    triggers[0].click();
  })()`);
  await waitFor(contents, `(() => [...document.querySelectorAll('[role="listbox"]')].some(listbox =>
    listbox.getAttribute('aria-label') === ${JSON.stringify(listboxName)} && listbox.getClientRects().length > 0))()`,
  `opções de ${label}`);
  await contents.executeJavaScript(`(() => {
    const expectedListbox = ${JSON.stringify(listboxName)};
    const expectedOption = ${JSON.stringify(optionName)};
    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(element => element.getAttribute('aria-label') === expectedListbox);
    const options = [...(listbox?.querySelectorAll('[role="option"]') || [])].filter(option =>
      (option.getAttribute('aria-label') || option.innerText).replace(/\\s+/g, ' ').trim() === expectedOption);
    if (options.length !== 1) throw new Error('Opção acessível não encontrada de forma única.');
    options[0].click();
  })()`);
}

async function setLabeledNumber(contents, label, value, statGroup = null) {
  await contents.executeJavaScript(`(() => {
    const expectedLabel = ${JSON.stringify(label)};
    const expectedGroup = ${JSON.stringify(statGroup)};
    const scope = expectedGroup
      ? [...document.querySelectorAll('.real-stats-groups fieldset')]
        .find(fieldset => fieldset.querySelector('legend')?.textContent.trim().startsWith(expectedGroup))
      : document.querySelector('.real-target-fields');
    const labels = [...(scope?.querySelectorAll('label') || [])]
      .filter(element => element.textContent.trim() === expectedLabel);
    if (labels.length !== 1) throw new Error('Campo numérico acessível não encontrado de forma única.');
    const input = labels[0].control || document.getElementById(labels[0].htmlFor);
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') {
      throw new Error('Campo acessível não é numérico.');
    }
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
}

function displayMoveLabel(id) {
  return id.replace(/^[^:]+:/, '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

async function run() {
  const window = await waitForWindow();
  window.setSize(1280, 1700);
  const {webContents} = window;
  await waitFor(webContents,
    "Boolean(window.cobblemonCompanion?.readPlayerSnapshot && [...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Atualizar do save'))",
    'ponte e ação acessível de atualização');
  await clickButtonByAccessibleName(webContents, 'Atualizar do save', 'refresh-snapshot');
  await waitFor(webContents,
    "Boolean(document.querySelector('[data-testid=\"collection\"] h2'))",
    'snapshot carregado na interface');

  const snapshot = await webContents.executeJavaScript('(async () => await window.cobblemonCompanion.readPlayerSnapshot())()');
  const probe = findRunnable(snapshot);
  check(probe, 'O snapshot atual não tem um par compatível para o smoke real.');

  const collectionLabel = probe.individual.location.container === 'party' ? 'Equipe' : 'PC';
  await clickButtonByAccessibleName(webContents, collectionLabel);
  await waitFor(webContents,
    `document.querySelector('[data-testid="collection"] h2')?.textContent.trim() === ${JSON.stringify(collectionLabel)}`,
    'coleção do indivíduo capturado');
  const uuid = JSON.stringify(probe.individual.uuid);
  await waitFor(webContents,
    `Boolean([...document.querySelectorAll('[data-testid="collection"] [role="option"][data-individual-id]')].some(item => item.getAttribute('data-individual-id') === ${uuid}))`,
    'indivíduo capturado na coleção atual');
  await webContents.executeJavaScript(`(() => {
    const collection = document.querySelector('[data-testid="collection"]');
    const item = [...(collection?.querySelectorAll('[role="option"][data-individual-id]') || [])]
      .find(element => element.getAttribute('data-individual-id') === ${uuid});
    if (!item) throw new Error('Indivíduo capturado não está na coleção atual.');
    item.click();
  })()`);
  await waitFor(webContents,
    `Boolean(document.querySelector('[data-testid="individual-details"]') && [...document.querySelectorAll('[data-testid="collection"] [role="option"][data-individual-id]')].some(item => item.getAttribute('data-individual-id') === ${uuid} && item.getAttribute('aria-selected') === 'true'))`,
    'seleção do indivíduo capturado por UUID');

  await clickButtonByAccessibleName(webContents, 'Dano');
  await waitFor(webContents,
    "Boolean(document.querySelector('.real-damage-planner h3')?.textContent.trim() === 'Calcular dano com este indivíduo')",
    'planner do indivíduo selecionado');
  const initialGate = await webContents.executeJavaScript(`(() => {
    const form = document.querySelector('form.real-damage-form');
    const button = [...(form?.querySelectorAll('button, [role="button"]') || [])]
      .find(element => (element.innerText || element.textContent).trim() === 'Calcular rolls de dano');
    const assumptions = [...document.querySelectorAll('.real-confirmations input[type="checkbox"]')];
    return Boolean(button?.disabled && assumptions.length === 5
      && assumptions.every(input => !input.checked));
  })()`);
  check(initialGate, 'O perfil manual e as cinco confirmações precisam iniciar bloqueados, sem valores presumidos.');

  await chooseReactAriaOption(webContents, 'Golpe aprendido para comparar', displayMoveLabel(probe.candidateMoveId));
  const targetSpecies = COMPATIBILITY.species['cobblemon:abra'];
  const targetNature = COMPATIBILITY.natures['cobblemon:modest'];
  const targetAbility = COMPATIBILITY.abilities['cobblemon:synchronize'];
  check(targetSpecies && targetNature && targetAbility, 'O perfil de alvo do cenário de cálculo não está disponível.');
  await chooseReactAriaOption(webContents, 'Espécie', targetSpecies.name);
  await setLabeledNumber(webContents, 'Nível', '50');
  await chooseReactAriaOption(webContents, 'Natureza', targetNature);
  await chooseReactAriaOption(webContents, 'Habilidade', targetAbility);
  const statLabels = {hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque especial', spd: 'Defesa especial', spe: 'Velocidade'};
  for (const stat of Object.keys(statLabels)) {
    await setLabeledNumber(webContents, statLabels[stat], 31, 'IVs');
    await setLabeledNumber(webContents, statLabels[stat], 0, 'EVs');
  }
  const submitStillGated = await webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('form.real-damage-form button, form.real-damage-form [role="button"]')]
      .find(element => (element.innerText || element.textContent).trim() === 'Calcular rolls de dano');
    return button?.disabled === true;
  })()`);
  check(submitStillGated, 'O cálculo foi habilitado antes de confirmar as condições do cenário.');
  await webContents.executeJavaScript(`(() => {
    const assumptions = [...document.querySelectorAll('.real-confirmations input[type="checkbox"]')];
    if (assumptions.length !== 5 || assumptions.some(input => input.checked)) {
      throw new Error('As cinco confirmações acessíveis não estão no estado inicial esperado.');
    }
    assumptions.forEach(input => input.click());
  })()`);
  await waitFor(webContents, `(() => {
    const button = [...document.querySelectorAll('form.real-damage-form button, form.real-damage-form [role="button"]')]
      .find(element => (element.innerText || element.textContent).trim() === 'Calcular rolls de dano');
    const assumptions = [...document.querySelectorAll('.real-confirmations input[type="checkbox"]')];
    return button?.disabled === false && assumptions.length === 5
      && assumptions.every(input => input.checked);
  })()`, 'formulário completo com as cinco confirmações');
  await clickButtonByAccessibleName(webContents, 'Calcular rolls de dano');
  await waitFor(webContents, "document.querySelector('.real-damage-planner')?.getAttribute('aria-busy') === 'true' || Boolean(document.querySelector('.real-damage-result') || document.querySelector('.real-damage-error'))", 'o submit acionou o cálculo');
  await waitFor(webContents, "Boolean(document.querySelector('.real-damage-result') || document.querySelector('.real-damage-error'))", 'resposta do cálculo real');
  const calculationError = await webContents.executeJavaScript("document.querySelector('.real-damage-error')?.textContent || null");
  check(!calculationError, `O cálculo real foi bloqueado: ${calculationError || ''}`);

  await webContents.executeJavaScript("document.querySelector('.real-damage-trace').open = true");
  const rendered = await webContents.executeJavaScript(`(() => {
    const ranges = [...document.querySelectorAll('.real-damage-ranges strong')].map(node => node.textContent.trim());
    const labels = [...document.querySelectorAll('.real-damage-ranges > div > span')].map(node => node.textContent.trim());
    const trace = document.querySelector('.real-damage-trace');
    return {
      rangeCount: ranges.length,
      ranges,
      labels,
      ruleset: document.querySelector('.real-damage-trace')?.innerText.includes(${JSON.stringify(COMPATIBILITY.ruleset.id)}) || false,
      digest: /[a-f0-9]{64}/.test(trace?.innerText || ''),
      blockedCopy: document.querySelector('.real-damage-result')?.innerText.includes('não estima chance de acerto') || false,
    };
  })()`);
  const expected = [
    `${probe.result.current.min}–${probe.result.current.max} HP`,
    `${probe.result.candidate.min}–${probe.result.candidate.max} HP`,
  ];
  assert.deepEqual(rendered.ranges, expected);
  check(rendered.rangeCount === 2 && rendered.ruleset && rendered.digest && rendered.blockedCopy,
    'A UI não exibiu os dois ranges, a versão, o vínculo ou os limites do cálculo.');

  await webContents.executeJavaScript("document.querySelector('.real-damage-planner').scrollIntoView({block: 'start', behavior: 'instant'})");
  await webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const image = await window.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  check(image.getSize().width > 0 && image.getSize().height > 0, 'A captura da tela ficou vazia.');
  console.log(JSON.stringify({status: 'calculated', displayedRanges: rendered.rangeCount, ruleset: rendered.ruleset, digest: rendered.digest}));
}

async function finish(error) {
  if (finished) return;
  finished = true;
  if (error) {
    console.error('Harness de cálculo real falhou.');
    process.exitCode = 1;
  }
  app.quit();
}

const watchdog = setTimeout(() => { void finish(new Error('Harness de cálculo real excedeu 30 segundos.')); }, 30_000);
app.whenReady().then(run).then(() => finish(), error => finish(error)).finally(() => clearTimeout(watchdog));
process.on('uncaughtException', error => { void finish(error); });
process.on('unhandledRejection', error => { void finish(error); });
