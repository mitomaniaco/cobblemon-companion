import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {COMPATIBILITY, assertFreshSources, calculateRealDamage} = require('../electron/lib/real-damage.cjs');
const fact = value => ({state: 'known', value, provenance: {sourceKind: 'party', nbtPath: 'test'}});
const sourceHashes = [
  {kind: 'party', sha256: 'a'.repeat(64)},
  {kind: 'pc', sha256: 'b'.repeat(64)},
];
const stats = values => Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => [stat, values[stat]]));

function makeIndividual() {
  return {
    uuid: '00000000-0000-4000-8000-000000000001',
    speciesId: 'cobblemon:bulbasaur',
    formId: 'normal',
    level: 30,
    location: {container: 'party', slot: 0},
    equippedMoves: [{id: 'cobblemon:tackle', pp: 20, ppUps: 0}],
    equippedMovesKnown: true,
    learnedMoves: [{id: 'cobblemon:seedbomb', ppUps: 0}],
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:adamant', ability: 'cobblemon:overgrow', heldItem: null},
    battleStats: {
      ivs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => [stat, fact(31)]))),
      hyperTrainedIvs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => [stat, fact(null)]))),
      evs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => [stat, fact(0)]))),
    },
  };
}

function makeSnapshot(individual = makeIndividual()) {
  return {
    schemaVersion: 2,
    capturedAt: '2026-09-28T00:00:00.000Z',
    worldName: 'test-world',
    consistency: 'best-effort',
    sources: sourceHashes.map(source => ({...source, modifiedAt: '2026-09-28T00:00:00.000Z'})),
    individuals: [individual],
  };
}

