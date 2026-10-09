import {useEffect, useId, useMemo, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {GuideNextGoal, GuideProgress, GuideResult, GuideTeamMember, PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {
  Button,
  Disclosure,
  ItemIcon,
  MoveChip,
  PokemonArtwork,
  PokeBallMark,
  SegmentedControl,
  StatusMessage,
  Switch,
  TypeBadge,
} from '../../ui';
import type {GuideProgressState} from './useGuideProgress';
import {
  guideCapExcluded,
  guideCapWarnings,
  guideComparisonRows,
  guideOpponentTurnsLabel,
  guideTeamChanges,
  type GuideMode,
} from './guide-model';
import type {GuideController} from './useGuide';
import type {BattlePlanController} from './useBattlePlan';
import {BattlePlanSection} from './BattlePlanSection';
import {EvolutionSection} from './EvolutionSection';
import type {EvolutionPlanController} from './useEvolutionPlan';
import {guideGapOpponentIds} from './capture-model';
import {CaptureSection} from './CaptureSection';
import type {CapturePlanController} from './useCapturePlan';
import {LevelCapField} from './LevelCapField';
import {TrainingSection} from './TrainingSection';
import type {TrainingPlanController} from './useTrainingPlan';
import {pikaStarDisplayStatus} from './progress-display-model';
import rawCampaign from '../../../data/guide/campaign.json';
import {CampaignPicker} from './CampaignPicker';
import type {Campaign} from './campaign-model';
import styles from './GuideWorkspace.module.css';

const CAMPAIGN = rawCampaign as unknown as Campaign;

const NOTICE_DURATION_MS = 4000;
const TEAM_SIZE = 6;
const MODE_OPTIONS: ReadonlyArray<{key: GuideMode; label: string}> = [
  {key: 'pve', label: 'PvE geral'},
  {key: 'trainer', label: 'Líder ou treinador'},
];

type GuideFocusTab = 'all' | 'team' | 'battle' | 'training' | 'captures';

const FOCUS_TABS: ReadonlyArray<{key: GuideFocusTab; label: string}> = [
  {key: 'all', label: 'Visão Geral'},
  {key: 'team', label: '1. Time'},
  {key: 'battle', label: '2. Batalha'},
  {key: 'training', label: '3. Treino & EVs'},
  {key: 'captures', label: '4. Capturas'},
];
const PROGRESS_REGIONS: ReadonlyArray<{id: keyof GuideProgress['pikaStar']; label: string}> = [
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

function StageDetails({stage, label}: {stage: NonNullable<GuideNextGoal['stage']>; label: string}) {
  return (
    <li className={styles.stageItem}>
      <div className={styles.stageItemHeader}>
        <strong>
          {label}: {stage.name}
        </strong>
      </div>
      {stage.capBefore !== null || stage.capAfter !== null ? (
        <p>
          Level cap da etapa: {stage.capBefore ?? 'desconhecido'} → {stage.capAfter ?? 'desconhecido'}.
        </p>
      ) : (
        stage.capUnknownReason && <p>{stage.capUnknownReason}</p>
      )}
      {stage.ambiguous && <p className={styles.stageAmbiguousNote}>Possui variações de equipe. Vencer qualquer uma avança a campanha.</p>}
    </li>
  );
}

function ProgressPanel({progress, nextGoal}: {progress: GuideProgressState; nextGoal: GuideNextGoal | null}) {
  if (progress.status === 'loading') {
    return (
      <section className={styles.progressPanel} aria-label="Progresso do mundo" aria-busy="true">
        <h3>Progresso do mundo</h3>
        <div className={styles.progressSkeleton} />
        <div className={styles.progressSkeleton} />
      </section>
    );
  }
  if (progress.status === 'error') {
    return (
      <StatusMessage tone="warning" title="Progresso do mundo indisponível">
        {progress.error}
      </StatusMessage>
    );
  }
  const value = progress.value;
  return (
    <section className={styles.progressPanel} aria-label="Progresso do mundo">
      <h3>Progresso do mundo</h3>
      <dl className={styles.progressFacts}>
        <div>
          <dt>Série atual</dt>
          <dd>{value.currentSeries || 'Nenhuma série selecionada'}</dd>
        </div>
        <div>
          <dt>Level cap padrão</dt>
          <dd>{value.levelCap === null ? 'Não verificado' : value.levelCap}</dd>
        </div>
        <div>
          <dt>Treinadores vencidos</dt>
          <dd>{value.defeated === null ? 'Não verificado' : value.defeated.length}</dd>
        </div>
      </dl>
      {nextGoal && (
        <div className={styles.progressNextGoal}>
          <strong>Próxima etapa</strong>
          <p>{nextGoal.reason}</p>
          {nextGoal.stage && (
            <ul className={styles.stageList}>
              <StageDetails stage={nextGoal.stage} label="Atual" />
              {(nextGoal.upcoming ?? []).map((stage) => (
                <StageDetails key={stage.stageId} stage={stage} label="Depois" />
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={styles.pikaStatus}>
        <strong>Pika Star por região</strong>
        <ul>
          {PROGRESS_REGIONS.map(({id, label}) => (
            <li key={id} data-status={value.pikaStar[id] === true ? 'verified' : value.pikaStar[id] === false ? 'not-achieved' : 'unknown'}>
              <span>{label}</span>
              <span>{pikaStarDisplayStatus(value.pikaStar[id])}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ITEM_STATUS_LABEL = {tem: 'já segura', obter: 'obter', nenhum: 'sem item'} as const;

export interface GuideWorkspaceProps {
  snapshot: PlayerSnapshot | null;
  guide: GuideController;
  /** Fase da leitura do save, para desabilitar o botão durante a atualização. */
  loading: boolean;
  onRefresh(): void;
  onOpenCalculation(uuid: string, move: GuideTeamMember['moves'][number]): void;
  battlePlan: BattlePlanController;
  evolutions: EvolutionPlanController;
  captures: CapturePlanController;
  training: TrainingPlanController;
  /** Level cap digitado (compartilhado por Evoluções e Treino); vazio usa o padrão do progresso quando disponível. */
  levelCapInput: string;
  onLevelCapInputChange(value: string): void;
  respectLevelCap: boolean;
  onRespectLevelCapChange(value: boolean): void;
  /** Cap efetivo já estabilizado (manual tem precedência sobre o padrão do progresso). */
  levelCap: number | null;
  progress: GuideProgressState;
  progressLevelCap: number | null;
}

type Lookup = {
  individuals: ReadonlyMap<string, PlayerIndividual>;
  opponents: ReadonlyMap<string, GuideResult['opponents'][number]>;
};

function individualName(lookup: Lookup, uuid: string): string {
  const individual = lookup.individuals.get(uuid);
  return individual ? speciesDisplay(individual.speciesId, individual.formId).name : 'Indivíduo não encontrado na captura';
}

function Toast({id, text, onDismiss}: {id: number; text: string; onDismiss(id: number): void}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss]);
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {text}
    </div>
  );
}

function MemberDetails({
  member,
  individual,
  lookup,
  onOpenCalculation,
}: {
  member: GuideTeamMember;
  individual: PlayerIndividual | undefined;
  lookup: Lookup;
  onOpenCalculation: GuideWorkspaceProps['onOpenCalculation'];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure headingLevel={4} title="Ver detalhes" isExpanded={expanded} onExpandedChange={setExpanded} className={styles.details}>
      <div className={styles.detailsBody}>
        <section aria-label="Confrontos">
          <h5 className={styles.detailsTitle}>Confrontos</h5>
          {member.matchups.length === 0 ? (
            <p className={styles.muted}>Sem confrontos calculados para este membro.</p>
          ) : (
            <ul className={styles.matchups}>
              {member.matchups.map((matchup) => {
                const opponent = lookup.opponents.get(matchup.opponentId);
                const label = opponent ? `${speciesDisplay(opponent.speciesId, 'normal').name} Nv. ${opponent.level}` : matchup.opponentId;
                return (
                  <li key={matchup.opponentId} data-outcome={matchup.outcome}>
                    <strong>{label}</strong> {guideOpponentTurnsLabel(matchup)}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section aria-label="Cálculo por golpe">
          <h5 className={styles.detailsTitle}>Cálculo por golpe</h5>
          <ul className={styles.calcList}>
            {member.moves.map((move) => (
              <li key={`${move.source}-${move.id}`}>
                <span>{moveDisplay(move.id).name}</span>
                <Button
                  variant="quiet"
                  className={styles.calcButton}
                  isDisabled={!move.evaluated || !individual}
                  onPress={() => onOpenCalculation(member.uuid, move)}
                >
                  Ver cálculo
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Disclosure>
  );
}

function MemberCard({
  member,
  index,
  individual,
  lookup,
  onOpenCalculation,
}: {
  member: GuideTeamMember;
  index: number;
  individual: PlayerIndividual | undefined;
  lookup: Lookup;
  onOpenCalculation: GuideWorkspaceProps['onOpenCalculation'];
}) {
  const species = speciesDisplay(member.speciesId, individual?.formId ?? 'normal');
  return (
    <li className={styles.card} style={{'--card-index': index} as CSSProperties} data-uuid={member.uuid}>
      <div className={styles.cardHeader}>
        <PokemonArtwork
          speciesId={member.speciesId}
          formId={individual?.formId ?? 'normal'}
          shiny={individual?.shiny === true}
          variant="collection"
        />
        <div className={styles.cardIdentity}>
          <h3 className={styles.cardName}>{species.name}</h3>
          <div className={styles.cardMeta}>
            <span>Nv. {member.level}</span>
            {species.types.map((type) => (
              <TypeBadge key={type} type={type} size="sm" />
            ))}
          </div>
        </div>
      </div>
      <p className={styles.reason}>{member.reason}</p>

      <ul className={styles.moves} aria-label={`Golpes de ${species.name}`}>
        {member.moves.map((move) => {
          const display = moveDisplay(move.id);
          return (
            <li key={`${move.source}-${move.id}`} data-evaluated={move.evaluated ? 'true' : 'false'}>
              <MoveChip name={display.name} type={display.type} category={display.category} variant="chip" />
              <span className={styles.moveNote}>
                {move.source}
                {!move.evaluated && ' · status, não avaliado'}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={styles.item}>
        <div className={styles.itemLine}>
          {member.item.id !== null && <ItemIcon itemDexId={dexId(member.item.id)} />}
          <span className={styles.itemName}>{member.item.id === null ? 'Sem item sugerido' : itemLabel(member.item.id)}</span>
          <span className={styles.itemBadge} data-status={member.item.status}>
            {ITEM_STATUS_LABEL[member.item.status]}
          </span>
        </div>
        <p className={styles.reason}>{member.item.reason}</p>
      </div>

      <MemberDetails member={member} individual={individual} lookup={lookup} onOpenCalculation={onOpenCalculation} />
    </li>
  );
}

function TeamSkeleton() {
  return (
    <section className={styles.skeleton} aria-busy="true" aria-label="Montando o time">
      {Array.from({length: TEAM_SIZE}, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: seis placeholders fixos e sem identidade
        <div key={index} className={styles.skeletonCard} style={{'--card-index': index} as CSSProperties} />
      ))}
    </section>
  );
}

function GuideResultView({
  result,
  snapshot,
  lookup,
  onOpenCalculation,
  previousResult,
  stale,
  battleSlot,
  trainingSlot,
  captureSlot,
  levelCap,
}: {
  result: GuideResult;
  previousResult: GuideResult | null;
  snapshot: PlayerSnapshot;
  lookup: Lookup;
  onOpenCalculation: GuideWorkspaceProps['onOpenCalculation'];
  stale: boolean;
  battleSlot: ReactNode;
  trainingSlot: ReactNode;
  captureSlot: ReactNode;
  levelCap: number | null;
}) {
  const [focusTab, setFocusTab] = useState<GuideFocusTab>('all');
  const [infoExpanded, setInfoExpanded] = useState(false);
  const comparison = guideComparisonRows(result.currentPartyComparison);
  const acquire = result.team
    .flatMap((member) => member.acquire.map((entry) => ({member, entry})))
    .sort((left, right) => right.entry.gainPercent - left.entry.gainPercent);
  const capExcluded = guideCapExcluded(result.excluded);
  const capWarnings = guideCapWarnings({goal: result.goal, team: result.team, individuals: snapshot.individuals, levelCap});
  const teamChanges = guideTeamChanges(previousResult, result);
  return (
    <div className={styles.result} data-stale={stale ? 'true' : undefined} aria-busy={stale}>
      <p className={styles.resultSummary}>
        Time de {result.team.length} contra {result.opponents.length} adversários de referência (nível {result.referenceLevel}).
      </p>

      {capExcluded.length > 0 && (
        <section className={styles.capExcluded} aria-label="Excluídos pelo level cap">
          <h3 className={styles.sectionTitle}>Fora do time pelo level cap</h3>
          <ul>
            {capExcluded.map((entry) => (
              <li key={entry.uuid}>
                <strong>{individualName(lookup, entry.uuid)}</strong>: {entry.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {capWarnings.length > 0 && (
        <section className={styles.capExcluded} aria-label="Acima do level cap" data-kind="warning">
          <h3 className={styles.sectionTitle}>Acima do level cap ({levelCap})</h3>
          <p className={styles.muted}>Qualquer Pokémon da party acima do cap impede a luta contra o treinador, mesmo fora do time.</p>
          <ul>
            {capWarnings.map((warning) => (
              <li key={warning.uuid}>
                <strong>{individualName(lookup, warning.uuid)}</strong>: {warning.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.focusTabs}>
        <SegmentedControl
          label="Foco da Análise"
          options={FOCUS_TABS}
          value={focusTab}
          onChange={(key) => setFocusTab(key as GuideFocusTab)}
        />
      </div>
      {(focusTab === 'all' || focusTab === 'team') && (
        <>
          <section className={styles.comparison} aria-label="Comparado à sua party">
            <h3 className={styles.sectionTitle}>Comparado à sua party</h3>
            {comparison.every((row) => row.uuids.length === 0) ? (
              <p className={styles.muted}>Nenhuma alteração em relação à sua party atual.</p>
            ) : (
              <div className={styles.comparisonChips}>
                {comparison.flatMap((row) =>
                  row.uuids.map((uuid) => (
                    <span key={`${row.key}-${uuid}`} className={styles.comparisonChip} data-kind={row.key}>
                      <span className={styles.chipBadge} data-kind={row.key}>
                        {row.key === 'added' ? 'Entra' : row.key === 'removed' ? 'Sai' : 'Fica'}
                      </span>
                      <span className={styles.chipName}>{individualName(lookup, uuid)}</span>
                    </span>
                  )),
                )}
              </div>
            )}
          </section>

          {teamChanges && (teamChanges.left.length > 0 || teamChanges.entered.length > 0) && (
            <StatusMessage tone="info" title="O time mudou desde a última montagem">
              <ul>
                {teamChanges.left.map((change) => (
                  <li key={`left-${change.uuid}`}>
                    Saiu {individualName(lookup, change.uuid)}: {change.reason}
                  </li>
                ))}
                {teamChanges.entered.map((uuid) => (
                  <li key={`entered-${uuid}`}>Entrou {individualName(lookup, uuid)}</li>
                ))}
              </ul>
            </StatusMessage>
          )}

          <ol className={styles.cards} aria-label="Time recomendado">
            {result.team.map((member, index) => (
              <MemberCard
                key={member.uuid}
                member={member}
                index={index}
                individual={lookup.individuals.get(member.uuid)}
                lookup={lookup}
                onOpenCalculation={onOpenCalculation}
              />
            ))}
          </ol>
          <section className={styles.acquire} aria-labelledby="guide-acquire-title">
            <h3 id="guide-acquire-title" className={styles.sectionTitle}>
              Vale adquirir
            </h3>
            {acquire.length === 0 ? (
              <p className={styles.muted}>Nenhum golpe a adquirir para este objetivo.</p>
            ) : (
              <ul className={styles.acquireList}>
                {acquire.map(({member, entry}) => (
                  <li key={`${member.uuid}-${entry.moveId}`}>
                    <strong>
                      {individualName(lookup, member.uuid)} · {moveDisplay(entry.moveId).name}
                    </strong>
                    <span className={styles.gain}>+{entry.gainPercent}%</span>
                    <span className={styles.muted}>{entry.requirement}</span>
                    <span>{entry.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Disclosure headingLevel={3} title="Exclusões, hipóteses e limites" isExpanded={infoExpanded} onExpandedChange={setInfoExpanded}>
            <div className={styles.infoBody}>
              <section aria-label="Excluídos">
                <h4 className={styles.detailsTitle}>Excluídos</h4>
                {result.excluded.length === 0 ? (
                  <p className={styles.muted}>Nenhum indivíduo foi excluído.</p>
                ) : (
                  <ul>
                    {result.excluded.map((entry) => (
                      <li key={entry.uuid}>
                        <strong>{individualName(lookup, entry.uuid)}</strong>: {entry.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Hipóteses">
                <h4 className={styles.detailsTitle}>Hipóteses</h4>
                <ul>
                  {result.assumptions.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>
              <section aria-label="Limites">
                <h4 className={styles.detailsTitle}>Limites</h4>
                <ul>
                  {result.limits.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>
              <p className={styles.muted}>Captura de {snapshot.worldName}.</p>
            </div>
          </Disclosure>
        </>
      )}

      {(focusTab === 'all' || focusTab === 'battle') && <div className={styles.tabSection}>{battleSlot}</div>}

      {(focusTab === 'all' || focusTab === 'training') && <div className={styles.tabSection}>{trainingSlot}</div>}

      {(focusTab === 'all' || focusTab === 'captures') && <div className={styles.tabSection}>{captureSlot}</div>}
    </div>
  );
}

export function GuideWorkspace({
  snapshot,
  guide,
  battlePlan,
  evolutions,
  captures,
  training,
  levelCapInput,
  onLevelCapInputChange,
  respectLevelCap,
  onRespectLevelCapChange,
  levelCap,
  progress,
  progressLevelCap,
  loading,
  onRefresh,
  onOpenCalculation,
}: GuideWorkspaceProps) {
  const headingId = useId();
  // Treinador e campanha gerenciados pelo CampaignPicker
  const lookup = useMemo<Lookup>(
    () => ({
      individuals: new Map((snapshot?.individuals ?? []).map((individual) => [individual.uuid, individual])),
      opponents: new Map((guide.result?.opponents ?? []).map((opponent) => [opponent.id, opponent])),
    }),
    [snapshot, guide.result],
  );
  const planIndividualName = (uuid: string, fallbackSpeciesId: string) => {
    const individual = lookup.individuals.get(uuid);
    return speciesDisplay(individual?.speciesId ?? fallbackSpeciesId, individual?.formId ?? 'normal').name;
  };
  const {trainerId, trainers, dismissNotice, notice} = guide;

  // Sincronização de busca movida para o CampaignPicker

  const building = guide.phase === 'building';

  return (
    <section className={styles.workspace} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <h2 id={headingId}>Guia</h2>
        <p className={styles.lead}>Um time de 6 montado com o que você já tem (equipe e PC) para o objetivo escolhido.</p>
      </header>

      {notice && <Toast key={notice.id} id={notice.id} text={notice.text} onDismiss={dismissNotice} />}
      <ProgressPanel progress={progress} nextGoal={guide.nextGoal?.status === 'ready' ? guide.nextGoal.value : null} />

      {!snapshot && loading ? (
        <TeamSkeleton />
      ) : !snapshot ? (
        <div className={styles.empty}>
          <PokeBallMark className={styles.emptyMark} />
          <p>Atualize do save para montar o time.</p>
          <Button variant="primary" isDisabled={loading} onPress={onRefresh}>
            {loading ? 'Atualizando…' : 'Atualizar do save'}
          </Button>
        </div>
      ) : (
        <>
          <section className={styles.goal} aria-label="Objetivo">
            {guide.nextGoal?.status === 'ready' && progress.status === 'error' && (
              <p className={styles.suggestion}>
                <strong>Próximo objetivo sugerido</strong>
                <span>{guide.nextGoal.value.reason}</span>
              </p>
            )}
            {guide.nextGoal?.status === 'failed' && <p className={styles.muted}>Sem sugestão de objetivo: {guide.nextGoal.error}</p>}

            <div className={styles.goalToolbar}>
              <SegmentedControl label="Objetivo do guia" options={MODE_OPTIONS} value={guide.mode} onChange={guide.selectMode} />
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
              <div className={styles.goalActions}>
                {building ? (
                  <Button variant="secondary" onPress={guide.cancel}>
                    Cancelar
                  </Button>
                ) : (
                  <Button variant="secondary" isDisabled={guide.goal === null} onPress={guide.rebuild}>
                    Montar de novo
                  </Button>
                )}
              </div>
            </div>

            {guide.mode === 'trainer' && (
              <div className={styles.campaignContainer}>
                <CampaignPicker
                  campaign={CAMPAIGN}
                  progress={progress.status === 'ready' ? progress.value : null}
                  selectedTrainerId={trainerId}
                  onSelect={(id) => guide.selectTrainer(id)}
                  allTrainers={trainers.status === 'ready' ? trainers.items : []}
                />
              </div>
            )}
            {guide.mode === 'trainer' && trainers.status === 'failed' && (
              <StatusMessage tone="warning" title="Lista de treinadores indisponível">
                {trainers.error}
              </StatusMessage>
            )}
            {building && <div className={styles.progress} role="progressbar" aria-label="Montando o time" />}
          </section>

          {guide.goal === null && <StatusMessage tone="info">Escolha um líder ou treinador para montar o time.</StatusMessage>}
          {guide.phase === 'error' && (
            <StatusMessage tone="error" title="O guia não foi montado">
              {guide.error}
            </StatusMessage>
          )}
          {guide.phase === 'canceled' && (
            <StatusMessage tone="info">Montagem cancelada. Use “Montar de novo” para tentar outra vez.</StatusMessage>
          )}

          {guide.result ? (
            <GuideResultView
              result={guide.result}
              previousResult={guide.previousResult}
              snapshot={snapshot}
              lookup={lookup}
              onOpenCalculation={onOpenCalculation}
              stale={building}
              levelCap={levelCap}
              battleSlot={
                building ? null : guide.result.goal.kind === 'trainer' ? (
                  <BattlePlanSection plan={battlePlan} individualName={planIndividualName} hasTeam={guide.result.team.length > 0} />
                ) : (
                  <StatusMessage tone="info">O plano de batalha detalhado é voltado para líderes e treinadores da campanha.</StatusMessage>
                )
              }
              trainingSlot={
                building ? null : (
                  <>
                    <TrainingSection training={training} hasTeam={guide.result.team.length > 0} />
                    <EvolutionSection evolutions={evolutions} hasTeam={guide.result.team.length > 0} />
                  </>
                )
              }
              captureSlot={building ? null : <CaptureSection captures={captures} gapCount={guideGapOpponentIds(guide.result).length} />}
            />
          ) : (
            building && <TeamSkeleton />
          )}
        </>
      )}
    </section>
  );
}
