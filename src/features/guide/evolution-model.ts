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
