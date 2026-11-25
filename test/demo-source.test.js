import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {loadDemoSnapshot, loadDemoProgress, DEMO_DIR} = require('../electron/lib/demo-source.cjs');
const {buildGuide} = require('../electron/lib/guide/engine.cjs');
const {loadGuideData} = require('../electron/lib/guide/data.cjs');
const {deriveProgressLevelCap, guideNextGoal} = require('../electron/lib/guide/trainers.cjs');
const {calculateRealDamage} = require('../electron/lib/real-damage.cjs');

const compat = require('../electron/lib/combat-compatibility.json');
const guide = loadGuideData();

const itemKey = (name) => name.replace(/^cobblemon:/, '').replace(/_/g, '');
const has = (map, key) => key in (map ?? {});

const TARGET = {
  speciesId: 'cobblemon:abra',
  formId: 'normal',
  level: 25,
  nature: 'cobblemon:modest',
  ability: 'cobblemon:synchronize',
  ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
  evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
};
const ASSUMPTIONS = {
  rulesetMatchesActiveWorld: true,
  actorBaselineConfirmed: true,
  actorFullHpConfirmed: true,
  targetBaselineConfirmed: true,
  fieldBaselineConfirmed: true,
};

describe('demo source (dados sintéticos da demonstração)', () => {
  function candidateOf(individual) {
    const equipped = new Set(individual.equippedMoves.map((move) => move.id));
    const candidate = individual.learnedMoves.find((move) => !equipped.has(move.id));
    if (!candidate) throw new Error(`sem golpe aprendido fora dos equipados: ${individual.uuid}`);
    return candidate.id;
  }
  it('uses only data that the real catalogs and learnsets accept', () => {
    const snapshot = loadDemoSnapshot();
    const problems = [];

    for (const individual of snapshot.individuals) {
      const species = individual.speciesId.replace(/^cobblemon:/, '');
      const speciesEntry = compat.species[individual.speciesId];
      if (!speciesEntry) problems.push(`espécie fora do catálogo: ${individual.speciesId}`);

      if (!has(compat.natures, individual.observed.nature)) problems.push(`natureza fora do catálogo: ${individual.observed.nature}`);

      const ability = individual.observed.ability;
      if (!has(compat.abilities, ability)) problems.push(`habilidade fora do catálogo: ${ability}`);
      else if (speciesEntry && !(speciesEntry.abilities ?? []).includes(ability))
        problems.push(`habilidade ${ability} não pertence a ${individual.speciesId}`);

      if (individual.observed.heldItem !== null && !has(compat.items, itemKey(individual.observed.heldItem)))
        problems.push(`item fora do catálogo: ${individual.observed.heldItem}`);

      const learnset = guide.learnsets[species]?.levelUp ?? [];
      for (const move of [...individual.equippedMoves, ...individual.learnedMoves]) {
        if (!has(compat.moves, move.id)) problems.push(`golpe fora do catálogo: ${move.id}`);
        const learnedAt = learnset.find((entry) => entry.moveId === move.id);
        if (!learnedAt || learnedAt.level > individual.level)
          problems.push(`${move.id} não é aprendível por ${species} até o nível ${individual.level}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('reads only files under data/demo, never save, config or network', () => {
    const readPaths = [];
    const names = ['readFileSync', 'openSync', 'statSync', 'readdirSync', 'realpathSync'];
    const real = Object.fromEntries(names.map((name) => [name, fs[name].bind(fs)]));
    const spies = names.map((name) =>
      vi.spyOn(fs, name).mockImplementation((...args) => {
        if (typeof args[0] === 'string') readPaths.push(args[0]);
        return real[name](...args);
      }),
    );
    try {
      loadDemoSnapshot();
      loadDemoProgress();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    expect(readPaths.length).toBeGreaterThan(0);
    for (const file of readPaths) expect(path.resolve(file).startsWith(DEMO_DIR + path.sep)).toBe(true);
  });

  it('runs the real guide engine on the demo team within 30 seconds', {timeout: 60000}, async () => {
    const snapshot = loadDemoSnapshot();
    const progress = loadDemoProgress();
    const levelCap = deriveProgressLevelCap(guide.campaign, progress);
    const partyMax = Math.max(...snapshot.individuals.map((i) => i.level));
    const next = guideNextGoal(guide, partyMax, progress);

    const goals = [{kind: 'pve'}, {kind: 'trainer', trainerId: 'rctmod:leader_brock_019e'}, {kind: 'trainer', trainerId: next.trainerId}];
    for (const goal of goals) {
      const started = performance.now();
      const result = await buildGuide({snapshot, goal, data: guide, levelCap, respectLevelCap: true});
      const elapsed = performance.now() - started;
      expect(elapsed).toBeLessThan(30000);
      expect(result.team.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('computes real damage for one demo member with min and max', () => {
    const snapshot = loadDemoSnapshot();
    const member = snapshot.individuals[0];
    const result = calculateRealDamage(
      {...snapshot, individuals: [member]},
      {
        sources: snapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
        individualUuid: member.uuid,
        currentSlotIndex: 0,
        candidateMoveId: candidateOf(member),
        target: TARGET,
        assumptions: ASSUMPTIONS,
      },
    );
    expect(typeof result.current.min).toBe('number');
    expect(typeof result.current.max).toBe('number');
    expect(result.current.max).toBeGreaterThanOrEqual(result.current.min);
  });

  it('derives the level cap 27 from the demo progress', () => {
    expect(deriveProgressLevelCap(guide.campaign, loadDemoProgress())).toBe(27);
  });

  it('passes the real damage gate, with schema 2, best-effort, sources and demo marker', () => {
    const snapshot = loadDemoSnapshot();
    const member = snapshot.individuals.find((i) => i.location.container === 'pc');
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.consistency).toBe('best-effort');
    expect(snapshot.demo).toBe(true);
    expect(snapshot.sources.map((s) => s.kind).sort()).toEqual(['party', 'pc']);
    expect(() =>
      calculateRealDamage(snapshot, {
        sources: snapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
        individualUuid: member.uuid,
        currentSlotIndex: 0,
        candidateMoveId: candidateOf(member),
        target: TARGET,
        assumptions: ASSUMPTIONS,
      }),
    ).not.toThrow();
  });
});
