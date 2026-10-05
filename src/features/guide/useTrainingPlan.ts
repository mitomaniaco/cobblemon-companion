import type {CompanionApi, GuideResult, PlayerSnapshot, TrainingPlanResult} from '../../platform/api';
import {buildTrainingPlanRequest} from './training-model';
import {useGuideJob, type GuideJobController} from './useGuideJob';

export type TrainingPlanController = GuideJobController<TrainingPlanResult>;

/** Treino do time do guia até o level cap (`levelCap` nulo = não determinado). Descartado quando o guia muda. */
export function useTrainingPlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
  levelCap: number | null,
): TrainingPlanController {
  return useGuideJob({
    api,
    snapshot,
    guideResult,
    jobPrefix: 'training-plan',
    fallbackError: 'O plano de treino não foi montado.',
    buildRequest: (currentSnapshot, guide, jobId) => buildTrainingPlanRequest(currentSnapshot, guide, levelCap, jobId),
    run: (companion, request) => companion.buildTrainingPlan(request),
  });
}
