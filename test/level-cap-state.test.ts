import {describe, expect, it} from 'vitest';
import {guideCapExcluded, LEVEL_CAP_REQUIRED_TEXT} from '../src/features/guide/guide-model';
import {LEVEL_CAP_STORAGE_KEY, readStoredLevelCapInput, writeStoredLevelCapInput} from '../src/features/guide/level-cap-state';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe('level cap lembrado entre sessões', () => {
  it('grava o cap válido e lê de volta', () => {
    const storage = fakeStorage();
    writeStoredLevelCapInput(' 55 ', storage);
    expect(storage.data.get(LEVEL_CAP_STORAGE_KEY)).toBe('55');
    expect(readStoredLevelCapInput(storage)).toBe('55');
  });

  it('campo vazio ou inválido apaga a lembrança em vez de guardar lixo', () => {
    const storage = fakeStorage({[LEVEL_CAP_STORAGE_KEY]: '55'});
    writeStoredLevelCapInput('', storage);
    expect(storage.data.has(LEVEL_CAP_STORAGE_KEY)).toBe(false);
    writeStoredLevelCapInput('55', storage);
    writeStoredLevelCapInput('abc', storage);
    expect(storage.data.has(LEVEL_CAP_STORAGE_KEY)).toBe(false);
  });

  it('valor guardado fora de 1–100 ou ilegível volta como campo vazio (desconhecido)', () => {
    expect(readStoredLevelCapInput(fakeStorage({[LEVEL_CAP_STORAGE_KEY]: '999'}))).toBe('');
    expect(readStoredLevelCapInput(fakeStorage({[LEVEL_CAP_STORAGE_KEY]: 'x'}))).toBe('');
    expect(readStoredLevelCapInput(fakeStorage())).toBe('');
    expect(readStoredLevelCapInput(null)).toBe('');
  });

  it('armazenamento que lança erro nunca derruba a tela', () => {
    const broken = {
      getItem: () => {
        throw new Error('negado');
      },
      setItem: () => {
        throw new Error('negado');
      },
      removeItem: () => {
        throw new Error('negado');
      },
    };
    expect(readStoredLevelCapInput(broken)).toBe('');
    expect(() => writeStoredLevelCapInput('55', broken)).not.toThrow();
  });
});

describe('excluídos pelo level cap', () => {
  it('separa só os excluídos por causa do cap dos demais motivos', () => {
    const excluded = [
      {uuid: 'a', reason: 'acima do level cap (55)'},
      {uuid: 'b', reason: 'forma desconhecida'},
      {uuid: 'c', reason: 'Acima do Level Cap (40)'},
    ];
    expect(guideCapExcluded(excluded).map((entry) => entry.uuid)).toEqual(['a', 'c']);
    expect(guideCapExcluded([])).toEqual([]);
  });

  it('o aviso de cap obrigatório pede para informar o cap e cita o risco', () => {
    expect(LEVEL_CAP_REQUIRED_TEXT).toContain('Informe o level cap');
    expect(LEVEL_CAP_REQUIRED_TEXT).toContain('proibidos');
  });
});
