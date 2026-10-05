import {createHash} from 'node:crypto';
import {lstat, mkdir, mkdtemp, rename, rm, rmdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECIES_CSV_REVISION = 'bc92d3b6029ef1abe9e7ad424c400b338f3c11fe';
const SPRITES_REVISION = '1aa1b0ca273d0e096469a9846155484920b11b45';
const SPECIES_CSV_URL = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${SPECIES_CSV_REVISION}/data/v2/csv/pokemon_species.csv`;
const ARTWORK_URL = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REVISION}/sprites/pokemon/other/home`;
const ITEMS_URL = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REVISION}/sprites/items`;
const TYPE_ICONS_REVISION = '5781623f147f1bf850f426cfe1874ba56a9b75ee';
const TYPE_ICONS_URL = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/${TYPE_ICONS_REVISION}/icons`;
const CATEGORY_ICONS_URL = 'https://play.pokemonshowdown.com/sprites/categories';
const CATEGORY_NAMES = ['Physical', 'Special', 'Status'];
const MAX_SVG_BYTES = 20_000;
const POKEMON_TYPE_SLUGS = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];
const LICENSE_URL = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REVISION}/LICENCE.txt`;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[1-9][0-9]*$/;
const MAX_CONCURRENCY = 4;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function fetchChecked(url, description) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${description}: falha ao acessar ${url}: ${errorMessage(error)}`, {cause: error});
  }
  return response;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let recordTouched = false;

  const finishField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };
  const finishRecord = () => {
    if (row.length > 0 || field.length > 0 || recordTouched || afterQuote) {
      finishField();
      rows.push(row);
    }
    row = [];
    field = '';
    afterQuote = false;
    recordTouched = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      recordTouched = true;
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        finishField();
        recordTouched = true;
      } else if (character === '\n' || character === '\r') {
        finishRecord();
        if (character === '\r' && text[index + 1] === '\n') index += 1;
      } else {
        throw new Error(`CSV malformado: caractere inesperado após aspas no offset ${index}.`);
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new Error(`CSV malformado: aspas dentro de campo sem aspas no offset ${index}.`);
      }
      inQuotes = true;
      recordTouched = true;
    } else if (character === ',') {
      finishField();
      recordTouched = true;
    } else if (character === '\n' || character === '\r') {
      finishRecord();
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
      recordTouched = true;
    }
  }

  if (inQuotes) throw new Error('CSV malformado: campo entre aspas não foi fechado.');
  if (row.length > 0 || field.length > 0 || recordTouched || afterQuote) finishRecord();
  if (rows.length === 0) throw new Error('CSV vazio.');
  return rows;
}

function parseSpecies(csvText) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  const headers = rows[0];
  const idColumns = headers.reduce(
    (indices, header, index) => {
      if (header === 'id') indices.id.push(index);
      if (header === 'identifier') indices.identifier.push(index);
      return indices;
    },
    {id: [], identifier: []},
  );

  if (idColumns.id.length !== 1 || idColumns.identifier.length !== 1) {
    throw new Error('CSV inválido: cabeçalho deve conter exatamente uma coluna id e uma coluna identifier.');
  }
  if (headers.some((header, index) => header === '' || headers.indexOf(header) !== index)) {
    throw new Error('CSV inválido: cabeçalho vazio ou coluna duplicada.');
  }

  const seenIds = new Set();
  const seenSlugs = new Set();
  const species = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex];
    if (values.length !== headers.length) {
      throw new Error(`CSV inválido: registro ${rowIndex + 1} tem ${values.length} colunas; esperado ${headers.length}.`);
    }

    const dexNumber = values[idColumns.id[0]];
    const identifier = values[idColumns.identifier[0]];
    if (!ID_PATTERN.test(dexNumber) || !Number.isSafeInteger(Number(dexNumber))) {
      throw new Error(`CSV inválido: id malformado no registro ${rowIndex + 1}: ${JSON.stringify(dexNumber)}.`);
    }
    if (!SLUG_PATTERN.test(identifier)) {
      throw new Error(`CSV inválido: identifier/slug malformado no registro ${rowIndex + 1}: ${JSON.stringify(identifier)}.`);
    }
    if (seenIds.has(dexNumber)) throw new Error(`CSV inválido: id duplicado ${dexNumber}.`);
    if (seenSlugs.has(identifier)) throw new Error(`CSV inválido: slug duplicado ${identifier}.`);

    seenIds.add(dexNumber);
    seenSlugs.add(identifier);
    species.push({dexNumber: Number(dexNumber), identifier, speciesId: `cobblemon:${identifier}`});
  }
  if (species.length === 0) throw new Error('CSV inválido: nenhum registro de espécie.');
  return species;
}

