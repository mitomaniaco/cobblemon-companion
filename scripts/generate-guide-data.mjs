// Gera data/guide/{learnsets,evolutions,trainers}.json a partir dos arquivos instalados (somente leitura).
//
//   node scripts/generate-guide-data.mjs --instance <pasta com mods/> [--write]
//
// Sem --write, apenas compara com os arquivos versionados e sai com código 1 se houver diferença.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMergedSpecies} from './lib/game-species.mjs';
import {deriveArtworkSources, deriveCampaign, deriveEvolutions, deriveLearnset, deriveSeries, deriveTrainer} from './lib/guide-data.mjs';
import {parseJsonBytes, sha256, unzipSelected} from './lib/jar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data/compat/manifest.json');
const OUTPUT_DIRECTORY = path.join(ROOT, 'data/guide');
const TRAINER_ENTRY = /^data\/[^/]+\/trainers\/[^/]+\.json$/;
const RCT_ENTRY = /^data\/[^/]+\/(?:trainers\/[^/]+|series\/[^/]+|mobs\/trainers\/[^/]+\/[^/]+)\.json$/;

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

/** initialLevelCap/relativeLevelCap de config/rctmod-server.toml (padrões do mod quando a série não define). */
function readLevelCapConfig(instance) {
  const file = path.join(instance, 'config', 'rctmod-server.toml');
  if (!fs.existsSync(file)) fail('config/rctmod-server.toml não encontrado (necessário para o level cap)');
  const text = fs.readFileSync(file, 'utf8');
  const read = (key) => {
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(-?\\d+)`, 'm'));
    if (!match) fail(`${key} ausente em config/rctmod-server.toml`);
    return Number(match[1]);
  };
  return {initialLevelCap: read('initialLevelCap'), relativeLevelCap: read('relativeLevelCap')};
}

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function main() {
  const options = parseArguments(process.argv.slice(2));
  const instance = path.resolve(options.instance);
  const modsDirectory = path.join(instance, 'mods');
  if (!fs.existsSync(modsDirectory)) fail(`pasta mods/ não encontrada em ${instance}`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const slugs = Object.keys(manifest.species).sort();
  const jars = fs.readdirSync(modsDirectory).filter((name) => name.endsWith('.jar'));
  const species = loadMergedSpecies({instance, modsDirectory, jars, pinnedCobblemonSha256: manifest.sources.cobblemonJar.sha256});

  const learnsets = {};
  const evolutions = {};
  for (const slug of slugs) {
    if (!Object.hasOwn(species, slug)) fail(`espécie do manifesto ausente nos dados do jogo: ${slug}`);
    learnsets[slug] = deriveLearnset(species[slug].moves);
    evolutions[slug] = deriveEvolutions(species[slug].evolutions);
  }

  // Arquivos do RCT: JARs com "rct" no nome; depois kubejs/data/ sobrepõe o mesmo caminho (pacote de dados do KubeJS vem por último).
  const rctFiles = new Map();
  for (const jar of jars.filter((name) => /rct/i.test(name)).sort()) {
    const file = path.join(modsDirectory, jar);
    const jarSha = sha256(fs.readFileSync(file));
    for (const [name, bytes] of Object.entries(unzipSelected(file, (entry) => RCT_ENTRY.test(entry)))) {
      rctFiles.set(name, {bytes, origin: jar, sha256: jarSha});
    }
  }
  const kubejsRoot = path.join(instance, 'kubejs/data');
  if (fs.existsSync(kubejsRoot)) {
    for (const file of walkFiles(kubejsRoot)) {
      const name = `data/${path.relative(kubejsRoot, file).split(path.sep).join('/')}`;
      if (!RCT_ENTRY.test(name)) continue;
      const bytes = fs.readFileSync(file);
      rctFiles.set(name, {bytes, origin: 'kubejs/data', sha256: sha256(bytes)});
    }
  }

  const seriesParts = {namespace: null, seriesMeta: {}, mobs: {}, groups: {}, trainerIds: []};
  const trainerFiles = [];
  for (const [name, entry] of [...rctFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const parts = name.split('/');
    const base = path.basename(name, '.json');
    if (TRAINER_ENTRY.test(name)) {
      seriesParts.trainerIds.push(base);
      trainerFiles.push([name, entry]);
      continue;
    }
    seriesParts.namespace = parts[1];
    const json = parseJsonBytes(entry.bytes, `${entry.origin}:${name}`);
    if (parts[2] === 'series') seriesParts.seriesMeta[base] = json;
    else if (parts[4] === 'groups') seriesParts.groups[base] = json;
    else if (parts.length === 6) seriesParts.mobs[base] = json;
  }
  const trainers = trainerFiles.map(([name, entry]) => {
    const base = path.basename(name, '.json');
    return deriveTrainer(parseJsonBytes(entry.bytes, `${entry.origin}:${name}`), {
      id: `${name.split('/')[1]}:${base}`,
      jar: entry.origin,
      sha256: entry.sha256,
      file: name,
      mob: seriesParts.mobs[base] ?? null,
    });
  });
  const series = Object.keys(seriesParts.seriesMeta).length > 0 ? deriveSeries(seriesParts) : {};
  if (trainers.length === 0) fail('nenhum treinador do RCT encontrado (JARs com "rct" no nome e data/<ns>/trainers/*.json)');
  trainers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const outputs = [
    ['learnsets.json', jsonText(learnsets)],
    ['evolutions.json', jsonText(evolutions)],
    ['trainers.json', jsonText(trainers)],
    ['series.json', jsonText(series)],
    ['campaign.json', jsonText(deriveCampaign({series, trainers, levelCapConfig: readLevelCapConfig(instance)}))],
    ['artwork-sources.json', jsonText(deriveArtworkSources(species, slugs, trainers))],
  ].map(([name, text]) => [path.join(OUTPUT_DIRECTORY, name), text]);

  if (options.write) {
    fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});
    for (const [file, text] of outputs) fs.writeFileSync(file, text);
    console.log(`Arquivos gravados: ${slugs.length} espécies, ${trainers.length} treinadores.`);
    return;
  }
  const stale = outputs
    .filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
    .map(([file]) => path.relative(ROOT, file));
  if (stale.length > 0) fail(`arquivos versionados diferem do gerado: ${stale.join(', ')} (rode com --write)`);
  console.log('Arquivos versionados coincidem com a geração.');
}

try {
  main();
} catch (error) {
  fail(error.message);
}
