import {describe, expect, it} from 'vitest';
import {
  formatStat,
  MAX_EV,
  MAX_EV_TOTAL,
  MAX_IV,
  NO_OVERRIDE_TEXT,
  statFill,
  statValue,
  summarizeEvs,
  UNKNOWN_STAT_TEXT,
  type StatFact,
} from '../src/domain/stats-format';

const provenance = {sourceKind: 'party' as const, nbtPath: 'Synthetic.Party[0].EVs.hp'};
const known = (value: number): StatFact => ({state: 'known', value, provenance});
const knownNullable = (value: number | null): StatFact => ({state: 'known', value, provenance});
const unknown: StatFact = {state: 'unknown', reason: 'not-captured', provenance};

describe('limites do jogo', () => {
  it('IV até 31, EV até 252 por atributo e 510 no total', () => {
    expect([MAX_IV, MAX_EV, MAX_EV_TOTAL]).toEqual([31, 252, 510]);
  });
});

describe('texto de IV e EV', () => {
  it('mostra o número como está no save, sem converter (0, 6, 31 e 252)', () => {
    expect(formatStat(known(0))).toBe('0');
    expect(formatStat(known(6))).toBe('6');
    expect(formatStat(known(31))).toBe('31');
    expect(formatStat(known(252))).toBe('252');
  });

  it('desconhecido nunca vira zero e Hyper Training sem override tem texto próprio', () => {
    expect(formatStat(unknown)).toBe(UNKNOWN_STAT_TEXT);
    expect(formatStat(unknown)).not.toBe('0');
    expect(formatStat(knownNullable(null))).toBe(NO_OVERRIDE_TEXT);
    expect(statValue(unknown)).toBeNull();
    expect(statValue(knownNullable(null))).toBeNull();
    expect(statValue(known(0))).toBe(0);
  });
});

describe('barra de preenchimento', () => {
  it('é proporcional ao máximo do atributo e limitada a 0–1', () => {
    expect(statFill(known(252), MAX_EV)).toBe(1);
    expect(statFill(known(126), MAX_EV)).toBeCloseTo(0.5, 5);
    expect(statFill(known(31), MAX_IV)).toBe(1);
    expect(statFill(known(0), MAX_IV)).toBe(0);
    expect(statFill(known(300), MAX_EV)).toBe(1);
    expect(statFill(known(-1), MAX_EV)).toBe(0);
  });

  it('sem valor conhecido não há barra', () => {
    expect(statFill(unknown, MAX_EV)).toBeNull();
    expect(statFill(knownNullable(null), MAX_IV)).toBeNull();
  });
});

describe('total de EVs', () => {
  it('soma os seis e mostra total/510 (252/252/6 = 510)', () => {
    const summary = summarizeEvs([known(6), known(0), known(0), known(252), known(0), known(252)]);
    expect(summary).toMatchObject({total: 510, knownCount: 6, text: 'EVs 510/510', fill: 1});
  });

  it('zerados somam 0 e a barra fica vazia', () => {
    expect(summarizeEvs([known(0), known(0), known(0), known(0), known(0), known(0)])).toMatchObject({
      total: 0,
      text: 'EVs 0/510',
      fill: 0,
    });
  });

  it('um único desconhecido impede o total: nunca soma como zero', () => {
    const summary = summarizeEvs([known(252), unknown, known(0), known(0), known(0), known(6)]);
    expect(summary).toMatchObject({total: null, knownCount: 5, fill: null});
    expect(summary.text).toBe('EVs incompletos (5/6 capturados)');
  });
});
