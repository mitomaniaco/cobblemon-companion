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
    boosts: Object.fromEntries(STATS.map((stat) => [stat, 0])),
    ivs: spec.ivs,
    evs: spec.evs,
  });
}

/**
 * Faixa de dano de um golpe em campo neutro. O calc devolve o número 0 (não os 16 rolls) quando o alvo é imune ao tipo;
 * isso vira 0–0. Qualquer outra forma fora dos 16 inteiros não negativos lança erro com `code: 'ERR_CALC_ROLLS'`.
 */
function damageRange(attacker, defender, moveName) {
  const result = calc.calculate(9, attacker, defender, new calc.Move(9, moveName), new calc.Field());
  const rolls = result.damage === 0 ? new Array(16).fill(0) : result.damage;
  if (!Array.isArray(rolls) || rolls.length !== 16 || !rolls.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw Object.assign(new Error('o motor não retornou os 16 rolls inteiros esperados'), {code: 'ERR_CALC_ROLLS'});
  }
  return {min: Math.min(...rolls), max: Math.max(...rolls), targetHP: defender.stats.hp};
}

module.exports = {pokemonFromSpec, damageRange};
