import {useId, useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {ListBox, ListBoxItem, type Key, type Selection} from 'react-aria-components';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, speciesDisplay} from '../../domain/dex';
import type {
  CompanionApi,
  GuideNextGoal,
  GuidePartyPlan,
  GuideProgressRegion,
  GuideResult,
  GuideTrainerDetail,
  GuideTeamMember,
  PlayerIndividual,
} from '../../platform/api';
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
  typeIconPath,
  typeInkVar,
  typeLabel,
} from '../../ui';
import {
  buildCampaignView,
  findStageByVariant,
  goalTrainerId,
  LEADER_TYPES,
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
import {guideBestAnswerUuid, guidePartySteps} from './guide-model';
import {TeamDetail} from './TeamDetail';
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
const PARTY_SIZE = 6;
const SKELETON_TEAM = ['a', 'b', 'c', 'd', 'e', 'f'];
const SKELETON_BADGES = ['a', 'b', 'c', 'd'];
const VARIANT_LETTERS = 'ABCDEFGH';
const MAX_BADGES = 8;

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

/** Cor do desafio e tinta do chip: líder usa o tipo do ginásio; os demais grupos têm uma cor fixa. */
function heroPalette(stageName: string, stageType: string): {color: string; ink: string} {
  const group = stageGroupKey(stageType);
  if (group === 'champ') return {color: 'var(--color-highlight)', ink: CHAMP_INK};
  const type =
    group === 'leader' ? (LEADER_TYPES[stageName] ?? 'Fire') : {e4: 'Psychic', rival: 'Dragon', team: 'Dark', other: 'Normal'}[group];
  return {color: typeColorVar(type), ink: typeInkVar(type)};
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
  /** Indivíduos do save, para a forma e o nível dos Pokémon da equipe recomendada. */
  individuals: ReadonlyMap<string, PlayerIndividual>;
  levelCapInput: string;
  onLevelCapInputChange(value: string): void;
  respectLevelCap: boolean;
  onRespectLevelCapChange(value: boolean): void;
  levelCap: number | null;
  progressLevelCap: number | null;
  onOpenCalculation(uuid: string, move: GuideTeamMember['moves'][number]): void;
}

function FindHow({detail}: {detail: DetailEntry | undefined}) {
  if (detail === 'error') return null;
  if (detail === undefined || detail === 'loading') {
    return (
      <div className={styles.findHow} aria-busy="true">
        <span className={styles.skeletonLine} />
      </div>
    );
  }
  const lines = spawnLines(detail.spawn);
  return (
    <section className={styles.findHow} aria-label="Como encontrar">
      {lines?.item != null && <ItemIcon itemDexId={dexId(lines.item)} className={styles.findIcon} />}
      <div className={styles.findText}>
        <span className={styles.caption}>Como encontrar</span>
        {lines === null ? (
          <p className={styles.muted}>Sem dados de spawn no pacote do RCT.</p>
        ) : (
          <>
            <p>
              {lines.item !== null && (
                <>
                  <strong>Item de Assinatura: {itemLabel(lines.item)}</strong> num Gerador de Treinador
                </>
              )}
              {lines.item !== null && lines.biomes !== '' && ' · '}
              {lines.biomes !== '' && (lines.item === null ? `Aparece em: ${lines.biomes}` : lines.biomes)}
            </p>
            {lines.excluded !== '' && <p className={styles.muted}>Não aparece em: {lines.excluded}</p>}
          </>
        )}
      </div>
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
  const capRegionId = useId();
  const [capChoice, setCapChoice] = useState<boolean | null>(null);
  const capOpen = capChoice ?? (guide.mode === 'trainer' && levelCap === null);
  const capSource = levelCapInput.trim() !== '' ? 'informado por você' : progressLevelCap !== null ? 'lido do save' : 'desconhecido';
  const won = badgeEntries.filter((entry) => entry.state === 'vencido').length;
  const pikaCount = progressValue ? PIKA_REGIONS.filter(({id}) => progressValue.pikaStar[id] === true).length : 0;
  return (
    <section className={styles.player} aria-label="Treinador">
      <div className={styles.identity}>
        <span className={styles.faceRing}>
          <TrainerFace src={playerAvatar} label={name} size={60} />
        </span>
        <div className={styles.identityText}>
          <span className={styles.label}>Treinador</span>
          <strong className={styles.playerName}>{name}</strong>
        </div>
      </div>

      <div className={styles.visor}>
        <span className={styles.label}>Level cap</span>
        <span className={styles.capNumber}>{levelCap ?? '—'}</span>
        <button
          type="button"
          className={styles.capToggle}
          aria-expanded={capOpen}
          aria-controls={capRegionId}
          onClick={() => setCapChoice(!capOpen)}
        >
          {capSource} · editar ▾
        </button>
      </div>
      <div id={capRegionId} className={styles.capRegion} hidden={!capOpen}>
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
      </div>

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
          <h4 className={styles.label}>Insígnias</h4>
          <div className={styles.badgeRow}>
            {badgeEntries.slice(0, MAX_BADGES).map((entry) => {
              const defeated = entry.state === 'vencido';
              const type = LEADER_TYPES[entry.stage.name];
              const icon = type ? typeIconPath(type) : null;
              return (
                <span
                  key={entry.stage.stageId}
                  className={styles.disc}
                  role="img"
                  data-won={defeated ? 'true' : undefined}
                  style={{'--disc-color': type ? typeColorVar(type) : 'var(--color-highlight)'} as CSSProperties}
                  title={entry.stage.name}
                  aria-label={`${entry.stage.name}: ${defeated ? 'vencido' : 'não vencido'}`}
                >
                  {icon ? <img src={icon} alt="" decoding="async" /> : <PokeBallMark className={styles.discMark} />}
                </span>
              );
            })}
          </div>
          <span className={styles.caption}>
            {won} de {Math.min(badgeEntries.length, MAX_BADGES)} líderes · Vitórias na série: {totalVictories}
          </span>
        </div>
      )}

      {progress.status === 'ready' && (
        <div className={styles.pika}>
          <h4 className={styles.label}>Pika Star</h4>
          <div className={styles.starRow}>
            {PIKA_REGIONS.map(({id, label}) => {
              const value = progress.value.pikaStar[id];
              return (
                <span
                  key={id}
                  className={styles.star}
                  role="img"
                  data-status={pikaStatusKey(value)}
                  title={label}
                  aria-label={`${label}: ${pikaStarDisplayStatus(value)}`}
                />
              );
            })}
          </div>
          <span className={styles.caption}>{pikaCount} de 10 regiões</span>
        </div>
      )}
    </section>
  );
}

