/**
 * Modelo puro do seletor de treinadores por campanha (Issue #129). Os tipos espelham `data/guide/campaign.json`
 * (Issue #127): séries com etapas ordenadas, uma etapa por treinador lógico e as variantes RCT dentro dela.
 * Nada aqui toca em rede, arquivos ou no save: o progresso entra como `defeated` (ids RCT) ou `null` (desconhecido).
 */

export type CampaignVariant = {id: string; format: 'singles' | 'doubles'; maxLevel: number; teamSize: number; optional: boolean};

export type CampaignStage = {
  stageId: string;
  name: string;
  type: string;
  order: number;
  /** `stageId`s que precisam estar vencidas antes desta. */
  requires: string[];
  capBefore?: number | null;
  capAfter?: number | null;
  capUnknownReason?: string | null;
  /** `true`: o app não sabe qual variante vale para o jogador (sorteio no spawn); nenhuma é escolhida em silêncio. */
  ambiguous: boolean;
  ambiguousReason: string | null;
  variants: CampaignVariant[];
};

export type CampaignSeries = {stages: CampaignStage[]; optionalTrainerIds: string[]};

export type Campaign = Readonly<Record<string, CampaignSeries>>;

export type StageState = 'vencido' | 'próximo' | 'liberado' | 'bloqueado' | 'progresso desconhecido';

export const DOUBLES_NOT_SUPPORTED = 'duplas: não suportado';

const TYPE_GROUP: ReadonlyArray<{match: RegExp; key: string; label: string}> = [
  {match: /^leader$|^normal$|custom_gym|elite_gym/, key: 'leader', label: 'Líderes'},
  {match: /^e4$/, key: 'e4', label: 'Elite 4'},
  {match: /^champ$/, key: 'champ', label: 'Campeão'},
  {match: /^rival$/, key: 'rival', label: 'Rivais'},
  {match: /^team_|^ligh_of_ruin$|^contentcreators$|trainer|wandering/, key: 'team', label: 'Equipes e chefes'},
];

const OTHER_GROUP = {key: 'other', label: 'Outros'};

function groupOf(type: string): {key: string; label: string} {
  return TYPE_GROUP.find((group) => group.match.test(type)) ?? OTHER_GROUP;
}

/** Sem acento, minúsculo e sem pontuação: a busca por "pokemon" acha "Pokémon", "rival terry" acha "Rival Terry · 1º encontro". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isStageDefeated(stage: CampaignStage, defeated: ReadonlySet<string>): boolean {
  // Os irmãos de um grupo `requiredDefeats` contam juntos: vencer qualquer variante vence a etapa (#127).
  return stage.variants.some((variant) => defeated.has(variant.id));
}

/**
 * Estado de cada etapa da série. `defeated: null` = progresso desconhecido para todas (nunca vira "vencido" nem "liberado").
 * `próximo` é a primeira etapa liberada e não vencida na ordem da campanha; as demais liberadas ficam `liberado`.
 */
export function computeStageStates(stages: readonly CampaignStage[], defeated: readonly string[] | null): ReadonlyMap<string, StageState> {
  const states = new Map<string, StageState>();
  if (defeated === null) {
    for (const stage of stages) states.set(stage.stageId, 'progresso desconhecido');
    return states;
  }
  const defeatedIds = new Set(defeated);
  const defeatedStages = new Set(stages.filter((stage) => isStageDefeated(stage, defeatedIds)).map((stage) => stage.stageId));
  let nextAssigned = false;
  for (const stage of [...stages].sort((left, right) => left.order - right.order)) {
    if (defeatedStages.has(stage.stageId)) {
      states.set(stage.stageId, 'vencido');
    } else if (stage.requires.every((required) => defeatedStages.has(required))) {
      states.set(stage.stageId, nextAssigned ? 'liberado' : 'próximo');
      nextAssigned = true;
    } else {
      states.set(stage.stageId, 'bloqueado');
    }
  }
  return states;
}

export type StageEntry = {
  stage: CampaignStage;
  state: StageState;
  /** Quantidade de vitórias registradas contra as variantes desta etapa. */
  victoryCount: number;
  /** Variantes por escolher: só quando há mais de uma e o app não sabe qual vale (`ambiguous`). */
  needsVariantChoice: boolean;
  /** Variante usada quando não há escolha a fazer: a única variante singles. Nulo se todas são duplas ou há escolha pendente. */
  defaultVariant: CampaignVariant | null;
  /** Etapa só de duplas: não vira objetivo. */
  disabledReason: string | null;
};

