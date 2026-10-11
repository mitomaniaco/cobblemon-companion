import {Check, Question, Warning} from '@phosphor-icons/react';
import {useState, type CSSProperties, type ReactNode} from 'react';
import {speciesDisplay} from '../../domain/dex';
import type {CaptureCandidate, CaptureGap, CaptureOwned, CapturePlanResult} from '../../platform/api';
import {Button, PokemonArtwork, StatusMessage, TypeBadge} from '../../ui';
import {
  captureBucketLabel,
  captureCatchableLabel,
  captureFirstPartyLevelLabel,
  captureGapStatus,
  captureLevelRangeLabel,
  captureOwnedWhereLabel,
  captureRequirementLabel,
  captureRequirementStatusLabel,
  captureRequirementTone,
  captureSpawnSummary,
  orderCaptureCandidates,
} from './capture-model';
import type {CapturePlanController} from './useCapturePlan';
import styles from './CaptureSection.module.css';

const REQUIREMENT_ICON = {ok: Check, warn: Warning, muted: Question} as const;

function Art({speciesId, className}: {speciesId: string; className: string}) {
  return (
    <div className={`${styles.art} ${className}`}>
      <PokemonArtwork speciesId={speciesId} formId="normal" variant="fill" />
    </div>
  );
}

function CandidateCard({candidate, index}: {candidate: CaptureCandidate; index: number}) {
  const species = speciesDisplay(candidate.speciesId, 'normal');
  const spawn = captureSpawnSummary(candidate.spawns);
  return (
    <li className={styles.candidate} data-catchable={candidate.catchable} style={{'--entry-index': index} as CSSProperties}>
      <header className={styles.candidateHead}>
        <strong className={styles.candidateName}>{species.name}</strong>
        <span className={styles.types}>
          {species.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
        </span>
        <span className={styles.catchable} data-catchable={candidate.catchable} title={candidate.catchableReason}>
          {captureCatchableLabel(candidate.catchable)}
        </span>
      </header>

      <div className={styles.candidateMain}>
        <Art speciesId={candidate.speciesId} className={styles.candidateArt} />
        {spawn === null ? (
          <p className={styles.muted}>Nenhum local de aparição conhecido.</p>
        ) : (
          <dl className={styles.facts} aria-label={`Onde aparece: ${species.name}`}>
            <dt>Nível</dt>
            <dd>{captureLevelRangeLabel(spawn)}</dd>
            <dt>Raridade</dt>
            <dd>{captureBucketLabel(spawn.bucket)}</dd>
            {spawn.conditions.length > 0 && (
              <>
                <dt>Condições</dt>
                <dd>{spawn.conditions.join(' · ')}</dd>
              </>
            )}
            <dt>Onde</dt>
            <dd>
              <ul className={styles.chips}>
                {spawn.biomes.map((biome) => (
                  <li key={biome} className={styles.chip}>
                    {biome}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        )}
      </div>

      <p className={styles.reason}>{candidate.reason}</p>

      {candidate.requirements.length > 0 && (
        <ul className={styles.requirements} aria-label={`Requisitos para capturar ${species.name}`}>
          {candidate.requirements.map((requirement) => {
            const tone = captureRequirementTone(requirement.status);
            const Icon = REQUIREMENT_ICON[tone];
            return (
              <li key={`${requirement.kind}-${requirement.text}`} className={styles.requirement} data-tone={tone}>
                <span className={styles.requirementIcon}>
                  <Icon aria-hidden="true" weight="bold" />
                </span>
                <span className={styles.requirementText}>{captureRequirementLabel(requirement)}</span>
                <span className={styles.requirementStatus} data-status={requirement.status}>
                  {captureRequirementStatusLabel(requirement.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function OwnedCard({owned}: {owned: CaptureOwned}) {
  const species = speciesDisplay(owned.speciesId, 'normal');
  return (
    <li className={styles.owned}>
      <Art speciesId={owned.speciesId} className={styles.ownedArt} />
      <div className={styles.ownedBody}>
        <strong>
          {species.name} · Nv. {owned.level}
        </strong>
        <span className={styles.muted}>{captureOwnedWhereLabel(owned.container)}</span>
        <span className={styles.ownedReason}>{owned.reason}</span>
      </div>
    </li>
  );
}

function OpponentSelector({gaps, selected, onSelect}: {gaps: CaptureGap[]; selected: number; onSelect(index: number): void}) {
  return (
    <fieldset className={styles.selector} aria-label="Adversários sem resposta">
      {gaps.map((gap, index) => {
        const name = speciesDisplay(gap.speciesId, 'normal').name;
        return (
          <button
            key={gap.opponentId}
            type="button"
            className={styles.selectorButton}
            data-status={captureGapStatus(gap)}
            aria-pressed={index === selected}
            aria-label={`Contra ${name}, Nv. ${gap.level}`}
            title={`${name} · Nv. ${gap.level}`}
            onClick={() => onSelect(index)}
          >
            <Art speciesId={gap.speciesId} className={styles.selectorArt} />
          </button>
        );
      })}
    </fieldset>
  );
}

function GapDetail({gap, firstPartyLevel, selector}: {gap: CaptureGap; firstPartyLevel: number | null; selector: ReactNode}) {
  const opponent = speciesDisplay(gap.speciesId, 'normal');
  const candidates = orderCaptureCandidates(gap.candidates);
  return (
    <li className={styles.gap}>
      <section className={styles.opponent} aria-label={`Contra ${opponent.name}`}>
        {selector}
        <header className={styles.opponentHead}>
          <Art speciesId={gap.speciesId} className={styles.opponentArt} />
          <div className={styles.opponentTitle}>
            <h4 className={styles.gapTitle}>Contra {opponent.name}</h4>
            <span className={styles.muted}>Nv. {gap.level}</span>
            <span className={styles.types}>
              {opponent.types.map((type) => (
                <TypeBadge key={type} type={type} size="sm" />
              ))}
            </span>
          </div>
        </header>

        <section aria-label="Você já tem" className={styles.ownedSection}>
          <h5 className={styles.subtitle}>Você já tem</h5>
          {gap.owned.length > 0 ? (
            <ul className={styles.ownedList}>
              {gap.owned.map((owned) => (
                <OwnedCard key={owned.uuid} owned={owned} />
              ))}
            </ul>
          ) : (
            <p className={styles.emptyOwned}>Ninguém na equipe nem no PC responde a este adversário.</p>
          )}
        </section>
      </section>

      <section className={styles.candidatesRegion} aria-label="Candidatos de captura">
        {candidates.length > 0 ? (
          <ul className={styles.candidates}>
            {candidates.map((candidate, index) => (
              <CandidateCard key={candidate.speciesId} candidate={candidate} index={index} />
            ))}
          </ul>
        ) : (
          <p className={styles.note}>{gap.note ?? 'Nenhum candidato com spawn natural conhecido para esta lacuna.'}</p>
        )}
        {candidates.length > 0 && gap.note !== null && <p className={styles.note}>{gap.note}</p>}
        <p className={styles.muted}>{captureFirstPartyLevelLabel(firstPartyLevel)}</p>
      </section>
    </li>
  );
}

function Body({result}: {result: CapturePlanResult}) {
  const [selected, setSelected] = useState(0);
  const gap = result.gaps[Math.min(selected, result.gaps.length - 1)];
  if (gap === undefined) return <p className={styles.note}>Nenhuma lacuna para cobrir com capturas.</p>;
  return (
    <div className={styles.result}>
      <ol className={styles.gaps} aria-label="Lacunas do time">
        <GapDetail
          key={gap.opponentId}
          gap={gap}
          firstPartyLevel={result.firstPartyLevel}
          selector={
            result.gaps.length > 1 && (
              <OpponentSelector gaps={result.gaps} selected={Math.min(selected, result.gaps.length - 1)} onSelect={setSelected} />
            )
          }
        />
      </ol>
    </div>
  );
}

export function CaptureSection({captures, gapCount}: {captures: CapturePlanController; gapCount: number}) {
  const building = captures.phase === 'building';
  return (
    <div className={styles.root}>
      {gapCount === 0 && captures.phase !== 'ready' && (
        <p className={styles.note}>O time responde a todos os adversários de referência: não há lacuna para cobrir com capturas.</p>
      )}

      {building && (
        <div className={styles.building}>
          <div className={styles.progress} role="progressbar" aria-label="Montando as capturas recomendadas" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
            ))}
          </div>
          <Button variant="secondary" onPress={captures.cancel}>
            Cancelar
          </Button>
        </div>
      )}
      {captures.phase === 'error' && (
        <StatusMessage tone="error" title="As capturas recomendadas não foram montadas">
          {captures.error}
          <Button variant="secondary" onPress={captures.request}>
            Tentar de novo
          </Button>
        </StatusMessage>
      )}
      {captures.phase === 'canceled' && (
        <StatusMessage tone="info">
          Montagem das capturas cancelada.
          <Button variant="secondary" isDisabled={gapCount === 0} onPress={captures.request}>
            Montar de novo
          </Button>
        </StatusMessage>
      )}
      {captures.phase === 'ready' && captures.result && <Body result={captures.result} />}
    </div>
  );
}