async function readSpeciesCsv() {
  const response = await fetchChecked(SPECIES_CSV_URL, 'CSV de espécies');
  if (!response.ok) {
    throw new Error(`CSV de espécies: HTTP ${response.status} ao acessar ${SPECIES_CSV_URL}.`);
  }

  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`CSV de espécies: resposta ilegível: ${errorMessage(error)}`, {cause: error});
  }
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch (error) {
    throw new Error(`CSV de espécies: conteúdo não é UTF-8 válido: ${errorMessage(error)}`, {cause: error});
  }
  return {species: parseSpecies(text), csvSha256: sha256(bytes)};
}

async function stageFiles(entries, {describe, toUrl, toFile, allow404}) {
  const results = new Array(entries.length);
  let nextIndex = 0;
  let failed = false;
  let firstFailure;

  async function worker() {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= entries.length) return;

      try {
        const entry = entries[index];
        const label = describe(entry);
        const url = toUrl(entry);
        const response = await fetchChecked(url, label);
        if (response.status === 404 && allow404) {
          results[index] = {url, sha256: null, omitted404: true};
          continue;
        }
        if (!response.ok) {
          throw new Error(`${label}: HTTP ${response.status} em ${url}${allow404 ? '; somente 404 individual pode ser omitido' : ''}.`);
        }

        let bytes;
        try {
          bytes = Buffer.from(await response.arrayBuffer());
        } catch (error) {
          throw new Error(`${label}: resposta ilegível em ${url}: ${errorMessage(error)}`, {cause: error});
        }
        if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
          throw new Error(`${label}: assinatura PNG inválida em ${url}.`);
        }

        const filePath = toFile(entry);
        try {
          await writeFile(filePath, bytes, {flag: 'wx'});
        } catch (error) {
          throw new Error(`${label}: não foi possível preparar ${filePath}: ${errorMessage(error)}`, {cause: error});
        }
        results[index] = {url, sha256: sha256(bytes), omitted404: false};
      } catch (error) {
        if (!failed) firstFailure = error;
        failed = true;
        return;
      }
    }
  }

  await Promise.all(Array.from({length: Math.min(MAX_CONCURRENCY, entries.length)}, () => worker()));
  if (failed) throw firstFailure;
  return results;
}

