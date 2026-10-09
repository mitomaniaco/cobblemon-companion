// Gera data/compat/manifest.json e o mapa `species` de electron/lib/combat-compatibility.json
// a partir dos arquivos efetivamente instalados (somente leitura; nada é executado nem enviado).
//
//   node scripts/generate-compat-catalog.mjs --instance <pasta com mods/> [--write] [--ruleset-id <id>]
//
// Sem --write, apenas compara com os arquivos versionados e sai com código 1 se houver diferença.
// Use --instance com a pasta do cliente OU do servidor para conferir se os dois têm o mesmo pacote.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {strFromU8, unzipSync} from 'fflate';
import {
  additionBattleKeys,
  battleDifferences,
  canonicalJson,
  classMethodFingerprints,
  compareShowdownEntries,
  compareWithCalc,
  deriveItemsCatalog,
  deriveMovesCatalog,
  deriveSpeciesCatalog,
  itemStatus,
  moveStatus,
  showdownEntryFingerprints,
  showdownEntryNames,
  showdownMoveFacts,
  speciesFacts,
  speciesSlug,
  formStatus,
  speciesStatus,
} from './lib/compat-catalog.mjs';
import {classifyProviderEntries, collectDirectoryProviders, collectJarProvider, parseJsonBytes, sha256, unzipSelected} from './lib/jar.mjs';

const require = createRequire(import.meta.url);
const calc = require('@smogon/calc');
const {damageRolls} = require('../electron/lib/calc-profile.cjs');

