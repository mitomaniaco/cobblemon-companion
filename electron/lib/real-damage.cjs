'use strict';

const crypto = require('node:crypto');
const calcPackage = require('@smogon/calc/package.json');
const {damageRange, pokemonFromSpec} = require('./calc-profile.cjs');
const compatibility = require('./combat-compatibility.json');
const {resolvePlayerSpecies} = require('./species-forms.cjs');

const CALC_VERSION = '0.11.0';
const ADAPTER_VERSION = 'real-damage-adapter-v13';
const STATS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
const SOURCE_KINDS = Object.freeze(['party', 'pc']);
const ASSUMPTION_KEYS = Object.freeze([
  'rulesetMatchesActiveWorld',
  'actorBaselineConfirmed',
  'actorFullHpConfirmed',
  'targetBaselineConfirmed',
  'fieldBaselineConfirmed',
]);

if (calcPackage.version !== CALC_VERSION || compatibility.ruleset.calcVersion !== CALC_VERSION) {
  throw new Error(`Real damage requires @smogon/calc ${CALC_VERSION} and its matching compatibility catalog`);
}
if (compatibility.schemaVersion !== 2 || compatibility.ruleset.id !== 'cobblemon-1.7.3-showdown-16-smogon-calc-0.11.0-v15') {
  throw new Error('Real damage compatibility catalog is not a reviewed version');
}

function fail(pathName, message) {
  throw new TypeError(`Cálculo real: ${pathName} ${message}`);
}

function record(value, pathName) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(pathName, 'precisa ser um objeto');
}

