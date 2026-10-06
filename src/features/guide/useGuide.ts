import {useCallback, useEffect, useReducer, useRef} from 'react';
import type {CompanionApi, GuideGoal, PlayerSnapshot} from '../../platform/api';
import {
  createGuideState,
  currentGuideGoal,
  guideBuildCause,
  guideBuildKey,
  guideRequestLevelCap,
  guideReducer,
  guideSourcesKey,
  shouldAutoBuildGuide,
  type GuideMode,
  type GuideState,
} from './guide-model';

export type GuideController = GuideState & {
  goal: GuideGoal | null;
  selectMode(mode: GuideMode): void;
  selectTrainer(trainerId: string): void;
  /** Força a montagem, mesmo com o mesmo objetivo e o mesmo save. */
  rebuild(): void;
  cancel(): void;
  dismissNotice(id: number): void;
};

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return fallback;
}

/**
 * Estado da tela Guia, mantido fora do componente para sobreviver à ida ao Dano e à volta.
 * `active`: só monta/recalcula enquanto a tela Guia está aberta.
 */
export function useGuide(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  active: boolean,
  levelCap: number | null,
  respectLevelCap: boolean,
): GuideController {
  const [state, dispatch] = useReducer(guideReducer, undefined, createGuideState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const levelCapRef = useRef(levelCap);
  levelCapRef.current = levelCap;
  const respectRef = useRef(respectLevelCap);
  respectRef.current = respectLevelCap;
  const requestRef = useRef(0);
  const jobRef = useRef<string | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);
  const nextGoalRequestedRef = useRef<string | null>(null);

  const sourcesKey = snapshot ? guideSourcesKey(snapshot) : null;
  const hasSnapshot = snapshot !== null;
  const goal = currentGuideGoal(state);

  const cancelJob = useCallback(
    (jobId: string | null) => {
      if (jobId === null) return;
      void Promise.resolve()
        .then(() => api().cancel(jobId))
        .catch(() => undefined);
    },
    [api],
  );

  const start = useCallback(
    (currentSnapshot: PlayerSnapshot, currentGoal: GuideGoal) => {
      const sources = guideSourcesKey(currentSnapshot);
      cancelJob(jobRef.current);
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      const jobId = `guide-${requestId}`;
      jobRef.current = jobId;
      const requestCap = guideRequestLevelCap(currentGoal, levelCapRef.current);
      attemptedKeyRef.current = guideBuildKey(sources, currentGoal, levelCapRef.current, respectRef.current);
      dispatch({type: 'build-started', requestId, cause: guideBuildCause(stateRef.current, sources)});
      void Promise.resolve()
        .then(() =>
          api().buildGuide({
            sources: currentSnapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
            goal: currentGoal,
            levelCap: requestCap,
            respectLevelCap: respectRef.current,
            jobId,
          }),
        )
        .then((result) => dispatch({type: 'build-succeeded', requestId, result, sources}))
        .catch((error) => dispatch({type: 'build-failed', requestId, error: describeError(error, 'O guia não foi montado.')}))
        .finally(() => {
          if (jobRef.current === jobId) jobRef.current = null;
        });
    },
    [api, cancelJob],
  );

  useEffect(() => {
    if (hasSnapshot) return;
    cancelJob(jobRef.current);
    jobRef.current = null;
    attemptedKeyRef.current = null;
    nextGoalRequestedRef.current = null;
    requestRef.current += 1;
    dispatch({type: 'reset'});
  }, [hasSnapshot, cancelJob]);

  const trainersIdle = state.trainers.status === 'idle';
  useEffect(() => {
    if (!active || !hasSnapshot || !trainersIdle) return;
    dispatch({type: 'trainers-requested'});
    void Promise.resolve()
      .then(() => api().listGuideTrainers())
      .then((items) => dispatch({type: 'trainers-loaded', items}))
      .catch((error) => dispatch({type: 'trainers-failed', error: describeError(error, 'Não foi possível listar os treinadores.')}));
  }, [active, hasSnapshot, trainersIdle, api]);

  useEffect(() => {
    if (!active || sourcesKey === null || nextGoalRequestedRef.current === sourcesKey) return;
    const key = sourcesKey;
    nextGoalRequestedRef.current = key;
    void Promise.resolve()
      .then(() => api().guideNextGoal())
      .then((next) => dispatch({type: 'next-goal-loaded', key, next}))
      .catch((error) =>
        dispatch({type: 'next-goal-failed', key, error: describeError(error, 'Não foi possível sugerir o próximo objetivo.')}),
      );
  }, [active, sourcesKey, api]);

  const nextGoalKey = state.nextGoal?.key ?? null;
  const {mode, trainerId} = state;
  useEffect(() => {
    const current = snapshotRef.current;
    const buildGoal = currentGuideGoal({mode, trainerId});
    if (!current || buildGoal === null) return;
    const shouldBuild = shouldAutoBuildGuide({
      active,
      sourcesKey,
      goal: buildGoal,
      levelCap,
      respectLevelCap,
      nextGoalKey,
      attemptedKey: attemptedKeyRef.current,
    });
    if (shouldBuild) start(current, buildGoal);
  }, [active, sourcesKey, mode, trainerId, levelCap, respectLevelCap, nextGoalKey, start]);

  const selectMode = useCallback((nextMode: GuideMode) => dispatch({type: 'mode-selected', mode: nextMode}), []);
  const selectTrainer = useCallback((id: string) => dispatch({type: 'trainer-selected', trainerId: id}), []);
  const dismissNotice = useCallback((id: number) => dispatch({type: 'notice-dismissed', id}), []);

  const rebuild = useCallback(() => {
    const current = snapshotRef.current;
    const currentGoal = currentGuideGoal(stateRef.current);
    if (current && currentGoal) start(current, currentGoal);
  }, [start]);

  const cancel = useCallback(() => {
    if (stateRef.current.phase !== 'building') return;
    cancelJob(jobRef.current);
    dispatch({type: 'build-canceled', requestId: stateRef.current.requestId});
  }, [cancelJob]);

  return {...state, goal, selectMode, selectTrainer, rebuild, cancel, dismissNotice};
}
