import type {
  EvolutionMoveChange,
  EvolutionOption,
  EvolutionPlanMemberResult,
  EvolutionPlanRequest,
  EvolutionRequirement,
  GuideResult,
  PlayerSnapshot,
} from '../../platform/api';

const MIN_LEVEL_CAP = 1;
const MAX_LEVEL_CAP = 100;

/** Campo vazio ou inválido = cap desconhecido: o alcance fica "não verificado" em vez de inventar um número. */
export function parseLevelCap(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= MIN_LEVEL_CAP && value <= MAX_LEVEL_CAP ? value : null;
}

export function isInvalidLevelCapInput(input: string): boolean {
  return input.trim() !== '' && parseLevelCap(input) === null;
}

/** Golpes úteis do membro para o objetivo: os avaliados do guia mais os que vale adquirir, sem repetir. */
export function buildEvolutionPlanRequest(
  snapshot: PlayerSnapshot,
  guide: Pick<GuideResult, 'team'>,
  levelCap: number | null,
  jobId?: string,
): EvolutionPlanRequest | null {
  if (guide.team.length === 0) return null;
  return {
    sources: snapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
    team: guide.team.map((member) => ({
      uuid: member.uuid,
      usefulMoveIds: [
        ...new Set([
          ...member.moves.filter((move) => move.evaluated).map((move) => move.id),
          ...member.acquire.map((entry) => entry.moveId),
        ]),
      ],
    })),
    levelCap,
    ...(jobId === undefined ? {} : {jobId}),
  };
}

export function evolutionMethodLabel(method: EvolutionOption['method']): string {
  if (method === 'level_up') return 'Por nível';
  if (method === 'item_interact') return 'Com item';
  return 'Por troca';
}

export function evolutionRequirementStatusLabel(status: EvolutionRequirement['status']): string {
  return status === 'cumprido' ? 'cumprido' : status === 'pendente' ? 'pendente' : 'não verificado';
}

export function evolutionReachLabel(withinCap: EvolutionOption['withinCap']): string {
  if (withinCap === true) return 'Cabe no cap';
  if (withinCap === false) return 'Passa do cap';
  return 'Alcance não verificado';
}

export function evolutionMoveChangeKindLabel(kind: EvolutionMoveChange['kind']): string {
  return kind === 'atrasado' ? 'Chega mais tarde' : kind === 'perdido' ? 'Perde o golpe' : 'Chega mais cedo';
}

export function evolutionLevelCapLabel(levelCap: number | null): string {
  return levelCap === null ? 'Level cap não informado: o alcance fica não verificado.' : `Level cap usado: ${levelCap}.`;
}

/** Quantos membros têm ao menos uma opção de evolução; os demais são sem evolução ou bloqueados. */
export function evolutionSummary(members: readonly EvolutionPlanMemberResult[]): {evolving: number; none: number; blocked: number} {
  return {
    evolving: members.filter((member) => member.status === 'evolui').length,
    none: members.filter((member) => member.status === 'sem-evolução').length,
    blocked: members.filter((member) => member.status === 'bloqueado').length,
  };
}

export type EvolutionCardStatus = 'pronto' | 'pendente' | 'nao-verificado' | 'bloqueado';

const STATUS_RANK: Record<EvolutionCardStatus, number> = {pronto: 0, pendente: 1, 'nao-verificado': 2, bloqueado: 3};

export function evolutionStatusLabel(status: EvolutionCardStatus): string {
  if (status === 'pronto') return 'Pronto';
  if (status === 'pendente') return 'Pendente';
  if (status === 'nao-verificado') return 'Não verificado';
  return 'Bloqueado';
}

/**
 * Pronto = todo requisito cumprido e dentro do cap. Qualquer requisito pendente (ou nível acima do cap) é pendente.
 * Só requisitos que o app não captura (amizade, item, troca...) deixam a opção "não verificado": nunca viram "pronto".
 */
export function evolutionOptionStatus(option: EvolutionOption): Exclude<EvolutionCardStatus, 'bloqueado'> {
  if (option.withinCap === false || option.requirements.some((requirement) => requirement.status === 'pendente')) return 'pendente';
  if (option.requirements.some((requirement) => requirement.status === 'não verificado')) return 'nao-verificado';
  return 'pronto';
}

/** A alternativa mais próxima de acontecer; empate mantém a ordem recebida. */
function primaryEvolutionOption(options: readonly EvolutionOption[]): EvolutionOption | null {
  let best: EvolutionOption | null = null;
  for (const option of options) {
    if (best === null || STATUS_RANK[evolutionOptionStatus(option)] < STATUS_RANK[evolutionOptionStatus(best)]) best = option;
  }
  return best;
}

