import {useEffect, useRef, useState} from 'react';
import type {CompanionApi, GuideTrainerDetail} from '../../platform/api';

type DetailEntry = GuideTrainerDetail | 'loading' | 'error';

/** Detalhes (equipe e spawn) dos treinadores pedidos; cada id é buscado uma única vez e guardado enquanto o hook vive. */
export function useTrainerDetails(api: () => CompanionApi, trainerIds: readonly string[]): ReadonlyMap<string, DetailEntry> {
  const cacheRef = useRef(new Map<string, DetailEntry>());
  const mountedRef = useRef(false);
  const [, setVersion] = useState(0);
  const key = trainerIds.join('\n');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    for (const id of key === '' ? [] : key.split('\n')) {
      if (cache.has(id)) continue;
      cache.set(id, 'loading');
      void Promise.resolve()
        .then(() => api().guideTrainerDetail(id))
        .then((detail): DetailEntry => detail)
        .catch((): DetailEntry => 'error')
        .then((entry) => {
          cache.set(id, entry);
          if (mountedRef.current) setVersion((version) => version + 1);
        });
    }
  }, [key, api]);

  return new Map(trainerIds.map((id) => [id, cacheRef.current.get(id) ?? 'loading']));
}
