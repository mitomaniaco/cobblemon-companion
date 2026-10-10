import {useState} from 'react';
import type {CSSProperties} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {abilityName, dexId, moveDisplay, speciesBaseStats, speciesDisplay} from '../../domain/dex';
import type {GuidePartySlot, GuideResult, GuideTeamMember, PlayerIndividual, PlayerStat} from '../../platform/api';
import {Button, Dialog, ItemIcon, MoveChip, MovePpMeta, PokeBallMark, PokemonArtwork, TypeBadge, typeColorVar} from '../../ui';
import {guideMoveDamage, guideOpponentTurnsLabel} from './guide-model';
import styles from './TeamDetail.module.css';
import {abilityDescription, moveText} from './texts';

const ITEM_STATUS_LABEL = {tem: 'já segura', obter: 'obter', nenhum: 'sem item sugerido'} as const;

const STAT_ROWS: Array<{stat: PlayerStat; label: string; color: string}> = [
  {stat: 'hp', label: 'HP', color: '--type-grass'},
  {stat: 'atk', label: 'Ataque', color: '--type-fire'},
  {stat: 'def', label: 'Defesa', color: '--type-electric'},
  {stat: 'spa', label: 'At. Esp.', color: '--type-water'},
  {stat: 'spd', label: 'Df. Esp.', color: '--type-flying'},
  {stat: 'spe', label: 'Veloc.', color: '--type-psychic'},
];

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
  const statusMoves = member.moves.filter((move) => !move.evaluated);
  const opponentById = new Map(opponents.map((opponent) => [opponent.id, opponent]));
  return (
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
  );
}

interface TeamDetailProps {
  member: GuideTeamMember;
  slot: GuidePartySlot | undefined;
  individual: PlayerIndividual | undefined;
  result: Pick<GuideResult, 'opponents' | 'team'>;
  onOpenCalculation(uuid: string, move: GuideTeamMember['moves'][number]): void;
}

function MoveCard({
  member,
  move,
  individual,
  opponents,
}: {
  member: GuideTeamMember;
  move: GuideTeamMember['moves'][number];
  individual: PlayerIndividual | undefined;
  opponents: Opponents;
}) {
  const display = moveDisplay(move.id);
  const text = moveText(move.id);
  const equipped = individual?.equippedMoves.find((entry) => entry.id === move.id);
  const learned = equipped ? undefined : individual?.learnedMoves.find((entry) => entry.id === move.id);
  const pp = equipped ? equipped.pp : text.pp;
  const ppUps = equipped ? equipped.ppUps : (learned?.ppUps ?? null);
  const damage = guideMoveDamage(member, move.id).slice(0, 3);
  const opponentById = new Map(opponents.map((opponent) => [opponent.id, opponent]));
  return (
    <li className={styles.moveCard}>
      <div className={styles.moveTop}>
        <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="tile">
          <MovePpMeta pp={pp} ppUps={ppUps} />
        </MoveChip>
        <span className={styles.moveTag}>{equipped ? 'equipado' : 'aprendido'}</span>
      </div>
      {text.description !== null && <p className={styles.moveDescription}>{text.description}</p>}
      <div className={styles.damageRow}>
        {damage.length === 0 ? (
          <span className={styles.damageEmpty}>Não causa dano aos adversários</span>
        ) : (
          damage.map((entry) => {
            const opponent = opponentById.get(entry.opponentId);
            const name = opponent ? speciesDisplay(opponent.speciesId, 'normal').name : entry.opponentId;
            return (
              <span
                key={entry.opponentId}
                className={styles.damageCell}
                data-best={entry.best || undefined}
                title={entry.best ? `Melhor golpe contra ${name}` : undefined}
              >
                {opponent && (
                  <span className={styles.damageArt}>
                    <PokemonArtwork speciesId={opponent.speciesId} formId="normal" variant="slot" className={styles.fill} />
                  </span>
                )}
                <span className={styles.damageValue}>
                  {Math.round(entry.minPercent)}–{Math.round(entry.maxPercent)}%
                </span>
              </span>
            );
          })
        )}
      </div>
    </li>
  );
}

/** Coluna de detalhe do membro selecionado: banner, golpes, item e o que vale adquirir. */
export function TeamDetail({member, slot, individual, result, onOpenCalculation}: TeamDetailProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const species = speciesDisplay(member.speciesId, individual?.formId ?? 'normal');
  const evaluated = member.moves.filter((move) => move.evaluated).slice(0, 4);
  const abilityId = individual?.observed.ability ?? null;
  const abilityText = abilityId === null ? null : abilityDescription(abilityId);
  const baseStats = speciesBaseStats(member.speciesId, individual?.formId ?? 'normal');
  const hasAcquire = member.acquire.length > 0;
  const bannerStyle = {
    '--c1': typeColorVar(species.types[0] ?? null),
    '--c2': typeColorVar(species.types[1] ?? species.types[0] ?? null),
  } as CSSProperties;
  return (
    <section className={styles.panel} aria-label={`Detalhes de ${species.name}`}>
      <div className={styles.banner} style={bannerStyle}>
        <span className={styles.ring} aria-hidden="true">
          <PokeBallMark />
        </span>
        <div className={styles.bannerArt}>
          <PokemonArtwork speciesId={member.speciesId} formId={individual?.formId ?? 'normal'} variant="detail" className={styles.fill} />
        </div>
        <div className={styles.bannerInfo}>
          <h3 className={styles.name}>{species.name}</h3>
          <div className={styles.types}>
            {species.types.map((type) => (
              <TypeBadge key={type} type={type} size="md" />
            ))}
          </div>
          <span className={styles.level}>Nv. {member.level}</span>
          {slot?.role && <p className={styles.role}>{slot.role}</p>}
          <p className={styles.reason}>{member.reason}</p>
        </div>
        <div className={styles.bannerStats}>
          <div className={styles.abilityHeader}>
            <span className={styles.caption}>Habilidade</span>
            <Button variant="quiet" className={styles.detailsButton} onPress={() => setDetailsOpen(true)}>
              Ver detalhes
            </Button>
          </div>
          {abilityId === null ? (
            <strong className={styles.abilityName}>Habilidade não capturada</strong>
          ) : (
            <>
              <strong className={styles.abilityName}>{abilityName(abilityId)}</strong>
              {abilityText !== null && <p className={styles.abilityText}>{abilityText}</p>}
            </>
          )}
          {baseStats && (
            <div className={styles.stats} title="Atributos base da espécie">
              {STAT_ROWS.map((row) => (
                <div key={row.stat} className={styles.stat} style={{'--bar': `var(${row.color})`} as CSSProperties}>
                  <span>{row.label}</span>
                  <span className={styles.statBar}>
                    <i style={{width: `${Math.min(100, baseStats[row.stat] / 1.8)}%`}} />
                  </span>
                  <b>{baseStats[row.stat]}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog isOpen={detailsOpen} onOpenChange={setDetailsOpen} title={`Cálculo de ${species.name}`}>
        <MemberDetails member={member} individual={individual} opponents={result.opponents} onOpenCalculation={onOpenCalculation} />
      </Dialog>

      <ul className={styles.moves} aria-label="Golpes">
        {evaluated.map((move) => (
          <MoveCard key={`${move.source}-${move.id}`} member={member} move={move} individual={individual} opponents={result.opponents} />
        ))}
      </ul>

      <div className={styles.bottom} data-solo={hasAcquire ? undefined : true}>
        <section aria-label="Item" className={styles.card}>
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
        {hasAcquire && (
          <section aria-label="Vale adquirir" className={`${styles.card} ${styles.acquire}`}>
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
    </section>
  );
}
