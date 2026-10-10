import {dexId} from '../../domain/dex';
import texts from '../../../data/guide/texts.json';

type MoveText = {pp: number | null; description: string | null};
const moves: Record<string, MoveText> = texts.moves;
const abilities: Record<string, string> = texts.abilities;
const NO_TEXT: MoveText = {pp: null, description: null};

/** PP base e descrição em português de um golpe; sem dados vira `{pp: null, description: null}`. */
export function moveText(moveId: string): MoveText {
  return moves[dexId(moveId)] ?? NO_TEXT;
}

export function abilityDescription(abilityId: string): string | null {
  return abilities[dexId(abilityId)] ?? null;
}
