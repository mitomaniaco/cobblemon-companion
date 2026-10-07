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
  /** Shiny do indivíduo no save; ausente ou `null` = desconhecido (nunca presumido como não-shiny). */
  shiny?: boolean | null;
  /** Aspectos de forma em `Features`; `null` = desconhecido, lista vazia = forma base. */
  aspects?: string[] | null;
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
  /**
   * Level cap do jogador. `null` = cap desconhecido (o motor avisa em `assumptions`). PvE geral nunca aplica o cap.
   * Fato (rctmod, `TrainerMob#canBattleAgainst`): o treinador só luta se nenhum Pokémon da party passar do cap.
   */
  levelCap: number | null;
  /**
   * Toggle "respeitar o level cap" (padrão `true` quando ausente). Ligado: em objetivo de treinador com cap conhecido, quem passa
   * do cap sai do time e vai para `excluded` ("acima do level cap (N)"). Desligado: todos entram na conta, o time é o ideal
   * independente do nível, e `GuideResult.overCap` lista quem está acima do cap para baixar o nível ou guardar no PC (campo ausente = ninguém).
   */
  respectLevelCap?: boolean;
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

/** Membro do time acima do level cap quando o jogador desligou "respeitar o level cap": o app só avisa, não exclui. */
export type OverCapMember = {uuid: string; speciesId: string; level: number; levelCap: number; text: string};

export type GuideResult = {
  goal: GuideGoal;
  referenceLevel: number;
  opponents: Array<{id: string; speciesId: string; level: number; trainerId: string | null}>;
  team: GuideTeamMember[];
  currentPartyComparison: {kept: string[]; added: string[]; removed: string[]};
  excluded: Array<{uuid: string; reason: string}>;
  /** Só com `respectLevelCap: false` e cap conhecido em objetivo de treinador: quem do time passa do cap (não excluído). Vazio caso contrário. */
  overCap?: OverCapMember[];
  assumptions: string[];
  limits: string[];
};

/** Membro do time de 6 do guia que vai à batalha: os golpes e o item que o guia recomendou para ele. */
export type BattlePlanMember = {uuid: string; moveIds: string[]; itemId: string | null};

export type BattlePlanRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  trainerId: string;
  team: BattlePlanMember[];
  /** Level cap do jogador; nulo = desconhecido (aviso em `assumptions`). */
  levelCap?: number | null;
  /** Mesmo toggle do guia (padrão `true`): ligado, membro acima do cap não entra no plano; desligado, entra e `BattlePlanResult.overCap` o lista. */
  respectLevelCap?: boolean;
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
  /** Só com `respectLevelCap: false` e cap conhecido: membros do plano acima do cap (baixar o nível ou guardar no PC antes da luta). Ausente = nenhum. */
  overCap?: OverCapMember[];
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

export type CapturePlanRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  /** Mesmo objetivo do guia: define os adversários cujas lacunas serão cobertas. */
  goal: GuideGoal;
  /** Uuids do time de 6 do guia; indivíduos fora dele podem aparecer como cobertura já possuída. */
  teamUuids: string[];
  /** `GuideResult.opponents[].id` dos adversários que nenhum membro do time vence. */
  gapOpponentIds: string[];
  /** Identificador opcional para cancelar com `cancel(jobId)`. */
  jobId?: string;
};

/** Onde, quando e em que nível a espécie nasce, em texto legível (biomas resolvidos, sem tags cruas). */
export type CaptureSpawn = {
  biomes: string[];
  /** Horário, clima, luz, estrutura, altura e demais condições, já em texto. */
  conditions: string[];
  levelMin: number;
  levelMax: number;
  bucket: 'common' | 'uncommon' | 'rare' | 'ultra-rare';
  position: string;
};

export type CaptureRequirement = {
  kind: 'nível' | 'pika-star';
  text: string;
  /** Só o nível da party é conhecido; o advancement Pika Star fica no save e não é lido: sempre `não verificado`. */
  status: 'cumprido' | 'pendente' | 'não verificado';
};

export type CaptureCandidate = {
  speciesId: string;
  /** Por que ajuda contra o adversário da lacuna (tipo, dano, Speed), em texto. */
  reason: string;
  /** Só spawns naturais conhecidos; espécie sem spawn conhecido nunca vira candidata nem ganha local inventado. */
  spawns: CaptureSpawn[];
  /** Regra do modpack pelo nível do primeiro Pokémon da party: `depende-do-nível` quando só parte da faixa de nível está liberada. */
  catchable: 'liberada' | 'depende-do-nível' | 'bloqueada' | 'não verificado';
  catchableReason: string;
  requirements: CaptureRequirement[];
};

/** Indivíduo que o jogador já tem (party ou PC, fora do time) e que cobre a lacuna: aparece antes de qualquer captura. */
export type CaptureOwned = {uuid: string; speciesId: string; level: number; container: 'party' | 'pc'; reason: string};

