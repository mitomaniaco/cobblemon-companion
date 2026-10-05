import {useId, type CSSProperties} from 'react';
import {speciesDisplay} from '../../domain/dex';
import {moveDisplay} from '../../domain/dex';
import type {EvolutionOption, EvolutionPlanMemberResult, EvolutionPlanResult} from '../../platform/api';
import {Button, StatusMessage} from '../../ui';
import {
  evolutionLevelCapLabel,
  evolutionMethodLabel,
  evolutionMoveChangeKindLabel,
  evolutionReachLabel,
  evolutionRequirementStatusLabel,
  evolutionSummary,
} from './evolution-model';
import type {EvolutionPlanController} from './useEvolutionPlan';
import styles from './EvolutionSection.module.css';

function OptionCard({option}: {option: EvolutionOption}) {
  const target = speciesDisplay(option.toSpeciesId, 'normal');
  return (
    <div className={styles.option}>
      <div className={styles.optionHeader}>
        <strong>→ {target.name}</strong>
        <span className={styles.chip}>{evolutionMethodLabel(option.method)}</span>
        <span className={styles.chip} data-reach={option.withinCap === null ? 'unknown' : option.withinCap ? 'within' : 'beyond'}>
          {evolutionReachLabel(option.withinCap)}
        </span>
      </div>
      <p className={styles.reach}>{option.reachText}</p>

      <ul className={styles.requirements} aria-label={`Requisitos para ${target.name}`}>
        {option.requirements.map((requirement) => (
          <li key={`${requirement.kind}-${requirement.text}`}>
            <span className={styles.status} data-status={requirement.status}>
              {evolutionRequirementStatusLabel(requirement.status)}
            </span>
            <span>{requirement.text}</span>
          </li>
        ))}
      </ul>

      {option.moveChanges.length > 0 && (
        <ul className={styles.moveChanges} aria-label={`Golpes que mudam ao evoluir para ${target.name}`}>
          {option.moveChanges.map((change) => (
            <li key={`${change.moveId}-${change.kind}`} data-kind={change.kind}>
              <span className={styles.status} data-kind={change.kind}>
                {evolutionMoveChangeKindLabel(change.kind)}
              </span>
              <span>
                <strong>{moveDisplay(change.moveId).name}</strong>
                {change.useful && <span className={styles.useful}>útil para o objetivo</span>}
                <span className={styles.note}>{change.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({member, index}: {member: EvolutionPlanMemberResult; index: number}) {
  const species = speciesDisplay(member.speciesId, member.formId);
  return (
    <li className={styles.member} data-status={member.status} style={{'--entry-index': index} as CSSProperties}>
      <h4 className={styles.memberName}>
        {species.name} <span className={styles.muted}>Nv. {member.level}</span>
      </h4>
      {member.status === 'bloqueado' && (
        <p className={styles.blocked}>
          <strong>Sugestão bloqueada.</strong> {member.blockedReason ?? 'Sem dados de evolução para esta forma.'}
        </p>
      )}
      {member.status === 'sem-evolução' && <p className={styles.muted}>Sem evolução prevista para esta forma.</p>}
      {member.status === 'evolui' &&
        member.options.map((option, optionIndex) => (
          <div key={option.toSpeciesId}>
            {optionIndex > 0 && <p className={styles.or}>ou</p>}
            <OptionCard option={option} />
          </div>
        ))}
    </li>
  );
}

function Body({result}: {result: EvolutionPlanResult}) {
  const summary = evolutionSummary(result.members);
  return (
    <div className={styles.result}>
      <p className={styles.muted}>
        {evolutionLevelCapLabel(result.levelCap)} {summary.evolving} com evolução, {summary.none} sem evolução e {summary.blocked}{' '}
        bloqueados.
      </p>
      <ol className={styles.members} aria-label="Evoluções por membro">
        {result.members.map((member, index) => (
          <MemberRow key={member.uuid} member={member} index={index} />
        ))}
      </ol>
      <section className={styles.notes} aria-label="Hipóteses e limites das evoluções">
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

export function EvolutionSection({evolutions, hasTeam}: {evolutions: EvolutionPlanController; hasTeam: boolean}) {
  const titleId = useId();
  const building = evolutions.phase === 'building';
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        Evoluções do time
      </h3>

      <div className={styles.controls}>
        {building ? (
          <Button variant="secondary" onPress={evolutions.cancel}>
            Cancelar
          </Button>
        ) : (
          <Button variant="secondary" isDisabled={!hasTeam} onPress={evolutions.request}>
            {evolutions.phase === 'ready' ? 'Calcular de novo' : 'Ver evoluções do time'}
          </Button>
        )}
      </div>
      {!hasTeam && <p className={styles.muted}>O guia não montou nenhum membro: não há o que evoluir.</p>}

      {building && (
        <div className={styles.building}>
          <div className={styles.progress} role="progressbar" aria-label="Montando as evoluções" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
            ))}
          </div>
        </div>
      )}
      {evolutions.phase === 'error' && (
        <StatusMessage tone="error" title="As evoluções não foram montadas">
          {evolutions.error}
        </StatusMessage>
      )}
      {evolutions.phase === 'canceled' && <StatusMessage tone="info">Montagem das evoluções cancelada.</StatusMessage>}
      {evolutions.phase === 'ready' && evolutions.result && <Body result={evolutions.result} />}
    </section>
  );
}