function OpponentRow({detail, onPick}: {detail: DetailEntry | undefined; onPick: ((index: number) => void) | null}) {
  if (detail === 'error') return <p className={styles.muted}>Não foi possível carregar o time do treinador.</p>;
  const loading = detail === undefined || detail === 'loading';
  return (
    <div className={styles.tiles} aria-busy={loading}>
      {SKELETON_TEAM.map((key, index) => {
        const member = loading ? undefined : detail.team[index];
        if (loading) return <span key={key} className={`${styles.oppTile} ${styles.skeletonLine}`} />;
        if (!member) return <span key={key} className={styles.oppTile} data-empty="true" />;
        const name = speciesDisplay(member.speciesId, 'normal').name;
        const art = <PokemonArtwork key={key} speciesId={member.speciesId} formId={member.formId} variant="slot" />;
        return onPick ? (
          <button
            key={key}
            type="button"
            className={`${styles.oppTile} ${styles.oppButton}`}
            title={name}
            aria-label={`Ver quem responde a ${name}`}
            onClick={() => onPick(index)}
          >
            {art}
          </button>
        ) : (
          <span key={key} className={styles.oppTile} title={name}>
            {art}
          </span>
        );
      })}
    </div>
  );
}

function YourRow({
  result,
  individuals,
  selectedUuid,
  onSelect,
}: {
  result: GuideResult;
  individuals: ReadonlyMap<string, PlayerIndividual>;
  selectedUuid: string | null;
  onSelect(uuid: string): void;
}) {
  const levelOf = new Map(result.team.map((member) => [member.uuid, member.level]));
  const slots = result.partyPlan.slots.slice(0, PARTY_SIZE);
  const nameOf = (uuid: string, speciesId: string) => speciesDisplay(speciesId, individuals.get(uuid)?.formId ?? 'normal').name;
  return (
    <ol className={styles.tiles} aria-label="Equipe recomendada">
      {slots.map((slot, index) => {
        const individual = individuals.get(slot.uuid);
        const formId = individual?.formId ?? 'normal';
        const display = speciesDisplay(slot.speciesId, formId);
        const tint = display.types[0] ? typeColorVar(display.types[0]) : 'var(--color-border)';
        return (
          <li
            key={slot.uuid}
            className={styles.mine}
            style={{'--tint': tint} as CSSProperties}
            data-change={slot.change}
            data-slot={index + 1}
            data-first={index === 0 ? 'true' : undefined}
            data-selected={slot.uuid === selectedUuid ? 'true' : undefined}
            title={index === 0 ? 'Abre a batalha' : undefined}
          >
            <button type="button" className={styles.mineCard} aria-pressed={slot.uuid === selectedUuid} onClick={() => onSelect(slot.uuid)}>
              <span className={styles.mineArt}>
                <PokemonArtwork speciesId={slot.speciesId} formId={formId} shiny={individual?.shiny === true} variant="collection" />
              </span>
              <strong className={styles.mineName}>{display.name}</strong>
              <small className={styles.mineLevel}>Nv. {levelOf.get(slot.uuid) ?? individual?.level ?? '—'}</small>
              <span className={styles.mineTypes}>
                {display.types.map((type) => {
                  const icon = typeIconPath(type);
                  return (
                    <i key={type} style={{'--c': typeColorVar(type)} as CSSProperties} title={typeLabel(type)}>
                      {icon && <img src={icon} alt="" width={10} height={10} decoding="async" />}
                    </i>
                  );
                })}
              </span>
            </button>
            <span className={styles.slotNo}>{index + 1}</span>
            {slot.change === 'entra' && slot.replaces && (
              <span
                className={styles.swap}
                role="img"
                title={`no lugar de ${nameOf(slot.replaces.uuid, slot.replaces.speciesId)}`}
                aria-label={`no lugar de ${nameOf(slot.replaces.uuid, slot.replaces.speciesId)}`}
              >
                ⇄
                <span className={styles.swapArt}>
                  <PokemonArtwork
                    speciesId={slot.replaces.speciesId}
                    formId={individuals.get(slot.replaces.uuid)?.formId ?? 'normal'}
                    variant="slot"
                  />
                </span>
              </span>
            )}
            {slot.change === 'muda de slot' && slot.fromSlot !== null && (
              <span className={styles.moved}>
                slot {slot.fromSlot + 1}→{index + 1}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function basisNote(plan: GuidePartyPlan): string | null {
  if (plan.basis === 'simulação' || !plan.basisReason) return null;
  return plan.basis === 'confronto'
    ? `A ordem usa o confronto com o primeiro adversário: ${plan.basisReason}`
    : `A ordem mantém a sua party: ${plan.basisReason}`;
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
  individuals,
  levelCapInput,
  onLevelCapInputChange,
  respectLevelCap,
  onRespectLevelCapChange,
  levelCap,
  progressLevelCap,
  onOpenCalculation,
}: TrainerCardProps) {
  const [view, setView] = useState<CardView>('campaign');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [seriesChoice, setSeriesChoice] = useState<string | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const stepsId = useId();

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
  // Treinador escolhido na busca livre (fora da campanha): o cartão mostra o time dele no lugar de uma etapa.
  const freeTrainer =
    !pveMode && guide.goalChosen && expandedStageId === null && trainerId !== null && selectedStage === null
      ? (guide.trainers.items.find((trainer) => trainer.id === trainerId) ?? null)
      : null;
  const heroId = freeTrainer?.id ?? heroVariant?.id ?? null;
  const details = useTrainerDetails(api, pveMode || heroId === null ? [] : [heroId]);

  const isNextHero = freeTrainer === null && heroStage !== null && heroStage.stageId === nextStageId;
  const heroLabel = isNextHero ? 'Próximo desafio' : 'Desafio escolhido';
  const isCurrentGoal =
    freeTrainer !== null || (heroEntry !== null && trainerId !== null && trainerId === goalTrainerId(heroEntry, trainerId));

  const result = guide.result;
  const heroResult =
    result !== null && heroId !== null && result.goal.kind === 'trainer' && result.goal.trainerId === heroId ? result : null;
  const pveResult = pveMode && result !== null && result.goal.kind === 'pve' ? result : null;
  const activeResult = pveMode ? pveResult : heroResult;
  const plan = activeResult?.partyPlan ?? null;
  const steps = plan
    ? guidePartySteps(plan, (uuid, speciesId) => speciesDisplay(speciesId, individuals.get(uuid)?.formId ?? 'normal').name)
    : [];
  const entering = plan ? plan.slots.filter((slot) => slot.change === 'entra').length : 0;
  const note = plan ? basisNote(plan) : null;
  const activeUuid = plan
    ? plan.slots.slice(0, PARTY_SIZE).some((slot) => slot.uuid === selectedUuid)
      ? selectedUuid
      : (plan.slots[0]?.uuid ?? null)
    : null;
  const selectedMember = activeResult?.team.find((member) => member.uuid === activeUuid) ?? null;

  function pickOpponent(index: number) {
    const opponent = heroResult?.opponents.find((entry) => entry.id.endsWith(`#${index}`));
    const uuid = heroResult && opponent ? guideBestAnswerUuid(heroResult.team, opponent.id) : null;
    if (uuid !== null) setSelectedUuid(uuid);
  }

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
  const heroDetail = heroId ? details.get(heroId) : undefined;
  const selectedKey = freeTrainer ? null : (heroStage?.stageId ?? null);

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
  const buildId = heroEntry ? goalTrainerId(heroEntry, null) : null;
  const palette = heroStage ? heroPalette(heroStage.name, heroStage.type) : null;
  const heroType = heroStage ? LEADER_TYPES[heroStage.name] : undefined;
  const heroIcon = heroType ? typeIconPath(heroType) : null;

  const lineup = (
    <div className={styles.vs}>
      {!pveMode && (
        <>
          <div className={styles.line}>
            <span className={styles.label}>Ele</span>
            <OpponentRow detail={heroDetail} onPick={heroResult ? pickOpponent : null} />
          </div>
          <div className={styles.divider} aria-hidden="true">
            VS
          </div>
        </>
      )}
      <div className={styles.line}>
        <span className={styles.label}>Você</span>
        {activeResult ? (
          <YourRow result={activeResult} individuals={individuals} selectedUuid={activeUuid} onSelect={setSelectedUuid} />
        ) : guide.phase === 'building' ? (
          <div className={styles.tiles} aria-busy="true">
            {SKELETON_TEAM.map((key) => (
              <span key={key} className={`${styles.mineSkeleton} ${styles.skeletonLine}`} />
            ))}
          </div>
        ) : (
          <p className={styles.muted}>
            {pveMode ? 'Monte o time para ver a sua equipe aqui.' : 'Monte o time para este desafio para ver a sua equipe aqui.'}
          </p>
        )}
      </div>
      {activeResult && (
        <div className={styles.key}>
          <span>
            <i className={styles.keyFirst}>1</i> abre a batalha
          </span>
          {entering > 0 && (
            <span>
              <i className={styles.keySwap}>⇄</i> no lugar de quem sai da party
            </span>
          )}
        </div>
      )}
      {note && <p className={styles.muted}>{note}</p>}
    </div>
  );

  const panel =
    activeResult && selectedMember ? (
      <TeamDetail
        member={selectedMember}
        slot={plan?.slots.find((slot) => slot.uuid === selectedMember.uuid)}
        individual={individuals.get(selectedMember.uuid)}
        result={activeResult}
        onOpenCalculation={onOpenCalculation}
      />
    ) : null;

  const isCurrent = pveMode || isCurrentGoal;
  const footer = (
    <div className={styles.footer}>
      <div className={styles.footerInfo}>
        {isCurrent && <span className={styles.goalChip}>Objetivo atual</span>}
        {plan && (
          <div className={styles.summary}>
            <strong>
              {steps.length === 0 ? 'Sua party já está como o guia recomenda' : `${entering} entram · ${plan.toPc.length} saem da party`}
            </strong>
            {steps.length > 0 && (
              <button
                type="button"
                className={styles.stepsToggle}
                aria-expanded={stepsOpen}
                aria-controls={stepsId}
                onClick={() => setStepsOpen((value) => !value)}
              >
                Como arrumar a party ▾
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.footerAction}>
        {!pveMode && heroEntry?.disabledReason != null ? (
          <p className={styles.muted}>{heroEntry.disabledReason}</p>
        ) : isCurrent ? (
          guide.phase === 'building' ? (
            <Button variant="secondary" onPress={guide.cancel}>
              Cancelar
            </Button>
          ) : (
            <Button variant="secondary" onPress={guide.rebuild}>
              Montar de novo
            </Button>
          )
        ) : (
          <>
            {buildId === null && <span className={styles.muted}>Escolha a equipe acima.</span>}
            <Button variant="primary" isDisabled={buildId === null} onPress={() => buildId !== null && guide.selectTrainer(buildId)}>
              Montar time para este desafio
            </Button>
          </>
        )}
      </div>
      <div id={stepsId} className={styles.stepsRegion} hidden={!(stepsOpen && steps.length > 0)}>
        {stepsOpen && steps.length > 0 && (
          <ol aria-label="Como arrumar a party" className={styles.steps}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );

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

        <section
          className={styles.hero}
          aria-label={pveMode ? 'Objetivo PvE' : heroLabel}
          style={{'--hero': pveMode || freeTrainer ? typeColorVar('Normal') : palette?.color} as CSSProperties}
        >
          {pveMode ? (
            <>
              <div className={styles.heroHeader}>
                <span className={styles.heroFace}>
                  <TrainerFace src={null} label="PvE geral" size={72} />
                </span>
                <div className={styles.heroTitle}>
                  <h3 className={styles.heroName}>PvE geral</h3>
                  {pveResult && <span className={styles.caption}>{pveResult.opponents.length} adversários de referência</span>}
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>Referência</dt>
                    <dd>{pveResult ? `nível ${pveResult.referenceLevel}` : '—'}</dd>
                  </div>
                </dl>
              </div>
              {lineup}
              {panel}
              {footer}
            </>
          ) : freeTrainer ? (
            <>
              <div className={styles.heroHeader}>
                <span className={styles.heroFace}>
                  <TrainerFace src={trainerPortraitPath(freeTrainer.id)} label={freeTrainer.name} size={72} />
                </span>
                <div className={styles.heroTitle}>
                  <h3 className={styles.heroName}>{freeTrainer.name}</h3>
                  <span className={styles.caption}>Fora da campanha</span>
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>Nível máx.</dt>
                    <dd>{freeTrainer.maxLevel}</dd>
                  </div>
                  <div>
                    <dt>Pokémon</dt>
                    <dd>{freeTrainer.teamSize}</dd>
                  </div>
                </dl>
              </div>
              <FindHow detail={heroDetail} />
              {lineup}
              {panel}
              {footer}
            </>
          ) : heroStage && heroEntry && heroVariant ? (
            <>
              <div className={styles.heroHeader}>
                <span className={styles.heroFace}>
                  <TrainerFace src={trainerPortraitPath(heroVariant.id)} label={heroStage.name} size={72} />
                </span>
                <div className={styles.heroTitle}>
                  <span className={styles.typeChip} style={{color: palette?.ink}}>
                    {heroIcon && <img className={styles.typeIcon} src={heroIcon} alt="" width={18} height={18} />}
                    {stageTypeLabel(heroStage.type)}
                  </span>
                  <h3 className={styles.heroName}>{heroStage.name}</h3>
                </div>
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
                    <dt>Requisitos</dt>
                    <dd>
                      {heroStage.requires.length > 0 ? heroStage.requires.map((id) => stageNames.get(id) ?? id).join(', ') : 'nenhum'}
                    </dd>
                  </div>
                </dl>
              </div>

              <FindHow detail={heroDetail} />

              {choosingVariant && (
                <div className={styles.variants} title={heroStage.ambiguousReason ?? undefined}>
                  <span>RCT sorteia a equipe:</span>
                  <div role="radiogroup" aria-label={`Equipe de ${heroStage.name}`} className={styles.pills}>
                    {singles.map((variant, index) => (
                      // biome-ignore lint/a11y/useSemanticElements: pílula compacta; o botão com role radio mantém o grupo de rádio
                      <button
                        key={variant.id}
                        type="button"
                        role="radio"
                        aria-checked={trainerId === variant.id}
                        aria-label={`Equipe ${VARIANT_LETTERS[index]}`}
                        className={styles.pill}
                        onClick={() => guide.selectTrainer(variant.id)}
                      >
                        {VARIANT_LETTERS[index]}
                      </button>
                    ))}
                  </div>
                  <span className={styles.muted}>vencer qualquer uma conta</span>
                </div>
              )}

              {lineup}
              {panel}

              {progressValue === null && nextGoal?.basis === 'nível' && <p className={styles.muted}>{nextGoal.reason}</p>}

              {footer}
            </>
          ) : (
            <p className={styles.muted}>Nenhuma etapa disponível nesta série.</p>
          )}
        </section>

        <div className={styles.side}>
          {showTrail ? (
            <>
              <h4 className={styles.label}>Trilha da campanha</h4>
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
                      <h4 className={styles.label}>Outros treinadores (fora da campanha)</h4>
                      <ul className={styles.freeList}>
                        {freeSearchResults.map((trainer) => (
                          <li key={trainer.id}>
                            <button
                              type="button"
                              className={styles.freeButton}
                              onClick={() => {
                                setExpandedStageId(null);
                                guide.selectTrainer(trainer.id);
                              }}
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
