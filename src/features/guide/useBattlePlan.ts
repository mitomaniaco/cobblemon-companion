import type {BattlePlanResult, CompanionApi, GuideResult, PlayerSnapshot} from '../../platform/api';
import {buildBattlePlanRequest} from './battle-plan-model';
import {useGuideJob, type GuideJobController} from './useGuideJob';

export type BattlePlanController = GuideJobController<BattlePlanResult>;

/** Plano de batalha do time do guia; descartado quando o resultado do guia muda. O cap e o toggle seguem o do guia. */
export function useBattlePlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
  levelCap: number | null,
  respectLevelCap: boolean,
): BattlePlanController {
  return useGuideJob({
    api,
    snapshot,
    guideResult,
    jobPrefix: 'battle-plan',
    fallbackError: 'O plano de batalha não foi montado.',
    buildRequest: (currentSnapshot, guide, jobId) => buildBattlePlanRequest(currentSnapshot, guide, levelCap, respectLevelCap, jobId),
    run: (companion, request) => companion.buildBattlePlan(request),
  });
}
