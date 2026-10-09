import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const calc = require('@smogon/calc');
const {damageRange, damageRolls} = require('../electron/lib/calc-profile.cjs');

const garchomp = () => new calc.Pokemon(9, 'Garchomp', {level: 50});
const blissey = () => new calc.Pokemon(9, 'Blissey', {level: 50});

describe('damageRolls', () => {
  it('replica o dano fixo em 16 rolls', () => {
    expect(damageRolls(garchomp(), blissey(), 'Seismic Toss')).toEqual(new Array(16).fill(50));
    expect(damageRolls(garchomp(), blissey(), 'Dragon Rage')).toEqual(new Array(16).fill(40));
  });

  it('soma os acertos de golpes multi-hit índice a índice', () => {
    const double = damageRange(garchomp(), blissey(), 'Double Kick');
    expect(double.min).toBeGreaterThan(0);
    expect(double.max).toBeGreaterThan(double.min);
    const result = calc.calculate(9, garchomp(), blissey(), new calc.Move(9, 'Double Kick'));
    expect([double.min, double.max]).toEqual(result.range());
    const bullet = calc.calculate(9, garchomp(), blissey(), new calc.Move(9, 'Bullet Seed'));
    const bulletRange = damageRange(garchomp(), blissey(), 'Bullet Seed');
    expect([bulletRange.min, bulletRange.max]).toEqual(bullet.range());
  });

  it('devolve zeros para imunidade e golpes de status', () => {
    expect(damageRolls(garchomp(), new calc.Pokemon(9, 'Gengar', {level: 50}), 'Seismic Toss')).toEqual(new Array(16).fill(0));
    expect(damageRolls(new calc.Pokemon(9, 'Blissey', {level: 50}), new calc.Pokemon(9, 'Gengar', {level: 50}), 'Tackle')).toEqual(
      new Array(16).fill(0),
    );
    expect(damageRolls(garchomp(), blissey(), 'Swords Dance')).toEqual(new Array(16).fill(0));
  });

  it('mantém os 16 rolls crescentes de um golpe comum', () => {
    const rolls = damageRolls(garchomp(), blissey(), 'Earthquake');
    expect(rolls).toHaveLength(16);
    expect([...rolls].sort((a, b) => a - b)).toEqual(rolls);
    expect(rolls[15]).toBeGreaterThan(rolls[0]);
  });
});
