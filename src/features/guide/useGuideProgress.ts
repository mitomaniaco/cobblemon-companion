import {useEffect, useState} from 'react';
import type {CompanionApi, GuideProgress} from '../../platform/api';
import {describeError} from '../../platform/diagnostics';

export type GuideProgressState =
  | {status: 'loading'; value: null; error: null}
  | {status: 'ready'; value: GuideProgress; error: null}
  | {status: 'error'; value: null; error: string};

const INITIAL_STATE: GuideProgressState = {status: 'loading', value: null, error: null};

/**
 * Lê progresso de forma independente do snapshot e mantém a inscrição enquanto o shell está montado.
 * `sourceRevision` muda a cada troca de fonte: a demonstração não tem watcher, então a leitura precisa ser refeita.
 */
export function useGuideProgress(api: () => CompanionApi, sourceRevision: number): GuideProgressState {
  const [state, setState] = useState<GuideProgressState>(INITIAL_STATE);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sourceRevision é o gatilho de releitura; a demonstração não tem watcher e o efeito não lê o valor
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
      if (active) setState({status: 'error', value: null, error: describeError(error, 'O progresso do mundo não pôde ser lido.')});
    }

    void Promise.resolve()
      .then(() => api().readGuideProgress())
      .then((progress) => {
        if (active && !changedSinceRead) setState({status: 'ready', value: progress, error: null});
      })
      .catch((error: unknown) => {
        if (active && !changedSinceRead)
          setState({status: 'error', value: null, error: describeError(error, 'O progresso do mundo não pôde ser lido.')});
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [api, sourceRevision]);

  return state;
}
