'use strict';

const {COMPATIBILITY} = require('../real-damage.cjs');

const PVE_LEVEL_BELOW = 10;
const PVE_LEVEL_ABOVE = 5;
const PVE_MAX_OPPONENTS = 30;
const PREFERRED_SERIES = 'radicalred';
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function lookup(table, id) {
  return Object.hasOwn(table, id) ? table[id] : undefined;
}

/** Id do jogo (`rockhead`, `cobblemon:rockhead`) em nome do catálogo, ou undefined. */
function namedFromCatalog(table, id) {
  if (typeof id !== 'string') return undefined;
  const direct = lookup(table, id);
  if (typeof direct === 'string') return direct;
  const namespaced = lookup(table, id.includes(':') ? id : `cobblemon:${id}`);
  return typeof namespaced === 'string' ? namespaced : undefined;
}

function heldItemName(id) {
  if (typeof id !== 'string' || !id.startsWith('cobblemon:')) return '';
  return lookup(COMPATIBILITY.items, id.slice('cobblemon:'.length).replace(/_/g, ''))?.name ?? '';
}

/**
 * Converte um membro de treinador no perfil do cálculo. Espécie ou habilidade fora do catálogo removem o membro
 * (`{removed}`); golpes fora do catálogo (inclui os de status) são ignorados e contados. IV ausente vira 31, EV ausente 0.
 */
function opponentFromMember(member, id, trainerId) {
  const species = lookup(COMPATIBILITY.species, member.speciesId);
  if (!species) return {removed: `espécie ${member.speciesId}`};
  const ability = namedFromCatalog(COMPATIBILITY.abilities, member.ability);
  if (!ability) return {removed: `habilidade ${member.ability} de ${species.name}`};
  const nature = namedFromCatalog(COMPATIBILITY.natures, member.nature);
  if (!nature) return {removed: `natureza ${member.nature} de ${species.name}`};
  if (!Number.isSafeInteger(member.level) || member.level < 1 || member.level > 100) return {removed: `nível de ${species.name}`};
  const moves = [];
  let ignoredMoves = 0;
  for (const moveId of member.moves ?? []) {
    const move = lookup(COMPATIBILITY.moves, moveId);
    if (move) moves.push({id: moveId, name: move.name});
    else ignoredMoves += 1;
  }
  const ivs = Object.fromEntries(STATS.map((stat) => [stat, member.ivs?.[stat] ?? 31]));
  const evs = Object.fromEntries(STATS.map((stat) => [stat, member.evs?.[stat] ?? 0]));
  return {
    opponent: {
      id,
      trainerId,
      speciesId: member.speciesId,
      level: member.level,
      spec: {species, level: member.level, nature, ability, ivs, evs, item: heldItemName(member.heldItem)},
      moves,
    },
    ignoredMoves,
  };
}

function summarize(items) {
  const unique = [...new Set(items)].sort();
  return unique.length > 8 ? `${unique.slice(0, 8).join(', ')} e mais ${unique.length - 8}` : unique.join(', ');
}

function finishAssumptions(assumptions, removed, ignoredMoves) {
  if (removed.length > 0) assumptions.push(`Adversários removidos por dado fora do catálogo compatível: ${summarize(removed)}.`);
  if (ignoredMoves > 0) {
    assumptions.push(`${ignoredMoves} golpes de adversários fora do catálogo compatível (incluem os de status) foram ignorados.`);
  }
  assumptions.push('IVs ausentes dos adversários valem 31 e EVs ausentes valem 0; itens dos adversários contam quando estão no catálogo.');
}

/** Time de um treinador específico. Dupla é recusada, nunca avaliada como singles. */
function trainerOpponents(trainers, trainerId) {
  const trainer = trainers.find((candidate) => candidate.id === trainerId);
  if (!trainer) throw new Error(`treinador ${trainerId} não encontrado`);
  if (trainer.format !== 'singles') throw new Error('formato duplas não suportado');
  const assumptions = [];
  const opponents = [];
  const removed = [];
  let ignoredMoves = 0;
  trainer.team.forEach((member, index) => {
    const built = opponentFromMember(member, `${trainer.id}#${index}`, trainer.id);
    if (built.removed) removed.push(built.removed);
    else {
      opponents.push(built.opponent);
      ignoredMoves += built.ignoredMoves;
    }
  });
  finishAssumptions(assumptions, removed, ignoredMoves);
  return {opponents, assumptions};
}

/**
 * PvE geral: membros de treinadores singles com nível entre ref-10 e ref+5, sem repetir espécie, os 30 mais próximos
 * do nível de referência (empate: série radicalred primeiro, depois id e posição).
 */
function pveOpponents(trainers, series, referenceLevel) {
  const preferred = new Set(series[PREFERRED_SERIES]?.trainerIds ?? []);
  const pool = [];
  for (const trainer of trainers) {
    if (trainer.format !== 'singles') continue;
    trainer.team.forEach((member, index) => {
      if (member.level < referenceLevel - PVE_LEVEL_BELOW || member.level > referenceLevel + PVE_LEVEL_ABOVE) return;
      pool.push({trainer, member, index});
    });
  }
  pool.sort(
    (left, right) =>
      Math.abs(left.member.level - referenceLevel) - Math.abs(right.member.level - referenceLevel) ||
      Number(!preferred.has(left.trainer.id)) - Number(!preferred.has(right.trainer.id)) ||
      (left.trainer.id < right.trainer.id ? -1 : left.trainer.id > right.trainer.id ? 1 : 0) ||
      left.index - right.index,
  );
  const opponents = [];
  const removed = [];
  const seen = new Set();
  let ignoredMoves = 0;
  for (const {trainer, member, index} of pool) {
    if (opponents.length >= PVE_MAX_OPPONENTS) break;
    if (seen.has(member.speciesId)) continue;
    const built = opponentFromMember(member, `${trainer.id}#${index}`, trainer.id);
    if (built.removed) {
      removed.push(built.removed);
      continue;
    }
    seen.add(member.speciesId);
    opponents.push(built.opponent);
    ignoredMoves += built.ignoredMoves;
  }
  const assumptions = [
    `PvE geral: adversários de referência são membros de treinadores singles com nível de ${referenceLevel - PVE_LEVEL_BELOW} a ${referenceLevel + PVE_LEVEL_ABOVE}, uma espécie por vez, os ${PVE_MAX_OPPONENTS} mais próximos do nível ${referenceLevel}. É uma hipótese de avaliação, não a distribuição de encontros.`,
  ];
  finishAssumptions(assumptions, removed, ignoredMoves);
  return {opponents, assumptions};
}

module.exports = {trainerOpponents, pveOpponents, lookup};
