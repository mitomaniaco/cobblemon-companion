'use strict';

const {toID} = require('@smogon/calc');
const compatibility = require('./combat-compatibility.json');

const OUT_OF_SUBSET = 'fora do subconjunto compatível versionado';

function baseSpecies(speciesId) {
  return typeof speciesId === 'string' && Object.hasOwn(compatibility.species, speciesId) ? compatibility.species[speciesId] : undefined;
}

/**
 * Espécie e forma de um Pokémon do jogador. O save grava `formId` (`normal`, `galar`, `lowkey`...), que é a chave
 * da forma no catálogo. Retorna `{ok: true, name, abilities}` ou `{ok: false, reason}`.
 */
function resolvePlayerSpecies(speciesId, formId) {
  const species = baseSpecies(speciesId);
  if (!species) return {ok: false, reason: `espécie ${OUT_OF_SUBSET}`};
  if (formId === 'normal') return {ok: true, name: species.name, abilities: species.abilities};
  if (typeof formId !== 'string' || formId === 'unknown') return {ok: false, reason: 'forma não foi capturada'};
  const form = Object.hasOwn(species.forms ?? {}, toID(formId)) ? species.forms[toID(formId)] : undefined;
  if (!form) return {ok: false, reason: `forma ${formId} ${OUT_OF_SUBSET}`};
  return {ok: true, name: form.name, abilities: form.abilities};
}

/**
 * Espécie e forma de um adversário do RCT, que só traz `aspects` (`galarian`, `alolan`...). Sem aspects é a forma base;
 * com aspects, a forma do catálogo cujos aspects são exatamente esses.
 */
function resolveOpponentSpecies(speciesId, aspects) {
  const species = baseSpecies(speciesId);
  if (!species) return {ok: false, reason: `espécie ${OUT_OF_SUBSET}`};
  if (!Array.isArray(aspects) || aspects.length === 0) return {ok: true, name: species.name, abilities: species.abilities};
  const key = [...aspects].sort().join('+');
  const form = Object.values(species.forms ?? {}).find((candidate) => candidate.aspects.join('+') === key);
  if (!form) return {ok: false, reason: `forma (${aspects.join(', ')}) sem correspondência no catálogo`};
  return {ok: true, name: form.name, abilities: form.abilities};
}

module.exports = {resolvePlayerSpecies, resolveOpponentSpecies};
