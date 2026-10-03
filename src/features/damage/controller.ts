import {useCallback, useLayoutEffect, useReducer, useRef} from 'react';
import type {CompanionApi, PlayerIndividual, PlayerSnapshot, PlayerStat} from '../../platform/api';
import {
  buildRealDamageRequest,
  createDamagePlannerState,
  damagePlannerReducer,
  sameDamageIdentity,
  type DamageConfirmationKey,
  type DamagePlannerState,
  type DamageTargetDraft,
  type DamageWorkspaceIdentity,
} from './model';

export type DamagePlannerController = {
  state: DamagePlannerState;
  selectCandidate(moveId: string): void;
  updateTarget(patch: Partial<DamageTargetDraft>): void;
  updateStat(group: 'ivs' | 'evs', stat: PlayerStat, value: string): void;
  updateConfirmation(key: DamageConfirmationKey, checked: boolean): void;
  invalidateCalculation(): void;
  calculate(): Promise<void>;
};

export function useDamagePlanner(
  api: () => CompanionApi,
  individual: PlayerIndividual | null,
  snapshot: PlayerSnapshot | null,
  revision: number | string,
): DamagePlannerController {
  const identity: DamageWorkspaceIdentity = {individualUuid: individual?.uuid ?? null, revision};
  const [storedState, dispatch] = useReducer(damagePlannerReducer, identity, createDamagePlannerState);
  const latestIdentityRef = useRef(identity);
  const requestIdRef = useRef(0);
  latestIdentityRef.current = identity;

  useLayoutEffect(() => {
    dispatch({type: 'identity-changed', identity});
    requestIdRef.current += 1;
  }, [identity.individualUuid, identity.revision]);

  const state = sameDamageIdentity(storedState.identity, identity)
    ? storedState
    : damagePlannerReducer(storedState, {type: 'identity-changed', identity});

  const selectCandidate = useCallback((moveId: string) => {
    dispatch({type: 'candidate-selected', identity: latestIdentityRef.current, candidateMoveId: moveId});
  }, []);

  const updateTarget = useCallback((patch: Partial<DamageTargetDraft>) => {
    dispatch({type: 'target-updated', identity: latestIdentityRef.current, patch});
  }, []);

  const updateStat = useCallback((group: 'ivs' | 'evs', stat: PlayerStat, value: string) => {
    dispatch({type: 'stat-updated', identity: latestIdentityRef.current, group, stat, value});
  }, []);

  const updateConfirmation = useCallback((key: DamageConfirmationKey, checked: boolean) => {
    dispatch({type: 'confirmation-updated', identity: latestIdentityRef.current, key, checked});
  }, []);

  const invalidateCalculation = useCallback(() => {
    requestIdRef.current += 1;
    dispatch({type: 'calculation-invalidated', identity: latestIdentityRef.current});
  }, []);

  const calculate = useCallback(async () => {
    const calculationIdentity = latestIdentityRef.current;
    const request = buildRealDamageRequest(individual, snapshot, state);
    if (!request || !sameDamageIdentity(state.identity, calculationIdentity)) return;

    const requestId = ++requestIdRef.current;
    dispatch({type: 'calculation-started', identity: calculationIdentity, requestId});
    try {
      const response = await api().calculateRealDamage(request);
      if (requestIdRef.current !== requestId || !sameDamageIdentity(latestIdentityRef.current, calculationIdentity)) return;
      dispatch({type: 'calculation-succeeded', identity: calculationIdentity, requestId, result: response.result});
    } catch (cause) {
      if (requestIdRef.current !== requestId || !sameDamageIdentity(latestIdentityRef.current, calculationIdentity)) return;
      dispatch({
        type: 'calculation-failed',
        identity: calculationIdentity,
        requestId,
        error: cause instanceof Error ? cause.message : 'Não foi possível calcular. Atualize o save e revise os dados.',
      });
    }
  }, [api, individual, snapshot, state]);

  return {
    state,
    selectCandidate,
    updateTarget,
    updateStat,
    updateConfirmation,
    invalidateCalculation,
    calculate,
  };
}
