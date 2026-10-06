// Resolução de forma alternativa (aspectos do Cobblemon) -> id de Pokémon do PokéAPI/HOME. Puro, sem I/O.

const ASPECT_ALIASES = {alolan: 'alola', galarian: 'galar', hisuian: 'hisui', paldean: 'paldea', f: 'female', m: 'male'};
const IGNORED_TOKENS = new Set(['form', 'forme', 'mode', 'cloak', 'style', 'appliance']);

/** Chave estável de um conjunto de aspectos (ordem não importa). */
export const formKey = (aspects) => [...aspects].sort().join('+');

const tokens = (text) =>
  text
    .split(/[-_]/)
    .filter((token) => token !== '')
    .map((token) => ASPECT_ALIASES[token] ?? token)
    .filter((token) => !IGNORED_TOKENS.has(token));
const sameSet = (a, b) => a.length === b.length && a.every((token) => b.includes(token));

/** pokemon.csv do PokéAPI (id,identifier,species_id,...,is_default) -> {dex: [{id, identifier, isDefault}]}. */
export function parsePokemonCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const column = (name) => header.indexOf(name);
  const [idColumn, identifierColumn, speciesColumn, defaultColumn] = ['id', 'identifier', 'species_id', 'is_default'].map(column);
  if ([idColumn, identifierColumn, speciesColumn, defaultColumn].includes(-1))
    throw new Error('pokemon.csv inválido: cabeçalho inesperado');
  const byDex = new Map();
  for (const line of lines.slice(1)) {
    const values = line.split(',');
    const dex = Number(values[speciesColumn]);
    if (!byDex.has(dex)) byDex.set(dex, []);
    byDex.get(dex).push({id: Number(values[idColumn]), identifier: values[identifierColumn], isDefault: values[defaultColumn] === '1'});
  }
  return byDex;
}

/** Id do Pokémon do PokéAPI para (dex, aspectos), ou null se o PokéAPI não tem essa forma. */
export function resolveFormId(byDex, dex, aspects) {
  const rows = byDex.get(dex) ?? [];
  if (rows.length < 2) return null;
  const wanted = aspects.flatMap(tokens);
  if (wanted.length === 0) return null;
  const parts = rows.map((row) => row.identifier.split('-'));
  let prefixLength = 0;
  while (parts.every((list) => list.length > prefixLength && list[prefixLength] === parts[0][prefixLength])) prefixLength += 1;
  const hit = rows.find((_row, index) => {
    const remainder = tokens(parts[index].slice(prefixLength).join('-'));
    return remainder.length > 0 && sameSet(remainder, wanted);
  });
  return hit ? hit.id : null;
}
