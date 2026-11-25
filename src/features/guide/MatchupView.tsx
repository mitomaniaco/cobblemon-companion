import {useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {Check, Egg, Question, X} from '@phosphor-icons/react';
import {itemLabel} from '../../domain/catalog-labels';
import {abilityName, dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {CompanionApi, GuideAcquireEntry, GuideResult, GuideTeamMember, GuideTrainerDetail, PlayerIndividual} from '../../platform/api';
import {Disclosure, HpBar, ItemIcon, MoveChip, MovePpMeta, PokemonArtwork, TypeBadge, TypeIcon, typeColorVar, typeInkVar} from '../../ui';
import {
  EGG_ROUTE_TOOLTIP,
  accuracyLabel,
  acquireRouteText,
  efficacyView,
  focusReasons,
  moveRow,
  percentRangeLabel,
  verdictFacts,
  type EfficacyKind,
  type MoveRow,
} from './matchup-model';
import styles from './MatchupView.module.css';
import {abilityDescription, moveText} from './texts';
import {useTrainerDetails} from './useTrainerDetails';

const DAMAGE_SCALE_TIP =
  'A cor da barra mostra o tamanho do dano: verde forte a partir de 75% do HP do adversário, verde de 50%, amarelo de 25% e cinza abaixo disso. Parte lisa: dano garantido. Parte listrada: dano que depende da sorte.';

const COMO_CALCULAMOS =
  'Cada golpe é simulado com os atributos reais do seu Pokémon e do adversário, no nível atual, com o HP cheio do adversário e sem golpe crítico. A faixa vai do menor ao maior dano possível entre as variações do jogo, em % do HP do adversário.';

type Opponent = GuideResult['opponents'][number];

/** Símbolo da eficácia (forma, nunca só cor): ◎ super eficaz, ○ eficaz, △ pouco eficaz, ⊘ sem efeito, traço sem cálculo ou status. */
function EfficacySymbol({kind}: {kind: EfficacyKind}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'super' && (
        <>
          <circle cx="8" cy="8" r="6.2" />
          <circle cx="8" cy="8" r="2.6" />
        </>
      )}
      {kind === 'neutral' && <circle cx="8" cy="8" r="6" />}
      {kind === 'resisted' && <path d="M8 2.2 14 13.4H2Z" />}
      {kind === 'immune' && (
        <>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M3.6 12.4 12.4 3.6" />
        </>
      )}
      {(kind === 'status' || kind === 'unknown') && <path d="M4 8h8" />}
    </svg>
  );
}

function Efficacy({kind, label, multiplier}: {kind: EfficacyKind; label: string; multiplier: string | null}) {
  return (
    <span className={styles.eff} data-kind={kind}>
      <EfficacySymbol kind={kind} />
      <span>
        {label}
        {multiplier && <small> {multiplier}</small>}
      </span>
    </span>
  );
}

function TypeTile({type}: {type: string | null}) {
  const style = {'--tile-type': typeColorVar(type), '--tile-ink': typeInkVar(type)} as CSSProperties;
  return (
    <span className={styles.typeTile} style={style}>
      {type ? <TypeIcon type={type} /> : <Question weight="bold" aria-hidden="true" />}
    </span>
  );
}

function VerdictMark({outcome}: {outcome: 'vence' | 'perde'}) {
  return (
    <span className={styles.mark} data-outcome={outcome}>
      {outcome === 'vence' ? <Check weight="bold" aria-hidden="true" /> : <X weight="bold" aria-hidden="true" />}
    </span>
  );
}

function orderedTeam(result: GuideResult): GuideTeamMember[] {
  const ordered = result.partyPlan.slots.flatMap((slot) => result.team.filter((member) => member.uuid === slot.uuid));
  return ordered.length > 0 ? ordered : result.team;
}

function opponentIndex(opponent: Opponent): number {
  return Number(opponent.id.slice(opponent.id.lastIndexOf('#') + 1));
}

function DamageCell({row}: {row: MoveRow}) {
  if (row.kind === 'blocked') {
    return (
      <span className={styles.dmg}>
        <b>—</b>
        <span className={styles.note}>sem faixa de dano</span>
      </span>
    );
  }
  if (row.kind === 'status') {
    return (
      <span className={styles.dmg}>
        <b>—</b>
        <span className={styles.note}>não tira HP</span>
      </span>
    );
  }
  const label = percentRangeLabel(row.minPercent, row.maxPercent);
  return (
    <span className={styles.dmg}>
      <b>
        {label} <small>do HP</small>
      </b>
      <span data-tooltip={DAMAGE_SCALE_TIP} data-tooltip-heading="Cor pelo tamanho do dano">
        <HpBar mode="dealt" total={100} minDamage={row.minPercent} maxDamage={row.maxPercent} label={`Tira ${label} do HP do adversário`} />
      </span>
    </span>
  );
}

