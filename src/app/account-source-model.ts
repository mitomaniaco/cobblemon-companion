export type SaveAccount = {
  id: string;
  name: string;
  partyLastWriteAt: string | null;
  pcLastWriteAt: string | null;
  isSelected: boolean;
  /** True only when at least one local party/PC save file is associated with this account. */
  selectable: boolean;
};

export type SaveAccountsResponse = {
  accounts: SaveAccount[];
  selectedAccountId: string | null;
  mostRecentlyWrittenAccountId: string | null;
};

/** Renderer-side view of the backend contract; API additions remain owned by the code worktree. */
export type SaveAccountApi = {
  listSaveAccounts(): Promise<SaveAccountsResponse>;
  selectSaveAccount(id: string): Promise<void>;
};

export type SaveAccountsState = {phase: 'loading'} | {phase: 'unavailable'} | {phase: 'error'} | ({phase: 'ready'} & SaveAccountsResponse);

export function selectedSaveAccount(state: SaveAccountsState): SaveAccount | null {
  if (state.phase !== 'ready') return null;
  return (
    state.accounts.find((account) => account.id === state.selectedAccountId) ?? state.accounts.find((account) => account.isSelected) ?? null
  );
}

export function accountWriteTimestamp(account: SaveAccount): string | null {
  const times = [account.partyLastWriteAt, account.pcLastWriteAt].filter(
    (value): value is string => value !== null && Number.isFinite(Date.parse(value)),
  );
  if (times.length === 0) return null;
  return times.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function sameAccountName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('pt-BR') === right.trim().toLocaleLowerCase('pt-BR');
}

export type SaveAccountWarnings = {sameName: boolean; newerAccount: SaveAccount | null};

export function saveAccountWarnings(state: SaveAccountsState): SaveAccountWarnings {
  const selected = selectedSaveAccount(state);
  if (!selected || state.phase !== 'ready') return {sameName: false, newerAccount: null};
  const sameName = state.accounts.some((account) => account.id !== selected.id && sameAccountName(account.name, selected.name));
  const newerAccount =
    state.accounts.find((account) => account.id === state.mostRecentlyWrittenAccountId && account.id !== selected.id) ?? null;
  return {sameName, newerAccount};
}

export function formatAccountTimestamp(value: string | null, locale: string, timeZone?: string): string {
  if (value === null) return 'Desconhecida';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Desconhecida';
  return new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'medium', ...(timeZone ? {timeZone} : {})}).format(timestamp);
}