export type CaptureGap = {
  opponentId: string;
  speciesId: string;
  level: number;
  owned: CaptureOwned[];
  candidates: CaptureCandidate[];
  /** Explica quando não há candidato (por exemplo, nenhuma espécie com spawn natural cobre a lacuna). */
  note: string | null;
};

export type CapturePlanResult = {
  /** Nível do primeiro Pokémon da party; nulo se a party está vazia. O app não vê quem está desmaiado. */
  firstPartyLevel: number | null;
  gaps: CaptureGap[];
  assumptions: string[];
  limits: string[];
};

/** Origem do level cap usado no treino: `desconhecida` quando o app não sabe o cap (nada é inferido do arquivo de configuração). */
export type TrainingCapOrigin = 'informado' | 'desconhecida';

export type TrainingPlanMember = {uuid: string; usefulMoveIds: string[]};

export type TrainingPlanRequest = {
  sources: Array<{kind: 'party' | 'pc'; sha256: string}>;
  team: TrainingPlanMember[];
  /** Level cap aplicável ao próximo objetivo; nulo quando não determinado. */
  levelCap: number | null;
  capOrigin: TrainingCapOrigin;
  /** Identificador opcional para cancelar com `cancel(jobId)`. */
  jobId?: string;
};

/** Golpe aprendido por nível entre o nível atual (exclusive) e o alvo (inclusive). */
export type TrainingMove = {moveId: string; level: number; useful: boolean};

export type TrainingStatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

/** Espécie que rende o EV da sugestão, com onde aparece (mesma forma de `CaptureSpawn`, só spawns naturais conhecidos). */
export type TrainingEvSource = {speciesId: string; stat: TrainingStatKey; amount: number; spawns: CaptureSpawn[]};

export type TrainingEvPlan = {
  /** Papel do membro no time: define quais atributos recebem EV. */
  role: 'atacante-físico' | 'atacante-especial' | 'velocidade' | 'resistência';
  /**
   * `sugerido`: distribuição fechada; `não-determinado`: algum EV atual é desconhecido, e desconhecido nunca vira zero,
   * então não há distribuição fechada (`reason` explica). Respeita 252 por atributo e 510 no total.
   */
  status: 'sugerido' | 'não-determinado';
  reason: string;
  /** EVs atuais do snapshot; `null` é desconhecido. */
  currentEvs: Record<TrainingStatKey, number | null>;
  /** EVs sugeridos em cada atributo; vazio quando `não-determinado`. */
  suggestedEvs: Partial<Record<TrainingStatKey, number>>;
  /** De 1 a 3 espécies que rendem os EVs sugeridos; vazio quando não há rendimento conhecido ou não-determinado. */
  sources: TrainingEvSource[];
};

export type TrainingPlanMemberResult = {
  uuid: string;
  speciesId: string;
  level: number;
  /** Nulo quando o cap não é determinado. */
  levelCap: number | null;
  capOrigin: TrainingCapOrigin;
  /** Nível-alvo: nunca acima do cap; nulo quando o cap não é determinado (`targetNote` mostra "cap não determinado"). */
  targetLevel: number | null;
  targetNote: string;
  /** Golpes por nível no caminho até o alvo; vazio quando não há alvo. */
  moves: TrainingMove[];
  evs: TrainingEvPlan;
};

export type TrainingPlanResult = {
  members: TrainingPlanMemberResult[];
  assumptions: string[];
  limits: string[];
};

export type GuideProgressRegion = 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'hisui' | 'paldea';

export type GuideProgressSourceKind = 'rct-stats' | 'pika-advancements';

/**
 * Progresso do jogador na campanha, lido do diretório do mundo (somente leitura, D15). Cada campo desconhecido é
 * `null` (arquivo ausente, ilegível ou fora do formato esperado): desconhecido nunca é zero nem falso.
 */
export type GuideProgress = {
  /** IDs com ao menos uma vitória em `progressDefeats`; uma contagem zero permanece somente em `victoryCounts`. */
  defeated: string[] | null;
  /** Contagens lidas de `progressDefeats`, sem leitura de shards de memória de batalha. */
  victoryCounts: Record<string, number> | null;
  /** Série selecionada/atual pelo jogador. */
  currentSeries: string | null;
  /** Se a série atual foi concluída; null quando o campo está ausente ou inválido. */
  currentSeriesCompleted: boolean | null;
  /** Séries concluídas. */
  completedSeries: string[] | null;
  /** Level cap atual, derivado das regras RCT e dos dados da campanha; não é gravado no save. */
  levelCap: number | null;
  /** Advancement `allthemons:<região>_pika_star` por região; ausência em JSON válido é false, fonte desconhecida é null. */
  pikaStar: Record<GuideProgressRegion, boolean | null>;
  /** Arquivos lidos e o SHA-256 de cada um (o conteúdo não sai do processo principal). */
  sources: Array<{kind: GuideProgressSourceKind; sha256: string}>;
};

