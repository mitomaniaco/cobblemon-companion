import {useId, useMemo, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {ListBox, ListBoxItem, type Key, type Selection} from 'react-aria-components';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
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
  TypeIcon,
  typeColorVar,
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
  stageVictoryCount,
  visibleSeriesIds,
  type Campaign,
  type StageEntry,
  stageTypeLabel,
} from './campaign-model';
import {
  guideAnswerRanking,
  guideBestAnswerUuid,
  guideOpponentTurnsLabel,
  guidePartySteps,
  guideTurnsShort,
  guideUnansweredOpponents,
} from './guide-model';
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
const SKELETON_MOVES = ['a', 'b', 'c', 'd'];
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
        <span className={`${styles.skeletonLine} ${styles.findSkeleton}`} />
      </div>
    );
  }
  const lines = spawnLines(detail.spawn);
  const text =
    lines === null
      ? 'Sem dados de spawn no pacote do RCT.'
      : lines.item !== null
        ? `Item de Assinatura: ${itemLabel(lines.item)} num Gerador de Treinador${lines.biomes !== '' ? ` · ${lines.biomes}` : ''}`
        : lines.biomes !== ''
          ? `Aparece em: ${lines.biomes}`
          : '';
  const title = lines !== null && lines.excluded !== '' ? `${text} · Não aparece em: ${lines.excluded}` : text;
  return (
    <section className={styles.findHow} aria-label="Como encontrar" title={title}>
      {lines?.item != null && <ItemIcon itemDexId={dexId(lines.item)} className={styles.findIcon} />}
      <p className={styles.findText}>{text}</p>
    </section>
  );
}

function BadgeDiscs({entries}: {entries: StageEntry[]}) {
  return (
    <>
      {entries.slice(0, MAX_BADGES).map((entry) => {
        const defeated = entry.state === 'vencido';
        const type = LEADER_TYPES[entry.stage.name];
        return (
          <span
            key={entry.stage.stageId}
            className={styles.disc}
            role="img"
            data-won={defeated ? 'true' : undefined}
            style={
              {
                '--disc-color': type ? typeColorVar(type) : 'var(--color-highlight)',
                '--disc-ink': type ? typeInkVar(type) : CHAMP_INK,
              } as CSSProperties
            }
            title={entry.stage.name}
            aria-label={`${entry.stage.name}: ${defeated ? 'vencido' : 'não vencido'}`}
          >
            {type ? <TypeIcon type={type} /> : <PokeBallMark className={styles.discMark} />}
          </span>
        );
      })}
    </>
  );
}

function PikaStars({progress}: {progress: GuideProgressState}) {
  if (progress.status !== 'ready') return null;
  return (
    <>
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
    </>
  );
}

