import type {PlayerStatFact} from '../platform/api';

/** Limites do jogo: IV 0–31, EV 0–252 por atributo e no máximo 510 no total. */
export const MAX_IV = 31;
export const MAX_EV = 252;
export const MAX_EV_TOTAL = 510;

export type StatFact = PlayerStatFact<number> | PlayerStatFact<number | null>;

export const UNKNOWN_STAT_TEXT = 'Não capturado';
export const NO_OVERRIDE_TEXT = 'Sem override';

/** Valor numérico conhecido; desconhecido e "sem override" são `null`, nunca zero. */
export function statValue(fact: StatFact): number | null {
  return fact.state === 'known' ? fact.value : null;
}

/** Texto de uma célula de IV ou EV: o número como o jogo mostra (EV até 252, IV até 31); desconhecido nunca vira 0. */
export function formatStat(fact: StatFact): string {
  if (fact.state === 'unknown') return UNKNOWN_STAT_TEXT;
  return fact.value === null ? NO_OVERRIDE_TEXT : String(fact.value);
}

/** Preenchimento 0–1 de uma barra; sem valor conhecido não há barra (`null`). */
export function statFill(fact: StatFact, max: number): number | null {
  const value = statValue(fact);
  return value === null ? null : Math.min(1, Math.max(0, value / max));
}

export type EvTotal = {
  /** Soma dos EVs; `null` quando algum dos seis é desconhecido (desconhecido não vale zero). */
  total: number | null;
  /** Quantos dos seis EVs estão capturados. */
  knownCount: number;
  text: string;
  fill: number | null;
};

export function summarizeEvs(facts: readonly StatFact[]): EvTotal {
  const values = facts.map(statValue);
  const knownCount = values.filter((value) => value !== null).length;
  if (knownCount < facts.length) {
    return {total: null, knownCount, text: `EVs incompletos (${knownCount}/${facts.length} capturados)`, fill: null};
  }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {total, knownCount, text: `EVs ${total}/${MAX_EV_TOTAL}`, fill: Math.min(1, total / MAX_EV_TOTAL)};
}
