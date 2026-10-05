import {describe, expect, it} from 'vitest';
import {locationLabel} from '../src/domain/location-label';

describe('locationLabel', () => {
  it('mostra o slot 0-based do save como posição 1-based na equipe', () => {
    expect(locationLabel({container: 'party', slot: 0})).toBe('Equipe · slot 1');
    expect(locationLabel({container: 'party', slot: 5})).toBe('Equipe · slot 6');
  });

  it('mostra caixa, nome (quando existe) e slot 1-based no PC', () => {
    expect(locationLabel({container: 'pc', box: 3, boxName: 'Água', slot: 0})).toBe('Caixa 3 · Água · slot 1');
  });

  it('omite o nome da caixa quando o save não traz nome', () => {
    expect(locationLabel({container: 'pc', box: 2, boxName: null, slot: 29})).toBe('Caixa 2 · slot 30');
    expect(locationLabel({container: 'pc', box: 2, boxName: '', slot: 4})).toBe('Caixa 2 · slot 5');
  });
});
