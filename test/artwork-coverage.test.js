import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {classifyForm, classifyShiny, classifySpecies} from '../scripts/report-artwork-coverage.mjs';

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

  it('shiny e formas: com arte, sem fonte e arquivo ausente', () => {
    const variants = {
      'cobblemon:abra': {dexNumber: 63, artworkPath: '/pokemon/63.png', shinyPath: '/pokemon/shiny/63.png', forms: {}},
      'cobblemon:meowth': {
        dexNumber: 52,
        artworkPath: '/pokemon/52.png',
        shinyPath: null,
        forms: {
          alolan: {pokemonId: 10107, artworkPath: '/pokemon/forms/10107.png', shinyPath: '/pokemon/forms/shiny/10107.png'},
          galarian: {pokemonId: 10161, artworkPath: '/pokemon/forms/10161.png', shinyPath: null},
        },
      },
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artwork-'));
    try {
      for (const dir of ['pokemon/shiny', 'pokemon/forms/shiny']) fs.mkdirSync(path.join(directory, dir), {recursive: true});
      for (const file of [
        'pokemon/63.png',
        'pokemon/52.png',
        'pokemon/shiny/63.png',
        'pokemon/forms/10107.png',
        'pokemon/forms/shiny/10107.png',
        'pokemon/forms/10161.png',
      ])
        fs.writeFileSync(path.join(directory, file), 'x');
      expect(classifyShiny('abra', sources, variants, directory)).toBeNull();
      expect(classifyShiny('meowth', sources, variants, directory)).toBe('shiny-sem-fonte');
      expect(classifyForm('meowth', ['alolan'], sources, variants, directory)).toBeNull();
      expect(classifyForm('meowth', ['alolan'], sources, variants, directory, true)).toBeNull();
      expect(classifyForm('meowth', ['galarian'], sources, variants, directory, true)).toBe('forma-shiny-sem-fonte');
      expect(classifyForm('meowth', ['sevii'], sources, variants, directory)).toBe('forma-sem-fonte');
      expect(classifyForm('meowth', ['alolan'], sources, null, directory)).toBe('sem-artefatos');
      fs.rmSync(path.join(directory, 'pokemon/forms/10107.png'));
      expect(classifyForm('meowth', ['alolan'], sources, variants, directory)).toBe('arquivo-ausente');
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
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
    expect(data.meowth.forms.some((form) => form.declared && form.aspects.includes('alolan'))).toBe(true);
    expect(Object.values(data).some((entry) => entry.forms.some((form) => !form.declared))).toBe(true);
  });
});
