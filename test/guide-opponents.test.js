import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {trainerOpponents} = require('../electron/lib/guide/opponents.cjs');

const member = (speciesId, aspects, extra = {}) => ({
  speciesId,
  level: 30,
  moves: ['cobblemon:tackle'],
  ability: 'cobblemon:sturdy',
  nature: 'hardy',
  heldItem: null,
  aspects,
  ...extra,
});
const trainer = (team) => [{id: 'synthetic:forms', name: 'Forms', format: 'singles', team}];

describe('forma do adversário pelo catálogo', () => {
  it('usa a forma regional cujos aspects coincidem em vez de calcular a forma normal', () => {
    const {opponents} = trainerOpponents(
      trainer([member('cobblemon:geodude', ['alolan'], {ability: 'cobblemon:sturdy'})]),
      'synthetic:forms',
    );
    expect(opponents.map((opponent) => opponent.spec.species.name)).toEqual(['Geodude-Alola']);
  });

  it('sem aspects é a forma base', () => {
    const {opponents} = trainerOpponents(trainer([member('cobblemon:geodude', [])]), 'synthetic:forms');
    expect(opponents[0].spec.species.name).toBe('Geodude');
  });

  it('aspects sem forma correspondente removem o adversário e dizem por quê', () => {
    const {opponents, assumptions} = trainerOpponents(trainer([member('cobblemon:geodude', ['inexistente'])]), 'synthetic:forms');
    expect(opponents).toEqual([]);
    expect(assumptions.join(' ')).toContain('sem correspondência no catálogo');
  });
});
