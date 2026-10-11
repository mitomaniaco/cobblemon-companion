import type {
  GuideResult,
  PlayerSnapshot,
  TrainingCapOrigin,
  TrainingEvPlan,
  TrainingPlanMemberResult,
  TrainingPlanRequest,
  TrainingStatKey,
  TrainingMove,
} from '../../platform/api';

const EV_PER_STAT_LIMIT = 252;
export const TRAINING_EV_TOTAL_LIMIT = 510;

const TRAINING_STAT_ORDER: readonly TrainingStatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const TRAINING_STAT_LABEL: Record<TrainingStatKey, string> = {
  hp: 'HP',
  atk: 'Ataque',
  def: 'Defesa',
  spa: 'At. especial',
  spd: 'Def. especial',
  spe: 'Velocidade',
};

/** `informado` significa que há um cap efetivo, digitado ou derivado do progresso. */
export const TRAINING_CAP_ORIGIN_LABEL: Record<TrainingCapOrigin, string> = {
  informado: 'cap conhecido',
  desconhecida: 'cap não determinado',
};

export const TRAINING_ROLE_LABEL: Record<TrainingEvPlan['role'], string> = {
  'atacante-físico': 'Atacante físico',
  'atacante-especial': 'Atacante especial',
  velocidade: 'Velocidade',
  resistência: 'Resistência',
};

/** Golpes úteis do membro para o objetivo: os avaliados do guia mais os que vale adquirir, sem repetir. */
export function buildTrainingPlanRequest(
  snapshot: PlayerSnapshot,
  guide: Pick<GuideResult, 'team'>,
  levelCap: number | null,
  jobId?: string,
): TrainingPlanRequest | null {
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
    capOrigin: levelCap === null ? 'desconhecida' : 'informado',
    ...(jobId === undefined ? {} : {jobId}),
  };
}

export function trainingLevelLabel(member: Pick<TrainingPlanMemberResult, 'level' | 'targetLevel' | 'levelCap'>): string {
  if (member.targetLevel === null) return `Nv. ${member.level} · nível-alvo não determinado`;
  if (member.targetLevel === member.level) return `Nv. ${member.level} · já no alvo`;
  return `Nv. ${member.level} → ${member.targetLevel}${member.levelCap === null ? '' : ` (cap ${member.levelCap})`}`;
}

export type TrainingEvRow = {stat: TrainingStatKey; current: number | null; suggested: number | null};

/** Só os atributos que importam: sugeridos, ou com EV atual conhecido e acima de zero; desconhecido continua `null`, nunca 0. */
export function trainingEvRows(evs: Pick<TrainingEvPlan, 'currentEvs' | 'suggestedEvs'>): TrainingEvRow[] {
  return TRAINING_STAT_ORDER.flatMap((stat) => {
    const suggested = evs.suggestedEvs[stat] ?? null;
    const current = evs.currentEvs[stat];
    return suggested === null && (current === null || current === 0) ? [] : [{stat, current, suggested}];
  });
}

/** Total da distribuição sugerida e se ela respeita 252 por atributo e 510 no total (a tela avisa se o motor devolver fora disso). */
export function trainingEvTotals(suggestedEvs: TrainingEvPlan['suggestedEvs']): {total: number; withinLimits: boolean} {
  const values = TRAINING_STAT_ORDER.map((stat) => suggestedEvs[stat] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {total, withinLimits: total <= TRAINING_EV_TOTAL_LIMIT && values.every((value) => value <= EV_PER_STAT_LIMIT)};
}

export const TRAINING_STAT_SHORT_LABEL: Record<TrainingStatKey, string> = {
  hp: 'HP',
  atk: 'Ataque',
  def: 'Defesa',
  spa: 'Atq. Esp.',
  spd: 'Def. Esp.',
  spe: 'Veloc.',
};

export type TrainingEvBar = {
  stat: TrainingStatKey;
  /** `null` = EV atual não capturado (nunca vira zero). */
  current: number | null;
  suggested: number | null;
  /** 0 a 1 sobre o limite de 252 por atributo. */
  currentRatio: number;
  suggestedRatio: number;
  /** `focus`: recebe EV sugerido; `idle`: não faz parte da distribuição. */
  state: 'focus' | 'idle';
};

/** Os seis atributos sempre, na ordem do jogo; os que não recebem EV sugerido ficam como `idle`. */
export function trainingEvBars(evs: Pick<TrainingEvPlan, 'currentEvs' | 'suggestedEvs'>): TrainingEvBar[] {
  const ratio = (value: number | null) => (value === null ? 0 : Math.min(1, Math.max(0, value / EV_PER_STAT_LIMIT)));
  return TRAINING_STAT_ORDER.map((stat) => {
    const suggested = evs.suggestedEvs[stat] ?? null;
    const current = evs.currentEvs[stat];
    return {
      stat,
      current,
      suggested,
      currentRatio: ratio(current),
      suggestedRatio: ratio(suggested),
      state: suggested !== null && suggested > 0 ? 'focus' : 'idle',
    };
  });
}

export type TrainingTrackNode = {
  level: number;
  /** 0 (nível atual) a 1 (alvo). */
  position: number;
  isStart: boolean;
  isEnd: boolean;
  /** Golpes aprendidos exatamente neste nível, na ordem recebida. */
  moves: TrainingMove[];
};

const TRAINING_TRACK_ALL_LEVELS_SPAN = 10;

/**
 * Marcadores do caminho do nível atual até o alvo: início, alvo e cada nível com golpe novo; com até 10 níveis de
 * distância mostra também os intermediários. Golpes fora do intervalo ficam presos às pontas. `null` sem nível-alvo.
 */
export function trainingTrack(member: Pick<TrainingPlanMemberResult, 'level' | 'targetLevel' | 'moves'>): TrainingTrackNode[] | null {
  const {level: start, targetLevel: end} = member;
  if (end === null || end < start) return null;
  const clamp = (level: number) => Math.min(end, Math.max(start, level));
  const levels = new Set<number>([start, end]);
  if (end - start <= TRAINING_TRACK_ALL_LEVELS_SPAN) for (let level = start; level <= end; level += 1) levels.add(level);
  for (const move of member.moves) levels.add(clamp(move.level));
  const span = end - start;
  return [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      position: span === 0 ? 0 : (level - start) / span,
      isStart: level === start,
      isEnd: level === end,
      moves: member.moves.filter((move) => clamp(move.level) === level),
    }));
}

/** Golpes do caminho do mais cedo para o mais tarde (estável entre golpes do mesmo nível). */
export function trainingMovesByLevel(moves: readonly TrainingMove[]): TrainingMove[] {
  return [...moves].sort((a, b) => a.level - b.level);
}
