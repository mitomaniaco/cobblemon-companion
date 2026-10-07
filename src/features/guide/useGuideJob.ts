import {useCallback, useEffect, useReducer, useRef} from 'react';
import type {CompanionApi, GuideResult, PlayerSnapshot} from '../../platform/api';
import {createJobState, jobReducer, type JobState} from './job-model';

export type GuideJobController<Result> = JobState<Result> & {
  request(): void;
  cancel(): void;
};

type GuideJobOptions<Result, Request> = {
  api: () => CompanionApi;
  snapshot: PlayerSnapshot | null;
  guideResult: GuideResult | null;
  /** Prefixo do `jobId` enviado para `cancel(jobId)`. */
  jobPrefix: string;
  fallbackError: string;
  /** `null`: não há o que montar para este resultado do guia. */
  buildRequest(snapshot: PlayerSnapshot, guide: GuideResult, jobId: string): Request | null | Promise<Request | null>;
  run(api: CompanionApi, request: Request): Promise<Result>;
};

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return fallback;
}

/**
 * Montagem cancelável derivada do resultado do guia. Vale só para o resultado que a originou: quando o time,
 * o objetivo ou o save mudam (`guideResult` novo), o resultado antigo é descartado em vez de aparentar estar atual.
 */
export function useGuideJob<Result, Request>(options: GuideJobOptions<Result, Request>): GuideJobController<Result> {
  const [state, dispatch] = useReducer(jobReducer<Result>, undefined, createJobState<Result>);
  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const requestRef = useRef(0);
  const jobRef = useRef<string | null>(null);
  const {api, guideResult} = options;

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
    const current = optionsRef.current;
    const {snapshot, guideResult} = current;
    if (!snapshot || !guideResult) return;
    const requestId = requestRef.current + 1;
    const jobId = `${current.jobPrefix}-${requestId}`;
    requestRef.current = requestId;
    cancelJob(jobRef.current);
    jobRef.current = jobId;
    dispatch({type: 'build-started', requestId});
    void Promise.resolve()
      .then(() => current.buildRequest(snapshot, guideResult, jobId))
      .then((built) => {
        if (requestRef.current !== requestId) return;
        if (built === null) {
          dispatch({type: 'reset'});
          return;
        }
        return current.run(current.api(), built);
      })
      .then((result) => {
        if (result !== undefined && requestRef.current === requestId) dispatch({type: 'build-succeeded', requestId, result});
      })
      .catch((error) => {
        if (requestRef.current === requestId)
          dispatch({type: 'build-failed', requestId, error: describeError(error, current.fallbackError)});
      })
      .finally(() => {
        if (jobRef.current === jobId) jobRef.current = null;
      });
  }, [cancelJob]);

  const cancel = useCallback(() => {
    if (stateRef.current.phase !== 'building') return;
    requestRef.current += 1;
    cancelJob(jobRef.current);
    dispatch({type: 'build-canceled', requestId: stateRef.current.requestId});
  }, [cancelJob]);

  return {...state, request, cancel};
}
