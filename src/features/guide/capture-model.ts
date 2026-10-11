import type {
  CaptureCandidate,
  CaptureGap,
  CaptureOwned,
  CapturePlanRequest,
  CaptureRequirement,
  CaptureSpawn,
  GuideResult,
  PlayerSnapshot,
} from '../../platform/api';

/** Adversários que nenhum membro do time vence (as lacunas do guia, na ordem do guia). */
export function guideGapOpponentIds(guide: Pick<GuideResult, 'opponents' | 'team'>): string[] {
  return guide.opponents
    .filter((opponent) =>
      guide.team.every((member) => !member.matchups.some((matchup) => matchup.opponentId === opponent.id && matchup.outcome === 'vence')),
    )
    .map((opponent) => opponent.id);
}

/** Sem time ou sem lacuna não há o que capturar: o pedido nem sai. */
export function buildCapturePlanRequest(
  snapshot: PlayerSnapshot,
  guide: Pick<GuideResult, 'goal' | 'opponents' | 'team'>,
  pikaStar: CapturePlanRequest['pikaStar'],
  jobId?: string,
): CapturePlanRequest | null {
  const gapOpponentIds = guideGapOpponentIds(guide);
  if (guide.team.length === 0 || gapOpponentIds.length === 0) return null;
  return {
    sources: snapshot.sources.map(({kind, sha256}) => ({kind, sha256})),
    goal: guide.goal,
    teamUuids: guide.team.map((member) => member.uuid),
    pikaStar,
    gapOpponentIds,
    ...(jobId === undefined ? {} : {jobId}),
  };
}

export function captureCatchableLabel(catchable: CaptureCandidate['catchable']): string {
  if (catchable === 'liberada') return 'Captura liberada';
  if (catchable === 'depende-do-nível') return 'Depende do nível';
  if (catchable === 'bloqueada') return 'Captura bloqueada';
  return 'Não verificado';
}

const BUCKET_LABEL: Record<CaptureSpawn['bucket'], string> = {
  common: 'comum',
  uncommon: 'incomum',
  rare: 'raro',
  'ultra-rare': 'ultrarraro',
};

export function captureBucketLabel(bucket: CaptureSpawn['bucket']): string {
  return BUCKET_LABEL[bucket];
}

export function captureLevelRangeLabel(spawn: Pick<CaptureSpawn, 'levelMin' | 'levelMax'>): string {
  return spawn.levelMin === spawn.levelMax ? `Nv. ${spawn.levelMin}` : `Nv. ${spawn.levelMin}–${spawn.levelMax}`;
}

export function captureOwnedWhereLabel(container: CaptureOwned['container']): string {
  return container === 'party' ? 'na equipe' : 'no PC';
}

export function captureFirstPartyLevelLabel(level: number | null): string {
  return level === null
    ? 'Party vazia: sem nível de referência para a regra de captura.'
    : `Primeiro Pokémon da party: nível ${level} (o app não vê quem está desmaiado).`;
}

export type CaptureStatusTone = 'ok' | 'warn' | 'muted';

/** Cor do estado de um requisito: verde cumprido, âmbar pendente, neutro quando o app não verificou. */
export function captureRequirementTone(status: CaptureRequirement['status']): CaptureStatusTone {
  return status === 'cumprido' ? 'ok' : status === 'pendente' ? 'warn' : 'muted';
}

const capitalize = (text: string) => (text === '' ? text : text[0].toUpperCase() + text.slice(1));

/** Requisito em português de jogador: sem o id da conquista ("Pika Star de Paldea") e só o teto de nível ("Nível: até Nv. 30"). */
export function captureRequirementLabel(requirement: Pick<CaptureRequirement, 'kind' | 'text'>): string {
  if (requirement.kind === 'pika-star') {
    const regions = /Pika Star de (.+?)(?: \(|$)/.exec(requirement.text)?.[1];
    return regions === undefined ? 'Pika Star' : `Pika Star de ${regions.split(' ou ').map(capitalize).join(' ou ')}`;
  }
  const limit = /até o nível (\d+)/.exec(requirement.text)?.[1];
  return limit === undefined ? capitalize(requirement.text) : `Nível: até Nv. ${limit}`;
}

/** Texto curto do estado de um requisito. */
export function captureRequirementStatusLabel(status: CaptureRequirement['status']): string {
  return status === 'cumprido' ? 'liberado' : status === 'pendente' ? 'pendente' : 'não verificado';
}

const BUCKET_ORDER: CaptureSpawn['bucket'][] = ['common', 'uncommon', 'rare', 'ultra-rare'];

export type CaptureSpawnSummary = {
  levelMin: number;
  levelMax: number;
  /** A raridade mais comum entre os spawns conhecidos (é a que mais vale para quem procura). */
  bucket: CaptureSpawn['bucket'];
  biomes: string[];
  /** Clima, horário e demais condições dos spawns, sem repetir. */
  conditions: string[];
};

/** Junta os spawns conhecidos de um candidato em uma linha de informações; `null` sem spawn. */
export function captureSpawnSummary(spawns: CaptureSpawn[]): CaptureSpawnSummary | null {
  if (spawns.length === 0) return null;
  const unique = (lists: string[][]) => [...new Set(lists.flat())];
  return {
    levelMin: Math.min(...spawns.map((spawn) => spawn.levelMin)),
    levelMax: Math.max(...spawns.map((spawn) => spawn.levelMax)),
    bucket: BUCKET_ORDER[Math.min(...spawns.map((spawn) => BUCKET_ORDER.indexOf(spawn.bucket)))],
    biomes: unique(spawns.map((spawn) => spawn.biomes)),
    conditions: unique(spawns.map((spawn) => spawn.conditions)),
  };
}

const CATCHABLE_ORDER: CaptureCandidate['catchable'][] = ['liberada', 'depende-do-nível', 'não verificado', 'bloqueada'];

/** Candidatos que dá para capturar agora primeiro; dentro do mesmo estado, a ordem do plano (melhor resposta antes) é mantida. */
export function orderCaptureCandidates(candidates: CaptureCandidate[]): CaptureCandidate[] {
  return candidates
    .map((candidate, index) => ({candidate, index}))
    .sort((a, b) => CATCHABLE_ORDER.indexOf(a.candidate.catchable) - CATCHABLE_ORDER.indexOf(b.candidate.catchable) || a.index - b.index)
    .map(({candidate}) => candidate);
}

export type CaptureGapStatus = 'owned' | 'catchable' | 'pending' | 'none';

/** Situação da lacuna: já tem resposta, dá para capturar, depende de algo ou nada cobre. */
export function captureGapStatus(gap: Pick<CaptureGap, 'owned' | 'candidates'>): CaptureGapStatus {
  if (gap.owned.length > 0) return 'owned';
  if (gap.candidates.some((candidate) => candidate.catchable === 'liberada')) return 'catchable';
  return gap.candidates.length > 0 ? 'pending' : 'none';
}
