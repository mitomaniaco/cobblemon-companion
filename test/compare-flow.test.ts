import {describe, expect, it} from 'vitest';
import {
  applyResponse,
  beginComparison,
  cancelComparison,
  formErrors,
  INITIAL_FORM,
  initialFlowState,
  SUPPORTED_TARGET,
  type FlowState,
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

describe('formErrors validation', () => {
  it('rejects invalid targetSpecies', () => {
    const invalid = {
      targetSpecies: 'cobblemon:invalid' as const,
      targetLevel: 50,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(invalid as unknown as Parameters<typeof formErrors>[0]);
    expect(errors.targetSpecies).toBeDefined();
  });

  it('rejects targetLevel < 1', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 0,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetLevel).toBeDefined();
  });

  it('rejects targetLevel > 100', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 101,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetLevel).toBeDefined();
  });

  it('rejects non-integer targetLevel', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 50.5,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetLevel).toBeDefined();
  });

  it('rejects invalid candidateMove', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 50,
      candidateMove: 'cobblemon:invalid-move',
    };
    const errors = formErrors(form);
    expect(errors.candidateMove).toBeDefined();
    expect(errors.candidateMove).toContain('Thunderbolt');
  });

  it('accepts valid form with no errors', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 50,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetSpecies).toBeUndefined();
    expect(errors.targetLevel).toBeUndefined();
    expect(errors.candidateMove).toBeUndefined();
  });
});

describe('updateForm behavior', () => {
  it('increments revision and resets phase to idle', () => {
    const initial = initialFlowState();
    const updated = updateForm(initial, {targetLevel: 30});
    expect(updated.revision).toBe(1);
    expect(updated.phase).toBe('idle');
    expect(updated.form.targetLevel).toBe(30);
  });

  it('clears active, result, and error on form update', () => {
    const state = {
      ...initialFlowState(),
      phase: 'result' as const,
      active: {jobId: 'job-1', revision: 0},
      result: result,
      error: 'some error',
    };
    const updated = updateForm(state, {targetLevel: 25});
    expect(updated.active).toBeNull();
    expect(updated.result).toBeNull();
    expect(updated.error).toBeNull();
  });
});

describe('beginComparison validation', () => {
  it('rejects request when form has errors', () => {
    const invalid = {
      ...initialFlowState(),
      form: {
        targetSpecies: SUPPORTED_TARGET,
        targetLevel: 101,
        candidateMove: 'cobblemon:thunderbolt',
      },
    };
    const response = beginComparison(invalid, 'job-bad');
    expect('error' in response).toBe(true);
    if (!('error' in response)) return;
    expect(response.error).toBeTruthy();
    expect(response.state.phase).toBe('error');
  });

  it('sets phase to running and creates request on valid form', () => {
    const initial = initialFlowState();
    const response = beginComparison(initial, 'job-valid');
    expect('request' in response).toBe(true);
    if ('request' in response) {
      expect(response.state.phase).toBe('running');
      expect(response.state.active?.jobId).toBe('job-valid');
      expect(response.request.jobId).toBe('job-valid');
      expect(response.request.revision).toBe(0);
    }
  });

  it('clears error on valid request', () => {
    const withError = {
      ...initialFlowState(),
      error: 'previous error',
    };
    const response = beginComparison(withError, 'job-clear');
    if ('request' in response) {
      expect(response.state.error).toBeNull();
    }
  });
});

describe('applyResponse stale/revision handling', () => {
  it('ignores response when no active request', () => {
    const idle = initialFlowState();
    const result2 = {...result};
    const response = applyResponse(idle, {status: 'current', jobId: 'job-1', result: result2});
    expect(response.phase).toBe('idle');
    expect(response.result).toBeNull();
  });

  it('ignores response with mismatched jobId', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const result2 = {...result};
    const response = applyResponse(state, {status: 'current', jobId: 'job-wrong', result: result2});
    expect(response.phase).toBe('running');
    expect(response.result).toBeNull();
  });

  it('ignores response with mismatched revision', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    let state = started.state;
    state = updateForm(state, {targetLevel: 30});
    const result2 = {...result};
    const response = applyResponse(state, {status: 'current', jobId: 'job-1', result: result2});
    expect(response.phase).toBe('idle');
    expect(response.result).toBeNull();
  });
});

