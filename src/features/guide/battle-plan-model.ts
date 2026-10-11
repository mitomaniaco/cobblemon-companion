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

export type OpponentState = 'vence' | 'perde' | 'bloqueado' | 'sem-simulacao';

export interface OpponentProgress {
  state: OpponentState;
  /** Passo (1-based) em que o adversário cai (`vence`) ou em que o seu time cai (`perde`). */
  stepNumber: number | null;
  /** Posição (1-based) do adversário que trava a simulação, quando este fica sem simulação. */
  waitingFor: number | null;
}

/** Estado de cada adversário na simulação: derrotado, o time cai nele, bloqueado ou sem simulação (depende de um anterior). */
export function battleOpponentProgress(entries: BattlePlanEntry[], simulation: BattleSimulation | null): OpponentProgress[] {
  const steps = simulation?.steps ?? [];
  const blockedAt = entries.findIndex((entry) => entry.status === 'bloqueado');
  const firstOpen = entries.findIndex(
    (entry, index) => entry.status === 'bloqueado' || !steps.some((step) => step.opponentIndex === index),
  );
  return entries.map((entry, index) => {
    const own = steps.flatMap((step, stepIndex) => (step.opponentIndex === index ? [{step, number: stepIndex + 1}] : []));
    const won = own.find(({step}) => step.outcome === 'adversário derrotado');
    if (won) return {state: 'vence', stepNumber: won.number, waitingFor: null};
    const last = own.at(-1);
    if (last?.step.outcome === 'membro derrotado' && simulation?.status === 'time derrotado') {
      return {state: 'perde', stepNumber: last.number, waitingFor: null};
    }
    if (entry.status === 'bloqueado') return {state: 'bloqueado', stepNumber: null, waitingFor: null};
    const waiting = blockedAt >= 0 && blockedAt < index ? blockedAt : firstOpen;
    return {state: 'sem-simulacao', stepNumber: null, waitingFor: waiting >= 0 && waiting !== index ? waiting + 1 : null};
  });
}

/** Motivo técnico de bloqueio em português de jogador; nunca devolve o texto bruto nem ids. */
export function blockedReasonLabel(reason: string | null): string {
  const text = reason ?? '';
  if (/subconjunto compat|forma .*não foi capturada|sem correspondência/i.test(text)) {
    return 'Ainda não temos os dados deste Pokémon, então não dá para prever o duelo.';
  }
  if (/item fora do adaptador/i.test(text)) {
    return 'Ele pode segurar um item que ainda não calculamos (Mega Evolução, Cristal Z ou item raro).';
  }
  if (/habilidade .*fora do adaptador/i.test(text)) {
    return 'A habilidade dele muda a luta de um jeito que ainda não calculamos.';
  }
  if (/habilidade .*fora do catálogo/i.test(text)) return 'Ainda não temos os dados da habilidade dele.';
  if (/golpe .*fora do catálogo/i.test(text)) return 'Ele usa um golpe que ainda não temos nos dados.';
  if (/natureza .*fora do catálogo/i.test(text)) return 'Ainda não temos os dados da natureza dele.';
  if (/em disputa/i.test(text)) return 'Clima ou terreno em disputa: depende de quem entra por último.';
  if (/motor de cálculo recusou/i.test(text)) return 'O cálculo não aceitou este adversário.';
  return 'Ainda não dá para calcular este duelo.';
}

/** Por que a simulação parou, em português de jogador; texto desconhecido vira uma frase genérica. */
export function simulationStopLabel(stopReason: string | null): string {
  const text = stopReason ?? '';
  if (/impasse/i.test(text)) return 'Ninguém consegue causar dano ao outro: o duelo empata.';
  if (/limite de \d+ turnos/i.test(text)) return 'O duelo passa do limite de turnos que simulamos.';
  if (/ninguém pode abrir/i.test(text)) return 'Ninguém do seu time pôde ser avaliado contra ele.';
  if (/nenhum membro vivo/i.test(text)) return 'Ninguém que sobrou pôde ser avaliado contra ele.';
  return 'A simulação parou antes deste duelo.';
}

type MemberEntryKind = 'abre' | 'troca' | 'entra após derrota' | 'segue em campo';

const MEMBER_ENTRY_KIND: Record<BattleSimulationStep['entry'], MemberEntryKind> = {
  lead: 'abre',
  mantém: 'segue em campo',
  troca: 'troca',
  'após KO': 'entra após derrota',
};

