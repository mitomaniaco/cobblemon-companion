import {useState} from 'react';
import type {CompanionApi, EvolutionPlanResult, GuideResult, PlayerSnapshot} from '../../platform/api';
import {buildEvolutionPlanRequest, parseLevelCap} from './evolution-model';
import {useGuideJob, type GuideJobController} from './useGuideJob';

export type EvolutionPlanController = GuideJobController<EvolutionPlanResult> & {
  /** Texto do campo "level cap"; vazio ou inválido = desconhecido. */
  levelCapInput: string;
  setLevelCapInput(value: string): void;
};

/** Evoluções do time do guia, descartadas quando o guia muda. O cap vem do campo da tela (nunca presumido). */
export function useEvolutionPlan(
  api: () => CompanionApi,
  snapshot: PlayerSnapshot | null,
  guideResult: GuideResult | null,
): EvolutionPlanController {
  const [levelCapInput, setLevelCapInput] = useState('');
  const levelCap = parseLevelCap(levelCapInput);
  const job = useGuideJob({
    api,
    snapshot,
    guideResult,
    jobPrefix: 'evolution-plan',
    fallbackError: 'O plano de evoluções não foi montado.',
    buildRequest: (currentSnapshot, guide, jobId) => buildEvolutionPlanRequest(currentSnapshot, guide, levelCap, jobId),
    run: (companion, request) => companion.buildEvolutionPlan(request),
  });
  return {...job, levelCapInput, setLevelCapInput};
}
