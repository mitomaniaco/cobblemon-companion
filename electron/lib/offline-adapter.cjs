'use strict';

// Deliberately small offline bridge. It accepts a versioned fixture-shaped
// snapshot, validates the existing preflight contract, runs one supported
// @smogon/calc roll, and feeds the result to the existing evidence consumer.
// It does not read saves, import mod scripts, simulate turns, or search builds.
const crypto = require('node:crypto');
const calc = require('@smogon/calc');
const calcPackage = require('@smogon/calc/package.json');
const {validatePreflight, makeAnalysisRef, assessFreshness} = require('./preflight-contracts.cjs');
const {compareEvidence} = require('./compare-evidence.cjs');

const CALC_VERSION = calcPackage.version;
if (CALC_VERSION !== '0.11.0') {
  throw new Error(`Offline adapter: reviewed @smogon/calc must be version 0.11.0, found ${CALC_VERSION}`);
}
const ENGINE_VERSION = `offline-smogon-calc-${CALC_VERSION}/adapter-v2`;
const STATS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
const CALC_SPECIES = Object.freeze({
  'cobblemon:pikachu': 'Pikachu',
  'cobblemon:floatzel': 'Floatzel',
});
const CALC_MOVES = Object.freeze({
  'cobblemon:spark': 'Spark',
  'cobblemon:thunderbolt': 'Thunderbolt',
});

function fail(pathName, message) {
  throw new TypeError(`Offline adapter: ${pathName} ${message}`);
}

function record(value, pathName) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(pathName, 'must be an object');
  }
}

function own(value, key) {
  return Object.hasOwn(value, key);
}

