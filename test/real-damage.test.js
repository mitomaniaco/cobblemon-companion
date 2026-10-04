import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {COMPATIBILITY, assertFreshSources, calculateRealDamage} = require('../electron/lib/real-damage.cjs');
const fact = (value) => ({state: 'known', value, provenance: {sourceKind: 'party', nbtPath: 'test'}});
const sourceHashes = [
  {kind: 'party', sha256: 'a'.repeat(64)},
  {kind: 'pc', sha256: 'b'.repeat(64)},
];
const stats = (values) => Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((stat) => [stat, values[stat]]));

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
      ivs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((stat) => [stat, fact(31)]))),
      hyperTrainedIvs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((stat) => [stat, fact(null)]))),
      evs: stats(Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((stat) => [stat, fact(0)]))),
    },
  };
}

function makeSnapshot(individual = makeIndividual()) {
  return {
    schemaVersion: 2,
    capturedAt: '2026-09-28T00:00:00.000Z',
    worldName: 'test-world',
    consistency: 'best-effort',
    sources: sourceHashes.map((source) => ({...source, modifiedAt: '2026-09-28T00:00:00.000Z'})),
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
    const results = ['cobblemon:synchronize', 'cobblemon:telepathy'].map((ability) => {
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
      expect(result.ruleset.id).toBe('cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v12');
      expect(result.ruleset.adapterVersion).toBe('real-damage-adapter-v10');
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
    expect(() => calculateRealDamage(makeSnapshot(traceGardevoir), makeRequest())).toThrow(/não está mapeada para esta espécie/);
  });

  it('responds to effective attacker and target stats instead of a fixed fixture', () => {
    const baseline = calculateRealDamage(makeSnapshot(), makeRequest());
    const stronger = makeIndividual();
    stronger.battleStats.evs.atk = fact(252);
    const attackerChanged = calculateRealDamage(makeSnapshot(stronger), makeRequest());
    const tougherTarget = makeRequest({
      target: {
        ...makeRequest().target,
        evs: {hp: 0, atk: 0, def: 252, spa: 0, spd: 0, spe: 0},
      },
    });
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
    const boundary = makeRequest({
      target: {
        ...makeRequest().target,
        level: 100,
        evs: {hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 6},
      },
    });
    const overBudget = makeRequest({
      target: {
        ...boundary.target,
        evs: {hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 7},
      },
    });

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
    unknownIv.battleStats.hyperTrainedIvs.hp = {
      state: 'unknown',
      reason: 'not-captured',
      provenance: {sourceKind: 'party', nbtPath: 'test'},
    };
    expect(() => calculateRealDamage(makeSnapshot(unknownIv), makeRequest())).toThrow(/hyperTrainedIvs\.hp.*desconhecido/);

    const unknownEv = makeIndividual();
    unknownEv.battleStats.evs.spe = {state: 'unknown', reason: 'not-captured', provenance: {sourceKind: 'party', nbtPath: 'test'}};
    expect(() => calculateRealDamage(makeSnapshot(unknownEv), makeRequest())).toThrow(/evs\.spe.*desconhecido/);

    const heldItem = makeIndividual();
    heldItem.observed.heldItem = 'cobblemon:oran_berry';
    expect(() => calculateRealDamage(makeSnapshot(heldItem), makeRequest())).toThrow(/item observado/);
  });

  it('blocks unsupported species, forms, abilities, moves, and incomplete scenario attestations', () => {
    expect(() =>
      calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, speciesId: 'cobblemon:missingno'}})),
    ).toThrow(/subconjunto compatível versionado/);
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, formId: 'alternate'}}))).toThrow(
      /somente forma normal/,
    );
    expect(() =>
      calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, ability: 'cobblemon:static'}})),
    ).toThrow(/não está mapeada para esta espécie/);
    const unsupportedMove = makeIndividual();
    unsupportedMove.learnedMoves[0].id = 'cobblemon:vine_whip';
    expect(() => calculateRealDamage(makeSnapshot(unsupportedMove), makeRequest({candidateMoveId: 'cobblemon:vine_whip'}))).toThrow(
      /subconjunto compatível versionado/,
    );
    const incompleteAssumptions = makeRequest();
    for (const key of Object.keys(incompleteAssumptions.assumptions)) {
      incompleteAssumptions.assumptions[key] = false;
      expect(() => calculateRealDamage(makeSnapshot(), incompleteAssumptions)).toThrow(/precisa ser confirmado explicitamente/);
      incompleteAssumptions.assumptions[key] = true;
    }
    for (const abilityId of [
      'cobblemon:rivalry',
      'cobblemon:analytic',
      'cobblemon:download',
      'cobblemon:parentalbond',
      'cobblemon:supremeoverlord',
      'cobblemon:protean',
      'cobblemon:libero',
      'cobblemon:colorchange',
      'cobblemon:intrepidsword',
      'cobblemon:dauntlessshield',
      'cobblemon:disguise',
      'cobblemon:iceface',
      'cobblemon:hungerswitch',
      'cobblemon:comatose',
      'cobblemon:terashift',
      'cobblemon:imposter',
      'cobblemon:trace',
      'cobblemon:schooling',
    ]) {
      expect(COMPATIBILITY.abilities).not.toHaveProperty(abilityId);
      expect(COMPATIBILITY.abilities).not.toHaveProperty(abilityId.replace('cobblemon:', ''));
    }
    for (const moveId of [
      'dig',
      'dive',
      'electroshot',
      'freezeshock',
      'iceburn',
      'meteorbeam',
      'phantomforce',
      'shadowforce',
      'skullbash',
      'belch',
      'burnup',
      'doubleshock',
      'fakeout',
      'firstimpression',
      'lastresort',
      'focuspunch',
      'suckerpunch',
      'thunderclap',
      'upperhand',
      'poltergeist',
      'dreameater',
      'snore',
      'ragingbull',
      'terastarstorm',
      'aciddownpour',
      'alloutpummeling',
      'blackholeeclipse',
      'bloomdoom',
      'breakneckblitz',
      'catastropika',
      'continentalcrush',
      'corkscrewcrash',
      'devastatingdrake',
      'genesissupernova',
      'gigavolthavoc',
      'hydrovortex',
      'infernooverdrive',
      'letssnuggleforever',
      'lightthatburnsthesky',
      'maliciousmoonsault',
      'menacingmoonrazemaelstrom',
      'neverendingnightmare',
      'oceanicoperetta',
      'pulverizingpancake',
      'savagespinout',
      'searingsunrazesmash',
      'shatteredpsyche',
      'sinisterarrowraid',
      'soulstealing7starstrike',
      'splinteredstormshards',
      'stokedsparksurfer',
      'subzeroslammer',
      'supersonicskystrike',
      'tectonicrage',
      'twinkletackle',
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

  it('rejects unknown keys in request object', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({extra: 'field'}))).toThrow(/request\.extra.*não é suportado/);
  });

  it('rejects unknown keys in target object', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, extra: 'field'}}))).toThrow(
      /request\.target\.extra.*não é suportado/,
    );
  });

  it('rejects unknown keys in IVs object', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, extra: 31}},
        }),
      ),
    ).toThrow(/target\.ivs\.extra.*não é suportado/);
  });

  it('rejects unknown keys in EVs object', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, extra: 0}},
        }),
      ),
    ).toThrow(/target\.evs\.extra.*não é suportado/);
  });

  it('rejects unknown keys in assumptions object', () => {
    const badReq = makeRequest();
    badReq.assumptions.extra = true;
    expect(() => calculateRealDamage(makeSnapshot(), badReq)).toThrow(/assumptions\.extra.*não é suportado/);
  });

  it('rejects source objects with extra fields', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'party', sha256: 'a'.repeat(64), extra: 'field'},
            {kind: 'pc', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/não é suportado/);
  });

  it('rejects invalid source SHA256 format - bad characters', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'party', sha256: 'G'.repeat(64)},
            {kind: 'pc', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/SHA-256 hexadecimal/);
  });

  it('rejects invalid source SHA256 format - wrong length', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'party', sha256: 'a'.repeat(63)},
            {kind: 'pc', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/SHA-256 hexadecimal/);
  });

  it('rejects invalid source SHA256 format - too short', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'party', sha256: 'invalid'},
            {kind: 'pc', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/SHA-256 hexadecimal/);
  });

  it('rejects duplicate source kinds', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'party', sha256: 'a'.repeat(64)},
            {kind: 'party', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/inválido ou repetido/);
  });

  it('rejects missing source kinds', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({sources: [{kind: 'party', sha256: 'a'.repeat(64)}]}))).toThrow(
      /identific.*party e PC/,
    );
  });

  it('rejects invalid source kind', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          sources: [
            {kind: 'invalid', sha256: 'a'.repeat(64)},
            {kind: 'pc', sha256: 'b'.repeat(64)},
          ],
        }),
      ),
    ).toThrow(/inválido ou repetido/);
  });

  it('rejects empty text fields in request', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({individualUuid: ''}))).toThrow(/individualUuid.*texto não vazio/);

    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({candidateMoveId: ''}))).toThrow(/candidateMoveId.*texto não vazio/);
  });

  it('rejects whitespace-only text fields', () => {
    const individual = makeIndividual();
    individual.observed.nature = '   ';
    expect(() => calculateRealDamage(makeSnapshot(individual), makeRequest())).toThrow(/observed\.nature.*texto não vazio/);
  });

  it('rejects ability IDs with unsupported namespace', () => {
    const badNamespace = makeIndividual();
    badNamespace.observed.ability = 'other:overgrow';
    expect(() => calculateRealDamage(makeSnapshot(badNamespace), makeRequest())).toThrow(/namespace sem mapeamento/);
  });

  it('rejects nature IDs with unsupported namespace', () => {
    const badNamespace = makeIndividual();
    badNamespace.observed.nature = 'other:adamant';
    expect(() => calculateRealDamage(makeSnapshot(badNamespace), makeRequest())).toThrow(/namespace sem mapeamento/);
  });

  it('rejects actor formId other than normal', () => {
    const badForm = makeIndividual();
    badForm.formId = 'alternate';
    expect(() => calculateRealDamage(makeSnapshot(badForm), makeRequest())).toThrow(/actor\.formId.*forma normal/);
  });

  it('rejects target formId other than normal', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, formId: 'alternate'}}))).toThrow(
      /target\.formId.*forma normal/,
    );
  });

  it('rejects snapshot schemaVersion !== 2', () => {
    const badVersion = makeSnapshot();
    badVersion.schemaVersion = 1;
    expect(() => calculateRealDamage(badVersion, makeRequest())).toThrow(/snapshot local v2/);

    const badVersion3 = makeSnapshot();
    badVersion3.schemaVersion = 3;
    expect(() => calculateRealDamage(badVersion3, makeRequest())).toThrow(/snapshot local v2/);
  });

  it('rejects snapshot consistency !== best-effort', () => {
    const badConsistency = makeSnapshot();
    badConsistency.consistency = 'perfect';
    expect(() => calculateRealDamage(badConsistency, makeRequest())).toThrow(/snapshot local v2/);
  });

  it('rejects snapshot individuals not an array', () => {
    const noIndividuals = makeSnapshot();
    noIndividuals.individuals = null;
    expect(() => calculateRealDamage(noIndividuals, makeRequest())).toThrow(/snapshot local v2/);

    const notArray = makeSnapshot();
    notArray.individuals = {0: makeIndividual()};
    expect(() => calculateRealDamage(notArray, makeRequest())).toThrow(/snapshot local v2/);
  });

  it('rejects non-object snapshot', () => {
    expect(() => calculateRealDamage(null, makeRequest())).toThrow(/snapshot local v2/);
    expect(() => calculateRealDamage({}, makeRequest())).toThrow(/snapshot local v2/);
    expect(() => calculateRealDamage('not-object', makeRequest())).toThrow(/snapshot local v2/);
  });

  it('requires exactly one UUID match in snapshot', () => {
    const doubled = makeSnapshot();
    const second = makeIndividual();
    second.uuid = '00000000-0000-4000-8000-000000000001';
    doubled.individuals.push(second);
    expect(() => calculateRealDamage(doubled, makeRequest())).toThrow(/individualUuid.*exatamente um indivíduo/);

    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({individualUuid: 'nonexistent'}))).toThrow(
      /individualUuid.*exatamente um indivíduo/,
    );
  });

  it('requires equipped and learned move lists to be marked as known', () => {
    const unknownEquipped = makeIndividual();
    unknownEquipped.equippedMovesKnown = false;
    expect(() => calculateRealDamage(makeSnapshot(unknownEquipped), makeRequest())).toThrow(/moves.*conhecidas/);

    const unknownLearned = makeIndividual();
    unknownLearned.learnedMovesKnown = false;
    expect(() => calculateRealDamage(makeSnapshot(unknownLearned), makeRequest())).toThrow(/moves.*conhecidas/);
  });

  it('requires non-empty equipped moves list', () => {
    const noEquipped = makeIndividual();
    noEquipped.equippedMoves = [];
    expect(() => calculateRealDamage(makeSnapshot(noEquipped), makeRequest())).toThrow(/equippedMoves.*primeiro slot/);
  });

  it('requires learnedMoves to be an array', () => {
    const noLearned = makeIndividual();
    noLearned.learnedMoves = null;
    expect(() => calculateRealDamage(makeSnapshot(noLearned), makeRequest())).toThrow(/learnedMoves.*não foi capturada/);
  });

  it('rejects candidate move if it is currently equipped', () => {
    const equipped = makeIndividual();
    equipped.equippedMoves[0].id = 'cobblemon:seedbomb';
    expect(() => calculateRealDamage(makeSnapshot(equipped), makeRequest({candidateMoveId: 'cobblemon:seedbomb'}))).toThrow(
      /candidateMoveId.*golpe aprendido ainda não equipado/,
    );
  });

  it('rejects candidate move if already in equipped list', () => {
    const equipped = makeIndividual();
    equipped.equippedMoves.push({id: 'cobblemon:seedbomb', pp: 10, ppUps: 0});
    expect(() => calculateRealDamage(makeSnapshot(equipped), makeRequest({candidateMoveId: 'cobblemon:seedbomb'}))).toThrow(
      /candidateMoveId.*golpe aprendido ainda não equipado/,
    );
  });

  it('rejects candidate move if not in learned moves', () => {
    const notLearned = makeIndividual();
    notLearned.learnedMoves = [{id: 'cobblemon:tackle', ppUps: 0}];
    expect(() => calculateRealDamage(makeSnapshot(notLearned), makeRequest())).toThrow(/candidateMoveId.*aprendido neste indivíduo/);
  });

  it('rejects unsupported actor species', () => {
    const badSpecies = makeIndividual();
    badSpecies.speciesId = 'cobblemon:missingno';
    expect(() => calculateRealDamage(makeSnapshot(badSpecies), makeRequest())).toThrow(/actor\.speciesId.*compatível versionado/);
  });

  it('rejects unsupported actor ability', () => {
    const badAbility = makeIndividual();
    badAbility.observed.ability = 'cobblemon:static';
    expect(() => calculateRealDamage(makeSnapshot(badAbility), makeRequest())).toThrow(
      /observed\.ability.*não está mapeada para esta espécie/,
    );
  });

  it('rejects unsupported actor nature', () => {
    const badNature = makeIndividual();
    badNature.observed.nature = 'cobblemon:unsupported_nature';
    expect(() => calculateRealDamage(makeSnapshot(badNature), makeRequest())).toThrow(/observed\.nature.*compatível versionado/);
  });

  it('rejects unsupported target ability', () => {
    expect(() =>
      calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, ability: 'cobblemon:static'}})),
    ).toThrow(/target\.ability.*não está mapeada para esta espécie/);
  });

  it('rejects unsupported target nature', () => {
    expect(() =>
      calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, nature: 'cobblemon:unsupported_nature'}})),
    ).toThrow(/target\.nature.*compatível versionado/);
  });

  it('rejects hyper-trained IVs with unknown state', () => {
    const unknownHt = makeIndividual();
    unknownHt.battleStats.hyperTrainedIvs.hp = {
      state: 'unknown',
      reason: 'not-captured',
      provenance: {sourceKind: 'party', nbtPath: 'test'},
    };
    expect(() => calculateRealDamage(makeSnapshot(unknownHt), makeRequest())).toThrow(/hyperTrainedIvs\.hp.*desconhecido/);
  });

  it('rejects hyper-trained IV bounds violations', () => {
    const badBounds = makeIndividual();
    badBounds.battleStats.hyperTrainedIvs.spa = fact(-1);
    expect(() => calculateRealDamage(makeSnapshot(badBounds), makeRequest())).toThrow(/effectiveIvs\.spa.*inteiro entre 0 e 31/);

    const badHigh = makeIndividual();
    badHigh.battleStats.hyperTrainedIvs.spd = fact(32);
    expect(() => calculateRealDamage(makeSnapshot(badHigh), makeRequest())).toThrow(/effectiveIvs\.spd.*inteiro entre 0 e 31/);
  });

  it('rejects actor level not captured', () => {
    const noLevel = makeIndividual();
    noLevel.level = null;
    expect(() => calculateRealDamage(makeSnapshot(noLevel), makeRequest())).toThrow(/actor\.level.*não foi capturado/);
  });

  it('rejects actor level out of bounds', () => {
    const lowLevel = makeIndividual();
    lowLevel.level = 0;
    expect(() => calculateRealDamage(makeSnapshot(lowLevel), makeRequest())).toThrow(/actor\.level.*inteiro entre 1 e 100/);

    const highLevel = makeIndividual();
    highLevel.level = 101;
    expect(() => calculateRealDamage(makeSnapshot(highLevel), makeRequest())).toThrow(/actor\.level.*inteiro entre 1 e 100/);
  });

  it('rejects non-object battleStats', () => {
    const badStats = makeIndividual();
    badStats.battleStats = null;
    expect(() => calculateRealDamage(makeSnapshot(badStats), makeRequest())).toThrow(/battleStats.*objeto/);
  });

  it('rejects target level out of bounds', () => {
    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, level: 0}}))).toThrow(
      /target\.level.*inteiro entre 1 e 100/,
    );

    expect(() => calculateRealDamage(makeSnapshot(), makeRequest({target: {...makeRequest().target, level: 101}}))).toThrow(
      /target\.level.*inteiro entre 1 e 100/,
    );
  });

  it('rejects target IV bounds violations', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, ivs: {hp: -1, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}},
        }),
      ),
    ).toThrow(/target\.ivs\.hp.*inteiro entre 0 e 31/);

    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, ivs: {hp: 32, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}},
        }),
      ),
    ).toThrow(/target\.ivs\.hp.*inteiro entre 0 e 31/);
  });

  it('rejects target EV bounds violations', () => {
    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, evs: {hp: -1, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}},
        }),
      ),
    ).toThrow(/target\.evs\.hp.*inteiro entre 0 e 252/);

    expect(() =>
      calculateRealDamage(
        makeSnapshot(),
        makeRequest({
          target: {...makeRequest().target, evs: {hp: 253, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}},
        }),
      ),
    ).toThrow(/target\.evs\.hp.*inteiro entre 0 e 252/);
  });

  it('requires all assumptions to be explicitly true', () => {
    const assumptions = [
      'rulesetMatchesActiveWorld',
      'actorBaselineConfirmed',
      'actorFullHpConfirmed',
      'targetBaselineConfirmed',
      'fieldBaselineConfirmed',
    ];

    for (const assumption of assumptions) {
      const badReq = makeRequest();
      badReq.assumptions[assumption] = false;
      expect(() => calculateRealDamage(makeSnapshot(), badReq)).toThrow(/precisa ser confirmado explicitamente/);

      const nullReq = makeRequest();
      nullReq.assumptions[assumption] = null;
      expect(() => calculateRealDamage(makeSnapshot(), nullReq)).toThrow(/precisa ser confirmado explicitamente/);
    }
  });

  it('validates output digest changes with input', () => {
    const baseline = calculateRealDamage(makeSnapshot(), makeRequest());

    const strongerAttacker = makeIndividual();
    strongerAttacker.battleStats.evs.atk = fact(252);
    const changed = calculateRealDamage(makeSnapshot(strongerAttacker), makeRequest());

    expect(baseline.inputDigest).not.toBe(changed.inputDigest);
    expect(baseline.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.inputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates output has correct damage roll structure', () => {
    const result = calculateRealDamage(makeSnapshot(), makeRequest());

    expect(result.current.rollCount).toBe(16);
    expect(result.candidate.rollCount).toBe(16);
    expect(result.current.min).toBeGreaterThanOrEqual(0);
    expect(result.current.max).toBeGreaterThanOrEqual(result.current.min);
    expect(result.candidate.min).toBeGreaterThanOrEqual(0);
    expect(result.candidate.max).toBeGreaterThanOrEqual(result.candidate.min);
    expect(result.current.targetHP).toBeGreaterThan(0);
    expect(result.candidate.targetHP).toBeGreaterThan(0);
  });

  it('validates scope fields in output', () => {
    const result = calculateRealDamage(makeSnapshot(), makeRequest());

    expect(result.scope.generation).toBe(9);
    expect(result.scope.format).toBe('singles');
    expect(result.scope.actions).toBe(1);
    expect(result.scope.damageOnSuccessfulHitOnly).toBe(true);
    expect(result.scope.rolls).toBe(16);
    expect(result.scope.rollSummary).toBe('minimum-and-maximum');
  });

  it('validates ruleset and adapter versions in output', () => {
    const result = calculateRealDamage(makeSnapshot(), makeRequest());

    expect(result.ruleset.id).toBe(COMPATIBILITY.ruleset.id);
    expect(result.ruleset.cobblemonVersion).toBe(COMPATIBILITY.ruleset.cobblemonVersion);
    expect(result.ruleset.showdownVersion).toBe(COMPATIBILITY.ruleset.showdownVersion);
    expect(result.ruleset.calcVersion).toBe('0.11.0');
    expect(result.ruleset.adapterVersion).toBe('real-damage-adapter-v10');
  });

  it('accepts bare ability IDs without cobblemon: prefix', () => {
    const bareAbility = makeIndividual();
    bareAbility.observed.ability = 'overgrow';
    const result = calculateRealDamage(makeSnapshot(bareAbility), makeRequest());
    expect(result.ruleset.id).toBeDefined();
  });

  it('accepts bare nature IDs without cobblemon: prefix', () => {
    const bareNature = makeIndividual();
    bareNature.observed.nature = 'adamant';
    const result = calculateRealDamage(makeSnapshot(bareNature), makeRequest());
    expect(result.ruleset.id).toBeDefined();
  });
});

