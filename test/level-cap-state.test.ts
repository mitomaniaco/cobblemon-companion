import {describe, expect, it} from 'vitest';
import type {PlayerIndividual} from '../src/platform/api';
import {guideCapExcluded, guideCapWarnings, LEVEL_CAP_REQUIRED_TEXT} from '../src/features/guide/guide-model';
import {
  LEVEL_CAP_STORAGE_KEY,
  readStoredLevelCapInput,
  readStoredRespectLevelCap,
  resolveEffectiveLevelCap,
  writeStoredLevelCapInput,
  writeStoredRespectLevelCap,
} from '../src/features/guide/level-cap-state';

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

describe('toggle Respeitar level cap', () => {
  it('padrão ligado; desligar é lembrado e religar volta ao padrão', () => {
    const storage = fakeStorage();
    expect(readStoredRespectLevelCap(storage)).toBe(true);
    writeStoredRespectLevelCap(false, storage);
    expect(readStoredRespectLevelCap(storage)).toBe(false);
    writeStoredRespectLevelCap(true, storage);
    expect(readStoredRespectLevelCap(storage)).toBe(true);
  });

  it('armazenamento ausente ou quebrado mantém ligado', () => {
    expect(readStoredRespectLevelCap(null)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('negado');
      },
    } as unknown as Storage;
    expect(readStoredRespectLevelCap(broken)).toBe(true);
  });
});

describe('avisos de quem passa do cap', () => {
  const individual = (uuid: string, level: number, container: 'party' | 'pc'): PlayerIndividual =>
    ({
      uuid,
      level,
      location: container === 'party' ? {container, slot: 0} : {container, box: 0, boxName: null, slot: 0},
    }) as PlayerIndividual;
  const individuals = [
    individual('a', 40, 'party'),
    individual('b', 38, 'party'),
    individual('c', 45, 'pc'),
    individual('d', 50, 'pc'),
    individual('e', 20, 'party'),
  ];
  const trainer = {kind: 'trainer', trainerId: 'brock'} as const;

  it('party acima do cap bloqueia mesmo fora do time; PC só conta se o time o trouxer', () => {
    const warnings = guideCapWarnings({goal: trainer, team: [{uuid: 'a'}, {uuid: 'c'}, {uuid: 'e'}], individuals, levelCap: 35});
    expect(warnings.map((warning) => warning.uuid)).toEqual(['a', 'b', 'c']);
    expect(warnings[0]?.text).toContain('baixe o nível para 35');
    expect(warnings[1]?.text).toContain('guarde no PC');
    expect(warnings[2]?.text).toContain('no PC');
  });

  it('sem cap ou em PvE geral não há aviso; nível igual ao cap passa', () => {
    expect(guideCapWarnings({goal: trainer, team: [], individuals, levelCap: null})).toEqual([]);
    expect(guideCapWarnings({goal: {kind: 'pve'}, team: [], individuals, levelCap: 10})).toEqual([]);
    expect(guideCapWarnings({goal: trainer, team: [], individuals, levelCap: 40}).map((warning) => warning.uuid)).toEqual([]);
  });
});

describe('cap efetivo do guia', () => {
  it('usa o cap do progresso só quando o campo manual está vazio', () => {
    expect(resolveEffectiveLevelCap('', null, 15)).toBe(15);
    expect(resolveEffectiveLevelCap('  ', null, 15)).toBe(15);
    expect(resolveEffectiveLevelCap('30', 30, 15)).toBe(30);
    expect(resolveEffectiveLevelCap('inválido', null, 15)).toBeNull();
    expect(resolveEffectiveLevelCap('', null, null)).toBeNull();
  });
});
