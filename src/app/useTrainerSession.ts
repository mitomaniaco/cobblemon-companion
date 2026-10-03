import {useCallback, useReducer, useRef} from 'react';
import type {MoveSwapPlan} from '../domain/move-swap';
import type {CompanionApi, PlayerSnapshot} from '../platform/api';
import {createInitialTrainerSessionState, trainerSessionReducer, type ImportPhase} from './trainer-session-model';

export type TrainerSessionController = {
  snapshot: PlayerSnapshot | null;
  phase: ImportPhase;
  error: string | null;
  selectedUuid: string | null;
  moveSwapPlan: MoveSwapPlan;
  refresh(): Promise<void>;
  selectIndividual(uuid: string): void;
  updateMoveSwap(patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void;
};

function describeImportError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Não foi possível ler a captura local.';
}

export function useTrainerSession(api: () => CompanionApi): TrainerSessionController {
  const [state, dispatch] = useReducer(trainerSessionReducer, undefined, createInitialTrainerSessionState);
  const pendingReadRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    dispatch({type: 'refresh-started'});
    if (pendingReadRef.current) return pendingReadRef.current;

    const request = Promise.resolve()
      .then(() => api().readPlayerSnapshot())
      .then((snapshot) => {
        dispatch({type: 'refresh-succeeded', snapshot});
      })
      .catch((error) => {
        dispatch({type: 'refresh-failed', error: describeImportError(error)});
      })
      .finally(() => {
        if (pendingReadRef.current === request) pendingReadRef.current = null;
      });

    pendingReadRef.current = request;
    return request;
  }, [api]);

  const selectIndividual = useCallback((uuid: string): void => {
    dispatch({type: 'individual-selected', uuid});
  }, []);

  const updateMoveSwap = useCallback((patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void => {
    dispatch({type: 'move-swap-updated', patch});
  }, []);

  return {
    ...state,
    refresh,
    selectIndividual,
    updateMoveSwap,
  };
}
