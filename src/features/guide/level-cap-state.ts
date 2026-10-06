import {useEffect, useState} from 'react';
import {parseLevelCap} from './evolution-model';

export const LEVEL_CAP_STORAGE_KEY = 'companion.levelCap';
const LEVEL_CAP_DEBOUNCE_MS = 400;

type CapStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): CapStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Cap lembrado entre sessões: só texto que vira um cap válido (1–100) volta; lixo ou ausência = campo vazio (desconhecido). */
export function readStoredLevelCapInput(storage: CapStorage | null = browserStorage()): string {
  try {
    const stored = storage?.getItem(LEVEL_CAP_STORAGE_KEY) ?? '';
    return parseLevelCap(stored) === null ? '' : stored.trim();
  } catch {
    return '';
  }
}

/** Grava o cap válido; campo vazio ou inválido apaga a lembrança em vez de guardar lixo. */
export function writeStoredLevelCapInput(input: string, storage: CapStorage | null = browserStorage()): void {
  try {
    if (parseLevelCap(input) === null) storage?.removeItem(LEVEL_CAP_STORAGE_KEY);
    else storage?.setItem(LEVEL_CAP_STORAGE_KEY, input.trim());
  } catch {
    // Armazenamento indisponível: o cap vale só nesta sessão.
  }
}

export type LevelCapState = {
  input: string;
  setInput(value: string): void;
  /** Cap digitado e válido agora; `null` = desconhecido. */
  levelCap: number | null;
  /** Mesmo valor depois de uma pausa na digitação: é ele que remonta o time (digitar "5" a caminho de "55" não monta nada). */
  debouncedLevelCap: number | null;
};

export function useLevelCapState(): LevelCapState {
  const [input, setInput] = useState(() => readStoredLevelCapInput());
  const levelCap = parseLevelCap(input);
  const [debouncedLevelCap, setDebouncedLevelCap] = useState(levelCap);

  useEffect(() => {
    writeStoredLevelCapInput(input);
  }, [input]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLevelCap(levelCap), LEVEL_CAP_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [levelCap]);

  return {input, setInput, levelCap, debouncedLevelCap};
}
