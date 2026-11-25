'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Fonte sintética da demonstração: dados de produto em data/demo/, sem save, sem config e sem rede.
const DEMO_DIR = path.resolve(__dirname, '..', '..', 'data', 'demo');
const DEMO_SOURCE_SHA = {party: 'd'.repeat(64), pc: 'e'.repeat(64)};
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function readDemoJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DEMO_DIR, name), 'utf8'));
}

function known(value, sourceKind, nbtPath) {
  return {state: 'known', value, provenance: {sourceKind, nbtPath}};
}

function statFacts(values, sourceKind, label, stat) {
  return Object.fromEntries(STAT_KEYS.map((key, index) => [key, known(values[index], sourceKind, `${label}.${stat}.${key}`)]));
}

function expandIndividual(entry, sourceKind, label, location) {
  const ivs = statFacts(entry.ivs, sourceKind, label, 'IVs');
  const evs = statFacts(entry.evs, sourceKind, label, 'EVs');
  return {
    uuid: entry.uuid,
    speciesId: `cobblemon:${entry.species}`,
    formId: 'normal',
    level: entry.level,
    location,
    equippedMoves: entry.equipped.map((move) => ({id: `cobblemon:${move}`, pp: 20, ppUps: 0})),
    equippedMovesKnown: true,
    learnedMoves: entry.learned.map((move) => ({id: `cobblemon:${move}`, ppUps: 0})),
    learnedMovesKnown: true,
    observed: {
      nature: `cobblemon:${entry.nature}`,
      ability: `cobblemon:${entry.ability}`,
      heldItem: entry.item === null ? null : `cobblemon:${entry.item}`,
    },
    battleStats: {
      ivs,
      evs,
      hyperTrainedIvs: Object.fromEntries(STAT_KEYS.map((key) => [key, known(null, sourceKind, `${label}.HyperTrain.${key}`)])),
    },
  };
}

/** Snapshot de demonstração no contrato PlayerSnapshot (schema 2), lido só de data/demo/snapshot.json. */
function loadDemoSnapshot() {
  const data = readDemoJson('snapshot.json');
  const individuals = [
    ...data.party.map((entry, slot) => expandIndividual(entry, 'party', `Demonstração.party[${slot}]`, {container: 'party', slot})),
    ...data.pc.map((entry) =>
      expandIndividual(entry, 'pc', `Demonstração.pc[${entry.box}][${entry.slot}]`, {
        container: 'pc',
        box: entry.box,
        boxName: entry.boxName,
        slot: entry.slot,
      }),
    ),
  ];
  return {
    schemaVersion: 2,
    capturedAt: data.capturedAt,
    worldName: data.worldName,
    consistency: 'best-effort',
    demo: true,
    sources: [
      {kind: 'party', sha256: DEMO_SOURCE_SHA.party, modifiedAt: data.capturedAt},
      {kind: 'pc', sha256: DEMO_SOURCE_SHA.pc, modifiedAt: data.capturedAt},
    ],
    individuals,
  };
}

/** Progresso de demonstração (campanha radicalred até Terry), lido só de data/demo/progress.json. */
function loadDemoProgress() {
  return readDemoJson('progress.json');
}

module.exports = {loadDemoSnapshot, loadDemoProgress, DEMO_DIR};
