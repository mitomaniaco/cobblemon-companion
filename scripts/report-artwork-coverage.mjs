// Relatório de cobertura de arte: quais espécies/formas que a UI pode mostrar ficam sem imagem, e por quê.
//
//   node scripts/report-artwork-coverage.mjs [--manifest <species-artwork.json>] [--public <pasta public>] [--json <saida>] [--strict]
//
// Lê só dados versionados (data/**, electron/lib/combat-compatibility.json) e, se existirem, os artefatos gerados por
// `npm run prepare:ui-assets` (src/data/species-artwork.json e public/pokemon/, fora do git). Não acessa rede nem o jogo.
// Com --strict sai com código 1 se houver espécie normal sem arte; formas sem arte própria são exceções declaradas.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(2);
}

function parseArguments(argv) {
  const options = {
    manifest: path.join(ROOT, 'src/data/species-artwork.json'),
    publicDirectory: path.join(ROOT, 'public'),
    json: null,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifest = path.resolve(argv[++index]);
    else if (argument === '--public') options.publicDirectory = path.resolve(argv[++index]);
    else if (argument === '--json') options.json = path.resolve(argv[++index]);
    else if (argument === '--strict') options.strict = true;
    else fail(`argumento desconhecido: ${argument}`);
  }
  return options;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const slugOf = (id) => id.split(':').pop();

export const CAUSES = {
  'sem-artefatos': 'prepare:ui-assets ainda não gerou o manifesto de arte',
  'fora-da-dex-nacional': 'espécie sem número da dex nacional 1–1025 (custom/CCC): o PokéAPI/HOME não tem arte',
  'nome-divergente': 'o identifier do PokéAPI difere do slug do Cobblemon; só o número da dex liga os dois',
  'download-falhou': 'o manifesto marca a arte como omitida (404 no download)',
  'arquivo-ausente': 'o manifesto aponta um arquivo que não está em public/',
  'forma-declarada':
    'forma regional/alternativa declarada pela espécie, sem arte própria (o PokéAPI/HOME por forma usa ids de forma que o app não carrega)',
  'aspecto-sem-forma': 'aspecto do time (gênero, item/feature, forma de mod) que não é uma forma declarada da espécie',
};

/** Classifica uma espécie normal. Retorna null quando há arte utilizável. */
export function classifySpecies(slug, sources, manifest, publicDirectory) {
  if (manifest === null) return 'sem-artefatos';
  const source = sources[slug];
  if (!source || source.nationalDex === null) return 'fora-da-dex-nacional';
  const byIdentifier = manifest[`cobblemon:${slug}`];
  const entry = byIdentifier ?? Object.values(manifest).find((candidate) => candidate.dexNumber === source.nationalDex);
  if (!entry) return 'fora-da-dex-nacional';
  if (entry.artworkPath === null) return 'download-falhou';
  if (!fs.existsSync(path.join(publicDirectory, entry.artworkPath))) return 'arquivo-ausente';
  return byIdentifier ? null : 'nome-divergente';
}

export function classifyForm(slug, aspects, sources) {
  const declared = sources[slug]?.forms ?? [];
  const known = declared.some((form) => aspects.every((aspect) => form.aspects.includes(aspect)));
  return known ? 'forma-declarada' : 'aspecto-sem-forma';
}

function collectUniverse() {
  const sources = readJson(path.join(ROOT, 'data/guide/artwork-sources.json'));
  const normal = new Map(); // slug -> origens
  const forms = new Map(); // `slug/aspecto+aspecto` -> origens
  const add = (map, key, origin) => map.set(key, [...(map.get(key) ?? []), origin]);
  for (const id of Object.keys(readJson(path.join(ROOT, 'electron/lib/combat-compatibility.json')).species))
    add(normal, slugOf(id), 'catálogo');
  for (const slug of Object.keys(readJson(path.join(ROOT, 'data/guide/learnsets.json')))) add(normal, slug, 'guia');
  for (const list of Object.values(readJson(path.join(ROOT, 'data/guide/evolutions.json'))))
    for (const evolution of list) add(normal, slugOf(evolution.to), 'evolução');
  for (const slug of Object.keys(readJson(path.join(ROOT, 'data/spawns/spawn-pools.json')).species)) add(normal, slug, 'captura');
  for (const trainer of readJson(path.join(ROOT, 'data/guide/trainers.json'))) {
    for (const pokemon of trainer.team) {
      const slug = slugOf(pokemon.speciesId);
      add(normal, slug, 'adversário');
      if (pokemon.aspects.length > 0) add(forms, `${slug}/${[...pokemon.aspects].sort().join('+')}`, 'adversário');
    }
  }
  return {sources, normal, forms};
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = fs.existsSync(options.manifest) ? readJson(options.manifest) : null;
  const {sources, normal, forms} = collectUniverse();

  const exceptions = [];
  for (const [slug, origins] of [...normal].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cause = classifySpecies(slug, sources, manifest, options.publicDirectory);
    if (cause)
      exceptions.push({
        kind: 'espécie',
        id: `cobblemon:${slug}`,
        cause,
        origins: [...new Set(origins)],
        nationalDex: sources[slug]?.nationalDex ?? null,
      });
  }
  for (const [key, origins] of [...forms].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [slug, aspects] = key.split('/');
    exceptions.push({
      kind: 'forma',
      id: `cobblemon:${slug} [${aspects}]`,
      cause: classifyForm(slug, aspects.split('+'), sources),
      origins: [...new Set(origins)],
      nationalDex: sources[slug]?.nationalDex ?? null,
    });
  }

  const counts = {};
  for (const exception of exceptions) counts[exception.cause] = (counts[exception.cause] ?? 0) + 1;
  console.log(
    `Espécies no universo da UI: ${normal.size}; formas de adversários: ${forms.size}; manifesto: ${manifest ? 'presente' : 'ausente'}.`,
  );
  for (const [cause, count] of Object.entries(counts)) console.log(`  ${cause}: ${count} (${CAUSES[cause]})`);
  for (const exception of exceptions.filter((item) => item.kind === 'espécie'))
    console.log(`  - ${exception.id} dex=${exception.nationalDex ?? '?'} → ${exception.cause}`);
  if (exceptions.length === 0) console.log('Nenhuma exceção: todas as espécies e formas têm arte.');
  if (options.json) fs.writeFileSync(options.json, `${JSON.stringify({causes: CAUSES, counts, exceptions}, null, 2)}\n`);
  const speciesWithoutArt = exceptions.filter((item) => item.kind === 'espécie' && item.cause !== 'nome-divergente');
  if (options.strict && speciesWithoutArt.length > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
