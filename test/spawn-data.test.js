import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  applyPresets,
  dexRegions,
  mergeTagFiles,
  parseCatchRules,
  parseLevel,
  parseModIds,
  parseSpawnRemovals,
  resolveTag,
} from '../scripts/lib/spawn-data.mjs';

const read = (name) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/spawns', name), 'utf8'));

describe('regras puras de spawn', () => {
  it('lê apenas o modId de [[mods]], não o de dependências', () => {
    const toml = '[[mods]]\nmodId="alpha"\n[[dependencies.alpha]]\nmodId="neoforge"\n[[mods]]\nmodId = "beta"\n';
    expect(parseModIds(toml)).toEqual(['alpha', 'beta']);
  });

  it('preset só preenche campos ausentes; o valor do spawn vence', () => {
    const merged = applyPresets(
      {presets: ['natural'], condition: {biomes: ['#a:x']}, anticondition: {structures: ['s']}},
      {natural: {condition: {biomes: ['#preset:y'], canSeeSky: true}, anticondition: {structures: ['t'], minY: 3}}},
    );
    expect(merged.condition).toEqual({biomes: ['#a:x'], canSeeSky: true});
    expect(merged.anticondition).toEqual({structures: ['s'], minY: 3});
  });

  it('resolve tags aninhadas, opcionais, ciclos e informa tags não definidas', () => {
    const tags = mergeTagFiles([
      {id: 'a:t', json: {values: ['#a:u', {id: 'x:opt', required: false}, 'v:one']}},
      {id: 'a:u', json: {values: ['#a:t', 'v:two', '#minecraft:gone']}},
      {id: 'a:t', json: {values: ['v:three']}},
    ]);
    expect(resolveTag('a:t', tags)).toEqual({biomes: ['v:one', 'v:three', 'v:two', 'x:opt'], missing: ['minecraft:gone']});
    const replaced = mergeTagFiles([
      {id: 'a:t', json: {values: ['v:old']}},
      {id: 'a:t', json: {replace: true, values: ['v:new']}},
    ]);
    expect(resolveTag('a:t', replaced).biomes).toEqual(['v:new']);
  });

  it('faixa de nível aceita "5-30", "10" e número; o resto é inválido', () => {
    expect(parseLevel('5-30')).toEqual({min: 5, max: 30});
    expect(parseLevel('10')).toEqual({min: 10, max: 10});
    expect(parseLevel(7)).toEqual({min: 7, max: 7});
    expect(parseLevel('abc')).toBeNull();
    expect(parseLevel(undefined)).toBeNull();
  });

  it('remoções ignoram linhas comentadas e falham se o script mudar de forma', () => {
    const script = `let paths = [\n // 'x:spawn_pool_world/off.json',\n 'p:spawn_pool_world/a.json',\n 'q:spawn_pool_world/b.json'\n]\npaths.forEach((path) => { g.json(path, {"spawns": []}) })`;
    expect(parseSpawnRemovals(script)).toEqual(['p:spawn_pool_world/a.json', 'q:spawn_pool_world/b.json']);
    expect(() => parseSpawnRemovals('let paths = []')).toThrow(/mudou/);
  });

  it('regras de captura exigem o formato conhecido do script', () => {
    expect(() => parseCatchRules('nada')).toThrow(/mudou/);
  });

  it('regiões vêm das dexes de região, na ordem fixa, ignorando formas', () => {
    const dexes = {
      galar: {entries: ['cobblemon:articuno-galar']},
      kanto: {entries: ['cobblemon:articuno', {id: 'cobblemon:mew'}]},
      national: {entries: ['cobblemon:articuno']},
    };
    expect(dexRegions(dexes, 'articuno')).toEqual(['kanto', 'galar']);
    expect(dexRegions(dexes, 'mew')).toEqual(['kanto']);
  });
});

describe('dados de spawn versionados', () => {
  const pools = read('spawn-pools.json');
  const biomes = read('biomes.json');
  const capture = read('capture-rules.json');
  const spawns = Object.entries(pools.species).flatMap(([species, list]) => list.map((spawn) => ({species, ...spawn})));

  it('cada spawn tem nível 1–100, bucket, peso e procedência conhecida', () => {
    const sourceIds = new Set([...pools.sources.map((source) => source.id), 'kubejs/data']);
    for (const spawn of spawns) {
      expect(spawn.level.min >= 1 && spawn.level.max <= 100 && spawn.level.min <= spawn.level.max, `${spawn.species} ${spawn.id}`).toBe(
        true,
      );
      expect(typeof spawn.bucket, spawn.id).toBe('string');
      expect(spawn.weight, spawn.id).toBeGreaterThan(0);
      expect(sourceIds.has(spawn.source), spawn.id).toBe(true);
    }
    for (const source of pools.sources) if (source.id !== 'kubejs/data') expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('toda tag de bioma usada tem entrada resolvida e todo bioma tem nome', () => {
    for (const spawn of spawns) {
      for (const biome of [...(spawn.condition.biomes ?? []), ...(spawn.anticondition?.biomes ?? [])]) {
        if (biome.startsWith('#')) expect(Object.hasOwn(biomes.tags, biome.slice(1)), biome).toBe(true);
        else expect(typeof biomes.names[biome], biome).toBe('string');
      }
    }
    for (const list of Object.values(biomes.tags)) for (const biome of list) expect(typeof biomes.names[biome], biome).toBe('string');
    expect(biomes.tags['cobblemon:is_mountain']).toContain('terralith:volcanic_peaks');
  });

  it('espécie removida pelo disable_mons.js não nasce; override do KubeJS vale', () => {
    expect(pools.removals.length).toBeGreaterThan(0);
    const removedPools = new Set(pools.removals.map((removal) => removal.pool));
    expect(spawns.some((spawn) => removedPools.has(spawn.pool))).toBe(false);
    expect(pools.species.articuno).toBeUndefined();
    expect(pools.species.jirachi.every((spawn) => spawn.source === 'kubejs/data')).toBe(true);
  });

  it('spawn de Geodude traz bioma por tag, faixa 5–30 e bucket common', () => {
    const geodude = pools.species.geodude[0];
    expect(geodude.condition.biomes).toEqual(['#cobblemon:is_mountain']);
    expect(geodude.level).toEqual({min: 5, max: 30});
    expect(geodude.bucket).toBe('common');
  });

  it('regra de captura: teto sem líder e Pika Star como requisito não verificado', () => {
    expect(capture.outOfBattle.noLeaderMaxLevel).toBe(15);
    expect(capture.outOfBattle.guaranteedBallIgnoresLevel).toBe(true);
    expect(capture.pikaStar.verified).toBe(false);
    expect(capture.species.articuno.pikaStarRegions).toEqual(['kanto', 'galar']);
    expect(capture.species.geodude.pikaStarRegions).toBeNull();
  });
});
