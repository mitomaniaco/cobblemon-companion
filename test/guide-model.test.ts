import {describe, expect, it} from 'vitest';
import {
  createGuideState,
  currentGuideGoal,
  GUIDE_SNAPSHOT_NOTICE,
  guideBuildCause,
  guideBuildKey,
  guideCalculationTarget,
  guideRequestLevelCap,
  guideComparisonRows,
  guideOpponentTurnsLabel,
  guideReducer,
  guideSourcesKey,
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
  currentPartyComparison: {kept: [], added: [], removed: []},
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
    const attempted = guideBuildKey('party:a', {kind: 'pve'}, null);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted})).toBe(false);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted, goal: {kind: 'trainer', trainerId: 'brock'}})).toBe(true);
    expect(shouldAutoBuildGuide({...base, attemptedKey: attempted, sourcesKey: 'party:b', nextGoalKey: 'party:b'})).toBe(true);
  });

  it('mudar o level cap remonta o time de líder, mas não o de PvE geral (o cap não vale lá)', () => {
    const trainer = {kind: 'trainer', trainerId: 'brock'} as const;
    const attemptedTrainer = guideBuildKey('party:a', trainer, 55);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 55, attemptedKey: attemptedTrainer})).toBe(false);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: 40, attemptedKey: attemptedTrainer})).toBe(true);
    expect(shouldAutoBuildGuide({...base, goal: trainer, levelCap: null, attemptedKey: attemptedTrainer})).toBe(true);
    const attemptedPve = guideBuildKey('party:a', {kind: 'pve'}, 55);
    expect(shouldAutoBuildGuide({...base, levelCap: 40, attemptedKey: attemptedPve})).toBe(false);
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
  it('compara a party na ordem entra, sai e fica', () => {
    const rows = guideComparisonRows({kept: ['k'], added: ['a'], removed: ['r']});
    expect(rows.map((row) => [row.label, row.uuids])).toEqual([
      ['Entra', ['a']],
      ['Sai', ['r']],
      ['Fica', ['k']],
    ]);
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
