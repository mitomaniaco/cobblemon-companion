import {useId, type CSSProperties} from 'react';
import {speciesDisplay} from '../../domain/dex';
import type {CaptureCandidate, CaptureGap, CapturePlanResult} from '../../platform/api';
import {Button, StatusMessage, TypeBadge} from '../../ui';
import {
  captureBucketLabel,
  captureCatchableLabel,
  captureFirstPartyLevelLabel,
  captureLevelRangeLabel,
  captureOwnedWhereLabel,
} from './capture-model';
import type {CapturePlanController} from './useCapturePlan';
import styles from './CaptureSection.module.css';

function CandidateCard({candidate}: {candidate: CaptureCandidate}) {
  const species = speciesDisplay(candidate.speciesId, 'normal');
  return (
    <li className={styles.candidate}>
      <div className={styles.candidateHeader}>
        <strong>{species.name}</strong>
        {species.types.map((type) => (
          <TypeBadge key={type} type={type} size="sm" />
        ))}
        <span className={styles.catchable} data-catchable={candidate.catchable}>
          {captureCatchableLabel(candidate.catchable)}
        </span>
      </div>
      <p className={styles.text}>{candidate.reason}</p>
      <p className={styles.muted}>{candidate.catchableReason}</p>

      <ul className={styles.spawns} aria-label={`Onde aparece: ${species.name}`}>
        {candidate.spawns.map((spawn, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: spawns são uma lista derivada sem identificador próprio
          <li key={index}>
            <span className={styles.spawnHeader}>
              <span>{spawn.biomes.join(', ')}</span>
              <span className={styles.chip}>{captureLevelRangeLabel(spawn)}</span>
              <span className={styles.chip}>{captureBucketLabel(spawn.bucket)}</span>
              <span className={styles.chip}>{spawn.position}</span>
            </span>
            {spawn.conditions.length > 0 && <span className={styles.muted}>{spawn.conditions.join(' · ')}</span>}
          </li>
        ))}
      </ul>

      {candidate.requirements.length > 0 && (
        <ul className={styles.requirements} aria-label={`Requisitos para capturar ${species.name}`}>
          {candidate.requirements.map((requirement) => (
            <li key={`${requirement.kind}-${requirement.text}`}>
              <span className={styles.status} data-status={requirement.status}>
                {requirement.status}
              </span>
              <span>{requirement.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function GapRow({gap, index}: {gap: CaptureGap; index: number}) {
  const opponent = speciesDisplay(gap.speciesId, 'normal');
  return (
    <li className={styles.gap} style={{'--entry-index': index} as CSSProperties}>
      <h4 className={styles.gapTitle}>
        Lacuna contra {opponent.name} <span className={styles.muted}>Nv. {gap.level}</span>
      </h4>

      {gap.owned.length > 0 && (
        <section aria-label="Você já tem" className={styles.owned}>
          <h5 className={styles.subtitle}>Você já tem</h5>
          <ul className={styles.ownedList}>
            {gap.owned.map((owned) => (
              <li key={owned.uuid}>
                <span>
                  <strong>{speciesDisplay(owned.speciesId, 'normal').name}</strong> Nv. {owned.level}{' '}
                  <span className={styles.muted}>({captureOwnedWhereLabel(owned.container)})</span>
                </span>
                <span className={styles.text}>{owned.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gap.candidates.length > 0 && (
        <section aria-label="Candidatos de captura">
          <h5 className={styles.subtitle}>Candidatos de captura</h5>
          <ul className={styles.candidates}>
            {gap.candidates.map((candidate) => (
              <CandidateCard key={candidate.speciesId} candidate={candidate} />
            ))}
          </ul>
        </section>
      )}

      {gap.note !== null && <p className={styles.note}>{gap.note}</p>}
      {gap.candidates.length === 0 && gap.owned.length === 0 && gap.note === null && (
        <p className={styles.muted}>Nenhum candidato com spawn natural conhecido para esta lacuna.</p>
      )}
    </li>
  );
}

function Body({result}: {result: CapturePlanResult}) {
  return (
    <div className={styles.result}>
      <p className={styles.muted}>{captureFirstPartyLevelLabel(result.firstPartyLevel)}</p>
      {result.gaps.length === 0 ? (
        <p className={styles.text}>Nenhuma lacuna para cobrir com capturas.</p>
      ) : (
        <ol className={styles.gaps} aria-label="Lacunas do time">
          {result.gaps.map((gap, index) => (
            <GapRow key={gap.opponentId} gap={gap} index={index} />
          ))}
        </ol>
      )}
      <section className={styles.notes} aria-label="Hipóteses e limites das capturas">
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

export function CaptureSection({captures, gapCount}: {captures: CapturePlanController; gapCount: number}) {
  const titleId = useId();
  const building = captures.phase === 'building';
  const canRequest = gapCount > 0;
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        Capturas recomendadas
      </h3>

      <div className={styles.controls}>
        {building ? (
          <Button variant="secondary" onPress={captures.cancel}>
            Cancelar
          </Button>
        ) : (
          <Button variant="secondary" isDisabled={!canRequest} onPress={captures.request}>
            {captures.phase === 'ready' ? 'Calcular de novo' : 'Ver capturas recomendadas'}
          </Button>
        )}
        <p className={styles.muted}>
          {canRequest
            ? `${gapCount} ${gapCount === 1 ? 'adversário' : 'adversários'} sem resposta no time. Antes de capturar, aparece o que você já tem.`
            : 'O time responde a todos os adversários de referência: não há lacuna para cobrir com capturas.'}
        </p>
      </div>

      {building && (
        <div className={styles.building}>
          <div className={styles.progress} role="progressbar" aria-label="Montando as capturas recomendadas" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1].map((index) => (
              <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
            ))}
          </div>
        </div>
      )}
      {captures.phase === 'error' && (
        <StatusMessage tone="error" title="As capturas recomendadas não foram montadas">
          {captures.error}
        </StatusMessage>
      )}
      {captures.phase === 'canceled' && <StatusMessage tone="info">Montagem das capturas cancelada.</StatusMessage>}
      {captures.phase === 'ready' && captures.result && <Body result={captures.result} />}
    </section>
  );
}
