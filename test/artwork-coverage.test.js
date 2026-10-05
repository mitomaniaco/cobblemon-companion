import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {classifyForm, classifySpecies} from '../scripts/report-artwork-coverage.mjs';

const sources = {
  mrmime: {nationalDex: 122, forms: []},
  abra: {nationalDex: 63, forms: []},
  meowth: {nationalDex: 52, forms: [{name: 'Alola', aspects: ['alolan']}]},
  ghost: {nationalDex: null, forms: []},
};

function withPublic(files, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artwork-'));
  try {
    fs.mkdirSync(path.join(directory, 'pokemon'));
    for (const file of files) fs.writeFileSync(path.join(directory, 'pokemon', file), 'x');
    return run(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

describe('classificação de cobertura de arte', () => {
  const manifest = {
    'cobblemon:abra': {dexNumber: 63, artworkPath: '/pokemon/63.png'},
    'cobblemon:mr-mime': {dexNumber: 122, artworkPath: '/pokemon/122.png'},
    'cobblemon:meowth': {dexNumber: 52, artworkPath: null},
  };

  it('liga o slug do Cobblemon ao identifier do PokéAPI pelo número da dex', () => {
    withPublic(['63.png', '122.png'], (directory) => {
      expect(classifySpecies('abra', sources, manifest, directory)).toBeNull();
      expect(classifySpecies('mrmime', sources, manifest, directory)).toBe('nome-divergente');
    });
  });

  it('distingue download omitido, arquivo ausente, espécie sem dex e manifesto ausente', () => {
    withPublic(['122.png'], (directory) => {
      expect(classifySpecies('meowth', sources, manifest, directory)).toBe('download-falhou');
      expect(classifySpecies('abra', sources, manifest, directory)).toBe('arquivo-ausente');
      expect(classifySpecies('ghost', sources, manifest, directory)).toBe('fora-da-dex-nacional');
      expect(classifySpecies('unknown', sources, manifest, directory)).toBe('fora-da-dex-nacional');
      expect(classifySpecies('abra', sources, null, directory)).toBe('sem-artefatos');
    });
  });

  it('forma declarada pela espécie difere de aspecto que não é forma', () => {
    expect(classifyForm('meowth', ['alolan'], sources)).toBe('forma-declarada');
    expect(classifyForm('meowth', ['f'], sources)).toBe('aspecto-sem-forma');
  });
});

describe('artwork-sources.json versionado', () => {
  const data = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/guide/artwork-sources.json'), 'utf8'));
  const manifestSlugs = Object.keys(
    JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/compat/manifest.json'), 'utf8')).species,
  );

  it('cobre as espécies do manifesto com dex nacional única de 1 a 1025', () => {
    expect(Object.keys(data).sort()).toEqual([...manifestSlugs].sort());
    const dexes = Object.values(data).map((entry) => entry.nationalDex);
    expect(new Set(dexes).size).toBe(dexes.length);
    for (const dex of dexes) expect(Number.isInteger(dex) && dex >= 1 && dex <= 1025).toBe(true);
  });

  it('slugs sem hífen do Cobblemon mantêm a dex certa (nome divergente do PokéAPI)', () => {
    expect(data.mrmime.nationalDex).toBe(122);
    expect(data.hooh.nationalDex).toBe(250);
    expect(data.tapukoko.nationalDex).toBe(785);
    expect(data.meowth.forms.some((form) => form.aspects.includes('alolan'))).toBe(true);
  });
});
