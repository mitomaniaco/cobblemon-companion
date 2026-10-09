import type {CSSProperties} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {abilityName, dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {BattlePlanEntry, BattlePlanResult, BattleSimulation} from '../../platform/api';
import {Button, HpBar, ItemIcon, StatusMessage} from '../../ui';
import {
  BATTLE_PLAN_DOUBLES_TEXT,
  battlePlanBagLabel,
  battleSimulationStepLabel,
  battleSimulationSummary,
  hpPercent,
  battlePlanDamageLabel,
  battlePlanFirstToActLabel,
  battlePlanRiskKindLabel,
} from './battle-plan-model';
import type {BattlePlanController} from './useBattlePlan';
import styles from './BattlePlanSection.module.css';

export interface BattlePlanSectionProps {
  /** Sem membros no time do guia não há o que planejar; o pedido nem sai. */
  hasTeam: boolean;
  plan: BattlePlanController;
  /** Nome do indivíduo do time pelo UUID, para o respondedor e o lead. */
  individualName(uuid: string, fallbackSpeciesId: string): string;
}

function Risks({risks}: {risks: BattlePlanResult['trainerRisks']}) {
  if (risks.length === 0) return null;
  return (
    <ul className={styles.risks}>
      {risks.map((risk) => (
        <li key={`${risk.kind}-${risk.text}`} data-kind={risk.kind}>
          <span className={styles.riskKind}>{battlePlanRiskKindLabel(risk.kind)}</span>
          <span>{risk.text}</span>
        </li>
      ))}
    </ul>
  );
}

function EntryRow({
  entry,
  index,
  individualName,
}: {
  entry: BattlePlanEntry;
  index: number;
  individualName: BattlePlanSectionProps['individualName'];
}) {
  const opponent = speciesDisplay(entry.speciesId, 'normal');
  const blocked = entry.status === 'bloqueado';
  return (
    <li className={styles.entry} data-status={entry.status} style={{'--entry-index': index} as CSSProperties}>
      <div className={styles.entryHeader}>
        <span className={styles.entryNumber}>{index + 1}</span>
        <h4 className={styles.entryName}>
          {opponent.name} <span className={styles.muted}>Nv. {entry.level}</span>
        </h4>
        <span className={styles.muted}>Habilidade: {abilityName(entry.ability)}</span>
      </div>

      {entry.heldItemAlternatives.length > 0 && (
        <p className={styles.alternatives}>
          <span className={styles.muted}>{entry.heldItemAlternatives.length > 1 ? 'Itens possíveis' : 'Item'}:</span>
          {entry.heldItemAlternatives.map((itemId, itemIndex) => (
            <span key={itemId} className={styles.alternative}>
              {itemIndex > 0 && <span className={styles.muted}>ou</span>}
              <ItemIcon itemDexId={dexId(itemId)} />
              {itemLabel(itemId)}
            </span>
          ))}
        </p>
      )}

      {blocked || entry.responder === null ? (
        <p className={styles.blocked}>
          <strong>Confronto bloqueado.</strong> {entry.blockedReason ?? 'Mecânica fora do catálogo ou do adaptador.'}
        </p>
      ) : (
        <>
          {entry.partialReason && <p className={styles.partial}>{entry.partialReason}</p>}
          <dl className={styles.facts}>
            <div>
              <dt>Respondedor</dt>
              <dd>
                {individualName(entry.responder.uuid, entry.responder.speciesId)} com {moveDisplay(entry.responder.moveId).name}
              </dd>
            </div>
            {entry.dealt && (
              <div>
                <dt>Você causa</dt>
                <dd>
                  {moveDisplay(entry.dealt.moveId).name}: {battlePlanDamageLabel(entry.dealt)}
                </dd>
              </div>
            )}
            {entry.received && (
              <div>
                <dt>Você recebe</dt>
                <dd>
                  {moveDisplay(entry.received.moveId).name}: {battlePlanDamageLabel(entry.received)}
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

      <Risks risks={entry.risks} />
    </li>
  );
}

function SimulationSection({
  simulation,
  individualName,
}: {
  simulation: BattleSimulation;
  individualName: BattlePlanSectionProps['individualName'];
}) {
  return (
    <section className={styles.simulation} aria-label="Simulação da batalha">
      <h4 className={styles.subtitle}>Simulação da batalha</h4>
      <p className={styles.simulationSummary}>{battleSimulationSummary(simulation)}</p>
      {simulation.steps.length > 0 && (
        <ol className={styles.steps} aria-label="Sequência simulada">
          {simulation.steps.map((step) => (
            <li key={`${step.opponentIndex}-${step.memberUuid}`} className={styles.step} data-outcome={step.outcome}>
              <span>
                {battleSimulationStepLabel(
                  step,
                  individualName(step.memberUuid, step.memberSpeciesId),
                  speciesDisplay(step.opponentSpeciesId, 'normal').name,
                )}
              </span>
              <HpBar
                total={step.memberMaxHp}
                minDamage={step.memberMaxHp - step.memberHpAfter}
                maxDamage={step.memberMaxHp - step.memberHpAfter}
                label={`HP de ${individualName(step.memberUuid, step.memberSpeciesId)} depois: ${hpPercent(step.memberHpAfter, step.memberMaxHp)}%`}
              />
            </li>
          ))}
        </ol>
      )}
      {simulation.remaining.length > 0 && (
        <ul className={styles.remaining} aria-label="Membros restantes">
          {simulation.remaining.map((member) => (
            <li key={member.uuid}>
              {individualName(member.uuid, member.speciesId)}: {hpPercent(member.hp, member.maxHp)}%
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanBody({result, individualName}: {result: BattlePlanResult; individualName: BattlePlanSectionProps['individualName']}) {
  const bag = battlePlanBagLabel(result.trainer, itemLabel);
  return (
    <div className={styles.plan}>
      <h3 className={styles.title}>Plano de batalha contra {result.trainer.name}</h3>

      {result.status === 'fora-do-escopo' ? (
        <StatusMessage tone="info" title={BATTLE_PLAN_DOUBLES_TEXT}>
          {result.scopeReason ?? 'O plano cobre apenas batalhas singles.'}
        </StatusMessage>
      ) : (
        <>
          {result.lead ? (
            <section className={styles.lead} aria-label="Sugestão de lead">
              <strong>Sugestão de lead: {individualName(result.lead.uuid, result.lead.speciesId)}</strong>
              <span>{result.lead.reason}</span>
            </section>
          ) : (
            result.entries[0]?.status === 'bloqueado' && (
              <section className={styles.lead} aria-label="Sugestão de lead">
                <span>
                  Sem sugestão de lead: o primeiro adversário ({speciesDisplay(result.entries[0].speciesId, 'normal').name}) está bloqueado
                  — {result.entries[0].blockedReason}
                </span>
              </section>
            )
          )}

          {(result.trainerRisks.length > 0 || bag) && (
            <section className={styles.trainerRisks} aria-label="Riscos do treinador">
              <h4 className={styles.subtitle}>Riscos do treinador</h4>
              {bag && (
                <p className={styles.bag}>
                  <span className={styles.riskKind}>Bolsa</span>
                  <span>{bag}</span>
                </p>
              )}
              <Risks risks={result.trainerRisks} />
            </section>
          )}

          <ol className={styles.entries} aria-label="Confronto por adversário">
            {result.entries.map((entry, index) => (
              <EntryRow key={entry.opponentId} entry={entry} index={index} individualName={individualName} />
            ))}
          </ol>

          {result.simulation && <SimulationSection simulation={result.simulation} individualName={individualName} />}
        </>
      )}

      <section className={styles.notes} aria-label="Hipóteses e limites do plano">
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
              ? 'Lead, respondedor por adversário e riscos do líder. As hipóteses aparecem junto do plano.'
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
            {[0, 1, 2].map((index) => (
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
