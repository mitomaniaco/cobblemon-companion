import {describe, expect, it} from 'vitest';
import {deriveTexts} from '../scripts/lib/guide-data.mjs';

describe('deriveTexts', () => {
  it('junta PP e descrição dos golpes e a descrição das habilidades, ordenados', () => {
    const lang = {
      'cobblemon.move.tackle.desc': 'Investida.',
      'cobblemon.ability.blaze.desc': 'Chamas.',
      'cobblemon.move.tackle': 'Investida',
    };
    expect(deriveTexts({lang, movePp: {tackle: 35, growl: 40, swift: 20}, moveAccuracy: {tackle: 100, growl: 100}})).toEqual({
      moves: {
        growl: {pp: 40, accuracy: 100, description: null},
        swift: {pp: 20, accuracy: null, description: null},
        tackle: {pp: 35, accuracy: 100, description: 'Investida.'},
      },
      abilities: {blaze: 'Chamas.'},
    });
  });
});
