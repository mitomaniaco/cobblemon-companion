import {useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {ListBox, ListBoxItem, type Key, type Selection} from 'react-aria-components';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, speciesDisplay} from '../../domain/dex';
import type {CompanionApi, GuideNextGoal, GuideProgressRegion, GuideTrainerDetail} from '../../platform/api';
import {
  Button,
  ItemIcon,
  PokemonArtwork,
  PokeBallMark,
  SearchField,
  SegmentedControl,
  Select,
  StatusMessage,
  Switch,
  typeColorVar,
  typeInkVar,
} from '../../ui';
import {
  buildCampaignView,
  findStageByVariant,
  goalTrainerId,
  normalizeSearch,
  seriesLabel,
  stageGroupKey,
  stageStateLabel,
  stageTypeLabel,
  stageVictoryCount,
  visibleSeriesIds,
  type Campaign,
  type StageEntry,
} from './campaign-model';
import {LevelCapField} from './LevelCapField';
import {pikaStarDisplayStatus} from './progress-display-model';
import {spawnLines} from './spawn-model';
import {TrainerFace} from './TrainerFace';
import {trainerPortraitPath} from './trainer-portraits';
import type {GuideController} from './useGuide';
import type {GuideProgressState} from './useGuideProgress';
import {useTrainerDetails} from './useTrainerDetails';
import styles from './TrainerCard.module.css';

const UPCOMING_COUNT = 3;
const COLLAPSED_MIN_ENTRIES = 6;
const SKELETON_TEAM = ['a', 'b', 'c', 'd', 'e', 'f'];
const SKELETON_BADGES = ['a', 'b', 'c', 'd'];
const VARIANT_LETTERS = 'ABCDEFGH';

type CardView = 'campaign' | 'search';
type DetailEntry = GuideTrainerDetail | 'loading' | 'error';

const VIEW_OPTIONS: ReadonlyArray<{key: 'campaign' | 'search' | 'pve'; label: string}> = [
  {key: 'campaign', label: 'Campanha'},
  {key: 'search', label: 'Busca livre'},
  {key: 'pve', label: 'PvE geral'},
];

const PIKA_REGIONS: ReadonlyArray<{id: GuideProgressRegion; label: string}> = [
  {id: 'kanto', label: 'Kanto'},
  {id: 'johto', label: 'Johto'},
  {id: 'hoenn', label: 'Hoenn'},
  {id: 'sinnoh', label: 'Sinnoh'},
  {id: 'unova', label: 'Unova'},
  {id: 'kalos', label: 'Kalos'},
  {id: 'alola', label: 'Alola'},
  {id: 'galar', label: 'Galar'},
  {id: 'hisui', label: 'Hisui'},
  {id: 'paldea', label: 'Paldea'},
];

const CHAMP_INK = '#11141c';

function typeChipStyle(type: string): CSSProperties {
  const group = stageGroupKey(type);
  if (group === 'champ') return {background: 'var(--color-highlight)', color: CHAMP_INK};
  const pokemonType = {leader: 'Fire', e4: 'Psychic', rival: 'Dragon', team: 'Dark', other: 'Normal'}[group];
  return {background: typeColorVar(pokemonType), color: typeInkVar(pokemonType)};
}

function pikaStatusKey(value: boolean | null): 'obtido' | 'não obtido' | 'desconhecido' {
  if (value === true) return 'obtido';
  if (value === false) return 'não obtido';
  return 'desconhecido';
}

export interface TrainerCardProps {
  api: () => CompanionApi;
  campaign: Campaign;
  progress: GuideProgressState;
  nextGoal: GuideNextGoal | null;
  guide: GuideController;
  playerName: string | null;
  playerAvatar: string | null;
  levelCapInput: string;
  onLevelCapInputChange(value: string): void;
  respectLevelCap: boolean;
  onRespectLevelCapChange(value: boolean): void;
  levelCap: number | null;
  progressLevelCap: number | null;
}

