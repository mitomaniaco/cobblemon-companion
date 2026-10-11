import {speciesDisplay} from '../../domain/dex';
import type {EvolutionPlanResult, GuideResult, TrainingPlanResult} from '../../platform/api';
import {guideGapOpponentIds} from './capture-model';
import type {GuideTab, GuideToolStatus} from './guide-model';

const NO_RESULT = 'Monte o time primeiro';

type ToolStatusInput = {
  result: GuideResult | null;
  evolutions: EvolutionPlanResult | null;
  training: TrainingPlanResult | null;
  levelCap: number | null;
};

function evolutionStatus(plan: EvolutionPlanResult | null): GuideToolStatus {
  if (plan === null) return {subtitle: 'Quem pode evoluir'};
  const evolving = plan.members.filter((member) => member.status === 'evolui');
  const pending = evolving.filter((member) => member.options.every((option) => option.withinCap === false)).length;
  const ready = evolving.length - pending;
  if (evolving.length === 0) return {subtitle: 'Ninguém evolui agora'};
  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} ${ready === 1 ? 'pronto' : 'prontos'}`);
  if (pending > 0) parts.push(`${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`);
  return {subtitle: parts.join(' · '), badge: {text: String(evolving.length), tone: pending > 0 ? 'warn' : 'ok'}};
}

function trainingStatus(plan: TrainingPlanResult | null, levelCap: number | null): GuideToolStatus {
  if (plan === null) return {subtitle: 'Até o level cap'};
  const behind = plan.members.filter((member) => member.targetLevel !== null && member.level < member.targetLevel).length;
  const cap = levelCap ?? plan.members.find((member) => member.levelCap !== null)?.levelCap ?? null;
  if (cap === null) return {subtitle: 'Cap não informado'};
  if (behind === 0) return {subtitle: `Todos no Nv. ${cap}`, badge: {text: '0', tone: 'ok'}};
  return {subtitle: `${behind} abaixo do Nv. ${cap}`, badge: {text: String(behind), tone: 'warn'}};
}

function captureStatus(result: GuideResult | null): GuideToolStatus {
  if (result === null) return {subtitle: 'Lacunas do time'};
  const gapIds = guideGapOpponentIds(result);
  if (gapIds.length === 0) return {subtitle: 'Sem lacunas no time', badge: {text: '0', tone: 'ok'}};
  const first = result.opponents.find((opponent) => opponent.id === gapIds[0]);
  const name = first ? speciesDisplay(first.speciesId, 'normal').name : 'o adversário';
  return {
    subtitle: `Contra ${name}${gapIds.length > 1 ? ` e mais ${gapIds.length - 1}` : ''}`,
    badge: {text: String(gapIds.length), tone: 'warn'},
  };
}

/** Subtítulo, selo e bloqueio de cada ferramenta do dock, derivados do guia e dos planos já calculados. */
export function guideToolStatuses({result, evolutions, training, levelCap}: ToolStatusInput): Record<GuideTab, GuideToolStatus> {
  const blocked = result === null ? NO_RESULT : undefined;
  const pve = result !== null && result.goal.kind !== 'trainer';
  return {
    team: {subtitle: 'Colunas do cartão'},
    battle: {
      subtitle: pve ? 'Só contra treinador' : 'Simulação',
      disabledReason: blocked ?? (pve ? 'O plano de batalha é calculado contra um líder ou treinador.' : undefined),
    },
    evolutions: {...evolutionStatus(evolutions), disabledReason: blocked},
    training: {...trainingStatus(training, levelCap), disabledReason: blocked},
    captures: {...captureStatus(result), disabledReason: blocked},
  };
}
