import {useId, useState} from 'react';
import type {MoveSwapPlan} from '../../domain/move-swap';
import {MovePreparation} from '../damage/MovePreparation';
import type {PlayerIndividual, PlayerSnapshot, PlayerStat, PlayerStatFact} from '../../platform/api';
import {Button, Disclosure, PokemonArtwork, Tab, TabList, TabPanel, TabPanels, Tabs} from '../../ui';
import styles from './IndividualWorkspace.module.css';

export type IndividualWorkspaceTab = 'summary' | 'moves' | 'stats';

export interface IndividualWorkspaceProps {
  individual: PlayerIndividual;
  snapshot: PlayerSnapshot;
  selectedTab: IndividualWorkspaceTab;
  onTabChange(tab: IndividualWorkspaceTab): void;
  returnButtonLabel: string;
  onReturn(): void;
  showReturnButton?: boolean;
  moveSwapPlan: MoveSwapPlan;
  onMoveSwapPlanChange(patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void;
  onOpenDamage(candidateMoveId: string): void;
}

const STAT_ROWS: ReadonlyArray<{key: PlayerStat; label: string}> = [
  {key: 'hp', label: 'HP'},
  {key: 'atk', label: 'Ataque'},
  {key: 'def', label: 'Defesa'},
  {key: 'spa', label: 'At. especial'},
  {key: 'spd', label: 'Def. especial'},
  {key: 'spe', label: 'Velocidade'},
];

type MoveEntry = {id: string; pp?: number | null; ppUps: number | null};
type NumericFact = PlayerStatFact<number> | PlayerStatFact<number | null>;

function displayId(id: string) {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function locationLabel(location: PlayerIndividual['location']) {
  if (location.container === 'party') return `Equipe · posição ${location.slot}`;
  const boxName = location.boxName === null ? ' · nome não capturado' : ` · ${location.boxName}`;
  return `PC · caixa ${location.box}${boxName} · posição ${location.slot}`;
}

function timestampLabel(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'}).format(timestamp) : value;
}

function formatFact(fact: NumericFact) {
  if (fact.state === 'unknown') return 'Não capturado';
  return fact.value === null ? 'Sem override' : String(fact.value);
}

function MoveGroup({title, known, moves, kind}: {title: string; known: boolean; moves: MoveEntry[]; kind: 'equipped' | 'learned'}) {
  const titleId = useId();
  return (
    <section className={styles.moveGroup} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.subheading}>
        {title}
      </h3>
      {!known ? (
        <p className={styles.listState} role="status">
          Lista de golpes não capturada.
        </p>
      ) : moves.length === 0 ? (
        <p className={styles.listState} role="status">
          Nenhum golpe registrado nesta captura.
        </p>
      ) : (
        <ul className={styles.moveList}>
          {moves.map((move, index) => (
            <li className={styles.moveItem} key={`${index}-${move.id}`}>
              <span className={styles.moveName}>{displayId(move.id)}</span>
              <span className={styles.moveFacts}>
                {kind === 'equipped' && <span>PP {move.pp == null ? 'Não capturado' : move.pp}</span>}
                <span>PP Ups {move.ppUps === null ? 'Não capturado' : move.ppUps}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CaptureData({individual, snapshot}: {individual: PlayerIndividual; snapshot: PlayerSnapshot}) {
  const id = useId();
  const warnings = snapshot.warnings;

  return (
    <div className={styles.captureData}>
      <dl className={styles.captureFacts}>
        <div>
          <dt>UUID</dt>
          <dd>
            <code>{individual.uuid}</code>
          </dd>
        </div>
        <div>
          <dt>ID da espécie</dt>
          <dd>
            <code>{individual.speciesId}</code>
          </dd>
        </div>
        <div>
          <dt>ID da forma</dt>
          <dd>
            <code>{individual.formId}</code>
          </dd>
        </div>
        <div>
          <dt>Natureza observada</dt>
          <dd>
            <code>{individual.observed.nature ?? 'Não capturado'}</code>
          </dd>
        </div>
        <div>
          <dt>Habilidade observada</dt>
          <dd>
            <code>{individual.observed.ability ?? 'Não capturado'}</code>
          </dd>
        </div>
        <div>
          <dt>Item observado</dt>
          <dd>
            <code>{individual.observed.heldItem ?? 'Não capturado'}</code>
          </dd>
        </div>
        <div>
          <dt>Localização capturada</dt>
          <dd>{locationLabel(individual.location)}</dd>
        </div>
        <div>
          <dt>Leitura</dt>
          <dd>{snapshot.consistency === 'best-effort' ? 'Melhor esforço (best-effort)' : snapshot.consistency}</dd>
        </div>
        <div>
          <dt>Capturada em</dt>
          <dd>{timestampLabel(snapshot.capturedAt)}</dd>
        </div>
        <div>
          <dt>Mundo</dt>
          <dd>{snapshot.worldName}</dd>
        </div>
      </dl>

      <section className={styles.captureSection} aria-labelledby={`${id}-sources-title`}>
        <h3 id={`${id}-sources-title`} className={styles.subheading}>
          Arquivos de origem
        </h3>
        {snapshot.sources.length === 0 ? (
          <p className={styles.listState}>Nenhuma origem registrada.</p>
        ) : (
          <ul className={styles.sourceList}>
            {snapshot.sources.map((source, index) => (
              <li key={`${source.kind}-${index}`}>
                <span className={styles.sourceTitle}>{source.kind === 'party' ? 'Equipe' : 'PC'}</span>
                <span>Modificado em {timestampLabel(source.modifiedAt)}</span>
                <code aria-label={`SHA-256 do arquivo ${source.kind === 'party' ? 'da equipe' : 'do PC'}`}>{source.sha256}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.captureSection} aria-labelledby={`${id}-provenance-title`}>
        <h3 id={`${id}-provenance-title`} className={styles.subheading}>
          Origem dos atributos
        </h3>
        <dl className={styles.provenanceList}>
          {STAT_ROWS.map((stat) => {
            const facts: Array<{label: string; fact: NumericFact}> = [
              {label: 'IV base', fact: individual.battleStats.ivs[stat.key]},
              {label: 'Hyper Training', fact: individual.battleStats.hyperTrainedIvs[stat.key]},
              {label: 'EV', fact: individual.battleStats.evs[stat.key]},
            ];
            return facts.map(({label, fact}) => (
              <div key={`${stat.key}-${label}`}>
                <dt>
                  {stat.label} · {label}
                </dt>
                <dd>
                  <span>{fact.provenance.sourceKind === 'party' ? 'Equipe' : 'PC'}</span>
                  <code>{fact.provenance.nbtPath}</code>
                </dd>
              </div>
            ));
          })}
        </dl>
      </section>

      <section className={styles.captureSection} aria-labelledby={`${id}-move-ids-title`}>
        <h3 id={`${id}-move-ids-title`} className={styles.subheading}>
          IDs dos golpes
        </h3>
        <div className={styles.rawMoveColumns}>
          <RawMoveIds title="Equipados" moves={individual.equippedMoves} known={individual.equippedMovesKnown} />
          <RawMoveIds title="Aprendidos" moves={individual.learnedMoves} known={individual.learnedMovesKnown} />
        </div>
      </section>

      <section className={styles.captureSection} aria-labelledby={`${id}-warnings-title`}>
        <h3 id={`${id}-warnings-title`} className={styles.subheading}>
          Avisos da captura
        </h3>
        {warnings === undefined ? (
          <p className={styles.listState}>Avisos não capturados.</p>
        ) : warnings.length === 0 ? (
          <p className={styles.listState}>Nenhum aviso registrado.</p>
        ) : (
          <ul className={styles.warningList}>
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RawMoveIds({title, moves, known}: {title: string; moves: MoveEntry[]; known: boolean}) {
  return (
    <div className={styles.rawMoveGroup}>
      <h4>{title}</h4>
      {!known ? (
        <p className={styles.listState}>Não capturados</p>
      ) : moves.length === 0 ? (
        <p className={styles.listState}>Nenhum registrado</p>
      ) : (
        <ul>
          {moves.map((move, index) => (
            <li key={`${index}-${move.id}`}>
              <code>{move.id}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IndividualWorkspace({
  individual,
  snapshot,
  selectedTab,
  onTabChange,
  returnButtonLabel,
  onReturn,
  showReturnButton = true,
  moveSwapPlan,
  onMoveSwapPlanChange,
  onOpenDamage,
}: IndividualWorkspaceProps) {
  const [captureDataExpanded, setCaptureDataExpanded] = useState(false);
  const titleId = useId();
  const panelIds = useId();
  const formLabel = individual.formId === 'unknown' ? 'Desconhecida' : displayId(individual.formId);
  const displayName = displayId(individual.speciesId);

  return (
    <aside className={styles.workspace} data-testid="individual-details" aria-labelledby={titleId}>
      {showReturnButton && (
        <Button className={styles.returnButton} variant="quiet" onPress={onReturn}>
          {returnButtonLabel}
        </Button>
      )}

      <header className={styles.identity}>
        <PokemonArtwork speciesId={individual.speciesId} formId={individual.formId} variant="detail" />
        <div className={styles.identityInfo}>
          <h2 className={styles.name} id={titleId} tabIndex={-1}>
            {displayName}
          </h2>
          <dl className={styles.identityFacts}>
            <div>
              <dt>Nível</dt>
              <dd>{individual.level === null ? 'Não capturado' : individual.level}</dd>
            </div>
            <div>
              <dt>Localização</dt>
              <dd>{locationLabel(individual.location)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        className={styles.tabs}
        selectedKey={selectedTab}
        onSelectionChange={(key) => {
          if (key === 'summary' || key === 'moves' || key === 'stats') onTabChange(key);
        }}
      >
        <TabList aria-label="Seções do indivíduo">
          <Tab id="summary">Resumo</Tab>
          <Tab id="moves">Golpes</Tab>
          <Tab id="stats">Atributos</Tab>
        </TabList>
        <TabPanels>
          <TabPanel id="summary">
            <section aria-labelledby={`${panelIds}-summary-title`}>
              <h3 id={`${panelIds}-summary-title`} className={styles.panelHeading}>
                Resumo
              </h3>
              <dl className={styles.summaryFacts}>
                <div>
                  <dt>Forma</dt>
                  <dd>{formLabel}</dd>
                </div>
                <div>
                  <dt>Natureza</dt>
                  <dd>{individual.observed.nature === null ? 'Não capturado' : displayId(individual.observed.nature)}</dd>
                </div>
                <div>
                  <dt>Habilidade</dt>
                  <dd>{individual.observed.ability === null ? 'Não capturado' : displayId(individual.observed.ability)}</dd>
                </div>
                <div>
                  <dt>Item</dt>
                  <dd>{individual.observed.heldItem === null ? 'Não capturado' : displayId(individual.observed.heldItem)}</dd>
                </div>
              </dl>
            </section>
          </TabPanel>
          <TabPanel id="moves">
            <section className={styles.movesContent} aria-labelledby={`${panelIds}-moves-title`}>
              <h3 id={`${panelIds}-moves-title`} className={styles.panelHeading}>
                Golpes
              </h3>
              <div className={styles.moveGroups}>
                <MoveGroup
                  title="Golpes equipados"
                  known={individual.equippedMovesKnown}
                  moves={individual.equippedMoves}
                  kind="equipped"
                />
                <MoveGroup title="Golpes aprendidos" known={individual.learnedMovesKnown} moves={individual.learnedMoves} kind="learned" />
              </div>
              <MovePreparation
                individual={individual}
                plan={moveSwapPlan}
                onPlanChange={onMoveSwapPlanChange}
                onOpenDamage={onOpenDamage}
              />
            </section>
          </TabPanel>
          <TabPanel id="stats">
            <section aria-labelledby={`${panelIds}-attributes-title`}>
              <h3 id={`${panelIds}-attributes-title`} className={styles.panelHeading}>
                Atributos
              </h3>
              <div className={styles.attributeTableScroll} role="region" aria-label="Atributos registrados" tabIndex={0}>
                <table className={styles.attributeTable}>
                  <caption className={styles.visuallyHidden}>Valores capturados de IV base, Hyper Training e EV por atributo.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Atributo</th>
                      <th scope="col">IV base</th>
                      <th scope="col">Hyper Training</th>
                      <th scope="col">EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_ROWS.map((stat) => (
                      <tr key={stat.key}>
                        <th scope="row">{stat.label}</th>
                        <td>{formatFact(individual.battleStats.ivs[stat.key])}</td>
                        <td>{formatFact(individual.battleStats.hyperTrainedIvs[stat.key])}</td>
                        <td>{formatFact(individual.battleStats.evs[stat.key])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Disclosure
        className={styles.captureDisclosure}
        title="Dados da captura"
        isExpanded={captureDataExpanded}
        onExpandedChange={setCaptureDataExpanded}
      >
        <CaptureData individual={individual} snapshot={snapshot} />
      </Disclosure>
    </aside>
  );
}
