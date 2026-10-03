import type {MoveSwapPlan} from '../domain/move-swap';
import {createMoveSwapPlan, invalidateMoveSwapPlan, selectMoveSwapIndividual} from '../domain/move-swap';
import type {PlayerIndividual, PlayerSnapshot} from '../platform/api';

export type ImportPhase = 'idle' | 'loading' | 'loaded' | 'error';

export type TrainerSessionState = {
  snapshot: PlayerSnapshot | null;
  phase: ImportPhase;
  error: string | null;
  selectedUuid: string | null;
  moveSwapPlan: MoveSwapPlan;
};

export type TrainerSessionAction =
  | {type: 'refresh-started'}
  | {type: 'refresh-succeeded'; snapshot: PlayerSnapshot}
  | {type: 'refresh-failed'; error: string}
  | {type: 'individual-selected'; uuid: string}
  | {type: 'move-swap-updated'; patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>};

export function createInitialTrainerSessionState(): TrainerSessionState {
  return {
    snapshot: null,
    phase: 'idle',
    error: null,
    selectedUuid: null,
    moveSwapPlan: createMoveSwapPlan(),
  };
}

export function beginTrainerSessionRefresh(): TrainerSessionState {
  return {
    snapshot: null,
    phase: 'loading',
    error: null,
    selectedUuid: null,
    moveSwapPlan: invalidateMoveSwapPlan(),
  };
}

function comparePcPosition(a: PlayerIndividual, b: PlayerIndividual): number {
  if (a.location.container !== 'pc' || b.location.container !== 'pc') return 0;
  return a.location.box - b.location.box || a.location.slot - b.location.slot;
}

function firstSnapshotIndividual(snapshot: PlayerSnapshot): PlayerIndividual | null {
  const party = snapshot.individuals
    .filter((individual) => individual.location.container === 'party')
    .sort((a, b) => a.location.slot - b.location.slot);
  if (party.length > 0) return party[0];

  const pc = snapshot.individuals.filter((individual) => individual.location.container === 'pc').sort(comparePcPosition);
  return pc[0] ?? null;
}

export function completeTrainerSessionRefresh(state: TrainerSessionState, snapshot: PlayerSnapshot): TrainerSessionState {
  const selected = firstSnapshotIndividual(snapshot);
  const selectedUuid = selected?.uuid ?? null;
  const moveSwapPlan = selectedUuid === null ? invalidateMoveSwapPlan() : selectMoveSwapIndividual(state.moveSwapPlan, selectedUuid);

  return {
    snapshot,
    phase: 'loaded',
    error: null,
    selectedUuid,
    moveSwapPlan,
  };
}

export function failTrainerSessionRefresh(error: string): TrainerSessionState {
  return {
    snapshot: null,
    phase: 'error',
    error,
    selectedUuid: null,
    moveSwapPlan: invalidateMoveSwapPlan(),
  };
}

export function selectTrainerSessionIndividual(state: TrainerSessionState, uuid: string): TrainerSessionState {
  return {
    ...state,
    selectedUuid: uuid,
    moveSwapPlan: selectMoveSwapIndividual(state.moveSwapPlan, uuid),
  };
}

export function updateTrainerSessionMoveSwap(
  state: TrainerSessionState,
  patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>,
): TrainerSessionState {
  return {
    ...state,
    moveSwapPlan: {...state.moveSwapPlan, ...patch},
  };
}

export function trainerSessionReducer(state: TrainerSessionState, action: TrainerSessionAction): TrainerSessionState {
  switch (action.type) {
    case 'refresh-started':
      return beginTrainerSessionRefresh();
    case 'refresh-succeeded':
      return completeTrainerSessionRefresh(state, action.snapshot);
    case 'refresh-failed':
      return failTrainerSessionRefresh(action.error);
    case 'individual-selected':
      return selectTrainerSessionIndividual(state, action.uuid);
    case 'move-swap-updated':
      return updateTrainerSessionMoveSwap(state, action.patch);
  }
}
