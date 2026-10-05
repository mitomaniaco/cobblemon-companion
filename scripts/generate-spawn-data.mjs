// Gera data/spawns/{spawn-pools,biome-tags,capture-rules}.json a partir dos arquivos do jogo (somente leitura; nenhum save).
//
//   node scripts/generate-spawn-data.mjs --instance <pasta com mods/> [--write]
//
// Fontes (ordem de precedência crescente): JAR do Cobblemon, demais JARs em ordem alfabética, kubejs/data/, e por fim as
// pools esvaziadas por kubejs/server_scripts/Tweaks/disable_mons.js. Sem --write, só confere os arquivos versionados.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {strFromU8} from 'fflate';
import {loadMergedSpecies} from './lib/game-species.mjs';
import {parseJsonBytes, sha256, unzipSelected} from './lib/jar.mjs';
import {
  REGIONS,
  applyPresets,
  collectBiomeTags,
  dexRegions,
  mergeTagFiles,
  parseCatchRules,
  parseLevel,
  parseModIds,
  parseSpawnRemovals,
  prettifyBiome,
  resolveTag,
} from './lib/spawn-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data/compat/manifest.json');
const OUTPUT_DIRECTORY = path.join(ROOT, 'data/spawns');
const DISABLE_MONS = 'kubejs/server_scripts/Tweaks/disable_mons.js';
const CATCH_RESTRICTIONS = 'kubejs/startup_scripts/catch_restrictions.js';
const KUBEJS_SOURCE = 'kubejs/data';

const POOL_ENTRY = /^data\/([^/]+)\/(spawn_pool_world|spawn_detail_presets)\/(.+)\.json$/;
const TAG_ENTRY = /^data\/([^/]+)\/tags\/worldgen\/biome\/(.+)\.json$/;
const DEX_ENTRY = /^data\/cobblemon\/dexes\/([^/]+)\.json$/;
const MODS_TOML = 'META-INF/neoforge.mods.toml';
const LANG_ENTRY = /^assets\/([^/]+)\/lang\/en_us\.json$/;
const RELEVANT = (name) =>
  POOL_ENTRY.test(name) || TAG_ENTRY.test(name) || DEX_ENTRY.test(name) || name === MODS_TOML || LANG_ENTRY.test(name);

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const options = {write: false, instance: null};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--instance') options.instance = argv[++index];
    else fail(`argumento desconhecido: ${argument}`);
  }
  if (!options.instance) fail('informe --instance <pasta que contém mods/>');
  return options;
}

