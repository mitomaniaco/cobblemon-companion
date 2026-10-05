// Gera data/guide/{learnsets,evolutions,trainers}.json a partir dos arquivos instalados (somente leitura).
//
//   node scripts/generate-guide-data.mjs --instance <pasta com mods/> [--write]
//
// Sem --write, apenas compara com os arquivos versionados e sai com código 1 se houver diferença.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveEvolutions, deriveLearnset, deriveTrainer, mergeSpecies} from './lib/guide-data.mjs';
import {classifyProviderEntries, collectDirectoryProviders, collectJarProvider, parseJsonBytes, sha256, unzipSelected} from './lib/jar.mjs';
import {speciesSlug} from './lib/compat-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data/compat/manifest.json');
const OUTPUT_DIRECTORY = path.join(ROOT, 'data/guide');
const TRAINER_ENTRY = /^data\/[^/]+\/trainers\/[^/]+\.json$/;

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

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function main() {
  const options = parseArguments(process.argv.slice(2));
  const instance = path.resolve(options.instance);
  const modsDirectory = path.join(instance, 'mods');
  if (!fs.existsSync(modsDirectory)) fail(`pasta mods/ não encontrada em ${instance}`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const slugs = Object.keys(manifest.species).sort();
  const jars = fs.readdirSync(modsDirectory).filter((name) => name.endsWith('.jar'));
  const cobblemonJars = jars.filter((name) => /^Cobblemon-neoforge-.+\.jar$/.test(name));
  if (cobblemonJars.length !== 1) fail(`esperado exatamente um JAR do Cobblemon, encontrado ${cobblemonJars.length}`);
  const cobblemonFile = path.join(modsDirectory, cobblemonJars[0]);
  if (sha256(fs.readFileSync(cobblemonFile)) !== manifest.sources.cobblemonJar.sha256)
    fail('o JAR do Cobblemon não é o fixado em data/compat/manifest.json');

  const baseSpecies = {};
  for (const [name, bytes] of Object.entries(unzipSelected(cobblemonFile, (entry) => /^data\/cobblemon\/species\/.+\.json$/.test(entry)))) {
    baseSpecies[speciesSlug(name)] = parseJsonBytes(bytes, name);
  }

  // Mesma ordem do gerador do catálogo: base, JARs em ordem alfabética, pastas de dados.
  const providers = jars
    .filter((name) => name !== cobblemonJars[0])
    .sort()
    .map((jar) => classifyProviderEntries(collectJarProvider(path.join(modsDirectory, jar)), jar));
  providers.push(...collectDirectoryProviders(instance));
  const species = mergeSpecies(baseSpecies, providers);

  const learnsets = {};
  const evolutions = {};
  for (const slug of slugs) {
    if (!Object.hasOwn(species, slug)) fail(`espécie do manifesto ausente nos dados do jogo: ${slug}`);
    learnsets[slug] = deriveLearnset(species[slug].moves);
    evolutions[slug] = deriveEvolutions(species[slug].evolutions);
  }

  const trainers = [];
  for (const jar of jars.filter((name) => /rct/i.test(name)).sort()) {
    const file = path.join(modsDirectory, jar);
    const entries = unzipSelected(file, (name) => TRAINER_ENTRY.test(name));
    const jarSha = sha256(fs.readFileSync(file));
    for (const [name, bytes] of Object.entries(entries)) {
      const namespace = name.split('/')[1];
      const id = `${namespace}:${path.basename(name, '.json')}`;
      trainers.push(deriveTrainer(parseJsonBytes(bytes, `${jar}:${name}`), {id, jar, sha256: jarSha, file: name}));
    }
  }
  if (trainers.length === 0) fail('nenhum treinador do RCT encontrado (JARs com "rct" no nome e data/<ns>/trainers/*.json)');
  trainers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const outputs = [
    ['learnsets.json', jsonText(learnsets)],
    ['evolutions.json', jsonText(evolutions)],
    ['trainers.json', jsonText(trainers)],
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
