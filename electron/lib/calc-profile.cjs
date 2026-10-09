'use strict';

const calc = require('@smogon/calc');

const STATS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);

/**
 * Constrói um Pokémon do @smogon/calc (geração 9) a partir de um perfil já validado:
 * `{species: {name}, level, nature, ability, ivs, evs, item?}`. Sem status, boosts zerados, HP cheio.
 * Lança o erro original do calc; quem chama decide como apresentá-lo.
 */
function pokemonFromSpec(spec) {
  return new calc.Pokemon(9, spec.species.name, {
    level: spec.level,
    nature: spec.nature,
    ability: spec.ability,
    item: spec.item ?? '',
    status: '',
    boosts: Object.fromEntries(STATS.map((stat) => [stat, spec.boosts?.[stat] ?? 0])),
    ivs: spec.ivs,
    evs: spec.evs,
  });
}

const ROLLS = 16;
const invalidRolls = () => Object.assign(new Error('o motor não retornou os 16 rolls inteiros esperados'), {code: 'ERR_CALC_ROLLS'});
const validValue = (value) => Number.isSafeInteger(value) && value >= 0;
const validRollList = (list) => Array.isArray(list) && list.length === ROLLS && list.every(validValue);

/**
 * Os 16 rolls de dano de um golpe, normalizando o que o calc devolve: número (dano fixo, imunidade), lista de 16
 * (golpe comum), lista de listas de 16 (multi-hit: soma índice a índice) ou lista de números de outro tamanho
 * (dano fixo em vários acertos: soma replicada). Qualquer outra forma lança erro com `code: 'ERR_CALC_ROLLS'`.
 */
function damageRolls(attacker, defender, moveName, field = new calc.Field()) {
  const raw = calc.calculate(9, attacker, defender, new calc.Move(9, moveName), field).damage;
  if (validValue(raw)) return new Array(ROLLS).fill(raw);
  if (!Array.isArray(raw) || raw.length === 0) throw invalidRolls();
  if (validRollList(raw)) return [...raw];
  if (raw.every(validValue)) return new Array(ROLLS).fill(raw.reduce((sum, value) => sum + value, 0));
  if (raw.every(validRollList)) {
    return Array.from({length: ROLLS}, (_, index) => raw.reduce((sum, hit) => sum + hit[index], 0));
  }
  throw invalidRolls();
}

/** Faixa de dano de um golpe em campo neutro (mínimo e máximo dos 16 rolls) e o HP do alvo. */
function damageRange(attacker, defender, moveName, field = new calc.Field()) {
  const rolls = damageRolls(attacker, defender, moveName, field);
  return {min: Math.min(...rolls), max: Math.max(...rolls), targetHP: defender.stats.hp};
}

module.exports = {pokemonFromSpec, damageRange, damageRolls};
