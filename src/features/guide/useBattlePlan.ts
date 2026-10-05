import {useCallback, useEffect, useReducer, useRef} from 'react';
import type {CompanionApi, GuideResult, PlayerSnapshot} from '../../platform/api';
import {battlePlanReducer, buildBattlePlanRequest, createBattlePlanState, type BattlePlanState} from './battle-plan-model';

export type BattlePlanController = BattlePlanState & {
  /** Monta o plano para o time do guia atual. */
  request(): void;
  cancel(): void;
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'O plano de batalha não foi montado.';
}

/**
 * Plano de batalha do time do guia. Vale só para o resultado do guia que o originou: quando o time, o objetivo
 * ou o save mudam (`guideResult` novo), o plano antigo é descartado em vez de aparentar estar atual.
 */
export function useBattlePlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
): BattlePlanController {
  const [state, dispatch] = useReducer(battlePlanReducer, undefined, createBattlePlanState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const guideRef = useRef(guideResult);
  guideRef.current = guideResult;
  const requestRef = useRef(0);
  const jobRef = useRef<string | null>(null);

  const cancelJob = useCallback(
    (jobId: string | null) => {
      if (jobId === null) return;
      void Promise.resolve()
        .then(() => api().cancel(jobId))
        .catch(() => undefined);
    },
    [api],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: o gatilho é a identidade do resultado do guia
  useEffect(() => {
    cancelJob(jobRef.current);
    jobRef.current = null;
    requestRef.current += 1;
    dispatch({type: 'reset'});
  }, [guideResult, cancelJob]);

  const request = useCallback(() => {
    const currentSnapshot = snapshotRef.current;
    const currentGuide = guideRef.current;
    if (!currentSnapshot || !currentGuide) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const jobId = `battle-plan-${requestId}`;
    const built = buildBattlePlanRequest(currentSnapshot, currentGuide, jobId);
    if (!built) return;
    cancelJob(jobRef.current);
    jobRef.current = jobId;
    dispatch({type: 'build-started', requestId});
    void Promise.resolve()
      .then(() => api().buildBattlePlan(built))
      .then((result) => dispatch({type: 'build-succeeded', requestId, result}))
      .catch((error) => dispatch({type: 'build-failed', requestId, error: describeError(error)}))
      .finally(() => {
        if (jobRef.current === jobId) jobRef.current = null;
      });
  }, [api, cancelJob]);

  const cancel = useCallback(() => {
    if (stateRef.current.phase !== 'building') return;
    cancelJob(jobRef.current);
    dispatch({type: 'build-canceled', requestId: stateRef.current.requestId});
  }, [cancelJob]);

  return {...state, request, cancel};
}
