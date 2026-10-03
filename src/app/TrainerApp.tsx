import {useCallback, useEffect, useRef, useState} from 'react';
import {Archive, ChartBar, Lightning, Question, UsersThree} from '@phosphor-icons/react';
import {DemoWorkspace} from '../features/demo/DemoWorkspace';
import {DamageWorkspace} from '../features/damage/DamageWorkspace';
import {useDamagePlanner} from '../features/damage/controller';
import {CollectionWorkspace} from '../features/collection/CollectionWorkspace';
import {IndividualWorkspace} from '../features/individual/IndividualWorkspace';
import type {IndividualWorkspaceTab} from '../features/individual/IndividualWorkspace';
import {getCompanionApi, type PlayerSnapshot} from '../platform/api';
import {useTrainerSession} from './useTrainerSession';
import {Button, Disclosure, StatusMessage} from '../ui';
import styles from './TrainerApp.module.css';

type Workspace = 'team' | 'pc' | 'help' | 'damage' | 'demo';
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

const NAVIGATION: Array<{
  id: Workspace;
  label: string;
  Icon: typeof UsersThree;
}> = [
  {id: 'team', label: 'Equipe', Icon: UsersThree},
  {id: 'pc', label: 'PC', Icon: Archive},
  {id: 'damage', label: 'Dano', Icon: ChartBar},
  {id: 'demo', label: 'Demonstração', Icon: Lightning},
  {id: 'help', label: 'Ajuda e diagnóstico', Icon: Question},
];

function formatCaptureTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'}).format(timestamp) : value;
}

function workspaceTitle(workspace: Workspace) {
  if (workspace === 'team') return 'Equipe';
  if (workspace === 'pc') return 'PC';
  if (workspace === 'damage') return 'Planejador de dano';
  if (workspace === 'demo') return 'Demonstração offline';
  return 'Ajuda e diagnóstico';
}