export interface EvolutionCard {
  member: EvolutionPlanMemberResult;
  /** Alternativa exibida. */
  option: EvolutionOption;
  /** Outras alternativas ("ou") do mesmo membro. */
  alternatives: EvolutionOption[];
  status: Exclude<EvolutionCardStatus, 'bloqueado'>;
}

export type EvolutionCompactKind = 'bloqueado' | 'sem-previsao' | 'forma-final';

export interface EvolutionCompact {
  member: EvolutionPlanMemberResult;
  kind: EvolutionCompactKind;
}

const COMPACT_RANK: Record<EvolutionCompactKind, number> = {bloqueado: 0, 'sem-previsao': 1, 'forma-final': 2};

/** Separa quem tem cartão grande de evolução (prontos primeiro) de quem vira cartão compacto (bloqueados, sem previsão, forma final). */
export function splitEvolutionMembers(members: readonly EvolutionPlanMemberResult[]): {
  cards: EvolutionCard[];
  compact: EvolutionCompact[];
} {
  const cards: EvolutionCard[] = [];
  const compact: EvolutionCompact[] = [];
  for (const member of members) {
    if (member.status === 'sem-evolução') {
      compact.push({member, kind: 'forma-final'});
      continue;
    }
    const option = member.status === 'evolui' ? primaryEvolutionOption(member.options) : null;
    if (option === null) {
      compact.push({member, kind: member.status === 'evolui' ? 'sem-previsao' : 'bloqueado'});
      continue;
    }
    cards.push({
      member,
      option,
      alternatives: member.options.filter((candidate) => candidate !== option),
      status: evolutionOptionStatus(option),
    });
  }
  return {
    cards: cards.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    compact: compact.sort((a, b) => COMPACT_RANK[a.kind] - COMPACT_RANK[b.kind]),
  };
}

/** Nível exigido (o maior) e o atual do membro; nulo quando a evolução não exige nível. */
export function evolutionLevelProgress(option: EvolutionOption, level: number): {current: number; required: number; ratio: number} | null {
  let required: number | null = null;
  for (const requirement of option.requirements) {
    if (requirement.kind !== 'nível') continue;
    const value = Number(requirement.text.match(/\d+/)?.[0]);
    if (Number.isInteger(value) && value > 0) required = Math.max(required ?? 0, value);
  }
  if (required === null) return null;
  return {current: Math.min(level, required), required, ratio: Math.min(level / required, 1)};
}

/** Requisito em linguagem de jogador: "Chegar ao nível 25 · falta 1", "Amizade 160 ou mais", "Trocar com outro jogador". */
export function evolutionRequirementText(requirement: EvolutionRequirement, level: number): string {
  const required = requirement.kind === 'nível' ? Number(requirement.text.match(/\d+/)?.[0]) : Number.NaN;
  if (Number.isInteger(required)) {
    const missing = required - level;
    return `Chegar ao nível ${required}${requirement.status === 'pendente' && missing > 0 ? ` · falta ${missing}` : ''}`;
  }
  if (requirement.kind === 'troca') return 'Trocar com outro jogador';
  return requirement.text.charAt(0).toUpperCase() + requirement.text.slice(1);
}

const MOVE_CHANGE_RANK: Record<EvolutionMoveChange['kind'], number> = {perdido: 0, atrasado: 1, adiantado: 2};

/** Golpes úteis ao objetivo primeiro; depois perdidos, atrasados e adiantados. */
export function orderedMoveChanges(changes: readonly EvolutionMoveChange[]): EvolutionMoveChange[] {
  return [...changes].sort((a, b) => Number(b.useful) - Number(a.useful) || MOVE_CHANGE_RANK[a.kind] - MOVE_CHANGE_RANK[b.kind]);
}

/** "Nv. 30 sem evoluir · Nv. 36 evoluído"; sem nível conhecido, devolve a nota pronta do motor. */
export function evolutionMoveTiming(change: EvolutionMoveChange): string {
  const parts: string[] = [];
  if (change.levelWithoutEvolving !== null) parts.push(`Nv. ${change.levelWithoutEvolving} sem evoluir`);
  if (change.levelAfterEvolving !== null) parts.push(`Nv. ${change.levelAfterEvolving} evoluído`);
  return parts.length > 0 ? parts.join(' · ') : change.note;
}
