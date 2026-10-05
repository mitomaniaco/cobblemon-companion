import {lazy, Suspense, useCallback, useEffect, useRef, useState} from 'react';
import {Archive, ArrowClockwise, Compass, Flask, Info, Lifebuoy, LockSimple, Sword, UsersThree} from '@phosphor-icons/react';
import {DemoWorkspace} from '../features/demo/DemoWorkspace';
import {useDamagePlanner} from '../features/damage/controller';
import {CollectionWorkspace} from '../features/collection/CollectionWorkspace';
import {IndividualWorkspace} from '../features/individual/IndividualWorkspace';
import type {IndividualWorkspaceTab} from '../features/individual/IndividualWorkspace';
import {getCompanionApi, type GuideTeamMember, type PlayerSnapshot} from '../platform/api';
import {guideCalculationTarget} from '../features/guide/guide-model';
import {useGuide} from '../features/guide/useGuide';
import {useBattlePlan} from '../features/guide/useBattlePlan';
import {useEvolutionPlan} from '../features/guide/useEvolutionPlan';
import {useCapturePlan} from '../features/guide/useCapturePlan';
import {useTrainerSession} from './useTrainerSession';
import {Button, Dialog, PokeBallMark, StatusMessage, Switch} from '../ui';
import styles from './TrainerApp.module.css';

const DamageWorkspace = lazy(() => import('../features/damage/DamageWorkspace').then((module) => ({default: module.DamageWorkspace})));
const HelpWorkspace = lazy(() => import('./HelpWorkspace'));
const GuideWorkspace = lazy(() => import('../features/guide/GuideWorkspace').then((module) => ({default: module.GuideWorkspace})));

type Workspace = 'guide' | 'team' | 'pc' | 'help' | 'damage' | 'demo';
type CompactPanel = 'collection' | 'detail';
type FocusRequest = CompactPanel | 'help';

type CollectionView = 'team' | 'pc';

type CollectionState = {
  search: string;
  boxFilter: string | null;
};

const INITIAL_COLLECTION_STATE: Record<CollectionView, CollectionState> = {
  team: {search: '', boxFilter: null},
  pc: {search: '', boxFilter: null},
};

type NavigationItem = {
  id: Workspace;
  label: string;
  Icon: typeof UsersThree;
};

const PRIMARY_NAVIGATION: NavigationItem[] = [
  {id: 'guide', label: 'Guia', Icon: Compass},
  {id: 'team', label: 'Equipe', Icon: UsersThree},
  {id: 'pc', label: 'PC', Icon: Archive},
  {id: 'damage', label: 'Dano', Icon: Sword},
];

const SECONDARY_NAVIGATION: NavigationItem[] = [
  {id: 'demo', label: 'Demonstração', Icon: Flask},
  {id: 'help', label: 'Ajuda e diagnóstico', Icon: Lifebuoy},
];

const captureChipFormat = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});

function formatCaptureTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'}).format(timestamp) : value;
}

function formatCaptureChip(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? `Captura de ${captureChipFormat.format(timestamp)}` : value;
}

function workspaceTitle(workspace: Workspace) {
  if (workspace === 'guide') return 'Guia';
  if (workspace === 'team') return 'Equipe';
  if (workspace === 'pc') return 'PC';
  if (workspace === 'damage') return 'Planejador de dano';
  if (workspace === 'demo') return 'Demonstração offline';
  return 'Ajuda e diagnóstico';
}