export interface PlanRow {
  /** Passo simulado (`step`) ou adversário que ficou sem simulação (`pending`). */
  kind: 'step' | 'pending';
  opponentIndex: number;
  stepNumber: number | null;
  step: BattleSimulationStep | null;
  /** Como o adversário entra neste passo: abre, entra após derrota ou segue em campo. */
  opponentKind: 'abre' | 'entra após derrota' | 'segue em campo' | null;
  memberKind: MemberEntryKind | null;
}

/** Uma linha por passo simulado e uma por adversário sem simulação, na ordem da batalha. */
export function battlePlanRows(entries: BattlePlanEntry[], simulation: BattleSimulation | null): PlanRow[] {
  const steps = simulation?.steps ?? [];
  const rows: PlanRow[] = [];
  entries.forEach((_entry, index) => {
    const own = steps.flatMap((step, stepIndex) => (step.opponentIndex === index ? [{step, number: stepIndex + 1}] : []));
    if (own.length === 0) {
      rows.push({kind: 'pending', opponentIndex: index, stepNumber: null, step: null, opponentKind: null, memberKind: null});
      return;
    }
    own.forEach(({step, number}, position) => {
      rows.push({
        kind: 'step',
        opponentIndex: index,
        stepNumber: number,
        step,
        opponentKind: position > 0 ? 'segue em campo' : index === 0 ? 'abre' : 'entra após derrota',
        memberKind: MEMBER_ENTRY_KIND[step.entry],
      });
    });
  });
  return rows;
}

export interface PartyEndMember {
  uuid: string;
  speciesId: string;
  hp: number;
  maxHp: number;
  state: 'de-pe' | 'caiu' | 'nao-entrou';
  /** Passo (1-based) em que o membro cai. */
  fallStep: number | null;
}

/** Vida da equipe ao fim da simulação: quem entrou na ordem de entrada, quem caiu e quem nem chegou a entrar. */
export function battlePartyAtEnd(simulation: BattleSimulation): PartyEndMember[] {
  const members: PartyEndMember[] = [];
  simulation.steps.forEach((step, index) => {
    if (members.some((member) => member.uuid === step.memberUuid)) return;
    const survivor = simulation.remaining.find((member) => member.uuid === step.memberUuid);
    if (survivor) {
      members.push({
        uuid: step.memberUuid,
        speciesId: step.memberSpeciesId,
        hp: survivor.hp,
        maxHp: survivor.maxHp,
        state: 'de-pe',
        fallStep: null,
      });
      return;
    }
    const fell = simulation.steps.findIndex((other) => other.memberUuid === step.memberUuid && other.outcome === 'membro derrotado');
    members.push({
      uuid: step.memberUuid,
      speciesId: step.memberSpeciesId,
      hp: 0,
      maxHp: step.memberMaxHp,
      state: 'caiu',
      fallStep: (fell >= 0 ? fell : index) + 1,
    });
  });
  for (const member of simulation.remaining) {
    if (!members.some((known) => known.uuid === member.uuid)) {
      members.push({
        uuid: member.uuid,
        speciesId: member.speciesId,
        hp: member.hp,
        maxHp: member.maxHp,
        state: 'nao-entrou',
        fallStep: null,
      });
    }
  }
  return members;
}

const RISK_ORDER: BattlePlanRisk['kind'][] = ['bolsa', 'ia', 'campo', 'habilidade', 'item', 'golpe'];

export interface RiskGroup {
  kind: BattlePlanRisk['kind'];
  /** Adversários cujo plano declara este risco, sem repetir. */
  opponentIds: string[];
  /** Textos completos dos riscos (tooltip). */
  texts: string[];
}

/** Agrupa os riscos do treinador e dos adversários por tipo, na ordem de gravidade; `bag` entra como risco de bolsa. */
export function battleRiskGroups(result: Pick<BattlePlanResult, 'trainerRisks' | 'entries'>, bag: string | null): RiskGroup[] {
  const groups = new Map<BattlePlanRisk['kind'], RiskGroup>();
  const add = (kind: BattlePlanRisk['kind'], text: string | null, speciesId: string | null) => {
    const group = groups.get(kind) ?? {kind, opponentIds: [], texts: []};
    if (text && !group.texts.includes(text)) group.texts.push(text);
    if (speciesId && !group.opponentIds.includes(speciesId)) group.opponentIds.push(speciesId);
    groups.set(kind, group);
  };
  if (bag) add('bolsa', bag, null);
  for (const risk of result.trainerRisks) add(risk.kind, risk.text, null);
  for (const entry of result.entries) for (const risk of entry.risks) add(risk.kind, risk.text, entry.speciesId);
  return RISK_ORDER.flatMap((kind) => groups.get(kind) ?? []);
}
