import {describe, expect, it} from 'vitest';
import {
  buildCampaignView,
  computeStageStates,
  DOUBLES_NOT_SUPPORTED,
  goalTrainerId,
  normalizeSearch,
  stageEntry,
  stageLevelSummary,
  stageStateLabel,
  visibleSeriesIds,
  type Campaign,
  type CampaignStage,
  type CampaignVariant,
  type CampaignViewOptions,
  formatStageCap,
  stageTypeLabel,
  stageVictoryCount,
  variantLabel,
} from '../src/features/guide/campaign-model';

const variant = (id: string, overrides: Partial<CampaignVariant> = {}): CampaignVariant => ({
  id,
  format: 'singles',
  maxLevel: 20,
  teamSize: 3,
  optional: false,
  ...overrides,
});

const stage = (stageId: string, order: number, overrides: Partial<CampaignStage> = {}): CampaignStage => ({
  stageId,
  name: stageId,
  type: 'leader',
  order,
  requires: [],
  ambiguous: false,
  ambiguousReason: null,
  variants: [variant(`rctmod:${stageId}`)],
  ...overrides,
});

// Série sintética: líder → rocket (exige líder) → rival (3 variantes, exige rocket) → líder 2 (exige líder) → dupla (exige rival) → campeão.
const series: CampaignStage[] = [
  stage('s:brock', 0, {name: 'Brock'}),
  stage('s:archer', 1, {name: 'Rocket Admin Archer · 1º encontro', type: 'team_rocket', requires: ['s:brock']}),
  stage('s:rival1', 2, {
    name: 'Rival Terry · 1º encontro',
    type: 'rival',
    requires: ['s:archer'],
    ambiguous: true,
    ambiguousReason: 'sorteio ponderado no spawn',
    variants: [
      variant('rctmod:rival_a', {maxLevel: 21}),
      variant('rctmod:rival_b', {maxLevel: 21}),
      variant('rctmod:rival_c', {maxLevel: 21}),
    ],
  }),
  stage('s:misty', 3, {name: 'Misty', requires: ['s:brock']}),
  stage('s:lorelei', 4, {
    name: 'Lorelei',
    type: 'e4',
    requires: ['s:rival1'],
    variants: [variant('rctmod:lorelei', {format: 'doubles'})],
  }),
  stage('s:champion', 5, {name: 'Campeão Terry', type: 'champ', requires: ['s:lorelei']}),
];

const campaign: Campaign = {
  radicalred: {stages: series, optionalTrainerIds: []},
  bdsp: {stages: [stage('b:roark', 0, {name: 'Roark'})], optionalTrainerIds: []},
};

const viewOptions: CampaignViewOptions = {seriesId: 'radicalred', defeated: [], query: '', onlyCurrent: false, upcomingCount: 2};

describe('estado das etapas', () => {
  it('sem progresso lido tudo é "progresso desconhecido": nunca vencido nem liberado', () => {
    const states = computeStageStates(series, null);
    expect(states.size).toBe(series.length);
  });

  it('com progresso vazio a primeira etapa é a próxima e o resto sem requisito é liberado ou bloqueado', () => {
    const states = computeStageStates(series, []);
    expect(states.get('s:brock')).toBe('próximo');
    expect(states.get('s:archer')).toBe('bloqueado');
    expect(states.get('s:misty')).toBe('bloqueado');
    expect(states.get('s:champion')).toBe('bloqueado');
  });

  it('vencer o líder vence a etapa, libera as que dependem dele e a primeira na ordem vira a próxima', () => {
    const states = computeStageStates(series, ['rctmod:s:brock']);
    expect(states.get('s:brock')).toBe('vencido');
    expect(states.get('s:archer')).toBe('próximo');
    expect(states.get('s:misty')).toBe('liberado');
    expect(states.get('s:rival1')).toBe('bloqueado');
  });

  it('vencer qualquer variante conta como vencer a etapa inteira (irmãos do RCT)', () => {
    const states = computeStageStates(series, ['rctmod:s:brock', 'rctmod:s:archer', 'rctmod:rival_b']);
    expect(states.get('s:rival1')).toBe('vencido');
    expect(states.get('s:misty')).toBe('próximo');
    expect(states.get('s:lorelei')).toBe('liberado');
  });

  it('ids vencidos fora da série não mudam nada', () => {
    expect(computeStageStates(series, ['rctmod:desconhecido']).get('s:brock')).toBe('próximo');
  });

  it('rótulos de estado cobrem os cinco casos', () => {
    expect(stageStateLabel('vencido')).toBe('Vencido');
    expect(stageStateLabel('próximo')).toBe('Próximo');
    expect(stageStateLabel('liberado')).toBe('Liberado');
    expect(stageStateLabel('bloqueado')).toBe('Bloqueado');
    expect(stageStateLabel('progresso desconhecido')).toBe('Progresso desconhecido');
  });
});