export function stageVictoryCount(stage: CampaignStage, victoryCounts: Readonly<Record<string, number>> | null): number {
  if (!victoryCounts) return 0;
  let total = 0;
  for (const variant of stage.variants) total += victoryCounts[variant.id] ?? 0;
  return total;
}

export function stageEntry(
  stage: CampaignStage,
  state: StageState,
  victoryCounts: Readonly<Record<string, number>> | null = null,
): StageEntry {
  const singles = stage.variants.filter((variant) => variant.format === 'singles');
  const needsVariantChoice = stage.ambiguous && singles.length > 1;
  return {
    stage,
    state,
    victoryCount: stageVictoryCount(stage, victoryCounts),
    needsVariantChoice,
    defaultVariant: !needsVariantChoice && singles.length >= 1 ? singles[0] : null,
    disabledReason: singles.length === 0 ? DOUBLES_NOT_SUPPORTED : null,
  };
}

export type StageGroup = {key: string; label: string; entries: StageEntry[]};

export type CampaignView = {
  seriesId: string;
  groups: StageGroup[];
  /** Etapa próxima (primeira liberada não vencida), se o progresso é conhecido e há alguma. */
  nextStageId: string | null;
  /** As próximas etapas depois da próxima (em ordem), não vencidas e não bloqueadas por ela, até `upcomingCount`. */
  upcoming: StageEntry[];
  totalStages: number;
};

export type CampaignViewOptions = {
  seriesId: string;
  defeated: readonly string[] | null;
  victoryCounts?: Readonly<Record<string, number>> | null;
  query: string;
  /** Liga o filtro "só campanha atual": esconde etapas vencidas (o histórico fica fora do caminho do jogador). */
  onlyCurrent: boolean;
  upcomingCount: number;
};

/** Uma entrada por treinador lógico, agrupadas por tipo na ordem da campanha; variantes ficam dentro da entrada. */
export function buildCampaignView(series: CampaignSeries, options: CampaignViewOptions): CampaignView {
  const states = computeStageStates(series.stages, options.defeated);
  const ordered = [...series.stages].sort((left, right) => left.order - right.order);
  const entries = ordered.map((stage) =>
    stageEntry(stage, states.get(stage.stageId) ?? 'progresso desconhecido', options.victoryCounts ?? null),
  );
  const nextEntry = entries.find((entry) => entry.state === 'próximo');
  const nextStageId = nextEntry?.stage.stageId ?? null;
  const upcoming = nextEntry
    ? entries
        .filter((entry) => entry.stage.order > nextEntry.stage.order && (entry.state === 'liberado' || entry.state === 'bloqueado'))
        .slice(0, options.upcomingCount)
    : [];

  const query = normalizeSearch(options.query);
  const visible = entries.filter((entry) => {
    if (options.onlyCurrent && entry.state === 'vencido') return false;
    if (query === '') return true;
    return normalizeSearch(`${entry.stage.name} ${groupOf(entry.stage.type).label}`).includes(query);
  });

  const groups: StageGroup[] = visible.length > 0 ? [{key: 'journey', label: 'Jornada da Campanha', entries: visible}] : [];
  return {seriesId: options.seriesId, groups, nextStageId, upcoming, totalStages: series.stages.length};
}

/**
 * Séries a listar. Com "só campanha atual" e a série em andamento conhecida e existente, só ela; senão, todas
 * (com a série em andamento primeiro, se houver), nunca uma série inventada.
 */
export function visibleSeriesIds(campaign: Campaign, currentSeries: string | null, onlyCurrent: boolean): string[] {
  const ids = Object.keys(campaign);
  if (currentSeries !== null && currentSeries in campaign) {
    return onlyCurrent ? [currentSeries] : [currentSeries, ...ids.filter((id) => id !== currentSeries)];
  }
  return ids;
}

/** Objetivo do guia para a escolha feita: a variante escolhida, ou a padrão quando não há ambiguidade. */
export function goalTrainerId(entry: StageEntry, chosenVariantId: string | null): string | null {
  if (entry.disabledReason !== null) return null;
  if (entry.needsVariantChoice) {
    return entry.stage.variants.some((variant) => variant.id === chosenVariantId && variant.format === 'singles') ? chosenVariantId : null;
  }
  return entry.defaultVariant?.id ?? null;
}

