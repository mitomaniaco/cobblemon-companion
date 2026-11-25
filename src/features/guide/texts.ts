import {dexId} from '../../domain/dex';
import texts from '../../../data/guide/texts.json';

type MoveText = {
  pp: number | null;
  /** Precisão em % (1-100). `null` = o dado não traz número: golpe que nunca erra (`accuracy: true` no Showdown), golpe sem teste de precisão ou golpe fora do catálogo. Nunca 0. */
  accuracy: number | null;
  description: string | null;
};
const moves: Record<string, MoveText> = texts.moves;
const abilities: Record<string, string> = texts.abilities;
const NO_TEXT: MoveText = {pp: null, accuracy: null, description: null};

/** PP base, precisão e descrição em português de um golpe; sem dados vira `{pp: null, accuracy: null, description: null}`. */
export function moveText(moveId: string): MoveText {
  return moves[dexId(moveId)] ?? NO_TEXT;
}

export function abilityDescription(abilityId: string): string | null {
  return abilities[dexId(abilityId)] ?? null;
}
