/** Estado de uma montagem cancelável (plano de batalha, evoluções) derivada do resultado do guia. */
export type JobState<Result> = {
  phase: 'idle' | 'building' | 'ready' | 'error' | 'canceled';
  result: Result | null;
  requestId: number;
  error: string | null;
};

export type JobAction<Result> =
  | {type: 'reset'}
  | {type: 'build-started'; requestId: number}
  | {type: 'build-succeeded'; requestId: number; result: Result}
  | {type: 'build-failed'; requestId: number; error: string}
  | {type: 'build-canceled'; requestId: number};

export function createJobState<Result>(): JobState<Result> {
  return {phase: 'idle', result: null, requestId: 0, error: null};
}

function isCurrentBuild<Result>(state: JobState<Result>, requestId: number): boolean {
  return state.phase === 'building' && state.requestId === requestId;
}

/** Só a montagem corrente é aplicada: respostas antigas ou posteriores ao cancelamento são ignoradas. */
export function jobReducer<Result>(state: JobState<Result>, action: JobAction<Result>): JobState<Result> {
  switch (action.type) {
    case 'reset':
      return {...createJobState<Result>(), requestId: state.requestId};
    case 'build-started':
      return {phase: 'building', result: null, requestId: action.requestId, error: null};
    case 'build-succeeded':
      return isCurrentBuild(state, action.requestId) ? {...state, phase: 'ready', result: action.result} : state;
    case 'build-failed':
      return isCurrentBuild(state, action.requestId) ? {...state, phase: 'error', error: action.error} : state;
    case 'build-canceled':
      return isCurrentBuild(state, action.requestId) ? {...state, phase: 'canceled'} : state;
  }
}
