import {describe, expect, it} from 'vitest';
import {
  buildTrainingPlanRequest,
  TRAINING_CAP_ORIGIN_LABEL,
  TRAINING_EV_TOTAL_LIMIT,
  TRAINING_ROLE_LABEL,
  trainingEvRows,
  trainingEvTotals,
  trainingLevelLabel,
} from '../src/features/guide/training-model';
import type {GuideResult, PlayerSnapshot, TrainingEvPlan} from '../src/platform/api';

const snapshot = {
  sources: [
    {kind: 'party', sha256: 'a'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
    {kind: 'pc', sha256: 'b'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
  ],
} as unknown as PlayerSnapshot;

const team: GuideResult['team'] = [
  {
    uuid: 'u1',
    speciesId: 'cobblemon:gardevoir',
    level: 20,
    reason: 'x',
    moves: [
      {id: 'cobblemon:psychic', evaluated: true, source: 'equipado'},
      {id: 'cobblemon:growl', evaluated: false, source: 'equipado'},
    ],
    item: {id: null, status: 'nenhum', reason: 'y'},
    matchups: [],
    acquire: [{moveId: 'cobblemon:psychic', requirement: 'nível 24', gainPercent: 5, replacesMoveId: null, reason: 'z'}],
  },
];

describe('pedido de treino', () => {
  it('cap informado vai com origem informada; sem cap vai nulo e origem desconhecida (nunca presumido)', () => {
    expect(buildTrainingPlanRequest(snapshot, {team}, 15, 'job-1')).toEqual({
      sources: [
        {kind: 'party', sha256: 'a'.repeat(64)},
        {kind: 'pc', sha256: 'b'.repeat(64)},
      ],
      team: [{uuid: 'u1', usefulMoveIds: ['cobblemon:psychic']}],
      levelCap: 15,
      capOrigin: 'informado',
      jobId: 'job-1',
    });
    const unknown = buildTrainingPlanRequest(snapshot, {team}, null);
    expect(unknown).toMatchObject({levelCap: null, capOrigin: 'desconhecida'});
    expect(unknown).not.toHaveProperty('jobId');
  });

  it('não há pedido sem time', () => {
    expect(buildTrainingPlanRequest(snapshot, {team: []}, 15)).toBeNull();
  });
});

describe('nível-alvo', () => {
  it('sem alvo diz que não está determinado; com alvo mostra de onde para onde e o cap', () => {
    expect(trainingLevelLabel({level: 20, targetLevel: null, levelCap: null})).toBe('Nv. 20 · nível-alvo não determinado');
    expect(trainingLevelLabel({level: 20, targetLevel: 30, levelCap: 30})).toBe('Nv. 20 → 30 (cap 30)');
    expect(trainingLevelLabel({level: 30, targetLevel: 30, levelCap: 30})).toBe('Nv. 30 · já no alvo');
  });

  it('rotula cap conhecido e cap não determinado sem atribuir a origem manual', () => {
    expect(TRAINING_CAP_ORIGIN_LABEL.desconhecida).toBe('cap não determinado');
    expect(TRAINING_CAP_ORIGIN_LABEL.informado).toBe('cap conhecido');
    expect(TRAINING_ROLE_LABEL['atacante-especial']).toBe('Atacante especial');
  });
});

describe('EVs do treino', () => {
  const currentEvs = (overrides: Partial<TrainingEvPlan['currentEvs']>): TrainingEvPlan['currentEvs'] => ({
    hp: 0,
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    ...overrides,
  });

  it('EV desconhecido continua desconhecido (nunca vira zero) e atributos zerados sem sugestão somem', () => {
    const rows = trainingEvRows({currentEvs: currentEvs({spa: null, spe: 100, hp: 0}), suggestedEvs: {spa: 252}});
    expect(rows).toEqual([
      {stat: 'spa', current: null, suggested: 252},
      {stat: 'spe', current: 100, suggested: null},
    ]);
  });

  it('desconhecido sem sugestão (distribuição não determinada) não vira linha de EV', () => {
    expect(trainingEvRows({currentEvs: currentEvs({atk: null, def: null}), suggestedEvs: {}})).toEqual([]);
  });

  it('soma a distribuição e valida 252 por atributo e 510 no total', () => {
    expect(trainingEvTotals({spa: 252, spe: 252, hp: 4})).toEqual({total: 508, withinLimits: true});
    expect(trainingEvTotals({spa: 252, spe: 252, hp: 6})).toEqual({total: 510, withinLimits: true});
    expect(trainingEvTotals({spa: 252, spe: 252, hp: 8})).toEqual({total: 512, withinLimits: false});
    expect(trainingEvTotals({spa: 253})).toEqual({total: 253, withinLimits: false});
    expect(trainingEvTotals({})).toEqual({total: 0, withinLimits: true});
    expect(TRAINING_EV_TOTAL_LIMIT).toBe(510);
  });
});
