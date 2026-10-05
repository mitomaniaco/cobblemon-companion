import {createRequire} from 'node:module';
import type {Plugin} from 'vite';

const VIRTUAL_ID = 'virtual:display-dex';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const TYPES = new Set([
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
]);

const dexId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

type Named = {name: string};
type CalcGeneration = {
  species: Iterable<Named & {types: string[]}>;
  moves: Iterable<Named & {type: string; category: string; basePower: number}>;
  abilities: Iterable<Named>;
  items: Iterable<Named>;
  natures: Iterable<Named & {plus?: string; minus?: string}>;
};

function buildDisplayDex() {
  const require = createRequire(import.meta.url);
  const generation = require('@smogon/calc').Generations.get(9) as CalcGeneration;
  const species: Record<string, {name: string; types: string[]}> = {};
  const moves: Record<string, {name: string; type: string; category: string; basePower: number}> = {};
  const abilities: Record<string, string> = {};
  const items: Record<string, string> = {};
  const natures: Record<string, {name: string; plus: string | null; minus: string | null}> = {};

  for (const entry of generation.species) {
    species[dexId(entry.name)] = {name: entry.name, types: entry.types.filter((type) => TYPES.has(type))};
  }
  for (const entry of generation.moves) {
    if (!TYPES.has(entry.type)) continue;
    moves[dexId(entry.name)] = {name: entry.name, type: entry.type, category: entry.category, basePower: entry.basePower};
  }
  for (const entry of generation.abilities) abilities[dexId(entry.name)] = entry.name;
  for (const entry of generation.items) items[dexId(entry.name)] = entry.name;
  for (const entry of generation.natures) {
    const neutral = !entry.plus || !entry.minus || entry.plus === entry.minus;
    natures[dexId(entry.name)] = {
      name: entry.name,
      plus: neutral ? null : (entry.plus ?? null),
      minus: neutral ? null : (entry.minus ?? null),
    };
  }

  return {species, moves, abilities, items, natures};
}

/** Módulo virtual com nomes, tipos e poder do Showdown (@smogon/calc, geração 9), só para exibição. */
export function displayDex(): Plugin {
  return {
    name: 'display-dex',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID ? `export default ${JSON.stringify(buildDisplayDex())};` : null;
    },
  };
}
