'use strict';

const crypto = require('node:crypto');

const CONTRACT = Object.freeze({
  format: 'cobblemon-companion/preflight',
  schemaVersion: 1,
  limits: Object.freeze({
    maxBytes: 5 * 1024 * 1024,
    maxDepth: 32,
    maxString: 4096,
    maxArray: 2048,
    maxObjectKeys: 128,
    maxSources: 1024,
    maxIndividuals: 10000,
    maxLearnedMoves: 128,
  }),
});

const STAT_KEYS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
const CAPTURE_KINDS = Object.freeze(['live-capture', 'offline-reconstruction', 'synthetic-fixture']);
const SOURCE_KINDS = Object.freeze([
  'player-save', 'world-state', 'resource', 'ruleset', 'battle-log', 'manual-observation', 'fixture', 'export',
]);
const FACT_KINDS = Object.freeze([
  'save', 'ruleset', 'battle-observation', 'manual-observation', 'offline-reconstruction', 'synthetic-fixture',
]);
const ACCESS_NOW = Object.freeze(['equipped', 'learned', 'acquirable-now']);
const ACCESS_STATUSES = Object.freeze([...ACCESS_NOW, 'future', 'unknown', 'unavailable']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const RESOURCE_ID_RE = /^[a-z][a-z0-9_.-]*:[a-z0-9_./-]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function fail(path, message) {
  throw new TypeError(`Invalid preflight contract: ${path} ${message}`);
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, 'must be a plain JSON object');
}

