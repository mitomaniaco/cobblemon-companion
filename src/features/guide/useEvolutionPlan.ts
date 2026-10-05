import type {CompanionApi, EvolutionPlanResult, GuideResult, PlayerSnapshot} from '../../platform/api';
import {buildEvolutionPlanRequest} from './evolution-model';
import {useGuideJob, type GuideJobController} from './useGuideJob';

export type EvolutionPlanController = GuideJobController<EvolutionPlanResult>;

/** Evoluções do time do guia, descartadas quando o guia muda. `levelCap` vem do campo da tela (nulo = desconhecido). */
export function useEvolutionPlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
  levelCap: number | null,
): EvolutionPlanController {
  return useGuideJob({
    api,
    snapshot,
    guideResult,
    jobPrefix: 'evolution-plan',
    fallbackError: 'O plano de evoluções não foi montado.',
    buildRequest: (currentSnapshot, guide, jobId) => buildEvolutionPlanRequest(currentSnapshot, guide, levelCap, jobId),
    run: (companion, request) => companion.buildEvolutionPlan(request),
  });
}
