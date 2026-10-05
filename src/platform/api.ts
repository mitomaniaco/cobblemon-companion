import type {ComparisonRequest, FlowResponse} from '../domain/compare-flow';

export type PlayerLocation = {container: 'party'; slot: number} | {container: 'pc'; box: number; boxName: string | null; slot: number};

export type PlayerStat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

type PlayerStatProvenance = {
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
  currentSlotIndex: number;
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
  actor: {speciesId: string; level: number; heldItem: string | null; currentSlotIndex: number};
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

/** Objetivo do guia: PvE geral ou um treinador RCT (id de `data/guide/trainers.json`). */
export type GuideGoal = {kind: 'pve'} | {kind: 'trainer'; trainerId: string};

export type GuideRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  goal: GuideGoal;
  /** Identificador opcional para cancelar a construção com `cancel(jobId)`. */
  jobId?: string;
};

export type GuideTrainer = {
  id: string;
  name: string;
  format: 'singles' | 'doubles';
  teamSize: number;
  maxLevel: number;
  /** Série do RCT (por exemplo `radicalred`), ou null quando o treinador não pertence a uma. */
  series: string | null;
};

export type GuideMatchup = {opponentId: string; outcome: 'vence' | 'perde'; ourTurns: number; theirTurns: number};

export type GuideTeamMember = {
  uuid: string;
  speciesId: string;
  level: number;
  reason: string;
  /** `evaluated: false`: golpe equipado fora do catálogo, mantido sem entrar no cálculo. */
  moves: Array<{id: string; evaluated: boolean; source: 'equipado' | 'aprendido'}>;
  /** `tem`: já é o item segurado; `obter`: sugestão que o app não sabe se o jogador possui; `nenhum`: sem item. */
  item: {id: string | null; status: 'tem' | 'obter' | 'nenhum'; reason: string};
  matchups: GuideMatchup[];
  acquire: Array<{moveId: string; requirement: string; gainPercent: number; reason: string}>;
};

export type GuideResult = {
  goal: GuideGoal;
  referenceLevel: number;
  opponents: Array<{id: string; speciesId: string; level: number; trainerId: string | null}>;
  team: GuideTeamMember[];
  currentPartyComparison: {kept: string[]; added: string[]; removed: string[]};
  excluded: Array<{uuid: string; reason: string}>;
  assumptions: string[];
  limits: string[];
};

/** Próximo objetivo sugerido. `nível`: pelo maior nível da party, sem ler o progresso de treinadores do save. */
export type GuideNextGoal = {trainerId: string | null; basis: 'progresso' | 'nível'; reason: string};

type RealDamageResponse = {status: 'calculated'; result: RealDamageResult};

export type CompanionApi = {
  calculate(request: ComparisonRequest): Promise<FlowResponse>;
  calculateRealDamage(request: RealDamageRequest): Promise<RealDamageResponse>;
  cancel(jobId: string): Promise<{status: string; jobId: string}>;
  readPlayerSnapshot(): Promise<PlayerSnapshot>;
  /** Recebe o snapshot novo quando os arquivos do save mudam; devolve a função que cancela a inscrição. */
  onSnapshotChanged(callback: (snapshot: PlayerSnapshot) => void): () => void;
  setAutoRefresh(enabled: boolean): Promise<{enabled: boolean}>;
  /** Monta o time de 6 para o objetivo. Cancelável por `cancel(request.jobId)`. */
  buildGuide(request: GuideRequest): Promise<GuideResult>;
  /** Treinadores disponíveis como objetivo (radicalred primeiro, na ordem da campanha). */
  listGuideTrainers(): Promise<GuideTrainer[]>;
  guideNextGoal(): Promise<GuideNextGoal>;
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