function keys(value, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${path}.${key}`, 'unknown field');
}

function text(value, path, {max = CONTRACT.limits.maxString} = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'must be a non-empty string');
  if (value.length > max) fail(path, `exceeds ${max} characters`);
}

function integer(value, path, {min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER} = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `must be an integer from ${min} to ${max}`);
}

function array(value, path, {max = CONTRACT.limits.maxArray, min = 0} = {}) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  if (value.length < min || value.length > max) fail(path, `must contain ${min} to ${max} entries`);
}

function uniqueStrings(value, path, options) {
  array(value, path, options);
  const seen = new Set();
  value.forEach((item, index) => {
    text(item, `${path}[${index}]`);
    if (seen.has(item)) fail(`${path}[${index}]`, 'duplicates an earlier value');
    seen.add(item);
  });
}

function iso(value, path) {
  text(value, path, {max: 64});
  if (!ISO_RE.test(value) || Number.isNaN(Date.parse(value))) fail(path, 'must be an ISO-8601 UTC timestamp');
}

function resourceId(value, path) {
  text(value, path, {max: 256});
  if (!RESOURCE_ID_RE.test(value)) fail(path, 'must be a namespaced resource id');
}

function jsonValue(value, path, depth = 0, seen = new WeakSet()) {
  if (depth > CONTRACT.limits.maxDepth) fail(path, `exceeds depth ${CONTRACT.limits.maxDepth}`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && value.length > CONTRACT.limits.maxString) fail(path, 'string is too long');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'must be finite');
    return;
  }
  if (typeof value !== 'object') fail(path, 'must contain JSON values only');
  if (seen.has(value)) fail(path, 'contains a reference cycle');
  seen.add(value);
  if (Array.isArray(value)) {
    array(value, path);
    const names = Object.keys(value);
    const ownNames = Object.getOwnPropertyNames(value);
    if (Object.getOwnPropertySymbols(value).length > 0) fail(path, 'symbol properties are not allowed');
    for (const name of ownNames) {
      if (name === 'length') continue;
      if (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length || !names.includes(name)) fail(`${path}.${name}`, 'arrays may contain enumerable indexed JSON values only');
    }
    for (const name of names) {
      if (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length) fail(`${path}.${name}`, 'arrays may contain indexed JSON values only');
    }
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(`${path}[${index}]`, 'accessor or sparse array entry is not allowed');
      jsonValue(descriptor.value, `${path}[${index}]`, depth + 1, seen);
    }
  } else {
    record(value, path);
    const names = Object.keys(value);
    if (names.length > CONTRACT.limits.maxObjectKeys) fail(path, `exceeds ${CONTRACT.limits.maxObjectKeys} keys`);
    const ownNames = Object.getOwnPropertyNames(value);
    if (ownNames.length !== names.length || Object.getOwnPropertySymbols(value).length > 0) fail(path, 'non-enumerable or symbol properties are not allowed');
    names.forEach(name => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(`${path}.${name}`, 'accessor properties are not allowed');
      jsonValue(descriptor.value, `${path}.${name}`, depth + 1, seen);
    });
  }
  seen.delete(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceTable(sources) {
  array(sources, 'sources', {max: CONTRACT.limits.maxSources, min: 1});
  const table = new Map();
  const paths = new Set();
  sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    record(source, path);
    keys(source, ['id', 'kind', 'path', 'sha256', 'size', 'modifiedAt', 'sensitivity'], path);
    text(source.id, `${path}.id`, {max: 128});
    if (!SOURCE_KINDS.includes(source.kind)) fail(`${path}.kind`, 'is not a supported source kind');
    text(source.path, `${path}.path`, {max: 2048});
    if (paths.has(source.path)) fail(`${path}.path`, 'duplicates another source path');
    paths.add(source.path);
    if (!SHA256_RE.test(source.sha256 || '')) fail(`${path}.sha256`, 'must be a SHA-256 hex digest');
    integer(source.size, `${path}.size`, {min: 0, max: 1024 * 1024 * 1024});
    iso(source.modifiedAt, `${path}.modifiedAt`);
    if (!['private', 'redacted', 'public'].includes(source.sensitivity)) fail(`${path}.sensitivity`, 'is invalid');
    if (table.has(source.id)) fail(`${path}.id`, 'duplicates another source id');
    table.set(source.id, source);
  });
  return table;
}

function sourceId(value, path, sources) {
  text(value, path, {max: 128});
  if (!sources.has(value)) fail(path, 'does not reference a declared source');
}

function provenance(value, path, sources, {planned = false} = {}) {
  record(value, path);
  keys(value, ['kind', 'sourceId', 'note'], path);
  const allowed = planned ? ['user-plan'] : FACT_KINDS;
  if (!allowed.includes(value.kind)) fail(`${path}.kind`, planned ? 'must be user-plan' : 'is not an observation provenance');
  if (value.sourceId !== undefined) sourceId(value.sourceId, `${path}.sourceId`, sources);
  if (!planned && value.kind !== 'synthetic-fixture' && value.sourceId === undefined) {
    fail(path, 'observed provenance requires sourceId');
  }
  if (value.note !== undefined) text(value.note, `${path}.note`);
}

function fact(value, path, sources, {planned = false} = {}) {
  record(value, path);
  keys(value, ['state', 'value', 'reason', 'provenance', 'candidates'], path);
  if (!['known', 'unknown', 'conflict'].includes(value.state)) fail(`${path}.state`, 'must be known, unknown or conflict');
  provenance(value.provenance, `${path}.provenance`, sources, {planned});
  if (value.state === 'known') {
    if (!own(value, 'value') || value.value === undefined) fail(path, 'known facts require value');
    jsonValue(value.value, `${path}.value`);
    if (own(value, 'reason') || own(value, 'candidates')) fail(path, 'known facts cannot include reason/candidates');
  } else if (value.state === 'unknown') {
    if (own(value, 'value') || own(value, 'candidates')) fail(path, 'unknown facts cannot include value/candidates');
    text(value.reason, `${path}.reason`, {max: 1024});
  } else {
    if (own(value, 'value')) fail(path, 'conflicting facts cannot collapse to one value');
    text(value.reason, `${path}.reason`, {max: 1024});
    array(value.candidates, `${path}.candidates`, {min: 2, max: 8});
    value.candidates.forEach((candidate, index) => fact(candidate, `${path}.candidates[${index}]`, sources, {planned}));
  }
}

function statFacts(value, path, sources) {
  record(value, path);
  keys(value, STAT_KEYS, path);
  for (const stat of STAT_KEYS) fact(value[stat], `${path}.${stat}`, sources);
}

function moveId(value, path) {
  resourceId(value, path);
}

function moveEntry(value, path, sources, {equipped}) {
  record(value, path);
  const allowed = equipped ? ['id', 'sourceId', 'pp', 'ppUps'] : ['id', 'sourceId', 'ppUps'];
  keys(value, allowed, path);
  moveId(value.id, `${path}.id`);
  sourceId(value.sourceId, `${path}.sourceId`, sources);
  if (equipped) {
    fact(value.pp, `${path}.pp`, sources);
    if (value.pp.state === 'known') integer(value.pp.value, `${path}.pp.value`, {min: 0, max: 1024});
  }
  fact(value.ppUps, `${path}.ppUps`, sources);
  if (value.ppUps.state === 'known') integer(value.ppUps.value, `${path}.ppUps.value`, {min: 0, max: 16});
}

function validateMoves(value, path, sources) {
  record(value, path);
  keys(value, ['state', 'reason', 'equipped', 'learned'], path);
  if (!['known', 'unknown'].includes(value.state)) fail(`${path}.state`, 'must be known or unknown');
  if (value.state === 'unknown') {
    text(value.reason, `${path}.reason`, {max: 1024});
    if (own(value, 'equipped') || own(value, 'learned')) fail(path, 'unknown moves cannot include arrays');
    return {equipped: new Set(), learned: new Set(), known: false};
  }
  array(value.equipped, `${path}.equipped`, {max: 4});
  array(value.learned, `${path}.learned`, {max: CONTRACT.limits.maxLearnedMoves});
  const equipped = new Set();
  const learned = new Set();
  value.equipped.forEach((move, index) => {
    moveEntry(move, `${path}.equipped[${index}]`, sources, {equipped: true});
    if (equipped.has(move.id) || learned.has(move.id)) fail(`${path}.equipped[${index}].id`, 'duplicates another known move');
    equipped.add(move.id);
  });
  value.learned.forEach((move, index) => {
    moveEntry(move, `${path}.learned[${index}]`, sources, {equipped: false});
    if (equipped.has(move.id) || learned.has(move.id)) fail(`${path}.learned[${index}].id`, 'duplicates another known move');
    learned.add(move.id);
  });
  return {equipped, learned, known: true};
}

function validateAccess(value, path, sources, {item = false} = {}) {
  record(value, path);
  keys(value, ['status', 'route', 'requirements', 'evidenceIds', 'reason'], path);
  if (!ACCESS_STATUSES.includes(value.status)) fail(`${path}.status`, 'is invalid');
  if (value.route !== undefined && value.route !== null) text(value.route, `${path}.route`, {max: 128});
  if (value.requirements !== undefined) uniqueStrings(value.requirements, `${path}.requirements`, {max: 16});
  if (value.evidenceIds !== undefined) {
    uniqueStrings(value.evidenceIds, `${path}.evidenceIds`, {max: 32});
    value.evidenceIds.forEach((id, index) => sourceId(id, `${path}.evidenceIds[${index}]`, sources));
  }
  if (value.reason !== undefined && value.reason !== null) text(value.reason, `${path}.reason`, {max: 1024});
  const requirements = value.requirements || [];
  const evidenceIds = value.evidenceIds || [];
  if (value.status === 'acquirable-now') {
    text(value.route, `${path}.route`);
    if (evidenceIds.length === 0) fail(path, 'acquirable-now requires evidenceIds');
  }
  if (value.status === 'future') {
    if (requirements.length === 0) fail(path, 'future availability requires requirements');
  }
  if (value.status === 'unknown' || value.status === 'unavailable') {
    text(value.reason, `${path}.reason`);
  }
  if (item && value.status === 'learned') fail(`${path}.status`, 'items cannot be learned');
}

function validateIdentity(value, path, sources) {
  record(value, path);
  keys(value, ['uuid', 'speciesId', 'formId', 'aspects', 'sourceId'], path);
  if (!UUID_RE.test(value.uuid || '')) fail(`${path}.uuid`, 'must be a canonical UUID');
  resourceId(value.speciesId, `${path}.speciesId`);
  text(value.formId, `${path}.formId`, {max: 128});
  uniqueStrings(value.aspects, `${path}.aspects`, {max: 64});
  sourceId(value.sourceId, `${path}.sourceId`, sources);
}

function validateLocation(value, path) {
  record(value, path);
  keys(value, ['container', 'slot', 'box', 'boxName'], path);
  if (!['party', 'pc'].includes(value.container)) fail(`${path}.container`, 'must be party or pc');
  integer(value.slot, `${path}.slot`, {min: 0, max: value.container === 'party' ? 5 : 999});
  if (value.container === 'party') {
    if (own(value, 'box')) fail(path, 'party location cannot have box');
    if (own(value, 'boxName')) fail(path, 'party location cannot have boxName');
  } else {
    integer(value.box, `${path}.box`, {min: 0, max: 9999});
    if (value.boxName !== undefined && value.boxName !== null) text(value.boxName, `${path}.boxName`, {max: 256});
  }
}

function validateObserved(value, path, sources) {
  record(value, path);
  keys(value, ['sourceId', 'fields', 'moves'], path);
  sourceId(value.sourceId, `${path}.sourceId`, sources);
  record(value.fields, `${path}.fields`);
  const required = ['level', 'nature', 'originalNature', 'ability', 'heldItem', 'friendship', 'savedHealth', 'savedStatus', 'teraType', 'ivs', 'evs'];
  keys(value.fields, [...required, 'stats'], `${path}.fields`);
  for (const name of required) {
    if (!own(value.fields, name)) fail(`${path}.fields.${name}`, 'must be explicit, including unknown');
  }
  for (const name of required.filter(name => !['ivs', 'evs'].includes(name))) fact(value.fields[name], `${path}.fields.${name}`, sources);
  statFacts(value.fields.ivs, `${path}.fields.ivs`, sources);
  statFacts(value.fields.evs, `${path}.fields.evs`, sources);
  if (value.fields.stats !== undefined) statFacts(value.fields.stats, `${path}.fields.stats`, sources);
  if (value.fields.level.state === 'known') integer(value.fields.level.value, `${path}.fields.level.value`, {min: 1, max: 100});
  if (value.fields.friendship.state === 'known') integer(value.fields.friendship.value, `${path}.fields.friendship.value`, {min: 0, max: 255});
  if (value.fields.savedHealth.state === 'known') integer(value.fields.savedHealth.value, `${path}.fields.savedHealth.value`, {min: 0, max: 100000});
  if (value.fields.savedStatus.state === 'known' && value.fields.savedStatus.value !== null) text(value.fields.savedStatus.value, `${path}.fields.savedStatus.value`);
  for (const field of ['nature', 'originalNature']) if (value.fields[field].state === 'known') text(value.fields[field].value, `${path}.fields.${field}.value`, {max: 128});
  for (const field of ['ability', 'heldItem', 'teraType']) {
    const entry = value.fields[field];
    if (entry.state === 'known' && entry.value !== null) resourceId(entry.value, `${path}.fields.${field}.value`);
  }
  return validateMoves(value.moves, `${path}.moves`, sources);
}

function validatePlan(value, path, sources, observedMoves, observedHeldItem) {
  record(value, path);
  keys(value, ['state', 'buildId', 'provenance', 'moves', 'item', 'notes'], path);
  if (value.state === 'none') {
    if (Object.keys(value).some(key => key !== 'state')) fail(path, 'state none cannot contain a draft');
    return {usableNow: false, moveStatuses: []};
  }
  if (value.state !== 'draft') fail(`${path}.state`, 'must be none or draft');
  text(value.buildId, `${path}.buildId`, {max: 256});
  provenance(value.provenance, `${path}.provenance`, sources, {planned: true});
  array(value.moves, `${path}.moves`, {max: 4});
  const seen = new Set();
  let usableNow = true;
  const moveStatuses = [];
  value.moves.forEach((move, index) => {
    const movePath = `${path}.moves[${index}]`;
    record(move, movePath);
    keys(move, ['id', 'access'], movePath);
    moveId(move.id, `${movePath}.id`);
    if (seen.has(move.id)) fail(`${movePath}.id`, 'duplicates another planned move');
    seen.add(move.id);
    validateAccess(move.access, `${movePath}.access`, sources);
    if (move.access.status === 'equipped' && !observedMoves.equipped.has(move.id)) fail(movePath, 'equipped availability is not observed on this individual');
    if (move.access.status === 'learned' && !observedMoves.equipped.has(move.id) && !observedMoves.learned.has(move.id)) fail(movePath, 'learned availability is not observed on this individual');
    if (!ACCESS_NOW.includes(move.access.status)) usableNow = false;
    moveStatuses.push({id: move.id, status: move.access.status});
  });
  if (value.item !== undefined && value.item !== null) {
    record(value.item, `${path}.item`);
    keys(value.item, ['id', 'access'], `${path}.item`);
    resourceId(value.item.id, `${path}.item.id`);
    validateAccess(value.item.access, `${path}.item.access`, sources, {item: true});
    if (value.item.access.status === 'equipped') {
      if (observedHeldItem.state !== 'known' || observedHeldItem.value !== value.item.id) fail(`${path}.item`, 'equipped item is not observed on this individual');
    }
    if (!ACCESS_NOW.includes(value.item.access.status)) usableNow = false;
  }
  if (value.notes !== undefined) uniqueStrings(value.notes, `${path}.notes`, {max: 32});
  return {usableNow: usableNow && value.moves.length > 0, moveStatuses};
}

function validateIndividual(value, path, sources, locations, identities) {
  record(value, path);
  keys(value, ['identity', 'location', 'observed', 'planned'], path);
  validateIdentity(value.identity, `${path}.identity`, sources);
  validateLocation(value.location, `${path}.location`);
  if (identities.has(value.identity.uuid)) fail(`${path}.identity.uuid`, 'duplicates another individual UUID');
  identities.add(value.identity.uuid);
  const locationKey = value.location.container === 'party'
    ? `party:${value.location.slot}`
    : `pc:${value.location.box}:${value.location.slot}`;
  if (locations.has(locationKey)) fail(`${path}.location`, 'duplicates another occupied slot');
  locations.add(locationKey);
  const observed = validateObserved(value.observed, `${path}.observed`, sources);
  const plan = validatePlan(value.planned, `${path}.planned`, sources, observed, value.observed.fields.heldItem);
  return {id: value.identity.uuid, location: locationKey, usableNow: plan.usableNow, moveStatuses: plan.moveStatuses};
}

function validatePreflight(input) {
  jsonValue(input, 'input');
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded, 'utf8') > CONTRACT.limits.maxBytes) fail('input', `exceeds ${CONTRACT.limits.maxBytes} bytes`);
  record(input, 'input');
  keys(input, ['format', 'schemaVersion', 'exportId', 'createdAt', 'sources', 'snapshot', 'context', 'player', 'policy'], 'input');
  if (input.format !== CONTRACT.format) fail('format', `must be ${CONTRACT.format}`);
  if (input.schemaVersion !== CONTRACT.schemaVersion) fail('schemaVersion', `unsupported version ${input.schemaVersion}`);
  text(input.exportId, 'exportId', {max: 256});
  iso(input.createdAt, 'createdAt');
  const sources = sourceTable(input.sources);

  record(input.snapshot, 'snapshot');
  keys(input.snapshot, ['id', 'kind', 'capturedAt', 'sourceIds', 'completeness', 'atomicity', 'fingerprint'], 'snapshot');
  text(input.snapshot.id, 'snapshot.id', {max: 256});
  if (!CAPTURE_KINDS.includes(input.snapshot.kind)) fail('snapshot.kind', 'is invalid');
  iso(input.snapshot.capturedAt, 'snapshot.capturedAt');
  uniqueStrings(input.snapshot.sourceIds, 'snapshot.sourceIds', {max: CONTRACT.limits.maxSources, min: 1});
  input.snapshot.sourceIds.forEach(id => sourceId(id, 'snapshot.sourceIds[]', sources));
  if (!['complete', 'partial'].includes(input.snapshot.completeness)) fail('snapshot.completeness', 'is invalid');
  if (!['atomic', 'best-effort', 'unknown'].includes(input.snapshot.atomicity)) fail('snapshot.atomicity', 'is invalid');
  record(input.snapshot.fingerprint, 'snapshot.fingerprint');
  keys(input.snapshot.fingerprint, ['algorithm', 'value'], 'snapshot.fingerprint');
  if (input.snapshot.fingerprint.algorithm !== 'sha256') fail('snapshot.fingerprint.algorithm', 'must be sha256');
  if (!SHA256_RE.test(input.snapshot.fingerprint.value || '')) fail('snapshot.fingerprint.value', 'must be a SHA-256 hex digest');

  record(input.context, 'context');
  keys(input.context, ['state', 'trainerId', 'levelCap', 'allowedTypes', 'sourceIds'], 'context');
  if (!['selected', 'unselected'].includes(input.context.state)) fail('context.state', 'must be selected or unselected');
  uniqueStrings(input.context.allowedTypes, 'context.allowedTypes', {max: 64, min: 0});
  uniqueStrings(input.context.sourceIds, 'context.sourceIds', {max: CONTRACT.limits.maxSources, min: input.context.state === 'selected' ? 1 : 0});
  input.context.sourceIds.forEach(id => sourceId(id, 'context.sourceIds[]', sources));
  if (input.context.state === 'selected') {
    text(input.context.trainerId, 'context.trainerId', {max: 256});
    integer(input.context.levelCap, 'context.levelCap', {min: 1, max: 100});
    if (input.context.allowedTypes.length === 0) fail('context.allowedTypes', 'selected context requires explicit allowed types');
  } else if (input.context.trainerId !== null || input.context.levelCap !== null) {
    fail('context', 'unselected context must not carry a default trainerId or levelCap');
  }

  record(input.player, 'player');
  keys(input.player, ['playerUuid', 'revision', 'individuals'], 'player');
  if (!UUID_RE.test(input.player.playerUuid || '')) fail('player.playerUuid', 'must be a canonical UUID');
  integer(input.player.revision, 'player.revision', {min: 1, max: Number.MAX_SAFE_INTEGER});
  array(input.player.individuals, 'player.individuals', {max: CONTRACT.limits.maxIndividuals, min: 1});
  const locations = new Set();
  const identities = new Set();
  const individuals = input.player.individuals.map((item, index) => validateIndividual(item, `player.individuals[${index}]`, sources, locations, identities));
  if (individuals.filter(item => item.location.startsWith('party:')).length > 6) fail('player.individuals', 'contains more than six party slots');

  record(input.policy, 'policy');
  keys(input.policy, ['id', 'version'], 'policy');
  text(input.policy.id, 'policy.id', {max: 256});
  text(input.policy.version, 'policy.version', {max: 128});

  const bundle = cloneJson(input);
  return {
    bundle,
    summary: {
      individualCount: individuals.length,
      partyCount: individuals.filter(item => item.location.startsWith('party:')).length,
      usableNowCount: individuals.filter(item => item.usableNow).length,
      unknownOrPendingPlans: individuals.filter(item => !item.usableNow).map(item => ({id: item.id, moveStatuses: item.moveStatuses})),
    },
    inputDigest: computeInputDigest(bundle),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function computeInputDigest(bundle) {
  record(bundle, 'bundle');
  const view = {sources: bundle.sources, snapshot: bundle.snapshot, context: bundle.context, player: bundle.player, policy: bundle.policy};
  return crypto.createHash('sha256').update(JSON.stringify(stable(view))).digest('hex');
}

function makeAnalysisRef(bundle, {analysisId, engineVersion, policyVersion} = {}) {
  const checked = validatePreflight(bundle).bundle;
  text(analysisId, 'analysisId', {max: 256});
  text(engineVersion, 'engineVersion', {max: 128});
  text(policyVersion || checked.policy.version, 'policyVersion', {max: 128});
  return {
    schemaVersion: 1,
    analysisId,
    snapshotId: checked.snapshot.id,
    playerRevision: checked.player.revision,
    inputDigest: computeInputDigest(checked),
    engineVersion,
    policyVersion: policyVersion || checked.policy.version,
  };
}

function assessFreshness(reference, bundle, {engineVersion, policyVersion} = {}) {
  record(reference, 'analysisRef');
  keys(reference, ['schemaVersion', 'analysisId', 'snapshotId', 'playerRevision', 'inputDigest', 'engineVersion', 'policyVersion'], 'analysisRef');
  if (reference.schemaVersion !== 1) fail('analysisRef.schemaVersion', 'unsupported version');
  text(reference.analysisId, 'analysisRef.analysisId', {max: 256});
  text(reference.snapshotId, 'analysisRef.snapshotId', {max: 256});
  integer(reference.playerRevision, 'analysisRef.playerRevision', {min: 1});
  if (!SHA256_RE.test(reference.inputDigest || '')) fail('analysisRef.inputDigest', 'must be a SHA-256 hex digest');
  text(reference.engineVersion, 'analysisRef.engineVersion', {max: 128});
  text(reference.policyVersion, 'analysisRef.policyVersion', {max: 128});
  const checked = validatePreflight(bundle).bundle;
  const reasons = [];
  if (reference.snapshotId !== checked.snapshot.id) reasons.push('snapshot-mismatch');
  if (reference.playerRevision !== checked.player.revision) reasons.push('player-revision-mismatch');
  if (reference.inputDigest !== computeInputDigest(checked)) reasons.push('input-digest-mismatch');
  if (policyVersion !== undefined && reference.policyVersion !== policyVersion) reasons.push('policy-version-mismatch');
  if (engineVersion !== undefined && reference.engineVersion !== engineVersion) reasons.push('engine-version-mismatch');
  return {fresh: reasons.length === 0, reasons};
}

module.exports = {
  CONTRACT,
  ACCESS_NOW,
  validatePreflight,
  computeInputDigest,
  makeAnalysisRef,
  assessFreshness,
};

