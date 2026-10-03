import {describe, expect, it} from 'vitest';
import {
  applyResponse,
  beginComparison,
  cancelComparison,
  initialFlowState,
  type ProductResult,
  updateForm,
} from '../src/domain/compare-flow';

const result: ProductResult = {
  status: 'condicional',
  reason: 'unresolved-conditions',
  current: {moveId: 'cobblemon:spark', min: 36, max: 42, targetHP: 50, remainingHP: 14},
  candidate: {moveId: 'cobblemon:thunderbolt', min: 50, max: 58, targetHP: 50, remainingHP: 0},
  conditions: ['unknown-ability-excluded-from-calculation'],
  gains: [{metric: 'enemyHP', before: 14, after: 0, target: 'cobblemon:floatzel', condition: 'minimum-roll'}],
  losses: [],
  traceability: {
    snapshotId: 'offline-companion-e2e-v1',
    sourceIds: ['fixture-snapshot'],
    evidenceIds: ['OFFLINE-ADAPTER-E1'],
    analysisId: 'analysis-1',
    inputDigest: 'a'.repeat(64),
    engineVersion: 'offline-smogon-calc-0.11.0/adapter-v2',
    policyVersion: 'pairwise-evidence-v1',
  },
  limits: ['um alvo'],
};

describe('fluxo de comparação', () => {
  it('transforma formulário em request e aplica o resultado correspondente', () => {
    const started = beginComparison(initialFlowState(), 'job-0-1');
    expect('request' in started).toBe(true);
    if (!('request' in started)) return;
    expect(started.request.form.candidateMove).toBe('cobblemon:thunderbolt');
    expect(started.request.revision).toBe(0);
    const completed = applyResponse(started.state, {status: 'current', jobId: 'job-0-1', result});
    expect(completed.phase).toBe('result');
    expect(completed.result?.candidate.min).toBe(50);
  });

  it('invalida o resultado quando o formulário muda e ignora resposta atrasada', () => {
    const started = beginComparison(initialFlowState(), 'job-old');
    expect('request' in started).toBe(true);
    if (!('request' in started)) return;
    const edited = updateForm(started.state, {targetLevel: 21});
    const late = applyResponse(edited, {status: 'current', jobId: 'job-old', result});
    expect(late.result).toBeNull();
    expect(late.revision).toBe(1);
    expect(late.phase).toBe('idle');
  });

  it('não publica resultado depois do cancelamento', () => {
    const started = beginComparison(initialFlowState(), 'job-cancel');
    expect('request' in started).toBe(true);
    if (!('request' in started)) return;
    const cancelled = cancelComparison(started.state);
    const late = applyResponse(cancelled, {status: 'current', jobId: 'job-cancel', result});
    expect(cancelled.phase).toBe('cancelled');
    expect(late.result).toBeNull();
    expect(late.phase).toBe('cancelled');
  });

  it('mantém a falha visível e recuperável', () => {
    const started = beginComparison(initialFlowState(), 'job-fail');
    expect('request' in started).toBe(true);
    if (!('request' in started)) return;
    const failed = applyResponse(started.state, {status: 'failed', jobId: 'job-fail', error: 'Formato fora do recorte'});
    expect(failed.phase).toBe('error');
    expect(failed.error).toBe('Formato fora do recorte');
    expect(failed.result).toBeNull();
  });
});