export interface MatchupViewProps {
  api: () => CompanionApi;
  result: GuideResult;
  individuals: ReadonlyMap<string, PlayerIndividual>;
}

export function MatchupView({api, result, individuals}: MatchupViewProps) {
  const team = useMemo(() => orderedTeam(result), [result]);
  const trainerId = result.goal.kind === 'trainer' ? result.goal.trainerId : null;
  const details = useTrainerDetails(api, trainerId === null ? [] : [trainerId]);
  const detailEntry = trainerId === null ? undefined : details.get(trainerId);
  const detail: GuideTrainerDetail | null = typeof detailEntry === 'object' ? detailEntry : null;

  const [memberChoice, setMemberChoice] = useState<string | null>(null);
  const [opponentChoice, setOpponentChoice] = useState<string | null>(null);
  const [moveChoice, setMoveChoice] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);

  const member = team.find((entry) => entry.uuid === memberChoice) ?? team[0];
  const opponent = result.opponents.find((entry) => entry.id === opponentChoice) ?? result.opponents[0];
  if (!member || !opponent) return <p className={styles.empty}>Sem adversário para comparar.</p>;

  const individual = individuals.get(member.uuid);
  const matchup = member.matchups.find((entry) => entry.opponentId === opponent.id);
  const memberSpecies = speciesDisplay(member.speciesId, individual?.formId ?? 'normal');
  const opponentSpecies = speciesDisplay(opponent.speciesId, detail?.team[opponentIndex(opponent)]?.formId ?? 'normal');
  const opponentDetail = detail?.team[opponentIndex(opponent)];

  const rows: MoveRow[] = member.moves.slice(0, 4).map((move) =>
    moveRow(
      move,
      matchup?.damage.find((entry) => entry.moveId === move.id),
      moveDisplay(move.id).category,
      matchup?.moveId ?? null,
    ),
  );
  const focusRow = rows.find((row) => row.moveId === moveChoice) ?? rows.find((row) => row.kind === 'damage' && row.best) ?? rows[0];

  return (
    <div className={styles.view}>
      <section className={styles.panel} aria-label="Seu time">
        <h2 className={styles.cap}>Seu time</h2>
        <ul className={styles.team}>
          {team.map((entry) => {
            const entryIndividual = individuals.get(entry.uuid);
            const species = speciesDisplay(entry.speciesId, entryIndividual?.formId ?? 'normal');
            const outcome = entry.matchups.find((item) => item.opponentId === opponent.id)?.outcome;
            return (
              <li key={entry.uuid}>
                <button
                  type="button"
                  className={styles.member}
                  aria-pressed={entry.uuid === member.uuid}
                  aria-label={`${species.name}, nível ${entry.level}${outcome ? `, ${outcome === 'vence' ? 'vence' : 'perde'}` : ''}`}
                  onClick={() => {
                    setMemberChoice(entry.uuid);
                    setMoveChoice(null);
                  }}
                >
                  <span className={styles.memberArt}>
                    <PokemonArtwork speciesId={entry.speciesId} formId={entryIndividual?.formId ?? 'normal'} variant="fill" />
                  </span>
                  <span className={styles.memberText}>
                    <strong>{species.name}</strong>
                    <span className={styles.sub}>
                      Nv {entry.level}
                      {species.types.map((type) => (
                        <TypeTile key={type} type={type} />
                      ))}
                    </span>
                  </span>
                  {outcome && <VerdictMark outcome={outcome} />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={styles.center}>
        <section className={styles.panel} aria-label="Veredito">
          <div className={styles.verdict}>
            <span className={styles.memberArtLarge}>
              <PokemonArtwork speciesId={member.speciesId} formId={individual?.formId ?? 'normal'} variant="fill" />
            </span>
            <div className={styles.who}>
              <h2>{memberSpecies.name}</h2>
              <span className={styles.versus}>
                contra {opponentSpecies.name} · Nv {opponent.level}
              </span>
              <span className={styles.types}>
                {memberSpecies.types.map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
              </span>
            </div>
            {matchup ? (
              <dl className={styles.facts}>
                {verdictFacts(matchup).map((fact) => (
                  <div key={fact.label} className={styles.fact} data-tone={fact.tone}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.label === 'Resultado' && <VerdictMark outcome={matchup.outcome} />}
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={styles.note}>Sem confronto calculado para este adversário.</p>
            )}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.moves}`} aria-label="Lista de golpes">
          <div className={styles.listHead}>
            <h2 className={styles.cap}>Golpes de {memberSpecies.name}</h2>
            <span>Eficácia</span>
            <span>Dano ao adversário</span>
          </div>
          <ul className={styles.list}>
            {rows.map((row, index) => (
              <li key={row.moveId}>
                <MoveButton
                  row={row}
                  index={index}
                  selected={focusRow?.moveId === row.moveId}
                  individual={individual}
                  onSelect={() => setMoveChoice(row.moveId)}
                />
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.pair}>
          {focusRow && (
            <section className={styles.panel} aria-label="Golpe em foco">
              <FocusPanel
                row={focusRow}
                stab={focusRow.kind === 'damage' && memberSpecies.types.some((type) => type === moveDisplay(focusRow.moveId).type)}
              />
              <Disclosure title="Como calculamos" headingLevel={3} isExpanded={calcOpen} onExpandedChange={setCalcOpen}>
                <p className={styles.note}>{COMO_CALCULAMOS}</p>
              </Disclosure>
            </section>
          )}
          <Acquire entries={member.acquire} />
        </div>
      </div>

      <section className={styles.panel} aria-label="Adversário">
        <h2 className={styles.cap}>
          Adversário <span>{detail?.name ?? ''}</span>
        </h2>
        <div className={styles.opps}>
          {result.opponents.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.opp}
              aria-pressed={entry.id === opponent.id}
              aria-label={`${speciesDisplay(entry.speciesId, 'normal').name}, nível ${entry.level}`}
              onClick={() => {
                setOpponentChoice(entry.id);
                setMoveChoice(null);
              }}
            >
              <span className={styles.oppArt}>
                <PokemonArtwork speciesId={entry.speciesId} formId="normal" variant="fill" />
              </span>
              <span className={styles.oppText}>
                <b>{speciesDisplay(entry.speciesId, 'normal').name}</b>
                <small>Nv {entry.level}</small>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.art} style={{'--art-type': typeColorVar(opponentSpecies.types[0] ?? null)} as CSSProperties}>
          <PokemonArtwork speciesId={opponent.speciesId} formId={opponentDetail?.formId ?? 'normal'} variant="fill" />
        </div>
        <div className={styles.oname}>
          <h2>{opponentSpecies.name}</h2>
          <span className={styles.level}>Nv {opponent.level}</span>
        </div>
        <div className={styles.types}>
          {opponentSpecies.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
        </div>
        <OpponentTraits entry={detailEntry} slot={opponentDetail} />
      </section>
    </div>
  );
}

function MoveButton({
  row,
  index,
  selected,
  individual,
  onSelect,
}: {
  row: MoveRow;
  index: number;
  selected: boolean;
  individual: PlayerIndividual | undefined;
  onSelect(): void;
}) {
  const display = moveDisplay(row.moveId);
  const text = moveText(row.moveId);
  const sameMove = (entry: {id: string}) => dexId(entry.id) === dexId(row.moveId);
  const equipped = individual?.equippedMoves.find(sameMove);
  const learned = equipped ? undefined : individual?.learnedMoves.find(sameMove);
  const efficacy = row.kind === 'damage' ? row.efficacy : efficacyView(null, row.kind === 'status');
  const style = {'--i': index} as CSSProperties;
  return (
    <button
      type="button"
      className={styles.row}
      style={style}
      aria-pressed={selected}
      data-blocked={row.kind === 'blocked' ? 'true' : undefined}
      onClick={onSelect}
    >
      {row.kind === 'blocked' ? (
        <span className={styles.blockedMove}>
          <span className={styles.blockedTile}>
            <Question weight="bold" aria-hidden="true" />
          </span>
          <span className={styles.blockedText}>
            <b>{display.name}</b>
            <span>
              {row.inCatalog
                ? 'Sem cálculo contra este adversário. Ele fica fora da faixa de dano.'
                : 'Não conhecemos este golpe (não está no catálogo do jogo). Ele fica fora do cálculo.'}
            </span>
          </span>
        </span>
      ) : (
        <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="tile">
          <MovePpMeta pp={equipped ? equipped.pp : text.pp} ppUps={equipped ? equipped.ppUps : (learned?.ppUps ?? null)} />
        </MoveChip>
      )}
      <Efficacy {...(row.kind === 'blocked' ? efficacyView(null) : efficacy)} />
      <DamageCell row={row} />
    </button>
  );
}

function FocusPanel({row, stab}: {row: MoveRow; stab: boolean}) {
  const display = moveDisplay(row.moveId);
  const description = moveText(row.moveId).description;
  const reasons = row.kind === 'damage' ? focusReasons(row, stab) : null;
  return (
    <div className={styles.focus}>
      <div>
        <h3>
          {display.name}
          {row.kind !== 'blocked' && ` · Precisão ${accuracyLabel(moveText(row.moveId).accuracy)}`}
        </h3>
        <p>
          {row.kind === 'blocked'
            ? row.inCatalog
              ? 'Sem cálculo contra este adversário, então ele fica fora da faixa de dano.'
              : 'Não conhecemos este golpe, então ele fica fora do cálculo.'
            : (description ?? 'Sem descrição disponível.')}
        </p>
      </div>
      <div className={styles.focusSecond}>
        <h3>{reasons?.heading ?? 'Neste confronto'}</h3>
        {reasons ? (
          <p>{reasons.lines.join(' ')}</p>
        ) : (
          <p>{row.kind === 'status' ? 'Golpe de status: não tira HP, então não entra na faixa de dano.' : 'Sem dano calculado.'}</p>
        )}
      </div>
    </div>
  );
}

function Acquire({entries}: {entries: GuideAcquireEntry[]}) {
  if (entries.length === 0) return null;
  return (
    <section className={styles.panel} aria-label="A adquirir">
      <h2 className={styles.cap}>A adquirir</h2>
      <ul className={styles.acquire}>
        {entries.slice(0, 4).map((entry) => {
          const display = moveDisplay(entry.moveId);
          const egg = entry.route.kind === 'ovo';
          return (
            <li key={entry.moveId}>
              <TypeTile type={display.type} />
              <span className={styles.acquireText}>
                <b>{display.name}</b>
                <span className={styles.routeLine}>
                  <span
                    className={styles.route}
                    data-egg={egg ? 'true' : undefined}
                    data-tooltip={egg ? EGG_ROUTE_TOOLTIP : undefined}
                    tabIndex={egg ? 0 : undefined}
                  >
                    {egg && <Egg weight="bold" aria-hidden="true" />}
                    {acquireRouteText(entry.route)}
                  </span>
                  {entry.replacesMoveId && <span className={styles.replaces}>no lugar de {moveDisplay(entry.replacesMoveId).name}</span>}
                </span>
              </span>
              <span className={styles.gain}>+{entry.gainPercent.toFixed(1).replace('.', ',')}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OpponentTraits({
  entry,
  slot,
}: {
  entry: GuideTrainerDetail | 'loading' | 'error' | undefined;
  slot: GuideTrainerDetail['team'][number] | undefined;
}) {
  if (entry === 'loading' || entry === undefined) {
    return <div className={styles.skeleton} role="status" aria-label="Carregando habilidade e itens" />;
  }
  if (entry === 'error' || !slot) return <p className={styles.note}>Não foi possível carregar a habilidade e os itens deste adversário.</p>;
  const description = slot.ability === null ? null : abilityDescription(slot.ability);
  return (
    <>
      <div className={styles.ability}>
        <span className={styles.label}>Habilidade</span>
        <b>{slot.ability === null ? 'Não informada' : abilityName(slot.ability)}</b>
        {description && <span>{description}</span>}
      </div>
      <div className={styles.itemsBox}>
        <span className={styles.label}>
          Item{slot.heldItemAlternatives.length > 1 ? ` · um destes ${slot.heldItemAlternatives.length}` : ''}
        </span>
        {slot.heldItemAlternatives.length === 0 ? (
          <span className={styles.note}>Nenhum item informado.</span>
        ) : (
          <ul className={styles.items}>
            {slot.heldItemAlternatives.map((item) => (
              <li key={item}>
                <ItemIcon itemDexId={dexId(item)} className={styles.itemIcon} />
                {itemLabel(item)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
