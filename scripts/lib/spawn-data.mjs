// Regras puras do gerador de dados de spawn e captura (sem I/O).

export const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'];

/** `modId` de cada `[[mods]]` de um neoforge.mods.toml (ignora `modId` de `[[dependencies.*]]`). */
export function parseModIds(toml) {
  const ids = [];
  let inMods = false;
  for (const line of toml.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\[([^\]]+)\]\]/);
    if (section) inMods = section[1].trim() === 'mods';
    else if (inMods) {
      const match = line.match(/^\s*modId\s*=\s*["']([^"']+)["']/);
      if (match) ids.push(match[1]);
    }
  }
  return ids;
}

/** Caminhos `ns:spawn_pool_world/arquivo.json` que o disable_mons.js substitui por uma pool vazia. */
export function parseSpawnRemovals(script) {
  const emptied = /"spawns"\s*:\s*\[\s*\]/.test(script) && /\.json\(\s*path\s*,/.test(script);
  if (!emptied) throw new Error('disable_mons.js mudou: esperado `json(path, {... "spawns": []})`');
  const code = script
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const array = code.match(/let\s+paths\s*=\s*\[([\s\S]*?)\]/);
  if (!array) throw new Error('disable_mons.js mudou: lista `paths` não encontrada');
  const paths = [...array[1].matchAll(/'([a-z0-9_.-]+:spawn_pool_world\/[^']+\.json)'/g)].map((match) => match[1]);
  if (paths.length === 0) throw new Error('disable_mons.js: nenhum caminho de spawn_pool_world');
  return paths;
}

/** Regras de captura fora de batalha extraídas do catch_restrictions.js (falha se o script mudar de forma). */
export function parseCatchRules(script) {
  const noLeader = script.match(/if\s*\(\s*leader\s*==\s*null\s*\)\s*\{[\s\S]*?targetLevel\s*>\s*(\d+)/);
  const restricted = script.match(/function\s+isRestrictedByPikaStar\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  const labels = restricted ? [...restricted[1].matchAll(/hasLabels\(\s*"([a-z_]+)"\s*\)/g)].map((match) => match[1]) : [];
  const checks = {
    outOfBattleOnly: /if\s*\(\s*battle\s*==\s*null\s*\)/.test(script),
    comparesWithLeaderLevel: /targetLevel\s*>\s*leaderLevel/.test(script),
    firstNonFaintedLeader: /if\s*\(\s*!pokemon\.isFainted\(\)\s*\)/.test(script),
    guaranteedBallIgnoresLevel: /catchRateModifier\.isGuaranteed\(\)/.test(script),
    advancementPattern: /"allthemons:"\s*\+\s*region\.serializedName\s*\+\s*"_pika_star"/.test(script),
  };
  if (!noLeader || labels.length === 0 || Object.values(checks).some((value) => !value)) {
    throw new Error('catch_restrictions.js mudou: regras de captura não reconhecidas');
  }
  return {
    noLeaderMaxLevel: Number(noLeader[1]),
    pikaStarLabels: labels.sort(),
  };
}

const referencedTags = (values) =>
  (Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.startsWith('#'));

/** Preenche, na condição do spawn, os campos ausentes com os do preset (o valor do próprio spawn vence). */
export function applyPresets(spawn, presets) {
  const merged = {condition: {...(spawn.condition ?? {})}, anticondition: spawn.anticondition ? {...spawn.anticondition} : null};
  for (const name of spawn.presets ?? []) {
    const preset = presets[name];
    if (!preset) throw new Error(`preset de spawn desconhecido: ${name}`);
    for (const [key, value] of Object.entries(preset.condition ?? {})) if (!(key in merged.condition)) merged.condition[key] = value;
    if (preset.anticondition) {
      merged.anticondition ??= {};
      for (const [key, value] of Object.entries(preset.anticondition))
        if (!(key in merged.anticondition)) merged.anticondition[key] = value;
    }
  }
  return merged;
}

export function parseLevel(level) {
  if (typeof level === 'number') return {min: level, max: level};
  const match = typeof level === 'string' ? level.match(/^(\d+)(?:-(\d+))?$/) : null;
  if (!match) return null;
  return {min: Number(match[1]), max: Number(match[2] ?? match[1])};
}

/** Une os arquivos de tag de mesmo id na ordem das fontes (`replace: true` descarta o acumulado). */
export function mergeTagFiles(files) {
  const merged = new Map();
  for (const {id, json} of files) {
    const previous = json.replace === true ? [] : (merged.get(id) ?? []);
    merged.set(id, [...previous, ...(json.values ?? [])]);
  }
  return merged;
}

/**
 * Resolve `#ns:tag` recursivamente em ids de bioma. `missing` lista as tags referenciadas que nenhum arquivo
 * do pacote define (ex.: tags do Minecraft vanilla, que não estão nos JARs de mods): o resultado fica incompleto.
 */
export function resolveTag(tagId, tags, seen = new Set(), missing = new Set()) {
  if (!tags.has(tagId)) missing.add(tagId);
  if (seen.has(tagId)) return {biomes: [], missing: [...missing].sort()};
  seen.add(tagId);
  const biomes = new Set();
  for (const entry of tags.get(tagId) ?? []) {
    const id = typeof entry === 'string' ? entry : entry.id;
    if (id.startsWith('#')) for (const biome of resolveTag(id.slice(1), tags, seen, missing).biomes) biomes.add(biome);
    else biomes.add(id);
  }
  return {biomes: [...biomes].sort(), missing: [...missing].sort()};
}

export function collectBiomeTags(condition) {
  return condition ? referencedTags(condition.biomes).map((tag) => tag.slice(1)) : [];
}

export function prettifyBiome(id) {
  return id
    .split(':')
    .pop()
    .split('/')
    .pop()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Regiões (dex) simples que listam a espécie, na ordem de REGIONS. */
export function dexRegions(dexes, slug) {
  return REGIONS.filter((region) =>
    (dexes[region]?.entries ?? []).some((entry) => {
      const id = typeof entry === 'string' ? entry : entry.id;
      return typeof id === 'string' && id.split(':').pop().split('-')[0] === slug;
    }),
  );
}
