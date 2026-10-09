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

/** Ferramentas do guia, cada uma em sua aba; a aba ativa fica no app para sobreviver à ida ao Dano e à volta. */
export type GuideTab = 'team' | 'battle' | 'evolutions' | 'training' | 'captures';
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
  /** O `result` anterior à última montagem bem-sucedida; base do aviso "o time mudou". */
  previousResult: GuideResult | null;
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
  | {type: 'next-goal-requested'}
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
    previousResult: null,
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

/** O level cap só vale para objetivo de treinador/líder (PvE geral não o aplica): por isso só entra na chave dele. */
export function guideBuildKey(sourcesKey: string, goal: GuideGoal, levelCap: number | null, respectLevelCap: boolean): string {
  if (goal.kind === 'pve') return `${sourcesKey}#pve`;
  return `${sourcesKey}#trainer:${goal.trainerId}:cap:${levelCap ?? 'none'}:${respectLevelCap ? 'respeita' : 'ignora'}`;
}

/** Cap enviado ao motor: só para objetivo de treinador; PvE geral nunca leva cap. */
export function guideRequestLevelCap(goal: GuideGoal, levelCap: number | null): number | null {
  return goal.kind === 'trainer' ? levelCap : null;
}

/** Decide se a tela deve montar o time sozinha: só com captura, objetivo definido, sugestão resolvida e chave ainda não tentada. */
export function shouldAutoBuildGuide(input: {
  active: boolean;
  sourcesKey: string | null;
  goal: GuideGoal | null;
  levelCap: number | null;
  respectLevelCap: boolean;
  nextGoalKey: string | null;
  attemptedKey: string | null;
}): boolean {
  if (!input.active || input.sourcesKey === null || input.goal === null) return false;
  if (input.nextGoalKey !== input.sourcesKey) return false;
  return input.attemptedKey !== guideBuildKey(input.sourcesKey, input.goal, input.levelCap, input.respectLevelCap);
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
    case 'next-goal-requested':
      return {...state, nextGoal: null};
    case 'next-goal-loaded': {
      const next: GuideState = {...state, nextGoal: {key: action.key, status: 'ready', value: action.next}};
      if (state.goalChosen) return next;
      const trainerId = action.next.stage?.ambiguous ? null : action.next.trainerId;
      return trainerId === null ? {...next, mode: 'pve', trainerId: null} : {...next, mode: 'trainer', trainerId};
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
        previousResult: state.result,
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

/** Excluídos por causa do level cap (motivo "acima do level cap (N)"), para mostrar à parte dos demais excluídos. */
export function guideCapExcluded(excluded: GuideResult['excluded']): GuideResult['excluded'] {
  return excluded.filter((entry) => /level cap/i.test(entry.reason));
}

/** Aviso fixo quando o objetivo é de líder e o cap ainda não foi informado. */
export const LEVEL_CAP_REQUIRED_TEXT =
  'Informe o level cap para montar o time: sem ele o time pode conter Pokémon proibidos nessa batalha.';

export type GuideCapWarning = {uuid: string; level: number; text: string};

/**
 * Quem passa do cap e atrapalha a luta de líder. O jogo bloqueia a luta por qualquer Pokémon da party acima do cap
 * (mesmo fora do time); quem está no PC só conta se o time ideal o trouxer. Só vale para objetivo de treinador com cap conhecido.
 */
export function guideCapWarnings(input: {
  goal: GuideGoal;
  team: ReadonlyArray<{uuid: string}>;
  individuals: readonly PlayerIndividual[];
  levelCap: number | null;
}): GuideCapWarning[] {
  const {goal, team, individuals, levelCap} = input;
  if (goal.kind !== 'trainer' || levelCap === null) return [];
  const inTeam = new Set(team.map((member) => member.uuid));
  const warnings: GuideCapWarning[] = [];
  for (const individual of individuals) {
    if (individual.level === null || individual.level <= levelCap) continue;
    const party = individual.location.container === 'party';
    const member = inTeam.has(individual.uuid);
    if (!party && !member) continue;
    const text = !party
      ? `Nv. ${individual.level}, no PC: baixe o nível para ${levelCap} antes de levá-lo à luta.`
      : member
        ? `Nv. ${individual.level}: baixe o nível para ${levelCap} antes da luta ou guarde no PC.`
        : `Nv. ${individual.level}, na party fora do time: bloqueia a luta mesmo sem lutar; guarde no PC.`;
    warnings.push({uuid: individual.uuid, level: individual.level, text});
  }
  return warnings;
}

function sameGoal(left: GuideGoal, right: GuideGoal): boolean {
  return left.kind === right.kind && (left.kind === 'pve' || (right.kind === 'trainer' && left.trainerId === right.trainerId));
}

/** UUIDs do time da montagem anterior, só se ela foi para o mesmo objetivo; senão não há preferência. */
export function guidePreviousTeamUuids(previous: Pick<GuideResult, 'goal' | 'team'> | null, goal: GuideGoal): string[] {
  return previous && sameGoal(previous.goal, goal) ? previous.team.map((member) => member.uuid) : [];
}

const REPLACED_REASON = 'outra escolha cobre mais adversários ou com mais margem neste cálculo';

/**
 * O que mudou no time entre duas montagens do mesmo objetivo. Quem saiu traz o motivo: a exclusão registrada pelo motor
 * (por exemplo, "acima do level cap (N)") ou a explicação genérica de que outra escolha cobre mais. `null` sem montagem anterior
 * ou com objetivo diferente.
 */
export function guideTeamChanges(
  previous: GuideResult | null,
  next: GuideResult,
): {left: Array<{uuid: string; reason: string}>; entered: string[]} | null {
  if (!previous || !sameGoal(previous.goal, next.goal)) return null;
  const nextUuids = new Set(next.team.map((member) => member.uuid));
  const previousUuids = new Set(previous.team.map((member) => member.uuid));
  const excludedReason = new Map(next.excluded.map((entry) => [entry.uuid, entry.reason]));
  return {
    left: previous.team
      .filter((member) => !nextUuids.has(member.uuid))
      .map((member) => ({uuid: member.uuid, reason: excludedReason.get(member.uuid) ?? REPLACED_REASON})),
    entered: next.team.filter((member) => !previousUuids.has(member.uuid)).map((member) => member.uuid),
  };
}
