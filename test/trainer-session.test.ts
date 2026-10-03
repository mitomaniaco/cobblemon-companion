import {describe, expect, it} from 'vitest';
import {
  completeTrainerSessionRefresh,
  createInitialTrainerSessionState,
  selectTrainerSessionIndividual,
  trainerSessionReducer,
  updateTrainerSessionMoveSwap,
} from '../src/app/trainer-session-model';
import type {PlayerIndividual, PlayerSnapshot, PlayerStat, PlayerStatFact} from '../src/platform/api';

const statNames: PlayerStat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function unknownStatFacts<T>(sourceKind: 'party' | 'pc', valueType: string): Record<PlayerStat, PlayerStatFact<T>> {
  return Object.fromEntries(
    statNames.map((stat) => [
      stat,
      {
        state: 'unknown' as const,
        reason: 'not-captured' as const,
        provenance: {sourceKind, nbtPath: `${valueType}.${stat}`},
      },
    ]),
  ) as Record<PlayerStat, PlayerStatFact<T>>;
}

function individual(
  uuid: string,
  speciesId: string,
  location: PlayerIndividual['location'],
  overrides: Partial<PlayerIndividual> = {},
): PlayerIndividual {
  const sourceKind = location.container;
  return {
    uuid,
    speciesId,
    formId: 'normal',
    level: 10,
    location,
    equippedMoves: [],
    equippedMovesKnown: true,
    learnedMoves: [],
    learnedMovesKnown: true,
    observed: {nature: null, ability: null, heldItem: null},
    battleStats: {
      ivs: unknownStatFacts<number>(sourceKind, 'ivs'),
      hyperTrainedIvs: unknownStatFacts<number | null>(sourceKind, 'hyperTrainedIvs'),
      evs: unknownStatFacts<number>(sourceKind, 'evs'),
    },
    ...overrides,
  };
}

