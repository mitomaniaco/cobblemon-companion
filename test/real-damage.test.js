import {createRequire} from 'node:module';
import {describe, expect, it, vi} from 'vitest';

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
    currentSlotIndex: 0,
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
      expect(result.ruleset.id).toBe('cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v13');
      expect(result.ruleset.adapterVersion).toBe('real-damage-adapter-v11');
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
    heldItem.observed.heldItem = 'cobblemon:item_inexistente';
    expect(() => calculateRealDamage(makeSnapshot(heldItem), makeRequest())).toThrow(/heldItem.*fora do subconjunto/);
  });

  it('inclui o item segurado do catálogo no cálculo e recusa namespace sem mapeamento', () => {
    const withItem = (heldItem) => {
      const individual = makeIndividual();
      individual.observed.heldItem = heldItem;
      return calculateRealDamage(makeSnapshot(individual), makeRequest());
    };
    const bare = withItem(null);
    const sash = withItem('cobblemon:focus_sash');
    expect(sash.current).toEqual(bare.current);
    expect(sash.candidate).toEqual(bare.candidate);
    expect(sash.actor.heldItem).toBe('Focus Sash');
    expect(sash.inputDigest).not.toBe(bare.inputDigest);
    // Tackle é Normal: o Silk Scarf aumenta o dano.
    expect(withItem('cobblemon:silk_scarf').current.max).toBeGreaterThan(bare.current.max);
    expect(() => withItem('mega_showdown:venusaurite')).toThrow('Cálculo real: actor.observed.heldItem usa um namespace sem mapeamento');
  });

  it('compara o slot escolhido e recusa slot inválido', () => {
    const individual = makeIndividual();
    individual.equippedMoves.push({id: 'cobblemon:vinewhip', pp: 25, ppUps: 0});
    const snapshot = makeSnapshot(individual);
    const first = calculateRealDamage(snapshot, makeRequest());
    const second = calculateRealDamage(snapshot, makeRequest({currentSlotIndex: 1}));
    expect(second.current.moveId).toBe('cobblemon:vinewhip');
    expect(second.actor.currentSlotIndex).toBe(1);
    expect(second.inputDigest).not.toBe(first.inputDigest);
    for (const invalid of [2, -1, 0.5]) {
      expect(() => calculateRealDamage(snapshot, makeRequest({currentSlotIndex: invalid}))).toThrow(
        'Cálculo real: request.currentSlotIndex',
      );
    }
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
    const prototypeMove = makeIndividual();
    prototypeMove.learnedMoves[0].id = 'constructor';
    expect(() => calculateRealDamage(makeSnapshot(prototypeMove), makeRequest({candidateMoveId: 'constructor'}))).toThrow(
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
    expect(() => calculateRealDamage(makeSnapshot(noEquipped), makeRequest())).toThrow(/equippedMoves.*não há golpe equipado/);
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
    expect(result.ruleset.adapterVersion).toBe('real-damage-adapter-v11');
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

describe('validação do pedido de cálculo real', () => {
  const run = (patch, individual = makeIndividual()) => calculateRealDamage(makeSnapshot(individual), makeRequest(patch));
  const withTarget = (patch) => ({target: {...makeRequest().target, ...patch}});

  it('recusa pedido que não é objeto', () => {
    expect(() => calculateRealDamage(makeSnapshot(), null)).toThrow('Cálculo real: request precisa ser um objeto');
    expect(() => calculateRealDamage(makeSnapshot(), [])).toThrow('Cálculo real: request precisa ser um objeto');
  });

  it('recusa chave desconhecida no pedido e no alvo', () => {
    expect(() => run({extra: 1})).toThrow('Cálculo real: request.extra');
    expect(() => run(withTarget({extra: 1}))).toThrow('Cálculo real: request.target.extra');
  });

  it('recusa snapshot que não é o v2 best-effort com lista de indivíduos', () => {
    const base = makeSnapshot();
    for (const snapshot of [{...base, schemaVersion: 1}, {...base, consistency: 'strict'}, {...base, individuals: null}, null]) {
      expect(() => calculateRealDamage(snapshot, makeRequest())).toThrow('Cálculo real: snapshot não corresponde');
    }
  });

  it('recusa UUID em branco, repetido ou ausente do snapshot', () => {
    expect(() => run({individualUuid: '   '})).toThrow('Cálculo real: request.individualUuid');
    expect(() => run({individualUuid: 5})).toThrow('Cálculo real: request.individualUuid');
    expect(() => run({individualUuid: '00000000-0000-4000-8000-0000000000ff'})).toThrow('Cálculo real: request.individualUuid');
    const first = makeIndividual();
    const snapshot = {...makeSnapshot(first), individuals: [first, {...first}]};
    expect(() => calculateRealDamage(snapshot, makeRequest())).toThrow('Cálculo real: request.individualUuid');
  });

  it.each([0, 101, 1.5, -1, '25', null, Number.NaN])('recusa nível do alvo %j', (level) => {
    expect(() => run(withTarget({level}))).toThrow('Cálculo real: request.target.level');
  });

  it.each([1, 100])('aceita nível do alvo nos limites (%i)', (level) => {
    expect(run(withTarget({level})).target.level).toBe(level);
  });

  it('aplica os limites de IV (0–31), EV (0–252) e soma de EVs (até 510) do alvo', () => {
    const target = makeRequest().target;
    expect(() => run(withTarget({ivs: {...target.ivs, hp: 32}}))).toThrow('Cálculo real: request.target.ivs.hp');
    expect(() => run(withTarget({ivs: {...target.ivs, hp: -1}}))).toThrow('Cálculo real: request.target.ivs.hp');
    expect(() => run(withTarget({evs: {...target.evs, spe: 253}}))).toThrow('Cálculo real: request.target.evs.spe');
    expect(() => run(withTarget({evs: {...target.evs, spe: -1}}))).toThrow('Cálculo real: request.target.evs.spe');
    expect(() => run(withTarget({evs: {...target.evs, hp: 252, atk: 252, def: 7}}))).toThrow(
      'Cálculo real: request.target.evs a soma excede 510',
    );
    expect(() => run(withTarget({ivs: {...target.ivs, extra: 1}}))).toThrow('Cálculo real: request.target.ivs.extra');
    expect(run(withTarget({evs: {...target.evs, hp: 252, atk: 252, def: 6}})).candidate.max).toBeGreaterThan(0);
    expect(run(withTarget({ivs: {...target.ivs, hp: 0}, evs: {...target.evs, hp: 252}})).candidate.max).toBeGreaterThan(0);
  });

  it('recusa forma não normal, espécie, natureza e habilidade fora do catálogo', () => {
    expect(() => run(withTarget({formId: 'alola'}))).toThrow('Cálculo real: request.target.formId');
    expect(() => run(withTarget({speciesId: 'cobblemon:inexistente'}))).toThrow('Cálculo real: request.target.speciesId');
    expect(() => run(withTarget({speciesId: ''}))).toThrow('Cálculo real: request.target.speciesId');
    expect(() => run(withTarget({nature: 'cobblemon:inexistente'}))).toThrow('Cálculo real: request.target.nature');
    expect(() => run(withTarget({ability: 'outro:synchronize'}))).toThrow(
      'Cálculo real: request.target.ability usa um namespace sem mapeamento',
    );
    expect(() => run(withTarget({ability: 'cobblemon:overgrow'}))).toThrow('Cálculo real: request.target.ability não está mapeada');
    expect(() => run(withTarget({ability: ''}))).toThrow('Cálculo real: request.target.ability');
  });

  it('aceita ID sem namespace com o mesmo resultado do ID com namespace', () => {
    const plain = run(withTarget({ability: 'synchronize', nature: 'modest'}));
    const namespaced = run(withTarget({ability: 'cobblemon:synchronize', nature: 'cobblemon:modest'}));
    expect(plain.candidate).toEqual(namespaced.candidate);
    expect(plain.current).toEqual(namespaced.current);
  });

  it('exige cada confirmação de cenário e recusa chave extra', () => {
    for (const key of Object.keys(makeRequest().assumptions)) {
      const assumptions = {...makeRequest().assumptions, [key]: false};
      expect(() => run({assumptions})).toThrow(`Cálculo real: request.assumptions.${key}`);
    }
    expect(() => run({assumptions: {...makeRequest().assumptions, extra: true}})).toThrow('Cálculo real: request.assumptions.extra');
  });
});

describe('fontes e frescor do snapshot', () => {
  const run = (sources, snapshot = makeSnapshot()) => calculateRealDamage(snapshot, makeRequest({sources}));
  const [party, pc] = sourceHashes;

  it('exige exatamente party e PC, sem repetição, tipo desconhecido ou chave extra', () => {
    expect(() => run([party])).toThrow('Cálculo real: request.sources');
    expect(() => run([party, pc, pc])).toThrow('Cálculo real: request.sources');
    expect(() => run('x')).toThrow('Cálculo real: request.sources');
    expect(() => run(null)).toThrow('Cálculo real: request.sources');
    expect(() => run([party, {...pc, kind: 'outro'}])).toThrow('Cálculo real: request.sources[1].kind');
    expect(() => run([party, {...party}])).toThrow('Cálculo real: request.sources[1].kind');
    expect(() => run([party, {...pc, extra: 1}])).toThrow('Cálculo real: request.sources[1].extra');
  });

  it.each([
    ['63 caracteres', 'a'.repeat(63)],
    ['caractere fora de hexadecimal', 'g'.repeat(64)],
    ['65 caracteres', `${'a'.repeat(64)}b`],
    ['prefixo extra', `x${'a'.repeat(64)}`],
    ['maiúsculas', 'A'.repeat(64)],
    ['não texto', 5],
  ])('recusa SHA-256 com %s', (_label, sha256) => {
    expect(() => run([{...party, sha256}, pc])).toThrow('Cálculo real: request.sources[0].sha256');
  });

  it('aceita as fontes em qualquer ordem e responde na ordem party, PC', () => {
    const result = run([pc, party]);
    expect(result.snapshot.sources.map((source) => source.kind)).toEqual(['party', 'pc']);
  });

  it('recusa snapshot sem fontes, com fontes incompletas ou com hash diferente', () => {
    const snapshot = makeSnapshot();
    expect(() => run(sourceHashes, {...snapshot, sources: null})).toThrow('Cálculo real: snapshot.sources');
    expect(() => run(sourceHashes, {...snapshot, sources: snapshot.sources.slice(0, 1)})).toThrow('Cálculo real: snapshot.sources');
    const changed = {...snapshot, sources: [{...snapshot.sources[0], sha256: 'c'.repeat(64)}, snapshot.sources[1]]};
    expect(() => run(sourceHashes, changed)).toThrow('Cálculo real: snapshot mudou');
    const changedPc = {...snapshot, sources: [snapshot.sources[0], {...snapshot.sources[1], sha256: 'c'.repeat(64)}]};
    expect(() => run(sourceHashes, changedPc)).toThrow('Cálculo real: snapshot mudou');
  });

  it('assertFreshSources devolve as fontes na ordem party, PC', () => {
    expect(assertFreshSources([pc, party], [pc, party])).toEqual([party, pc]);
  });
});

describe('perfil do indivíduo que ataca', () => {
  const run = (mutate, patch = {}) => {
    const individual = makeIndividual();
    mutate(individual);
    return calculateRealDamage(makeSnapshot(individual), makeRequest(patch));
  };
  const known = (value) => fact(value);

  it('recusa forma, nível e observações ausentes ou inválidos', () => {
    expect(() => run((a) => (a.formId = 'alola'))).toThrow('Cálculo real: actor.formId');
    expect(() => run((a) => delete a.formId)).toThrow('Cálculo real: actor.formId');
    expect(() => run((a) => (a.speciesId = 'cobblemon:inexistente'))).toThrow('Cálculo real: actor.speciesId');
    expect(() => run((a) => (a.level = null))).toThrow('Cálculo real: actor.level não foi capturado');
    expect(() => run((a) => (a.level = 1.5))).toThrow('Cálculo real: actor.level');
    expect(() => run((a) => (a.level = 0))).toThrow('Cálculo real: actor.level precisa ser inteiro entre 1 e 100');
    expect(() => run((a) => (a.level = 101))).toThrow('Cálculo real: actor.level precisa ser inteiro entre 1 e 100');
    expect(() => run((a) => (a.observed = null))).toThrow('Cálculo real: actor.observed não foi capturado');
    expect(() => run((a) => (a.observed.nature = ''))).toThrow('Cálculo real: actor.observed.nature');
    expect(() => run((a) => (a.observed.nature = 'cobblemon:inexistente'))).toThrow('Cálculo real: actor.observed.nature');
    expect(() => run((a) => (a.observed.ability = ''))).toThrow('Cálculo real: actor.observed.ability');
    expect(() => run((a) => (a.observed.ability = 'cobblemon:blaze'))).toThrow('Cálculo real: actor.observed.ability não está mapeada');
    expect(() => run((a) => (a.observed.heldItem = 'cobblemon:item_inexistente'))).toThrow(
      'Cálculo real: actor.observed.heldItem está fora do subconjunto',
    );
    // Ids que coincidem com propriedades de Object.prototype não podem virar item nem golpe do catálogo.
    expect(() => run((a) => (a.observed.heldItem = 'cobblemon:constructor'))).toThrow(
      'Cálculo real: actor.observed.heldItem está fora do subconjunto',
    );
  });

  it('aceita nível 1 e 100 do indivíduo', () => {
    expect(run((a) => (a.level = 1)).actor.level).toBe(1);
    expect(run((a) => (a.level = 100)).actor.level).toBe(100);
  });

  it('recusa Hyper Training desconhecido e IV desconhecido sem Hyper Training', () => {
    expect(() => run((a) => (a.battleStats.hyperTrainedIvs.hp = {state: 'unknown'}))).toThrow(
      'Cálculo real: actor.battleStats.hyperTrainedIvs.hp é desconhecido',
    );
    expect(() => run((a) => delete a.battleStats.hyperTrainedIvs)).toThrow('Cálculo real: actor.battleStats.hyperTrainedIvs.hp');
    expect(() => run((a) => (a.battleStats.ivs.hp = {state: 'unknown'}))).toThrow('Cálculo real: actor.battleStats.ivs.hp é desconhecido');
    expect(() => run((a) => delete a.battleStats.ivs.hp)).toThrow('Cálculo real: actor.battleStats.ivs.hp');
    expect(() => run((a) => (a.battleStats.ivs.hp = known(32)))).toThrow('Cálculo real: actor.battleStats.effectiveIvs.hp');
    expect(() => run((a) => (a.battleStats = null))).toThrow('Cálculo real: actor.battleStats');
  });

  it('o IV de Hyper Training vence o IV base quando conhecido', () => {
    const baseline = run(() => {});
    const overrideWins = run((a) => {
      a.battleStats.ivs.atk = known(0);
      a.battleStats.hyperTrainedIvs.atk = known(31);
    });
    const lowered = run((a) => {
      a.battleStats.hyperTrainedIvs.atk = known(0);
    });
    expect(overrideWins.candidate).toEqual(baseline.candidate);
    expect(lowered.candidate.max).toBeLessThan(baseline.candidate.max);
    expect(run((a) => (a.battleStats.ivs.atk = known(0))).candidate.max).toBeLessThan(baseline.candidate.max);
  });

  it('exige EVs conhecidos, até 252 cada e soma até 510', () => {
    expect(() => run((a) => delete a.battleStats.evs.spe)).toThrow('Cálculo real: actor.battleStats.evs.spe não foi capturado');
    expect(() => run((a) => (a.battleStats.evs.spe = {state: 'unknown'}))).toThrow(
      'Cálculo real: actor.battleStats.evs.spe é desconhecido',
    );
    expect(() => run((a) => (a.battleStats.evs.spe = known(253)))).toThrow('Cálculo real: actor.battleStats.evs.spe');
    expect(() => run((a) => (a.battleStats.evs.spe = known(-1)))).toThrow('Cálculo real: actor.battleStats.evs.spe');
    expect(() => run((a) => (a.battleStats.evs = null))).toThrow('Cálculo real: actor.battleStats.evs');
    const evs = (a, list) => {
      for (const [index, stat] of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].entries()) a.battleStats.evs[stat] = known(list[index]);
    };
    expect(() => run((a) => evs(a, [252, 252, 7, 0, 0, 0]))).toThrow('Cálculo real: actor.battleStats.evs a soma excede 510');
    expect(run((a) => evs(a, [252, 252, 6, 0, 0, 0])).candidate.max).toBeGreaterThan(0);
  });

  it('exige listas de golpes conhecidas e um golpe equipado', () => {
    expect(() => run((a) => (a.equippedMovesKnown = false))).toThrow('Cálculo real: actor.moves');
    expect(() => run((a) => (a.learnedMovesKnown = false))).toThrow('Cálculo real: actor.moves');
    expect(() => run((a) => (a.equippedMoves = []))).toThrow('Cálculo real: actor.equippedMoves');
    expect(() => run((a) => (a.equippedMoves = null))).toThrow('Cálculo real: actor.equippedMoves');
    expect(() => run((a) => (a.learnedMoves = null))).toThrow('Cálculo real: actor.learnedMoves');
    expect(() => run((a) => (a.equippedMoves = [{id: ''}]))).toThrow('Cálculo real: actor.equippedMoves[0].id');
  });

  it('o golpe candidato precisa ser aprendido, não equipado e estar no catálogo', () => {
    const learnsTackle = (a) => (a.learnedMoves = [{id: 'cobblemon:tackle', ppUps: 0}]);
    expect(() => run(learnsTackle, {candidateMoveId: 'cobblemon:tackle'})).toThrow('precisa ser um golpe aprendido ainda não equipado');
    expect(() =>
      run((a) => {
        a.equippedMoves = [...a.equippedMoves, {id: 'cobblemon:seedbomb', pp: 10, ppUps: 0}];
      }),
    ).toThrow('precisa ser um golpe aprendido ainda não equipado');
    expect(() => run(() => {}, {candidateMoveId: 'cobblemon:earthquake'})).toThrow('não foi observado como aprendido');
    expect(() => run((a) => (a.learnedMoves = [{id: 'cobblemon:fakeout', ppUps: 0}]), {candidateMoveId: 'cobblemon:fakeout'})).toThrow(
      'Cálculo real: request.candidateMoveId está fora do subconjunto',
    );
    expect(() => run((a) => (a.equippedMoves = [{id: 'cobblemon:fakeout', pp: 10, ppUps: 0}]))).toThrow(
      'Cálculo real: actor.equippedMoves[0].id está fora do subconjunto',
    );
    expect(() => run(() => {}, {candidateMoveId: ''})).toThrow('Cálculo real: request.candidateMoveId');
  });
});

describe('motor de dano e saída', () => {
  const calcModule = require('@smogon/calc');
  const request = makeRequest();
  const roll16 = Array.from({length: 16}, (_, index) => index + 1);
  const withSpy = (implementation, body) => {
    const spy = vi.spyOn(calcModule, 'calculate').mockImplementation(implementation);
    try {
      return body(spy);
    } finally {
      spy.mockRestore();
    }
  };

  it('resume os 16 rolls pelo mínimo, máximo e HP do alvo', () => {
    withSpy(
      () => ({damage: roll16}),
      (spy) => {
        const result = calculateRealDamage(makeSnapshot(), request);
        const abra = new calcModule.Pokemon(9, 'Abra', {
          level: 25,
          nature: 'Modest',
          ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
          evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
        });
        for (const side of [result.current, result.candidate]) {
          expect(side.min).toBe(1);
          expect(side.max).toBe(16);
          expect(side.rollCount).toBe(16);
          expect(side.targetHP).toBe(abra.stats.hp);
        }
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls[0][0]).toBe(9);
        expect(spy.mock.calls[0][3].name).toBe('Tackle');
        expect(spy.mock.calls[1][3].name).toBe('Seed Bomb');
      },
    );
  });

  it('trata dano exatamente 0 como imunidade e recusa qualquer outro formato', () => {
    withSpy(
      () => ({damage: 0}),
      () => {
        const result = calculateRealDamage(makeSnapshot(), request);
        expect(result.current).toMatchObject({min: 0, max: 0, rollCount: 16});
        expect(result.candidate).toMatchObject({min: 0, max: 0, rollCount: 16});
      },
    );
    withSpy(
      () => ({damage: 7}),
      () => {
        const result = calculateRealDamage(makeSnapshot(), request);
        expect(result.current).toMatchObject({min: 7, max: 7, rollCount: 16});
      },
    );
    const invalid = [[...roll16.slice(0, 15), -1], [...roll16.slice(0, 15), 1.5], [], null, undefined, '0', [roll16, [1]]];
    for (const damage of invalid) {
      withSpy(
        () => ({damage}),
        () =>
          expect(() => calculateRealDamage(makeSnapshot(), request)).toThrow(
            'Cálculo real: actor.equippedMoves[0].id o motor não retornou os 16 rolls',
          ),
      );
    }
  });

  it('embrulha recusas do motor e preserva erros do próprio adaptador', () => {
    withSpy(
      () => {
        throw new Error('x');
      },
      () => expect(() => calculateRealDamage(makeSnapshot(), request)).toThrow('o motor revisado recusou a entrada (x)'),
    );
    withSpy(
      () => {
        throw new TypeError('y');
      },
      () => expect(() => calculateRealDamage(makeSnapshot(), request)).toThrow('o motor revisado recusou a entrada (y)'),
    );
    withSpy(
      () => {
        throw new Error('Cálculo real: falso');
      },
      () => expect(() => calculateRealDamage(makeSnapshot(), request)).toThrow('o motor revisado recusou a entrada (Cálculo real: falso)'),
    );
    withSpy(
      () => {
        throw new TypeError('Cálculo real: original');
      },
      () => expect(() => calculateRealDamage(makeSnapshot(), request)).toThrow(/^Cálculo real: original$/),
    );
  });

  it('imunidade real: golpe Normal contra Fantasma dá 0–0 e o outro golpe continua calculando', () => {
    const result = calculateRealDamage(
      makeSnapshot(),
      makeRequest({target: {...request.target, speciesId: 'cobblemon:gengar', ability: 'cobblemon:cursedbody'}}),
    );
    expect(result.current).toMatchObject({min: 0, max: 0, rollCount: 16});
    expect(result.candidate.max).toBeGreaterThan(0);
    expect(result.candidate.min).toBeLessThanOrEqual(result.candidate.max);
  });

  it('devolve ruleset, fontes, escopo e identificação completos sem compartilhar referências', () => {
    const snapshot = makeSnapshot();
    const result = calculateRealDamage(snapshot, request);
    expect(result.ruleset).toEqual({
      id: COMPATIBILITY.ruleset.id,
      cobblemonVersion: COMPATIBILITY.ruleset.cobblemonVersion,
      showdownVersion: COMPATIBILITY.ruleset.showdownVersion,
      calcVersion: '0.11.0',
      adapterVersion: 'real-damage-adapter-v11',
      sourceSha256: COMPATIBILITY.ruleset.sourceSha256,
    });
    expect(result.ruleset.sourceSha256).not.toBe(COMPATIBILITY.ruleset.sourceSha256);
    expect(result.snapshot).toEqual({
      capturedAt: snapshot.capturedAt,
      worldName: snapshot.worldName,
      sources: snapshot.sources.map(({kind, sha256, modifiedAt}) => ({kind, sha256, modifiedAt})),
    });
    expect(result.individualUuid).toBe(request.individualUuid);
    expect(result.actor).toEqual({speciesId: 'cobblemon:bulbasaur', level: 30, heldItem: null, currentSlotIndex: 0});
    expect(result.target).toEqual({speciesId: 'cobblemon:abra', formId: 'normal', level: 25});
    expect(result.scope).toEqual({
      generation: 9,
      format: 'singles',
      actions: 1,
      damageOnSuccessfulHitOnly: true,
      rolls: 16,
      rollSummary: 'minimum-and-maximum',
      assumptions: {
        rulesetMatchesActiveWorld: true,
        actorBaselineConfirmed: true,
        actorFullHpConfirmed: true,
        targetBaselineConfirmed: true,
        fieldBaselineConfirmed: true,
      },
    });
  });

  it('a impressão digital independe da ordem das chaves e muda com qualquer dado do alvo', () => {
    const baseline = calculateRealDamage(makeSnapshot(), request).inputDigest;
    const t = request.target;
    const reordered = {
      evs: {spe: 0, spd: 0, spa: 0, def: 0, atk: 0, hp: 0},
      ivs: {spe: 31, spd: 31, spa: 31, def: 31, atk: 31, hp: 31},
      ability: t.ability,
      nature: t.nature,
      level: t.level,
      formId: t.formId,
      speciesId: t.speciesId,
    };
    expect(calculateRealDamage(makeSnapshot(), makeRequest({target: reordered})).inputDigest).toBe(baseline);
    const evChanged = makeRequest({target: {...t, evs: {...t.evs, hp: 4}}});
    expect(calculateRealDamage(makeSnapshot(), evChanged).inputDigest).not.toBe(baseline);
    const levelChanged = makeRequest({target: {...t, level: 26}});
    expect(calculateRealDamage(makeSnapshot(), levelChanged).inputDigest).not.toBe(baseline);
  });
});

describe('guardas de carga do adaptador', () => {
  const adapterPath = require.resolve('../electron/lib/real-damage.cjs');
  const catalogPath = require.resolve('../electron/lib/combat-compatibility.json');
  const calcPackagePath = require.resolve('@smogon/calc/package.json');

  function loadWith(path, exports) {
    const saved = new Map([adapterPath, path].map((entry) => [entry, require.cache[entry]]));
    try {
      delete require.cache[adapterPath];
      require.cache[path] = {id: path, filename: path, loaded: true, exports, children: [], paths: []};
      return require(adapterPath);
    } finally {
      for (const [entry, cached] of saved) {
        if (cached) require.cache[entry] = cached;
        else delete require.cache[entry];
      }
    }
  }
  const catalogWith = (patch) => ({...COMPATIBILITY, ...patch, ruleset: {...COMPATIBILITY.ruleset, ...(patch.ruleset ?? {})}});

  it('recusa catálogo com outro ruleset ou outro schema', () => {
    expect(() => loadWith(catalogPath, catalogWith({ruleset: {id: 'outro'}}))).toThrow(/not a reviewed version/);
    expect(() => loadWith(catalogPath, catalogWith({schemaVersion: 1}))).toThrow(/not a reviewed version/);
  });

  it('recusa versão do @smogon/calc ou do catálogo diferente da fixada', () => {
    expect(() => loadWith(catalogPath, catalogWith({ruleset: {calcVersion: '0.0.0'}}))).toThrow(/requires @smogon\/calc/);
    expect(() => loadWith(calcPackagePath, {version: '0.0.0'})).toThrow(/requires @smogon\/calc/);
  });

  it('carrega normalmente com os arquivos reais', () => {
    expect(loadWith(catalogPath, COMPATIBILITY).ADAPTER_VERSION).toBe('real-damage-adapter-v11');
  });
});
