import {useId, type CSSProperties} from 'react';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import type {TrainingPlanMemberResult, TrainingPlanResult} from '../../platform/api';
import {
  Button,
  InfoTip,
  MoveChip,
  MovePpMeta,
  PokemonArtwork,
  StatusMessage,
  TypeIcon,
  typeColorVar,
  typeInkVar,
  typeLabel,
} from '../../ui';
import {
  TRAINING_CAP_ORIGIN_LABEL,
  TRAINING_EV_TOTAL_LIMIT,
  TRAINING_ROLE_LABEL,
  TRAINING_STAT_LABEL,
  TRAINING_STAT_SHORT_LABEL,
  trainingEvBars,
  trainingEvTotals,
  trainingLevelLabel,
  trainingMovesByLevel,
  trainingTrack,
} from './training-model';
import {moveText} from './texts';
import type {TrainingPlanController} from './useTrainingPlan';
import styles from './TrainingSection.module.css';

function Track({member}: {member: TrainingPlanMemberResult}) {
  const nodes = trainingTrack(member);
  if (nodes === null) return null;
  return (
    <ol className={styles.track} aria-label="Caminho de níveis">
      <li className={styles.line} aria-hidden="true" />
      {nodes.map((node) => {
        const first = node.moves[0];
        const display = first ? moveDisplay(first.moveId) : null;
        const names = node.moves.map((move) => moveDisplay(move.moveId).name);
        const label = `Nv. ${node.level}${names.length > 0 ? `: aprende ${names.join(', ')}` : node.isEnd ? ' (alvo)' : node.isStart ? ' (atual)' : ''}`;
        const style = {
          left: `${node.position * 100}%`,
          ...(display ? {'--node': typeColorVar(display.type), '--node-ink': typeInkVar(display.type)} : {}),
        } as CSSProperties;
        return (
          <li
            key={node.level}
            className={styles.node}
            style={style}
            data-kind={display ? 'move' : node.isStart ? 'start' : node.isEnd ? 'end' : 'plain'}
            data-end={node.isEnd ? 'true' : undefined}
            title={label}
            aria-label={label}
          >
            {display?.type ? <TypeIcon type={display.type} className={styles.nodeIcon} /> : node.level}
          </li>
        );
      })}
    </ol>
  );
}

