import {useEffect, useId, useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {CompanionApi, GuidePartySlot, GuideResult, GuideTeamMember, PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {
  Button,
  Disclosure,
  ItemIcon,
  MoveChip,
  PokemonArtwork,
  PokeBallMark,
  StatusMessage,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TypeBadge,
} from '../../ui';
import type {GuideProgressState} from './useGuideProgress';
import {
  guideCapExcluded,
  guideCapWarnings,
  guideCurrentParty,
  guidePartySteps,
  guideOpponentTurnsLabel,
  guideTeamChanges,
  type GuideTab,
} from './guide-model';
import type {GuideController} from './useGuide';
import type {BattlePlanController} from './useBattlePlan';
import {BattlePlanSection} from './BattlePlanSection';
import {EvolutionSection} from './EvolutionSection';
import type {EvolutionPlanController} from './useEvolutionPlan';
import {guideGapOpponentIds} from './capture-model';
import {CaptureSection} from './CaptureSection';
import type {CapturePlanController} from './useCapturePlan';
import {TrainingSection} from './TrainingSection';
import type {TrainingPlanController} from './useTrainingPlan';
import rawCampaign from '../../../data/guide/campaign.json';
import {TrainerCard} from './TrainerCard';
import type {Campaign} from './campaign-model';
import styles from './GuideWorkspace.module.css';

const CAMPAIGN = rawCampaign as unknown as Campaign;

const NOTICE_DURATION_MS = 4000;
const TEAM_SIZE = 6;

const GUIDE_TABS: ReadonlyArray<{key: GuideTab; label: string}> = [
  {key: 'team', label: 'Time recomendado'},
  {key: 'battle', label: 'Plano de batalha'},
  {key: 'evolutions', label: 'Evoluções'},
  {key: 'training', label: 'Treino até o cap'},
  {key: 'captures', label: 'Capturas'},
];
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
  /** Aba ativa do resultado do guia; fica no app para sobreviver à ida ao Dano e à volta. */
  guideTab: GuideTab;
  onGuideTabChange(tab: GuideTab): void;
  api: () => CompanionApi;
  /** Nome da conta selecionada, já sem dados sensíveis; nulo sem conta. */
  playerName: string | null;
  /** Skin do jogador como data URL; nulo mostra a Poké Ball. */
  playerAvatar: string | null;
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
  slot,
  onOpenCalculation,
}: {
  member: GuideTeamMember;
  index: number;
  slot: GuidePartySlot | undefined;
  individual: PlayerIndividual | undefined;
  lookup: Lookup;
  onOpenCalculation: GuideWorkspaceProps['onOpenCalculation'];
}) {
  const species = speciesDisplay(member.speciesId, individual?.formId ?? 'normal');
  return (
    <li
      className={styles.card}
      style={{'--card-index': index} as CSSProperties}
      data-uuid={member.uuid}
      data-change={slot?.change}
      data-slot={index + 1}
    >
      <div className={styles.cardHeader}>
        <span
          className={styles.slotNumber}
          role="img"
          data-first={index === 0 ? 'true' : undefined}
          aria-label={`Slot ${index + 1}`}
          title={index === 0 ? 'Abre a batalha' : undefined}
        >
          {index + 1}
        </span>
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
          {slot?.role && <p className={styles.slotRole}>{slot.role}</p>}
        </div>
        {slot?.change === 'entra' && (
          <div className={styles.slotChange}>
            <strong className={styles.enterTag}>ENTRA</strong>
            {slot.replaces ? (
              <span className={styles.slotReplaces}>
                no lugar de {individualName(lookup, slot.replaces.uuid)}
                <span className={styles.replacesArt}>
                  <PokemonArtwork
                    speciesId={slot.replaces.speciesId}
                    formId={lookup.individuals.get(slot.replaces.uuid)?.formId ?? 'normal'}
                    variant="slot"
                  />
                </span>
              </span>
            ) : (
              <span className={styles.slotReplaces}>ocupa um espaço livre</span>
            )}
          </div>
        )}
        {slot?.change === 'muda de slot' && slot.fromSlot !== null && (
          <span className={styles.slotChip}>era o slot {slot.fromSlot + 1}</span>
        )}
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
  previousResult,
  snapshot,
  lookup,
  onOpenCalculation,
  stale,
  levelCap,
  guideTab,
  onGuideTabChange,
  planIndividualName,
  battlePlan,
  evolutions,
  training,
  captures,
}: {
  result: GuideResult;
  previousResult: GuideResult | null;
  snapshot: PlayerSnapshot;
  lookup: Lookup;
  onOpenCalculation: GuideWorkspaceProps['onOpenCalculation'];
  stale: boolean;
  levelCap: number | null;
  guideTab: GuideTab;
  onGuideTabChange(tab: GuideTab): void;
  planIndividualName(uuid: string, fallbackSpeciesId: string): string;
  battlePlan: BattlePlanController;
  evolutions: EvolutionPlanController;
  training: TrainingPlanController;
  captures: CapturePlanController;
}) {
  const [infoExpanded, setInfoExpanded] = useState(false);
  const currentParty = guideCurrentParty(snapshot.individuals);
  const leaving = new Set(result.partyPlan.toPc.map((entry) => entry.uuid));
  const partySteps = guidePartySteps(result.partyPlan, (uuid) => individualName(lookup, uuid));
  const slotOf = new Map(result.partyPlan.slots.map((slot) => [slot.uuid, slot]));
  const acquire = result.team
    .flatMap((member) => member.acquire.map((entry) => ({member, entry})))
    .sort((left, right) => right.entry.gainPercent - left.entry.gainPercent);
  const capExcluded = guideCapExcluded(result.excluded);
  const capWarnings = guideCapWarnings({goal: result.goal, team: result.team, individuals: snapshot.individuals, levelCap});
  const teamChanges = guideTeamChanges(previousResult, result);
  const hasTeam = result.team.length > 0;
  const gapCount = guideGapOpponentIds(result).length;

  // Cada ferramenta calcula ao abrir a aba, uma vez por resultado do guia (o controlador volta a `idle` quando o guia muda).
  const controller =
    guideTab === 'battle'
      ? battlePlan
      : guideTab === 'evolutions'
        ? evolutions
        : guideTab === 'training'
          ? training
          : guideTab === 'captures'
            ? captures
            : null;
  const hasInput = guideTab === 'battle' ? result.goal.kind === 'trainer' : guideTab === 'captures' ? gapCount > 0 : true;
  const shouldRequest = controller !== null && !stale && hasTeam && hasInput && controller.phase === 'idle';
  const request = controller?.request;
  useEffect(() => {
    if (shouldRequest && request) request();
  }, [shouldRequest, request]);

  return (
    <div className={styles.result} data-stale={stale ? 'true' : undefined} aria-busy={stale}>
      <p className={styles.resultSummary}>
        Time de {result.team.length} contra {result.opponents.length} adversários de referência (nível {result.referenceLevel}).
      </p>

      <Tabs selectedKey={guideTab} onSelectionChange={(key) => onGuideTabChange(key as GuideTab)}>
        <TabList aria-label="Ferramentas do guia">
          {GUIDE_TABS.map((tab) => (
            <Tab key={tab.key} id={tab.key}>
              {tab.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel id="team">
            <div className={styles.tabSection}>
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
                  <p className={styles.muted}>
                    Qualquer Pokémon da party acima do cap impede a luta contra o treinador, mesmo fora do time.
                  </p>
                  <ul>
                    {capWarnings.map((warning) => (
                      <li key={warning.uuid}>
                        <strong>{individualName(lookup, warning.uuid)}</strong>: {warning.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

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

              <section className={styles.todaySection} aria-label="Party de hoje">
                <div className={styles.todayRow}>
                  <span className={styles.todayLabel}>Hoje</span>
                  {currentParty.map((individual) => (
                    <span key={individual.uuid} data-leaving={leaving.has(individual.uuid) ? 'true' : undefined}>
                      <PokemonArtwork
                        speciesId={individual.speciesId}
                        formId={individual.formId}
                        shiny={individual.shiny === true}
                        variant="slot"
                      />
                    </span>
                  ))}
                </div>
              </section>

              <ol className={styles.cards} aria-label="Time recomendado">
                {result.team.map((member, index) => (
                  <MemberCard
                    key={member.uuid}
                    member={member}
                    index={index}
                    individual={lookup.individuals.get(member.uuid)}
                    lookup={lookup}
                    slot={slotOf.get(member.uuid)}
                    onOpenCalculation={onOpenCalculation}
                  />
                ))}
              </ol>

              {result.partyPlan.toPc.length > 0 && (
                <section className={styles.pcSection} aria-label="Fora do time recomendado">
                  <h3 className={styles.sectionTitle}>Guarde no PC</h3>
                  <div className={styles.pcChips}>
                    {result.partyPlan.toPc.map((entry) => (
                      <span key={entry.uuid} className={styles.pcChip}>
                        <PokemonArtwork
                          speciesId={entry.speciesId}
                          formId={lookup.individuals.get(entry.uuid)?.formId ?? 'normal'}
                          variant="slot"
                        />
                        {individualName(lookup, entry.uuid)}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <section className={styles.stepsSection}>
                <h3 className={styles.sectionTitle}>Como arrumar a party</h3>
                {partySteps.length === 0 ? (
                  <p>Sua party já está como o guia recomenda.</p>
                ) : (
                  <ol className={styles.steps} aria-label="Como arrumar a party">
                    {partySteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
              </section>

              {result.partyPlan.basis === 'party atual' && result.partyPlan.basisReason && (
                <p className={styles.muted}>A ordem não veio da simulação: {result.partyPlan.basisReason}</p>
              )}

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

              <Disclosure
                headingLevel={3}
                title="Exclusões, hipóteses e limites"
                isExpanded={infoExpanded}
                onExpandedChange={setInfoExpanded}
              >
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
            </div>
          </TabPanel>

          <TabPanel id="battle">
            <div className={styles.tabSection}>
              {result.goal.kind === 'trainer' ? (
                <BattlePlanSection plan={battlePlan} individualName={planIndividualName} hasTeam={hasTeam} />
              ) : (
                <StatusMessage tone="info">O plano de batalha é calculado contra um líder ou treinador.</StatusMessage>
              )}
            </div>
          </TabPanel>

          <TabPanel id="evolutions">
            <div className={styles.tabSection}>
              <EvolutionSection evolutions={evolutions} hasTeam={hasTeam} />
            </div>
          </TabPanel>

          <TabPanel id="training">
            <div className={styles.tabSection}>
              <TrainingSection training={training} hasTeam={hasTeam} />
            </div>
          </TabPanel>

          <TabPanel id="captures">
            <div className={styles.tabSection}>
              <CaptureSection captures={captures} gapCount={gapCount} />
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
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
  guideTab,
  onGuideTabChange,
  loading,
  api,
  playerName,
  playerAvatar,
  onRefresh,
  onOpenCalculation,
}: GuideWorkspaceProps) {
  const headingId = useId();
  // Treinador e campanha são gerenciados pelo TrainerCard
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
  const {dismissNotice, notice} = guide;

  const building = guide.phase === 'building';

  return (
    <section className={styles.workspace} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <h2 id={headingId}>Guia</h2>
        <p className={styles.lead}>Um time de 6 montado com o que você já tem (equipe e PC) para o objetivo escolhido.</p>
      </header>

      {notice && <Toast key={notice.id} id={notice.id} text={notice.text} onDismiss={dismissNotice} />}
      <TrainerCard
        api={api}
        campaign={CAMPAIGN}
        progress={progress}
        nextGoal={guide.nextGoal?.status === 'ready' ? guide.nextGoal.value : null}
        guide={guide}
        playerName={playerName}
        playerAvatar={playerAvatar}
        levelCapInput={levelCapInput}
        onLevelCapInputChange={onLevelCapInputChange}
        respectLevelCap={respectLevelCap}
        onRespectLevelCapChange={onRespectLevelCapChange}
        levelCap={levelCap}
        progressLevelCap={progressLevelCap}
      />

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
          {guide.mode === 'trainer' && guide.trainers.status === 'failed' && (
            <StatusMessage tone="warning" title="Lista de treinadores indisponível">
              {guide.trainers.error}
            </StatusMessage>
          )}
          {guide.nextGoal?.status === 'failed' && <p className={styles.muted}>Sem sugestão de objetivo: {guide.nextGoal.error}</p>}
          {building && <div className={styles.progress} role="progressbar" aria-label="Montando o time" />}

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
              guideTab={guideTab}
              onGuideTabChange={onGuideTabChange}
              planIndividualName={planIndividualName}
              battlePlan={battlePlan}
              evolutions={evolutions}
              training={training}
              captures={captures}
            />
          ) : (
            building && <TeamSkeleton />
          )}
        </>
      )}
    </section>
  );
}
