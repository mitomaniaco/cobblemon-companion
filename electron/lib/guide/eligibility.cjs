'use strict';

const {baseActorProfile, COMPATIBILITY} = require('../real-damage.cjs');

const ERROR_PREFIX = 'Cálculo real: ';

const FIELD_LABELS = [
  ['actor.speciesId', 'espécie'],
  ['actor.level', 'nível'],
  ['actor.observed.nature', 'natureza'],
  ['actor.observed.ability', 'habilidade'],
  ['actor.observed', 'dados observados'],
];

/** Motivo para o jogador: tira o prefixo técnico do erro do cálculo e troca o caminho do campo pelo nome dele. */
function reasonOf(error) {
  const message = error instanceof Error ? error.message : String(error);
  const body = message.startsWith(ERROR_PREFIX) ? message.slice(ERROR_PREFIX.length) : message;
  const [field, ...rest] = body.split(' ');
  const detail = rest.join(' ');
  if (field === 'actor.formId') return 'só a forma normal é compatível';
  const label = FIELD_LABELS.find(([prefix]) => field === prefix)?.[1];
  if (label) return `${label} ${detail}`;
  if (field.startsWith('actor.battleStats.')) return `IVs/EVs (${field.slice('actor.battleStats.'.length)}) ${detail}`;
  return body;
}

/** Golpes que o app sabe que o indivíduo conhece: MoveSet (equipados) e BenchedMoves (aprendidos), se capturados. */
function knownMoves(individual) {
  const equipped = individual.equippedMovesKnown === true && Array.isArray(individual.equippedMoves) ? individual.equippedMoves : [];
  const learned = individual.learnedMovesKnown === true && Array.isArray(individual.learnedMoves) ? individual.learnedMoves : [];
  return {equipped: equipped.map((move) => move.id), learned: learned.map((move) => move.id)};
}

/**
 * Separa os indivíduos que o motor consegue avaliar dos demais. As regras são as de `actorProfile` do cálculo real
 * (espécie no catálogo, forma normal, nível, natureza, habilidade e IVs/EVs efetivos conhecidos), sem exigir item:
 * o item é decisão do guia. Além disso, sem nenhum golpe conhecido no catálogo não há o que avaliar.
 */
function assessEligibility(individuals) {
  const eligible = [];
  const excluded = [];
  for (const individual of individuals) {
    let profile;
    try {
      profile = baseActorProfile(individual);
    } catch (error) {
      excluded.push({uuid: individual.uuid, reason: reasonOf(error)});
      continue;
    }
    const known = knownMoves(individual);
    const usable = [...known.equipped, ...known.learned].some((id) => Object.hasOwn(COMPATIBILITY.moves, id));
    if (!usable) {
      excluded.push({uuid: individual.uuid, reason: 'nenhum golpe conhecido pertence ao subconjunto compatível'});
      continue;
    }
    eligible.push({individual, profile, known});
  }
  return {eligible, excluded};
}

module.exports = {assessEligibility};