function Moves({member, name}: {member: TrainingPlanMemberResult; name: string}) {
  if (member.moves.length === 0) {
    return <p className={styles.note}>Nenhum golpe novo por nível até o alvo.</p>;
  }
  return (
    <ul className={styles.moves} aria-label={`Golpes no caminho: ${name}`}>
      {trainingMovesByLevel(member.moves).map((move) => {
        const display = moveDisplay(move.moveId);
        return (
          <li key={`${move.moveId}-${move.level}`} className={styles.move}>
            <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="tile">
              <MovePpMeta pp={moveText(move.moveId).pp} ppUps={null} />
            </MoveChip>
            <span className={styles.moveSide}>
              <strong>Nv. {move.level}</strong>
              {move.useful && <span className={styles.useful}>útil para o objetivo</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EvPanel({member, name}: {member: TrainingPlanMemberResult; name: string}) {
  const {evs} = member;
  const determined = evs.status === 'sugerido';
  const totals = trainingEvTotals(evs.suggestedEvs);
  return (
    <section className={styles.evs} aria-label={`EVs de ${name}`}>
      <div className={styles.evHead}>
        <h5 className={styles.evTitle}>Pontos de esforço (EV)</h5>
        <span className={styles.key}>
          <span data-kind="current">Atual</span>
          {determined && <span data-kind="suggested">Sugerido</span>}
        </span>
      </div>
      {determined ? (
        <ul className={styles.evGrid}>
          {trainingEvBars(evs).map((bar) => (
            <li key={bar.stat} className={styles.ev} data-state={bar.state}>
              <span className={styles.evLabel}>
                {TRAINING_STAT_SHORT_LABEL[bar.stat]}
                <strong title={TRAINING_STAT_LABEL[bar.stat]}>
                  {bar.current === null ? 'não capturado' : bar.current}
                  {bar.suggested !== null && <small> / {bar.suggested}</small>}
                </strong>
              </span>
              <span
                className={styles.evBar}
                role="img"
                aria-label={`${TRAINING_STAT_LABEL[bar.stat]}: atual ${bar.current ?? 'não capturado'}${bar.suggested === null ? '' : `, sugerido ${bar.suggested}`}`}
                style={{'--suggested': bar.suggestedRatio, '--current': bar.currentRatio} as CSSProperties}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.evFoot}>
          <p className={styles.undetermined}>
            <strong>Distribuição não determinada.</strong>
          </p>
          <InfoTip label={`Por que não há distribuição: ${name}`}>
            <p>{evs.reason}</p>
          </InfoTip>
        </div>
      )}
      {determined && (
        <div className={styles.evFoot}>
          <p className={totals.withinLimits ? styles.evCaption : styles.invalid}>
            {totals.withinLimits
              ? `Soma sugerida ${totals.total}/${TRAINING_EV_TOTAL_LIMIT}`
              : 'Atenção: passa de 252 por atributo ou de 510 no total'}
          </p>
          <InfoTip label={`Por que esta distribuição: ${name}`}>
            <p>{evs.reason}</p>
            <p>Máximo de 252 por atributo e {TRAINING_EV_TOTAL_LIMIT} no total.</p>
            {evs.sources.length > 0 ? (
              <p>
                Rendem esses EVs:{' '}
                {evs.sources
                  .map(
                    (source) =>
                      `${speciesDisplay(source.speciesId, 'normal').name} (+${source.amount} ${TRAINING_STAT_SHORT_LABEL[source.stat]}${source.spawns.length === 0 ? ', sem spawn natural conhecido' : ''})`,
                  )
                  .join(' · ')}
              </p>
            ) : (
              <p>Nenhuma espécie com rendimento e spawn natural conhecidos.</p>
            )}
          </InfoTip>
        </div>
      )}
    </section>
  );
}

function MemberRow({member, index}: {member: TrainingPlanMemberResult; index: number}) {
  const species = speciesDisplay(member.speciesId, 'normal');
  const blocked = member.targetLevel === null;
  const style = {
    '--entry-index': index,
    '--tone': typeColorVar(species.types[0] ?? null),
  } as CSSProperties;
  return (
    <li
      className={styles.member}
      data-blocked={blocked ? 'true' : undefined}
      data-compact={blocked || member.targetLevel === member.level ? 'true' : undefined}
      style={style}
    >
      <div className={styles.identity}>
        <PokemonArtwork speciesId={member.speciesId} formId="normal" variant="slot" className={styles.art} />
        <div className={styles.idText}>
          <h4 className={styles.name}>{species.name}</h4>
          <span className={styles.role}>{TRAINING_ROLE_LABEL[member.evs.role]}</span>
          <span className={styles.types}>
            {species.types.map((type) => (
              <span
                key={type}
                className={styles.typeChip}
                style={{background: typeColorVar(type), color: typeInkVar(type)}}
                role="img"
                aria-label={typeLabel(type)}
              >
                <TypeIcon type={type} className={styles.typeIcon} />
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className={styles.path}>
        <p className={styles.levelLine}>
          <strong>{trainingLevelLabel(member)}</strong>
          {member.capOrigin === 'informado' && <span className={styles.origin}>{TRAINING_CAP_ORIGIN_LABEL.informado}</span>}
        </p>
        {blocked || member.targetLevel === member.level ? (
          <p className={styles.note} data-blocked={blocked ? 'true' : undefined}>
            {member.targetNote}
          </p>
        ) : (
          <>
            <Track member={member} />
            <Moves member={member} name={species.name} />
          </>
        )}
      </div>

      <EvPanel member={member} name={species.name} />
    </li>
  );
}

function Skeleton() {
  return (
    <div className={styles.members} aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
      ))}
    </div>
  );
}

export function TrainingSection({training, hasTeam}: {training: TrainingPlanController; hasTeam: boolean}) {
  const titleId = useId();
  const result: TrainingPlanResult | null = training.phase === 'ready' ? training.result : null;
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.visuallyHidden}>
        Treino até o level cap
      </h3>

      {training.phase === 'building' && (
        <>
          <div className={styles.progress} role="progressbar" aria-label="Montando o treino" />
          <Skeleton />
          <div className={styles.actions}>
            <Button variant="secondary" onPress={training.cancel}>
              Cancelar
            </Button>
          </div>
        </>
      )}
      {training.phase === 'error' && (
        <div className={styles.message}>
          <StatusMessage tone="error" title="O treino não foi montado">
            {training.error}
          </StatusMessage>
          <Button variant="secondary" isDisabled={!hasTeam} onPress={training.request}>
            Tentar de novo
          </Button>
        </div>
      )}
      {training.phase === 'canceled' && (
        <div className={styles.message}>
          <StatusMessage tone="info">Montagem do treino cancelada.</StatusMessage>
          <Button variant="secondary" isDisabled={!hasTeam} onPress={training.request}>
            Ver treino do time
          </Button>
        </div>
      )}
      {training.phase === 'idle' && (
        <div className={styles.message}>
          <p className={styles.note}>
            {hasTeam
              ? 'Mostra o caminho de cada Pokémon até o cap e os EVs sugeridos.'
              : 'O guia não montou nenhum membro: não há o que treinar.'}
          </p>
          <Button variant="secondary" isDisabled={!hasTeam} onPress={training.request}>
            Ver treino do time
          </Button>
        </div>
      )}
      {result && (
        <ol className={styles.members} aria-label="Treino por membro" data-scroll-fade>
          {result.members.map((member, index) => (
            <MemberRow key={member.uuid} member={member} index={index} />
          ))}
        </ol>
      )}
    </section>
  );
}
