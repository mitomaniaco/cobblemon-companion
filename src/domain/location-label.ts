import type {PlayerLocation} from '../platform/api';

/** Posição exibida: slots são 0-based no save, 1-based na tela; a caixa aparece como vem do save. */
export function locationLabel(location: PlayerLocation): string {
  if (location.container === 'party') return `Equipe · slot ${location.slot + 1}`;
  const boxName = location.boxName ? ` · ${location.boxName}` : '';
  return `Caixa ${location.box}${boxName} · slot ${location.slot + 1}`;
}
