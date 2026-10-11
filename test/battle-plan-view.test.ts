import {describe, expect, it} from 'vitest';
import type {BattlePlanEntry, BattleSimulation, BattleSimulationStep} from '../src/platform/api';
import {
  battleOpponentProgress,
  battlePartyAtEnd,
  battlePlanRows,
  battleRiskGroups,
  blockedReasonLabel,
  simulationStopLabel,
} from '../src/features/guide/battle-plan-model';

const entry = (speciesId: string, over: Partial<BattlePlanEntry> = {}): BattlePlanEntry => ({
  opponentId: speciesId,
  speciesId,
  level: 30,
  ability: 'x',
  heldItemAlternatives: [],
  status: 'planejado',
  blockedReason: null,
  partialReason: null,
  responder: null,
  dealt: null,
  received: null,
  firstToAct: null,
  actReason: null,
  risks: [],
  ...over,
});

const step = (opponentIndex: number, memberUuid: string, over: Partial<BattleSimulationStep> = {}): BattleSimulationStep => ({
  opponentIndex,
  opponentSpeciesId: `o${opponentIndex}`,
  memberUuid,
  memberSpeciesId: `s-${memberUuid}`,
  entry: 'lead',
  turns: 2,
  memberHpBefore: 100,
  memberHpAfter: 60,
  memberMaxHp: 100,
  opponentHpBefore: 80,
  opponentHpAfter: 0,
  opponentMaxHp: 80,
  outcome: 'adversário derrotado',
  ...over,
});

const sim = (steps: BattleSimulationStep[], over: Partial<BattleSimulation> = {}): BattleSimulation => ({
  status: 'interrompida',
  stopReason: null,
  steps,
  opponentsDefeated: 0,
  opponentsTotal: 0,
  remaining: [],
  ...over,
});

describe('estado de cada adversário na simulação', () => {
  it('marca derrotado, bloqueado e quem fica esperando o bloqueio, com o passo em que cai', () => {
    const entries = [entry('a'), entry('b'), entry('c', {status: 'bloqueado'}), entry('d')];
    const simulation = sim([step(0, 'm1'), step(1, 'm1', {outcome: 'adversário derrotado'})]);
    expect(battleOpponentProgress(entries, simulation)).toEqual([
      {state: 'vence', stepNumber: 1, waitingFor: null},
      {state: 'vence', stepNumber: 2, waitingFor: null},
      {state: 'bloqueado', stepNumber: null, waitingFor: null},
      {state: 'sem-simulacao', stepNumber: null, waitingFor: 3},
    ]);
  });

  it('só diz que o adversário vence quando o time inteiro caiu nele', () => {
    const lost = step(0, 'm1', {outcome: 'membro derrotado', memberHpAfter: 0});
    expect(battleOpponentProgress([entry('a')], sim([lost], {status: 'time derrotado'}))[0]).toMatchObject({state: 'perde', stepNumber: 1});
    expect(battleOpponentProgress([entry('a')], sim([lost], {status: 'interrompida'}))[0].state).toBe('sem-simulacao');
  });
});

describe('linhas do passo a passo', () => {
  it('classifica como cada lado entra e mantém um adversário que segue em campo', () => {
    const entries = [entry('a'), entry('b'), entry('c')];
    const rows = battlePlanRows(
      entries,
      sim([
        step(0, 'm1', {entry: 'lead', outcome: 'membro derrotado', memberHpAfter: 0}),
        step(0, 'm2', {entry: 'após KO'}),
        step(1, 'm2', {entry: 'mantém'}),
      ]),
    );
    expect(rows.map((row) => [row.kind, row.opponentIndex, row.opponentKind, row.memberKind])).toEqual([
      ['step', 0, 'abre', 'abre'],
      ['step', 0, 'segue em campo', 'entra após derrota'],
      ['step', 1, 'entra após derrota', 'segue em campo'],
      ['pending', 2, null, null],
    ]);
    expect(rows.map((row) => row.stepNumber)).toEqual([1, 2, 3, null]);
  });
});

describe('vida da equipe ao final', () => {
  it('lista quem caiu com o passo, quem sobrou com o HP e quem nem entrou', () => {
    const simulation = sim(
      [step(0, 'm1', {outcome: 'membro derrotado', memberHpAfter: 0}), step(0, 'm2', {entry: 'após KO', memberHpAfter: 50})],
      {
        remaining: [
          {uuid: 'm2', speciesId: 's-m2', hp: 50, maxHp: 100},
          {uuid: 'm3', speciesId: 's-m3', hp: 90, maxHp: 90},
        ],
      },
    );
    expect(battlePartyAtEnd(simulation)).toEqual([
      {uuid: 'm1', speciesId: 's-m1', hp: 0, maxHp: 100, state: 'caiu', fallStep: 1},
      {uuid: 'm2', speciesId: 's-m2', hp: 50, maxHp: 100, state: 'de-pe', fallStep: null},
      {uuid: 'm3', speciesId: 's-m3', hp: 90, maxHp: 90, state: 'nao-entrou', fallStep: null},
    ]);
  });
});

describe('riscos da batalha', () => {
  it('agrupa por tipo, na ordem bolsa antes de IA, sem repetir adversário', () => {
    const groups = battleRiskGroups(
      {
        trainerRisks: [{kind: 'ia', text: 'A IA não é modelada.'}],
        entries: [
          entry('a', {
            risks: [
              {kind: 'item', text: 'Pode usar Custap Berry.'},
              {kind: 'ia', text: 'Troca de Pokémon.'},
            ],
          }),
          entry('b', {risks: [{kind: 'ia', text: 'Troca de Pokémon.'}]}),
        ],
      },
      'Potion ×2',
    );
    expect(groups.map((group) => group.kind)).toEqual(['bolsa', 'ia', 'item']);
    expect(groups[1]).toEqual({kind: 'ia', opponentIds: ['a', 'b'], texts: ['A IA não é modelada.', 'Troca de Pokémon.']});
  });
});

describe('motivos em português', () => {
  it('traduz bloqueios e paradas conhecidos e nunca devolve o texto técnico', () => {
    expect(blockedReasonLabel('Mega Stone: item fora do adaptador (Mega Evolução)')).toContain('item');
    expect(blockedReasonLabel('espécie fora do subconjunto compatível versionado de cobblemon:foo')).toContain('dados');
    const unknown = blockedReasonLabel('cobblemon:xyz exploded');
    expect(unknown).not.toContain('cobblemon');
    expect(simulationStopLabel('impasse: nenhum lado causa dano')).toContain('empata');
    expect(simulationStopLabel('algo cobblemon:x')).not.toContain('cobblemon');
  });
});