function snapshot(individuals: PlayerIndividual[]): PlayerSnapshot {
  return {
    schemaVersion: 2,
    capturedAt: '2026-01-01T00:00:00.000Z',
    worldName: 'test-world',
    consistency: 'best-effort',
    sources: [],
    individuals,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

describe('controlador de sessão do treinador', () => {
  it('seleciona a instância exata quando duas capturas têm a mesma espécie', () => {
    const first = individual(
      'uuid-first',
      'pikachu',
      {container: 'party', slot: 0},
      {
        formId: 'normal',
        level: 12,
      },
    );
    const second = individual(
      'uuid-second',
      'pikachu',
      {container: 'party', slot: 1},
      {
        formId: 'cosplay',
        level: 47,
      },
    );
    let state = completeTrainerSessionRefresh(createInitialTrainerSessionState(), snapshot([first, second]));

    state = selectTrainerSessionIndividual(state, second.uuid);
    const selected = state.snapshot?.individuals.find((item) => item.uuid === state.selectedUuid);

    expect(state.selectedUuid).toBe('uuid-second');
    expect(selected).toMatchObject({uuid: 'uuid-second', formId: 'cosplay', level: 47});
    expect(selected?.location).toEqual({container: 'party', slot: 1});
  });

  it('preserva o plano na mesma UUID e o redefine ao mudar de indivíduo', () => {
    const loaded = completeTrainerSessionRefresh(
      createInitialTrainerSessionState(),
      snapshot([
        individual('uuid-first', 'pikachu', {container: 'party', slot: 0}),
        individual('uuid-second', 'pikachu', {container: 'party', slot: 1}),
      ]),
    );
    const selected = selectTrainerSessionIndividual(loaded, 'uuid-first');
    const planned = updateTrainerSessionMoveSwap(selected, {
      slotIndex: 2,
      candidateMoveId: 'thunderbolt',
    });

    const sameIndividual = selectTrainerSessionIndividual(planned, 'uuid-first');
    expect(sameIndividual.moveSwapPlan).toEqual({
      individualUuid: 'uuid-first',
      slotIndex: 2,
      candidateMoveId: 'thunderbolt',
    });

    const differentIndividual = selectTrainerSessionIndividual(sameIndividual, 'uuid-second');
    expect(differentIndividual.moveSwapPlan).toEqual({
      individualUuid: 'uuid-second',
      slotIndex: null,
      candidateMoveId: null,
    });
  });

  it('limpa a captura imediatamente ao iniciar refresh, antes da leitura pendente resolver', async () => {
    const oldSnapshot = snapshot([individual('old-uuid', 'eevee', {container: 'party', slot: 0})]);
    const nextSnapshot = snapshot([individual('new-uuid', 'vaporeon', {container: 'pc', box: 2, boxName: null, slot: 3})]);
    const pendingRead = deferred<PlayerSnapshot>();
    let state = completeTrainerSessionRefresh(createInitialTrainerSessionState(), oldSnapshot);
    state = updateTrainerSessionMoveSwap(state, {slotIndex: 1, candidateMoveId: 'surf'});
    const readCompletion = pendingRead.promise.then((result) => {
      state = completeTrainerSessionRefresh(state, result);
    });

    state = trainerSessionReducer(state, {type: 'refresh-started'});
    expect(state).toMatchObject({
      snapshot: null,
      phase: 'loading',
      error: null,
      selectedUuid: null,
      moveSwapPlan: {individualUuid: null, slotIndex: null, candidateMoveId: null},
    });

    pendingRead.resolve(nextSnapshot);
    await readCompletion;
    expect(state.snapshot).toBe(nextSnapshot);
  });

  it('deixa a sessão sem captura quando uma atualização falha', () => {
    const oldSnapshot = snapshot([individual('old-uuid', 'eevee', {container: 'party', slot: 0})]);
    const loaded = completeTrainerSessionRefresh(createInitialTrainerSessionState(), oldSnapshot);
    const refreshing = trainerSessionReducer(loaded, {type: 'refresh-started'});
    const failed = trainerSessionReducer(refreshing, {type: 'refresh-failed', error: 'A leitura local falhou.'});

    expect(refreshing.snapshot).toBeNull();
    expect(failed).toMatchObject({
      snapshot: null,
      phase: 'error',
      error: 'A leitura local falhou.',
      selectedUuid: null,
      moveSwapPlan: {individualUuid: null, slotIndex: null, candidateMoveId: null},
    });
  });

  it('escolhe a posição mais baixa da party e usa a menor caixa e posição quando não há party', () => {
    const partyState = completeTrainerSessionRefresh(
      createInitialTrainerSessionState(),
      snapshot([
        individual('later-party', 'pikachu', {container: 'party', slot: 4}),
        individual('first-party', 'eevee', {container: 'party', slot: 1}),
        individual('pc-record', 'ditto', {container: 'pc', box: 0, boxName: null, slot: 0}),
      ]),
    );
    expect(partyState.selectedUuid).toBe('first-party');

    const pcState = completeTrainerSessionRefresh(
      createInitialTrainerSessionState(),
      snapshot([
        individual('later-pc', 'pikachu', {container: 'pc', box: 3, boxName: null, slot: 0}),
        individual('first-pc', 'eevee', {container: 'pc', box: 1, boxName: null, slot: 4}),
        individual('same-box-earlier', 'ditto', {container: 'pc', box: 1, boxName: null, slot: 2}),
      ]),
    );
    expect(pcState.selectedUuid).toBe('same-box-earlier');

    const emptyState = completeTrainerSessionRefresh(createInitialTrainerSessionState(), snapshot([]));
    expect(emptyState.selectedUuid).toBeNull();
    expect(emptyState.moveSwapPlan).toEqual({individualUuid: null, slotIndex: null, candidateMoveId: null});
  });

  it('o reducer carrega o snapshot e seleciona o primeiro indivíduo ao concluir o refresh', () => {
    const initial = createInitialTrainerSessionState();
    const snap = snapshot([individual('new-uuid', 'pikachu', {container: 'party', slot: 0})]);

    const result = trainerSessionReducer(initial, {
      type: 'refresh-succeeded',
      snapshot: snap,
    });

    expect(result.phase).toBe('loaded');
    expect(result.snapshot).toBe(snap);
    expect(result.selectedUuid).toBe('new-uuid');
  });

  it('o reducer seleciona o indivíduo escolhido e vincula o plano de troca ao UUID', () => {
    const initial = completeTrainerSessionRefresh(
      createInitialTrainerSessionState(),
      snapshot([
        individual('uuid-a', 'pikachu', {container: 'party', slot: 0}),
        individual('uuid-b', 'eevee', {container: 'party', slot: 1}),
      ]),
    );

    const result = trainerSessionReducer(initial, {
      type: 'individual-selected',
      uuid: 'uuid-b',
    });

    expect(result.selectedUuid).toBe('uuid-b');
    expect(result.moveSwapPlan.individualUuid).toBe('uuid-b');
  });

  it('o reducer atualiza o plano de troca sem alterar o indivíduo selecionado', () => {
    const initial = completeTrainerSessionRefresh(
      createInitialTrainerSessionState(),
      snapshot([individual('uuid-test', 'pikachu', {container: 'party', slot: 0})]),
    );

    const result = trainerSessionReducer(initial, {
      type: 'move-swap-updated',
      patch: {slotIndex: 1, candidateMoveId: 'thunderbolt'},
    });

    expect(result.moveSwapPlan.slotIndex).toBe(1);
    expect(result.moveSwapPlan.candidateMoveId).toBe('thunderbolt');
    expect(result.selectedUuid).toBe('uuid-test');
  });
});