/** Variante RCT de uma etapa da campanha. `ambiguous`: nenhuma variante é escolhida em silêncio. */
export type GuideStageVariant = {
  trainerId: string;
  format: string;
  maxLevel: number;
  teamSize: number;
  optional: boolean;
  ambiguous: boolean;
  rule: string | null;
};

/** Dados integrais da etapa de campaign.json necessários para explicar requisitos e a progressão do cap. */
export type GuideStage = {
  stageId: string;
  name: string;
  type: string;
  order: number;
  requires: string[];
  capBefore: number | null;
  capAfter: number | null;
  capUnknownReason: string | null;
  ambiguous: boolean;
  ambiguousReason: string | null;
  variants: GuideStageVariant[];
};

/** Próximo objetivo sugerido. `progresso` usa campanha + progressDefeats; `nível` é o fallback pela party. */
export type GuideNextGoal = {
  trainerId: string | null;
  basis: 'progresso' | 'nível';
  reason: string;
  /** Só com `basis: 'progresso'`: a etapa da campanha e suas variantes RCT (todas, marcadas `ambiguous` quando não se sabe qual vale). */
  stage?: GuideStage;
  /** Só com `basis: 'progresso'`: as próximas etapas depois da atual. */
  upcoming?: GuideStage[];
};

export type SaveAccount = {
  /** Token aleatório efêmero mantido no processo principal; não contém UUID e expira ao atualizar a lista ou em 5 min. */
  id: string;
  name: string;
  /** false quando não há arquivo party nem PC local para selecionar. */
  selectable: boolean;
  partyLastWriteAt: string | null;
  pcLastWriteAt: string | null;
  isSelected: boolean;
};

export type SaveAccountList = {
  accounts: SaveAccount[];
  selectedAccountId: string;
  /** Conta cujo arquivo party tem o mtime mais recente; null se nenhuma party estiver disponível. */
  mostRecentlyWrittenAccountId: string | null;
};

type RealDamageResponse = {status: 'calculated'; result: RealDamageResult};

export type CompanionApi = {
  calculate(request: ComparisonRequest): Promise<FlowResponse>;
  calculateRealDamage(request: RealDamageRequest): Promise<RealDamageResponse>;
  cancel(jobId: string): Promise<{status: string; jobId: string}>;
  /** Lista a conta selecionada e entradas do usercache com o mesmo nome; duplicadas sem saves aparecem selectable=false. */
  listSaveAccounts(): Promise<SaveAccountList>;
  /** Persiste a escolha explícita; depois chame readPlayerSnapshot() para atualizar o snapshot. */
  selectSaveAccount(id: string): Promise<void>;
  readPlayerSnapshot(): Promise<PlayerSnapshot>;
  /** Recebe o snapshot novo quando os arquivos do save mudam; devolve a função que cancela a inscrição. */
  onSnapshotChanged(callback: (snapshot: PlayerSnapshot) => void): () => void;
  setAutoRefresh(enabled: boolean): Promise<{enabled: boolean}>;
  /** Monta o time de 6 para o objetivo. Cancelável por `cancel(request.jobId)`. */
  buildGuide(request: GuideRequest): Promise<GuideResult>;
  /** Treinadores disponíveis como objetivo (radicalred primeiro, na ordem da campanha). */
  listGuideTrainers(): Promise<GuideTrainer[]>;
  guideNextGoal(): Promise<GuideNextGoal>;
  /** Lê o progresso do mundo (somente leitura). Campos que não puderem ser lidos vêm `null`. */
  readGuideProgress(): Promise<GuideProgress>;
  /** Avisa quando os arquivos de progresso mudam; devolve a função que cancela a inscrição. */
  onProgressChanged(callback: (progress: GuideProgress) => void): () => void;
  /** Plano de batalha contra um treinador RCT singles para o time de 6 do guia. Cancelável por `cancel(request.jobId)`. */
  buildBattlePlan(request: BattlePlanRequest): Promise<BattlePlanResult>;
  /** Evoluções possíveis de cada membro do time, com requisitos, alcance no cap e golpes ganhos ou perdidos. Cancelável por `cancel(request.jobId)`. */
  buildEvolutionPlan(request: EvolutionPlanRequest): Promise<EvolutionPlanResult>;
  /** Capturas recomendadas para as lacunas do time: antes, o que já existe no PC. Cancelável por `cancel(request.jobId)`. */
  buildCapturePlan(request: CapturePlanRequest): Promise<CapturePlanResult>;
  /** Treino até o level cap: nível-alvo, golpes no caminho e EVs por papel. Cancelável por `cancel(request.jobId)`. */
  buildTrainingPlan(request: TrainingPlanRequest): Promise<TrainingPlanResult>;
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