function TeamArtwork({detail, zoomed}: {detail: DetailEntry | undefined; zoomed?: boolean}) {
  if (detail === undefined || detail === 'loading') {
    return (
      <div className={styles.teamRow} aria-busy="true">
        {SKELETON_TEAM.map((key) => (
          <span key={key} className={styles.skeletonCircle} />
        ))}
      </div>
    );
  }
  if (detail === 'error') return null;
  return (
    <div className={styles.teamRow} data-zoomed={zoomed ? 'true' : undefined}>
      {detail.team.map((member, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a mesma espécie pode repetir na equipe
          key={`${member.speciesId}-${index}`}
          className={zoomed ? styles.smallArt : undefined}
          title={speciesDisplay(member.speciesId, 'normal').name}
        >
          <PokemonArtwork speciesId={member.speciesId} formId={member.formId} variant="slot" />
        </span>
      ))}
    </div>
  );
}

function FindHow({detail}: {detail: DetailEntry | undefined}) {
  if (detail === 'error') return null;
  if (detail === undefined || detail === 'loading') {
    return (
      <div className={styles.findHow} aria-busy="true">
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLine} />
      </div>
    );
  }
  const lines = spawnLines(detail.spawn);
  return (
    <section className={styles.findHow} aria-label="Como encontrar">
      <h4 className={styles.blockTitle}>Como encontrar</h4>
      {lines === null ? (
        <p className={styles.muted}>Sem dados de spawn no pacote do RCT.</p>
      ) : (
        <>
          {lines.item !== null && (
            <p className={styles.itemLine}>
              <ItemIcon itemDexId={dexId(lines.item)} />
              <span>Item de Assinatura: {itemLabel(lines.item)} — use num Gerador de Treinador para chamá-lo.</span>
            </p>
          )}
          {lines.biomes !== '' && <p>Aparece em: {lines.biomes}</p>}
          {lines.excluded !== '' && <p className={styles.muted}>Não aparece em: {lines.excluded}</p>}
        </>
      )}
    </section>
  );
}

function PlayerPanel({
  progress,
  progressValue,
  badgeEntries,
  totalVictories,
  playerName,
  playerAvatar,
  guide,
  levelCap,
  progressLevelCap,
  levelCapInput,
  onLevelCapInputChange,
  respectLevelCap,
  onRespectLevelCapChange,
}: {
  progress: GuideProgressState;
  progressValue: GuideProgressState['value'];
  badgeEntries: StageEntry[];
  totalVictories: number;
  playerName: string | null;
  playerAvatar: string | null;
  guide: GuideController;
  levelCap: number | null;
  progressLevelCap: number | null;
  levelCapInput: string;
  onLevelCapInputChange(value: string): void;
  respectLevelCap: boolean;
  onRespectLevelCapChange(value: boolean): void;
}) {
  const name = playerName ?? 'Treinador';
  const capSource = levelCapInput.trim() !== '' ? 'informado por você' : progressLevelCap !== null ? 'lido do save' : 'desconhecido';
  const won = badgeEntries.filter((entry) => entry.state === 'vencido').length;
  const pikaCount = progressValue ? PIKA_REGIONS.filter(({id}) => progressValue.pikaStar[id] === true).length : 0;
  return (
    <section className={styles.player} aria-label="Treinador">
      <div className={styles.identity}>
        <TrainerFace src={playerAvatar} label={name} size={80} />
        <strong className={styles.playerName}>{name}</strong>
      </div>

      <div className={styles.capBlock}>
        <span className={styles.caption}>Level cap</span>
        <span className={styles.capNumber}>{levelCap ?? '—'}</span>
        <span className={styles.caption}>{capSource}</span>
      </div>
      <LevelCapField
        value={levelCapInput}
        onChange={onLevelCapInputChange}
        required={guide.mode === 'trainer'}
        defaultLevelCap={levelCapInput.trim() === '' ? progressLevelCap : null}
      />
      {guide.mode === 'trainer' && (
        <Switch isSelected={respectLevelCap} onChange={onRespectLevelCapChange}>
          Respeitar level cap
        </Switch>
      )}

      {progress.status === 'error' && (
        <StatusMessage tone="warning" title="Progresso do mundo indisponível">
          {progress.error}
        </StatusMessage>
      )}

      {progress.status === 'loading' && (
        <div className={styles.skeletonBlocks} aria-busy="true">
          {SKELETON_BADGES.map((key) => (
            <span key={key} className={styles.skeletonLine} />
          ))}
        </div>
      )}

      {progress.status !== 'loading' && badgeEntries.length > 0 && (
        <div className={styles.badges}>
          <h4 className={styles.blockTitle}>Insígnias</h4>
          <div className={styles.badgeRow}>
            {badgeEntries.map((entry) => {
              const defeated = entry.state === 'vencido';
              return (
                <span
                  key={entry.stage.stageId}
                  className={styles.badge}
                  role="img"
                  data-won={defeated ? 'true' : undefined}
                  title={entry.stage.name}
                  aria-label={`${entry.stage.name}: ${defeated ? 'vencido' : 'não vencido'}`}
                />
              );
            })}
          </div>
          <span className={styles.caption}>
            {won} de {badgeEntries.length} líderes · Vitórias na série: {totalVictories}
          </span>
        </div>
      )}

      {progress.status === 'ready' && (
        <div className={styles.pika}>
          <h4 className={styles.blockTitle}>Pika Star</h4>
          <div className={styles.sealRow}>
            {PIKA_REGIONS.map(({id, label}) => {
              const value = progress.value.pikaStar[id];
              return (
                <span
                  key={id}
                  className={styles.seal}
                  role="img"
                  data-status={pikaStatusKey(value)}
                  title={label}
                  aria-label={`${label}: ${pikaStarDisplayStatus(value)}`}
                >
                  {value === null ? '?' : null}
                </span>
              );
            })}
          </div>
          <span className={styles.caption}>{pikaCount} de 10 regiões</span>
        </div>
      )}
    </section>
  );
}

