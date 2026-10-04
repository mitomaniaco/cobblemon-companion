import crypto from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {
  additionBattleKeys,
  battleDifferences,
  canonicalJson,
  compareShowdownEntries,
  compareWithCalc,
  deriveSpeciesCatalog,
  showdownEntryFingerprints,
  speciesFacts,
  speciesSlug,
  speciesStatus,
} from '../scripts/lib/compat-catalog.mjs';

const require = createRequire(import.meta.url);
const calc = require('@smogon/calc');
const catalog = require('../electron/lib/combat-compatibility.json');
const manifest = JSON.parse(fs.readFileSync(new URL('../data/compat/manifest.json', import.meta.url), 'utf8'));
const reviewed = JSON.parse(fs.readFileSync(new URL('../data/compat/reviewed-overrides.json', import.meta.url), 'utf8'));
const generation = calc.Generations.get(9);

function gardevoirJson(overrides = {}) {
  return {
    implemented: true,
    name: 'Gardevoir',
    primaryType: 'psychic',
    secondaryType: 'fairy',
    weight: 484,
    abilities: ['synchronize', 'trace', 'h:telepathy'],
    baseStats: {hp: 68, attack: 65, defence: 65, special_attack: 125, special_defence: 115, speed: 80},
    forms: [{name: 'Mega'}],
    ...overrides,
  };
}

describe('fatos da espécie', () => {
  it('converte tipos, atributos, peso e habilidades e ignora o prefixo de habilidade oculta e repetições', () => {
    const facts = speciesFacts(gardevoirJson({abilities: ['synchronize', 'synchronize', 'h:telepathy', 'h:synchronize']}));
    expect(facts).toEqual({
      name: 'Gardevoir',
      implemented: true,
      types: ['Psychic', 'Fairy'],
      baseStats: {hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80},
      weightHg: 484,
      abilities: ['synchronize', 'telepathy'],
      forms: 1,
    });
  });

  it('trata espécie sem o campo implemented como não implementada e tipo único como lista de um', () => {
    const facts = speciesFacts(gardevoirJson({implemented: undefined, secondaryType: undefined, forms: undefined}));
    expect(facts.implemented).toBe(false);
    expect(facts.types).toEqual(['Psychic']);
    expect(facts.forms).toBe(0);
  });

  it('usa o nome do arquivo, sem subpastas, como identificador', () => {
    expect(speciesSlug('data/cobblemon/species/generation3/gardevoir.json')).toBe('gardevoir');
  });
});

describe('comparação com o @smogon/calc', () => {
  const calcGardevoir = generation.species.get('gardevoir');

  it('aceita quando tipos, atributos e peso coincidem', () => {
    expect(compareWithCalc(speciesFacts(gardevoirJson()), calcGardevoir).matches).toBe(true);
  });

  it.each([
    ['tipo', {secondaryType: 'psychic'}],
    ['atributo', {baseStats: {hp: 68, attack: 65, defence: 65, special_attack: 126, special_defence: 115, speed: 80}}],
    ['peso', {weight: 500}],
    ['peso ausente', {weight: undefined}],
  ])('recusa quando %s diverge', (_label, overrides) => {
    expect(compareWithCalc(speciesFacts(gardevoirJson(overrides)), calcGardevoir).matches).toBe(false);
  });

  it('recusa espécie ausente no calc e espécie sem nome', () => {
    expect(compareWithCalc(speciesFacts(gardevoirJson()), undefined).matches).toBe(false);
    expect(compareWithCalc(speciesFacts(gardevoirJson({name: undefined})), calcGardevoir).matches).toBe(false);
  });

  it('exige o mesmo peso: 1 hectograma de diferença já recusa', () => {
    expect(compareWithCalc(speciesFacts(gardevoirJson({weight: 484})), calcGardevoir).matches).toBe(true);
    expect(compareWithCalc(speciesFacts(gardevoirJson({weight: 485})), calcGardevoir).matches).toBe(false);
    expect(compareWithCalc(speciesFacts(gardevoirJson({weight: 483})), calcGardevoir).matches).toBe(false);
  });
});

