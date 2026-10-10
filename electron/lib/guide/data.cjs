'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '../../../data/guide');
const SPAWN_DIR = path.resolve(__dirname, '../../../data/spawns');
let cached = null;
let cachedSpawns = null;
let cachedAdvancements = null;

/** Dados versionados do guia (somente leitura). Carregados uma vez por processo; são arquivos grandes. */
function loadGuideData(directory = DATA_DIR) {
  if (directory === DATA_DIR && cached) return cached;
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
  const data = {
    trainers: read('trainers'),
    series: read('series'),
    campaign: read('campaign'),
    learnsets: read('learnsets'),
    evolutions: read('evolutions'),
  };
  if (directory === DATA_DIR) cached = data;
  return data;
}

/** Spawn pools, biomas resolvidos e regras de captura (somente leitura, carregados uma vez por processo). */
function loadSpawnData(directory = SPAWN_DIR) {
  if (directory === SPAWN_DIR && cachedSpawns) return cachedSpawns;
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
  const data = {pools: read('spawn-pools'), biomes: read('biomes'), rules: read('capture-rules')};
  if (directory === SPAWN_DIR) cachedSpawns = data;
  return data;
}

/** Conquistas de derrota de treinador do RCT: `{<ns>:trainers/<nome>: [ids de treinador]}` (somente leitura). */
function loadDefeatAdvancements(file = path.join(DATA_DIR, 'advancements.json')) {
  if (file === path.join(DATA_DIR, 'advancements.json') && cachedAdvancements) return cachedAdvancements;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file === path.join(DATA_DIR, 'advancements.json')) cachedAdvancements = data;
  return data;
}

module.exports = {loadGuideData, loadSpawnData, loadDefeatAdvancements};
