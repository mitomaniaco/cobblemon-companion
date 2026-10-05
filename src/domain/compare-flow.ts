export const SUPPORTED_TARGET = 'cobblemon:floatzel' as const;

export type ComparisonForm = {
  targetSpecies: typeof SUPPORTED_TARGET;
  targetLevel: number;
  candidateMove: string;
};

export type ComparisonRequest = {
  jobId: string;
  revision: number;
  form: ComparisonForm;
};

export type ProductResult = {
  status: 'condicional' | 'preferencia-no-recorte' | 'manter' | 'inconclusivo';
  reason: string;
  current: {moveId: string; min: number; max: number; targetHP: number; remainingHP: number};
  candidate: {moveId: string; min: number; max: number; targetHP: number; remainingHP: number};
  conditions: string[];
  gains: Array<{metric: string; before: number; after: number; target: string; condition: string}>;
  losses: Array<{metric: string; before: number; after: number; target: string; condition: string}>;
  traceability: {
    snapshotId: string;
    sourceIds: string[];
    evidenceIds: string[];
    analysisId: string;
    inputDigest: string;
    engineVersion: string;
    policyVersion: string;
  };
  limits: string[];
};

export type FlowResponse = {
  status: 'current' | 'stale' | 'cancelled' | 'timeout' | 'failed';
  jobId: string;
  result?: ProductResult;
  error?: string;
};

export type FlowState = {
  revision: number;
  form: ComparisonForm;
  phase: 'idle' | 'running' | 'result' | 'cancelled' | 'error';
  active: {jobId: string; revision: number} | null;
  result: ProductResult | null;
  error: string | null;
};

export const INITIAL_FORM: ComparisonForm = {
  targetSpecies: SUPPORTED_TARGET,
  targetLevel: 20,
  candidateMove: 'cobblemon:thunderbolt',
};

export function initialFlowState(form: ComparisonForm = INITIAL_FORM): FlowState {
  return {
    revision: 0,
    form,
    phase: 'idle',
    active: null,
    result: null,
    error: null,
  };
}

export function formErrors(form: ComparisonForm): Partial<Record<keyof ComparisonForm, string>> {
  const errors: Partial<Record<keyof ComparisonForm, string>> = {};
  if (form.targetSpecies !== SUPPORTED_TARGET) {
    errors.targetSpecies = 'O alvo Floatzel é o único alvo disponível nesta demonstração.';
  }
  if (!Number.isSafeInteger(form.targetLevel) || form.targetLevel < 1 || form.targetLevel > 100) {
    errors.targetLevel = 'Informe um nível inteiro entre 1 e 100.';
  }
  if (form.candidateMove !== 'cobblemon:thunderbolt') {
    errors.candidateMove = 'Escolha Thunderbolt para comparar uma mudança com Spark.';
  }
  return errors;
}

export function updateForm(state: FlowState, patch: Partial<ComparisonForm>): FlowState {
  return {
    ...state,
    revision: state.revision + 1,
    form: {...state.form, ...patch},
    phase: 'idle',
    active: null,
    result: null,
    error: null,
  };
}

export function beginComparison(
  state: FlowState,
  jobId: string,
): {state: FlowState; request: ComparisonRequest} | {state: FlowState; error: string} {
  const errors = formErrors(state.form);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    return {state: {...state, phase: 'error', error: firstError}, error: firstError};
  }
  const request: ComparisonRequest = {jobId, revision: state.revision, form: {...state.form}};
  return {
    state: {...state, phase: 'running', active: {jobId, revision: state.revision}, error: null},
    request,
  };
}

export function applyResponse(state: FlowState, response: FlowResponse): FlowState {
  if (!state.active || state.active.jobId !== response.jobId || state.active.revision !== state.revision) {
    return state;
  }
  if (response.status === 'current' && response.result) {
    return {...state, phase: 'result', active: null, result: response.result, error: null};
  }
  if (response.status === 'cancelled' || response.status === 'timeout' || response.status === 'stale') {
    return {...state, phase: 'cancelled', active: null, result: null, error: null};
  }
  return {
    ...state,
    phase: 'error',
    active: null,
    result: null,
    error: response.error || 'A comparação não foi concluída. Tente novamente.',
  };
}

export function cancelComparison(state: FlowState): FlowState {
  if (!state.active) return state;
  return {...state, phase: 'cancelled', active: null, result: null, error: null};
}