describe('golpes derivados e imunidade', () => {
  const learnsEarthquake = () => {
    const individual = makeIndividual();
    individual.learnedMoves = [{id: 'cobblemon:earthquake', ppUps: 0}];
    return individual;
  };

  it('calcula um golpe derivado do gerador contra um alvo comum', () => {
    const result = calculateRealDamage(makeSnapshot(learnsEarthquake()), makeRequest({candidateMoveId: 'cobblemon:earthquake'}));

    expect(result.candidate.moveId).toBe('cobblemon:earthquake');
    expect(result.candidate.max).toBeGreaterThan(0);
    expect(result.candidate.rollCount).toBe(16);
  });

  it('mostra 0–0 em vez de bloquear quando o alvo é imune ao tipo do golpe', () => {
    const request = makeRequest({
      candidateMoveId: 'cobblemon:earthquake',
      target: {...makeRequest().target, speciesId: 'cobblemon:charizard', ability: 'cobblemon:blaze'},
    });
    const result = calculateRealDamage(makeSnapshot(learnsEarthquake()), request);

    expect(result.candidate.min).toBe(0);
    expect(result.candidate.max).toBe(0);
    expect(result.candidate.rollCount).toBe(16);
    expect(result.current.max).toBeGreaterThan(0);
  });
});
