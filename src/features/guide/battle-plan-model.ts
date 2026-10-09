import type {
  BattlePlanDamage,
  BattleSimulation,
  BattleSimulationStep,
  BattlePlanEntry,
  BattlePlanRequest,
  BattlePlanResult,
  BattlePlanRisk,
  GuideResult,
  PlayerSnapshot,
} from '../../platform/api';

/** O plano só vale para o time do guia que o originou: só golpes avaliados entram, e o item sugerido (ou o que já segura). */
export function buildBattlePlanRequest(
  snapshot: PlayerSnapshot,
  guide: Pick<GuideResult, 'goal' | 'team'>,
  levelCap: number | null,
  respectLevelCap: boolean,
  jobId?: string,
): BattlePlanRequest | null {
  if (guide.goal.kind !== 'trainer' || guide.team.length === 0) return null;
  return {
    sources: snapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
    trainerId: guide.goal.trainerId,
    levelCap,
    respectLevelCap,
    team: guide.team.map((member) => ({
      uuid: member.uuid,
      moveIds: member.moves.filter((move) => move.evaluated).map((move) => move.id),
      itemId: member.item.status === 'nenhum' ? null : member.item.id,
    })),
    ...(jobId === undefined ? {} : {jobId}),
  };
}

export const BATTLE_PLAN_DOUBLES_TEXT = 'Batalha em dupla, fora do escopo.';

export function battlePlanFirstToActLabel(firstToAct: BattlePlanEntry['firstToAct']): string {
  if (firstToAct === 'jogador') return 'Você age primeiro';
  if (firstToAct === 'adversário') return 'O adversário age primeiro';
  if (firstToAct === 'incerto') return 'Ordem incerta';
  return 'Ordem não calculada';
}

/** `22–27 HP de 100 (22–27%)`; sem HP máximo conhecido não calcula percentual. */
export function battlePlanDamageLabel(damage: BattlePlanDamage): string {
  const range = `${damage.min}–${damage.max} HP`;
  if (damage.targetHP <= 0) return range;
  const percent = (value: number) => Math.round((value / damage.targetHP) * 100);
  return `${range} de ${damage.targetHP} (${percent(damage.min)}–${percent(damage.max)}%)`;
}

const RISK_KIND_LABEL: Record<BattlePlanRisk['kind'], string> = {
  habilidade: 'Habilidade',
  item: 'Item',
  golpe: 'Golpe',
  bolsa: 'Bolsa',
  campo: 'Campo',
  ia: 'IA',
};

export function battlePlanRiskKindLabel(kind: BattlePlanRisk['kind']): string {
  return RISK_KIND_LABEL[kind];
}

export function battlePlanBagLabel(trainer: BattlePlanResult['trainer'], itemName: (id: string) => string): string | null {
  const items = trainer.bag.map((entry) => `${itemName(entry.itemId)} ×${entry.quantity}`);
  if (items.length === 0 && trainer.maxItemUses === null) return null;
  const uses = trainer.maxItemUses === null ? '' : `máximo de ${trainer.maxItemUses} ${trainer.maxItemUses === 1 ? 'uso' : 'usos'}`;
  return [items.length > 0 ? items.join(', ') : 'sem itens', uses].filter((part) => part.length > 0).join(' · ');
}

export function hpPercent(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
}

const SIMULATION_ENTRY_LABEL: Record<BattleSimulationStep['entry'], string> = {
  lead: 'abre',
  mantém: 'segue',
  troca: 'entra na troca',
  'após KO': 'entra após KO',
};

/** `Gardevoir abre contra Floatzel: 100%→64% · adversário 100%→0% · 2 turnos · adversário derrotado`. */
export function battleSimulationStepLabel(step: BattleSimulationStep, memberName: string, opponentName: string): string {
  const turns = `${step.turns} ${step.turns === 1 ? 'turno' : 'turnos'}`;
  return [
    `${memberName} ${SIMULATION_ENTRY_LABEL[step.entry]} contra ${opponentName}: ${hpPercent(step.memberHpBefore, step.memberMaxHp)}%→${hpPercent(step.memberHpAfter, step.memberMaxHp)}%`,
    `adversário ${hpPercent(step.opponentHpBefore, step.opponentMaxHp)}%→${hpPercent(step.opponentHpAfter, step.opponentMaxHp)}%`,
    turns,
    step.outcome,
  ].join(' · ');
}

/** `Adversários derrotados: 2 de 3 · Membros restantes: 4 de 6`, mais o status quando a simulação não concluiu. */
export function battleSimulationSummary(simulation: BattleSimulation): string {
  const teamSize = new Set([...simulation.steps.map((step) => step.memberUuid), ...simulation.remaining.map((member) => member.uuid)]).size;
  const parts = [
    `Adversários derrotados: ${simulation.opponentsDefeated} de ${simulation.opponentsTotal}`,
    `Membros restantes: ${simulation.remaining.length} de ${teamSize}`,
  ];
  if (simulation.status !== 'concluída')
    parts.push(`Simulação ${simulation.status}${simulation.stopReason ? `: ${simulation.stopReason}` : ''}`);
  return parts.join(' · ');
}
