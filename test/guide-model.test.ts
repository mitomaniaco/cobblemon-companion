import {describe, expect, it} from 'vitest';
import {
  createGuideState,
  currentGuideGoal,
  GUIDE_SNAPSHOT_NOTICE,
  guideAnswers,
  guideBestAnswerUuid,
  guideUnansweredOpponents,
  guideBuildCause,
  guideBuildKey,
  guideCalculationTarget,
  guideRequestLevelCap,
  guidePartySteps,
  guideOpponentTurnsLabel,
  guidePreviousTeamUuids,
  guideReducer,
  guideSourcesKey,
  guideTeamChanges,
  guideTrainerOptions,
  shouldAutoBuildGuide,
  type GuideAction,
  type GuideState,
} from '../src/features/guide/guide-model';
import type {GuideResult, GuideTrainer, PlayerIndividual, PlayerSnapshot} from '../src/platform/api';

const result = (): GuideResult => ({
  goal: {kind: 'pve'},
  referenceLevel: 30,
  opponents: [],
  team: [],
  partyPlan: {basis: 'party atual', basisReason: null, slots: [], toPc: []},
  excluded: [],
  assumptions: [],
  limits: [],
});

function apply(state: GuideState, ...actions: GuideAction[]): GuideState {
  return actions.reduce(guideReducer, state);
}

describe('objetivo do guia', () => {
  it('PvE sempre tem objetivo; líder só com treinador escolhido', () => {
    expect(currentGuideGoal({mode: 'pve', trainerId: null})).toEqual({kind: 'pve'});
    expect(currentGuideGoal({mode: 'trainer', trainerId: null})).toBeNull();
    expect(currentGuideGoal({mode: 'trainer', trainerId: 'brock'})).toEqual({kind: 'trainer', trainerId: 'brock'});
  });

  it('a sugestão pré-seleciona o líder, mas não sobrescreve uma escolha da pessoa', () => {
    const suggested = apply(createGuideState(), {
      type: 'next-goal-loaded',
      key: 'k',
      next: {trainerId: 'brock', basis: 'progresso', reason: 'Próximo líder'},
    });
    expect(currentGuideGoal(suggested)).toEqual({kind: 'trainer', trainerId: 'brock'});

    const chosen = apply(
      createGuideState(),
      {type: 'mode-selected', mode: 'pve'},
      {type: 'next-goal-loaded', key: 'k', next: {trainerId: 'brock', basis: 'nível', reason: 'x'}},
    );
    expect(currentGuideGoal(chosen)).toEqual({kind: 'pve'});
    expect(chosen.nextGoal?.status).toBe('ready');
  });

  it('etapa ambígua abre na campanha, na primeira equipe individual', () => {
    const state = apply(createGuideState(), {
      type: 'next-goal-loaded',
      key: 'snapshot',
      next: {
        trainerId: 'rctmod:rival_a',
        basis: 'progresso',
        reason: 'A variante é sorteada no spawn.',
        stage: {
          stageId: 'rival-1',
          name: 'Rival · primeiro encontro',
          type: 'rival',
          order: 1,
          requires: [],
          capBefore: 15,
          capAfter: 20,
          capUnknownReason: null,
          ambiguous: true,
          ambiguousReason: 'Sorteio ponderado no spawn.',
          variants: [
            {trainerId: 'rctmod:rival_a', format: 'singles', maxLevel: 20, teamSize: 3, optional: false, ambiguous: true, rule: null},
            {trainerId: 'rctmod:rival_b', format: 'singles', maxLevel: 20, teamSize: 3, optional: false, ambiguous: true, rule: null},
          ],
        },
      },
    });
    expect(state.nextGoal?.status).toBe('ready');
    expect(currentGuideGoal(state)).toEqual({kind: 'trainer', trainerId: 'rctmod:rival_a'});

    const doublesOnly = apply(createGuideState(), {
      type: 'next-goal-loaded',
      key: 'snapshot',
      next: {
        trainerId: null,
        basis: 'progresso',
        reason: 'x',
        stage: {
          stageId: 'd',
          name: 'Duplas',
          type: 'team',
          order: 1,
          requires: [],
          capBefore: 15,
          capAfter: 20,
          capUnknownReason: null,
          ambiguous: true,
          ambiguousReason: 'x',
          variants: [{trainerId: 'rctmod:d', format: 'doubles', maxLevel: 20, teamSize: 3, optional: false, ambiguous: true, rule: null}],
        },
      },
    });
    expect(currentGuideGoal(doublesOnly)).toEqual({kind: 'pve'});
  });

  it('remove a sugestão anterior enquanto lê novamente o progresso', () => {
    const suggested = apply(createGuideState(), {
      type: 'next-goal-loaded',
      key: 'snapshot',
      next: {trainerId: 'brock', basis: 'progresso', reason: 'Líder atual'},
    });
    const requested = guideReducer(suggested, {type: 'next-goal-requested'});
    expect(requested.nextGoal).toBeNull();
    expect(currentGuideGoal(requested)).toEqual({kind: 'trainer', trainerId: 'brock'});
  });

  it('sugestão sem líder fica em PvE geral', () => {
    const state = apply(createGuideState(), {
      type: 'next-goal-loaded',
      key: 'k',
      next: {trainerId: null, basis: 'nível', reason: 'sem líder'},
    });
    expect(currentGuideGoal(state)).toEqual({kind: 'pve'});
  });

  it('escolher um treinador muda para o modo líder e marca a escolha', () => {
    const state = apply(createGuideState(), {type: 'trainer-selected', trainerId: 'misty'});
    expect(state).toMatchObject({mode: 'trainer', trainerId: 'misty', goalChosen: true});
  });
});

