import {describe, expect, it} from 'vitest';
import {
  createMoveSwapPlan,
  getMoveSwapView,
  invalidateMoveSwapPlan,
  selectMoveSwapIndividual,
} from '../src/domain/move-swap';
import type {PlayerIndividual} from '../src/platform/api';

const unknownFact = (nbtPath: string) => ({
  state: 'unknown' as const,
  reason: 'not-captured' as const,
  provenance: {sourceKind: 'party' as const, nbtPath},
});

function unknownBattleStats(): PlayerIndividual['battleStats'] {
  return {
    ivs: {
      hp: unknownFact('Slot0.IVs.Base.cobblemon:hp'),
      atk: unknownFact('Slot0.IVs.Base.cobblemon:attack'),
      def: unknownFact('Slot0.IVs.Base.cobblemon:defence'),
      spa: unknownFact('Slot0.IVs.Base.cobblemon:special_attack'),
      spd: unknownFact('Slot0.IVs.Base.cobblemon:special_defence'),
      spe: unknownFact('Slot0.IVs.Base.cobblemon:speed'),
    },
    hyperTrainedIvs: {
      hp: unknownFact('Slot0.IVs.HyperTrained.cobblemon:hp'),
      atk: unknownFact('Slot0.IVs.HyperTrained.cobblemon:attack'),
      def: unknownFact('Slot0.IVs.HyperTrained.cobblemon:defence'),
      spa: unknownFact('Slot0.IVs.HyperTrained.cobblemon:special_attack'),
      spd: unknownFact('Slot0.IVs.HyperTrained.cobblemon:special_defence'),
      spe: unknownFact('Slot0.IVs.HyperTrained.cobblemon:speed'),
    },
    evs: {
      hp: unknownFact('Slot0.EVs.cobblemon:hp'),
      atk: unknownFact('Slot0.EVs.cobblemon:attack'),
      def: unknownFact('Slot0.EVs.cobblemon:defence'),
      spa: unknownFact('Slot0.EVs.cobblemon:special_attack'),
      spd: unknownFact('Slot0.EVs.cobblemon:special_defence'),
      spe: unknownFact('Slot0.EVs.cobblemon:speed'),
    },
  };
}

function individual(overrides: Partial<PlayerIndividual> = {}): PlayerIndividual {
  return {
    uuid: 'pikachu-uuid',
    speciesId: 'pikachu',
    formId: 'unknown',
    level: 30,
    location: {container: 'party', slot: 0},
    equippedMoves: [
      {id: 'thunder-shock', pp: 20, ppUps: 0},
      {id: 'quick-attack', pp: 30, ppUps: 0},
    ],
    equippedMovesKnown: true,
    learnedMoves: [
      {id: 'thunder-shock', ppUps: 0},
      {id: 'quick-attack', ppUps: 0},
      {id: 'iron-tail', ppUps: 0},
      {id: 'iron-tail', ppUps: 1},
      {id: 'volt-tackle', ppUps: 0},
    ],
    learnedMovesKnown: true,
    observed: {nature: null, ability: null, heldItem: null},
    battleStats: unknownBattleStats(),
    ...overrides,
  };
}

describe('planejamento de troca de golpe', () => {
  it('usa apenas golpes aprendidos disponíveis, remove equipados e deduplica candidatos', () => {
    const view = getMoveSwapView(individual(), createMoveSwapPlan('pikachu-uuid'));

    expect(view.status).toBe('ready');
    if (view.status !== 'ready') return;
    expect(view.candidates).toEqual([
      {id: 'iron-tail', evidence: 'observed-learned-on-individual'},
      {id: 'volt-tackle', evidence: 'observed-learned-on-individual'},
    ]);
  });

  it('mostra antes e depois somente para um slot e candidato válidos do mesmo UUID', () => {
    const view = getMoveSwapView(individual(), {
      individualUuid: 'pikachu-uuid',
      slotIndex: 1,
      candidateMoveId: 'iron-tail',
    });

    expect(view.status).toBe('ready');
    if (view.status !== 'ready') return;
    expect(view.preview).toEqual({
      slotIndex: 1,
      beforeMoveId: 'quick-attack',
      afterMoveId: 'iron-tail',
      evidence: 'observed-learned-on-individual',
    });
  });

  it('não reaproveita o plano ao trocar de UUID e invalida após atualizar o save', () => {
    const plan = {individualUuid: 'pikachu-uuid', slotIndex: 0, candidateMoveId: 'iron-tail'};

    expect(selectMoveSwapIndividual(plan, 'pikachu-uuid')).toEqual(plan);
    expect(selectMoveSwapIndividual(plan, 'floatzel-uuid')).toEqual(createMoveSwapPlan('floatzel-uuid'));
    expect(invalidateMoveSwapPlan()).toEqual(createMoveSwapPlan());
  });

  it('fica inconclusivo quando qualquer lista necessária é desconhecida', () => {
    expect(getMoveSwapView(individual({equippedMovesKnown: false}), createMoveSwapPlan()).status).toBe('inconclusive');
    expect(getMoveSwapView(individual({learnedMovesKnown: false}), createMoveSwapPlan()).status).toBe('inconclusive');
    expect(getMoveSwapView(individual({equippedMovesKnown: false, learnedMovesKnown: false}), createMoveSwapPlan()).status).toBe('inconclusive');
  });

  it('mostra estado vazio quando as listas conhecidas não oferecem uma troca', () => {
    expect(getMoveSwapView(individual({equippedMoves: []}), createMoveSwapPlan())).toEqual({
      status: 'empty',
      reason: 'no-equipped',
    });
    expect(getMoveSwapView(individual({learnedMoves: []}), createMoveSwapPlan())).toEqual({
      status: 'empty',
      reason: 'no-candidates',
    });
  });
});
