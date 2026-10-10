import type {PlayerStat} from '../platform/api';

// Dex de exibição em chunk próprio: fora do bundle principal; o módulo só termina de carregar depois dele.
const {default: dexData} = await import('virtual:display-dex');
// Catálogo compatível em chunk próprio, fora do bundle principal.
const {default: catalogJson} = await import('../../electron/lib/combat-compatibility.json');

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
export function dexId(id: string): string {
  return id
    .replace(/^[^:]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const isPokemonType = (value: string): value is PokemonType => TYPE_SET.has(value);

/** Entrada de forma alternativa no dex: o id do calc é o da espécie seguido do `formId` do save (`slowking` + `galar`). */
function formEntry(speciesId: string, formId: string): (typeof dexData.species)[string] | undefined {
  return dexData.species[`${dexId(speciesId)}${dexId(formId)}`];
}

/** Rótulo do chip de forma (`Galar`, `Low-Key`, `Bloodmoon`). Vazio para forma normal. */
export function formChipLabel(speciesId: string, formId: string): string {
  if (formId === 'unknown') return 'Forma desconhecida';
  if (formId === 'normal') return '';
  const entry = formEntry(speciesId, formId);
  const baseName = dexData.species[dexId(speciesId)]?.name;
  if (entry && baseName && entry.name.startsWith(`${baseName}-`)) return entry.name.slice(baseName.length + 1);
  return titleCaseId(formId);
}

/** Nome da espécie base e tipos da forma. Forma sem entrada no dex (inclusive `unknown`) fica sem tipos: nunca os da forma normal. */
export function speciesDisplay(speciesId: string, formId: string): {name: string; types: PokemonType[]} {
  const baseEntry = dexData.species[dexId(speciesId)];
  const entry = formId === 'normal' ? baseEntry : formEntry(speciesId, formId);
  return {
    name: baseEntry?.name ?? titleCaseId(speciesId),
    types: entry ? entry.types.filter(isPokemonType) : [],
  };
}

/** Atributos base do Showdown da espécie (forma incluída); null quando o dex não tem a entrada. */
export function speciesBaseStats(speciesId: string, formId: string): Record<PlayerStat, number> | null {
  const entry = formId === 'normal' ? dexData.species[dexId(speciesId)] : formEntry(speciesId, formId);
  return entry?.baseStats ?? null;
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
