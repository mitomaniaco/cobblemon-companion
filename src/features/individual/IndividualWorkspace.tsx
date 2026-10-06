import {useId, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {ArrowLeft, CaretDown, CaretUp} from '@phosphor-icons/react';
import {itemLabel} from '../../domain/catalog-labels';
import {abilityName, dexId, moveDisplay, natureDisplay, speciesDisplay, titleCaseId} from '../../domain/dex';
import {locationLabel} from '../../domain/location-label';
import {getMoveSwapView, type MoveSwapPlan} from '../../domain/move-swap';
import {formatStat, MAX_EV, MAX_IV, statFill, statValue, summarizeEvs, type StatFact} from '../../domain/stats-format';
import {MovePreparation} from '../damage/MovePreparation';
import type {PlayerIndividual, PlayerSnapshot, PlayerStat} from '../../platform/api';
import {
  Button,
  Disclosure,
  MoveChip,
  PokeBallMark,
  PokemonArtwork,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TypeBadge,
  ItemIcon,
  MovePicker,
  typeColorVar,
} from '../../ui';
import {IvRadar} from './IvRadar';
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
  onOpenDamage(candidateMoveId: string, slotIndex: number): void;
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

function timestampLabel(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'medium'}).format(timestamp) : value;
}

function moveMeta(move: MoveEntry) {
  return (
    <>
      <span>PP {move.pp ?? '?'}</span>
      <span className={styles.ppUps} role="img" aria-label={move.ppUps === null ? 'PP Ups não capturado' : `PP Ups ${move.ppUps}`}>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className={styles.ppDot} data-filled={move.ppUps !== null && dot < move.ppUps ? 'true' : undefined} />
        ))}
      </span>
    </>
  );
}

function MoveTile({move}: {move: MoveEntry}) {
  const display = moveDisplay(move.id);
  return (
    <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="tile">
      {moveMeta(move)}
    </MoveChip>
  );
}

