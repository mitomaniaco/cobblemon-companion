import dexData from 'virtual:display-dex';
import catalogJson from '../../electron/lib/combat-compatibility.json';
import type {PlayerStat} from '../platform/api';

const POKEMON_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];
export type MoveCategory = 'Physical' | 'Special' | 'Status';

type MoveNameCatalog = {moves: Record<string, {name: string}>};
const moveNameCatalog: MoveNameCatalog = catalogJson as unknown as MoveNameCatalog;
const catalogMoves = moveNameCatalog.moves;
const TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);

/** Rótulo de um id importado do save sem passar pelo catálogo: tira o namespace e põe cada palavra em maiúscula. */
export function titleCaseId(id: string): string {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Id do dex do Showdown: sem namespace até `:`, minúsculas e só alfanuméricos. */
function dexId(id: string): string {
  return id
    .replace(/^[^:]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const isPokemonType = (value: string): value is PokemonType => TYPE_SET.has(value);

export function speciesDisplay(speciesId: string, formId: string): {name: string; types: PokemonType[]} {
  const entry = dexData.species[dexId(speciesId)];
  return {
    name: entry?.name ?? titleCaseId(speciesId),
    types: entry && formId === 'normal' ? entry.types.filter(isPokemonType) : [],
  };
}

export function moveDisplay(moveId: string): {name: string; type: PokemonType | null; category: MoveCategory | null; power: number | null} {
  const entry = dexData.moves[dexId(moveId)];
  const name = catalogMoves[moveId]?.name ?? entry?.name ?? titleCaseId(moveId);
  if (!entry) return {name, type: null, category: null, power: null};
  const category = entry.category === 'Physical' || entry.category === 'Special' || entry.category === 'Status' ? entry.category : null;
  return {
    name,
    type: isPokemonType(entry.type) ? entry.type : null,
    category,
    power: category === 'Status' || entry.basePower <= 0 ? null : entry.basePower,
  };
}

export function abilityName(id: string): string {
  return dexData.abilities[dexId(id)] ?? titleCaseId(id);
}

export function natureDisplay(id: string): {name: string; plus: PlayerStat | null; minus: PlayerStat | null} {
  return dexData.natures[dexId(id)] ?? {name: titleCaseId(id), plus: null, minus: null};
}
