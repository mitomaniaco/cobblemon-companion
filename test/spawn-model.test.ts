import {describe, expect, it} from 'vitest';
import {biomeTagLabel, spawnLines} from '../src/features/guide/spawn-model';

describe('biomeTagLabel', () => {
  it('traduz tags conhecidas, com ou sem namespace', () => {
    expect(biomeTagLabel('has_structure/end_city')).toBe('Cidade do End');
    expect(biomeTagLabel('cobblemon:is_cave')).toBe('Caverna');
  });

  it('deriva o texto de tags desconhecidas', () => {
    expect(biomeTagLabel('is_snowy_taiga')).toBe('snowy taiga');
    expect(biomeTagLabel('has_structure/ocean_ruin')).toBe('Estrutura ocean ruin');
  });
});

describe('spawnLines', () => {
  it('é nulo sem dados de spawn', () => {
    expect(spawnLines(null)).toBeNull();
  });

  it('junta biomas e omite o vazio dos excluídos', () => {
    expect(
      spawnLines({signatureItem: 'cobblemon:hard_stone', biomes: ['is_cave', 'is_plateau'], excludedBiomes: ['is_void', 'is_nether']}),
    ).toEqual({item: 'cobblemon:hard_stone', biomes: 'Caverna, Planalto', excluded: 'Nether'});
  });
});
