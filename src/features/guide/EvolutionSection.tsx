import type {CSSProperties} from 'react';
import {ArrowUp, ArrowsLeftRight, CaretRight, Check, Package, Question, WarningCircle} from '@phosphor-icons/react';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import type {EvolutionOption, EvolutionPlanResult, EvolutionRequirement} from '../../platform/api';
import {Button, MoveChip, MovePpMeta, PokemonArtwork, StatusMessage, TypeDot, typeColorVar} from '../../ui';
import {
  evolutionLevelCapLabel,
  evolutionLevelProgress,
  evolutionMethodLabel,
  evolutionMoveChangeKindLabel,
  evolutionMoveTiming,
  evolutionRequirementStatusLabel,
  evolutionRequirementText,
  evolutionStatusLabel,
  orderedMoveChanges,
  splitEvolutionMembers,
  type EvolutionCard,
  type EvolutionCompact,
} from './evolution-model';
import type {EvolutionPlanController} from './useEvolutionPlan';
import styles from './EvolutionSection.module.css';
import {moveText} from './texts';

const MAX_MOVE_TILES = 2;

function entryStyle(index: number): CSSProperties {
  return {'--entry-index': index} as CSSProperties;
}

function MethodIcon({method}: {method: EvolutionOption['method'] | null}) {
  if (method === 'item_interact') return <Package aria-hidden="true" weight="bold" />;
  if (method === 'trade') return <ArrowsLeftRight aria-hidden="true" weight="bold" />;
  return <ArrowUp aria-hidden="true" weight="bold" />;
}

function RequirementIcon({status}: {status: EvolutionRequirement['status']}) {
  if (status === 'cumprido') return <Check aria-hidden="true" weight="bold" />;
  if (status === 'pendente') return <WarningCircle aria-hidden="true" weight="bold" />;
  return <Question aria-hidden="true" weight="bold" />;
}

function Mon({speciesId, formId, caption}: {speciesId: string; formId: string; caption: string}) {
  const species = speciesDisplay(speciesId, formId);
  return (
    <div className={styles.mon}>
      <div className={styles.art}>
        <PokemonArtwork speciesId={speciesId} formId={formId} variant="fill" />
      </div>
      <strong className={styles.monName}>{species.name}</strong>
      <span className={styles.monCaption}>{caption}</span>
      <span className={styles.types}>
        {species.types.map((type) => (
          <TypeDot key={type} type={type} size="md" />
        ))}
      </span>
    </div>
  );
}