function CaptureDetails({snapshot}: {snapshot: PlayerSnapshot}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const warningCount = snapshot.warnings?.length;

  return (
    <Disclosure
      className={styles.captureDisclosure}
      title={warningCount === undefined ? 'Detalhes da captura · avisos não capturados' : `Detalhes da captura · ${warningCount} avisos`}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
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
          <h2 id="capture-sources-title" className={styles.detailsHeading}>
            Arquivos de origem
          </h2>
          {snapshot.sources.length === 0 ? (
            <p className={styles.detailsEmpty}>Nenhum arquivo de origem registrado.</p>
          ) : (
            <ul className={styles.sourceList}>
              {snapshot.sources.map((source) => (
                <li key={source.kind}>
                  <span>{source.kind === 'party' ? 'Equipe' : 'PC'}</span>
                  <span>Modificado em {formatCaptureTime(source.modifiedAt)}</span>
                  <code aria-label={`SHA-256 do arquivo ${source.kind === 'party' ? 'da equipe' : 'do PC'}`}>{source.sha256}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="capture-warnings-title">
          <h2 id="capture-warnings-title" className={styles.detailsHeading}>
            Avisos completos
          </h2>
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
    </Disclosure>
  );
}

function NoSnapshotState({
  phase,
  error,
  onRefresh,
}: {
  phase: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  onRefresh(): void;
}) {
  if (phase === 'loading') {
    return (
      <section className={styles.loadingState} aria-busy="true" aria-live="polite">
        <StatusMessage tone="info" title="Atualizando do save">
          A captura anterior foi removida. A leitura local está em andamento.
        </StatusMessage>
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
        <p>Confirme a configuração local e tente uma nova leitura. Nenhuma captura anterior foi mantida.</p>
        <Button variant="primary" onPress={onRefresh}>
          Tentar novamente
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.emptyWorkspace}>
      <StatusMessage tone="info" title="Nenhuma captura nesta sessão">
        Configure <code>config.json</code> usando <code>config.example.json</code>. O Companion não lê o save automaticamente.
      </StatusMessage>
      <p>Quando estiver pronto, inicie uma leitura local. Os dados ficam apenas nesta sessão e não são gravados no jogo.</p>
      <Button variant="primary" onPress={onRefresh}>
        Atualizar do save
      </Button>
    </section>
  );
}

function HelpWorkspace({onOpenDemo}: {onOpenDemo(): void}) {
  return (
    <section className={styles.helpWorkspace} aria-labelledby="help-title">
      <h2 id="help-title">Ajuda e diagnóstico</h2>
      <p className={styles.helpLead}>O Companion lê uma captura local quando você inicia a operação. A equipe e o PC não são alterados.</p>
      <section className={styles.demoHelp} aria-labelledby="demo-help-title">
        <div>
          <h3 id="demo-help-title">Explore uma comparação sem dados do save</h3>
          <p>Veja o recorte offline Pikachu → Floatzel sem depender da captura, da equipe selecionada ou do plano de golpes.</p>
        </div>
        <Button variant="primary" onPress={onOpenDemo}>
          Abrir demonstração
        </Button>
      </section>

      <section className={styles.helpSection} aria-labelledby="local-reading-title">
        <h3 id="local-reading-title">Leitura local</h3>
        <p>
          Configure <code>config.json</code> com <code>serverRoot</code> e <code>playerUuid</code>, usando <code>config.example.json</code>{' '}
          como referência. A leitura só começa ao acionar “Atualizar do save”.
        </p>
        <p>
          Party e PC são lidos em modo somente leitura. A captura e os rascunhos existem apenas na memória desta sessão; nenhum snapshot é
          enviado ou gravado no save.
        </p>
      </section>

      <section className={styles.helpSection} aria-labelledby="limits-title">
        <h3 id="limits-title">Limites</h3>
        <ul>
          <li>Não edita o save, move Pokémon, equipa golpes nem salva alterações no jogo.</li>
          <li>Aparência, tipos, apelidos, HP atual e stats totais que não foram capturados não são inventados.</li>
          <li>
            O cálculo real compara somente o primeiro golpe equipado e depende de compatibilidade e condições confirmadas manualmente.
          </li>
          <li>A ilustração representa a espécie normal, não a forma, o aspecto ou a aparência individual capturada.</li>
        </ul>
      </section>

      <section className={styles.helpSection} aria-labelledby="artwork-credit-title">
        <h3 id="artwork-credit-title">Créditos e direitos das ilustrações</h3>
        <p>
          As imagens locais de espécies vêm de PokéAPI/sprites, revisão <code>1aa1b0ca273d0e096469a9846155484920b11b45</code>. O CSV de
          espécies usa PokéAPI, revisão <code>bc92d3b6029ef1abe9e7ad424c400b338f3c11fe</code>.
        </p>
        <p>
          As imagens são © The Pokémon Company. A declaração CC0 do repositório não concede direitos sobre obras de terceiros. Preparar
          artwork localmente não autoriza sua distribuição; qualquer publicação exige decisão de direitos específica.
        </p>
        <p>
          Sem artwork local preparado, ou para uma forma alternativa/desconhecida, a interface informa “Imagem indisponível”. O app não
          busca imagens pela rede durante o uso.
        </p>
      </section>
    </section>
  );
}

function CaptureStatus({snapshot}: {snapshot: PlayerSnapshot | null}) {
  if (!snapshot) return <span className={styles.captureTime}>Nenhuma captura nesta sessão</span>;
  return <span className={styles.captureTime}>Capturada em {formatCaptureTime(snapshot.capturedAt)}</span>;
}

export function TrainerApp() {
  const api = useCallback(() => getCompanionApi(), []);
  const session = useTrainerSession(api);
  const [workspace, setWorkspace] = useState<Workspace>('team');
  const [damageReturnWorkspace, setDamageReturnWorkspace] = useState<Exclude<Workspace, 'damage'>>('team');
  const [detailTab, setDetailTab] = useState<IndividualWorkspaceTab>('summary');
  const [compactPanel, setCompactPanel] = useState<CompactPanel>('collection');
  const [collectionStates, setCollectionStates] = useState(INITIAL_COLLECTION_STATE);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [isWideLayout, setIsWideLayout] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
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
    target?.focus();
    setFocusRequest(null);
  }, [compactPanel, focusRequest, isWideLayout, session.selectedUuid, workspace]);

  const selectedIndividual = session.snapshot?.individuals.find((individual) => individual.uuid === session.selectedUuid) ?? null;
  const damageController = useDamagePlanner(api, selectedIndividual, session.snapshot, snapshotRevision);
  const isCollectionWorkspace = workspace === 'team' || workspace === 'pc';
  const collectionView: CollectionView = workspace === 'pc' ? 'pc' : 'team';
  const title = workspaceTitle(workspace);

  async function refreshSnapshot() {
    damageController.invalidateCalculation();
    setSnapshotRevision((revision) => revision + 1);
    setCompactPanel('collection');
    setDetailTab('summary');
    await session.refresh();
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

  function navigateToDamage(candidateMoveId?: string) {
    if (workspace !== 'damage') setDamageReturnWorkspace(workspace);
    if (candidateMoveId) damageController.selectCandidate(candidateMoveId);
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
    setFocusRequest(damageReturnWorkspace === 'help' ? 'help' : compactPanel === 'detail' ? 'detail' : 'collection');
  }

  const noSnapshot = session.snapshot === null;

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar} aria-label="Navegação principal">
        <div className={styles.brand}>
          <span className={styles.brandName}>Companion</span>
          <span className={styles.brandDescription}>Central de treinador</span>
        </div>
        <nav className={styles.navigation} aria-label="Vistas">
          {NAVIGATION.map(({id, label, Icon}) => (
            <Button
              key={id}
              className={`${styles.navButton}${workspace === id ? ` ${styles.navButtonActive}` : ''}`}
              variant="quiet"
              aria-current={workspace === id ? 'page' : undefined}
              onPress={() => navigateWorkspace(id)}
            >
              <Icon className={styles.navIcon} aria-hidden="true" weight="regular" />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <h1>{title}</h1>
            {workspace !== 'demo' && <CaptureStatus snapshot={session.snapshot} />}
          </div>
          {workspace !== 'demo' && (
            <div className={styles.headerActions}>
              <span className={styles.readOnlyStatus}>Leitura local · somente leitura</span>
              <Button
                data-testid="refresh-snapshot"
                className={styles.refreshButton}
                variant="primary"
                isDisabled={session.phase === 'loading'}
                onPress={() => void refreshSnapshot()}
              >
                {session.phase === 'loading' ? 'Atualizando…' : 'Atualizar do save'}
              </Button>
              {session.snapshot && <CaptureDetails snapshot={session.snapshot} />}
            </div>
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
              <NoSnapshotState phase={session.phase} error={session.error} onRefresh={() => void refreshSnapshot()} />
            ) : workspace === 'help' ? (
              <HelpWorkspace onOpenDemo={() => setWorkspace('demo')} />
            ) : workspace === 'damage' ? (
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
                      : 'Voltar à ajuda e diagnóstico'
                }
                onBack={returnFromDamage}
                onRefresh={() => void refreshSnapshot()}
              />
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
                      <p>Selecione um Pokémon para consultar os dados capturados.</p>
                    </div>
                  )}
                </section>
              </div>
            ) : null)}
        </main>
      </div>
    </div>
  );
}