describe('quando montar sozinho', () => {
  const base = {
    active: true,
    sourcesKey: 'party:a',
    goal: {kind: 'pve'} as const,
    levelCap: null,
    respectLevelCap: true,
    nextGoalKey: 'party:a',
    attemptedKey: null,
  };

  it('monta com captura, sugestão resolvida para a mesma captura e chave nova', () => {
    expect(shouldAutoBuildGuide(base)).toBe(true);
  });

  it('não monta fora da tela, sem captura, sem objetivo ou antes da sugestão da captura atual', () => {
    expect(shouldAutoBuildGuide({...base, active: false})).toBe(false);
    expect(shouldAutoBuildGuide({...base, sourcesKey: null})).toBe(false);
    expect(shouldAutoBuildGuide({...base, goal: null})).toBe(false);
    expect(shouldAutoBuildGuide({...base, nextGoalKey: 'party:antiga'})).toBe(false);
    expect(shouldAutoBuildGuide({...base, nextGoalKey: null})).toBe(false);
  });

  it('não repete a chave já tentada (erro ou cancelamento não fazem laço), mas remonta se o save ou o objetivo mudam', () => {
    const attempted = guideBuildKey('party:a', {kind: 'pve'}, null, true);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted})).toBe(false);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted, goal: {kind: 'trainer', trainerId: 'brock'}})).toBe(true);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted, sourcesKey: 'party:b', nextGoalKey: 'party:b'})).toBe(true);
  });

  it('mudar o level cap remonta o time de líder, mas não o de PvE geral (o cap não vale lá)', () => {
    const trainer = {kind: 'trainer', trainerId: 'brock'} as const;
    const attemptedTrainer = guideBuildKey('party:a', trainer, 55, true);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 55, attemptedKey: attemptedTrainer})).toBe(false);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 40, attemptedKey: attemptedTrainer})).toBe(true);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: null, attemptedKey: attemptedTrainer})).toBe(true);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 55, respectLevelCap: false, attemptedKey: attemptedTrainer})).toBe(true);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 55, respectLevelCap: false, attemptedKey: attemptedTrainer})).toBe(true);
    const attemptedPve = guideBuildKey('party:a', {kind: 'pve'}, 55, true);
    expect(shouldAutoBuildGuide({...base, levelCap: 40, attemptedKey: attemptedPve})).toBe(false);
  });

  it('ligar ou desligar o toggle não remonta PvE geral', () => {
    const attemptedPve = guideBuildKey('party:a', {kind: 'pve'}, null, true);
    expect(shouldAutoBuildGuide({...base, respectLevelCap: false, attemptedKey: attemptedPve})).toBe(false);
  });

  it('ligar ou desligar o toggle não remonta PvE geral', () => {
    const attemptedPve = guideBuildKey('party:a', {kind: 'pve'}, null, true);
    expect(shouldAutoBuildGuide({...base, respectLevelCap: false, attemptedKey: attemptedPve})).toBe(false);
  });

  it('o pedido leva o cap só para objetivo de treinador', () => {
    expect(guideRequestLevelCap({kind: 'trainer', trainerId: 'brock'}, 55)).toBe(55);
    expect(guideRequestLevelCap({kind: 'trainer', trainerId: 'brock'}, null)).toBeNull();
    expect(guideRequestLevelCap({kind: 'pve'}, 55)).toBeNull();
  });

  it('a chave das fontes depende dos hashes, não dos horários', () => {
    const snapshot = (sha: string, modifiedAt: string) =>
      ({
        sources: [
          {kind: 'party', sha256: sha, modifiedAt},
          {kind: 'pc', sha256: 'p', modifiedAt},
        ],
      }) as unknown as PlayerSnapshot;
    expect(guideSourcesKey(snapshot('a', '1'))).toBe(guideSourcesKey(snapshot('a', '2')));
    expect(guideSourcesKey(snapshot('a', '1'))).not.toBe(guideSourcesKey(snapshot('b', '1')));
  });
});

