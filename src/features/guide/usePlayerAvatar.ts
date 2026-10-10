import {useEffect, useRef, useState} from 'react';
import type {CompanionApi} from '../../platform/api';

/** Skin do jogador como data URL; lê uma vez, quando a tela do Guia abre. Qualquer falha vira `null` (a Poké Ball aparece no lugar). */
export function usePlayerAvatar(api: () => CompanionApi, active: boolean): string | null {
  const [avatar, setAvatar] = useState<string | null>(null);
  const requestedRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || requestedRef.current) return;
    requestedRef.current = true;
    void Promise.resolve()
      .then(() => api().readPlayerAvatar())
      .then((result) => result?.dataUrl ?? null)
      .catch(() => null)
      .then((dataUrl) => {
        if (mountedRef.current) setAvatar(dataUrl);
      });
  }, [active, api]);

  return avatar;
}
