import {useEffect, useState} from 'react';
import type {CompanionApi, GuideProgress} from '../../platform/api';

export type GuideProgressState =
  | {status: 'loading'; value: null; error: null}
  | {status: 'ready'; value: GuideProgress; error: null}
  | {status: 'error'; value: null; error: string};

const INITIAL_STATE: GuideProgressState = {status: 'loading', value: null, error: null};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'O progresso do mundo não pôde ser lido.';
}

/** Lê progresso de forma independente do snapshot e mantém a inscrição enquanto o shell está montado. */
export function useGuideProgress(api: () => CompanionApi): GuideProgressState {
  const [state, setState] = useState<GuideProgressState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let changedSinceRead = false;
    setState(INITIAL_STATE);
    let unsubscribe = () => {};

    try {
      unsubscribe = api().onProgressChanged((progress) => {
        changedSinceRead = true;
        if (active) setState({status: 'ready', value: progress, error: null});
      });
    } catch (error) {
      if (active) setState({status: 'error', value: null, error: errorMessage(error)});
    }

    void Promise.resolve()
      .then(() => api().readGuideProgress())
      .then((progress) => {
        if (active && !changedSinceRead) setState({status: 'ready', value: progress, error: null});
      })
      .catch((error: unknown) => {
        if (active && !changedSinceRead) setState({status: 'error', value: null, error: errorMessage(error)});
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  return state;
}