function Trail({
  entries,
  selectedKey,
  onSelection,
}: {
  entries: StageEntry[];
  selectedKey: string | null;
  onSelection(keys: Selection): void;
}) {
  return (
    <ListBox
      aria-label="Etapas da campanha"
      className={styles.trail}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={selectedKey === null ? [] : [selectedKey]}
      onSelectionChange={onSelection}
    >
      {entries.map((entry) => {
        const stage = entry.stage;
        const first = stage.variants[0];
        const hasCap = stage.capBefore != null && stage.capAfter != null;
        return (
          <ListBoxItem
            key={stage.stageId}
            id={stage.stageId}
            textValue={stage.name}
            aria-label={stage.name}
            isDisabled={entry.disabledReason !== null}
            className={styles.trailRow}
            data-state={entry.state}
            data-next={entry.state === 'próximo' ? 'true' : undefined}
          >
            <span className={styles.node} data-state={entry.state} title={stageStateLabel(entry.state)} aria-hidden="true">
              {entry.state === 'vencido' ? '✓' : null}
            </span>
            {first && <TrainerFace src={trainerPortraitPath(first.id)} label={stage.name} size={24} />}
            <span className={styles.trailName}>
              <span className={styles.trailTitle}>{stage.name}</span>
              <span className={styles.caption}>{stageTypeLabel(stage.type)}</span>
            </span>
            <span className={styles.trailMeta}>
              {hasCap && (
                <span className={styles.caption}>
                  {stage.capBefore}→{stage.capAfter}
                </span>
              )}
              {entry.victoryCount > 0 && <span className={styles.wins}>{entry.victoryCount}×</span>}
            </span>
          </ListBoxItem>
        );
      })}
    </ListBox>
  );
}

