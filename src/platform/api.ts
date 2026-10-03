import type {ComparisonRequest, FlowResponse} from '../domain/compare-flow';

export type PlayerLocation = {container: 'party'; slot: number} | {container: 'pc'; box: number; boxName: string | null; slot: number};

export type PlayerStat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export type PlayerStatProvenance = {
  sourceKind: 'party' | 'pc';
  nbtPath: string;
};

export type PlayerStatFact<T> = ({state: 'known'; value: T} | {state: 'unknown'; reason: 'not-captured'}) & {
  provenance: PlayerStatProvenance;
};

export type PlayerIndividual = {
  uuid: string;
  speciesId: string;
  formId: string;
  level: number | null;
  location: PlayerLocation;
  equippedMoves: Array<{id: string; pp: number | null; ppUps: number | null}>;
  equippedMovesKnown: boolean;
  learnedMoves: Array<{id: string; ppUps: number | null}>;
  learnedMovesKnown: boolean;
  observed: {nature: string | null; ability: string | null; heldItem: string | null};
  battleStats: {
    ivs: Record<PlayerStat, PlayerStatFact<number>>;
    hyperTrainedIvs: Record<PlayerStat, PlayerStatFact<number | null>>;
    evs: Record<PlayerStat, PlayerStatFact<number>>;
  };
};

export type PlayerSnapshot = {
  schemaVersion: 2;
  capturedAt: string;
  worldName: string;
  consistency: 'best-effort';
  sources: Array<{kind: 'party' | 'pc'; sha256: string; modifiedAt: string}>;
  individuals: PlayerIndividual[];
  warnings?: string[];
};
export type RealDamageRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  individualUuid: string;
  candidateMoveId: string;
  target: {
    speciesId: string;
    formId: 'normal';
    level: number;
    nature: string;
    ability: string;
    ivs: Record<PlayerStat, number>;
    evs: Record<PlayerStat, number>;
  };
  assumptions: {
    rulesetMatchesActiveWorld: true;
    actorBaselineConfirmed: true;
    actorFullHpConfirmed: true;
    targetBaselineConfirmed: true;
    fieldBaselineConfirmed: true;
  };
};

export type RealDamageResult = {
  ruleset: {
    id: string;
    cobblemonVersion: string;
    showdownVersion: string;
    calcVersion: string;
    adapterVersion: string;
    sourceSha256: Record<string, string>;
  };
  snapshot: {
    capturedAt: string;
    worldName: string;
    sources: PlayerSnapshot['sources'];
  };
  individualUuid: string;
  actor: {speciesId: string; level: number};
  target: {speciesId: string; formId: 'normal'; level: number};
  scope: {
    generation: 9;
    format: 'singles';
    actions: 1;
    damageOnSuccessfulHitOnly: true;
    rolls: 16;
    rollSummary: 'minimum-and-maximum';
    assumptions: RealDamageRequest['assumptions'];
  };
  current: {moveId: string; min: number; max: number; targetHP: number; rollCount: number};
  candidate: {moveId: string; min: number; max: number; targetHP: number; rollCount: number};
  inputDigest: string;
};

export type RealDamageResponse = {status: 'calculated'; result: RealDamageResult};

export type CompanionApi = {
  calculate(request: ComparisonRequest): Promise<FlowResponse>;
  calculateRealDamage(request: RealDamageRequest): Promise<RealDamageResponse>;
  cancel(jobId: string): Promise<{status: string; jobId: string}>;
  readPlayerSnapshot(): Promise<PlayerSnapshot>;
};

declare global {
  interface Window {
    cobblemonCompanion: CompanionApi;
  }
}

export function getCompanionApi(): CompanionApi {
  if (!window.cobblemonCompanion) {
    throw new Error('A ponte local do Companion não está disponível. Abra pelo Electron.');
  }
  return window.cobblemonCompanion;
}