function PlayerPanel({
  progress,
  badgeEntries,
  totalVictories,
  playerName,
  playerAvatar,
  levelCap,
  capSource,
  capOpen,
  capRegionId,
  onToggleCap,
  capRegion,
  pikaCount,
  campaignDone,
  campaignTotal,
}: {
  progress: GuideProgressState;
  badgeEntries: StageEntry[];
  totalVictories: number;
  playerName: string | null;
  playerAvatar: string | null;
  levelCap: number | null;
  capSource: string;
  capOpen: boolean;
  capRegionId: string;
  onToggleCap(): void;
  capRegion: ReactNode;
  pikaCount: number;
  campaignDone: number;
  campaignTotal: number;
}) {
  const name = playerName ?? 'Treinador';
  const shown = Math.min(badgeEntries.length, MAX_BADGES);
  const won = badgeEntries.filter((entry) => entry.state === 'vencido').length;
  return (
    <section className={styles.player} aria-label="Treinador">
      <div className={styles.identity}>
        <span className={styles.faceRing}>
          <TrainerFace src={playerAvatar} label={name} size={52} />
        </span>
        <div className={styles.identityText}>
          <span className={styles.label}>Treinador</span>
          <strong className={styles.playerName}>{name}</strong>
        </div>
      </div>

      <div className={styles.visor}>
        <span className={styles.label}>Level cap</span>
        <span className={styles.capNumber}>{levelCap ?? '—'}</span>
        <button type="button" className={styles.capToggle} aria-expanded={capOpen} aria-controls={capRegionId} onClick={onToggleCap}>
          {capSource} · editar ▾
        </button>
      </div>
      {capRegion}

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
        // biome-ignore lint/a11y/useSemanticElements: grupo só de leitura com rótulo, sem controles
        <div
          className={styles.badges}
          role="group"
          aria-label={`Insígnias: ${won} de ${shown} líderes · Vitórias na série: ${totalVictories}`}
        >
          <h4 className={styles.label}>Insígnias</h4>
          <div className={styles.badgeRow}>
            <BadgeDiscs entries={badgeEntries} />
          </div>
          <span className={styles.caption}>
            {won} de {shown} líderes · Vitórias na série: {totalVictories}
          </span>
        </div>
      )}

      {progress.status === 'ready' && (
        // biome-ignore lint/a11y/useSemanticElements: grupo só de leitura com rótulo, sem controles
        <div className={styles.campaignBar} role="group" aria-label="Progresso da campanha">
          <span className={styles.label}>Campanha</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{width: `${campaignTotal === 0 ? 0 : (campaignDone / campaignTotal) * 100}%`}} />
          </span>
          <span className={styles.caption}>
            {campaignDone} de {campaignTotal} etapas vencidas
          </span>
        </div>
      )}

      {progress.status === 'ready' && (
        // biome-ignore lint/a11y/useSemanticElements: grupo só de leitura com rótulo, sem controles
        <div className={styles.pika} role="group" aria-label={`Pika Star: ${pikaCount} de 10 regiões`}>
          <h4 className={styles.label}>Pika Star</h4>
          <div className={styles.starRow}>
            <PikaStars progress={progress} />
          </div>
          <span className={styles.caption}>{pikaCount} de 10 regiões</span>
        </div>
      )}
    </section>
  );
}