export function TrainerCard({
  api,
  campaign,
  progress,
  nextGoal,
  guide,
  playerName,
  playerAvatar,
  levelCapInput,
  onLevelCapInputChange,
  respectLevelCap,
  onRespectLevelCapChange,
  levelCap,
  progressLevelCap,
}: TrainerCardProps) {
  const [view, setView] = useState<CardView>('campaign');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [seriesChoice, setSeriesChoice] = useState<string | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  const progressValue = progress.status === 'ready' ? progress.value : null;
  const defeated = progressValue?.defeated ?? null;
  const victoryCounts = progressValue?.victoryCounts ?? null;
  const currentSeries = progressValue?.currentSeries ?? null;
  const trainerId = guide.trainerId;
  const pveMode = guide.mode === 'pve';

  const selectedStage = useMemo(() => findStageByVariant(campaign, trainerId), [campaign, trainerId]);
  const seriesIds = useMemo(() => visibleSeriesIds(campaign, currentSeries, view === 'campaign'), [campaign, currentSeries, view]);
  const fallbackSeries = seriesIds.includes('radicalred') ? 'radicalred' : seriesIds[0];
  const wanted = seriesChoice ?? selectedStage?.seriesId ?? currentSeries ?? fallbackSeries;
  const seriesId = seriesIds.includes(wanted) ? wanted : fallbackSeries;
  const series = campaign[seriesId];

  const views = useMemo(
    () =>
      new Map(
        Object.keys(campaign).map((id) => [
          id,
          buildCampaignView(campaign[id], {
            seriesId: id,
            defeated,
            victoryCounts,
            query: '',
            onlyCurrent: false,
            upcomingCount: UPCOMING_COUNT,
          }),
        ]),
      ),
    [campaign, defeated, victoryCounts],
  );
  const fullView = views.get(seriesId);
  const allEntries = fullView?.entries ?? [];
  const entryById = useMemo(
    () => new Map([...views.values()].flatMap((entryView) => entryView.entries.map((entry) => [entry.stage.stageId, entry] as const))),
    [views],
  );
  const stageNames = useMemo(
    () => new Map(Object.values(campaign).flatMap((entry) => entry.stages.map((stage) => [stage.stageId, stage.name] as const))),
    [campaign],
  );

  const nextStageId = fullView?.nextStageId ?? null;
  const heroEntry =
    (expandedStageId === null ? undefined : entryById.get(expandedStageId)) ??
    (selectedStage?.seriesId === seriesId ? allEntries.find((entry) => entry.stage.stageId === selectedStage.stage.stageId) : undefined) ??
    allEntries.find((entry) => entry.stage.stageId === nextStageId) ??
    allEntries.find((entry) => entry.state !== 'vencido') ??
    null;
  const heroStage = heroEntry?.stage ?? null;
  const singles = heroStage?.variants.filter((variant) => variant.format === 'singles') ?? [];
  const heroVariant = heroStage
    ? (heroStage.variants.find((variant) => variant.id === trainerId) ?? singles[0] ?? heroStage.variants[0] ?? null)
    : null;
  const choosingVariant = Boolean(heroEntry?.needsVariantChoice) && singles.length > 1;
  const detailIds = [
    ...new Set([...(heroVariant ? [heroVariant.id] : []), ...(choosingVariant ? singles.map((variant) => variant.id) : [])]),
  ];
  const details = useTrainerDetails(api, pveMode ? [] : detailIds);

  const isNextHero = heroStage !== null && heroStage.stageId === nextStageId;
  const heroLabel = isNextHero ? 'Próximo desafio' : 'Desafio escolhido';
  const isCurrentGoal = heroEntry !== null && trainerId !== null && trainerId === goalTrainerId(heroEntry, trainerId);

  const trailEntries = showAll ? allEntries : allEntries.filter((entry) => entry.state !== 'vencido');
  const heroIndex = heroStage ? trailEntries.findIndex((entry) => entry.stage.stageId === heroStage.stageId) : -1;
  const trailVisible = showAll ? trailEntries : trailEntries.slice(0, Math.max(COLLAPSED_MIN_ENTRIES, heroIndex + 1));

  const searchEntries = useMemo(
    () =>
      view === 'search'
        ? seriesIds.flatMap(
            (id) =>
              buildCampaignView(campaign[id], {
                seriesId: id,
                defeated,
                victoryCounts,
                query,
                onlyCurrent: false,
                upcomingCount: UPCOMING_COUNT,
              }).entries,
          )
        : [],
    [view, seriesIds, campaign, defeated, victoryCounts, query],
  );
  const allTrainers = guide.trainers.status === 'ready' ? guide.trainers.items : [];
  const freeSearchResults = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (view !== 'search' || normalized.length < 2) return [];
    const campaignTrainerIds = new Set(
      Object.values(campaign).flatMap((entry) => entry.stages.flatMap((stage) => stage.variants.map((variant) => variant.id))),
    );
    return allTrainers.filter(
      (trainer) =>
        !campaignTrainerIds.has(trainer.id) &&
        (normalizeSearch(trainer.name).includes(normalized) || normalizeSearch(trainer.id).includes(normalized)),
    );
  }, [view, campaign, allTrainers, query]);

  const badgeEntries = allEntries.filter((entry) => stageGroupKey(entry.stage.type) === 'leader');
  const totalVictories = series.stages.reduce((sum, stage) => sum + stageVictoryCount(stage, victoryCounts), 0);
  const heroDetail = heroVariant ? details.get(heroVariant.id) : undefined;
  const selectedKey = heroStage?.stageId ?? null;

  function handleSelection(keys: Selection) {
    const [key] = keys === 'all' ? [] : [...keys];
    if (key === undefined) return;
    const entry = entryById.get(String(key as Key));
    if (!entry) return;
    setExpandedStageId(entry.stage.stageId);
    const owner = [...views.values()].find((entryView) => entryView.entries.includes(entry));
    if (owner) setSeriesChoice(owner.seriesId);
    const id = goalTrainerId(entry, null);
    if (id !== null) guide.selectTrainer(id);
  }

  function changeView(key: 'campaign' | 'search' | 'pve') {
    if (key === 'pve') {
      guide.selectMode('pve');
      return;
    }
    setView(key);
    if (pveMode) guide.selectMode('trainer');
  }

  const showTrail = view === 'campaign';
  const searchEmpty = searchEntries.length === 0 && freeSearchResults.length === 0;

  return (
    <section className={styles.card} aria-label="Trainer Card">
      <div className={styles.bar}>
        <PokeBallMark className={styles.barMark} variant="filled" />
        <div className={styles.barTitle}>
          <h3>Trainer Card</h3>
          <span>{seriesLabel(seriesId)}</span>
        </div>
        {seriesIds.length > 1 && (
          <Select
            className={styles.seriesField}
            label="Série da campanha"
            options={seriesIds.map((id) => ({key: id, label: seriesLabel(id)}))}
            value={seriesId}
            onChange={(value) => {
              if (value !== null) {
                setSeriesChoice(value);
                setExpandedStageId(null);
              }
            }}
          />
        )}
        <SegmentedControl
          className={styles.modes}
          label="Objetivo do guia"
          options={VIEW_OPTIONS}
          value={pveMode ? 'pve' : view}
          onChange={changeView}
        />
      </div>

      <div className={styles.body}>
        <PlayerPanel
          progress={progress}
          progressValue={progressValue}
          badgeEntries={badgeEntries}
          totalVictories={totalVictories}
          playerName={playerName}
          playerAvatar={playerAvatar}
          guide={guide}
          levelCap={levelCap}
          progressLevelCap={progressLevelCap}
          levelCapInput={levelCapInput}
          onLevelCapInputChange={onLevelCapInputChange}
          respectLevelCap={respectLevelCap}
          onRespectLevelCapChange={onRespectLevelCapChange}
        />

        {pveMode ? (
          <section className={styles.hero} aria-label="Objetivo PvE">
            <h3 className={styles.heroName}>PvE geral</h3>
            <p>O time é montado contra os treinadores da sua faixa de nível; não há um desafio específico.</p>
          </section>
        ) : (
          <section className={styles.hero} aria-label={heroLabel}>
            {heroStage && heroEntry && heroVariant ? (
              <>
                <div className={styles.heroHeader}>
                  <TrainerFace src={trainerPortraitPath(heroVariant.id)} label={heroStage.name} size={72} />
                  <div className={styles.heroTitle}>
                    <span className={styles.typeChip} style={typeChipStyle(heroStage.type)}>
                      {stageTypeLabel(heroStage.type)}
                    </span>
                    <h3 className={styles.heroName}>{heroStage.name}</h3>
                  </div>
                </div>

                <TeamArtwork detail={heroDetail} />

                <dl className={styles.facts}>
                  <div>
                    <dt>Level cap</dt>
                    <dd>
                      {heroStage.capBefore != null && heroStage.capAfter != null
                        ? `${heroStage.capBefore} → ${heroStage.capAfter}`
                        : (heroStage.capUnknownReason ?? 'desconhecido')}
                    </dd>
                  </div>
                  <div>
                    <dt>Pokémon</dt>
                    <dd>{heroVariant.teamSize}</dd>
                  </div>
                  <div>
                    <dt>Pré-requisitos</dt>
                    <dd>
                      {heroStage.requires.length > 0 ? heroStage.requires.map((id) => stageNames.get(id) ?? id).join(', ') : 'nenhum'}
                    </dd>
                  </div>
                </dl>

                <FindHow detail={heroDetail} />

                {choosingVariant && (
                  <div className={styles.variants}>
                    {heroStage.ambiguousReason && <p className={styles.muted}>{heroStage.ambiguousReason}</p>}
                    <div role="radiogroup" aria-label={`Equipe de ${heroStage.name}`} className={styles.variantGrid}>
                      {singles.map((variant, index) => (
                        // biome-ignore lint/a11y/useSemanticElements: o cartão inteiro é o rádio (equipe, nível e tamanho dentro)
                        <button
                          key={variant.id}
                          type="button"
                          role="radio"
                          aria-checked={trainerId === variant.id}
                          className={styles.variantCard}
                          onClick={() => guide.selectTrainer(variant.id)}
                        >
                          <strong>Equipe {VARIANT_LETTERS[index]}</strong>
                          <TeamArtwork detail={details.get(variant.id)} zoomed />
                          <span className={styles.caption}>
                            nível {variant.maxLevel} · {variant.teamSize} Pokémon
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.actions}>
                  {heroEntry.disabledReason !== null ? (
                    <p className={styles.muted}>{heroEntry.disabledReason}</p>
                  ) : isCurrentGoal ? (
                    <>
                      <span className={styles.goalChip}>Objetivo atual</span>
                      {guide.phase === 'building' ? (
                        <Button variant="secondary" onPress={guide.cancel}>
                          Cancelar
                        </Button>
                      ) : (
                        <Button variant="secondary" onPress={guide.rebuild}>
                          Montar de novo
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        isDisabled={goalTrainerId(heroEntry, null) === null}
                        onPress={() => {
                          const id = goalTrainerId(heroEntry, null);
                          if (id !== null) guide.selectTrainer(id);
                        }}
                      >
                        Montar time para este desafio
                      </Button>
                      {goalTrainerId(heroEntry, null) === null && <span className={styles.muted}>Escolha a equipe acima.</span>}
                    </>
                  )}
                </div>
                {progressValue === null && nextGoal?.basis === 'nível' && <p className={styles.muted}>{nextGoal.reason}</p>}
              </>
            ) : (
              <p className={styles.muted}>Nenhuma etapa disponível nesta série.</p>
            )}
          </section>
        )}

        <div className={styles.side}>
          {showTrail ? (
            <>
              <h4 className={styles.blockTitle}>Trilha da campanha</h4>
              <Trail entries={trailVisible} selectedKey={selectedKey} onSelection={handleSelection} />
              <Button variant="quiet" onPress={() => setShowAll((value) => !value)}>
                {showAll ? 'Mostrar menos' : `Mostrar todas as etapas (${series.stages.length})`}
              </Button>
            </>
          ) : (
            <>
              <SearchField label="Buscar treinador" value={query} onChange={setQuery} placeholder="Nome, tipo ou id do treinador…" />
              {searchEmpty ? (
                <p className={styles.muted} role="status">
                  Nenhum treinador encontrado{query.trim() === '' ? '' : ` para “${query.trim()}”`}.
                </p>
              ) : (
                <>
                  {searchEntries.length > 0 && <Trail entries={searchEntries} selectedKey={selectedKey} onSelection={handleSelection} />}
                  {freeSearchResults.length > 0 && (
                    <div className={styles.free}>
                      <h4 className={styles.blockTitle}>Outros treinadores (fora da campanha)</h4>
                      <ul className={styles.freeList}>
                        {freeSearchResults.map((trainer) => (
                          <li key={trainer.id}>
                            <button
                              type="button"
                              className={styles.freeButton}
                              onClick={() => guide.selectTrainer(trainer.id)}
                              data-selected={trainerId === trainer.id ? 'true' : undefined}
                            >
                              <span className={styles.trailTitle}>{trainer.name}</span>
                              <span className={styles.caption}>{trainer.id}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
