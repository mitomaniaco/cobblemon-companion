import {useId, type CSSProperties} from 'react';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import type {TrainingEvSource, TrainingPlanMemberResult, TrainingPlanResult} from '../../platform/api';
import {Button, StatusMessage} from '../../ui';
import {
  TRAINING_CAP_ORIGIN_LABEL,
  TRAINING_EV_TOTAL_LIMIT,
  TRAINING_ROLE_LABEL,
  TRAINING_STAT_LABEL,
  trainingEvRows,
  trainingEvTotals,
  trainingLevelLabel,
} from './training-model';
import type {TrainingPlanController} from './useTrainingPlan';
import styles from './TrainingSection.module.css';

function SourceRow({source}: {source: TrainingEvSource}) {
  const species = speciesDisplay(source.speciesId, 'normal');
  return (
    <li>
      <strong>{species.name}</strong> rende +{source.amount} {TRAINING_STAT_LABEL[source.stat]}
      {source.spawns.length === 0 ? (
        <span className={styles.muted}> · sem spawn natural conhecido</span>
      ) : (
        <ul className={styles.spawns}>
          {source.spawns.map((spawn) => (
            <li key={`${spawn.biomes.join('|')}-${spawn.levelMin}-${spawn.levelMax}-${spawn.position}`}>
              {spawn.biomes.join(', ')} · Nv. {spawn.levelMin}–{spawn.levelMax}
              {spawn.conditions.length > 0 && <span className={styles.muted}> · {spawn.conditions.join(' · ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function EvBlock({member}: {member: TrainingPlanMemberResult}) {
  const {evs} = member;
  const rows = trainingEvRows(evs);
  const totals = trainingEvTotals(evs.suggestedEvs);
  return (
    <section className={styles.evs} aria-label={`EVs de ${speciesDisplay(member.speciesId, 'normal').name}`}>
      <h5 className={styles.subtitle}>EVs · papel: {TRAINING_ROLE_LABEL[evs.role]}</h5>
      {evs.status === 'não-determinado' ? (
        <p className={styles.undetermined}>
          <strong>Distribuição não determinada.</strong> {evs.reason}
        </p>
      ) : (
        <p className={styles.text}>{evs.reason}</p>
      )}

      {rows.length > 0 && (
        <table className={styles.evTable}>
          <caption className={styles.visuallyHidden}>EVs atuais e sugeridos</caption>
          <thead>
            <tr>
              <th scope="col">Atributo</th>
              <th scope="col">Atual</th>
              <th scope="col">Sugerido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stat}>
                <th scope="row">{TRAINING_STAT_LABEL[row.stat]}</th>
                <td>{row.current === null ? 'não capturado' : row.current}</td>
                <td>{row.suggested === null ? '—' : row.suggested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {evs.status === 'sugerido' && (
        <p className={totals.withinLimits ? styles.muted : styles.invalid}>
          {totals.withinLimits
            ? `Soma sugerida ${totals.total}/${TRAINING_EV_TOTAL_LIMIT} (máximo de 252 por atributo).`
            : 'Atenção: a distribuição recebida passa de 252 por atributo ou de 510 no total.'}
        </p>
      )}

      {evs.sources.length > 0 && (
        <div>
          <h5 className={styles.subtitle}>Espécies que rendem esses EVs</h5>
          <ul className={styles.sources}>
            {evs.sources.map((source) => (
              <SourceRow key={`${source.speciesId}-${source.stat}`} source={source} />
            ))}
          </ul>
        </div>
      )}
      {evs.status === 'sugerido' && evs.sources.length === 0 && (
        <p className={styles.muted}>Nenhuma espécie com rendimento e spawn natural conhecidos.</p>
      )}
    </section>
  );
}

function MemberRow({member, index}: {member: TrainingPlanMemberResult; index: number}) {
  const species = speciesDisplay(member.speciesId, 'normal');
  return (
    <li
      className={styles.member}
      data-undetermined={member.targetLevel === null ? 'true' : undefined}
      style={{'--entry-index': index} as CSSProperties}
    >
      <div className={styles.memberHeader}>
        <h4 className={styles.memberName}>{species.name}</h4>
        <span className={styles.chip}>{trainingLevelLabel(member)}</span>
        <span className={styles.chip} data-origin={member.capOrigin}>
          {TRAINING_CAP_ORIGIN_LABEL[member.capOrigin]}
        </span>
      </div>
      <p className={styles.text}>{member.targetNote}</p>

      {member.moves.length > 0 && (
        <ul className={styles.moves} aria-label={`Golpes no caminho: ${species.name}`}>
          {member.moves.map((move) => (
            <li key={`${move.moveId}-${move.level}`} data-useful={move.useful ? 'true' : undefined}>
              <span className={styles.moveLevel}>Nv. {move.level}</span>
              <span>{moveDisplay(move.moveId).name}</span>
              {move.useful && <span className={styles.useful}>útil para o objetivo</span>}
            </li>
          ))}
        </ul>
      )}
      {member.targetLevel !== null && member.moves.length === 0 && <p className={styles.muted}>Nenhum golpe novo por nível até o alvo.</p>}

      <EvBlock member={member} />
    </li>
  );
}

function Body({result}: {result: TrainingPlanResult}) {
  return (
    <div className={styles.result}>
      <ol className={styles.members} aria-label="Treino por membro">
        {result.members.map((member, index) => (
          <MemberRow key={member.uuid} member={member} index={index} />
        ))}
      </ol>
      <section className={styles.notes} aria-label="Hipóteses e limites do treino">
        <div>
          <h4 className={styles.subtitle}>Hipóteses</h4>
          <ul>
            {result.assumptions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className={styles.subtitle}>Limites</h4>
          <ul>
            {result.limits.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export function TrainingSection({training, hasTeam}: {training: TrainingPlanController; hasTeam: boolean}) {
  const titleId = useId();
  const building = training.phase === 'building';
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        Treino até o level cap
      </h3>

      <div className={styles.controls}>
        {building ? (
          <Button variant="secondary" onPress={training.cancel}>
            Cancelar
          </Button>
        ) : (
          <Button variant="secondary" isDisabled={!hasTeam} onPress={training.request}>
            {training.phase === 'ready' ? 'Calcular de novo' : 'Ver treino do time'}
          </Button>
        )}
        <p className={styles.muted}>
          {hasTeam
            ? 'Usa o cap efetivo acima, digitado ou lido do progresso. Não sugere passar do cap.'
            : 'O guia não montou nenhum membro: não há o que treinar.'}
        </p>
      </div>

      {building && (
        <div className={styles.building}>
          <div className={styles.progress} role="progressbar" aria-label="Montando o treino" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
            ))}
          </div>
        </div>
      )}
      {training.phase === 'error' && (
        <StatusMessage tone="error" title="O treino não foi montado">
          {training.error}
        </StatusMessage>
      )}
      {training.phase === 'canceled' && <StatusMessage tone="info">Montagem do treino cancelada.</StatusMessage>}
      {training.phase === 'ready' && training.result && <Body result={training.result} />}
    </section>
  );
}