/** Texto das mecânicas do calc: um golpe citado pelo nome ali tem tratamento próprio (callbacks de dano). */
function calcMechanicsSource() {
  const directory = path.join(path.dirname(require.resolve('@smogon/calc')), 'mechanics');
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('\n');
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'electron/lib/combat-compatibility.json');
const MANIFEST_PATH = path.join(ROOT, 'data/compat/manifest.json');
const REVIEWED_PATH = path.join(ROOT, 'data/compat/reviewed-overrides.json');
const BASE_MOVES_PATH = path.join(ROOT, 'data/compat/base-moves.json');

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const options = {write: false, instance: null, rulesetId: null};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--instance') options.instance = argv[++index];
    else if (argument === '--ruleset-id') options.rulesetId = argv[++index];
    else fail(`argumento desconhecido: ${argument}`);
  }
  if (!options.instance) fail('informe --instance <pasta que contém mods/>');
  return options;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function addConflict(conflicts, slug, conflict) {
  if (!Object.hasOwn(conflicts, slug)) conflicts[slug] = [];
  conflicts[slug].push(conflict);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const instance = path.resolve(options.instance);
  const modsDirectory = path.join(instance, 'mods');
  if (!fs.existsSync(modsDirectory)) fail(`pasta mods/ não encontrada em ${instance}`);

  const catalog = readJson(CATALOG_PATH);
  const reviewed = fs.existsSync(REVIEWED_PATH) ? readJson(REVIEWED_PATH) : {overrides: []};
  if (!fs.existsSync(BASE_MOVES_PATH)) fail('data/compat/base-moves.json ausente');
  const baseMoveIds = new Set(Object.keys(readJson(BASE_MOVES_PATH).moves));
  const pins = catalog.ruleset.sourceSha256;
  const generation = calc.Generations.get(9);

  const jars = fs.readdirSync(modsDirectory).filter((name) => name.endsWith('.jar'));
  const cobblemonJars = jars.filter((name) => /^Cobblemon-neoforge-.+\.jar$/.test(name));
  if (cobblemonJars.length !== 1) fail(`esperado exatamente um JAR do Cobblemon, encontrado ${cobblemonJars.length}`);
  const cobblemonFile = path.join(modsDirectory, cobblemonJars[0]);
  const cobblemonSha = sha256(fs.readFileSync(cobblemonFile));
  if (cobblemonSha !== pins.cobblemonJar)
    fail(`o JAR do Cobblemon (${cobblemonSha}) não é o versão fixada no catálogo (${pins.cobblemonJar})`);

  const base = unzipSelected(
    cobblemonFile,
    (name) => name === 'data/cobblemon/showdown.zip' || /^data\/cobblemon\/species\/.+\.json$/.test(name),
  );
  const showdownZip = base['data/cobblemon/showdown.zip'];
  if (!showdownZip || sha256(showdownZip) !== pins.showdownZip) fail('o showdown.zip embutido não corresponde ao fixado no catálogo');
  const showdownFiles = unzipSync(showdownZip, {
    filter: (entry) => ['data/moves.js', 'data/abilities.js', 'data/items.js', 'sim/battle-actions.js'].includes(entry.name),
  });

  const baseSpeciesJson = {};
  for (const [name, bytes] of Object.entries(base)) {
    if (name.startsWith('data/cobblemon/species/')) baseSpeciesJson[speciesSlug(name)] = parseJsonBytes(bytes, name);
  }

  // Outros provedores de dados.
  const providers = [];
  for (const jar of jars.filter((name) => name !== cobblemonJars[0]).sort()) {
    const provider = classifyProviderEntries(collectJarProvider(path.join(modsDirectory, jar)), jar);
    if (
      Object.keys(provider.species).length + provider.additions.length > 0 ||
      Object.keys(provider.showdown).length > 0 ||
      provider.battleActions !== null ||
      provider.heldItemOverrides.length > 0
    ) {
      provider.sha256 = sha256(fs.readFileSync(path.join(modsDirectory, jar)));
      providers.push(provider);
    }
  }
  providers.push(...collectDirectoryProviders(instance));

  // Espécies.
  const conflicts = {};
  for (const provider of providers) {
    for (const [slug, json] of Object.entries(provider.species)) {
      if (!Object.hasOwn(baseSpeciesJson, slug)) continue;
      const fields = battleDifferences(baseSpeciesJson[slug], json);
      if (fields.length > 0) addConflict(conflicts, slug, {provider: provider.label, kind: 'species-file', fields});
    }
    for (const addition of provider.additions) {
      if (!Object.hasOwn(baseSpeciesJson, addition.target)) continue;
      const fields = additionBattleKeys(addition.json);
      if (fields.length > 0) addConflict(conflicts, addition.target, {provider: provider.label, kind: 'species-addition', fields});
    }
  }
  const enabledByAddition = new Set(
    providers.flatMap((provider) =>
      provider.additions.filter((addition) => addition.json.implemented === true).map((addition) => addition.target),
    ),
  );
  const species = {};
  const formReasons = {};
  for (const slug of Object.keys(baseSpeciesJson).sort()) {
    const facts = speciesFacts(baseSpeciesJson[slug]);
    facts.implemented = facts.implemented || enabledByAddition.has(slug);
    const calcSpecies = facts.name ? generation.species.get(calc.toID(facts.name)) : undefined;
    facts.forms = facts.forms.map((form) => ({
      ...form,
      calcMatches: compareWithCalc(form, generation.species.get(calc.toID(form.name))).matches,
    }));
    species[slug] = {facts, calcMatches: compareWithCalc(facts, calcSpecies).matches, conflicts: conflicts[slug] ?? []};
  }

  // Regras do Showdown (golpes e habilidades) comparadas entre provedores. Golpes: lista-base revisada + candidatos derivados.
  const moveFacts = showdownMoveFacts(strFromU8(showdownFiles['data/moves.js']));
  const calcHasMove = (facts) => Boolean(facts.name && generation.moves.get(calc.toID(facts.name)));
  const calcSource = calcMechanicsSource();
  const moveCalcContext = (facts) => {
    const has = calcHasMove(facts);
    return {
      calcHasMove: has,
      calcNamesMove: Boolean(facts.name) && (calcSource.includes(`'${facts.name}'`) || calcSource.includes(`"${facts.name}"`)),
      calcDamageProbe: has
        ? damageRolls(new calc.Pokemon(9, 'Mew', {level: 50}), new calc.Pokemon(9, 'Mew', {level: 50}), facts.name)[15]
        : null,
    };
  };
  for (const id of baseMoveIds) {
    if (!moveFacts[id] || !calcHasMove(moveFacts[id])) fail(`golpe-base ausente no calc: ${id}`);
  }
  const candidateMoveIds = Object.keys(moveFacts).filter(
    (id) =>
      !baseMoveIds.has(id) &&
      moveStatus(moveFacts[id], {isBase: false, packDiffers: false, ...moveCalcContext(moveFacts[id])}).status === 'derived',
  );
  const packDiffersMoves = new Set();
  const showdown = {};
  const unreviewed = [];
  const packDiffersItems = new Set();
  const DAMAGE_METHODS = ['getDamage', 'modifyDamage', 'getSpreadDamage', 'hitStepTypeImmunity'];
  const SHOWDOWN_EXPORTS = {moves: 'Moves', abilities: 'Abilities', items: 'Items'};
  const recordComparison = (kind, provider, file, result, reviewedIds, compared) =>
    showdown[kind].push({
      provider: provider.label,
      file,
      sha256: provider.sha256 ?? null,
      compared,
      identical: result.identical.length,
      different: result.different,
      missing: result.missing,
      reviewed: reviewedIds,
    });
  for (const kind of ['moves', 'abilities', 'items']) {
    const exportName = SHOWDOWN_EXPORTS[kind];
    const baseEntries = showdownEntryFingerprints(strFromU8(showdownFiles[`data/${kind}.js`]), exportName);
    let ids;
    if (kind === 'moves') ids = [...baseMoveIds, ...candidateMoveIds].sort();
    else if (kind === 'items') ids = Object.keys(baseEntries).sort();
    else
      ids = Object.keys(catalog[kind])
        .filter((key) => key.startsWith('cobblemon:'))
        .map((key) => key.slice('cobblemon:'.length))
        .sort();
    showdown[kind] = [];
    for (const provider of providers) {
      for (const entry of provider.showdown[kind] ?? []) {
        let otherEntries;
        try {
          otherEntries = showdownEntryFingerprints(entry.source, exportName);
        } catch (error) {
          fail(`${provider.label}:${entry.file} não declara ${exportName} (${error.message})`);
        }
        const result = compareShowdownEntries(baseEntries, otherEntries, ids);
        const reviewedIds = [];
        for (const id of result.different) {
          if (kind === 'items') {
            packDiffersItems.add(id);
            continue;
          }
          if (kind === 'moves' && !baseMoveIds.has(id)) {
            packDiffersMoves.add(id);
            continue;
          }
          const decision = reviewed.overrides.find((item) => item.kind === kind && item.id === id && item.provider === provider.label);
          if (decision) reviewedIds.push(id);
          else unreviewed.push(`${kind}:${id} (${provider.label})`);
        }
        recordComparison(kind, provider, entry.file, result, reviewedIds, ids.length);
      }
    }
  }

  // Trava: outro provedor não pode alterar, sem revisão, os métodos do Showdown que calculam o dano.
  const baseMethods = classMethodFingerprints(strFromU8(showdownFiles['sim/battle-actions.js']));
  showdown['battle-actions'] = [];
  for (const provider of providers.filter((candidate) => candidate.battleActions !== null)) {
    const result = compareShowdownEntries(baseMethods, classMethodFingerprints(provider.battleActions), DAMAGE_METHODS);
    const reviewedIds = [];
    for (const id of result.different) {
      const decision = reviewed.overrides.find(
        (item) => item.kind === 'battle-actions' && item.id === id && item.provider === provider.label,
      );
      if (decision) reviewedIds.push(id);
      else unreviewed.push(`battle-actions:${id} (${provider.label})`);
    }
    recordComparison('battle-actions', provider, 'battle-actions.js', result, reviewedIds, DAMAGE_METHODS.length);
  }
  if (unreviewed.length > 0) {
    fail(
      `outro provedor altera regras do Showdown do catálogo sem revisão registrada em data/compat/reviewed-overrides.json:\n  ${unreviewed.join('\n  ')}`,
    );
  }

  // Itens segurados: nome do Showdown base, conhecido pelo calc e sem redefinição por outro pacote.
  const itemNames = showdownEntryNames(strFromU8(showdownFiles['data/items.js']), 'Items');
  const heldOverrides = new Set(providers.flatMap((provider) => provider.heldItemOverrides));
  const items = {};
  const itemReasons = {};
  for (const id of Object.keys(itemNames).sort()) {
    const name = itemNames[id];
    const verdict = itemStatus({
      name,
      calcHasItem: Boolean(name && generation.items.get(calc.toID(name))),
      packDiffers: packDiffersItems.has(id) || heldOverrides.has(id),
    });
    items[id] = {name, ...verdict};
    if (verdict.status === 'excluded') itemReasons[verdict.reason] = (itemReasons[verdict.reason] ?? 0) + 1;
  }

  const moves = {};
  const moveReasons = {};
  for (const [id, facts] of Object.entries(moveFacts)) {
    if (facts.category !== 'Physical' && facts.category !== 'Special') continue;
    const verdict = moveStatus(facts, {
      isBase: baseMoveIds.has(id),
      packDiffers: packDiffersMoves.has(id),
      ...moveCalcContext(facts),
    });
    moves[id] = {...facts, ...verdict};
    if (verdict.status === 'excluded') moveReasons[verdict.reason] = (moveReasons[verdict.reason] ?? 0) + 1;
  }

  const manifest = {
    schemaVersion: 1,
    sources: {
      cobblemonJar: {file: cobblemonJars[0], sha256: cobblemonSha},
      showdownZip: {sha256: pins.showdownZip},
      calc: {version: catalog.ruleset.calcVersion, generation: 9},
      providers: providers.map((provider) => ({
        provider: provider.label,
        sha256: provider.sha256 ?? null,
        speciesFiles: Object.keys(provider.species).length,
        speciesAdditions: provider.additions.length,
        showdown: Object.keys(provider.showdown),
      })),
    },
    species,
    moves,
    items,
    showdown,
  };

  // Catálogo derivado.
  const supportedAbilityIds = new Set(Object.keys(catalog.abilities).filter((key) => key.startsWith('cobblemon:')));
  const derivedSpecies = deriveSpeciesCatalog(species, supportedAbilityIds);
  const nextCatalog = structuredClone(catalog);
  nextCatalog.species = derivedSpecies;
  nextCatalog.ruleset.sourceSha256.speciesRecords = sha256(canonicalJson(species));
  nextCatalog.moves = deriveMovesCatalog(moves);
  nextCatalog.ruleset.sourceSha256.moveRecords = sha256(canonicalJson(moves));
  nextCatalog.items = deriveItemsCatalog(items);
  nextCatalog.ruleset.sourceSha256.itemRecords = sha256(canonicalJson(items));
  if (options.rulesetId) nextCatalog.ruleset.id = options.rulesetId;

  const previous = new Set(Object.keys(catalog.species));
  const next = new Set(Object.keys(derivedSpecies));
  const added = [...next].filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !next.has(id));
  const reasons = {};
  for (const entry of Object.values(species)) {
    const verdict = speciesStatus(entry, supportedAbilityIds);
    if (verdict.status === 'excluded') reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1;
    else {
      for (const form of entry.facts.forms) {
        const formVerdict = formStatus(form, supportedAbilityIds);
        if (formVerdict.status === 'excluded') formReasons[formVerdict.reason] = (formReasons[formVerdict.reason] ?? 0) + 1;
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        especiesNoJar: Object.keys(species).length,
        golpesBase: baseMoveIds.size,
        golpesDerivados: Object.values(moves).filter((entry) => entry.status === 'derived').length,
        motivosDeExclusaoDeGolpes: moveReasons,
        itensDerivados: Object.values(items).filter((entry) => entry.status === 'derived').length,
        motivosDeExclusaoDeItens: itemReasons,
        catalogoAnterior: previous.size,
        catalogoNovo: next.size,
        adicionadas: added.length,
        removidas: removed,
        motivosDeExclusao: reasons,
        formasNoCatalogo: Object.values(derivedSpecies).reduce((sum, entry) => sum + Object.keys(entry.forms).length, 0),
        motivosDeExclusaoDeFormas: formReasons,
        provedoresRelevantes: providers.map((provider) => provider.label),
        conflitosDeEspecie: Object.keys(conflicts),
      },
      null,
      2,
    ),
  );

  const outputs = [
    [MANIFEST_PATH, jsonText(manifest)],
    [CATALOG_PATH, jsonText(nextCatalog)],
  ];
  if (options.write) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), {recursive: true});
    for (const [file, text] of outputs) fs.writeFileSync(file, text);
    console.log('Arquivos gravados.');
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