function Requirements({option, level}: {option: EvolutionOption; level: number}) {
  const progress = evolutionLevelProgress(option, level);
  return (
    <div className={styles.requirements}>
      <ul aria-label="Requisitos da evolução">
        {option.requirements.map((requirement) => (
          <li key={`${requirement.kind}-${requirement.text}`} data-status={requirement.status}>
            <span className={styles.round}>
              <RequirementIcon status={requirement.status} />
            </span>
            <span>
              {evolutionRequirementText(requirement, level)}
              {requirement.status === 'não verificado' && (
                <span className={styles.unverified}> · {evolutionRequirementStatusLabel(requirement.status)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {option.withinCap === false && <p className={styles.reach}>{option.reachText}</p>}
      {progress !== null && (
        <div className={styles.progressRow}>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Nível atual até o exigido"
            aria-valuemin={0}
            aria-valuemax={progress.required}
            aria-valuenow={progress.current}
          >
            <span style={{width: `${progress.ratio * 100}%`}} />
          </div>
          <span className={styles.progressText}>
            {progress.current} / {progress.required}
          </span>
        </div>
      )}
    </div>
  );
}

function MoveImpact({option, targetName}: {option: EvolutionOption; targetName: string}) {
  const changes = orderedMoveChanges(option.moveChanges);
  if (changes.length === 0) return null;
  const shown = changes.slice(0, MAX_MOVE_TILES);
  return (
    <ul className={styles.moves} aria-label={`Golpes que mudam ao evoluir para ${targetName}`}>
      {shown.map((change) => {
        const display = moveDisplay(change.moveId);
        return (
          <li key={`${change.moveId}-${change.kind}`} className={styles.move} data-kind={change.kind}>
            <span className={styles.moveLabel}>
              <span className={styles.moveKind}>{evolutionMoveChangeKindLabel(change.kind)}</span>
              <span className={styles.moveTiming}>
                {change.useful && 'útil · '}
                {evolutionMoveTiming(change)}
              </span>
            </span>
            <span className={styles.tile}>
              <MoveChip name={display.name} type={display.type} category={display.category} power={display.power} variant="tile">
                <MovePpMeta pp={moveText(change.moveId).pp} ppUps={null} />
              </MoveChip>
            </span>
          </li>
        );
      })}
      {changes.length > shown.length && <li className={styles.moreMoves}>+ {changes.length - shown.length} golpes mudam</li>}
    </ul>
  );
}

function EvolutionCardView({card, index}: {card: EvolutionCard; index: number}) {
  const {member, option, alternatives, status} = card;
  const species = speciesDisplay(member.speciesId, member.formId);
  const style = {'--t': typeColorVar(species.types[0] ?? null), '--entry-index': index} as CSSProperties;
  const target = speciesDisplay(option.toSpeciesId, option.toFormId);
  return (
    <li className={styles.card} data-status={status} style={style}>
      <header className={styles.head}>
        <span className={styles.method}>
          <MethodIcon method={option.method} />
        </span>
        <span className={styles.methodLabel}>{evolutionMethodLabel(option.method)}</span>
        <span className={styles.pill} data-status={status}>
          {evolutionStatusLabel(status)}
        </span>
      </header>

      <div className={styles.pair}>
        <Mon speciesId={member.speciesId} formId={member.formId} caption={`Nv. ${member.level}`} />
        <span className={styles.arrow}>
          <CaretRight aria-hidden="true" weight="bold" />
        </span>
        <Mon speciesId={option.toSpeciesId} formId={option.toFormId} caption="Evolução" />
      </div>

      <div className={styles.info}>
        <Requirements option={option} level={member.level} />
        {alternatives.length > 0 && (
          <p className={styles.alternatives}>
            Ou evolui para{' '}
            {alternatives.map((alternative) => speciesDisplay(alternative.toSpeciesId, alternative.toFormId).name).join(', ')}
          </p>
        )}
        <MoveImpact option={option} targetName={target.name} />
      </div>
    </li>
  );
}

function CompactCard({entry, index}: {entry: EvolutionCompact; index: number}) {
  const {member, kind} = entry;
  const species = speciesDisplay(member.speciesId, member.formId);
  const style = {'--t': typeColorVar(species.types[0] ?? null), '--entry-index': index} as CSSProperties;
  const reason = member.blockedReason ?? 'Sem dados de evolução para esta forma.';
  return (
    <li className={styles.compact} data-kind={kind} style={style}>
      <div className={styles.compactArt}>
        <PokemonArtwork speciesId={member.speciesId} formId={member.formId} variant="fill" />
      </div>
      <strong className={styles.monName}>{species.name}</strong>
      <span className={styles.monCaption}>Nv. {member.level}</span>
      <span className={styles.types}>
        {species.types.map((type) => (
          <TypeDot key={type} type={type} size="md" />
        ))}
      </span>
      {kind === 'forma-final' && <span className={styles.compactStatus}>Forma final</span>}
      {kind === 'sem-previsao' && <span className={styles.compactStatus}>Sem evolução prevista</span>}
      {kind === 'bloqueado' && (
        <>
          <span className={styles.pill} data-status="bloqueado">
            {evolutionStatusLabel('bloqueado')}
          </span>
          <p className={styles.compactReason} title={reason}>
            {reason}
          </p>
        </>
      )}
    </li>
  );
}

function Summary({cards, compact}: {cards: EvolutionCard[]; compact: EvolutionCompact[]}) {
  const finals = compact.filter((entry) => entry.kind === 'forma-final').length;
  const unknown = compact.length - finals;
  const headline =
    cards.length === 0 ? 'Ninguém evolui agora' : cards.length === 1 ? '1 Pokémon pode evoluir' : `${cards.length} Pokémon podem evoluir`;
  return (
    <p className={styles.summary}>
      <strong>{headline}</strong>
      {finals > 0 && <span>{`${finals} sem evolução (forma final)`}</span>}
      {unknown > 0 && <span>{`${unknown} sem previsão`}</span>}
    </p>
  );
}

function Body({result}: {result: EvolutionPlanResult}) {
  const {cards, compact} = splitEvolutionMembers(result.members);
  const compactColumns = Math.max(2, Math.min(compact.length, cards.length > 0 ? 6 : 3));
  return (
    <div className={styles.result}>
      <p className={styles.srOnly}>{evolutionLevelCapLabel(result.levelCap)}</p>
      <Summary cards={cards} compact={compact} />
      {cards.length > 0 && (
        <ol
          className={styles.grid}
          aria-label="Evoluções por membro"
          style={{'--columns': Math.min(cards.length, 3)} as CSSProperties}
          data-has-compact={compact.length > 0 || undefined}
          data-scroll-fade
        >
          {cards.map((card, index) => (
            <EvolutionCardView key={card.member.uuid} card={card} index={index} />
          ))}
        </ol>
      )}
      {compact.length > 0 && (
        <ol
          className={styles.compactGrid}
          aria-label="Pokémon sem evolução"
          style={{'--columns': compactColumns} as CSSProperties}
          data-scroll-fade
        >
          {compact.map((entry, index) => (
            <CompactCard key={entry.member.uuid} entry={entry} index={cards.length + index} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function EvolutionSection({evolutions, hasTeam}: {evolutions: EvolutionPlanController; hasTeam: boolean}) {
  const building = evolutions.phase === 'building';
  return (
    <div className={styles.root}>
      {!hasTeam && <p className={styles.message}>O guia não montou nenhum membro: não há o que evoluir.</p>}

      {hasTeam && (evolutions.phase === 'idle' || evolutions.phase === 'canceled') && (
        <div className={styles.message}>
          {evolutions.phase === 'canceled'
            ? 'Montagem das evoluções cancelada.'
            : 'Veja o que cada Pokémon do time ainda precisa para evoluir.'}
          <Button variant="secondary" onPress={evolutions.request}>
            Ver evoluções do time
          </Button>
        </div>
      )}

      {building && (
        <div className={styles.building}>
          <div className={styles.progress} role="progressbar" aria-label="Montando as evoluções" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonCard} style={entryStyle(index)} />
            ))}
          </div>
          <Button variant="secondary" onPress={evolutions.cancel}>
            Cancelar
          </Button>
        </div>
      )}

      {evolutions.phase === 'error' && (
        <StatusMessage tone="error" title="As evoluções não foram montadas">
          {evolutions.error}
          <Button variant="secondary" onPress={evolutions.request}>
            Tentar de novo
          </Button>
        </StatusMessage>
      )}

      {evolutions.phase === 'ready' && evolutions.result && <Body result={evolutions.result} />}
    </div>
  );
}
