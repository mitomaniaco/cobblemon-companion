import {ArrowRight} from '@phosphor-icons/react';
import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {
  applyResponse,
  beginComparison,
  cancelComparison,
  formErrors,
  initialFlowState,
  updateForm,
  type FlowResponse,
  type FlowState,
  type ProductResult,
} from '../../domain/compare-flow';
import {moveLabel} from '../../domain/catalog-labels';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import {getCompanionApi} from '../../platform/api';
import {Button, HpBar, PokeBallMark, Select, TypeBadge} from '../../ui';
import type {SelectOption} from '../../ui';
import styles from './DemoWorkspace.module.css';

const CANDIDATE_OPTIONS: readonly SelectOption[] = [
  {key: 'cobblemon:thunderbolt', label: 'Thunderbolt', description: 'Golpe aprendido na fixture offline.'},
  {key: 'cobblemon:spark', label: 'Spark (igual ao atual)', description: 'Inválido para uma comparação de mudança.'},
];

const CONDITION_LABELS: Record<string, string> = {
  'unknown-ability-excluded-from-calculation': 'Habilidade não capturada',
  'unknown-held-item-excluded-from-calculation': 'Item observado desconhecido',
  'unknown-saved-status-excluded-from-calculation': 'Status salvo não capturado',
  'unknown-tera-type-excluded-from-calculation': 'Tera não modelado',
  'minimum-roll': 'Roll mínimo',
};

const PIKACHU = speciesDisplay('cobblemon:pikachu', 'normal');
const FLOATZEL = speciesDisplay('cobblemon:floatzel', 'normal');

function resultStatusLabel(status: ProductResult['status']) {
  if (status === 'condicional') return 'Condicional';
  if (status === 'preferencia-no-recorte') return 'Preferência no recorte';
  if (status === 'manter') return 'Manter';
  return 'Inconclusivo';
}

function statusLabel(flow: FlowState) {
  if (flow.phase === 'running') return 'Calculando';
  if (flow.phase === 'error') return 'Não concluído';
  if (flow.phase === 'cancelled') return 'Cancelado';
  if (flow.phase === 'idle' && flow.revision > 0) return 'Compare novamente';
  return flow.result ? resultStatusLabel(flow.result.status) : 'Pronto para analisar';
}

function statusAnnouncement(flow: FlowState) {
  if (flow.phase === 'running') return 'Comparação em andamento. Você pode cancelar enquanto o cálculo estiver rodando.';
  if (flow.phase === 'cancelled') return 'Comparação cancelada. Execute novamente quando quiser retomar.';
  if (flow.phase === 'error') return 'Comparação não concluída. Leia a mensagem de erro para saber como corrigir e tentar novamente.';
  if (flow.result) {
    return `Resultado ${statusLabel(flow)}. ${moveLabel(flow.result.current.moveId)}: ${flow.result.current.min} a ${flow.result.current.max} de dano; ${moveLabel(flow.result.candidate.moveId)}: ${flow.result.candidate.min} a ${flow.result.candidate.max} de dano.`;
  }
  if (flow.revision > 0) return 'Entradas atualizadas. Execute a comparação para calcular novamente.';
  return 'Demonstração pronta para analisar.';
}

function DamageRow({label, move}: {label: string; move: ProductResult['current']}) {
  const display = moveDisplay(move.moveId);
  return (
    <article className={styles.damageSide}>
      <div className={styles.moveHeading}>
        <span className={styles.sideLabel}>{label}</span>
        <strong>{display.name}</strong>
        {display.type && <TypeBadge type={display.type} size="sm" />}
      </div>
      <p className={styles.damageValue}>
        <strong>{move.min}</strong>
        <span>–{move.max} dano</span>
      </p>
      <HpBar
        total={move.targetHP}
        minDamage={move.min}
        maxDamage={move.max}
        label={`Floatzel: ${move.remainingHP} HP restantes de ${move.targetHP} no roll mínimo`}
      />
      <p className={styles.damageMeta}>
        {move.remainingHP} HP restantes de {move.targetHP}
      </p>
    </article>
  );
}