describe('montagem do time', () => {
  const started = (state: GuideState, requestId: number, cause: 'initial' | 'goal' | 'snapshot' | 'manual' = 'initial') =>
    guideReducer(state, {type: 'build-started', requestId, cause});

  it('guarda o resultado da montagem corrente e ignora respostas de montagens antigas', () => {
    let state = started(createGuideState(), 1);
    state = started(state, 2);
    const stale = guideReducer(state, {type: 'build-succeeded', requestId: 1, result: result(), sources: 'a'});
    expect(stale).toBe(state);
    const fresh = guideReducer(state, {type: 'build-succeeded', requestId: 2, result: result(), sources: 'a'});
    expect(fresh).toMatchObject({phase: 'ready', resultSources: 'a'});
    expect(fresh.notice).toBeNull();
  });

  it('só mostra o aviso de save mudou quando a montagem veio de uma mudança do save', () => {
    const state = apply(
      createGuideState(),
      {type: 'build-started', requestId: 1, cause: 'snapshot'},
      {type: 'build-succeeded', requestId: 1, result: result(), sources: 'b'},
    );
    expect(state.notice).toEqual({id: 1, text: GUIDE_SNAPSHOT_NOTICE});
    expect(guideReducer(state, {type: 'notice-dismissed', id: 99}).notice).not.toBeNull();
    expect(guideReducer(state, {type: 'notice-dismissed', id: 1}).notice).toBeNull();
  });

  it('erro e cancelamento descartam o resultado antigo e a resposta tardia não ressuscita a montagem', () => {
    const ready = apply(
      createGuideState(),
      {type: 'build-started', requestId: 1, cause: 'initial'},
      {type: 'build-succeeded', requestId: 1, result: result(), sources: 'a'},
    );
    const failed = apply(
      ready,
      {type: 'build-started', requestId: 2, cause: 'goal'},
      {type: 'build-failed', requestId: 2, error: 'recusado'},
    );
    expect(failed).toMatchObject({phase: 'error', error: 'recusado', result: null, resultSources: null});

    const canceled = apply(ready, {type: 'build-started', requestId: 2, cause: 'goal'}, {type: 'build-canceled', requestId: 2});
    expect(canceled).toMatchObject({phase: 'canceled', result: null});
    const late = guideReducer(canceled, {type: 'build-succeeded', requestId: 2, result: result(), sources: 'a'});
    expect(late).toBe(canceled);
    expect(guideReducer(canceled, {type: 'build-failed', requestId: 2, error: 'abortado'})).toBe(canceled);
  });

  it('classifica a causa pela diferença de fontes do resultado atual', () => {
    expect(guideBuildCause({result: null, resultSources: null}, 'a')).toBe('initial');
    expect(guideBuildCause({result: result(), resultSources: 'a'}, 'a')).toBe('goal');
    expect(guideBuildCause({result: result(), resultSources: 'a'}, 'b')).toBe('snapshot');
  });

  it('sem captura volta ao estado inicial mas mantém a escolha de objetivo', () => {
    const state = apply(
      createGuideState(),
      {type: 'trainer-selected', trainerId: 'brock'},
      {type: 'build-started', requestId: 1, cause: 'initial'},
      {type: 'build-succeeded', requestId: 1, result: result(), sources: 'a'},
      {type: 'reset'},
    );
    expect(state).toMatchObject({phase: 'idle', result: null, mode: 'trainer', trainerId: 'brock', goalChosen: true, nextGoal: null});
  });
});

