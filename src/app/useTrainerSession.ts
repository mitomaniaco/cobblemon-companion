import {useCallback, useReducer, useRef} from 'react';
import type {MoveSwapPlan} from '../domain/move-swap';
import type {CompanionApi, PlayerSnapshot} from '../platform/api';
import {
  createInitialTrainerSessionState,
  trainerSessionReducer,
  type ImportPhase,
  type TrainerSessionAction,
} from './trainer-session-model';

export type TrainerSessionRefreshOptions = {supersedePending?: boolean};

export type TrainerSessionRefresh = (options?: TrainerSessionRefreshOptions) => Promise<void>;

export type TrainerSessionController = {
  snapshot: PlayerSnapshot | null;
  phase: ImportPhase;
  error: string | null;
  selectedUuid: string | null;
  moveSwapPlan: MoveSwapPlan;
  refresh(options?: TrainerSessionRefreshOptions): Promise<void>;
  /** Aplica um snapshot recebido do monitoramento do save (mesmo caminho de estado da leitura manual). */
  applySnapshot(snapshot: PlayerSnapshot): void;
  selectIndividual(uuid: string): void;
  updateMoveSwap(patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void;
};

function describeImportError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Não foi possível ler a captura local.';
}

export function createTrainerSessionRefresh(
  readSnapshot: () => Promise<PlayerSnapshot>,
  dispatch: (action: TrainerSessionAction) => void,
): TrainerSessionRefresh {
  let pendingRead: Promise<void> | null = null;
  let latestRead = 0;

  return (options): Promise<void> => {
    dispatch({type: 'refresh-started'});
    if (pendingRead && !options?.supersedePending) return pendingRead;

    const readId = ++latestRead;
    const request = Promise.resolve()
      .then(readSnapshot)
      .then((snapshot) => {
        if (readId === latestRead) dispatch({type: 'refresh-succeeded', snapshot});
      })
      .catch((error) => {
        if (readId === latestRead) dispatch({type: 'refresh-failed', error: describeImportError(error)});
      })
      .finally(() => {
        if (readId === latestRead && pendingRead === request) pendingRead = null;
      });

    pendingRead = request;
    return request;
  };
}

export function useTrainerSession(api: () => CompanionApi): TrainerSessionController {
  const [state, dispatch] = useReducer(trainerSessionReducer, undefined, createInitialTrainerSessionState);
  const apiRef = useRef(api);
  apiRef.current = api;
  const refreshRef = useRef<TrainerSessionRefresh | null>(null);
  if (!refreshRef.current) {
    refreshRef.current = createTrainerSessionRefresh(() => apiRef.current().readPlayerSnapshot(), dispatch);
  }

  const refresh = refreshRef.current;

  const selectIndividual = useCallback((uuid: string): void => {
    dispatch({type: 'individual-selected', uuid});
  }, []);

  const updateMoveSwap = useCallback((patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void => {
    dispatch({type: 'move-swap-updated', patch});
  }, []);

  const applySnapshot = useCallback((snapshot: PlayerSnapshot): void => {
    dispatch({type: 'refresh-succeeded', snapshot});
  }, []);

  return {
    ...state,
    refresh,
    applySnapshot,
    selectIndividual,
    updateMoveSwap,
  };
}