function MoveGroup({
  title,
  known,
  moves,
  kind,
  picker,
}: {
  title: string;
  known: boolean;
  moves: MoveEntry[];
  kind: 'equipped' | 'learned';
  picker?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={styles.moveGroup} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.subheading}>
        {title}
      </h3>
      {known && moves.length > 0 && <span className={styles.moveCount}>{moves.length}</span>}
      {!known ? (
        <p className={styles.listState} role="status">
          Lista de golpes não capturada.
        </p>
      ) : moves.length === 0 ? (
        <p className={styles.listState} role="status">
          Nenhum golpe registrado nesta captura.
        </p>
      ) : picker ? (
        picker
      ) : kind === 'equipped' ? (
        <ul className={styles.tileList}>
          {moves.map((move, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a lista capturada pode repetir golpes; o índice evita chaves duplicadas e a lista é somente leitura
            <li key={`${index}-${move.id}`} data-move-name={moveDisplay(move.id).name}>
              <MoveTile move={move} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.chipList}>
          {moves.map((move, index) => {
            const display = moveDisplay(move.id);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a lista capturada pode repetir golpes; o índice evita chaves duplicadas e a lista é somente leitura
              <li key={`${index}-${move.id}`} data-move-name={display.name}>
                <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="chip" />
              </li>
            );
          })}
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
            {snapshot.sources.map((source) => (
              <li key={source.kind}>
                <span className={styles.sourceTitle}>{source.kind === 'party' ? 'Equipe' : 'PC'}</span>
                <span>Modificado em {timestampLabel(source.modifiedAt)}</span>
                <span className={styles.visuallyHidden}>SHA-256 do arquivo {source.kind === 'party' ? 'da equipe' : 'do PC'}</span>
                <code>{source.sha256}</code>
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
            const facts: Array<{label: string; fact: StatFact}> = [
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
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
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
            // biome-ignore lint/suspicious/noArrayIndexKey: a lista capturada pode repetir golpes; o índice evita chaves duplicadas e a lista é somente leitura
            <li key={`${index}-${move.id}`}>
              <code>{move.id}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STAT_LABEL: Record<PlayerStat, string> = Object.fromEntries(STAT_ROWS.map((stat) => [stat.key, stat.label])) as Record<
  PlayerStat,
  string
>;
function StatCell({fact, max}: {fact: StatFact; max: number}) {
  const fill = statFill(fact, max);
  const style = {'--fill': fill ?? 0} as CSSProperties;
  return (
    <td>
      {fill !== null && <span className={styles.statBar} style={style} aria-hidden="true" />}
      {formatStat(fact)}
    </td>
  );
}

function NatureLine({plus, minus}: {plus: PlayerStat | null; minus: PlayerStat | null}) {
  if (plus === null || minus === null) return <span className={styles.natureLine}>Neutra</span>;
  return (
    <span className={styles.natureLine}>
      <span className={styles.natureUp}>
        <CaretUp aria-hidden="true" weight="bold" /> {STAT_LABEL[plus]}
      </span>
      <span className={styles.natureDown}>
        <CaretDown aria-hidden="true" weight="bold" /> {STAT_LABEL[minus]}
      </span>
    </span>
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
  const species = speciesDisplay(individual.speciesId, individual.formId);
  const formLabel = individual.formId === 'unknown' ? 'Desconhecida' : titleCaseId(individual.formId);
  const nature = individual.observed.nature === null ? null : natureDisplay(individual.observed.nature);
  const natureIncreased = nature?.plus ?? null;
  const natureReduced = nature?.minus ?? null;
  const accent = typeColorVar(species.types[0] ?? null);
  const heroStyle = {'--hero-a': accent, '--hero-b': typeColorVar(species.types[1] ?? species.types[0] ?? null)} as CSSProperties;
  const ivValues = Object.fromEntries(STAT_ROWS.map((stat) => [stat.key, statValue(individual.battleStats.ivs[stat.key])])) as Record<
    PlayerStat,
    number | null
  >;
  const evSummary = summarizeEvs(STAT_ROWS.map((stat) => individual.battleStats.evs[stat.key]));
  const view = getMoveSwapView(individual, moveSwapPlan);
  const planned = moveSwapPlan.individualUuid === individual.uuid;
  let equippedPicker: ReactNode;
  let learnedPicker: ReactNode;
  if (view.status === 'ready') {
    const equippedKeys = new Set(individual.equippedMoves.map((move) => move.id.trim().toLowerCase()));
    const firstIndex = new Map<string, number>();
    for (const candidate of view.candidates) {
      firstIndex.set(
        candidate.id,
        individual.learnedMoves.findIndex((move) => move.id === candidate.id),
      );
    }
    const selectedLearned = planned && moveSwapPlan.candidateMoveId !== null ? firstIndex.get(moveSwapPlan.candidateMoveId) : undefined;
    equippedPicker = (
      <MovePicker
        variant="tile"
        label="Slot equipado para a prévia"
        items={individual.equippedMoves.map((move, index) => {
          const display = moveDisplay(move.id);
          return {
            key: String(index),
            textValue: `Slot ${index + 1} · ${display.name}`,
            name: display.name,
            type: display.type,
            category: display.category,
            power: display.power,
            meta: moveMeta(move),
          };
        })}
        selectedKey={planned && moveSwapPlan.slotIndex !== null ? String(moveSwapPlan.slotIndex) : null}
        onSelectionChange={(key) => onMoveSwapPlanChange({slotIndex: Number(key)})}
      />
    );
    learnedPicker = (
      <MovePicker
        variant="chip"
        label="Golpe aprendido para a proposta"
        items={individual.learnedMoves.map((move, index) => {
          const display = moveDisplay(move.id);
          const enabled = firstIndex.get(move.id) === index;
          return {
            key: String(index),
            textValue: display.name,
            name: display.name,
            type: display.type,
            category: display.category,
            power: display.power,
            isDisabled: !enabled,
            note: equippedKeys.has(move.id.trim().toLowerCase()) ? 'Equipado' : 'Repetido',
          };
        })}
        selectedKey={selectedLearned === undefined ? null : String(selectedLearned)}
        onSelectionChange={(key) => {
          const move = individual.learnedMoves[Number(key)];
          if (move) onMoveSwapPlanChange({candidateMoveId: move.id});
        }}
      />
    );
  }

  return (
    <aside className={styles.workspace} data-testid="individual-details" aria-labelledby={titleId}>
      {showReturnButton && (
        <Button className={styles.returnButton} variant="quiet" onPress={onReturn}>
          <ArrowLeft aria-hidden="true" weight="bold" />
          {returnButtonLabel}
        </Button>
      )}

      <header className={styles.hero} style={heroStyle}>
        <PokeBallMark className={styles.heroMark} />
        <PokemonArtwork
          key={individual.uuid}
          className={styles.heroArtwork}
          speciesId={individual.speciesId}
          formId={individual.formId}
          variant="detail"
        />
        <div className={styles.identity}>
          <h2 className={styles.name} id={titleId} tabIndex={-1}>
            {species.name}
          </h2>
          {species.types.length > 0 && (
            <div className={styles.identityTypes}>
              {species.types.map((type) => (
                <TypeBadge key={type} type={type} />
              ))}
            </div>
          )}
          <div className={styles.identityChips}>
            <span className={styles.chip}>{individual.level === null ? 'Nv. ?' : `Nv. ${individual.level}`}</span>
            <span className={styles.chip}>{locationLabel(individual.location)}</span>
            {individual.formId !== 'normal' && (
              <span className={styles.formChip}>{individual.formId === 'unknown' ? 'Forma desconhecida' : 'Forma alternativa'}</span>
            )}
          </div>
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
            <dl className={styles.summaryFacts}>
              <div>
                <dt>Natureza</dt>
                <dd>
                  {nature === null ? (
                    'Não capturado'
                  ) : (
                    <>
                      {nature.name}
                      <NatureLine plus={nature.plus} minus={nature.minus} />
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Habilidade</dt>
                <dd>{individual.observed.ability === null ? 'Não capturado' : abilityName(individual.observed.ability)}</dd>
              </div>
              <div>
                <dt>Item</dt>
                <dd className={styles.itemFact}>
                  {individual.observed.heldItem !== null && <ItemIcon itemDexId={dexId(individual.observed.heldItem)} />}
                  {individual.observed.heldItem === null ? 'Não registrado no save' : itemLabel(individual.observed.heldItem)}
                </dd>
              </div>
              <div>
                <dt>Forma</dt>
                <dd>{formLabel}</dd>
              </div>
            </dl>
            <section className={styles.inUse} aria-labelledby={`${panelIds}-in-use-title`}>
              <h3 id={`${panelIds}-in-use-title`} className={styles.subheading}>
                Em uso
              </h3>
              {!individual.equippedMovesKnown ? (
                <p className={styles.listState}>Lista de golpes não capturada.</p>
              ) : individual.equippedMoves.length === 0 ? (
                <p className={styles.listState}>Nenhum golpe registrado nesta captura.</p>
              ) : (
                <ul className={styles.chipList}>
                  {individual.equippedMoves.map((move, index) => {
                    const display = moveDisplay(move.id);
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a lista capturada pode repetir golpes; o índice evita chaves duplicadas e a lista é somente leitura
                      <li key={`${index}-${move.id}`}>
                        <MoveChip name={display.name} type={display.type} category={display.category} variant="chip" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabPanel>
          <TabPanel id="moves">
            <section className={styles.movesContent} aria-labelledby={`${panelIds}-moves-title`}>
              <h3 id={`${panelIds}-moves-title`} className={styles.visuallyHidden}>
                Golpes
              </h3>
              <div className={styles.moveGroups}>
                <MoveGroup
                  title="Golpes equipados"
                  known={individual.equippedMovesKnown}
                  moves={individual.equippedMoves}
                  kind="equipped"
                  picker={equippedPicker}
                />
                <MoveGroup
                  title="Golpes aprendidos"
                  known={individual.learnedMovesKnown}
                  moves={individual.learnedMoves}
                  kind="learned"
                  picker={learnedPicker}
                />
              </div>
              <MovePreparation individual={individual} plan={moveSwapPlan} onOpenDamage={onOpenDamage} />
            </section>
          </TabPanel>
          <TabPanel id="stats">
            <section className={styles.statsContent} aria-labelledby={`${panelIds}-attributes-title`}>
              <h3 id={`${panelIds}-attributes-title`} className={styles.visuallyHidden}>
                Atributos
              </h3>
              <IvRadar ivs={ivValues} accent={accent} />
              <div className={styles.evSummary}>
                <span>{evSummary.text}</span>
                {evSummary.fill !== null && (
                  <span className={styles.evTrack} style={{'--fill': evSummary.fill} as CSSProperties} aria-hidden="true" />
                )}
              </div>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável precisa de foco por teclado para ser rolada sem mouse (WCAG 2.1.1) */}
              <section className={styles.attributeTableScroll} aria-label="Atributos registrados" tabIndex={0}>
                <table className={styles.attributeTable} style={{'--radar-accent': accent} as CSSProperties}>
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
                        <th scope="row">
                          {stat.label}
                          {natureIncreased === stat.key && (
                            <>
                              <CaretUp className={styles.natureUp} aria-hidden="true" weight="bold" />
                              <span className={styles.visuallyHidden}>(aumentado pela natureza)</span>
                            </>
                          )}
                          {natureReduced === stat.key && (
                            <>
                              <CaretDown className={styles.natureDown} aria-hidden="true" weight="bold" />
                              <span className={styles.visuallyHidden}>(reduzido pela natureza)</span>
                            </>
                          )}
                        </th>
                        <StatCell fact={individual.battleStats.ivs[stat.key]} max={MAX_IV} />
                        <StatCell fact={individual.battleStats.hyperTrainedIvs[stat.key]} max={MAX_IV} />
                        <StatCell fact={individual.battleStats.evs[stat.key]} max={MAX_EV} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
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
