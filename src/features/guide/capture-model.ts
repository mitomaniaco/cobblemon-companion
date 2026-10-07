import type {CaptureCandidate, CaptureOwned, CapturePlanRequest, CaptureSpawn, GuideResult, PlayerSnapshot} from '../../platform/api';

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
