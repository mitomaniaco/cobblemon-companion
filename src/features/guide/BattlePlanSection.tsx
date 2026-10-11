import {useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {Brain, Check, CloudSun, Handbag, Minus, Package, Question, Star, Sword, X} from '@phosphor-icons/react';
import {itemLabel} from '../../domain/catalog-labels';
import {abilityName, dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {BattlePlanEntry, BattlePlanResult, BattlePlanRisk, BattleSimulationStep} from '../../platform/api';
import {Button, Dialog, HpBar, ItemIcon, PokemonArtwork, StatusMessage, TypeIcon, typeColorVar} from '../../ui';
import {
  BATTLE_PLAN_DOUBLES_TEXT,
  battleOpponentProgress,
  battlePartyAtEnd,
  battlePlanBagLabel,
  battlePlanDamageLabel,
  battlePlanFirstToActLabel,
  battlePlanRiskKindLabel,
  battlePlanRows,
  battleRiskGroups,
  battleSimulationSummary,
  blockedReasonLabel,
  hpPercent,
  simulationStopLabel,
} from './battle-plan-model';
import type {OpponentProgress, OpponentState, PlanRow} from './battle-plan-model';
import type {BattlePlanController} from './useBattlePlan';
import styles from './BattlePlanSection.module.css';

export interface BattlePlanSectionProps {
  /** Sem membros no time do guia não há o que planejar; o pedido nem sai. */
  hasTeam: boolean;
  plan: BattlePlanController;
  /** Nome do indivíduo do time pelo UUID, para o respondedor e o lead. */
  individualName(uuid: string, fallbackSpeciesId: string): string;
}

type IndividualName = BattlePlanSectionProps['individualName'];

const STATE_ICON: Record<OpponentState, ReactNode> = {
  vence: <Check aria-hidden="true" weight="bold" />,
  perde: <X aria-hidden="true" weight="bold" />,
  bloqueado: <Question aria-hidden="true" weight="bold" />,
  'sem-simulacao': <Minus aria-hidden="true" weight="bold" />,
};

const RISK_ICON: Record<BattlePlanRisk['kind'], ReactNode> = {
  bolsa: <Handbag aria-hidden="true" weight="fill" />,
  ia: <Brain aria-hidden="true" weight="fill" />,
  campo: <CloudSun aria-hidden="true" weight="fill" />,
  habilidade: <Star aria-hidden="true" weight="fill" />,
  item: <Package aria-hidden="true" weight="fill" />,
  golpe: <Sword aria-hidden="true" weight="fill" />,
};

function opponentCaption(progress: OpponentProgress, opponents: BattlePlanEntry[]): string {
  if (progress.state === 'vence') return `Cai no passo ${progress.stepNumber}`;
  if (progress.state === 'perde') return `Seu time cai no passo ${progress.stepNumber}`;
  if (progress.state === 'bloqueado') return 'Sem cálculo';
  const waiting = progress.waitingFor === null ? null : opponents[progress.waitingFor - 1];
  return waiting ? `Aguarda o ${progress.waitingFor}º` : 'Sem simulação';
}

function stateLabel(state: OpponentState): string {
  if (state === 'vence') return 'Você vence';
  if (state === 'perde') return 'Seu time perde';
  if (state === 'bloqueado') return 'Bloqueado';
  return 'Sem simulação';
}

function Art({speciesId}: {speciesId: string}) {
  return (
    <span className={styles.art}>
      <PokemonArtwork speciesId={speciesId} formId="normal" variant="slot" className={styles.fill} />
    </span>
  );
}

/** Barra da simulação: sólido = HP depois do passo; hachurado = o que se perdeu neste passo, a partir do HP herdado. */
function StepHp({name, before, after, max}: {name: string; before: number; after: number; max: number}) {
  const fell = after <= 0;
  return (
    <div className={styles.hp}>
      <span className={styles.hpLine}>
        <span className={styles.hpName}>{name}</span>
        <span className={styles.hpValue} data-fell={fell}>
          {fell ? 'cai' : `restam ${hpPercent(after, max)}%`}
        </span>
      </span>
      <div className={styles.bar}>
        <HpBar
          total={max}
          minDamage={max - before}
          maxDamage={max - after}
          label={`HP de ${name}: ${hpPercent(before, max)}% → ${hpPercent(after, max)}%`}
        />
      </div>
    </div>
  );
}

function StepRow({
  row,
  entry,
  individualName,
  leadReason,
}: {
  row: PlanRow & {step: BattleSimulationStep};
  entry: BattlePlanEntry;
  individualName: IndividualName;
  leadReason: string | null;
}) {
  const {step} = row;
  const member = individualName(step.memberUuid, step.memberSpeciesId);
  const opponent = speciesDisplay(step.opponentSpeciesId, 'normal').name;
  const turns = `${step.turns} ${step.turns === 1 ? 'turno' : 'turnos'}`;
  const acts = entry.responder?.uuid === step.memberUuid ? entry.firstToAct : null;
  const first =
    acts === 'jogador'
      ? `${member} age primeiro`
      : acts === 'adversário'
        ? `${opponent} age primeiro`
        : acts === 'incerto'
          ? 'Ordem incerta'
          : null;
  return (
    <div className={styles.step} data-outcome={step.outcome}>
      <span className={styles.bubble}>{row.stepNumber}</span>
      <span className={`${styles.side} ${styles.me}`}>
        <Art speciesId={step.memberSpeciesId} />
        <span className={styles.sideText}>
          <strong className={styles.sideName}>{member}</strong>
          <span
            className={styles.kind}
            data-kind={row.memberKind}
            title={row.memberKind === 'abre' ? (leadReason ?? undefined) : undefined}
          >
            {row.memberKind}
          </span>
        </span>
      </span>
      <span className={styles.vs}>VS</span>
      <span className={`${styles.side} ${styles.op}`}>
        <Art speciesId={step.opponentSpeciesId} />
        <span className={styles.sideText}>
          <strong className={styles.sideName}>{opponent}</strong>
          <span className={styles.muted}>Nv. {entry.level}</span>
          <span className={styles.kind} data-kind="adversario">
            {row.opponentKind}
          </span>
        </span>
      </span>
      <span className={styles.turns}>
        <strong>{turns}</strong>
        {first && <span className={styles.muted}>{first}</span>}
      </span>
      <div className={styles.bars}>
        <StepHp name={member} before={step.memberHpBefore} after={step.memberHpAfter} max={step.memberMaxHp} />
        <StepHp name={opponent} before={step.opponentHpBefore} after={step.opponentHpAfter} max={step.opponentMaxHp} />
      </div>
    </div>
  );
}

function PendingRow({index, entry, reason}: {index: number; entry: BattlePlanEntry; reason: string}) {
  const opponent = speciesDisplay(entry.speciesId, 'normal').name;
  return (
    <div className={styles.pending} data-blocked={entry.status === 'bloqueado'}>
      <span className={styles.bubble}>{index + 1}</span>
      <span className={`${styles.side} ${styles.me}`}>
        <Art speciesId={entry.speciesId} />
        <span className={styles.sideText}>
          <strong className={styles.sideName}>{opponent}</strong>
          <span className={styles.kind} data-kind="parado">
            não simulado
          </span>
        </span>
      </span>
      <span className={styles.reason}>{reason}</span>
    </div>
  );
}

function MoveLine({moveId}: {moveId: string}) {
  const move = moveDisplay(moveId);
  return (
    <span className={styles.moveLine}>
      {move.type && <TypeIcon type={move.type} className={styles.typeIcon} />}
      {move.name}
    </span>
  );
}

function DamageLine({damage}: {damage: NonNullable<BattlePlanEntry['dealt']>}) {
  return (
    <span className={styles.damage}>
      <MoveLine moveId={damage.moveId} />
      <HpBar total={damage.targetHP} minDamage={damage.min} maxDamage={damage.max} label={battlePlanDamageLabel(damage)} />
      <span className={styles.muted}>{battlePlanDamageLabel(damage)}</span>
    </span>
  );
}

function OpponentDetail({entry, individualName}: {entry: BattlePlanEntry; individualName: IndividualName}) {
  const {responder} = entry;
  const blocked = entry.status === 'bloqueado' || responder === null;
  return (
    <div className={styles.detail}>
      <p className={styles.detailHead}>
        <Art speciesId={entry.speciesId} />
        <span>Habilidade: {abilityName(entry.ability)}</span>
      </p>
      {entry.heldItemAlternatives.length > 0 && (
        <p className={styles.alternatives}>
          <span className={styles.muted}>{entry.heldItemAlternatives.length > 1 ? 'Itens possíveis' : 'Item'}:</span>
          {entry.heldItemAlternatives.map((itemId, itemIndex) => (
            <span key={itemId} className={styles.alternative}>
              {itemIndex > 0 && <span className={styles.muted}>ou</span>}
              <ItemIcon itemDexId={dexId(itemId)} className={styles.itemIcon} />
              {itemLabel(itemId)}
            </span>
          ))}
        </p>
      )}
      {blocked ? (
        <p className={styles.detailNote}>
          <strong>Confronto bloqueado.</strong> {blockedReasonLabel(entry.blockedReason)}
        </p>
      ) : (
        <>
          {entry.partialReason && <p className={styles.detailNote}>{entry.partialReason}</p>}
          <dl className={styles.facts}>
            <div>
              <dt>Quem enfrenta</dt>
              <dd>
                {individualName(responder.uuid, responder.speciesId)} com <MoveLine moveId={responder.moveId} />
              </dd>
            </div>
            {entry.dealt && (
              <div>
                <dt>Você causa</dt>
                <dd>
                  <DamageLine damage={entry.dealt} />
                </dd>
              </div>
            )}
            {entry.received && (
              <div>
                <dt>Você recebe</dt>
                <dd>
                  <DamageLine damage={entry.received} />
                </dd>
              </div>
            )}
            <div>
              <dt>Ordem de ação</dt>
              <dd data-order={entry.firstToAct ?? 'none'}>
                {battlePlanFirstToActLabel(entry.firstToAct)}
                {entry.actReason && <span className={styles.muted}> · {entry.actReason}</span>}
              </dd>
            </div>
          </dl>
        </>
      )}
      {entry.risks.length > 0 && (
        <ul className={styles.detailRisks}>
          {entry.risks.map((risk) => (
            <li key={`${risk.kind}-${risk.text}`}>
              <span className={styles.riskIcon}>{RISK_ICON[risk.kind]}</span>
              <span>{risk.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanBody({result, individualName}: {result: BattlePlanResult; individualName: IndividualName}) {
  const [selected, setSelected] = useState<number | null>(null);
  if (result.status === 'fora-do-escopo') {
    return (
      <div className={styles.plan}>
        <StatusMessage tone="info" title={BATTLE_PLAN_DOUBLES_TEXT}>
          {result.scopeReason ?? 'O plano cobre apenas batalhas singles.'}
        </StatusMessage>
      </div>
    );
  }

  const {entries, simulation} = result;
  const progress = battleOpponentProgress(entries, simulation);
  const rows = battlePlanRows(entries, simulation);
  const party = simulation ? battlePartyAtEnd(simulation) : [];
  const risks = battleRiskGroups(result, battlePlanBagLabel(result.trainer, itemLabel));
  const entryName = (entry: BattlePlanEntry) => speciesDisplay(entry.speciesId, 'normal').name;
  const selectedEntry = selected === null ? null : entries[selected];
  const leadReason = result.lead?.reason ?? null;

  const pendingReason = (row: PlanRow): string => {
    const entry = entries[row.opponentIndex];
    const waiting = progress[row.opponentIndex].waitingFor;
    if (entry.status === 'bloqueado') return blockedReasonLabel(entry.blockedReason);
    if (waiting !== null) return `Depende do que sobrar do duelo com ${entryName(entries[waiting - 1])}.`;
    return simulationStopLabel(simulation?.stopReason ?? null);
  };

  return (
    <div className={styles.plan}>
      <section className={styles.team} aria-label="Time do treinador">
        <h4 className={styles.heading}>Time de {result.trainer.name}</h4>
        <ol className={styles.opponents} aria-label="Confronto por adversário" data-scroll-fade>
          {entries.map((entry, index) => {
            const types = speciesDisplay(entry.speciesId, 'normal').types;
            const state = progress[index];
            return (
              <li
                key={entry.opponentId}
                className={styles.opponent}
                data-status={entry.status}
                data-state={state.state}
                style={{'--tint': typeColorVar(types[0] ?? null), '--entry-index': index} as CSSProperties}
              >
                <button
                  type="button"
                  className={styles.opponentButton}
                  aria-label={`${entryName(entry)}, Nv. ${entry.level}: ${stateLabel(state.state)}. Ver detalhes`}
                  onClick={() => setSelected(index)}
                >
                  <span className={styles.order}>{index + 1}</span>
                  <Art speciesId={entry.speciesId} />
                  <span className={styles.opponentText}>
                    <strong className={styles.sideName}>{entryName(entry)}</strong>
                    <span className={styles.muted}>{opponentCaption(state, entries)}</span>
                    <span className={styles.types}>
                      {types.map((type) => (
                        <TypeIcon key={type} type={type} className={styles.typeIcon} />
                      ))}
                    </span>
                  </span>
                  <span className={styles.ring} role="img" aria-label={stateLabel(state.state)}>
                    {STATE_ICON[state.state]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.simulation} aria-label="Simulação da batalha">
        <h4 className={styles.heading}>Simulação da batalha · quem entra, em quantos turnos e com quanta vida</h4>
        {simulation && <p className={styles.summary}>{battleSimulationSummary(simulation)}</p>}
        <ol className={styles.steps} aria-label="Sequência simulada" data-scroll-fade>
          {rows.map((row, index) => {
            const style = {'--entry-index': index} as CSSProperties;
            return row.step ? (
              <li key={`${row.opponentIndex}-${row.stepNumber}`} className={styles.stepSlot} style={style}>
                <StepRow
                  row={{...row, step: row.step}}
                  entry={entries[row.opponentIndex]}
                  individualName={individualName}
                  leadReason={leadReason}
                />
              </li>
            ) : (
              <li key={`${row.opponentIndex}-pending`} className={styles.stepSlot} style={style}>
                <PendingRow index={row.opponentIndex} entry={entries[row.opponentIndex]} reason={pendingReason(row)} />
              </li>
            );
          })}
        </ol>
      </section>

      <aside className={styles.side2} data-scroll-fade>
        {party.length > 0 && (
          <section className={styles.party} aria-label="Vida da equipe ao final">
            <h4 className={styles.heading}>Vida da equipe ao final</h4>
            <ul className={styles.partyList} aria-label="Membros restantes">
              {party.map((member) => (
                <li key={member.uuid} className={styles.member} data-state={member.state}>
                  <Art speciesId={member.speciesId} />
                  <div className={styles.memberText}>
                    <span className={styles.hpLine}>
                      <strong className={styles.sideName}>{individualName(member.uuid, member.speciesId)}</strong>
                      <span className={styles.hpValue} data-fell={member.state === 'caiu'}>
                        {member.state === 'caiu'
                          ? `cai no passo ${member.fallStep}`
                          : member.state === 'nao-entrou'
                            ? 'não entrou'
                            : `${hpPercent(member.hp, member.maxHp)}%`}
                      </span>
                    </span>
                    <div className={styles.bar}>
                      <HpBar
                        total={member.maxHp}
                        minDamage={member.maxHp - member.hp}
                        maxDamage={member.maxHp - member.hp}
                        label={`HP de ${individualName(member.uuid, member.speciesId)} no fim: ${hpPercent(member.hp, member.maxHp)}%`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {risks.length > 0 && (
          <section className={styles.risks} aria-label="Riscos do treinador">
            <h4 className={styles.heading}>Riscos da batalha</h4>
            <ul className={styles.riskList}>
              {risks.map((group) => (
                <li key={group.kind} className={styles.risk} data-kind={group.kind} title={group.texts.join('\n')}>
                  <span className={styles.riskIcon}>{RISK_ICON[group.kind]}</span>
                  <span className={styles.riskText}>
                    <strong>{battlePlanRiskKindLabel(group.kind)}</strong>
                    <span className={styles.muted}>
                      {group.opponentIds.length > 0
                        ? group.opponentIds.map((id) => speciesDisplay(id, 'normal').name).join(' · ')
                        : group.texts[0]}
                    </span>
                  </span>
                  <span className={styles.srOnly}>{group.texts.join(' ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <Dialog
        isOpen={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selectedEntry ? `${entryName(selectedEntry)} · Nv. ${selectedEntry.level}` : 'Adversário'}
      >
        {selectedEntry && <OpponentDetail entry={selectedEntry} individualName={individualName} />}
      </Dialog>
    </div>
  );
}

export function BattlePlanSection({plan, individualName, hasTeam}: BattlePlanSectionProps) {
  return (
    <section className={styles.section} aria-label="Plano de batalha">
      {plan.phase === 'idle' && (
        <div className={styles.offer}>
          <Button variant="secondary" isDisabled={!hasTeam} onPress={plan.request}>
            Ver plano de batalha
          </Button>
          <p className={styles.muted}>
            {hasTeam
              ? 'Quem abre a batalha, quem enfrenta cada adversário e os riscos do treinador. As hipóteses ficam em "Como calculamos".'
              : 'O guia não montou nenhum membro: não há plano de batalha para este objetivo.'}
          </p>
        </div>
      )}

      {plan.phase === 'building' && (
        <div className={styles.building}>
          <div className={styles.buildingBar}>
            <span>Montando o plano de batalha…</span>
            <Button variant="secondary" onPress={plan.cancel}>
              Cancelar
            </Button>
          </div>
          <div className={styles.progress} role="progressbar" aria-label="Montando o plano de batalha" />
          <div className={styles.skeleton} aria-busy="true">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className={styles.skeletonRow} style={{'--entry-index': index} as CSSProperties} />
            ))}
          </div>
        </div>
      )}

      {plan.phase === 'error' && (
        <div className={styles.offer}>
          <StatusMessage tone="error" title="O plano de batalha não foi montado">
            {plan.error}
          </StatusMessage>
          <Button variant="secondary" onPress={plan.request}>
            Tentar de novo
          </Button>
        </div>
      )}

      {plan.phase === 'canceled' && (
        <div className={styles.offer}>
          <StatusMessage tone="info">Montagem do plano cancelada.</StatusMessage>
          <Button variant="secondary" onPress={plan.request}>
            Ver plano de batalha
          </Button>
        </div>
      )}

      {plan.phase === 'ready' && plan.result && <PlanBody result={plan.result} individualName={individualName} />}
    </section>
  );
}
