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

/** Membro do time de 6 do guia que vai à batalha: os golpes e o item que o guia recomendou para ele. */
export type BattlePlanMember = {uuid: string; moveIds: string[]; itemId: string | null};

export type BattlePlanRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  trainerId: string;
  team: BattlePlanMember[];
  /** Identificador opcional para cancelar a montagem com `cancel(jobId)`. */
  jobId?: string;
};

/** Dano dos 16 rolls de um golpe: mínimo e máximo em HP, e o HP máximo de quem recebe. */
export type BattlePlanDamage = {moveId: string; min: number; max: number; targetHP: number};

/**
 * Risco declarado na definição do treinador ou do Pokémon, com o texto pronto para a tela
 * (por exemplo "Geodude aguenta um golpe com Sturdy e pode agir antes com Custap Berry").
 */
export type BattlePlanRisk = {kind: 'habilidade' | 'item' | 'bolsa' | 'campo' | 'ia'; text: string};

export type BattlePlanEntry = {
  opponentId: string;
  speciesId: string;
  level: number;
  ability: string;
  /** Alternativas do `heldItem` do adversário. Várias alternativas ficam todas listadas; o plano nunca escolhe uma. */
  heldItemAlternatives: string[];
  /** `bloqueado`: alguma mecânica deste confronto está fora do catálogo ou do adaptador; `blockedReason` diz qual. */
  status: 'planejado' | 'bloqueado';
  blockedReason: string | null;
  /** Quem responde a este adversário, e com qual golpe. Nulo quando o confronto está bloqueado. */
  responder: {uuid: string; speciesId: string; moveId: string} | null;
  /** O que o respondedor causa ao adversário e o que recebe do melhor golpe dele. Nulos quando bloqueado. */
  dealt: BattlePlanDamage | null;
  received: BattlePlanDamage | null;
  /** `incerto`: prioridade ou item de prioridade (como Custap Berry) pode inverter a ordem; o texto explica em `actReason`. */
  firstToAct: 'jogador' | 'adversário' | 'incerto' | null;
  actReason: string | null;
  risks: BattlePlanRisk[];
};

export type BattlePlanResult = {
  trainer: {id: string; name: string; maxItemUses: number | null; bag: Array<{itemId: string; quantity: number}>};
  /** `fora-do-escopo`: treinador em dupla; sem entradas nem lead, só o motivo em `scopeReason`. */
  status: 'plano' | 'fora-do-escopo';
  scopeReason: string | null;
  lead: {uuid: string; speciesId: string; reason: string} | null;
  entries: BattlePlanEntry[];
  /** Riscos do treinador como um todo: bolsa × `maxItemUses`, IA não modelada. */
  trainerRisks: BattlePlanRisk[];
  assumptions: string[];
  limits: string[];
};

/** Membro do time de 6 do guia: os golpes que o guia considera úteis para o objetivo (equipados e a adquirir). */
export type EvolutionPlanMember = {uuid: string; usefulMoveIds: string[]};

export type EvolutionPlanRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  team: EvolutionPlanMember[];
  /** Nível máximo permitido agora (level cap). Nulo: o app não sabe o cap e o alcance fica "não verificado". */
  levelCap: number | null;
  /** Identificador opcional para cancelar com `cancel(jobId)`. */
  jobId?: string;
};

/**
 * Um requisito da evolução em texto legível. `cumprido` e `pendente` só saem de dado capturado (nível, natureza,
 * golpes conhecidos); amizade, item, horário, bioma, troca e o restante são sempre `não verificado`, nunca cumpridos.
 */
export type EvolutionRequirement = {
  kind: 'nível' | 'amizade' | 'item' | 'troca' | 'horário' | 'bioma' | 'golpe' | 'natureza' | 'outro';
  text: string;
  status: 'cumprido' | 'pendente' | 'não verificado';
};

/** Golpe que muda de nível ou some ao evoluir. `note` vem pronto, por exemplo "aprende Surf no nível 30 sem evoluir; evoluído, só no 36". */
export type EvolutionMoveChange = {
  moveId: string;
  /** O guia considera o golpe útil para o objetivo. */
  useful: boolean;
  kind: 'atrasado' | 'perdido' | 'adiantado';
  /** Nível em que a forma atual aprende o golpe sem evoluir; nulo se não aprende por nível. */
  levelWithoutEvolving: number | null;
  /** Nível em que a evolução aprende o golpe; nulo se não aprende por nível. */
  levelAfterEvolving: number | null;
  note: string;
};

export type EvolutionOption = {
  toSpeciesId: string;
  method: 'level_up' | 'item_interact' | 'trade';
  requirements: EvolutionRequirement[];
  /** `true`: o nível exigido cabe no cap; `false`: passa do cap; `null`: sem exigência de nível ou cap desconhecido. */
  withinCap: boolean | null;
  reachText: string;
  moveChanges: EvolutionMoveChange[];
};

export type EvolutionPlanMemberResult = {
  uuid: string;
  speciesId: string;
  formId: string;
  level: number;
  /** `bloqueado`: forma desconhecida ou sem dados de evolução da forma; `blockedReason` diz o motivo. Várias opções para a mesma espécie são alternativas ("ou"). */
  status: 'evolui' | 'sem-evolução' | 'bloqueado';
  blockedReason: string | null;
  options: EvolutionOption[];
};

export type EvolutionPlanResult = {
  levelCap: number | null;
  members: EvolutionPlanMemberResult[];
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
  /** Plano de batalha contra um treinador RCT singles para o time de 6 do guia. Cancelável por `cancel(request.jobId)`. */
  buildBattlePlan(request: BattlePlanRequest): Promise<BattlePlanResult>;
  /** Evoluções possíveis de cada membro do time, com requisitos, alcance no cap e golpes ganhos ou perdidos. Cancelável por `cancel(request.jobId)`. */
  buildEvolutionPlan(request: EvolutionPlanRequest): Promise<EvolutionPlanResult>;
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
