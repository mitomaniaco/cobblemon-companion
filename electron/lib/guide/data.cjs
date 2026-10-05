'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '../../../data/guide');
let cached = null;

/** Dados versionados do guia (somente leitura). Carregados uma vez por processo; são arquivos grandes. */
function loadGuideData(directory = DATA_DIR) {
  if (directory === DATA_DIR && cached) return cached;
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
  const data = {trainers: read('trainers'), series: read('series'), learnsets: read('learnsets')};
  if (directory === DATA_DIR) cached = data;
  return data;
}

module.exports = {loadGuideData};