describe('applyResponse result handling', () => {
  it('publishes result only when status is current AND result exists', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const resultCopy = {...result};
    const response = applyResponse(state, {status: 'current', jobId: 'job-1', result: resultCopy});
    expect(response.phase).toBe('result');
    expect(response.result).not.toBeNull();
    expect(response.active).toBeNull();
  });

  it('does not publish when status is current but result is missing', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'current', jobId: 'job-1'});
    expect(response.phase).not.toBe('result');
    expect(response.result).toBeNull();
  });
});

describe('applyResponse cancel/timeout/stale', () => {
  it('transitions to cancelled on status cancelled', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'cancelled', jobId: 'job-1'});
    expect(response.phase).toBe('cancelled');
    expect(response.active).toBeNull();
    expect(response.result).toBeNull();
  });

  it('transitions to cancelled on status timeout', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'timeout', jobId: 'job-1'});
    expect(response.phase).toBe('cancelled');
  });

  it('transitions to cancelled on status stale', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'stale', jobId: 'job-1'});
    expect(response.phase).toBe('cancelled');
  });
});

describe('applyResponse error handling', () => {
  it('transitions to error on status failed with custom error', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'failed', jobId: 'job-1', error: 'Custom failure'});
    expect(response.phase).toBe('error');
    expect(response.error).toBe('Custom failure');
    expect(response.active).toBeNull();
  });

  it('uses default error message when response has no error text', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const response = applyResponse(state, {status: 'failed', jobId: 'job-1'});
    expect(response.phase).toBe('error');
    expect(response.error).toContain('não foi concluída');
  });
});

describe('cancelComparison behavior', () => {
  it('returns unchanged state when no active request', () => {
    const idle = initialFlowState();
    const result2 = cancelComparison(idle);
    expect(result2).toEqual(idle);
  });

  it('transitions to cancelled when request is active', () => {
    const started = beginComparison(initialFlowState(), 'job-1');
    if (!('request' in started)) return;
    const state = started.state;
    const cancelled = cancelComparison(state);
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.active).toBeNull();
    expect(cancelled.result).toBeNull();
  });
});

describe('targetLevel boundary cases', () => {
  it('accepts targetLevel = 1', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 1,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetLevel).toBeUndefined();
  });

  it('accepts targetLevel = 100', () => {
    const form = {
      targetSpecies: SUPPORTED_TARGET,
      targetLevel: 100,
      candidateMove: 'cobblemon:thunderbolt',
    };
    const errors = formErrors(form);
    expect(errors.targetLevel).toBeUndefined();
  });
});

describe('revision stale check', () => {
  it('ignores response when active revision is stale', () => {
    // Manually construct a state where active.revision doesn't match state.revision
    const staleState: FlowState = {
      revision: 1,
      form: {...INITIAL_FORM},
      phase: 'running',
      active: {jobId: 'job-stale', revision: 0}, // revision 0, but state.revision is 1
      result: null,
      error: null,
    };

    const resultCopy = {...result};
    const response = applyResponse(staleState, {status: 'current', jobId: 'job-stale', result: resultCopy});

    // Response should be ignored because active.revision (0) !== state.revision (1)
    expect(response.phase).toBe('running');
    expect(response.result).toBeNull();
    expect(response.active).not.toBeNull();
  });
});

describe('status must be exactly current for result', () => {
  it('does not set result when status is failed even with result data', () => {
    const initial = initialFlowState();
    const started = beginComparison(initial, 'job-failed-with-data');
    if (!('request' in started)) return;
    const state = started.state;

    const resultCopy = {...result};
    const response = applyResponse(state, {status: 'failed', jobId: 'job-failed-with-data', result: resultCopy, error: 'Error occurred'});

    expect(response.phase).toBe('error');
    expect(response.result).toBeNull();
  });

  it('does not set result when status is cancelled even with result data', () => {
    const initial = initialFlowState();
    const started = beginComparison(initial, 'job-cancelled-with-data');
    if (!('request' in started)) return;
    const state = started.state;

    const resultCopy = {...result};
    const response = applyResponse(state, {status: 'cancelled', jobId: 'job-cancelled-with-data', result: resultCopy});

    expect(response.phase).toBe('cancelled');
    expect(response.result).toBeNull();
  });
});
