import fs from 'node:fs';
import {createRequire} from 'node:module';
import type {Plugin} from 'vite';

const MANIFEST_PATH = new URL('./data/compat/manifest.json', import.meta.url);
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
  natures: Iterable<Named & {plus?: string; minus?: string}>;
};

function buildDisplayDex() {
  const require = createRequire(import.meta.url);
  const generation = require('@smogon/calc').Generations.get(9) as CalcGeneration;
  const species: Record<string, {name: string; types: string[]}> = {};
  const moves: Record<string, {name: string; type: string; category: string; basePower: number}> = {};
  const abilities: Record<string, string> = {};
  const natures: Record<string, {name: string; plus: string | null; minus: string | null}> = {};

  // Espécies do Cobblemon (chaves do manifesto) e suas formas alternativas do calc (`<Espécie>-<Forma>`), sem Mega, Gmax, Primal nem Totem.
  const cobblemonSpecies = new Set(Object.keys(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).species));
  const calcSpecies = [...generation.species];
  const baseNames = calcSpecies.filter((entry) => cobblemonSpecies.has(dexId(entry.name))).map((entry) => entry.name);
  const excludedToken = (name: string) => name.split('-').some((token) => ['Mega', 'Gmax', 'Primal', 'Totem'].includes(token));
  for (const entry of calcSpecies) {
    const isBase = cobblemonSpecies.has(dexId(entry.name));
    const isForm = baseNames.some((baseName) => entry.name.startsWith(`${baseName}-`)) && !excludedToken(entry.name);
    if (!isBase && !isForm) continue;
    species[dexId(entry.name)] = {name: entry.name, types: entry.types.filter((type) => TYPES.has(type))};
  }
  for (const entry of generation.moves) {
    if (!TYPES.has(entry.type)) continue;
    moves[dexId(entry.name)] = {name: entry.name, type: entry.type, category: entry.category, basePower: entry.basePower};
  }
  for (const entry of generation.abilities) abilities[dexId(entry.name)] = entry.name;
  for (const entry of generation.natures) {
    const neutral = !entry.plus || !entry.minus || entry.plus === entry.minus;
    natures[dexId(entry.name)] = {
      name: entry.name,
      plus: neutral ? null : (entry.plus ?? null),
      minus: neutral ? null : (entry.minus ?? null),
    };
  }

  return {species, moves, abilities, natures};
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
