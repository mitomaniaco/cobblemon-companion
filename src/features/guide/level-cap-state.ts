import {useEffect, useState} from 'react';
import {parseLevelCap} from './evolution-model';

export const LEVEL_CAP_STORAGE_KEY = 'companion.levelCap';
const RESPECT_LEVEL_CAP_STORAGE_KEY = 'companion.respectLevelCap';
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

/** Toggle "Respeitar level cap": padrão ligado; só o valor explícito "false" desliga. */
export function readStoredRespectLevelCap(storage: CapStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(RESPECT_LEVEL_CAP_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeStoredRespectLevelCap(respect: boolean, storage: CapStorage | null = browserStorage()): void {
  try {
    if (respect) storage?.removeItem(RESPECT_LEVEL_CAP_STORAGE_KEY);
    else storage?.setItem(RESPECT_LEVEL_CAP_STORAGE_KEY, 'false');
  } catch {
    // Armazenamento indisponível: a escolha vale só nesta sessão.
  }
}

export type LevelCapState = {
  respectLevelCap: boolean;
  setRespectLevelCap(value: boolean): void;
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
  const [respectLevelCap, setRespectLevelCap] = useState(() => readStoredRespectLevelCap());

  useEffect(() => {
    writeStoredRespectLevelCap(respectLevelCap);
  }, [respectLevelCap]);

  useEffect(() => {
    writeStoredLevelCapInput(input);
  }, [input]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLevelCap(levelCap), LEVEL_CAP_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [levelCap]);

  return {input, setInput, levelCap, debouncedLevelCap, respectLevelCap, setRespectLevelCap};
}
