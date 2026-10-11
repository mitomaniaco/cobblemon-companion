import type {CSSProperties} from 'react';
import {ArrowUp, ArrowsLeftRight, CaretRight, Check, Package, Question, WarningCircle} from '@phosphor-icons/react';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import type {EvolutionOption, EvolutionPlanMemberResult, EvolutionPlanResult, EvolutionRequirement} from '../../platform/api';
import {Button, MoveChip, MovePpMeta, PokemonArtwork, StatusMessage, TypeIcon, typeColorVar, typeInkVar, typeLabel} from '../../ui';
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
} from './evolution-model';
import type {EvolutionPlanController} from './useEvolutionPlan';
import styles from './EvolutionSection.module.css';
import {moveText} from './texts';

const MAX_MOVE_TILES = 2;
const MAX_CARD_COLUMNS = 4;
const NONE_GRID_COLUMNS = 3;

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
        <PokemonArtwork speciesId={speciesId} formId={formId} variant="detail" className={styles.fill} />
      </div>
      <strong className={styles.monName}>{species.name}</strong>
      <span className={styles.monCaption}>{caption}</span>
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
  const target = option === null ? null : speciesDisplay(option.toSpeciesId, 'normal');
  return (
    <li className={styles.card} data-status={status} style={style}>
      <header className={styles.head}>
        <span className={styles.method}>
          <MethodIcon method={option?.method ?? null} />
        </span>
        <span className={styles.methodLabel}>{option === null ? 'Sem previsão' : evolutionMethodLabel(option.method)}</span>
        <span className={styles.pill} data-status={status}>
          {evolutionStatusLabel(status)}
        </span>
      </header>

      <div className={styles.pair}>
        <Mon speciesId={member.speciesId} formId={member.formId} caption={`Nv. ${member.level}`} />
        {option !== null && (
          <>
            <span className={styles.arrow}>
              <CaretRight aria-hidden="true" weight="bold" />
            </span>
            <Mon speciesId={option.toSpeciesId} formId="normal" caption="Evolução" />
          </>
        )}
      </div>

      {option === null ? (
        <div className={styles.requirements}>
          <ul aria-label="Motivo do bloqueio">
            <li data-status="não verificado">
              <span className={styles.round}>
                <Question aria-hidden="true" weight="bold" />
              </span>
              <span>{member.blockedReason ?? 'Sem dados de evolução para esta forma.'}</span>
            </li>
          </ul>
        </div>
      ) : (
        <>
          <Requirements option={option} level={member.level} />
          {alternatives.length > 0 && (
            <p className={styles.alternatives}>
              Ou evolui para {alternatives.map((alternative) => speciesDisplay(alternative.toSpeciesId, 'normal').name).join(', ')}
            </p>
          )}
          <MoveImpact option={option} targetName={target?.name ?? ''} />
        </>
      )}
    </li>
  );
}

function NoneMember({member}: {member: EvolutionPlanMemberResult}) {
  const species = speciesDisplay(member.speciesId, member.formId);
  const style = {'--t': typeColorVar(species.types[0] ?? null)} as CSSProperties;
  return (
    <li className={styles.noneItem} style={style}>
      <div className={styles.noneArt}>
        <PokemonArtwork speciesId={member.speciesId} formId={member.formId} variant="detail" className={styles.fill} />
      </div>
      <span className={styles.noneText}>
        <strong>{species.name}</strong>
        <span>Nv. {member.level}</span>
      </span>
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
      <span className={styles.noneStatus}>{member.status === 'sem-evolução' ? 'Forma final' : 'Sem evolução prevista'}</span>
    </li>
  );
}

/** Ao lado de quem evolui: um cartão só com a lista de quem não evolui. */
function NoEvolutionCard({members, index}: {members: EvolutionPlanMemberResult[]; index: number}) {
  return (
    <li className={styles.noneCard} style={entryStyle(index)}>
      <header className={styles.head}>
        <span className={styles.methodLabel}>Sem evolução</span>
        <span className={styles.count}>{members.length}</span>
      </header>
      <ul className={styles.noneList} aria-label="Pokémon sem evolução" data-scroll-fade>
        {members.map((member) => (
          <NoneMember key={member.uuid} member={member} />
        ))}
      </ul>
    </li>
  );
}

/** Ninguém evolui: cartões grandes de todo o time, com o resumo no topo. */
function NobodyEvolves({members}: {members: EvolutionPlanMemberResult[]}) {
  const finals = members.filter((member) => member.status === 'sem-evolução').length;
  return (
    <>
      <p className={styles.summary}>
        <strong>Ninguém evolui agora</strong>
        {finals > 0 && <span>{finals === 1 ? '1 Pokémon já está na forma final' : `${finals} Pokémon já estão na forma final`}</span>}
      </p>
      <ol
        className={styles.noneGrid}
        aria-label="Pokémon sem evolução"
        style={{'--columns': Math.min(members.length, NONE_GRID_COLUMNS)} as CSSProperties}
        data-scroll-fade
      >
        {members.map((member) => (
          <NoneMember key={member.uuid} member={member} />
        ))}
      </ol>
    </>
  );
}

function Body({result}: {result: EvolutionPlanResult}) {
  const {cards, none} = splitEvolutionMembers(result.members);
  const columns = cards.length > MAX_CARD_COLUMNS ? Math.ceil(cards.length / 2) : cards.length;
  const gridStyle = {'--columns': columns, '--rows': cards.length > MAX_CARD_COLUMNS ? 2 : 1} as CSSProperties;
  return (
    <div className={styles.result}>
      <p className={styles.srOnly}>{evolutionLevelCapLabel(result.levelCap)}</p>
      {cards.length === 0 && none.length > 0 ? (
        <NobodyEvolves members={none} />
      ) : (
        <ol
          className={styles.grid}
          aria-label="Evoluções por membro"
          style={gridStyle}
          data-has-cards={cards.length > 0}
          data-has-none={none.length > 0}
        >
          {cards.map((card, index) => (
            <EvolutionCardView key={card.member.uuid} card={card} index={index} />
          ))}
          {none.length > 0 && <NoEvolutionCard members={none} index={cards.length} />}
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