function YourTeam({
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
    <ol className={styles.team} aria-label="Equipe recomendada">
      {slots.map((slot, index) => {
        const individual = individuals.get(slot.uuid);
        const formId = individual?.formId ?? 'normal';
        const display = speciesDisplay(slot.speciesId, formId);
        const tint = display.types[0] ? typeColorVar(display.types[0]) : 'var(--color-border)';
        const replaced = slot.change === 'entra' && slot.replaces ? nameOf(slot.replaces.uuid, slot.replaces.speciesId) : null;
        const moved = slot.change === 'muda de slot' && slot.fromSlot !== null;
        return (
          <li
            key={slot.uuid}
            className={styles.mine}
            style={{'--tint': tint} as CSSProperties}
            data-change={slot.change}
            data-slot={index + 1}
            data-first={index === 0 ? 'true' : undefined}
            data-selected={slot.uuid === selectedUuid ? 'true' : undefined}
            data-chip={replaced !== null || moved ? 'true' : undefined}
            title={index === 0 ? 'Abre a batalha' : undefined}
          >
            <button type="button" className={styles.mineCard} aria-pressed={slot.uuid === selectedUuid} onClick={() => onSelect(slot.uuid)}>
              <span className={styles.mineArt}>
                <PokemonArtwork speciesId={slot.speciesId} formId={formId} shiny={individual?.shiny === true} variant="collection" />
              </span>
              <span className={styles.mineText}>
                <strong className={styles.mineName}>{display.name}</strong>
                <small className={styles.mineLevel}>Nv. {levelOf.get(slot.uuid) ?? individual?.level ?? '—'}</small>
                <span className={styles.mineTypes}>
                  {display.types.map((type) => (
                    <i key={type} style={{'--c': typeColorVar(type), color: typeInkVar(type)} as CSSProperties} title={typeLabel(type)}>
                      <TypeIcon type={type} />
                    </i>
                  ))}
                </span>
              </span>
            </button>
            <span className={styles.slotNo}>{index + 1}</span>
            {replaced !== null && (
              <span className={styles.swap} role="img" title={`no lugar de ${replaced}`} aria-label={`no lugar de ${replaced}`}>
                ⇄ {replaced}
              </span>
            )}
            {moved && (
              <span className={styles.moved}>
                slot {(slot.fromSlot ?? 0) + 1}→{index + 1}
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

function Answers({
  detail,
  result,
  member,
  individuals,
  onPick,
}: {
  detail: DetailEntry | undefined;
  result: GuideResult | null;
  member: GuideTeamMember | null;
  individuals: ReadonlyMap<string, PlayerIndividual>;
  onPick(index: number): void;
}) {
  const team = detail === undefined || detail === 'loading' || detail === 'error' ? null : detail.team;
  const nameOf = (uuid: string, speciesId: string) => speciesDisplay(speciesId, individuals.get(uuid)?.formId ?? 'normal').name;
  const selectedName = member ? nameOf(member.uuid, member.speciesId) : null;
  const unanswered = new Set(result ? guideUnansweredOpponents(result.team, result.opponents).map((opponent) => opponent.id) : []);
  return (
    <section className={styles.answers} aria-label="Quem responde a cada um">
      <div className={styles.answersHead}>
        <h4 className={styles.label}>Quem responde a cada um</h4>
        {selectedName !== null && <span className={styles.caption}>({selectedName} em destaque)</span>}
      </div>
      {detail === 'error' ? (
        <p className={styles.muted}>Não foi possível carregar o time do treinador.</p>
      ) : team === null ? (
        <ul className={styles.answerList} aria-busy="true">
          {SKELETON_TEAM.map((key) => (
            <li key={key} className={styles.answerItem}>
              <span className={`${styles.answerRow} ${styles.skeletonLine}`} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.answerList}>
          {team.map((entry, index) => {
            const opponent = result?.opponents.find((candidate) => candidate.id.endsWith(`#${index}`));
            const name = speciesDisplay(entry.speciesId, entry.formId).name;
            const matchup = opponent && member ? member.matchups.find((candidate) => candidate.opponentId === opponent.id) : undefined;
            const ranking = result && opponent ? guideAnswerRanking(result.team, opponent.id).slice(0, 2) : [];
            const rowProps = {
              className: styles.answerRow,
              'data-outcome': matchup?.outcome,
              'data-unanswered': opponent && unanswered.has(opponent.id) ? 'true' : undefined,
            };
            const content = (
              <>
                <span className={styles.answerArt}>
                  <PokemonArtwork speciesId={entry.speciesId} formId={entry.formId} variant="slot" />
                </span>
                <span className={styles.answerName}>
                  <span className={styles.answerTitle}>
                    <strong>{name}</strong>
                    <small>Nv. {entry.level}</small>
                  </span>
                  {matchup && (
                    <span className={styles.answerCaption} title={guideOpponentTurnsLabel(matchup)}>
                      {matchup.outcome === 'vence' && matchup.moveId !== null
                        ? `${moveDisplay(matchup.moveId).name} · ${guideTurnsShort(matchup)}`
                        : guideTurnsShort(matchup)}
                    </span>
                  )}
                </span>
                {rowProps['data-unanswered'] && <span className={styles.noAnswer}>sem resposta boa</span>}
                <span className={styles.bubbles}>
                  {ranking.map((rank, rankIndex) => {
                    const answerer = result?.team.find((candidate) => candidate.uuid === rank.uuid);
                    if (!result || !answerer) return null;
                    const slotNo = result.partyPlan.slots.findIndex((slot) => slot.uuid === rank.uuid) + 1;
                    const answererName = nameOf(answerer.uuid, answerer.speciesId);
                    return (
                      <span
                        key={rank.uuid}
                        className={styles.bubble}
                        role="img"
                        title={answererName}
                        aria-label={`Slot ${slotNo}: ${answererName}`}
                        data-best={rankIndex === 0 && rank.outcome === 'vence' ? 'true' : undefined}
                      >
                        <PokemonArtwork
                          speciesId={answerer.speciesId}
                          formId={individuals.get(answerer.uuid)?.formId ?? 'normal'}
                          variant="slot"
                        />
                        {slotNo > 0 && <span className={styles.bubbleNo}>{slotNo}</span>}
                      </span>
                    );
                  })}
                </span>
                {matchup && <span className={styles.verdict}>{matchup.outcome}</span>}
              </>
            );
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: o time do treinador pode repetir espécie; a posição identifica o adversário
              <li key={`${entry.speciesId}-${index}`} className={styles.answerItem}>
                {result ? (
                  <button type="button" {...rowProps} aria-label={`Ver quem responde a ${name}`} onClick={() => onPick(index)}>
                    {content}
                  </button>
                ) : (
                  <div {...rowProps}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.muted}>Estimativa 1 contra 1, HP cheio, sem status nem crítico: a IA do RCT pode trocar em outra ordem.</p>
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
      layout="stack"
      orientation="horizontal"
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
            {first && <TrainerFace src={trainerPortraitPath(first.id)} label={stage.name} size={22} />}
            <span className={styles.trailTitle}>{stage.name}</span>
            {hasCap && (
              <span className={styles.trailCap}>
                {stage.capBefore}→{stage.capAfter}
              </span>
            )}
            {entry.victoryCount > 0 && <span className={styles.wins}>{entry.victoryCount}×</span>}
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
  const [capChoice, setCapChoice] = useState<boolean | null>(null);
  const stepsId = useId();
  const capRegionId = useId();

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
  const badgesShown = Math.min(badgeEntries.length, MAX_BADGES);
  const badgesWon = badgeEntries.filter((entry) => entry.state === 'vencido').length;
  const totalVictories = series.stages.reduce((sum, stage) => sum + stageVictoryCount(stage, victoryCounts), 0);
  const campaignDone = allEntries.filter((entry) => entry.state === 'vencido').length;
  const pikaCount = progressValue ? PIKA_REGIONS.filter(({id}) => progressValue.pikaStar[id] === true).length : 0;
  const heroDetail = heroId ? details.get(heroId) : undefined;
  const selectedKey = freeTrainer ? null : (heroStage?.stageId ?? null);

  const capOpen = capChoice ?? (guide.mode === 'trainer' && levelCap === null);
  const capSource = levelCapInput.trim() !== '' ? 'informado por você' : progressLevelCap !== null ? 'lido do save' : 'desconhecido';
  const capRegion = (
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
  );

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
    setView('campaign');
  }

  function changeView(key: 'campaign' | 'search' | 'pve') {
    if (key === 'pve') {
      guide.selectMode('pve');
      return;
    }
    setView(key);
    if (pveMode) guide.selectMode('trainer');
  }

  const searchEmpty = searchEntries.length === 0 && freeSearchResults.length === 0;
  const buildId = heroEntry ? goalTrainerId(heroEntry, null) : null;
  const palette = heroStage ? heroPalette(heroStage.name, heroStage.type) : null;
  const heroType = heroStage ? LEADER_TYPES[heroStage.name] : undefined;
  const building = guide.phase === 'building';

  const teamCol = (
    <div className={styles.col} data-col="team">
      <h4 className={styles.label}>Sua equipe</h4>
      {activeResult ? (
        <YourTeam result={activeResult} individuals={individuals} selectedUuid={activeUuid} onSelect={setSelectedUuid} />
      ) : building ? (
        <ul className={styles.team} aria-busy="true">
          {SKELETON_TEAM.map((key) => (
            <li key={key} className={styles.mine}>
              <span className={`${styles.mineCard} ${styles.skeletonLine}`} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.team} aria-hidden="true">
          {SKELETON_TEAM.map((key) => (
            <li key={key} className={styles.mine}>
              <span className={`${styles.mineCard} ${styles.mineEmpty}`} />
            </li>
          ))}
        </ul>
      )}
      {activeResult && (
        <div className={styles.key}>
          <span>
            <i className={styles.keyFirst}>1</i> abre
          </span>
          {entering > 0 && (
            <span>
              <i className={styles.keySwap}>⇄</i> no lugar de quem sai
            </span>
          )}
        </div>
      )}
      {note && <p className={styles.muted}>{note}</p>}
    </div>
  );

  const detailCol = (
    <div className={styles.col} data-col="detail">
      {activeResult && selectedMember ? (
        <TeamDetail
          member={selectedMember}
          slot={plan?.slots.find((slot) => slot.uuid === selectedMember.uuid)}
          individual={individuals.get(selectedMember.uuid)}
          result={activeResult}
          onOpenCalculation={onOpenCalculation}
        />
      ) : building ? (
        <div className={styles.detailSkeleton} aria-busy="true">
          <span className={`${styles.skeletonBanner} ${styles.skeletonLine}`} />
          <div className={styles.skeletonMoves}>
            {SKELETON_MOVES.map((key) => (
              <span key={key} className={styles.skeletonLine} />
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.detailEmpty}>
          <PokeBallMark className={styles.emptyMark} />
          <p className={styles.muted}>
            {pveMode ? 'Monte o time para ver a sua equipe aqui.' : 'Monte o time para este desafio para ver a sua equipe aqui.'}
          </p>
        </div>
      )}
    </div>
  );

  const trainerHead = freeTrainer
    ? {
        face: trainerPortraitPath(freeTrainer.id),
        label: freeTrainer.name,
        name: freeTrainer.name,
        chip: null as ReactNode,
        sub: 'Fora da campanha',
        facts: [
          ['Nível máx.', String(freeTrainer.maxLevel)],
          ['Pokémon', String(freeTrainer.teamSize)],
        ],
      }
    : heroStage && heroVariant
      ? {
          face: trainerPortraitPath(heroVariant.id),
          label: heroStage.name,
          name: heroStage.name,
          chip: (
            <span className={styles.typeChip} style={{color: palette?.ink}}>
              {heroType && <TypeIcon type={heroType} />}
              {stageTypeLabel(heroStage.type)}
            </span>
          ),
          sub: null,
          facts: [
            [
              'Level cap',
              heroStage.capBefore != null && heroStage.capAfter != null
                ? `${heroStage.capBefore} → ${heroStage.capAfter}`
                : (heroStage.capUnknownReason ?? 'desconhecido'),
            ],
            ['Pokémon', String(heroVariant.teamSize)],
            ['Requisitos', heroStage.requires.length > 0 ? heroStage.requires.map((id) => stageNames.get(id) ?? id).join(', ') : 'nenhum'],
          ],
        }
      : null;

  const oppCol = trainerHead && (
    <div className={styles.col} data-col="opp">
      <div className={styles.oppHeader}>
        <span className={styles.heroFace}>
          <TrainerFace src={trainerHead.face} label={trainerHead.label} size={52} />
        </span>
        <div className={styles.heroTitle}>
          {trainerHead.chip}
          <h3 className={styles.heroName}>{trainerHead.name}</h3>
          {trainerHead.sub && <span className={styles.caption}>{trainerHead.sub}</span>}
        </div>
      </div>
      <dl className={styles.facts}>
        {trainerHead.facts.map(([term, value]) => (
          <div key={term} title={value}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <FindHow detail={heroDetail} />
      {!freeTrainer && heroStage && choosingVariant && (
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
      {progressValue === null && !freeTrainer && nextGoal?.basis === 'nível' && <p className={styles.muted}>{nextGoal.reason}</p>}
      <Answers detail={heroDetail} result={heroResult} member={selectedMember} individuals={individuals} onPick={pickOpponent} />
    </div>
  );

  const isCurrent = pveMode || isCurrentGoal;
  const footer = (
    <div className={styles.footer}>
      <div className={styles.footerInfo}>
        {isCurrent && <span className={styles.goalChip}>Objetivo atual</span>}
        {pveMode && pveResult && (
          <span className={styles.pveBadge}>
            <strong>PvE geral</strong>
            {pveResult.opponents.length} adversários de referência · nível {pveResult.referenceLevel}
          </span>
        )}
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

  const inCampaignView = !pveMode;
  const showTrail = view === 'campaign';

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
        {inCampaignView &&
          (progress.status === 'loading' ? (
            <span className={`${styles.pillSkeleton} ${styles.skeletonLine}`} aria-busy="true" />
          ) : (
            <section className={styles.pillBox} aria-label="Treinador" title={progress.status === 'error' ? progress.error : undefined}>
              <span className={styles.capCaption}>CAP</span>
              <button
                type="button"
                className={styles.capButton}
                aria-label={`Level cap ${levelCap ?? 'desconhecido'}, ${capSource} · editar`}
                title={`Level cap ${levelCap ?? 'desconhecido'}, ${capSource} · editar`}
                aria-expanded={capOpen}
                aria-controls={capRegionId}
                onClick={() => setCapChoice(!capOpen)}
              >
                {levelCap ?? '—'}
              </button>
              {/* biome-ignore lint/a11y/useSemanticElements: grupo só de leitura com rótulo, sem controles */}
              <div
                className={styles.pillBadges}
                role="group"
                aria-label={`Insígnias: ${badgesWon} de ${badgesShown} líderes · Vitórias na série: ${totalVictories}`}
              >
                <BadgeDiscs entries={badgeEntries} />
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: grupo só de leitura com rótulo, sem controles */}
              <div className={styles.pillPika} role="group" aria-label={`Pika Star: ${pikaCount} de 10 regiões`}>
                <span aria-hidden="true">★ {pikaCount}/10</span>
                <span className={styles.visuallyHidden}>
                  <PikaStars progress={progress} />
                </span>
              </div>
              {capRegion}
            </section>
          ))}
        <SegmentedControl
          className={styles.modes}
          label="Objetivo do guia"
          options={VIEW_OPTIONS}
          value={pveMode ? 'pve' : view}
          onChange={changeView}
        />
      </div>

      <div className={styles.strip} data-expanded={showTrail && showAll ? 'true' : undefined}>
        {pveMode ? (
          <p className={styles.muted}>
            PvE geral: o time é montado contra os treinadores da sua faixa de nível
            {pveResult ? ` (${pveResult.opponents.length} adversários de referência)` : ''}. Não há um desafio específico.
          </p>
        ) : showTrail ? (
          <>
            <div className={styles.trailWrap}>
              <Trail entries={trailVisible} selectedKey={selectedKey} onSelection={handleSelection} />
            </div>
            <Button variant="quiet" onPress={() => setShowAll((value) => !value)}>
              {showAll ? 'Mostrar menos' : `Mostrar todas as etapas (${series.stages.length})`}
            </Button>
          </>
        ) : (
          <>
            <SearchField label="Buscar treinador" value={query} onChange={setQuery} placeholder="Nome, tipo ou id do treinador…" />
            <div className={styles.trailWrap} data-panel="true">
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
                                setView('campaign');
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
            </div>
          </>
        )}
      </div>

      <section
        className={styles.hero}
        aria-label={pveMode ? 'Objetivo PvE' : heroLabel}
        style={{'--hero': pveMode || freeTrainer ? typeColorVar('Normal') : palette?.color} as CSSProperties}
      >
        {pveMode ? (
          <div className={styles.cols} data-mode="pve">
            <div className={styles.col} data-col="player">
              <PlayerPanel
                progress={progress}
                badgeEntries={badgeEntries}
                totalVictories={totalVictories}
                playerName={playerName}
                playerAvatar={playerAvatar}
                levelCap={levelCap}
                capSource={capSource}
                capOpen={capOpen}
                capRegionId={capRegionId}
                onToggleCap={() => setCapChoice(!capOpen)}
                capRegion={capRegion}
                pikaCount={pikaCount}
                campaignDone={campaignDone}
                campaignTotal={series.stages.length}
              />
            </div>
            {teamCol}
            {detailCol}
          </div>
        ) : oppCol ? (
          <div className={styles.cols} data-mode="campaign">
            {teamCol}
            {detailCol}
            {oppCol}
          </div>
        ) : (
          <p className={styles.muted}>Nenhuma etapa disponível nesta série.</p>
        )}
        {(pveMode || oppCol) && footer}
      </section>
    </section>
  );
}