describe('regra do catálogo de espécies', () => {
  const supported = new Set(['cobblemon:synchronize', 'cobblemon:telepathy']);
  const entry = (overrides = {}) => ({
    facts: speciesFacts(gardevoirJson()),
    calcMatches: true,
    conflicts: [],
    ...overrides,
  });

  it('inclui a espécie e mantém só as habilidades compatíveis, na ordem original', () => {
    expect(speciesStatus(entry(), supported)).toEqual({
      status: 'included',
      abilities: ['cobblemon:synchronize', 'cobblemon:telepathy'],
    });
  });

  it('admite espécie com formas alternativas, porque só a forma normal é calculada', () => {
    expect(speciesStatus(entry({facts: speciesFacts(gardevoirJson({forms: [{}, {}, {}]}))}), supported).status).toBe('included');
  });

  it.each([
    ['not-implemented', {facts: speciesFacts(gardevoirJson({implemented: false}))}],
    ['calc-mismatch', {calcMatches: false}],
    ['pack-override', {conflicts: [{provider: 'outro.jar', kind: 'species-file', fields: ['baseStats']}]}],
    ['no-supported-ability', {facts: speciesFacts(gardevoirJson({abilities: ['trace']}))}],
  ])('exclui por %s', (reason, overrides) => {
    expect(speciesStatus(entry(overrides), supported)).toEqual({status: 'excluded', reason});
  });

  it('gera o mapa ordenado por ID usando o nome da espécie', () => {
    const species = {
      zubat: entry({facts: speciesFacts(gardevoirJson({name: 'Zubat'}))}),
      abra: entry({facts: speciesFacts(gardevoirJson({name: 'Abra'}))}),
      semhabilidade: entry({facts: speciesFacts(gardevoirJson({abilities: []}))}),
    };
    const derived = deriveSpeciesCatalog(species, supported);
    expect(Object.keys(derived)).toEqual(['cobblemon:abra', 'cobblemon:zubat']);
    expect(derived['cobblemon:abra'].name).toBe('Abra');
  });
});

describe('alterações de outros provedores', () => {
  it('lista só os campos de batalha que divergem do arquivo-base', () => {
    expect(battleDifferences(gardevoirJson(), gardevoirJson())).toEqual([]);
    expect(battleDifferences(gardevoirJson(), gardevoirJson({forms: [], baseScale: 2, drops: {}}))).toEqual([]);
    expect(battleDifferences(gardevoirJson(), gardevoirJson({weight: 1, abilities: ['trace']}))).toEqual(['weight', 'abilities']);
    expect(battleDifferences(gardevoirJson(), gardevoirJson({primaryType: 'fire'}))).toEqual(['types']);
  });

  it('acusa adição que tenta alterar dados de batalha e ignora as demais', () => {
    expect(additionBattleKeys({target: 'cobblemon:gardevoir', forms: [], drops: {}})).toEqual([]);
    expect(additionBattleKeys({target: 'cobblemon:gardevoir', baseStats: {}, abilities: []})).toEqual(['baseStats', 'abilities']);
  });
});

