import {describe, expect, it} from 'vitest';
import {heldItemCatalogName, itemLabel, moveLabel} from '../src/domain/catalog-labels';

describe('heldItemCatalogName', () => {
  it('mapeia o id do Cobblemon removendo namespace e underscores', () => {
    expect(heldItemCatalogName('cobblemon:focus_sash')).toBe('Focus Sash');
    expect(heldItemCatalogName('cobblemon:mystic_water')).toBe('Mystic Water');
  });

  it('não mapeia outro namespace, id desconhecido nem id com hífen', () => {
    expect(heldItemCatalogName('mega_showdown:venusaurite')).toBeNull();
    expect(heldItemCatalogName('focus_sash')).toBeNull();
    expect(heldItemCatalogName('cobblemon:item_inexistente')).toBeNull();
    expect(heldItemCatalogName('cobblemon:focus-sash')).toBeNull();
  });

  it('não herda propriedades do protótipo como se fossem itens', () => {
    expect(heldItemCatalogName('cobblemon:constructor')).toBeNull();
  });
});

describe('rótulos com fallback', () => {
  it('itemLabel usa o catálogo e, fora dele, o id em title case', () => {
    expect(itemLabel('cobblemon:focus_sash')).toBe('Focus Sash');
    expect(itemLabel('cobblemon:item_inexistente')).toBe('Item Inexistente');
    expect(itemLabel('mega_showdown:venusaurite')).toBe('Venusaurite');
  });

  it('moveLabel corrige ids colados e cai no title case para golpes desconhecidos', () => {
    expect(moveLabel('cobblemon:calmmind')).toBe('Calm Mind');
    expect(moveLabel('cobblemon:golpe_inexistente')).toBe('Golpe Inexistente');
  });
});
