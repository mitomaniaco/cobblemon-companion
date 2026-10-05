import type {CapturePlanResult, CompanionApi, GuideResult, PlayerSnapshot} from '../../platform/api';
import {buildCapturePlanRequest} from './capture-model';
import {useGuideJob, type GuideJobController} from './useGuideJob';

export type CapturePlanController = GuideJobController<CapturePlanResult>;

/** Capturas recomendadas para as lacunas do time do guia; descartadas quando o guia muda. */
export function useCapturePlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
): CapturePlanController {
  return useGuideJob({
    api,
    snapshot,
    guideResult,
    jobPrefix: 'capture-plan',
    fallbackError: 'As capturas recomendadas não foram montadas.',
    buildRequest: buildCapturePlanRequest,
    run: (companion, request) => companion.buildCapturePlan(request),
  });
}
