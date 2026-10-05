import {describe, expect, it} from 'vitest';
import {abilityName, moveDisplay, natureDisplay, speciesDisplay} from '../src/domain/dex';

describe('dados de exibição', () => {
  it('mostra nome e tipos da espécie só na forma normal', () => {
    expect(speciesDisplay('cobblemon:gardevoir', 'normal')).toEqual({name: 'Gardevoir', types: ['Psychic', 'Fairy']});
    expect(speciesDisplay('cobblemon:bulbasaur', 'synthetic-alternate')).toEqual({name: 'Bulbasaur', types: []});
    expect(speciesDisplay('cobblemon:not_a_species', 'normal')).toEqual({name: 'Not A Species', types: []});
  });

  it('resolve golpes pelo dex quando fora do catálogo e zera poder de golpes de status', () => {
    expect(moveDisplay('cobblemon:disarmingvoice')).toEqual({name: 'Disarming Voice', type: 'Fairy', category: 'Special', power: 40});
    expect(moveDisplay('cobblemon:calmmind')).toEqual({name: 'Calm Mind', type: 'Psychic', category: 'Status', power: null});
    expect(moveDisplay('cobblemon:unknown_move')).toEqual({name: 'Unknown Move', type: null, category: null, power: null});
  });

  it('descreve naturezas com aumento e redução, ou neutras', () => {
    expect(natureDisplay('cobblemon:adamant')).toEqual({name: 'Adamant', plus: 'atk', minus: 'spa'});
    expect(natureDisplay('cobblemon:hardy')).toEqual({name: 'Hardy', plus: null, minus: null});
    expect(abilityName('cobblemon:synchronize')).toBe('Synchronize');
  });
});