describe('lista da campanha', () => {
  const view = buildCampaignView(campaign.radicalred, {...viewOptions, defeated: ['rctmod:s:brock']});

  it('uma entrada por treinador lógico, sem duplicar as variantes, na ordem da campanha', () => {
    const entries = view.groups.flatMap((group) => group.entries);
    expect(entries.map((entry) => entry.stage.stageId)).toEqual(['s:brock', 's:archer', 's:rival1', 's:misty', 's:lorelei', 's:champion']);
    expect(new Set(entries.map((entry) => entry.stage.stageId)).size).toBe(entries.length);
    expect(view.totalStages).toBe(series.length);
  });

  it('mantém todas as etapas na ordem linear cronológica da jornada', () => {
    expect(view.groups.map((group) => [group.label, group.entries.map((entry) => entry.stage.stageId)])).toEqual([
      ['Jornada da Campanha', ['s:brock', 's:archer', 's:rival1', 's:misty', 's:lorelei', 's:champion']],
    ]);
  });

  it('marca a próxima etapa e lista as seguintes como "depois deste" sem repetir a próxima', () => {
    expect(view.nextStageId).toBe('s:archer');
    expect(view.upcoming.map((entry) => entry.stage.stageId)).toEqual(['s:rival1', 's:misty']);
  });

  it('sem progresso não há próxima nem "depois deste"', () => {
    const unknown = buildCampaignView(campaign.radicalred, {...viewOptions, defeated: null});
    expect(unknown.nextStageId).toBeNull();
    expect(unknown.upcoming).toEqual([]);
    expect(unknown.groups.flatMap((group) => group.entries).every((entry) => entry.state === 'progresso desconhecido')).toBe(true);
  });

  it('"só campanha atual" esconde as etapas vencidas e mantém as demais', () => {
    const current = buildCampaignView(campaign.radicalred, {...viewOptions, defeated: ['rctmod:s:brock'], onlyCurrent: true});
    expect(current.groups.flatMap((group) => group.entries).map((entry) => entry.stage.stageId)).not.toContain('s:brock');
    expect(current.groups.flatMap((group) => group.entries)).toHaveLength(series.length - 1);
    const all = buildCampaignView(campaign.radicalred, {...viewOptions, defeated: ['rctmod:s:brock'], onlyCurrent: false});
    expect(all.groups.flatMap((group) => group.entries)).toHaveLength(series.length);
  });

  it('a busca ignora acento, caixa e pontuação e também acha pelo grupo', () => {
    const search = (query: string) =>
      buildCampaignView(campaign.radicalred, {...viewOptions, defeated: [], query})
        .groups.flatMap((group) => group.entries)
        .map((entry) => entry.stage.stageId);
    expect(search('rival terry 1o')).toEqual(['s:rival1']);
    expect(search('CAMPEAO')).toEqual(['s:champion']);
    expect(search('elite')).toEqual(['s:lorelei']);
    expect(search('inexistente')).toEqual([]);
    expect(normalizeSearch('Pokémon · 1º Encontro!')).toBe('pokemon 1o encontro');
  });
});

describe('séries visíveis', () => {
  it('com a série atual conhecida e "só campanha atual", só ela; desligado, ela primeiro e as outras depois', () => {
    expect(visibleSeriesIds(campaign, 'bdsp', true)).toEqual(['bdsp']);
    expect(visibleSeriesIds(campaign, 'bdsp', false)).toEqual(['bdsp', 'radicalred']);
  });

  it('série atual desconhecida ou inexistente nunca inventa uma: lista todas', () => {
    expect(visibleSeriesIds(campaign, null, true)).toEqual(['radicalred', 'bdsp']);
    expect(visibleSeriesIds(campaign, 'serie-que-nao-existe', true)).toEqual(['radicalred', 'bdsp']);
  });
});

