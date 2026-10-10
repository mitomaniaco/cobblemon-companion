import {describe, expect, it} from 'vitest';
import {deriveTexts} from '../scripts/lib/guide-data.mjs';

describe('deriveTexts', () => {
  it('junta PP e descrição dos golpes e a descrição das habilidades, ordenados', () => {
    const lang = {
      'cobblemon.move.tackle.desc': 'Investida.',
      'cobblemon.ability.blaze.desc': 'Chamas.',
      'cobblemon.move.tackle': 'Investida',
    };
    expect(deriveTexts({lang, movePp: {tackle: 35, growl: 40}})).toEqual({
      moves: {growl: {pp: 40, description: null}, tackle: {pp: 35, description: 'Investida.'}},
      abilities: {blaze: 'Chamas.'},
    });
  });
});
