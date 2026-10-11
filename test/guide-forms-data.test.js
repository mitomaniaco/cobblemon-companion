import {describe, expect, it} from 'vitest';
import {deriveEvolutions, deriveForms, formIdOf} from '../scripts/lib/guide-data.mjs';

describe('formas no gerador do guia', () => {
  it('formIdOf segue o FormId do save', () => {
    expect(formIdOf('Hisui')).toBe('hisui');
    expect(formIdOf("Pa'u")).toBe('pau');
    expect(formIdOf('Galar-Zen')).toBe('galarzen');
  });

  it('deriveForms dá evoluções e golpes próprios; forma sem golpes herda (learnset null) e sem evoluções herda as da espécie', () => {
    const species = {b: {forms: [{name: 'Hisui', aspects: ['hisuian']}]}};
    const json = {
      evolutions: [{variant: 'level_up', result: 'b', requirements: []}],
      forms: [
        {
          name: 'Hisui',
          aspects: ['hisuian'],
          evolutions: [{variant: 'level_up', result: 'b hisuian', requirements: []}],
          moves: ['1:tackle'],
        },
        {name: 'Gmax', aspects: ['gmax']},
      ],
    };
    const forms = deriveForms(json, species);
    expect(forms.hisui.evolutions[0]).toEqual({to: 'cobblemon:b', toFormId: 'hisui', method: 'level_up', requirement: ''});
    expect(forms.hisui.learnset.levelUp).toEqual([{level: 1, moveId: 'cobblemon:tackle'}]);
    expect(forms.gmax.learnset).toBeNull();
    expect(forms.gmax.evolutions).toEqual([{to: 'cobblemon:b', toFormId: 'normal', method: 'level_up', requirement: ''}]);
  });

  it('aspect sem forma correspondente no alvo evolui para a forma normal', () => {
    const [evolution] = deriveEvolutions([{variant: 'level_up', result: 'b zzz', requirements: []}], {
      b: {forms: [{name: 'Hisui', aspects: ['hisuian']}]},
    });
    expect(evolution.toFormId).toBe('normal');
  });
});
