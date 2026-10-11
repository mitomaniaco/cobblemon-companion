import {useEffect, useMemo, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {speciesDisplay} from '../../domain/dex';
import type {CompanionApi, GuideResult, GuideTeamMember, PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {Button, Disclosure, PokeBallMark, StatusMessage} from '../../ui';
import type {GuideProgressState} from './useGuideProgress';
import {guideCapExcluded, guideCapWarnings, guideTeamChanges, type GuideTab, type GuideToolStatus} from './guide-model';
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
import {guideToolStatuses} from './tool-status';
import {ToolFrame} from './ToolFrame';
import {TrainerCard} from './TrainerCard';
import type {Campaign} from './campaign-model';
import styles from './GuideWorkspace.module.css';

const CAMPAIGN = rawCampaign as unknown as Campaign;

const NOTICE_DURATION_MS = 4000;
const TEAM_SIZE = 6;

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
  stale,
  levelCap,
  guideTab,
  battlePlan,
  evolutions,
  training,
  captures,
}: {
  result: GuideResult;
  previousResult: GuideResult | null;
  snapshot: PlayerSnapshot;
  lookup: Lookup;
  stale: boolean;
  levelCap: number | null;
  guideTab: GuideTab;
  battlePlan: BattlePlanController;
  evolutions: EvolutionPlanController;
  training: TrainingPlanController;
  captures: CapturePlanController;
}) {
  const [infoExpanded, setInfoExpanded] = useState(false);
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
    </div>
  );
}

function Notes({assumptions, limits}: {assumptions: string[]; limits: string[]}) {
  return (
    <div className={styles.infoBody}>
      <section aria-label="Hipóteses do cálculo">
        <h4 className={styles.detailsTitle}>Hipóteses</h4>
        <ul>
          {assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>
      <section aria-label="Limites do cálculo">
        <h4 className={styles.detailsTitle}>Limites</h4>
        <ul>
          {limits.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Corpo da ferramenta ativa dentro do Trainer Card: a seção do cálculo na moldura comum. */
function buildToolBody({
  tool,
  status,
  planIndividualName,
  hasTeam,
  gapCount,
  battlePlan,
  evolutions,
  training,
  captures,
}: {
  tool: GuideTab;
  status: GuideToolStatus;
  planIndividualName(uuid: string, fallbackSpeciesId: string): string;
  hasTeam: boolean;
  gapCount: number;
  battlePlan: BattlePlanController;
  evolutions: EvolutionPlanController;
  training: TrainingPlanController;
  captures: CapturePlanController;
}): ReactNode {
  const chips = status.badge ? [{tone: status.badge.tone, text: status.subtitle}] : [];
  const frame = (
    title: string,
    controller: {phase: string; request(): void; result: {assumptions: string[]; limits: string[]} | null},
    section: ReactNode,
  ) => (
    <ToolFrame
      title={title}
      chips={chips}
      onRecalculate={controller.request}
      recalculating={controller.phase === 'building'}
      notes={controller.result ? <Notes assumptions={controller.result.assumptions} limits={controller.result.limits} /> : undefined}
    >
      {section}
    </ToolFrame>
  );
  switch (tool) {
    case 'battle':
      return frame(
        'Plano de batalha',
        battlePlan,
        <BattlePlanSection plan={battlePlan} individualName={planIndividualName} hasTeam={hasTeam} />,
      );
    case 'evolutions':
      return frame('Evoluções', evolutions, <EvolutionSection evolutions={evolutions} hasTeam={hasTeam} />);
    case 'training':
      return frame('Treino até o cap', training, <TrainingSection training={training} hasTeam={hasTeam} />);
    case 'captures':
      return frame('Capturas', captures, <CaptureSection captures={captures} gapCount={gapCount} />);
    case 'team':
      return null;
  }
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

  const result = guide.result;
  const hasTeam = (result?.team.length ?? 0) > 0;
  const gapCount = result ? guideGapOpponentIds(result).length : 0;
  const toolStatus = guideToolStatuses({result, evolutions: evolutions.result, training: training.result, levelCap});
  // Sem resultado, ou com a ferramenta bloqueada (ex.: plano de batalha no PvE), o cartão volta para a equipe.
  const activeTool: GuideTab = result === null || toolStatus[guideTab].disabledReason !== undefined ? 'team' : guideTab;
  const toolBody = result
    ? buildToolBody({
        tool: activeTool,
        status: toolStatus[activeTool],
        planIndividualName,
        hasTeam,
        gapCount,
        battlePlan,
        evolutions,
        training,
        captures,
      })
    : null;

  return (
    <section className={styles.workspace} aria-label="Guia">
      {notice && <Toast key={notice.id} id={notice.id} text={notice.text} onDismiss={dismissNotice} />}
      <div className={styles.stage}>
        <TrainerCard
          api={api}
          campaign={CAMPAIGN}
          progress={progress}
          nextGoal={guide.nextGoal?.status === 'ready' ? guide.nextGoal.value : null}
          guide={guide}
          playerName={playerName}
          playerAvatar={playerAvatar}
          individuals={lookup.individuals}
          onOpenCalculation={onOpenCalculation}
          levelCapInput={levelCapInput}
          onLevelCapInputChange={onLevelCapInputChange}
          respectLevelCap={respectLevelCap}
          onRespectLevelCapChange={onRespectLevelCapChange}
          levelCap={levelCap}
          progressLevelCap={progressLevelCap}
          tool={activeTool}
          onToolChange={onGuideTabChange}
          toolBody={toolBody}
          toolStatus={toolStatus}
        />
      </div>

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
              stale={building}
              levelCap={levelCap}
              guideTab={activeTool}
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