async function stageTypeIcons(typeStageDirectory) {
  const icons = [];
  for (const slug of POKEMON_TYPE_SLUGS) {
    const url = `${TYPE_ICONS_URL}/${slug}.svg`;
    const response = await fetchChecked(url, `Ícone de tipo ${slug}`);
    if (!response.ok) throw new Error(`Ícone de tipo ${slug}: HTTP ${response.status} em ${url}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    let text;
    try {
      text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
      throw new Error(`Ícone de tipo ${slug}: conteúdo não é UTF-8 válido.`);
    }
    if (!text.trimStart().startsWith('<svg') || bytes.length > MAX_SVG_BYTES || /<script/i.test(text)) {
      throw new Error(`Ícone de tipo ${slug}: SVG inválido, grande demais ou com script.`);
    }
    await writeFile(path.join(typeStageDirectory, `${slug}.svg`), bytes, {flag: 'wx'});
    icons.push({slug, path: `/types/${slug}.svg`, url, sha256: sha256(bytes)});
  }
  return icons;
}

function itemSlug(name) {
  return name
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function listItems() {
  const require = createRequire(import.meta.url);
  const {Generations} = require('@smogon/calc');
  const items = [];
  const seen = new Set();
  for (const item of Generations.get(9).items) {
    const slug = itemSlug(item.name);
    const dexId = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    items.push({name: item.name, slug, dexId});
  }
  return items;
}

function createSpeciesManifest(results) {
  const manifest = {};
  for (const result of results) {
    manifest[result.speciesId] = {
      dexNumber: result.dexNumber,
      artworkPath: result.artworkPath,
    };
  }
  return manifest;
}

function createUiIconsManifest({typeIcons, categoryIcons, itemIcons}) {
  return {
    types: Object.fromEntries(typeIcons.map((icon) => [icon.slug, icon.path])),
    categories: Object.fromEntries(categoryIcons.map((icon) => [icon.name, icon.path])),
    items: Object.fromEntries(itemIcons.filter((icon) => !icon.omitted404).map((icon) => [icon.dexId, icon.path])),
  };
}

function createProvenance(results, csvSha256, {typeIcons, categoryIcons, itemIcons}) {
  return {
    pinnedRevisions: {
      pokemonSpeciesCsv: SPECIES_CSV_REVISION,
      pokemonSprites: SPRITES_REVISION,
      typeIcons: TYPE_ICONS_REVISION,
    },
    sources: {
      speciesCsv: SPECIES_CSV_URL,
      artworkBase: ARTWORK_URL,
      homeArtworkBase: ARTWORK_URL,
      typeIcons: TYPE_ICONS_URL,
      categoryIcons: CATEGORY_ICONS_URL,
      itemsBase: ITEMS_URL,
      license: LICENSE_URL,
    },
    credit:
      'Renders do Pokémon HOME e sprites de itens: PokéAPI/sprites; ícones de tipo: duiker101/pokemon-type-svg-icons (README: "for any use"); ícones de categoria: Pokémon Showdown. Imagens © The Pokémon Company.',
    copyrightWarning:
      'As imagens são © The Pokémon Company. A declaração CC0 do repositório de sprites não concede direitos sobre obras de terceiros.',
    licenseWarning:
      'Uso apenas como preparação local. Não inclua PNGs ou manifestos gerados em commits/distribuições; qualquer distribuição exige autorização específica dos titulares dos direitos.',
    speciesCsv: {
      url: SPECIES_CSV_URL,
      sha256: csvSha256,
    },
    files: results
      .filter((result) => !result.omitted404)
      .map((result) => ({
        speciesId: result.speciesId,
        dexNumber: result.dexNumber,
        path: result.artworkPath,
        url: result.url,
        sha256: result.sha256,
      })),
    omitted404Species: results
      .filter((result) => result.omitted404)
      .map((result) => ({
        speciesId: result.speciesId,
        dexNumber: result.dexNumber,
        url: result.url,
        status: 404,
      })),
    typeIconFiles: typeIcons.map(({path: filePath, url, sha256: hash}) => ({path: filePath, url, sha256: hash})),
    categoryIconFiles: categoryIcons.map(({path: filePath, url, sha256: hash}) => ({path: filePath, url, sha256: hash})),
    itemFiles: itemIcons
      .filter((item) => !item.omitted404)
      .map(({path: filePath, url, sha256: hash}) => ({path: filePath, url, sha256: hash})),
    omitted404Items: itemIcons.filter((item) => item.omitted404).map((item) => ({name: item.name, url: item.url, status: 404})),
  };
}

async function writeStagedOutputs(results, csvSha256, ui, stageManifest, stageUiIcons, pokemonStageDirectory) {
  const manifest = `${JSON.stringify(createSpeciesManifest(results), null, 2)}\n`;
  const uiIcons = `${JSON.stringify(createUiIconsManifest(ui), null, 2)}\n`;
  const provenance = `${JSON.stringify(createProvenance(results, csvSha256, ui), null, 2)}\n`;
  try {
    await writeFile(stageManifest, manifest, {encoding: 'utf8', flag: 'wx'});
    await writeFile(stageUiIcons, uiIcons, {encoding: 'utf8', flag: 'wx'});
    await writeFile(path.join(pokemonStageDirectory, 'provenance.json'), provenance, {encoding: 'utf8', flag: 'wx'});
  } catch (error) {
    throw new Error(`Não foi possível gravar os manifestos temporários: ${errorMessage(error)}`, {cause: error});
  }
}

async function getPathType(targetPath) {
  try {
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink()) throw new Error(`Caminho de saída não pode ser link simbólico: ${targetPath}.`);
    return stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function ensureOutputDirectory(directoryPath, createdDirectories) {
  const type = await getPathType(directoryPath);
  if (type === 'directory') return;
  if (type !== 'missing') throw new Error(`Diretório de saída inválido: ${directoryPath} (${type}).`);
  await mkdir(directoryPath, {recursive: true});
  createdDirectories.push(directoryPath);
}

async function cleanupCreatedDirectories(directories) {
  for (const directory of [...directories].reverse()) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ENOTEMPTY'].includes(error.code))) {
        console.error(`Aviso: não foi possível remover o diretório vazio criado ${directory}: ${errorMessage(error)}`);
      }
    }
  }
}

async function publishOutputs({stageRoot, outputs, createdDirectories}) {
  for (const output of outputs) await ensureOutputDirectory(path.dirname(output.destination), createdDirectories);

  const stagingStats = await lstat(stageRoot);
  for (const output of outputs) {
    const parentStats = await lstat(path.dirname(output.destination));
    if (stagingStats.dev !== parentStats.dev) {
      throw new Error('Publicação recusada: staging e destinos não estão no mesmo volume.');
    }
  }

  const backupDirectory = path.join(stageRoot, 'backups');
  await mkdir(backupDirectory, {recursive: true});
  const states = [];
  for (const [index, output] of outputs.entries()) {
    const type = await getPathType(output.destination);
    if (type !== 'missing' && type !== output.kind) {
      throw new Error(`Destino de saída não é ${output.kind === 'file' ? 'um arquivo' : 'um diretório'} regular: ${output.destination}.`);
    }
    states.push({...output, type, backup: path.join(backupDirectory, String(index)), oldMoved: false, published: false});
  }

  try {
    for (const state of states) {
      if (state.type === 'missing') continue;
      await rename(state.destination, state.backup);
      state.oldMoved = true;
    }
    for (const state of states) {
      await rename(state.stage, state.destination);
      state.published = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    const attemptRollback = async (description, action) => {
      try {
        await action();
      } catch (rollbackError) {
        rollbackErrors.push(`${description}: ${errorMessage(rollbackError)}`);
      }
    };

    for (const state of [...states].reverse()) {
      if (state.published)
        await attemptRollback(`remover nova saída ${state.destination}`, () => rm(state.destination, {recursive: true, force: true}));
    }
    for (const state of [...states].reverse()) {
      if (state.oldMoved)
        await attemptRollback(`restaurar saída anterior ${state.destination}`, () => rename(state.backup, state.destination));
    }

    if (rollbackErrors.length > 0) {
      throw new Error(
        `Publicação falhou: ${errorMessage(error)}. Falha ao restaurar saída anterior; backups preservados em ${backupDirectory}. ${rollbackErrors.join(' | ')}`,
        {cause: error},
      );
    }
    throw new Error(`Publicação falhou; saídas anteriores restauradas: ${errorMessage(error)}`, {cause: error});
  }
}

async function main() {
  const {species, csvSha256} = await readSpeciesCsv();
  const items = listItems();
  const stageRoot = await mkdtemp(path.join(PROJECT_ROOT, '.prepare-ui-assets-'));
  const stageManifest = path.join(stageRoot, 'src', 'data', 'species-artwork.json');
  const stageUiIcons = path.join(stageRoot, 'src', 'data', 'ui-icons.json');
  const stagePublic = (name) => path.join(stageRoot, 'public', name);
  const pokemonStageDirectory = stagePublic('pokemon');
  const createdDirectories = [];
  let preserveStageForRecovery = false;

  try {
    await mkdir(path.dirname(stageManifest), {recursive: true});
    for (const name of ['pokemon', 'types', 'categories', 'items']) await mkdir(stagePublic(name), {recursive: true});

    const artworkFiles = await stageFiles(species, {
      describe: (entry) => `Artwork de ${entry.speciesId}`,
      toUrl: (entry) => `${ARTWORK_URL}/${entry.dexNumber}.png`,
      toFile: (entry) => path.join(pokemonStageDirectory, `${entry.dexNumber}.png`),
      allow404: true,
    });
    const results = species.map((entry, index) => ({
      ...entry,
      ...artworkFiles[index],
      artworkPath: artworkFiles[index].omitted404 ? null : `/pokemon/${entry.dexNumber}.png`,
    }));

    const typeIcons = await stageTypeIcons(stagePublic('types'));
    const categoryFiles = await stageFiles(CATEGORY_NAMES, {
      describe: (name) => `Ícone de categoria ${name}`,
      toUrl: (name) => `${CATEGORY_ICONS_URL}/${name}.png`,
      toFile: (name) => path.join(stagePublic('categories'), `${name}.png`),
      allow404: false,
    });
    const categoryIcons = CATEGORY_NAMES.map((name, index) => ({name, path: `/categories/${name}.png`, ...categoryFiles[index]}));
    const itemFiles = await stageFiles(items, {
      describe: (item) => `Sprite do item ${item.name}`,
      toUrl: (item) => `${ITEMS_URL}/${item.slug}.png`,
      toFile: (item) => path.join(stagePublic('items'), `${item.slug}.png`),
      allow404: true,
    });
    const itemIcons = items.map((item, index) => ({...item, path: `/items/${item.slug}.png`, ...itemFiles[index]}));
    const ui = {typeIcons, categoryIcons, itemIcons};

    await writeStagedOutputs(results, csvSha256, ui, stageManifest, stageUiIcons, pokemonStageDirectory);

    try {
      await publishOutputs({
        stageRoot,
        outputs: [
          {stage: stageManifest, destination: path.join(PROJECT_ROOT, 'src', 'data', 'species-artwork.json'), kind: 'file'},
          {stage: stageUiIcons, destination: path.join(PROJECT_ROOT, 'src', 'data', 'ui-icons.json'), kind: 'file'},
          {stage: pokemonStageDirectory, destination: path.join(PROJECT_ROOT, 'public', 'pokemon'), kind: 'directory'},
          {stage: stagePublic('types'), destination: path.join(PROJECT_ROOT, 'public', 'types'), kind: 'directory'},
          {stage: stagePublic('categories'), destination: path.join(PROJECT_ROOT, 'public', 'categories'), kind: 'directory'},
          {stage: stagePublic('items'), destination: path.join(PROJECT_ROOT, 'public', 'items'), kind: 'directory'},
        ],
        createdDirectories,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('backups preservados em')) preserveStageForRecovery = true;
      throw error;
    }

    const keptItems = itemIcons.filter((item) => !item.omitted404).length;
    console.log(
      `Recursos locais preparados: ${results.length} espécies (${results.filter((result) => !result.omitted404).length} PNGs, ${results.filter((result) => result.omitted404).length} omissões 404), ${typeIcons.length} ícones de tipo, ${categoryIcons.length} de categoria, ${keptItems} itens (${itemIcons.length - keptItems} omissões 404).`,
    );
  } finally {
    if (!preserveStageForRecovery) {
      try {
        await rm(stageRoot, {recursive: true, force: true});
      } catch (error) {
        console.error(`Aviso: não foi possível limpar o staging temporário ${stageRoot}: ${errorMessage(error)}`);
      }
    }
    await cleanupCreatedDirectories(createdDirectories);
  }
}

main().catch((error) => {
  console.error(`prepare-ui-assets: ${errorMessage(error)}`);
  process.exitCode = 1;
});