function keys(value, allowed, pathName) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${pathName}.${key}`, 'is not supported by this adapter');
  }
}

function text(value, pathName) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(pathName, 'must be non-empty text');
}

function integer(value, pathName, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(pathName, 'must be an integer in the supported range');
}

function clone(value) {
  return structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function fact(raw, sourceId, pathName) {
  if (recordLike(raw) && own(raw, 'unknown')) {
    keys(raw, ['unknown'], pathName);
    text(raw.unknown, `${pathName}.unknown`);
    return {state: 'unknown', reason: raw.unknown, provenance: {kind: 'offline-reconstruction', sourceId}};
  }
  return {state: 'known', value: raw, provenance: {kind: 'offline-reconstruction', sourceId}};
}

function recordLike(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function statFacts(raw, sourceId, pathName) {
  record(raw, pathName);
  keys(raw, STATS, pathName);
  return Object.fromEntries(STATS.map((stat) => [stat, fact(raw[stat], sourceId, `${pathName}.${stat}`)]));
}

function moveEntry(raw, sourceId, pathName, equipped) {
  record(raw, pathName);
  keys(raw, equipped ? ['id', 'pp', 'ppUps'] : ['id', 'ppUps'], pathName);
  text(raw.id, `${pathName}.id`);
  const entry = {id: raw.id, sourceId};
  if (equipped) entry.pp = fact(raw.pp, sourceId, `${pathName}.pp`);
  entry.ppUps = fact(raw.ppUps, sourceId, `${pathName}.ppUps`);
  return entry;
}

function adaptIndividual(raw, snapshotSourceId) {
  record(raw, 'individual');
  keys(raw, ['uuid', 'speciesId', 'formId', 'aspects', 'location', 'sourceId', 'observed', 'planned'], 'individual');
  text(raw.uuid, 'individual.uuid');
  text(raw.speciesId, 'individual.speciesId');
  text(raw.formId, 'individual.formId');
  if (!Array.isArray(raw.aspects)) fail('individual.aspects', 'must be an array');
  if (raw.formId !== 'normal' || raw.aspects.length !== 0) {
    fail('individual.formId', 'only the normal form without aspects is supported');
  }
  text(raw.sourceId, 'individual.sourceId');
  if (raw.sourceId !== snapshotSourceId) fail('individual.sourceId', 'must match the fixture snapshot source');

  record(raw.observed, 'individual.observed');
  keys(
    raw.observed,
    [
      'level',
      'nature',
      'originalNature',
      'ability',
      'heldItem',
      'friendship',
      'savedHealth',
      'savedStatus',
      'teraType',
      'ivs',
      'evs',
      'moves',
    ],
    'individual.observed',
  );
  record(raw.observed.moves, 'individual.observed.moves');
  keys(raw.observed.moves, ['equipped', 'learned'], 'individual.observed.moves');
  if (!Array.isArray(raw.observed.moves.equipped) || !Array.isArray(raw.observed.moves.learned)) {
    fail('individual.observed.moves', 'equipped and learned must be arrays');
  }
  const observed = {
    sourceId: raw.sourceId,
    fields: {
      level: fact(raw.observed.level, raw.sourceId, 'individual.observed.level'),
      nature: fact(raw.observed.nature, raw.sourceId, 'individual.observed.nature'),
      originalNature: fact(raw.observed.originalNature, raw.sourceId, 'individual.observed.originalNature'),
      ability: fact(raw.observed.ability, raw.sourceId, 'individual.observed.ability'),
      heldItem: fact(raw.observed.heldItem, raw.sourceId, 'individual.observed.heldItem'),
      friendship: fact(raw.observed.friendship, raw.sourceId, 'individual.observed.friendship'),
      savedHealth: fact(raw.observed.savedHealth, raw.sourceId, 'individual.observed.savedHealth'),
      savedStatus: fact(raw.observed.savedStatus, raw.sourceId, 'individual.observed.savedStatus'),
      teraType: fact(raw.observed.teraType, raw.sourceId, 'individual.observed.teraType'),
      ivs: statFacts(raw.observed.ivs, raw.sourceId, 'individual.observed.ivs'),
      evs: statFacts(raw.observed.evs, raw.sourceId, 'individual.observed.evs'),
    },
    moves: {
      state: 'known',
      equipped: raw.observed.moves.equipped.map((move, index) =>
        moveEntry(move, raw.sourceId, `individual.observed.moves.equipped[${index}]`, true),
      ),
      learned: raw.observed.moves.learned.map((move, index) =>
        moveEntry(move, raw.sourceId, `individual.observed.moves.learned[${index}]`, false),
      ),
    },
  };

  record(raw.planned, 'individual.planned');
  keys(raw.planned, ['state', 'buildId', 'provenance', 'moves', 'item', 'notes'], 'individual.planned');
  const planned = clone(raw.planned);
  return {
    identity: {
      uuid: raw.uuid,
      speciesId: raw.speciesId,
      formId: raw.formId,
      aspects: clone(raw.aspects),
      sourceId: raw.sourceId,
    },
    location: clone(raw.location),
    observed,
    planned,
  };
}

function knownFact(value, pathName) {
  if (value?.state !== 'known') fail(pathName, 'is unknown; the supported calculation cannot invent it');
  return value.value;
}

function statValues(fields, name) {
  const facts = fields[name];
  return Object.fromEntries(STATS.map((stat) => [stat, knownFact(facts[stat], `observed.fields.${name}.${stat}`)]));
}

function calcName(table, id, pathName) {
  const name = table[id];
  if (!name) fail(pathName, `resource ${id} is outside the reviewed supported subset`);
  return name;
}

function entitySpec(raw, pathName) {
  record(raw, pathName);
  keys(raw, ['speciesId', 'level', 'nature', 'ivs', 'evs'], pathName);
  text(raw.speciesId, `${pathName}.speciesId`);
  integer(raw.level, `${pathName}.level`, 1, 100);
  text(raw.nature, `${pathName}.nature`);
  record(raw.ivs, `${pathName}.ivs`);
  record(raw.evs, `${pathName}.evs`);
  keys(raw.ivs, STATS, `${pathName}.ivs`);
  keys(raw.evs, STATS, `${pathName}.evs`);
  for (const stat of STATS) {
    integer(raw.ivs[stat], `${pathName}.ivs.${stat}`, 0, 31);
    integer(raw.evs[stat], `${pathName}.evs.${stat}`, 0, 252);
  }
  if (STATS.reduce((sum, stat) => sum + raw.evs[stat], 0) > 510) fail(`${pathName}.evs`, 'total exceeds 510');
  return clone(raw);
}

function pokemon(spec, pathName) {
  const species = calcName(CALC_SPECIES, spec.speciesId, `${pathName}.speciesId`);
  try {
    return new calc.Pokemon(9, species, {
      level: spec.level,
      nature: spec.nature,
      evs: spec.evs,
      ivs: spec.ivs,
    });
  } catch (error) {
    fail(pathName, `cannot be evaluated by reviewed @smogon/calc: ${error.message}`);
  }
}

function damage(attackerSpec, defenderSpec, moveId) {
  const moveName = calcName(CALC_MOVES, moveId, 'comparison.changedMove');
  const attacker = pokemon(attackerSpec, 'comparison.attacker');
  const defender = pokemon(defenderSpec, 'comparison.target');
  try {
    const result = calc.calculate(9, attacker, defender, new calc.Move(9, moveName));
    if (!Array.isArray(result.damage) || result.damage.length === 0 || !result.damage.every(Number.isFinite)) {
      fail('calculation', 'reviewed calculator returned no finite damage rolls');
    }
    return {
      targetHP: defender.stats.hp,
      attackerHP: attacker.stats.hp,
      rolls: [...result.damage],
      min: Math.min(...result.damage),
      max: Math.max(...result.damage),
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('Offline adapter:')) throw error;
    fail('calculation', `reviewed @smogon/calc rejected the supported input: ${error.message}`);
  }
}

function supportedCalculation(raw) {
  record(raw, 'calculation');
  keys(raw, ['individualId', 'generation', 'format', 'horizon', 'roll', 'target', 'lockedMoves'], 'calculation');
  if (raw.generation !== 9) fail('calculation.generation', 'only generation 9 is supported');
  if (raw.format !== 'singles') fail('calculation.format', 'only one-on-one singles is supported');
  if (raw.horizon !== 1) fail('calculation.horizon', 'only a one-action horizon is supported');
  if (raw.roll !== 'minimum') fail('calculation.roll', 'only the declared minimum roll is supported');
  if (!Array.isArray(raw.lockedMoves) || raw.lockedMoves.length === 0) {
    fail('calculation.lockedMoves', 'must declare retained moves');
  }
  return entitySpec(raw.target, 'calculation.target');
}

function unsupportedCombatConditions(fields) {
  const conditions = [];
  for (const [field, label] of [
    ['ability', 'ability'],
    ['heldItem', 'held-item'],
    ['savedStatus', 'saved-status'],
    ['teraType', 'tera-type'],
  ]) {
    const factValue = fields[field];
    if (factValue.state === 'unknown') {
      conditions.push(`unknown-${label}-excluded-from-calculation`);
    } else if (factValue.value !== null) {
      fail(`observed.fields.${field}`, 'known value is not supported by this calculation');
    }
  }
  return conditions;
}

function prepareOfflineInput(input) {
  record(input, 'input');
  keys(input, ['sources', 'snapshot', 'context', 'player', 'calculation'], 'input');
  const source = clone(input);
  record(source.snapshot, 'snapshot');
  keys(source.snapshot, ['id', 'kind', 'capturedAt', 'sourceIds', 'completeness', 'atomicity', 'fingerprint'], 'snapshot');
  if (!Array.isArray(source.sources) || source.sources.length === 0) fail('sources', 'must contain fixture sources');
  if (!Array.isArray(source.snapshot.sourceIds) || source.snapshot.sourceIds.length === 0) {
    fail('snapshot.sourceIds', 'must identify fixture sources');
  }
  const snapshotSourceId = source.snapshot.sourceIds[0];
  const individual = source.player?.individuals?.[0];
  if (!individual) fail('player.individuals', 'must contain the selected individual');
  const adaptedIndividual = adaptIndividual(individual, snapshotSourceId);
  const target = supportedCalculation(source.calculation);

  record(source.context, 'context');
  keys(source.context, ['state', 'trainerId', 'levelCap', 'allowedTypes', 'sourceIds'], 'context');
  record(source.player, 'player');
  keys(source.player, ['playerUuid', 'revision', 'individuals'], 'player');
  if (!Array.isArray(source.player.individuals) || source.player.individuals.length !== 1) {
    fail('player.individuals', 'this adapter selects exactly one fixture individual');
  }
  if (source.calculation.individualId !== undefined && source.calculation.individualId !== individual.uuid) {
    fail('calculation.individualId', 'does not match the selected individual');
  }

  const bundle = {
    format: 'cobblemon-companion/preflight',
    schemaVersion: 1,
    exportId: `offline-${source.snapshot.id}`,
    createdAt: source.snapshot.capturedAt,
    sources: source.sources,
    snapshot: source.snapshot,
    context: source.context,
    player: {
      playerUuid: source.player.playerUuid,
      revision: source.player.revision,
      individuals: [adaptedIndividual],
    },
    policy: {id: 'preflight-contract', version: '1.0.0'},
  };
  // The v1 digest already covers sources. Bind the calculation request through
  // a derived in-memory source, never claiming to hash an installed/game file.
  const requestId = 'offline-adapter:calculation-request-v2';
  const requestPath = 'memory:offline-adapter/calculation-request-v2';
  if (bundle.sources.some((s) => s.id === requestId || s.path === requestPath)) {
    fail('sources', 'reserved calculation request source');
  }
  const request = {engineVersion: ENGINE_VERSION, calculation: source.calculation};
  bundle.sources.push({
    id: requestId,
    kind: 'manual-observation',
    path: requestPath,
    sha256: digest(request),
    size: Buffer.byteLength(JSON.stringify(stable(request)), 'utf8'),
    modifiedAt: bundle.snapshot.capturedAt,
    sensitivity: 'private',
  });
  bundle.snapshot.sourceIds.push(requestId);
  return {checked: validatePreflight(bundle), source, individual, target};
}

// Always rebuild the derived source from the current request, not a caller's
// cached digest. This checks freshness without running the damage calculator.
function assessOfflineFreshness(reference, input) {
  const {checked} = prepareOfflineInput(input);
  return assessFreshness(reference, checked.bundle, {
    engineVersion: ENGINE_VERSION,
    policyVersion: checked.bundle.policy.version,
  });
}

function adaptOfflineComparison(input) {
  const {checked, source, individual, target} = prepareOfflineInput(input);
  const snapshotSourceId = source.snapshot.sourceIds[0];
  if (checked.summary.usableNowCount !== 1) {
    fail('planned', 'candidate build is not usable-now; unknown/future/unavailable access is not promoted');
  }

  const checkedIndividual = checked.bundle.player.individuals[0];
  if (checkedIndividual.planned.item != null) {
    fail('planned.item', 'planned items are outside the supported no-item calculation');
  }
  const currentMoves = checkedIndividual.observed.moves.equipped.map((move) => move.id);
  const candidateMoves = checkedIndividual.planned.moves.map((move) => move.id);
  const lockedMoves = clone(source.calculation.lockedMoves || []);
  if (!Array.isArray(lockedMoves) || lockedMoves.length === 0) fail('calculation.lockedMoves', 'must declare retained moves');
  if (currentMoves.length !== candidateMoves.length) fail('planned.moves', 'must retain the current move count');
  const changedIndexes = currentMoves.map((move, index) => (move !== candidateMoves[index] ? index : -1)).filter((index) => index !== -1);
  if (changedIndexes.length !== 1 || changedIndexes[0] !== 0) {
    fail('planned.moves', 'supported comparison changes only the calculated first move slot');
  }
  for (const move of lockedMoves) {
    if (!currentMoves.includes(move) || !candidateMoves.includes(move)) {
      fail('calculation.lockedMoves', `locked move ${move} is not retained by both builds`);
    }
  }

  const attacker = entitySpec(
    {
      speciesId: checkedIndividual.identity.speciesId,
      level: knownFact(checkedIndividual.observed.fields.level, 'observed.fields.level'),
      nature: knownFact(checkedIndividual.observed.fields.nature, 'observed.fields.nature'),
      ivs: statValues(checkedIndividual.observed.fields, 'ivs'),
      evs: statValues(checkedIndividual.observed.fields, 'evs'),
    },
    'comparison.attacker',
  );
  const conditions = unsupportedCombatConditions(checkedIndividual.observed.fields);
  const currentDamage = damage(attacker, target, currentMoves[0]);
  const candidateDamage = damage(attacker, target, candidateMoves[0]);
  if (currentDamage.targetHP !== candidateDamage.targetHP || currentDamage.attackerHP !== candidateDamage.attackerHP) {
    fail('calculation', 'paired builds did not share the same initial HP state');
  }

  const calculationInputDigest = digest({
    preflightInputDigest: checked.inputDigest,
    request: {
      individualId: source.calculation.individualId,
      generation: source.calculation.generation,
      format: source.calculation.format,
      horizon: source.calculation.horizon,
      roll: source.calculation.roll,
      target,
      lockedMoves,
      currentMoves,
      candidateMoves,
    },
  });

  const scope = {
    id: `offline-${source.snapshot.id}-${individual.uuid}`,
    snapshotId: source.snapshot.id,
    individualId: individual.uuid,
    objective: 'Compare the declared minimum damage roll for one changed move',
    provenance: `offline-reconstruction:${snapshotSourceId};sources:${source.snapshot.sourceIds.join(',')};reviewed-calc:${CALC_VERSION};calculation-input-sha256:${calculationInputDigest}`,
    assumptions: [
      'gen-9-singles-one-hit',
      'minimum-of-16-rolls',
      'no-ability-item-status-weather-terrain-or-boosts',
      'candidate-availability-comes-from-the-validated-individual',
    ],
    conditions,
    blockers: [],
    completeCoverage: true,
    requiredHorizon: 1,
    evaluatedHorizon: 1,
    actionTraceUnit: 'turns',
    requiredEvidenceIds: ['OFFLINE-ADAPTER-E1'],
  };
  const initialState = {
    playerHP: currentDamage.attackerHP,
    enemyHP: currentDamage.targetHP,
    damageRoll: 'minimum-of-16',
  };
  const context = () => ({
    scopeId: scope.id,
    snapshotId: scope.snapshotId,
    individualId: scope.individualId,
    initialState,
    horizon: scope.evaluatedHorizon,
  });
  const current = {id: `${individual.uuid}:current`, moves: currentMoves};
  const candidate = {id: checkedIndividual.planned.buildId, moves: candidateMoves};
  const comparisonInput = {
    schemaVersion: 1,
    current,
    candidate,
    learnedMoves: checkedIndividual.observed.moves.learned.map((move) => move.id),
    lockedMoves,
    scope,
    metrics: {enemyHP: 'lower'},
    evidence: [
      {
        id: 'OFFLINE-ADAPTER-E1',
        target: target.speciesId,
        condition: 'minimum-roll-no-secondary-effects',
        initialState,
        current: {
          buildId: current.id,
          context: context(),
          actions: [currentMoves[0]],
          values: {enemyHP: Math.max(0, currentDamage.targetHP - currentDamage.min)},
        },
        candidate: {
          buildId: candidate.id,
          context: context(),
          actions: [candidateMoves[0]],
          values: {enemyHP: Math.max(0, candidateDamage.targetHP - candidateDamage.min)},
        },
      },
    ],
  };
  const comparison = compareEvidence(comparisonInput);
  const analysisRef = makeAnalysisRef(checked.bundle, {
    analysisId: `${scope.id}:analysis`,
    engineVersion: ENGINE_VERSION,
  });
  const freshness = assessOfflineFreshness(analysisRef, input);

  return structuredClone({
    preflight: checked,
    analysisRef,
    freshness,
    calculation: {
      library: '@smogon/calc',
      version: CALC_VERSION,
      generation: 9,
      format: 'singles',
      roll: 'minimum',
      sourceIds: source.snapshot.sourceIds,
      inputDigest: calculationInputDigest,
      attacker,
      target,
      current: {moveId: currentMoves[0], ...currentDamage},
      candidate: {moveId: candidateMoves[0], ...candidateDamage},
    },
    comparison,
    explanation: comparison.explanation,
  });
}

module.exports = {ENGINE_VERSION, adaptOfflineComparison};