function walkFiles(directory) {
  return fs
    .readdirSync(directory, {withFileTypes: true})
    .flatMap((entry) => (entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
}

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

function main() {
  const options = parseArguments(process.argv.slice(2));
  const instance = path.resolve(options.instance);
  const modsDirectory = path.join(instance, 'mods');
  if (!fs.existsSync(modsDirectory)) fail(`pasta mods/ não encontrada em ${instance}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const jars = fs.readdirSync(modsDirectory).filter((name) => name.endsWith('.jar'));
  const species = loadMergedSpecies({instance, modsDirectory, jars, pinnedCobblemonSha256: manifest.sources.cobblemonJar.sha256});

  // Cobblemon primeiro, depois os outros JARs em ordem alfabética, depois o KubeJS.
  const ordered = [
    ...jars.filter((name) => /^Cobblemon-neoforge-/.test(name)),
    ...jars.filter((name) => !/^Cobblemon-neoforge-/.test(name)).sort(),
  ];
  const pools = new Map(); // `ns:spawn_pool_world/caminho` -> {json, source}
  const presets = new Map(); // nome -> {json, source}
  const tagFiles = [];
  const dexes = {};
  const lang = {};
  const installedMods = new Set(['minecraft', 'neoforge']);
  const sources = new Map();
  const touch = (source, hash) => sources.set(source, {id: source, sha256: hash});

  const take = (name, bytes, source, hash) => {
    let match = name.match(POOL_ENTRY);
    if (match) {
      const json = parseJsonBytes(bytes, `${source}:${name}`);
      if (match[2] === 'spawn_pool_world') pools.set(`${match[1]}:spawn_pool_world/${match[3]}.json`, {json, source});
      else presets.set(match[3], {json, source});
      touch(source, hash);
      return;
    }
    match = name.match(TAG_ENTRY);
    if (match) {
      tagFiles.push({id: `${match[1]}:${match[2]}`, json: parseJsonBytes(bytes, `${source}:${name}`)});
      touch(source, hash);
      return;
    }
    match = name.match(DEX_ENTRY);
    if (match) {
      dexes[match[1]] = parseJsonBytes(bytes, `${source}:${name}`);
      touch(source, hash);
      return;
    }
    match = name.match(LANG_ENTRY);
    if (match) {
      Object.assign(lang, parseJsonBytes(bytes, `${source}:${name}`));
      touch(source, hash);
    }
  };

  for (const jar of ordered) {
    const file = path.join(modsDirectory, jar);
    const hash = sha256(fs.readFileSync(file));
    const entries = unzipSelected(file, RELEVANT);
    if (entries[MODS_TOML]) for (const id of parseModIds(strFromU8(entries[MODS_TOML]))) installedMods.add(id);
    for (const [name, bytes] of Object.entries(entries).sort(byKey)) if (name !== MODS_TOML) take(name, bytes, jar, hash);
  }

  const kubejsRoot = path.join(instance, 'kubejs/data');
  if (fs.existsSync(kubejsRoot)) {
    for (const file of walkFiles(kubejsRoot).sort()) {
      const name = `data/${path.relative(kubejsRoot, file).split(path.sep).join('/')}`;
      if (!RELEVANT(name) || name === MODS_TOML) continue;
      const bytes = fs.readFileSync(file);
      take(name, bytes, KUBEJS_SOURCE, null);
    }
  }

  // Remoções do modpack: pools substituídas por `spawns: []`.
  const disablePath = path.join(instance, DISABLE_MONS);
  const catchPath = path.join(instance, CATCH_RESTRICTIONS);
  if (!fs.existsSync(disablePath)) fail(`${DISABLE_MONS} não encontrado`);
  if (!fs.existsSync(catchPath)) fail(`${CATCH_RESTRICTIONS} não encontrado`);
  const disableScript = fs.readFileSync(disablePath);
  const catchScript = fs.readFileSync(catchPath);
  const removalIds = parseSpawnRemovals(strFromU8(disableScript));
  const removals = removalIds.map((id) => {
    const key = id;
    const existing = pools.get(key);
    pools.set(key, {json: {enabled: true, neededInstalledMods: [], neededUninstalledMods: [], spawns: []}, source: DISABLE_MONS});
    return {pool: key, existed: Boolean(existing), source: existing?.source ?? null};
  });
  const catchRules = parseCatchRules(strFromU8(catchScript));
  const scriptHashes = {[DISABLE_MONS]: sha256(disableScript), [CATCH_RESTRICTIONS]: sha256(catchScript)};

  const presetJson = Object.fromEntries([...presets].sort(byKey).map(([name, value]) => [name, value.json]));
  const tags = mergeTagFiles(tagFiles);

  const knownSpecies = new Set(Object.keys(manifest.species));
  const spawnsBySpecies = {};
  const skipped = {disabledPools: 0, missingMods: 0, unknownSpecies: new Set(), badLevel: 0};
  const usedTags = new Set();
  const ignored = [];
  for (const [poolId, {json, source}] of [...pools].sort(byKey)) {
    if (json.enabled === false) {
      skipped.disabledPools += 1;
      continue;
    }
    const needed = json.neededInstalledMods ?? [];
    const forbidden = json.neededUninstalledMods ?? [];
    if (needed.some((mod) => !installedMods.has(mod)) || forbidden.some((mod) => installedMods.has(mod))) {
      skipped.missingMods += 1;
      continue;
    }
    for (const spawn of json.spawns ?? []) {
      if (typeof spawn.pokemon !== 'string') continue;
      const [slug, ...features] = spawn.pokemon.trim().split(/\s+/);
      if (!knownSpecies.has(slug) || !Object.hasOwn(species, slug)) {
        skipped.unknownSpecies.add(slug);
        continue;
      }
      const level = parseLevel(spawn.level);
      if (!level) {
        skipped.badLevel += 1;
        continue;
      }
      const unknownPreset = (spawn.presets ?? []).find((name) => !Object.hasOwn(presetJson, name));
      if (unknownPreset) {
        // Preset inexistente (dado quebrado do provedor): o spawn não ganha local inventado, fica registrado.
        ignored.push({pool: poolId, spawn: spawn.id ?? null, preset: unknownPreset});
        continue;
      }
      const {condition, anticondition} = applyPresets(spawn, presetJson);
      for (const tag of [...collectBiomeTags(condition), ...collectBiomeTags(anticondition)]) usedTags.add(tag);
      (spawnsBySpecies[slug] ??= []).push({
        id: spawn.id ?? null,
        pool: poolId,
        source,
        features,
        type: spawn.type ?? null,
        position: spawn.spawnablePositionType ?? spawn.context ?? null,
        bucket: spawn.bucket ?? null,
        weight: spawn.weight ?? null,
        level,
        presets: spawn.presets ?? [],
        condition,
        anticondition,
      });
    }
  }

  const biomeTags = {};
  const incompleteTags = {};
  const biomeIds = new Set();
  for (const tag of [...usedTags].sort()) {
    const resolved = resolveTag(tag, tags);
    biomeTags[tag] = resolved.biomes;
    // Só conta como incompleta a referência a uma tag de mod instalado (ou do Minecraft) que nenhum arquivo define; o resto são opcionais de mods ausentes.
    const unresolved = resolved.missing.filter((id) => installedMods.has(id.split(':')[0]));
    if (unresolved.length > 0) incompleteTags[tag] = unresolved;
    for (const biome of biomeTags[tag]) biomeIds.add(biome);
  }
  for (const list of Object.values(spawnsBySpecies)) {
    for (const spawn of list) {
      for (const condition of [spawn.condition, spawn.anticondition]) {
        for (const biome of condition?.biomes ?? []) if (!biome.startsWith('#')) biomeIds.add(biome);
      }
    }
  }
  const biomeNames = {};
  for (const biome of [...biomeIds].sort()) {
    const [namespace, ...rest] = biome.split(':');
    biomeNames[biome] = lang[`biome.${namespace}.${rest.join('.').replaceAll('/', '.')}`] ?? prettifyBiome(biome);
  }

  const captureSpecies = {};
  for (const slug of Object.keys(manifest.species).sort()) {
    const json = species[slug];
    const labels = [...(json.labels ?? [])].sort();
    const restricted = labels.some((label) => catchRules.pikaStarLabels.includes(label));
    captureSpecies[slug] = {
      labels,
      catchRate: json.catchRate ?? null,
      pikaStarRegions: restricted ? dexRegions(dexes, slug) : null,
    };
  }

  const spawnPools = {
    sources: [...sources.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    scripts: scriptHashes,
    removals: removals.sort((a, b) => (a.pool < b.pool ? -1 : 1)),
    ignoredUnknownPreset: ignored,
    species: Object.fromEntries(Object.entries(spawnsBySpecies).sort(byKey)),
  };
  const biomes = {tags: biomeTags, incompleteTags, names: biomeNames};
  const captureRulesJson = {
    source: {file: CATCH_RESTRICTIONS, sha256: scriptHashes[CATCH_RESTRICTIONS]},
    outOfBattle: {
      comparesWith: 'primeiro Pokémon não desmaiado da party',
      noLeaderMaxLevel: catchRules.noLeaderMaxLevel,
      guaranteedBallIgnoresLevel: true,
    },
    pikaStar: {
      labels: catchRules.pikaStarLabels,
      advancement: 'allthemons:<região>_pika_star',
      regions: REGIONS,
      verified: false,
    },
    species: captureSpecies,
  };

  const outputs = [
    ['spawn-pools.json', jsonText(spawnPools)],
    ['biomes.json', jsonText(biomes)],
    ['capture-rules.json', jsonText(captureRulesJson)],
  ].map(([name, text]) => [path.join(OUTPUT_DIRECTORY, name), text]);

  const summary = `${Object.keys(spawnsBySpecies).length} espécies com spawn, ${removals.length} remoções (${removals.filter((r) => r.existed).length} existiam), ${Object.keys(biomeTags).length} tags de bioma; ignorados: ${skipped.disabledPools} pools desativadas, ${skipped.missingMods} por mods, ${skipped.badLevel} sem nível, ${ignored.length} com preset inexistente, espécies fora do manifesto: ${[...skipped.unknownSpecies].sort().join(', ') || 'nenhuma'}.`;
  if (options.write) {
    fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});
    for (const [file, text] of outputs) fs.writeFileSync(file, text);
    console.log(`Arquivos gravados: ${summary}`);
    return;
  }
  const stale = outputs
    .filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
    .map(([file]) => path.relative(ROOT, file));
  if (stale.length > 0) fail(`arquivos versionados diferem do gerado: ${stale.join(', ')} (rode com --write)`);
  console.log(`Arquivos versionados coincidem com a geração (${summary}).`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