export function stageStateLabel(state: StageState): string {
  if (state === 'vencido') return 'Vencido';
  if (state === 'próximo') return 'Próximo';
  if (state === 'liberado') return 'Liberado';
  if (state === 'bloqueado') return 'Bloqueado';
  return 'Progresso desconhecido';
}

export function stageLevelSummary(entry: StageEntry): string {
  const variants = entry.stage.variants.filter((variant) => variant.format === 'singles');
  const levels = variants.map((variant) => variant.maxLevel);
  const sizes = variants.map((variant) => variant.teamSize);
  if (variants.length === 0) return DOUBLES_NOT_SUPPORTED;
  const range = (values: number[]) =>
    Math.min(...values) === Math.max(...values) ? `${values[0]}` : `${Math.min(...values)}–${Math.max(...values)}`;
  return `nível máx. ${range(levels)} · ${range(sizes)} Pokémon`;
}

/** Etapa (e série) que contém a variante RCT escolhida como objetivo; nulo se o id não é da campanha. */
export function findStageByVariant(campaign: Campaign, trainerId: string | null): {seriesId: string; stage: CampaignStage} | null {
  if (trainerId === null) return null;
  for (const [seriesId, series] of Object.entries(campaign)) {
    const stage = series.stages.find((candidate) => candidate.variants.some((variant) => variant.id === trainerId));
    if (stage) return {seriesId, stage};
  }
  return null;
}

const SERIES_LABEL: Readonly<Record<string, string>> = {
  radicalred: 'Radical Red',
  unbound: 'Unbound',
  bdsp: 'Brilliant Diamond / Shining Pearl',
  atm_team: 'Equipe ATM',
  contentcreators: 'Criadores de conteúdo',
};

/** Nome legível da série; série desconhecida usa o id em maiúscula inicial, sem inventar nome. */
export function seriesLabel(seriesId: string): string {
  return SERIES_LABEL[seriesId] ?? `${seriesId.charAt(0).toUpperCase()}${seriesId.slice(1)}`;
}

function cleanVariantDescriptor(id: string, index: number): string {
  const cleanId = id.replace(/^rctmod:/, '');
  const starterMatch = cleanId.match(/player_chose_([a-z0-9]+)/i) || cleanId.match(/starter_([a-z0-9]+)/i);
  if (starterMatch) {
    const name = starterMatch[1].charAt(0).toUpperCase() + starterMatch[1].slice(1);
    return `Inicial: ${name}`;
  }
  const teamMatch = cleanId.match(/team_([a-z0-9]+)/i);
  if (teamMatch) {
    const name = teamMatch[1].charAt(0).toUpperCase() + teamMatch[1].slice(1);
    return `Equipe ${name}`;
  }
  return `Equipe ${index + 1}`;
}

/** Rótulo legível e focado no jogador para variantes de uma etapa. */
export function variantLabel(variant: CampaignVariant, index: number): string {
  const descriptor = cleanVariantDescriptor(variant.id, index);
  return `${descriptor} · nível ${variant.maxLevel} · ${variant.teamSize} Pokémon`;
}

/** De onde vem o progresso: lido do mundo (`defeated` conhecido) ou estimado pelo nível da party (sem leitura). */
export function progressOriginLabel(defeated: readonly string[] | null): string {
  return defeated === null ? 'Estimado pelo nível da party (progresso do save não lido)' : 'Lido do save';
}

/** Rótulo legível do tipo da etapa no Trainer Card. */
export function stageTypeLabel(type: string): string {
  const group = groupOf(type);
  if (group.key === 'leader') return 'Líder de Ginásio';
  if (group.key === 'e4') return 'Elite 4';
  if (group.key === 'champ') return 'Campeão';
  if (group.key === 'rival') return 'Rival';
  if (group.key === 'team') return 'Equipe ou Chefe';
  return 'Outro';
}

/** Formata o avanço de level cap de uma etapa: ex.: "15 → 21". */
export function formatStageCap(capBefore: number | null | undefined, capAfter: number | null | undefined): string | null {
  if (capBefore === null && capAfter === null) return null;
  if (capBefore === undefined && capAfter === undefined) return null;
  return `Level cap: ${capBefore ?? 'desconhecido'} → ${capAfter ?? 'desconhecido'}`;
}