describe('opções de treinador', () => {
  const trainers: GuideTrainer[] = [
    {id: 'brock', name: 'Brock', format: 'singles', teamSize: 3, maxLevel: 14, series: 'radicalred'},
    {id: 'lance', name: 'Lance', format: 'doubles', teamSize: 6, maxLevel: 60, series: null},
  ];

  it('duplas ficam desabilitadas com a nota de não suportado', () => {
    const [singles, doubles] = guideTrainerOptions(trainers);
    expect(singles).toMatchObject({key: 'brock', isDisabled: false, description: '3 Pokémon · nível máx. 14'});
    expect(doubles).toMatchObject({key: 'lance', isDisabled: true, description: 'duplas: não suportado'});
  });
});

describe('ver cálculo de um golpe do guia', () => {
  const individual = {equippedMoves: [{id: 'tackle'}, {id: 'ember'}]} as unknown as PlayerIndividual;

  it('golpe aprendido vira candidato e golpe equipado vira o slot comparado', () => {
    expect(guideCalculationTarget(individual, {id: 'surf', evaluated: true, source: 'aprendido'})).toEqual({candidateMoveId: 'surf'});
    expect(guideCalculationTarget(individual, {id: 'ember', evaluated: true, source: 'equipado'})).toEqual({slotIndex: 1});
  });

  it('golpe equipado que não está mais no save não inventa slot', () => {
    expect(guideCalculationTarget(individual, {id: 'surf', evaluated: true, source: 'equipado'})).toEqual({});
  });
});

