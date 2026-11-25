import {describe, expect, it} from 'vitest';
import {moveText} from '../src/features/guide/texts';

describe('moveText: precisão', () => {
  it('traz a precisão do Showdown como número', () => {
    expect(moveText('cobblemon:tackle').accuracy).toBe(100);
    expect(moveText('cobblemon:thunder').accuracy).toBe(70);
  });

  it('golpe que nunca erra (accuracy true no Showdown) é null, não 0 nem 100', () => {
    expect(moveText('cobblemon:swift').accuracy).toBeNull();
  });

  it('golpe fora do catálogo não ganha valor inventado', () => {
    expect(moveText('cobblemon:syntheticnotamove')).toEqual({pp: null, accuracy: null, description: null});
  });
});