function makeRequest(patch = {}) {
  return {
    sources: sourceHashes,
    individualUuid: '00000000-0000-4000-8000-000000000001',
    candidateMoveId: 'cobblemon:seedbomb',
    target: {
      speciesId: 'cobblemon:abra',
      formId: 'normal',
      level: 25,
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
    ...patch,
  };
}

describe('versioned real damage adapter', () => {
  it('calculates both moves from the selected snapshot facts and full manual target profile', () => {
    const result = calculateRealDamage(makeSnapshot(), makeRequest());

    expect(result.ruleset.id).toBe(COMPATIBILITY.ruleset.id);
    expect(result.ruleset.calcVersion).toBe('0.11.0');
    expect(result.current.moveId).toBe('cobblemon:tackle');
    expect(result.candidate.moveId).toBe('cobblemon:seedbomb');
    expect(result.current.rollCount).toBe(16);
    expect(result.candidate.rollCount).toBe(16);
    expect(result.current.targetHP).toBe(result.candidate.targetHP);
    expect(result.candidate.min).toBeGreaterThan(result.current.min);
    expect(result.inputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('calcula Gardevoir normal com habilidades compatíveis usando a tabela de Gen 9', () => {
    const baseline = calculateRealDamage(makeSnapshot(), makeRequest());
    const results = ['cobblemon:synchronize', 'cobblemon:telepathy'].map(ability => {
      const gardevoir = makeIndividual();
      gardevoir.speciesId = 'cobblemon:gardevoir';
      gardevoir.observed.ability = ability;
      return calculateRealDamage(makeSnapshot(gardevoir), makeRequest());
    });

    expect(COMPATIBILITY.species['cobblemon:gardevoir']).toEqual({
      name: 'Gardevoir',
      abilities: ['cobblemon:synchronize', 'cobblemon:telepathy'],
    });
    for (const result of results) {
      expect(result.ruleset.id).toBe('cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v10');
      expect(result.ruleset.adapterVersion).toBe('real-damage-adapter-v9');
      expect(result.actor.speciesId).toBe('cobblemon:gardevoir');
      expect(result.current.rollCount).toBe(16);
      expect(result.candidate.rollCount).toBe(16);
      expect(result.current.min).toBeGreaterThan(baseline.current.min);
      expect(result.current.max).toBeGreaterThan(baseline.current.max);
      expect(result.candidate.min).toBeLessThan(baseline.candidate.min);
      expect(result.candidate.max).toBeLessThan(baseline.candidate.max);
    }

    const traceGardevoir = makeIndividual();
    traceGardevoir.speciesId = 'cobblemon:gardevoir';
    traceGardevoir.observed.ability = 'cobblemon:trace';
    expect(() => calculateRealDamage(makeSnapshot(traceGardevoir), makeRequest()))
      .toThrow(/não está mapeada para esta espécie/);
  });

  it('responds to effective attacker and target stats instead of a fixed fixture', () => {
    const baseline = calculateRealDamage(makeSnapshot(), makeRequest());
    const stronger = makeIndividual();
    stronger.battleStats.evs.atk = fact(252);
    const attackerChanged = calculateRealDamage(makeSnapshot(stronger), makeRequest());
    const tougherTarget = makeRequest({target: {
      ...makeRequest().target,
      evs: {hp: 0, atk: 0, def: 252, spa: 0, spd: 0, spe: 0},
    }});
    const targetChanged = calculateRealDamage(makeSnapshot(), tougherTarget);

    expect(attackerChanged.candidate.min).toBeGreaterThan(baseline.candidate.min);
    expect(targetChanged.candidate.min).toBeLessThan(baseline.candidate.min);
  });

  it('uses a numeric Hyper-Trained override when the base IV is unknown', () => {
    const baseline = calculateRealDamage(makeSnapshot(), makeRequest());
    const trained = makeIndividual();
    trained.battleStats.ivs.atk = {state: 'unknown', reason: 'not-captured', provenance: {sourceKind: 'party', nbtPath: 'test'}};
    trained.battleStats.hyperTrainedIvs.atk = fact(0);
    const result = calculateRealDamage(makeSnapshot(trained), makeRequest());

    expect(result.candidate.min).toBeLessThan(baseline.candidate.min);
  });

  it('accepts the 510-EV boundary and rejects a total above it', () => {
    const boundary = makeRequest({target: {
      ...makeRequest().target,
      level: 100,
      evs: {hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 6},
    }});
    const overBudget = makeRequest({target: {
      ...boundary.target,
      evs: {hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 7},
    }});

    expect(calculateRealDamage(makeSnapshot(), boundary).target.level).toBe(100);
    expect(() => calculateRealDamage(makeSnapshot(), overBudget)).toThrow(/soma excede 510/);
  });

  it('blocks stale save sources before producing damage', () => {
    const changed = makeSnapshot();
    changed.sources[0].sha256 = 'c'.repeat(64);

    expect(() => calculateRealDamage(changed, makeRequest())).toThrow(/mudou desde a captura/);
    expect(() => assertFreshSources(sourceHashes, changed.sources)).toThrow(/mudou desde a captura/);
  });

  it('blocks unknown effective IVs, unknown EVs, and observed held items', () => {
    const unknownIv = makeIndividual();
    unknownIv.battleStats.hyperTrainedIvs.hp = {state: 'unknown', reason: 'not-captured', provenance: {sourceKind: 'party', nbtPath: 'test'}};
    expect(() => calculateRealDamage(makeSnapshot(unknownIv), makeRequest())).toThrow(/hyperTrainedIvs\.hp.*desconhecido/);

    const unknownEv = makeIndividual();
    unknownEv.battleStats.evs.spe = {state: 'unknown', reason: 'not-captured', provenance: {sourceKind: 'party', nbtPath: 'test'}};
    expect(() => calculateRealDamage(makeSnapshot(unknownEv), makeRequest())).toThrow(/evs\.spe.*desconhecido/);

    const heldItem = makeIndividual();
    heldItem.observed.heldItem = 'cobblemon:oran_berry';
    expect(() => calculateRealDamage(makeSnapshot(heldItem), makeRequest())).toThrow(/item observado/);
  });

  it('blocks unsupported species, forms, abilities, moves, and incomplete scenario attestations', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, speciesId: 'cobblemon:missingno'}})))
      .toThrow(/subconjunto compatível versionado/);
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, formId: 'alternate'}})))
      .toThrow(/somente forma normal/);
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, ability: 'cobblemon:static'}})))
      .toThrow(/não está mapeada para esta espécie/);
    const unsupportedMove = makeIndividual();
    unsupportedMove.learnedMoves[0].id = 'cobblemon:vine_whip';
    expect(() => calculateRealDamage(makeSnapshot(unsupportedMove), makeRequest({candidateMoveId: 'cobblemon:vine_whip'})))
      .toThrow(/subconjunto compatível versionado/);
    const incompleteAssumptions = makeRequest();
    for (const key of Object.keys(incompleteAssumptions.assumptions)) {
      incompleteAssumptions.assumptions[key] = false;
      expect(() => calculateRealDamage(makeSnapshot(), incompleteAssumptions)).toThrow(/precisa ser confirmado explicitamente/);
      incompleteAssumptions.assumptions[key] = true;
    }
    for (const abilityId of [
      'cobblemon:rivalry', 'cobblemon:analytic', 'cobblemon:download', 'cobblemon:parentalbond',
      'cobblemon:supremeoverlord', 'cobblemon:protean', 'cobblemon:libero', 'cobblemon:colorchange',
      'cobblemon:intrepidsword', 'cobblemon:dauntlessshield', 'cobblemon:disguise', 'cobblemon:iceface',
      'cobblemon:hungerswitch', 'cobblemon:comatose', 'cobblemon:terashift', 'cobblemon:imposter',
      'cobblemon:trace', 'cobblemon:schooling',
    ]) {
      expect(COMPATIBILITY.abilities).not.toHaveProperty(abilityId);
      expect(COMPATIBILITY.abilities).not.toHaveProperty(abilityId.replace('cobblemon:', ''));
    }
    for (const moveId of [
      'dig', 'dive', 'electroshot', 'freezeshock', 'iceburn', 'meteorbeam', 'phantomforce', 'shadowforce', 'skullbash',
      'belch', 'burnup', 'doubleshock', 'fakeout', 'firstimpression', 'lastresort',
      'focuspunch', 'suckerpunch', 'thunderclap', 'upperhand',
      'poltergeist', 'dreameater', 'snore', 'ragingbull', 'terastarstorm',
      'aciddownpour', 'alloutpummeling', 'blackholeeclipse', 'bloomdoom', 'breakneckblitz', 'catastropika',
      'continentalcrush', 'corkscrewcrash', 'devastatingdrake', 'genesissupernova', 'gigavolthavoc', 'hydrovortex',
      'infernooverdrive', 'letssnuggleforever', 'lightthatburnsthesky', 'maliciousmoonsault', 'menacingmoonrazemaelstrom',
      'neverendingnightmare', 'oceanicoperetta', 'pulverizingpancake', 'savagespinout', 'searingsunrazesmash',
      'shatteredpsyche', 'sinisterarrowraid', 'soulstealing7starstrike', 'splinteredstormshards', 'stokedsparksurfer',
      'subzeroslammer', 'supersonicskystrike', 'tectonicrage', 'twinkletackle',
    ]) {
      expect(COMPATIBILITY.moves).not.toHaveProperty(`cobblemon:${moveId}`);
      expect(COMPATIBILITY.moves).not.toHaveProperty(moveId);
    }

  });

  it('requires the replacement move to be learned by this UUID and not already equipped', () => {
    const individual = makeIndividual();
    individual.learnedMoves = [];
    expect(() => calculateRealDamage(makeSnapshot(individual), makeRequest())).toThrow(/não foi observado como aprendido/);

    const equipped = makeIndividual();
    equipped.equippedMoves.push({id: 'cobblemon:seedbomb', pp: 10, ppUps: 0});
    expect(() => calculateRealDamage(makeSnapshot(equipped), makeRequest())).toThrow(/precisa ser um golpe aprendido ainda não equipado/);
  });
});
