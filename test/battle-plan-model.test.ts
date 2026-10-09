import {describe, expect, it} from 'vitest';
import {
  BATTLE_PLAN_DOUBLES_TEXT,
  battlePlanBagLabel,
  battlePlanDamageLabel,
  battlePlanFirstToActLabel,
  battleSimulationStepLabel,
  battleSimulationSummary,
  buildBattlePlanRequest,
} from '../src/features/guide/battle-plan-model';
import {createJobState, jobReducer, type JobState} from '../src/features/guide/job-model';

import type {BattlePlanResult, BattleSimulation, GuideResult, PlayerSnapshot} from '../src/platform/api';

const battlePlanReducer = jobReducer<BattlePlanResult>;
const createBattlePlanState = createJobState<BattlePlanResult>;

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
    level: 30,
    reason: 'x',
    moves: [
      {id: 'cobblemon:psychic', evaluated: true, source: 'equipado'},
      {id: 'cobblemon:growl', evaluated: false, source: 'equipado'},
    ],
    item: {id: 'cobblemon:choice_specs', status: 'obter', reason: 'y'},
    matchups: [],
    acquire: [],
  },
  {
    uuid: 'u2',
    speciesId: 'cobblemon:bulbasaur',
    level: 28,
    reason: 'x',
    moves: [{id: 'cobblemon:tackle', evaluated: true, source: 'aprendido'}],
    item: {id: null, status: 'nenhum', reason: 'z'},
    matchups: [],
    acquire: [],
  },
];

const planResult = (overrides: Partial<BattlePlanResult> = {}): BattlePlanResult => ({
  trainer: {id: 'brock', name: 'Brock', maxItemUses: 2, bag: [{itemId: 'cobblemon:potion', quantity: 1}]},
  status: 'plano',
  scopeReason: null,
  lead: null,
  simulation: null,
  entries: [],
  trainerRisks: [],
  assumptions: [],
  limits: [],
  ...overrides,
});

describe('pedido do plano de batalha', () => {
  it('usa só os golpes avaliados e o item sugerido de cada membro, com os hashes das fontes', () => {
    const request = buildBattlePlanRequest(snapshot, {goal: {kind: 'trainer', trainerId: 'brock'}, team}, 55, true, 'job-1');
    expect(request).toEqual({
      sources: [
        {kind: 'party', sha256: 'a'.repeat(64)},
        {kind: 'pc', sha256: 'b'.repeat(64)},
      ],
      trainerId: 'brock',
      levelCap: 55,
      respectLevelCap: true,
      team: [
        {uuid: 'u1', moveIds: ['cobblemon:psychic'], itemId: 'cobblemon:choice_specs'},
        {uuid: 'u2', moveIds: ['cobblemon:tackle'], itemId: null},
      ],
      jobId: 'job-1',
    });
  });

  it('não pede plano para PvE geral nem para guia sem time', () => {
    expect(buildBattlePlanRequest(snapshot, {goal: {kind: 'pve'}, team}, null, true)).toBeNull();
    expect(buildBattlePlanRequest(snapshot, {goal: {kind: 'trainer', trainerId: 'brock'}, team: []}, null, true)).toBeNull();
  });

  it('omite jobId quando não há', () => {
    expect(buildBattlePlanRequest(snapshot, {goal: {kind: 'trainer', trainerId: 'brock'}, team}, null, true)).not.toHaveProperty('jobId');
  });
});

describe('estado da montagem (job)', () => {
  const started = (state: JobState<BattlePlanResult>, requestId: number) => battlePlanReducer(state, {type: 'build-started', requestId});

  it('ignora respostas de montagens antigas e depois de cancelar', () => {
    let state = started(createBattlePlanState(), 1);
    state = started(state, 2);
    expect(battlePlanReducer(state, {type: 'build-succeeded', requestId: 1, result: planResult()})).toBe(state);

    const canceled = battlePlanReducer(state, {type: 'build-canceled', requestId: 2});
    expect(canceled.phase).toBe('canceled');
    expect(battlePlanReducer(canceled, {type: 'build-succeeded', requestId: 2, result: planResult()})).toBe(canceled);
    expect(battlePlanReducer(canceled, {type: 'build-failed', requestId: 2, error: 'abortado'})).toBe(canceled);
  });

  it('guarda resultado e erro da montagem corrente e descarta o plano antigo ao recomeçar ou resetar', () => {
    const ready = battlePlanReducer(started(createBattlePlanState(), 1), {type: 'build-succeeded', requestId: 1, result: planResult()});
    expect(ready).toMatchObject({phase: 'ready', result: {trainer: {id: 'brock'}}});
    expect(started(ready, 2).result).toBeNull();
    expect(battlePlanReducer(ready, {type: 'reset'})).toMatchObject({phase: 'idle', result: null, requestId: 1});

    const failed = battlePlanReducer(started(createBattlePlanState(), 1), {type: 'build-failed', requestId: 1, error: 'recusado'});
    expect(failed).toMatchObject({phase: 'error', error: 'recusado'});
  });
});