function CaptureDetails({snapshot}: {snapshot: PlayerSnapshot}) {
  const warningCount = snapshot.warnings?.length;

  return (
    <div className={styles.captureDetails}>
      <dl className={styles.captureFacts}>
        <div>
          <dt>Capturada em</dt>
          <dd>{formatCaptureTime(snapshot.capturedAt)}</dd>
        </div>
        <div>
          <dt>Mundo</dt>
          <dd>{snapshot.worldName}</dd>
        </div>
        <div>
          <dt>Consistência</dt>
          <dd>Melhor esforço (best-effort)</dd>
        </div>
        <div>
          <dt>Avisos</dt>
          <dd>{warningCount === undefined ? 'Não capturados' : `${warningCount}`}</dd>
        </div>
      </dl>

      <section aria-labelledby="capture-sources-title">
        <h3 id="capture-sources-title" className={styles.detailsHeading}>
          Arquivos de origem
        </h3>
        {snapshot.sources.length === 0 ? (
          <p className={styles.detailsEmpty}>Nenhum arquivo de origem registrado.</p>
        ) : (
          <ul className={styles.sourceList}>
            {snapshot.sources.map((source) => (
              <li key={source.kind}>
                <span>{source.kind === 'party' ? 'Equipe' : 'PC'}</span>
                <span>Modificado em {formatCaptureTime(source.modifiedAt)}</span>
                <span className={styles.visuallyHidden}>SHA-256 do arquivo {source.kind === 'party' ? 'da equipe' : 'do PC'}</span>
                <code>{source.sha256}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="capture-warnings-title">
        <h3 id="capture-warnings-title" className={styles.detailsHeading}>
          Avisos completos
        </h3>
        {snapshot.warnings === undefined ? (
          <p className={styles.detailsEmpty}>Os avisos não foram capturados.</p>
        ) : snapshot.warnings.length === 0 ? (
          <p className={styles.detailsEmpty}>Nenhum aviso registrado.</p>
        ) : (
          <ul className={styles.warningList}>
            {snapshot.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NoSnapshotState({
  phase,
  error,
  onRefresh,
  onOpenHelp,
}: {
  phase: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  onRefresh(): void;
  onOpenHelp(): void;
}) {
  if (phase === 'loading') {
    return (
      <section className={styles.loadingState} aria-busy="true" aria-live="polite">
        <h2>Lendo o save…</h2>
        <div className={styles.loadingSlots} aria-hidden="true">
          {Array.from({length: 6}, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static loading skeleton with fixed count of 6, never reorders
            <div className={styles.loadingSlot} key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (phase === 'error') {
    return (
      <section className={styles.emptyWorkspace}>
        <StatusMessage tone="error" title="A leitura não foi concluída">
          {error || 'A ponte local não conseguiu ler a captura.'}
        </StatusMessage>
        <Button variant="primary" onPress={onRefresh}>
          Tentar novamente
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.emptyWorkspace}>
      <PokeBallMark className={styles.idleMark} />
      <h2>Nenhuma captura ainda</h2>
      <p>Leia a equipe e o PC do seu save. Nada é gravado no jogo.</p>
      <div className={styles.emptyActions}>
        <Button variant="primary" onPress={onRefresh}>
          Atualizar do save
        </Button>
        <Button variant="quiet" onPress={onOpenHelp}>
          Primeira vez? Abrir ajuda
        </Button>
      </div>
    </section>
  );
}

function RouteFallback({blocks}: {blocks: number}) {
  return (
    <div className={styles.routeFallback} aria-busy="true" aria-hidden="true">
      {Array.from({length: blocks}, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton with fixed count, never reorders
        <div className={styles.routeFallbackBlock} key={index} />
      ))}
    </div>
  );
}

function CaptureStatus({snapshot}: {snapshot: PlayerSnapshot | null}) {
  return <span className={styles.captureChip}>{snapshot ? formatCaptureChip(snapshot.capturedAt) : 'Sem captura'}</span>;
}

function NavigationGroup({items, workspace, onNavigate}: {items: NavigationItem[]; workspace: Workspace; onNavigate(id: Workspace): void}) {
  return items.map(({id, label, Icon}) => (
    <Button
      key={id}
      className={`${styles.navButton}${workspace === id ? ` ${styles.navButtonActive}` : ''}`}
      variant="quiet"
      aria-current={workspace === id ? 'page' : undefined}
      onPress={() => onNavigate(id)}
    >
      <Icon className={styles.navIcon} aria-hidden="true" weight={workspace === id ? 'fill' : 'regular'} />
      <span>{label}</span>
    </Button>
  ));
}

export function TrainerApp() {
  const api = useCallback(() => getCompanionApi(), []);
  const session = useTrainerSession(api);
  const [workspace, setWorkspace] = useState<Workspace>('guide');
  const [damageReturnWorkspace, setDamageReturnWorkspace] = useState<Exclude<Workspace, 'damage'>>('team');
  const [detailTab, setDetailTab] = useState<IndividualWorkspaceTab>('summary');
  const [compactPanel, setCompactPanel] = useState<CompactPanel>('collection');
  const [collectionStates, setCollectionStates] = useState(INITIAL_COLLECTION_STATE);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [isWideLayout, setIsWideLayout] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [isCaptureDialogOpen, setIsCaptureDialogOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pendingCalculation, setPendingCalculation] = useState<{uuid: string; candidateMoveId?: string; slotIndex?: number} | null>(null);
  const pushedSnapshotRef = useRef<(snapshot: PlayerSnapshot) => void>(() => undefined);
  const previousSelectionRef = useRef<string | null>(session.selectedUuid);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const update = () => setIsWideLayout(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (session.phase !== 'loaded' || !session.snapshot) return;
    const validBoxes = new Set(
      session.snapshot.individuals.flatMap((individual) =>
        individual.location.container === 'pc' ? [String(individual.location.box)] : [],
      ),
    );
    setCollectionStates((current) => {
      if (current.pc.boxFilter === null || validBoxes.has(current.pc.boxFilter)) return current;
      return {...current, pc: {...current.pc, boxFilter: null}};
    });
  }, [session.phase, session.snapshot]);

  useEffect(() => {
    if (previousSelectionRef.current === session.selectedUuid) return;
    previousSelectionRef.current = session.selectedUuid;
    setDetailTab('summary');
  }, [session.selectedUuid]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencies are intentional triggers for focus management on layout/workspace changes
  useEffect(() => {
    if (!focusRequest) return;
    const panel =
      focusRequest === 'help'
        ? document.querySelector<HTMLElement>('[aria-labelledby="help-title"]')
        : focusRequest === 'collection'
          ? document.querySelector<HTMLElement>('[data-testid="collection"]')
          : document.querySelector<HTMLElement>('[data-testid="individual-details"]');
    const selectedItem =
      focusRequest === 'collection' && session.selectedUuid !== null
        ? (Array.from(document.querySelectorAll<HTMLElement>('[data-individual-id]')).find(
            (element) => element.dataset.individualId === session.selectedUuid,
          ) ?? null)
        : null;
    const target =
      focusRequest === 'collection' ? (selectedItem ?? panel?.querySelector<HTMLElement>('h2')) : panel?.querySelector<HTMLElement>('h2');
    target?.focus({preventScroll: true});
    if (focusRequest === 'collection' && selectedItem) selectedItem.scrollIntoView({block: 'nearest'});
    setFocusRequest(null);
  }, [compactPanel, focusRequest, isWideLayout, session.selectedUuid, workspace]);

  const selectedIndividual = session.snapshot?.individuals.find((individual) => individual.uuid === session.selectedUuid) ?? null;
  const damageController = useDamagePlanner(api, selectedIndividual, session.snapshot, snapshotRevision);
  const guide = useGuide(api, session.snapshot, workspace === 'guide');
  const battlePlan = useBattlePlan(api, session.snapshot, guide.result);
  const evolutions = useEvolutionPlan(api, session.snapshot, guide.result);
  const captures = useCapturePlan(api, session.snapshot, guide.result);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = api().onSnapshotChanged((snapshot) => pushedSnapshotRef.current(snapshot));
    } catch {
      // Ponte sem monitoramento do save: a leitura manual continua disponível.
    }
    return unsubscribe;
  }, [api]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => api().setAutoRefresh(true))
      .catch(() => undefined);
  }, [api]);

  // O Dano só recebe golpe/slot depois que o indivíduo do guia virou o selecionado (a identidade do controlador muda junto).
  // biome-ignore lint/correctness/useExhaustiveDependencies: navigateToDamage lê o estado atual; o gatilho é a seleção concluir
  useEffect(() => {
    if (!pendingCalculation || session.selectedUuid !== pendingCalculation.uuid) return;
    setPendingCalculation(null);
    navigateToDamage(pendingCalculation.candidateMoveId, pendingCalculation.slotIndex);
  }, [pendingCalculation, session.selectedUuid]);
  const isCollectionWorkspace = workspace === 'team' || workspace === 'pc';
  const collectionView: CollectionView = workspace === 'pc' ? 'pc' : 'team';
  const title = workspaceTitle(workspace);
  const warningCount = session.snapshot?.warnings?.length ?? 0;

  async function refreshSnapshot() {
    damageController.invalidateCalculation();
    setSnapshotRevision((revision) => revision + 1);
    setCompactPanel('collection');
    setDetailTab('summary');
    await session.refresh();
  }

  pushedSnapshotRef.current = (snapshot: PlayerSnapshot) => {
    damageController.invalidateCalculation();
    setSnapshotRevision((revision) => revision + 1);
    session.applySnapshot(snapshot);
  };

  function changeAutoRefresh(enabled: boolean) {
    setAutoRefresh(enabled);
    void Promise.resolve()
      .then(() => api().setAutoRefresh(enabled))
      .then((response) => setAutoRefresh(response.enabled))
      .catch(() => setAutoRefresh(!enabled));
  }

  function openGuideCalculation(uuid: string, move: GuideTeamMember['moves'][number]) {
    const individual = session.snapshot?.individuals.find((candidate) => candidate.uuid === uuid);
    if (!individual) return;
    setDetailTab('summary');
    session.selectIndividual(uuid);
    setPendingCalculation({uuid, ...guideCalculationTarget(individual, move)});
  }

  function selectIndividual(uuid: string) {
    if (session.selectedUuid !== uuid) setDetailTab('summary');
    session.selectIndividual(uuid);
    setCompactPanel('detail');
    if (!isWideLayout) setFocusRequest('detail');
  }

  function returnToCollection() {
    setCompactPanel('collection');
    setFocusRequest('collection');
  }

  function navigateToDamage(candidateMoveId?: string, slotIndex?: number) {
    if (workspace !== 'damage') setDamageReturnWorkspace(workspace);
    if (candidateMoveId) damageController.selectCandidate(candidateMoveId);
    if (slotIndex !== undefined) damageController.selectSlot(slotIndex);
    setWorkspace('damage');
  }

  function navigateWorkspace(nextWorkspace: Workspace) {
    if (nextWorkspace === 'damage') {
      navigateToDamage();
      return;
    }
    setWorkspace(nextWorkspace);
  }

  function returnFromDamage() {
    setWorkspace(damageReturnWorkspace);
    setFocusRequest(
      damageReturnWorkspace === 'help'
        ? 'help'
        : damageReturnWorkspace === 'guide'
          ? null
          : compactPanel === 'detail'
            ? 'detail'
            : 'collection',
    );
  }

  const noSnapshot = session.snapshot === null;

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar} aria-label="Navegação principal">
        <div className={styles.brand}>
          <PokeBallMark className={styles.brandMark} variant="filled" />
          <div className={styles.brandText}>
            <span className={styles.brandName}>Companion</span>
            <span className={styles.brandDescription}>Central de treinador</span>
          </div>
        </div>
        <nav className={styles.navigation} aria-label="Vistas">
          <NavigationGroup items={PRIMARY_NAVIGATION} workspace={workspace} onNavigate={navigateWorkspace} />
          <div className={styles.navDivider} aria-hidden="true" />
          <NavigationGroup items={SECONDARY_NAVIGATION} workspace={workspace} onNavigate={navigateWorkspace} />
        </nav>
        <p className={styles.sidebarFooter}>
          <LockSimple aria-hidden="true" weight="bold" />
          <span>Somente leitura · nada é gravado no save</span>
        </p>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <h1 className={styles.visuallyHidden}>{title}</h1>
          {workspace !== 'demo' && (
            <>
              <CaptureStatus snapshot={session.snapshot} />
              <div className={styles.headerActions}>
                <Switch isSelected={autoRefresh} onChange={changeAutoRefresh}>
                  Atualizar automaticamente
                </Switch>
                {session.snapshot && (
                  <Button
                    className={styles.captureButton}
                    variant="secondary"
                    aria-label="Detalhes da captura"
                    onPress={() => setIsCaptureDialogOpen(true)}
                  >
                    <Info aria-hidden="true" weight="bold" />
                    <span aria-hidden="true">Captura</span>
                    {warningCount > 0 && (
                      <span className={styles.warningBadge} aria-hidden="true">
                        {warningCount}
                      </span>
                    )}
                  </Button>
                )}
                <Button
                  data-testid="refresh-snapshot"
                  className={styles.refreshButton}
                  variant="primary"
                  isDisabled={session.phase === 'loading'}
                  onPress={() => void refreshSnapshot()}
                >
                  <ArrowClockwise aria-hidden="true" weight="bold" />
                  <span>{session.phase === 'loading' ? 'Atualizando…' : 'Atualizar do save'}</span>
                </Button>
              </div>
            </>
          )}
        </header>

        <main className={styles.content}>
          {session.phase === 'loading' && !isCollectionWorkspace && workspace !== 'damage' && workspace !== 'demo' && (
            <StatusMessage tone="info" title="Leitura local em andamento">
              A captura anterior foi removida enquanto o Companion atualiza os dados.
            </StatusMessage>
          )}
          {session.phase === 'error' && !isCollectionWorkspace && workspace !== 'damage' && workspace !== 'demo' && (
            <StatusMessage className={styles.routeStatus} tone="error" title="A leitura não foi concluída">
              {session.error || 'A ponte local não conseguiu ler a captura.'}
            </StatusMessage>
          )}

          <div className={styles.demoRoute} hidden={workspace !== 'demo'}>
            <DemoWorkspace isActive={workspace === 'demo'} />
          </div>

          {workspace !== 'demo' &&
            (isCollectionWorkspace && noSnapshot ? (
              <NoSnapshotState
                phase={session.phase}
                error={session.error}
                onRefresh={() => void refreshSnapshot()}
                onOpenHelp={() => setWorkspace('help')}
              />
            ) : workspace === 'help' ? (
              <Suspense fallback={<RouteFallback blocks={3} />}>
                <HelpWorkspace onOpenDemo={() => setWorkspace('demo')} />
              </Suspense>
            ) : workspace === 'damage' ? (
              <Suspense fallback={<RouteFallback blocks={2} />}>
                <DamageWorkspace
                  individual={selectedIndividual}
                  snapshot={session.snapshot}
                  controller={damageController}
                  phase={session.phase}
                  error={session.error}
                  returnButtonLabel={
                    damageReturnWorkspace === 'team'
                      ? 'Voltar à equipe'
                      : damageReturnWorkspace === 'pc'
                        ? 'Voltar ao PC'
                        : damageReturnWorkspace === 'guide'
                          ? 'Voltar ao guia'
                          : 'Voltar à ajuda e diagnóstico'
                  }
                  onBack={returnFromDamage}
                  onRefresh={() => void refreshSnapshot()}
                />
              </Suspense>
            ) : workspace === 'guide' ? (
              <Suspense fallback={<RouteFallback blocks={3} />}>
                <GuideWorkspace
                  snapshot={session.snapshot}
                  guide={guide}
                  battlePlan={battlePlan}
                  evolutions={evolutions}
                  captures={captures}
                  loading={session.phase === 'loading'}
                  onRefresh={() => void refreshSnapshot()}
                  onOpenCalculation={openGuideCalculation}
                />
              </Suspense>
            ) : session.snapshot ? (
              <div className={styles.workspaceGrid} data-wide={isWideLayout ? 'true' : 'false'} data-panel={compactPanel}>
                <section className={styles.collectionPane} aria-label={collectionView === 'team' ? 'Equipe' : 'PC'}>
                  <CollectionWorkspace
                    snapshot={session.snapshot}
                    view={collectionView}
                    search={collectionStates[collectionView].search}
                    onSearchChange={(value) =>
                      setCollectionStates((current) => ({
                        ...current,
                        [collectionView]: {...current[collectionView], search: value},
                      }))
                    }
                    boxFilter={collectionStates.pc.boxFilter}
                    onBoxFilterChange={(value) =>
                      setCollectionStates((current) => ({
                        ...current,
                        pc: {...current.pc, boxFilter: value},
                      }))
                    }
                    selectedUuid={session.selectedUuid}
                    onSelect={selectIndividual}
                    onClearFilters={() =>
                      setCollectionStates((current) => ({
                        ...current,
                        [collectionView]: {search: '', boxFilter: null},
                      }))
                    }
                  />
                </section>

                <section className={styles.detailPane} aria-label="Ficha do indivíduo selecionado">
                  {selectedIndividual ? (
                    <IndividualWorkspace
                      individual={selectedIndividual}
                      snapshot={session.snapshot}
                      selectedTab={detailTab}
                      onTabChange={setDetailTab}
                      returnButtonLabel={collectionView === 'team' ? 'Voltar à equipe' : 'Voltar ao PC'}
                      showReturnButton={!isWideLayout}
                      onReturn={returnToCollection}
                      moveSwapPlan={session.moveSwapPlan}
                      onMoveSwapPlanChange={session.updateMoveSwap}
                      onOpenDamage={navigateToDamage}
                    />
                  ) : (
                    <div className={styles.emptyDetail}>
                      <PokeBallMark className={styles.emptyDetailMark} />
                      <p>Selecione um Pokémon</p>
                    </div>
                  )}
                </section>
              </div>
            ) : null)}
        </main>
      </div>

      {session.snapshot && (
        <Dialog isOpen={isCaptureDialogOpen} onOpenChange={setIsCaptureDialogOpen} title="Detalhes da captura">
          <CaptureDetails snapshot={session.snapshot} />
        </Dialog>
      )}
    </div>
  );
}
