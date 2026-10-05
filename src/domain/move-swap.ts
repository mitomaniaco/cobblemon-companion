import type {PlayerIndividual} from '../platform/api';

export type MoveSwapPlan = {
  individualUuid: string | null;
  slotIndex: number | null;
  candidateMoveId: string | null;
};

type MoveSwapCandidate = {
  id: string;
  evidence: 'observed-learned-on-individual';
};

type MoveSwapPreview = {
  slotIndex: number;
  beforeMoveId: string;
  afterMoveId: string;
  evidence: MoveSwapCandidate['evidence'];
};

export type MoveSwapView =
  | {status: 'inconclusive'; reason: 'equipped-unknown' | 'learned-unknown' | 'both-unknown'}
  | {status: 'empty'; reason: 'no-equipped' | 'no-candidates'}
  | {
      status: 'ready';
      equippedMoves: PlayerIndividual['equippedMoves'];
      candidates: MoveSwapCandidate[];
      preview: MoveSwapPreview | null;
    };

export function createMoveSwapPlan(individualUuid: string | null = null): MoveSwapPlan {
  return {individualUuid, slotIndex: null, candidateMoveId: null};
}

export function invalidateMoveSwapPlan(): MoveSwapPlan {
  return createMoveSwapPlan();
}

export function selectMoveSwapIndividual(plan: MoveSwapPlan, individualUuid: string): MoveSwapPlan {
  return plan.individualUuid === individualUuid ? plan : createMoveSwapPlan(individualUuid);
}

function moveKey(id: string) {
  return id.trim().toLowerCase();
}

export function getMoveSwapView(individual: PlayerIndividual, plan: MoveSwapPlan): MoveSwapView {
  if (!individual.equippedMovesKnown && !individual.learnedMovesKnown) {
    return {status: 'inconclusive', reason: 'both-unknown'};
  }
  if (!individual.equippedMovesKnown) {
    return {status: 'inconclusive', reason: 'equipped-unknown'};
  }
  if (!individual.learnedMovesKnown) {
    return {status: 'inconclusive', reason: 'learned-unknown'};
  }
  if (individual.equippedMoves.length === 0) {
    return {status: 'empty', reason: 'no-equipped'};
  }

  const equippedKeys = new Set(individual.equippedMoves.map((move) => moveKey(move.id)));
  const seenCandidates = new Set<string>();
  const candidates = individual.learnedMoves.flatMap((move) => {
    const key = moveKey(move.id);
    if (!key || equippedKeys.has(key) || seenCandidates.has(key)) return [];
    seenCandidates.add(key);
    return [{id: move.id, evidence: 'observed-learned-on-individual' as const}];
  });

  if (candidates.length === 0) return {status: 'empty', reason: 'no-candidates'};

  const selectedMove =
    plan.individualUuid === individual.uuid &&
    plan.slotIndex !== null &&
    plan.slotIndex >= 0 &&
    plan.slotIndex < individual.equippedMoves.length
      ? individual.equippedMoves[plan.slotIndex]
      : null;
  const candidate = plan.individualUuid === individual.uuid ? candidates.find((move) => move.id === plan.candidateMoveId) : undefined;

  return {
    status: 'ready',
    equippedMoves: individual.equippedMoves,
    candidates,
    preview:
      selectedMove && candidate
        ? {
            slotIndex: plan.slotIndex as number,
            beforeMoveId: selectedMove.id,
            afterMoveId: candidate.id,
            evidence: candidate.evidence,
          }
        : null,
  };
}
