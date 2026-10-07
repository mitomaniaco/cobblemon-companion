import {describe, expect, it} from 'vitest';
import {pikaStarDisplayStatus} from '../src/features/guide/progress-display-model';

describe('status de Pika Star', () => {
  it('distingue advancement cumprido, não alcançado e desconhecido', () => {
    expect(pikaStarDisplayStatus(true)).toBe('Verificado · concluído');
    expect(pikaStarDisplayStatus(false)).toBe('Não obtido');
    expect(pikaStarDisplayStatus(null)).toBe('Não verificado');
  });
});
