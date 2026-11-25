import {describe, expect, it} from 'vitest';
import {
  acquireRouteText,
  efficacyView,
  focusReasons,
  hitsToKnockOut,
  moveRow,
  percentRangeLabel,
} from '../src/features/guide/matchup-model';
import {damageLevel, hpDealtSegments} from '../src/ui/HpBar';

describe('efficacyView', () => {
  it.each([
    {input: 4, kind: 'super', multiplier: '×4'},
    {input: 2, kind: 'super', multiplier: '×2'},
    {input: 1, kind: 'neutral', multiplier: null},
    {input: 0.5, kind: 'resisted', multiplier: '×½'},
    {input: 0.25, kind: 'resisted', multiplier: '×¼'},
    {input: 0, kind: 'immune', multiplier: '×0'},
  ] as const)('eficácia $input', ({input, kind, multiplier}) => {
    expect(efficacyView(input)).toMatchObject({kind, multiplier});
  });

  it('eficácia nula nunca vira zero nem "Eficaz"', () => {
    expect(efficacyView(null)).toEqual({kind: 'unknown', label: 'Sem cálculo', multiplier: null});
    expect(efficacyView(undefined).kind).toBe('unknown');
  });

  it('golpe de status tem rótulo próprio', () => {
    expect(efficacyView(null, true).label).toBe('Golpe de status');
  });
});

describe('damageLevel', () => {
  it.each([
    {range: [80, 90], level: 'great'},
    {range: [60, 70], level: 'good'},
    {range: [30, 40], level: 'some'},
    {range: [10, 20], level: 'little'},
    {range: [0, 0], level: 'little'},
    {range: [50, 100], level: 'great'},
    {range: [20, 30], level: 'some'},
  ])('faixa $range → $level (pelo ponto médio)', ({range, level}) => {
    expect(damageLevel(range[0], range[1])).toBe(level);
  });
});

describe('hpDealtSegments', () => {
  it('separa o que sobra, a faixa e o dano garantido', () => {
    const segments = hpDealtSegments(100, 30, 40);
    expect(segments.keep).toBeCloseTo(0.6);
    expect(segments.maybe).toBeCloseTo(0.1);
    expect(segments.sure).toBeCloseTo(0.3);
  });

  it('limita o dano acima de 100% e mantém a imunidade toda cinza', () => {
    expect(hpDealtSegments(100, 104.5, 123.1)).toMatchObject({keep: 0, maybe: 0, sure: 1});
    expect(hpDealtSegments(100, 0, 0)).toMatchObject({keep: 1, maybe: 0, sure: 0, level: 'little'});
  });
});

describe('moveRow', () => {
  const equipped = {id: 'x', evaluated: true, source: 'equipado'} as const;

  it('golpe avaliado com dano mostra a faixa e a eficácia', () => {
    const row = moveRow(equipped, {moveId: 'x', minPercent: 30, maxPercent: 36, effectiveness: 2}, 'Special', 'x');
    expect(row).toMatchObject({kind: 'damage', best: true, level: 'some'});
  });

  it('golpe sem eficácia conhecida continua com a faixa e vira "Sem cálculo"', () => {
    const row = moveRow(equipped, {moveId: 'x', minPercent: 66.7, maxPercent: 66.7, effectiveness: null}, 'Special', null);
    expect(row).toMatchObject({kind: 'damage', efficacy: {kind: 'unknown'}});
  });

  it('golpe fora do cálculo é de status quando o dex diz Status e bloqueado nos demais casos', () => {
    const skipped = {id: 'y', evaluated: false, source: 'equipado'} as const;
    expect(moveRow(skipped, undefined, 'Status', null).kind).toBe('status');
    expect(moveRow(skipped, undefined, null, null)).toMatchObject({kind: 'blocked', inCatalog: false});
  });

  it('golpe do catálogo sem confronto calculado é bloqueado, mas não é tratado como fora do catálogo', () => {
    expect(moveRow(equipped, undefined, null, null)).toMatchObject({kind: 'blocked', inCatalog: true});
  });
});

describe('textos', () => {
  it('imunidade mostra 0% e explica o motivo', () => {
    const row = moveRow(
      {id: 'x', evaluated: true, source: 'equipado'},
      {moveId: 'x', minPercent: 0, maxPercent: 0, effectiveness: 0},
      'Special',
      null,
    );
    expect(percentRangeLabel(0, 0)).toBe('0%');
    if (row.kind !== 'damage') throw new Error('esperava dano');
    expect(focusReasons(row, false).lines).toEqual(['O adversário não sofre dano deste golpe (×0).', 'Não tira HP do adversário.']);
  });

  it('faixas', () => {
    expect(percentRangeLabel(30.2, 36.4)).toBe('30–36%');
    expect(percentRangeLabel(66.7, 66.7)).toBe('67%');
    expect(percentRangeLabel(2.1, 3.4)).toBe('2,1–3,4%');
    expect(hitsToKnockOut(30, 36)).toEqual({fewest: 3, most: 4});
    expect(hitsToKnockOut(0, 0)).toBeNull();
  });

  it('o ovo avisa que precisa de um Pokémon novo', () => {
    expect(acquireRouteText({kind: 'ovo', level: null})).toContain('precisa de um Pokémon novo');
    expect(acquireRouteText({kind: 'nível', level: 35})).toBe('Nível 35');
  });
});
