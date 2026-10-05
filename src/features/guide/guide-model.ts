import type {
  GuideGoal,
  GuideNextGoal,
  GuideResult,
  GuideTeamMember,
  GuideTrainer,
  PlayerIndividual,
  PlayerSnapshot,
} from '../../platform/api';

export type GuideMode = 'pve' | 'trainer';
type GuideBuildCause = 'initial' | 'goal' | 'snapshot' | 'manual';

export const GUIDE_SNAPSHOT_NOTICE = 'Save mudou · time recalculado';

type GuideNextGoalState = {key: string; status: 'ready'; value: GuideNextGoal} | {key: string; status: 'failed'; error: string};

export type GuideState = {
  mode: GuideMode;
  trainerId: string | null;
  /** `true` depois que a pessoa mexe no objetivo: a sugestão deixa de sobrescrever a escolha. */
  goalChosen: boolean;
  nextGoal: GuideNextGoalState | null;
  trainers: {status: 'idle' | 'loading' | 'ready' | 'failed'; items: GuideTrainer[]; error: string | null};
  phase: 'idle' | 'building' | 'ready' | 'error' | 'canceled';
  result: GuideResult | null;
  /** Chave das fontes (hashes do save) com que `result` foi montado. */
  resultSources: string | null;
  requestId: number;
  buildCause: GuideBuildCause;
  error: string | null;
  notice: {id: number; text: string} | null;
  noticeSeq: number;
};

export type GuideAction =
  | {type: 'reset'}
  | {type: 'trainers-requested'}
  | {type: 'trainers-loaded'; items: GuideTrainer[]}
  | {type: 'trainers-failed'; error: string}
  | {type: 'next-goal-loaded'; key: string; next: GuideNextGoal}
  | {type: 'next-goal-failed'; key: string; error: string}
  | {type: 'mode-selected'; mode: GuideMode}
  | {type: 'trainer-selected'; trainerId: string}
  | {type: 'build-started'; requestId: number; cause: GuideBuildCause}
  | {type: 'build-succeeded'; requestId: number; result: GuideResult; sources: string}
  | {type: 'build-failed'; requestId: number; error: string}
  | {type: 'build-canceled'; requestId: number}
  | {type: 'notice-dismissed'; id: number};

export function createGuideState(): GuideState {
  return {
    mode: 'pve',
    trainerId: null,
    goalChosen: false,
    nextGoal: null,
    trainers: {status: 'idle', items: [], error: null},
    phase: 'idle',
    result: null,
    resultSources: null,
    requestId: 0,
    buildCause: 'initial',
    error: null,
    notice: null,
    noticeSeq: 0,
  };
}

export function currentGuideGoal(state: Pick<GuideState, 'mode' | 'trainerId'>): GuideGoal | null {
  if (state.mode === 'pve') return {kind: 'pve'};
  return state.trainerId === null ? null : {kind: 'trainer', trainerId: state.trainerId};
}

export function guideSourcesKey(snapshot: PlayerSnapshot): string {
  return snapshot.sources.map((source) => `${source.kind}:${source.sha256}`).join('|');
}

export function guideBuildKey(sourcesKey: string, goal: GuideGoal): string {
  return `${sourcesKey}#${goal.kind === 'pve' ? 'pve' : `trainer:${goal.trainerId}`}`;
}

/** Decide se a tela deve montar o time sozinha: só com captura, objetivo definido, sugestão resolvida e chave ainda não tentada. */
export function shouldAutoBuildGuide(input: {
  active: boolean;
  sourcesKey: string | null;
  goal: GuideGoal | null;
  nextGoalKey: string | null;
  attemptedKey: string | null;
}): boolean {
  if (!input.active || input.sourcesKey === null || input.goal === null) return false;
  if (input.nextGoalKey !== input.sourcesKey) return false;
  return input.attemptedKey !== guideBuildKey(input.sourcesKey, input.goal);
}

export function guideBuildCause(state: Pick<GuideState, 'result' | 'resultSources'>, sourcesKey: string): GuideBuildCause {
  if (state.result === null) return 'initial';
  return state.resultSources !== sourcesKey ? 'snapshot' : 'goal';
}

function withBuildFinished(state: GuideState, requestId: number): boolean {
  return state.phase === 'building' && state.requestId === requestId;
}