function exactKeys(value, allowed, pathName) {
  record(value, pathName);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${pathName}.${key}`, 'não é suportado');
}

function text(value, pathName) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(pathName, 'precisa ser texto não vazio');
  return value;
}

function integer(value, pathName, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(pathName, `precisa ser inteiro entre ${min} e ${max}`);
  return value;
}

function sourceHashes(raw, pathName) {
  if (!Array.isArray(raw) || raw.length !== SOURCE_KINDS.length) fail(pathName, 'precisa identificar party e PC');
  const found = new Map();
  for (const [index, source] of raw.entries()) {
    exactKeys(source, ['kind', 'sha256'], `${pathName}[${index}]`);
    if (!SOURCE_KINDS.includes(source.kind) || found.has(source.kind)) fail(`${pathName}[${index}].kind`, 'é inválido ou repetido');
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256))
      fail(`${pathName}[${index}].sha256`, 'precisa ser SHA-256 hexadecimal');
    found.set(source.kind, source.sha256);
  }
  if (SOURCE_KINDS.some((kind) => !found.has(kind))) fail(pathName, 'precisa identificar party e PC');
  return SOURCE_KINDS.map((kind) => ({kind, sha256: found.get(kind)}));
}

function assertFreshSources(requested, current) {
  const expected = sourceHashes(requested, 'request.sources');
  if (!Array.isArray(current)) fail('snapshot.sources', 'não foram capturadas');
  const actual = sourceHashes(
    current.map((source) => ({kind: source.kind, sha256: source.sha256})),
    'snapshot.sources',
  );
  if (expected.some((source, index) => source.sha256 !== actual[index].sha256)) {
    fail('snapshot', 'mudou desde a captura; atualize o save antes de calcular');
  }
  return actual;
}

function gameId(value, pathName) {
  text(value, pathName);
  if (value.startsWith('cobblemon:')) return value;
  if (value.includes(':')) fail(pathName, 'usa um namespace sem mapeamento');
  return `cobblemon:${value}`;
}

function mappedName(table, id, pathName) {
  text(id, pathName);
  const name = table[id];
  if (typeof name !== 'string' || name.length === 0) fail(pathName, 'está fora do subconjunto compatível versionado');
  return name;
}

function mappedMoveName(id, pathName) {
  text(id, pathName);
  const move = Object.hasOwn(compatibility.moves, id) ? compatibility.moves[id] : undefined;
  if (!move || typeof move.name !== 'string' || move.name.length === 0) {
    fail(pathName, 'está fora do subconjunto compatível versionado');
  }
  return move.name;
}

function known(value, pathName) {
  if (value?.state !== 'known') fail(pathName, 'é desconhecido; o cálculo não inventa o valor');
  return value.value;
}

function statValues(facts, pathName, minimum, maximum) {
  record(facts, pathName);
  const output = {};
  for (const stat of STATS) {
    if (!Object.hasOwn(facts, stat)) fail(`${pathName}.${stat}`, 'não foi capturado');
    output[stat] = integer(known(facts[stat], `${pathName}.${stat}`), `${pathName}.${stat}`, minimum, maximum);
  }
  return output;
}

function effectiveIvs(battleStats) {
  record(battleStats, 'actor.battleStats');
  const ivs = {};
  for (const stat of STATS) {
    const override = battleStats.hyperTrainedIvs?.[stat];
    if (override?.state !== 'known') fail(`actor.battleStats.hyperTrainedIvs.${stat}`, 'é desconhecido');
    const value = override.value === null ? known(battleStats.ivs?.[stat], `actor.battleStats.ivs.${stat}`) : override.value;
    ivs[stat] = integer(value, `actor.battleStats.effectiveIvs.${stat}`, 0, 31);
  }
  return ivs;
}

function supportedSpecies(speciesId, pathName) {
  text(speciesId, pathName);
  if (!Object.hasOwn(compatibility.species, speciesId)) fail(pathName, 'está fora do subconjunto compatível versionado');
  return compatibility.species[speciesId];
}

function supportedAbility(species, abilityId, pathName) {
  const canonical = gameId(abilityId, pathName);
  if (!species.abilities.includes(canonical)) fail(pathName, 'não está mapeada para esta espécie');
  return mappedName(compatibility.abilities, abilityId, pathName);
}

function supportedNature(natureId, pathName) {
  const canonical = gameId(natureId, pathName);
  const name = compatibility.natures[natureId] || compatibility.natures[canonical];
  if (typeof name !== 'string' || name.length === 0) fail(pathName, 'está fora do subconjunto compatível versionado');
  return name;
}

function validateStats(raw, pathName) {
  exactKeys(raw, ['ivs', 'evs'], pathName);
  exactKeys(raw.ivs, STATS, `${pathName}.ivs`);
  exactKeys(raw.evs, STATS, `${pathName}.evs`);
  const ivs = {};
  const evs = {};
  for (const stat of STATS) {
    ivs[stat] = integer(raw.ivs[stat], `${pathName}.ivs.${stat}`, 0, 31);
    evs[stat] = integer(raw.evs[stat], `${pathName}.evs.${stat}`, 0, 252);
  }
  if (STATS.reduce((sum, stat) => sum + evs[stat], 0) > 510) fail(`${pathName}.evs`, 'a soma excede 510');
  return {ivs, evs};
}

function validateTarget(raw) {
  exactKeys(raw, ['speciesId', 'formId', 'level', 'nature', 'ability', 'ivs', 'evs'], 'request.target');
  const species = supportedSpecies(raw.speciesId, 'request.target.speciesId');
  if (raw.formId !== 'normal') fail('request.target.formId', 'somente forma normal é compatível');
  const level = integer(raw.level, 'request.target.level', 1, 100);
  const nature = supportedNature(raw.nature, 'request.target.nature');
  const ability = supportedAbility(species, raw.ability, 'request.target.ability');
  const stats = validateStats({ivs: raw.ivs, evs: raw.evs}, 'request.target');
  return {...raw, species, level, nature, ability, ...stats};
}

function validateAssumptions(raw) {
  exactKeys(raw, ASSUMPTION_KEYS, 'request.assumptions');
  for (const key of ASSUMPTION_KEYS) {
    if (raw[key] !== true) fail(`request.assumptions.${key}`, 'precisa ser confirmado explicitamente');
  }
  return {
    rulesetMatchesActiveWorld: true,
    actorBaselineConfirmed: true,
    actorFullHpConfirmed: true,
    targetBaselineConfirmed: true,
    fieldBaselineConfirmed: true,
  };
}

// O id do Cobblemon (`cobblemon:focus_sash`) vira o id do Showdown (`focussash`) sem namespace nem `_`.
// Ids que não mapeiam dessa forma ficam bloqueados: falha segura, sem tabela manual de exceções.
function heldItemName(id, pathName) {
  text(id, pathName);
  if (!id.startsWith('cobblemon:')) fail(pathName, 'usa um namespace sem mapeamento');
  const key = id.slice('cobblemon:'.length).replace(/_/g, '');
  const name = compatibility.items && Object.hasOwn(compatibility.items, key) ? compatibility.items[key].name : undefined;
  if (typeof name !== 'string' || name.length === 0) fail(pathName, 'está fora do subconjunto compatível versionado');
  return name;
}

/** Perfil do indivíduo sem a exigência de item (usado pelo guia, que decide o item por conta própria). */
function baseActorProfile(actor) {
  supportedSpecies(actor?.speciesId, 'actor.speciesId');
  const resolved = resolvePlayerSpecies(actor.speciesId, actor.formId);
  if (!resolved.ok) fail('actor.formId', resolved.reason);
  if (!Number.isSafeInteger(actor.level)) fail('actor.level', 'não foi capturado');
  integer(actor.level, 'actor.level', 1, 100);
  if (!actor.observed) fail('actor.observed', 'não foi capturado');
  const natureId = text(actor.observed.nature, 'actor.observed.nature');
  const abilityId = text(actor.observed.ability, 'actor.observed.ability');
  const nature = supportedNature(natureId, 'actor.observed.nature');
  const ability = supportedAbility(resolved, abilityId, 'actor.observed.ability');
  // Snapshot v2 null is unknown; the required manual baseline attestation supplies this scenario fact.
  const ivs = effectiveIvs(actor.battleStats);
  const evs = statValues(actor.battleStats.evs, 'actor.battleStats.evs', 0, 252);
  if (STATS.reduce((sum, stat) => sum + evs[stat], 0) > 510) fail('actor.battleStats.evs', 'a soma excede 510');
  return {species: {name: resolved.name, abilities: resolved.abilities}, level: actor.level, nature, ability, ivs, evs};
}

function actorProfile(actor) {
  const profile = baseActorProfile(actor);
  // O estado de batalha do item (gema consumida, Berry, etc.) fica coberto pela confirmação de cenário do usuário.
  const item = actor.observed.heldItem === null ? null : heldItemName(actor.observed.heldItem, 'actor.observed.heldItem');
  return {...profile, item};
}

// The actor and target HP assumptions are explicit in validateAssumptions;
// calc otherwise defaults current HP to the full stat.
function pokemon(spec, pathName) {
  try {
    return pokemonFromSpec(spec);
  } catch (error) {
    fail(pathName, `não pôde ser construído pelo motor revisado (${error.message})`);
  }
}

function damage(attacker, defender, moveId, pathName) {
  const moveName = mappedMoveName(moveId, pathName);
  try {
    const {min, max, targetHP} = damageRange(attacker, defender, moveName);
    return {moveId, min, max, targetHP, rollCount: 16};
  } catch (error) {
    if (error?.code === 'ERR_CALC_ROLLS') fail(pathName, error.message);
    if (error instanceof TypeError && error.message.startsWith('Cálculo real:')) throw error;
    fail(pathName, `o motor revisado recusou a entrada (${error.message})`);
  }
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

function calculateRealDamage(snapshot, rawRequest) {
  exactKeys(rawRequest, ['sources', 'individualUuid', 'currentSlotIndex', 'candidateMoveId', 'target', 'assumptions'], 'request');
  if (snapshot?.schemaVersion !== 2 || snapshot?.consistency !== 'best-effort' || !Array.isArray(snapshot?.individuals)) {
    fail('snapshot', 'não corresponde ao snapshot local v2');
  }
  const sources = assertFreshSources(rawRequest.sources, snapshot.sources);
  const assumptions = validateAssumptions(rawRequest.assumptions);
  const individualUuid = text(rawRequest.individualUuid, 'request.individualUuid');
  const actors = snapshot.individuals.filter((individual) => individual.uuid === individualUuid);
  if (actors.length !== 1) fail('request.individualUuid', 'não identifica exatamente um indivíduo no snapshot atual');
  const actor = actors[0];
  const profile = actorProfile(actor);
  if (actor.equippedMovesKnown !== true || actor.learnedMovesKnown !== true)
    fail('actor.moves', 'as listas equipadas e aprendidas precisam ser conhecidas');
  if (!Array.isArray(actor.equippedMoves) || actor.equippedMoves.length === 0) fail('actor.equippedMoves', 'não há golpe equipado');
  if (!Array.isArray(actor.learnedMoves)) fail('actor.learnedMoves', 'a lista aprendida não foi capturada');
  const currentSlotIndex = integer(rawRequest.currentSlotIndex, 'request.currentSlotIndex', 0, actor.equippedMoves.length - 1);
  const currentPath = `actor.equippedMoves[${currentSlotIndex}].id`;
  const currentMoveId = text(actor.equippedMoves[currentSlotIndex].id, currentPath);
  const candidateMoveId = text(rawRequest.candidateMoveId, 'request.candidateMoveId');
  if (candidateMoveId === currentMoveId || actor.equippedMoves.some((move) => move.id === candidateMoveId)) {
    fail('request.candidateMoveId', 'precisa ser um golpe aprendido ainda não equipado');
  }
  if (!actor.learnedMoves.some((move) => move.id === candidateMoveId))
    fail('request.candidateMoveId', 'não foi observado como aprendido neste indivíduo');
  mappedMoveName(currentMoveId, currentPath);
  mappedMoveName(candidateMoveId, 'request.candidateMoveId');
  const target = validateTarget(rawRequest.target);
  const current = damage(pokemon(profile, 'actor.current'), pokemon(target, 'target.current'), currentMoveId, currentPath);
  const candidate = damage(
    pokemon(profile, 'actor.candidate'),
    pokemon(target, 'target.candidate'),
    candidateMoveId,
    'request.candidateMoveId',
  );
  const input = {
    adapterVersion: ADAPTER_VERSION,
    rulesetId: compatibility.ruleset.id,
    sourceHashes: sources,
    individualUuid,
    actor: {
      speciesId: actor.speciesId,
      level: actor.level,
      natureId: actor.observed.nature,
      abilityId: actor.observed.ability,
      ivs: profile.ivs,
      evs: profile.evs,
      heldItemId: actor.observed.heldItem,
      currentSlotIndex,
      currentMoveId,
      candidateMoveId,
    },
    target: rawRequest.target,
    assumptions,
  };
  return {
    ruleset: {
      id: compatibility.ruleset.id,
      cobblemonVersion: compatibility.ruleset.cobblemonVersion,
      showdownVersion: compatibility.ruleset.showdownVersion,
      calcVersion: CALC_VERSION,
      adapterVersion: ADAPTER_VERSION,
      sourceSha256: {...compatibility.ruleset.sourceSha256},
    },
    snapshot: {
      capturedAt: snapshot.capturedAt,
      worldName: snapshot.worldName,
      sources: snapshot.sources.map((source) => ({kind: source.kind, sha256: source.sha256, modifiedAt: source.modifiedAt})),
    },
    individualUuid,
    actor: {speciesId: actor.speciesId, level: actor.level, heldItem: profile.item, currentSlotIndex},
    target: {
      speciesId: rawRequest.target.speciesId,
      formId: rawRequest.target.formId,
      level: target.level,
    },
    scope: {
      generation: 9,
      format: 'singles',
      actions: 1,
      damageOnSuccessfulHitOnly: true,
      rolls: 16,
      rollSummary: 'minimum-and-maximum',
      assumptions,
    },
    current,
    candidate,
    inputDigest: crypto
      .createHash('sha256')
      .update(JSON.stringify(stable(input)))
      .digest('hex'),
  };
}

module.exports = {
  ADAPTER_VERSION,
  COMPATIBILITY: compatibility,
  baseActorProfile,
  assertFreshSources,
  calculateRealDamage,
};
