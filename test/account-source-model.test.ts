import {describe, expect, it} from 'vitest';
import {
  accountWriteTimestamp,
  formatAccountTimestamp,
  saveAccountWarnings,
  selectedSaveAccount,
  type SaveAccountsState,
} from '../src/app/account-source-model';

const selected = {
  id: 'account-old',
  name: 'Treinador Sintético',
  partyLastWriteAt: '2001-01-01T00:00:00Z',
  pcLastWriteAt: '2006-01-01T00:00:00Z',
  isSelected: true,
  selectable: true,
};
const current = {
  id: 'account-alternative',
  name: 'TREINADOR SINTÉTICO',
  partyLastWriteAt: '2003-01-01T00:00:00Z',
  pcLastWriteAt: null,
  isSelected: false,
  selectable: true,
};

describe('origem de save da conta', () => {
  it('resolve a conta selecionada pelo id e recua para isSelected', () => {
    expect(
      selectedSaveAccount({
        phase: 'ready',
        accounts: [selected, current],
        selectedAccountId: current.id,
        mostRecentlyWrittenAccountId: current.id,
      }),
    ).toEqual(current);
    expect(
      selectedSaveAccount({phase: 'ready', accounts: [selected], selectedAccountId: null, mostRecentlyWrittenAccountId: null}),
    ).toEqual(selected);
    expect(selectedSaveAccount({phase: 'loading'})).toBeNull();
  });

  it('avisa nome duplicado e uma conta alternativa mais recente', () => {
    const olderSelection = {...selected, pcLastWriteAt: null};
    const state: SaveAccountsState = {
      phase: 'ready',
      accounts: [olderSelection, current],
      selectedAccountId: olderSelection.id,
      mostRecentlyWrittenAccountId: current.id,
    };
    expect(saveAccountWarnings(state)).toEqual({sameName: true, newerAccount: current});
  });

  it('avisa uma entrada duplicada sem arquivos locais e a mantém sem data conhecida', () => {
    const unselectable = {
      id: 'account-cache-only',
      name: 'treinador sintético',
      partyLastWriteAt: null,
      pcLastWriteAt: null,
      isSelected: false,
      selectable: false,
    };
    const state: SaveAccountsState = {
      phase: 'ready',
      accounts: [selected, unselectable],
      selectedAccountId: selected.id,
      mostRecentlyWrittenAccountId: selected.id,
    };
    expect(saveAccountWarnings(state)).toEqual({sameName: true, newerAccount: null});
    expect(accountWriteTimestamp(unselectable)).toBeNull();
  });

  it('não avisa conta mais recente quando a selecionada é a mais recente nem para conta única', () => {
    expect(
      saveAccountWarnings({
        phase: 'ready',
        accounts: [selected, current],
        selectedAccountId: current.id,
        mostRecentlyWrittenAccountId: current.id,
      }),
    ).toEqual({sameName: true, newerAccount: null});
    expect(
      saveAccountWarnings({
        phase: 'ready',
        accounts: [selected],
        selectedAccountId: selected.id,
        mostRecentlyWrittenAccountId: selected.id,
      }),
    ).toEqual({sameName: false, newerAccount: null});
  });

  it('usa a gravação mais recente de party/PC e mantém ausências desconhecidas', () => {
    expect(accountWriteTimestamp(selected)).toBe(selected.pcLastWriteAt);
    expect(accountWriteTimestamp(current)).toBe(current.partyLastWriteAt);
    expect(accountWriteTimestamp({...selected, partyLastWriteAt: null, pcLastWriteAt: null})).toBeNull();
    expect(formatAccountTimestamp(null, 'pt-BR')).toBe('Desconhecida');
    expect(formatAccountTimestamp('not-a-date', 'pt-BR')).toBe('Desconhecida');
  });
});