describe('variantes e duplas', () => {
  it('etapa sem ambiguidade usa a única variante; a ambígua exige escolha e nunca escolhe em silêncio', () => {
    const plain = stageEntry(series[0], 'próximo');
    expect(plain.needsVariantChoice).toBe(false);
    expect(goalTrainerId(plain, null)).toBe('rctmod:s:brock');

    const ambiguous = stageEntry(series[2], 'liberado');
    expect(ambiguous.needsVariantChoice).toBe(true);
    expect(ambiguous.defaultVariant).toBeNull();
    expect(goalTrainerId(ambiguous, null)).toBeNull();
    expect(goalTrainerId(ambiguous, 'rctmod:rival_b')).toBe('rctmod:rival_b');
    expect(goalTrainerId(ambiguous, 'rctmod:outro')).toBeNull();
  });

  it('etapa só de duplas fica desabilitada com o motivo e nunca vira objetivo', () => {
    const doubles = stageEntry(series[4], 'liberado');
    expect(doubles.disabledReason).toBe(DOUBLES_NOT_SUPPORTED);
    expect(goalTrainerId(doubles, 'rctmod:lorelei')).toBeNull();
    expect(stageLevelSummary(doubles)).toBe(DOUBLES_NOT_SUPPORTED);
  });

  it('escolher variante em dupla dentro de etapa mista não é aceito', () => {
    const mixed = stageEntry(
      stage('s:mixed', 9, {
        ambiguous: true,
        variants: [variant('rctmod:m1'), variant('rctmod:m2'), variant('rctmod:m3', {format: 'doubles'})],
      }),
      'liberado',
    );
    expect(mixed.needsVariantChoice).toBe(true);
    expect(goalTrainerId(mixed, 'rctmod:m3')).toBeNull();
    expect(goalTrainerId(mixed, 'rctmod:m2')).toBe('rctmod:m2');
  });

  it('resume nível e tamanho do time, com faixa quando as variantes diferem', () => {
    expect(stageLevelSummary(stageEntry(series[0], 'próximo'))).toBe('nível máx. 20 · 3 Pokémon');
    const ranged = stageEntry(
      stage('s:range', 9, {
        ambiguous: true,
        variants: [variant('rctmod:r1', {maxLevel: 40, teamSize: 4}), variant('rctmod:r2', {maxLevel: 44, teamSize: 5})],
      }),
      'liberado',
    );
    expect(stageLevelSummary(ranged)).toBe('nível máx. 40–44 · 4–5 Pokémon');
  });

  it('formata rótulos de variantes focados no jogador', () => {
    expect(variantLabel(variant('rctmod:rival_starter_squirtle', {maxLevel: 15, teamSize: 3}), 0)).toBe(
      'Inicial: Squirtle · nível 15 · 3 Pokémon',
    );
    expect(variantLabel(variant('rctmod:rival_terry_014c', {maxLevel: 12, teamSize: 3}), 0)).toBe('Equipe 1 · nível 12 · 3 Pokémon');
  });
});

describe('contagem de vitórias e level cap da etapa', () => {
  it('soma vitórias das variantes a partir de victoryCounts com ou sem prefixo de namespace', () => {
    const multiVariant = stage('s:rival', 1, {
      variants: [variant('rctmod:rival_terry_014c'), variant('rctmod:rival_terry_014d')],
    });
    const victoryCounts = {rival_terry_014c: 2, 'rctmod:rival_terry_014d': 1, outro: 5};
    expect(stageVictoryCount(multiVariant, victoryCounts)).toBe(3);
    expect(stageVictoryCount(multiVariant, null)).toBe(0);
  });

  it('injeta victoryCount nas entradas da visão da campanha', () => {
    const view = buildCampaignView(campaign.radicalred, {
      ...viewOptions,
      victoryCounts: {leader_brock_019e: 1, 's:brock': 2},
    });
    const brockEntry = view.groups.flatMap((g) => g.entries).find((e) => e.stage.stageId === 's:brock');
    expect(brockEntry?.victoryCount).toBe(2);
  });

  it('formata level cap antes -> depois e tipo legível do treinador', () => {
    expect(formatStageCap(15, 21)).toBe('Level cap: 15 → 21');
    expect(formatStageCap(null, null)).toBeNull();
    expect(stageTypeLabel('leader')).toBe('Líder de Ginásio');
    expect(stageTypeLabel('e4')).toBe('Elite 4');
    expect(stageTypeLabel('rival')).toBe('Rival');
  });
});