function ResultPanel({result}: {result: ProductResult}) {
  return (
    <section className={styles.result} aria-labelledby="demo-result-title">
      <header className={styles.resultHeading}>
        <h3 id="demo-result-title">Dano em uma ação</h3>
        <span className={styles.resultBadge}>{resultStatusLabel(result.status)}</span>
      </header>

      <p className={styles.summary}>
        No roll mínimo, o HP restante após uma ação passa de <strong>{result.current.remainingHP}</strong> com{' '}
        {moveLabel(result.current.moveId)} para <strong>{result.candidate.remainingHP}</strong> com {moveLabel(result.candidate.moveId)}.
      </p>

      <fieldset className={styles.damageCompare} aria-label="Dano mínimo e HP restante, golpe atual e proposto">
        <DamageRow label="Atual" move={result.current} />
        <DamageRow label="Proposta" move={result.candidate} />
      </fieldset>
      <div className={styles.evidence}>
        <section className={styles.detailSection} aria-labelledby="demo-gains-title">
          <h4 id="demo-gains-title">Ganhos</h4>
          {result.gains.length > 0 ? (
            <ul>
              {result.gains.map((gain) => (
                <li key={`${gain.metric}-${gain.target}-${gain.condition}`}>
                  {gain.metric === 'enemyHP' ? 'HP restante' : gain.metric}: {gain.before} → {gain.after} · alvo{' '}
                  {gain.target === 'cobblemon:floatzel' ? 'Floatzel' : gain.target.replace(/^[^:]+:/, '').replace(/[_-]+/g, ' ')} ·{' '}
                  {CONDITION_LABELS[gain.condition] ?? gain.condition}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum ganho isolado registrado.</p>
          )}
        </section>
        <section className={styles.detailSection} aria-labelledby="demo-losses-title">
          <h4 id="demo-losses-title">Perdas</h4>
          {result.losses.length > 0 ? (
            <ul>
              {result.losses.map((loss) => (
                <li key={`${loss.metric}-${loss.target}-${loss.condition}`}>
                  {loss.metric === 'enemyHP' ? 'HP restante' : loss.metric}: {loss.before} → {loss.after} · alvo{' '}
                  {loss.target === 'cobblemon:floatzel' ? 'Floatzel' : loss.target.replace(/^[^:]+:/, '').replace(/[_-]+/g, ' ')} ·{' '}
                  {CONDITION_LABELS[loss.condition] ?? loss.condition}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma perda observada neste recorte.</p>
          )}
        </section>
      </div>

      <section className={styles.conditions} aria-labelledby="demo-conditions-title">
        <h4 id="demo-conditions-title">Condições que mantêm o resultado condicional</h4>
        <ul>
          {result.conditions.map((condition) => (
            <li key={condition}>{CONDITION_LABELS[condition] ?? condition}</li>
          ))}
        </ul>
      </section>

      <details className={styles.trace}>
        <summary>Rastreabilidade e limites</summary>
        <div className={styles.traceContent}>
          <dl className={styles.traceFacts}>
            <div>
              <dt>Motivo</dt>
              <dd>{result.reason}</dd>
            </div>
            <div>
              <dt>Snapshot</dt>
              <dd>{result.traceability.snapshotId}</dd>
            </div>
            <div>
              <dt>Fontes</dt>
              <dd>{result.traceability.sourceIds.join(', ')}</dd>
            </div>
            <div>
              <dt>Evidências</dt>
              <dd>{result.traceability.evidenceIds.join(', ')}</dd>
            </div>
            <div>
              <dt>Análise</dt>
              <dd>{result.traceability.analysisId}</dd>
            </div>
            <div>
              <dt>Digest</dt>
              <dd>
                <code>{result.traceability.inputDigest}</code>
              </dd>
            </div>
            <div>
              <dt>Motor</dt>
              <dd>{result.traceability.engineVersion}</dd>
            </div>
            <div>
              <dt>Política</dt>
              <dd>{result.traceability.policyVersion}</dd>
            </div>
          </dl>
          <div className={styles.limits}>
            <h4>Limites</h4>
            {result.limits.length > 0 ? (
              <ul>
                {result.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            ) : (
              <p>Nenhum limite adicional informado.</p>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

export interface DemoWorkspaceProps {
  isActive: boolean;
}

export function DemoWorkspace({isActive}: DemoWorkspaceProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const candidateFieldRef = useRef<HTMLDivElement>(null);
  const requestCounter = useRef(0);
  const [flow, setFlow] = useState(() => initialFlowState());
  const flowRef = useRef(flow);
  flowRef.current = flow;

  useEffect(() => {
    if (isActive) headingRef.current?.focus({preventScroll: true});
  }, [isActive]);

  function commit(next: FlowState) {
    flowRef.current = next;
    setFlow(next);
  }

  function cancelApiRequest(jobId: string) {
    try {
      void getCompanionApi()
        .cancel(jobId)
        .catch(() => undefined);
    } catch {
      // The local flow still invalidates the job if the bridge has already closed.
    }
  }

  function edit(patch: Partial<FlowState['form']>) {
    const active = flowRef.current.active;
    if (active) cancelApiRequest(active.jobId);
    commit(updateForm(flowRef.current, patch));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = flowRef.current;
    requestCounter.current += 1;
    const started = beginComparison(current, `demo-${current.revision}-${requestCounter.current}`);
    commit(started.state);
    if (!('request' in started)) {
      if (formErrors(flowRef.current.form).candidateMove) {
        candidateFieldRef.current?.querySelector('button')?.focus();
      }
      return;
    }

    try {
      const response = await getCompanionApi().calculate(started.request);
      commit(applyResponse(flowRef.current, response));
    } catch (error) {
      const response: FlowResponse = {
        status: 'failed',
        jobId: started.request.jobId,
        error: error instanceof Error ? error.message : 'Falha ao iniciar a comparação.',
      };
      commit(applyResponse(flowRef.current, response));
    }
  }

  function cancel() {
    const active = flowRef.current.active;
    if (!active) return;
    commit(cancelComparison(flowRef.current));
    cancelApiRequest(active.jobId);
  }

  const errors = formErrors(flow.form);
  const status = statusLabel(flow);

  return (
    <section className={styles.workspace} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          Demonstração offline
        </h2>
        <div className={styles.statusBlock}>
          <span className={styles.statusValue} data-phase={flow.phase}>
            {status}
          </span>
          <span className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
            {statusAnnouncement(flow)}
          </span>
        </div>
      </header>

      <div className={styles.contentGrid}>
        <section className={styles.formSection} aria-labelledby="demo-form-title">
          <h3 id="demo-form-title">Comparação fixa</h3>

          <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
            <fieldset className={styles.matchup} aria-label="Dados fixos da demonstração">
              <div className={styles.combatant}>
                <strong>{PIKACHU.name}</strong>
                {PIKACHU.types.map((type) => (
                  <TypeBadge key={type} type={type} />
                ))}
              </div>
              <ArrowRight className={styles.matchupArrow} aria-hidden="true" weight="bold" />
              <div className={styles.combatant}>
                <strong>{FLOATZEL.name}</strong>
                {FLOATZEL.types.map((type) => (
                  <TypeBadge key={type} type={type} />
                ))}
              </div>
              <span className={styles.matchupLevel}>Nível 20</span>
            </fieldset>

            <div ref={candidateFieldRef}>
              <Select
                label="Golpe proposto"
                options={CANDIDATE_OPTIONS}
                value={flow.form.candidateMove}
                onChange={(value) => edit({candidateMove: value ?? ''})}
                description="O recorte permite comparar Thunderbolt com o Spark atual."
                errorMessage={errors.candidateMove}
                isInvalid={Boolean(errors.candidateMove)}
              />
            </div>

            <fieldset className={styles.conditionChips} aria-label="Condições fixas do cálculo">
              <span>1 ação</span>
              <span>Roll mínimo</span>
              <span>Sem item</span>
              <span>Singles</span>
            </fieldset>

            {flow.error && (
              <div className={styles.errorMessage} role="alert">
                <strong>Comparação não concluída</strong>
                <p>{flow.error}</p>
              </div>
            )}

            <div className={styles.formActions}>
              <Button type="submit" variant="primary" isDisabled={flow.phase === 'running'}>
                {flow.phase === 'running' ? 'Comparando…' : 'Executar comparação'}
              </Button>
              {flow.phase === 'running' && (
                <Button type="button" variant="secondary" onPress={cancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
          <p className={styles.frozenNote}>Recorte congelado · fora dele: party completa, IA, trocas e batalha inteira.</p>
        </section>

        <div className={styles.resultColumn}>
          {flow.result ? (
            <ResultPanel result={flow.result} />
          ) : (
            <section className={styles.awaiting} aria-labelledby="demo-awaiting-title">
              <PokeBallMark className={styles.awaitingMark} />
              <h3 id="demo-awaiting-title">
                {flow.phase === 'cancelled'
                  ? 'Comparação cancelada'
                  : flow.phase === 'error'
                    ? 'O resultado não foi atualizado'
                    : flow.revision > 0
                      ? 'Entradas atualizadas'
                      : 'O resultado aparecerá aqui'}
              </h3>
              <p>
                {flow.phase === 'cancelled'
                  ? 'Execute a comparação novamente quando quiser retomar.'
                  : flow.phase === 'error'
                    ? 'Corrija os dados ou tente executar novamente.'
                    : flow.revision > 0
                      ? 'Execute a comparação para calcular com as entradas atuais.'
                      : 'Execute a mudança para ver dano, ganhos, perdas e rastreabilidade.'}
              </p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