describe('impressão digital das regras do Showdown', () => {
  const source = (body) => `"use strict";\nvar Moves = {\n${body}\n};\nmodule.exports = { Moves };\n`;

  it('ignora espaços, quebras de linha CRLF, vírgulas finais, aspas e parênteses redundantes', () => {
    const compact = source(`  tackle: { basePower: 40, onHit(t) { return a && (b || c); }, name: "Tackle" }`);
    const reformatted = source(
      `  tackle: {\r\n    basePower: 40,\r\n    onHit(t) {\r\n      return (a && (b || c));\r\n    },\r\n    name: 'Tackle',\r\n  },`,
    );
    expect(showdownEntryFingerprints(reformatted, 'Moves').tackle).toBe(showdownEntryFingerprints(compact, 'Moves').tackle);
  });

  it('distingue mudança de lógica, de valor e de precedência', () => {
    const original = showdownEntryFingerprints(source(`  tackle: { basePower: 40, onHit() { return a && (b || c); } }`), 'Moves').tackle;
    for (const changed of [
      `  tackle: { basePower: 41, onHit() { return a && (b || c); } }`,
      `  tackle: { basePower: 40, onHit() { return (a && b) || c; } }`,
      `  tackle: { basePower: 40, onHit() { return a || (b || c); } }`,
      `  tackle: { basePower: 40, onHit() { return a && (b || c); }, accuracy: 100 }`,
    ]) {
      expect(showdownEntryFingerprints(source(changed), 'Moves').tackle).not.toBe(original);
    }
  });

  it('classifica ids em idênticos, diferentes e ausentes e normaliza a caixa da chave', () => {
    const base = showdownEntryFingerprints(
      source(`  Tackle: { basePower: 40 },\n  bite: { basePower: 60 },\n  ember: { basePower: 40 }`),
      'Moves',
    );
    const other = showdownEntryFingerprints(source(`  tackle: { basePower: 40 },\n  bite: { basePower: 61 }`), 'Moves');
    expect(compareShowdownEntries(base, other, ['tackle', 'bite', 'ember', 'zap'])).toEqual({
      identical: ['tackle'],
      different: ['bite'],
      missing: ['ember', 'zap'],
    });
  });

  it('falha quando o objeto principal não existe e nunca executa o código lido', () => {
    expect(() => showdownEntryFingerprints('var Other = {};', 'Moves')).toThrow(/Moves/);
    globalThis.__compatFingerprintExecuted = false;
    showdownEntryFingerprints(source('  danger: { onHit() {}, x: (globalThis.__compatFingerprintExecuted = true) }'), 'Moves');
    expect(globalThis.__compatFingerprintExecuted).toBe(false);
  });
});

describe('artefatos versionados do catálogo', () => {
  const supported = new Set(Object.keys(catalog.abilities).filter((key) => key.startsWith('cobblemon:')));

  it('o catálogo de espécies é exatamente o derivado do manifesto', () => {
    expect(catalog.species).toEqual(deriveSpeciesCatalog(manifest.species, supported));
  });

  it('a impressão digital dos registros de espécie é a do manifesto', () => {
    const digest = crypto.createHash('sha256').update(canonicalJson(manifest.species)).digest('hex');
    expect(catalog.ruleset.sourceSha256.speciesRecords).toBe(digest);
  });

  it('o resultado de coincidência com o calc registrado no manifesto é reproduzível com o calc fixado', () => {
    const stale = Object.entries(manifest.species)
      .filter(([, entry]) => {
        const calcSpecies = entry.facts.name ? generation.species.get(calc.toID(entry.facts.name)) : undefined;
        return compareWithCalc(entry.facts, calcSpecies).matches !== entry.calcMatches;
      })
      .map(([slug]) => slug);
    expect(stale).toEqual([]);
  });

  it('toda espécie do catálogo coincide com o calc e só oferece habilidades compatíveis da própria espécie', () => {
    for (const [id, entry] of Object.entries(catalog.species)) {
      const calcSpecies = generation.species.get(calc.toID(entry.name));
      expect(calcSpecies, id).toBeDefined();
      expect(entry.abilities.length, id).toBeGreaterThan(0);
      expect(
        entry.abilities.every((ability) => supported.has(ability)),
        id,
      ).toBe(true);
      const facts = manifest.species[id.replace('cobblemon:', '')].facts;
      expect(entry.abilities, id).toEqual(
        facts.abilities.map((ability) => `cobblemon:${ability}`).filter((ability) => supported.has(ability)),
      );
    }
  });

  it('nenhuma diferença do Showdown de outro provedor fica sem revisão registrada', () => {
    const unreviewed = [];
    for (const kind of ['moves', 'abilities']) {
      for (const provider of manifest.showdown[kind]) {
        for (const id of provider.different) {
          const decision = reviewed.overrides.find((item) => item.kind === kind && item.id === id && item.provider === provider.provider);
          if (!decision || !provider.reviewed.includes(id)) unreviewed.push(`${kind}:${id}`);
        }
      }
    }
    expect(unreviewed).toEqual([]);
  });

  it('Gardevoir continua oferecendo Synchronize e Telepathy, sem Trace', () => {
    expect(catalog.species['cobblemon:gardevoir']).toEqual({
      name: 'Gardevoir',
      abilities: ['cobblemon:synchronize', 'cobblemon:telepathy'],
    });
  });
});
