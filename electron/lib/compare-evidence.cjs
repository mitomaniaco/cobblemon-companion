'use strict';

// Pure evidence consumer: no save access, mechanics, candidate search or UI text.
const {isDeepStrictEqual} = require('node:util');

function requireValue(ok, path) {
  if (!ok) throw new TypeError(`Invalid comparison input: ${path}`);
}
function text(value, path) {
  requireValue(typeof value === 'string' && value.trim().length > 0, path);
}
function strings(value, path) {
  requireValue(Array.isArray(value), path);
  value.forEach((s, i) => text(s, `${path}[${i}]`));
  requireValue(new Set(value).size === value.length, `${path}: duplicates`);
}
function record(value, path) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path);
}
function build(value, path) {
  record(value, path);
  text(value.id, `${path}.id`);
  strings(value.moves, `${path}.moves`);
  requireValue(value.moves.length <= 4, `${path}.moves: at most four`);
}

/**
 * Contract v1 compares exactly two builds, on the SAME declared context.
 * Outcomes must include every declared metric; missing outcomes are not zero.
 * Conditions express unresolved assumptions, not probabilistic confidence.
 * completeCoverage is a caller assertion, not certified by this consumer.
 */
function compareEvidence(input) {
  record(input, 'input');
  requireValue(input.schemaVersion === 1, 'schemaVersion');
  build(input.current, 'current');
  build(input.candidate, 'candidate');
  requireValue(input.current.id !== input.candidate.id, 'distinct build ids');
  strings(input.learnedMoves, 'learnedMoves');
  strings(input.lockedMoves, 'lockedMoves');
  input.lockedMoves.forEach(m => requireValue(input.current.moves.includes(m), 'locked move not current'));
  record(input.scope, 'scope');
  for (const k of ['id', 'snapshotId', 'individualId', 'objective', 'provenance']) text(input.scope[k], `scope.${k}`);
  strings(input.scope.assumptions, 'scope.assumptions');
  strings(input.scope.conditions, 'scope.conditions');
  strings(input.scope.blockers, 'scope.blockers');
  strings(input.scope.requiredEvidenceIds, 'scope.requiredEvidenceIds');
  requireValue(typeof input.scope.completeCoverage === 'boolean', 'scope.completeCoverage');
  requireValue(Number.isInteger(input.scope.requiredHorizon) && input.scope.requiredHorizon > 0, 'scope.requiredHorizon');
  requireValue(Number.isInteger(input.scope.evaluatedHorizon) && input.scope.evaluatedHorizon >= 0, 'scope.evaluatedHorizon');
  if (input.scope.actionTraceUnit !== undefined) {
    requireValue(['turns', 'events'].includes(input.scope.actionTraceUnit),
      'scope.actionTraceUnit');
  }
  record(input.metrics, 'metrics');
  const metricIds = Object.keys(input.metrics);
  requireValue(metricIds.length > 0, 'metrics: empty');
  for (const id of metricIds) {
    text(id, 'metric id');
    requireValue(['higher', 'lower'].includes(input.metrics[id]), `metrics.${id}`);
  }
  requireValue(Array.isArray(input.evidence), 'evidence');
  const seen = new Set();
  const facts = [];
  for (const e of input.evidence) {
    record(e, 'evidence row');
    for (const k of ['id', 'target', 'condition']) text(e[k], `evidence.${k}`);
    requireValue(!seen.has(e.id), 'duplicate evidence id');
    requireValue(input.scope.requiredEvidenceIds.includes(e.id), 'undeclared evidence id');
    seen.add(e.id);
    record(e.initialState, 'initialState');
    for (const side of ['current', 'candidate']) {
      const outcome = e[side];
      record(outcome, side);
      requireValue(outcome.buildId === input[side].id, `${side}.buildId`);
      record(outcome.context, `${side}.context`);
      requireValue(isDeepStrictEqual(outcome.context, {
        scopeId: input.scope.id, snapshotId: input.scope.snapshotId,
        individualId: input.scope.individualId, initialState: e.initialState,
        horizon: input.scope.evaluatedHorizon,
      }), `${side}.context mismatch`);
      requireValue(Array.isArray(outcome.actions), `${side}.actions`);
      outcome.actions.forEach(action => text(action, `${side}.action`));
      if (input.scope.actionTraceUnit === 'turns') {
        requireValue(outcome.actions.length === input.scope.evaluatedHorizon,
          `${side}.actions: length must equal evaluated horizon for turn traces`);
      }
      record(outcome.values, `${side}.values`);
      requireValue(isDeepStrictEqual(Object.keys(outcome.values).sort(), [...metricIds].sort()), `${side}.metric coverage`);
      for (const id of metricIds) requireValue(Number.isFinite(outcome.values[id]), `${side}.${id}: finite number`);
    }
    for (const metric of metricIds) {
      const before = e.current.values[metric], after = e.candidate.values[metric];
      const sign = after === before ? 0 : after > before ? 1 : -1;
      const direction = sign * (input.metrics[metric] === 'higher' ? 1 : -1);
      facts.push({evidenceId: e.id, target: e.target, condition: e.condition,
        metric, before, after, effect: direction > 0 ? 'gain' : direction < 0 ? 'loss' : 'equal'});
    }
  }

  // A move absent from the learned-move catalog can still be directly usable
  // when it is already equipped on the observed individual. This preserves
  // the observed state without treating a newly introduced, unlearned move
  // as available.
  const requirements = input.candidate.moves.filter(m =>
    !input.learnedMoves.includes(m) && !input.current.moves.includes(m));
  const missingLocked = input.lockedMoves.filter(m => !input.candidate.moves.includes(m));
  const missingEvidence = input.scope.requiredEvidenceIds.filter(id => !seen.has(id));
  const blockers = [...input.scope.blockers];
  if (!input.scope.completeCoverage) blockers.push('partial-coverage');
  if (input.scope.evaluatedHorizon < input.scope.requiredHorizon) blockers.push('insufficient-horizon');
  if (!input.scope.requiredEvidenceIds.length || !input.evidence.length) blockers.push('no-evidence');
  if (missingEvidence.length) blockers.push('missing-evidence');
  const gains = facts.filter(f => f.effect === 'gain');
  const losses = facts.filter(f => f.effect === 'loss');
  let status, reason, preferredBuildId = null;
  if (requirements.length || missingLocked.length) {
    status = 'inconclusivo'; reason = 'candidate-ineligible';
  } else if (blockers.length) {
    status = 'inconclusivo'; reason = 'insufficient-evidence';
  } else if (input.scope.conditions.length || (gains.length && losses.length)) {
    status = 'condicional'; reason = input.scope.conditions.length ? 'unresolved-conditions' : 'tradeoff';
  } else if (gains.length) {
    status = 'preferencia-no-recorte'; reason = 'improvement-without-observed-loss';
    preferredBuildId = input.candidate.id;
  } else {
    status = 'manter'; reason = losses.length ? 'candidate-worse-in-scope' : 'equivalent-in-scope';
    preferredBuildId = input.current.id;
  }
  // Returned objects never share mutable state with the caller's observed build.
  return structuredClone({schemaVersion: 1, policyVersion: 'pairwise-evidence-v1',
    status, reason, preferredBuildId, usableNow: requirements.length === 0 && missingLocked.length === 0,
    requirements: requirements.map(move => ({move, availability: 'not-confirmed-learned'})),
    missingLocked, blockers: [...new Set(blockers)], missingEvidence,
    scope: input.scope, current: input.current, candidate: input.candidate,
    changes: {added: input.candidate.moves.filter(m => !input.current.moves.includes(m)),
      removed: input.current.moves.filter(m => !input.candidate.moves.includes(m)),
      retained: input.current.moves.filter(m => input.candidate.moves.includes(m))},
    explanation: {evidenceIds: [...seen], gains, losses,
      unchanged: facts.filter(f => f.effect === 'equal'), conditions: input.scope.conditions},
    evidence: input.evidence,
  });
}

module.exports = {compareEvidence};