export function guideReducer(state: GuideState, action: GuideAction): GuideState {
  switch (action.type) {
    case 'reset':
      return {...createGuideState(), trainers: state.trainers, mode: state.mode, trainerId: state.trainerId, goalChosen: state.goalChosen};
    case 'trainers-requested':
      return {...state, trainers: {status: 'loading', items: [], error: null}};
    case 'trainers-loaded':
      return {...state, trainers: {status: 'ready', items: action.items, error: null}};
    case 'trainers-failed':
      return {...state, trainers: {status: 'failed', items: [], error: action.error}};
    case 'next-goal-loaded': {
      const next: GuideState = {...state, nextGoal: {key: action.key, status: 'ready', value: action.next}};
      if (state.goalChosen) return next;
      return action.next.trainerId === null
        ? {...next, mode: 'pve', trainerId: null}
        : {...next, mode: 'trainer', trainerId: action.next.trainerId};
    }
    case 'next-goal-failed':
      return {...state, nextGoal: {key: action.key, status: 'failed', error: action.error}};
    case 'mode-selected':
      return {...state, mode: action.mode, goalChosen: true};
    case 'trainer-selected':
      return {...state, mode: 'trainer', trainerId: action.trainerId, goalChosen: true};
    case 'build-started':
      return {...state, phase: 'building', requestId: action.requestId, buildCause: action.cause, error: null};
    case 'build-succeeded': {
      if (!withBuildFinished(state, action.requestId)) return state;
      const noticeSeq = state.buildCause === 'snapshot' ? state.noticeSeq + 1 : state.noticeSeq;
      return {
        ...state,
        phase: 'ready',
        result: action.result,
        resultSources: action.sources,
        noticeSeq,
        notice: state.buildCause === 'snapshot' ? {id: noticeSeq, text: GUIDE_SNAPSHOT_NOTICE} : state.notice,
      };
    }
    case 'build-failed':
      if (!withBuildFinished(state, action.requestId)) return state;
      return {...state, phase: 'error', error: action.error, result: null, resultSources: null};
    case 'build-canceled':
      if (!withBuildFinished(state, action.requestId)) return state;
      return {...state, phase: 'canceled', error: null, result: null, resultSources: null};
    case 'notice-dismissed':
      return state.notice?.id === action.id ? {...state, notice: null} : state;
  }
}

type GuideTrainerOption = {key: string; label: string; description: string; isDisabled: boolean};

const GUIDE_DOUBLES_NOTE = 'duplas: não suportado';

export function guideTrainerOptions(trainers: readonly GuideTrainer[]): GuideTrainerOption[] {
  return trainers.map((trainer) => ({
    key: trainer.id,
    label: trainer.name,
    description: trainer.format === 'doubles' ? GUIDE_DOUBLES_NOTE : `${trainer.teamSize} Pokémon · nível máx. ${trainer.maxLevel}`,
    isDisabled: trainer.format === 'doubles',
  }));
}

/** Para "Ver cálculo": golpe equipado vira o slot comparado; golpe aprendido vira o candidato. */
export function guideCalculationTarget(
  individual: PlayerIndividual,
  move: GuideTeamMember['moves'][number],
): {candidateMoveId?: string; slotIndex?: number} {
  if (move.source === 'aprendido') return {candidateMoveId: move.id};
  const slotIndex = individual.equippedMoves.findIndex((equipped) => equipped.id === move.id);
  return slotIndex === -1 ? {} : {slotIndex};
}

export type GuideComparisonRow = {key: 'added' | 'removed' | 'kept'; label: string; uuids: string[]};

export function guideComparisonRows(comparison: GuideResult['currentPartyComparison']): GuideComparisonRow[] {
  return [
    {key: 'added', label: 'Entra', uuids: comparison.added},
    {key: 'removed', label: 'Sai', uuids: comparison.removed},
    {key: 'kept', label: 'Fica', uuids: comparison.kept},
  ];
}

export function guideOpponentTurnsLabel(matchup: {outcome: 'vence' | 'perde'; ourTurns: number; theirTurns: number}): string {
  const plural = (count: number) => `${count} ${count === 1 ? 'turno' : 'turnos'}`;
  return matchup.outcome === 'vence'
    ? `vence em ${plural(matchup.ourTurns)} (o adversário precisaria de ${plural(matchup.theirTurns)})`
    : `perde: o adversário vence em ${plural(matchup.theirTurns)} (você precisaria de ${plural(matchup.ourTurns)})`;
}
