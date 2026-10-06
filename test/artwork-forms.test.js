import {describe, expect, it} from 'vitest';
import {formKey, parsePokemonCsv, resolveFormId} from '../scripts/lib/artwork-forms.mjs';

const csv = [
  'id,identifier,species_id,height,weight,base_experience,order,is_default',
  '52,meowth,52,4,42,58,60,1',
  '10107,meowth-alola,52,4,42,58,61,0',
  '10161,meowth-galar,52,4,75,58,62,0',
  '849,toxtricity-amped,849,16,400,176,900,1',
  '10184,toxtricity-low-key,849,16,400,176,901,0',
  '479,rotom,479,3,3,154,500,1',
  '10008,rotom-heat,479,3,3,182,501,0',
  '25,pikachu,25,4,60,112,30,1',
  '1,eevee,133,3,65,65,1,1',
].join('\n');
const byDex = parsePokemonCsv(csv);

describe('resolução de formas do PokéAPI', () => {
  it('traduz aspectos regionais e separa underscore de hífen', () => {
    expect(resolveFormId(byDex, 52, ['alolan'])).toBe(10107);
    expect(resolveFormId(byDex, 52, ['galarian'])).toBe(10161);
    expect(resolveFormId(byDex, 849, ['low_key'])).toBe(10184);
  });

  it('forma-base nomeada pelo PokéAPI (amped) resolve ao id padrão e palavras de enfeite são ignoradas', () => {
    expect(resolveFormId(byDex, 849, ['amped'])).toBe(849);
    expect(resolveFormId(byDex, 479, ['heat-appliance'])).toBe(10008);
  });

  it('forma inexistente, espécie de forma única ou sem aspecto útil dá null', () => {
    expect(resolveFormId(byDex, 52, ['sevii'])).toBeNull();
    expect(resolveFormId(byDex, 25, ['alolan'])).toBeNull();
    expect(resolveFormId(byDex, 52, [])).toBeNull();
    expect(resolveFormId(byDex, 9999, ['alolan'])).toBeNull();
  });

  it('chave de forma não depende da ordem dos aspectos', () => {
    expect(formKey(['b', 'a'])).toBe(formKey(['a', 'b']));
  });

  it('cabeçalho inesperado do CSV falha', () => {
    expect(() => parsePokemonCsv('a,b\n1,2')).toThrow(/cabeçalho/);
  });
});
