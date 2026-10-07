import {useCallback, useEffect, useState} from 'react';
import type {CompanionApi} from '../platform/api';
import type {SaveAccount, SaveAccountApi, SaveAccountsResponse} from './account-source-model';

export type SaveAccountsUiState =
  | {phase: 'loading'}
  | {phase: 'unavailable'}
  | {phase: 'error'}
  | {phase: 'selection-refresh-error'}
  | (SaveAccountsResponse & {phase: 'ready'; selectingAccountId: string | null; selectionError: boolean});

const INITIAL_STATE: SaveAccountsUiState = {phase: 'loading'};

type AccountBridge = CompanionApi & Partial<SaveAccountApi>;

function accountBridge(api: () => CompanionApi): Partial<SaveAccountApi> {
  return api() as AccountBridge;
}

function readyState(accounts: SaveAccountsResponse, selectingAccountId: string | null = null, selectionError = false): SaveAccountsUiState {
  return {phase: 'ready', ...accounts, selectingAccountId, selectionError};
}

export function useSaveAccounts(api: () => CompanionApi, refreshSnapshot: () => Promise<void>) {
  const [state, setState] = useState<SaveAccountsUiState>(INITIAL_STATE);

  const reload = useCallback(async () => {
    const bridge = accountBridge(api);
    if (!bridge.listSaveAccounts || !bridge.selectSaveAccount) {
      setState({phase: 'unavailable'});
      return;
    }
    setState({phase: 'loading'});
    try {
      setState(readyState(await bridge.listSaveAccounts()));
    } catch {
      setState({phase: 'error'});
    }
  }, [api]);

  useEffect(() => {
    let active = true;
    const bridge = accountBridge(api);
    if (!bridge.listSaveAccounts || !bridge.selectSaveAccount) {
      setState({phase: 'unavailable'});
      return () => {
        active = false;
      };
    }
    setState({phase: 'loading'});
    void bridge.listSaveAccounts().then(
      (accounts) => {
        if (active) setState(readyState(accounts));
      },
      () => {
        if (active) setState({phase: 'error'});
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const selectAccount = useCallback(
    async (account: SaveAccount): Promise<boolean> => {
      const bridge = accountBridge(api);
      if (!bridge.selectSaveAccount || !bridge.listSaveAccounts) {
        setState({phase: 'unavailable'});
        return false;
      }
      setState((current) => (current.phase === 'ready' ? {...current, selectingAccountId: account.id, selectionError: false} : current));
      try {
        await bridge.selectSaveAccount(account.id);
      } catch {
        setState((current) =>
          current.phase === 'ready' ? {...current, selectingAccountId: null, selectionError: true} : {phase: 'error'},
        );
        return false;
      }

      let listRefreshSucceeded = false;
      try {
        const accounts = await bridge.listSaveAccounts();
        setState(readyState(accounts));
        listRefreshSucceeded = true;
      } catch {
        // The persisted selection changed, but cached accounts and timestamps are no longer trustworthy.
        setState({phase: 'selection-refresh-error'});
      }

      try {
        await refreshSnapshot();
      } catch {
        // A persisted choice is independent of snapshot refresh; useTrainerSession presents read failures.
      }
      return listRefreshSucceeded;
    },
    [api, refreshSnapshot],
  );

  return {state, reload, selectAccount};
}
