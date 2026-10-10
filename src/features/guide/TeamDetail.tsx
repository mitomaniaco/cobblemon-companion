import {useState} from 'react';
import type {CSSProperties} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {GuidePartySlot, GuideResult, GuideTeamMember, PlayerIndividual} from '../../platform/api';
import {Button, Disclosure, ItemIcon, PokemonArtwork, TypeBadge, typeColorVar, typeIconPath} from '../../ui';
import {guideAnswers, guideOpponentTurnsLabel, guideUnansweredOpponents} from './guide-model';
import styles from './TeamDetail.module.css';

const ITEM_STATUS_LABEL = {tem: 'já segura', obter: 'obter', nenhum: 'sem item sugerido'} as const;

type Opponents = GuideResult['opponents'];

function MemberDetails({
  member,
  individual,
  opponents,
  onOpenCalculation,
}: {
  member: GuideTeamMember;
  individual: PlayerIndividual | undefined;
  opponents: Opponents;
  onOpenCalculation(uuid: string, move: GuideTeamMember['moves'][number]): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusMoves = member.moves.filter((move) => !move.evaluated);
  const opponentById = new Map(opponents.map((opponent) => [opponent.id, opponent]));
  return (
    <Disclosure headingLevel={5} title="Ver detalhes" isExpanded={expanded} onExpandedChange={setExpanded} className={styles.details}>
      <div className={styles.detailsBody}>
        <section aria-label="Confrontos">
          <h6 className={styles.detailsTitle}>Confrontos</h6>
          {member.matchups.length === 0 ? (
            <p className={styles.muted}>Sem confrontos calculados para este membro.</p>
          ) : (
            <ul className={styles.matchups}>
              {member.matchups.map((matchup) => {
                const opponent = opponentById.get(matchup.opponentId);
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
          <h6 className={styles.detailsTitle}>Cálculo por golpe</h6>
          <ul className={styles.calcList}>
            {member.moves
              .filter((move) => move.evaluated)
              .map((move) => (
                <li key={`${move.source}-${move.id}`}>
                  <span>{moveDisplay(move.id).name}</span>
                  <Button
                    variant="quiet"
                    className={styles.calcButton}
                    isDisabled={!individual}
                    onPress={() => onOpenCalculation(member.uuid, move)}
                  >
                    Ver cálculo
                  </Button>
                </li>
              ))}
          </ul>
          {statusMoves.length > 0 && (
            <p className={styles.muted}>
              Golpes de status (não avaliados): {statusMoves.map((move) => moveDisplay(move.id).name).join(', ')}.
            </p>
          )}
        </section>
      </div>
    </Disclosure>
  );
}

function TypeIcon({type}: {type: string | null}) {
  const icon = type ? typeIconPath(type) : null;
  return (
    <i className={styles.typeDot} style={{'--c': typeColorVar(type)} as CSSProperties} aria-hidden="true">
      {icon && <img src={icon} alt="" width={13} height={13} decoding="async" />}
    </i>
  );
}

interface TeamDetailProps {
  member: GuideTeamMember;
  slot: GuidePartySlot | undefined;
  individual: PlayerIndividual | undefined;
  /** Equipe completa e adversários, para a lista "Responde a" e os avisos de lacuna. */
  result: Pick<GuideResult, 'opponents' | 'team'>;
  onOpenCalculation(uuid: string, move: GuideTeamMember['moves'][number]): void;
}

/** Detalhes do membro selecionado da equipe recomendada: golpes, item, a quem responde e o que vale adquirir. */
export function TeamDetail({member, slot, individual, result, onOpenCalculation}: TeamDetailProps) {
  const species = speciesDisplay(member.speciesId, individual?.formId ?? 'normal');
  const evaluated = member.moves.filter((move) => move.evaluated);
  const opponentById = new Map(result.opponents.map((opponent) => [opponent.id, opponent]));
  const opponentName = (opponentId: string) => {
    const opponent = opponentById.get(opponentId);
    return opponent ? speciesDisplay(opponent.speciesId, 'normal').name : opponentId;
  };
  const answers = guideAnswers(member, result.opponents);
  const unanswered = guideUnansweredOpponents(result.team, result.opponents);
  return (
    <section className={styles.panel} aria-label={`Detalhes de ${species.name}`}>
      <div className={styles.column}>
        <header className={styles.header}>
          <h4 className={styles.name}>{species.name}</h4>
          {species.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
          <span className={styles.level}>Nv. {member.level}</span>
          {slot?.role && <p className={styles.role}>{slot.role}</p>}
        </header>
        <p className={styles.muted}>{member.reason}</p>

        <section aria-label="Golpes">
          <h5 className={styles.title}>Golpes</h5>
          <ul className={styles.moves}>
            {evaluated.map((move) => {
              const display = moveDisplay(move.id);
              return (
                <li key={`${move.source}-${move.id}`}>
                  <TypeIcon type={display.type} />
                  <span className={styles.moveName}>{display.name}</span>
                  <em>{move.source}</em>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Item" className={styles.item}>
          <h5 className={styles.title}>Item</h5>
          <div className={styles.itemLine}>
            {member.item.id !== null && <ItemIcon itemDexId={dexId(member.item.id)} />}
            <strong>{member.item.id === null ? 'Sem item sugerido' : itemLabel(member.item.id)}</strong>
            <span className={styles.itemChip} data-status={member.item.status}>
              {ITEM_STATUS_LABEL[member.item.status]}
            </span>
          </div>
          <p className={styles.muted}>{member.item.reason}</p>
        </section>
      </div>

      <div className={styles.column}>
        <section aria-label="Responde a">
          <h5 className={styles.title}>Responde a</h5>
          {answers.length === 0 ? (
            <p className={styles.muted}>Sem confrontos calculados para este membro.</p>
          ) : (
            <ul className={styles.answers}>
              {answers.map((matchup) => {
                const opponent = opponentById.get(matchup.opponentId);
                const wins = matchup.outcome === 'vence';
                return (
                  <li key={matchup.opponentId} data-outcome={matchup.outcome}>
                    <span className={styles.answerArt}>
                      {opponent && <PokemonArtwork speciesId={opponent.speciesId} formId="normal" variant="slot" />}
                    </span>
                    <span className={styles.answerBody}>
                      <span className={styles.answerHead}>
                        <strong>{opponentName(matchup.opponentId)}</strong>
                        <span className={styles.outcome} data-outcome={matchup.outcome}>
                          {wins ? 'vence' : 'perde'}
                        </span>
                        {wins && matchup.moveId !== null && <span className={styles.useMove}>{moveDisplay(matchup.moveId).name}</span>}
                      </span>
                      <small>{guideOpponentTurnsLabel(matchup)}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.muted}>Estimativa 1 contra 1, HP cheio, sem status nem crítico: a IA do RCT pode trocar em outra ordem.</p>
          {unanswered.length > 0 && (
            <ul className={styles.warnings}>
              {unanswered.map((opponent) => (
                <li key={opponent.id}>Ninguém do time vence {opponentName(opponent.id)}: veja Vale adquirir ou Capturas.</li>
              ))}
            </ul>
          )}
        </section>

        {member.acquire.length > 0 && (
          <section aria-label="Vale adquirir" className={styles.acquire}>
            <h5 className={styles.title}>Vale adquirir</h5>
            <ul>
              {member.acquire.map((entry) => (
                <li key={entry.moveId}>
                  <strong>{moveDisplay(entry.moveId).name}</strong> ({entry.requirement}){' '}
                  {entry.replacesMoveId === null ? 'ocupa um golpe livre' : `no lugar de ${moveDisplay(entry.replacesMoveId).name}`} ·{' '}
                  <span className={styles.gain}>+{entry.gainPercent}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className={styles.wide}>
        <MemberDetails member={member} individual={individual} opponents={result.opponents} onOpenCalculation={onOpenCalculation} />
      </div>
    </section>
  );
}