describe('textos do resultado', () => {
  it('descreve como arrumar a party: guardar, pegar do PC e a ordem', () => {
    const names: Record<string, string> = {A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F'};
    const slot = (uuid: string, change: 'mantém' | 'muda de slot' | 'entra') => ({
      uuid,
      speciesId: 'cobblemon:x',
      fromSlot: change === 'entra' ? null : 0,
      change,
      replaces: null,
      role: null,
    });
    const nameOf = (uuid: string) => names[uuid] ?? uuid;
    const plan = {
      basis: 'simulação' as const,
      basisReason: null,
      slots: [slot('E', 'entra'), slot('A', 'muda de slot'), slot('F', 'entra'), slot('C', 'muda de slot')],
      toPc: [
        {uuid: 'B', speciesId: 'cobblemon:x', fromSlot: 1},
        {uuid: 'D', speciesId: 'cobblemon:x', fromSlot: 3},
      ],
    };
    expect(guidePartySteps(plan, nameOf)).toEqual([
      'Guarde no PC: B e D.',
      'Pegue do PC: E e F.',
      'Arrume a party nesta ordem: E, A, F e C.',
    ]);
    expect(guidePartySteps({...plan, slots: [slot('A', 'mantém')], toPc: []}, nameOf)).toEqual([]);
  });

  it('descreve o confronto com singular e plural de turnos', () => {
    expect(guideOpponentTurnsLabel({outcome: 'vence', ourTurns: 1, theirTurns: 3})).toBe(
      'vence em 1 turno (o adversário precisaria de 3 turnos)',
    );
    expect(guideOpponentTurnsLabel({outcome: 'perde', ourTurns: 2, theirTurns: 1})).toBe(
      'perde: o adversário vence em 1 turno (você precisaria de 2 turnos)',
    );
  });
});

describe('respostas do time aos adversários', () => {
  type Matchup = GuideResult['team'][number]['matchups'][number];
  const m = (opponentId: string, outcome: 'vence' | 'perde', ourTurns: number, theirTurns: number): Matchup => ({
    opponentId,
    outcome,
    ourTurns,
    theirTurns,
    moveId: outcome === 'vence' ? 'cobblemon:surf' : null,
  });
  const teamMember = (uuid: string, matchups: Matchup[]) => ({uuid, matchups}) as GuideResult['team'][number];
  const opponents = [{id: 'o#0'}, {id: 'o#1'}, {id: 'o#2'}, {id: 'o#3'}];

  it('guideAnswers põe vitórias primeiro (menos turnos, depois ordem) e derrotas por último', () => {
    const member = teamMember('a', [m('o#0', 'perde', 3, 1), m('o#1', 'vence', 2, 3), m('o#2', 'vence', 1, 3), m('o#3', 'vence', 2, 4)]);
    expect(guideAnswers(member, opponents).map((matchup) => matchup.opponentId)).toEqual(['o#2', 'o#1', 'o#3', 'o#0']);
  });

  it('guideBestAnswerUuid escolhe quem vence em menos turnos, com empate no menor slot', () => {
    const team = [
      teamMember('a', [m('o#0', 'vence', 2, 3)]),
      teamMember('b', [m('o#0', 'vence', 1, 3)]),
      teamMember('c', [m('o#0', 'vence', 1, 2)]),
    ];
    expect(guideBestAnswerUuid(team, 'o#0')).toBe('b');
    expect(guideBestAnswerUuid(team, 'ausente')).toBeNull();
  });

  it('guideBestAnswerUuid sem vitória usa a maior folga, tratando Infinity como 1e9', () => {
    const team = [
      teamMember('a', [m('o#0', 'perde', 3, 2)]),
      teamMember('b', [m('o#0', 'perde', 4, Number.POSITIVE_INFINITY)]),
      teamMember('c', [m('o#0', 'perde', 2, 3)]),
    ];
    expect(guideBestAnswerUuid(team, 'o#0')).toBe('b');
  });

  it('guideUnansweredOpponents lista quem ninguém do time vence, na ordem dos adversários', () => {
    const team = [teamMember('a', [m('o#0', 'vence', 1, 2), m('o#1', 'perde', 3, 1)]), teamMember('b', [m('o#2', 'vence', 1, 2)])];
    expect(guideUnansweredOpponents(team, opponents).map((opponent) => opponent.id)).toEqual(['o#1', 'o#3']);
  });
});

describe('estabilidade e mudança do time', () => {
  const member = (uuid: string) => ({uuid}) as GuideResult['team'][number];
  const trainerResult = (uuids: string[], excluded: GuideResult['excluded'] = [], trainerId = 'brock'): GuideResult => ({
    ...result(),
    goal: {kind: 'trainer', trainerId},
    team: uuids.map(member),
    excluded,
  });

  it('só usa o time anterior se foi para o mesmo objetivo', () => {
    const previous = trainerResult(['a', 'b']);
    expect(guidePreviousTeamUuids(previous, {kind: 'trainer', trainerId: 'brock'})).toEqual(['a', 'b']);
    expect(guidePreviousTeamUuids(previous, {kind: 'trainer', trainerId: 'misty'})).toEqual([]);
    expect(guidePreviousTeamUuids(previous, {kind: 'pve'})).toEqual([]);
    expect(guidePreviousTeamUuids(null, {kind: 'pve'})).toEqual([]);
  });

  it('quem saiu traz o motivo da exclusão (level cap) ou a explicação genérica; quem entrou é listado', () => {
    const previous = trainerResult(['a', 'b', 'c']);
    const next = trainerResult(['a', 'd'], [{uuid: 'b', reason: 'acima do level cap (30)'}]);
    expect(guideTeamChanges(previous, next)).toEqual({
      left: [
        {uuid: 'b', reason: 'acima do level cap (30)'},
        {uuid: 'c', reason: 'outra escolha cobre mais adversários ou com mais margem neste cálculo'},
      ],
      entered: ['d'],
    });
  });

  it('sem montagem anterior ou com outro objetivo não há aviso', () => {
    expect(guideTeamChanges(null, trainerResult(['a']))).toBeNull();
    expect(guideTeamChanges(trainerResult(['a'], [], 'misty'), trainerResult(['b']))).toBeNull();
  });

  it('a montagem bem-sucedida guarda o resultado anterior', () => {
    const first = trainerResult(['a']);
    const second = trainerResult(['b']);
    const built = (state: GuideState, requestId: number, value: GuideResult) =>
      apply(state, {type: 'build-started', requestId, cause: 'goal'} as GuideAction, {
        type: 'build-succeeded',
        requestId,
        result: value,
        sources: 's',
      });
    const state = built(built(createGuideState(), 1, first), 2, second);
    expect(state.result).toBe(second);
    expect(state.previousResult).toBe(first);
  });
});