describe('textos do plano', () => {
  it('descreve quem age primeiro sem esconder a incerteza', () => {
    expect(battlePlanFirstToActLabel('jogador')).toBe('Você age primeiro');
    expect(battlePlanFirstToActLabel('adversário')).toBe('O adversário age primeiro');
    expect(battlePlanFirstToActLabel('incerto')).toBe('Ordem incerta');
    expect(battlePlanFirstToActLabel(null)).toBe('Ordem não calculada');
  });

  it('mostra o range de dano em HP e em porcentagem do HP máximo', () => {
    expect(battlePlanDamageLabel({moveId: 'm', min: 22, max: 27, targetHP: 100})).toBe('22–27 HP de 100 (22–27%)');
    expect(battlePlanDamageLabel({moveId: 'm', min: 5, max: 9, targetHP: 0})).toBe('5–9 HP');
  });

  it('resume a bolsa do treinador com o limite de usos', () => {
    const name = (id: string) => id.replace('cobblemon:', '');
    expect(battlePlanBagLabel(planResult().trainer, name)).toBe('potion ×1 · máximo de 2 usos');
    expect(battlePlanBagLabel({id: 'x', name: 'X', maxItemUses: 1, bag: []}, name)).toBe('sem itens · máximo de 1 uso');
    expect(battlePlanBagLabel({id: 'x', name: 'X', maxItemUses: null, bag: []}, name)).toBeNull();
  });
  describe('simulação da batalha', () => {
    const step = {
      opponentIndex: 0,
      opponentSpeciesId: 'cobblemon:geodude',
      memberUuid: 'u1',
      memberSpeciesId: 'cobblemon:blastoise',
      entry: 'lead' as const,
      turns: 1,
      memberHpBefore: 100,
      memberHpAfter: 64,
      memberMaxHp: 100,
      opponentHpBefore: 40,
      opponentHpAfter: 0,
      opponentMaxHp: 40,
      outcome: 'adversário derrotado' as const,
    };

    it('descreve o trecho com HP antes e depois, turnos no singular e desfecho', () => {
      expect(battleSimulationStepLabel(step, 'Blastoise', 'Geodude')).toBe(
        'Blastoise abre contra Geodude: 100%→64% · adversário 100%→0% · 1 turno · adversário derrotado',
      );
      expect(battleSimulationStepLabel({...step, entry: 'troca', turns: 3}, 'Blastoise', 'Geodude')).toContain(
        'entra na troca contra Geodude',
      );
    });

    it('resume derrotados e restantes, e só cita o status quando a simulação não concluiu', () => {
      const simulation: BattleSimulation = {
        status: 'concluída',
        stopReason: null,
        steps: [step, {...step, memberUuid: 'u2', memberHpAfter: 0, outcome: 'membro derrotado'}],
        opponentsDefeated: 2,
        opponentsTotal: 3,
        remaining: [{uuid: 'u1', speciesId: 'cobblemon:blastoise', hp: 64, maxHp: 100}],
      };
      expect(battleSimulationSummary(simulation)).toBe('Adversários derrotados: 2 de 3 · Membros restantes: 1 de 2');
      expect(battleSimulationSummary({...simulation, status: 'interrompida', stopReason: 'impasse: nenhum lado causa dano'})).toBe(
        'Adversários derrotados: 2 de 3 · Membros restantes: 1 de 2 · Simulação interrompida: impasse: nenhum lado causa dano',
      );
    });
  });

  it('o texto de duplas diz fora do escopo e não promete plano', () => {
    expect(BATTLE_PLAN_DOUBLES_TEXT).toBe('Batalha em dupla, fora do escopo.');
  });
});
