import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECIES_CSV_REVISION = 'bc92d3b6029ef1abe9e7ad424c400b338f3c11fe';
const SPRITES_REVISION = '1aa1b0ca273d0e096469a9846155484920b11b45';
const SPECIES_CSV_URL = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${SPECIES_CSV_REVISION}/data/v2/csv/pokemon_species.csv`;
const ARTWORK_URL = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REVISION}/sprites/pokemon/other/official-artwork`;
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
    throw new Error(`${description}: falha ao acessar ${url}: ${errorMessage(error)}`, { cause: error });
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
  const idColumns = headers.reduce((indices, header, index) => {
    if (header === 'id') indices.id.push(index);
    if (header === 'identifier') indices.identifier.push(index);
    return indices;
  }, { id: [], identifier: [] });

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
    species.push({ dexNumber: Number(dexNumber), identifier, speciesId: `cobblemon:${identifier}` });
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
    throw new Error(`CSV de espécies: resposta ilegível: ${errorMessage(error)}`, { cause: error });
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`CSV de espécies: conteúdo não é UTF-8 válido: ${errorMessage(error)}`, { cause: error });
  }
  return { species: parseSpecies(text), csvSha256: sha256(bytes) };
}

async function stageArtwork(species, pokemonStageDirectory) {
  const results = new Array(species.length);
  let nextIndex = 0;
  let failed = false;
  let firstFailure;

  async function worker() {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= species.length) return;

      try {
        const entry = species[index];
        const url = `${ARTWORK_URL}/${entry.dexNumber}.png`;
        const response = await fetchChecked(url, `Artwork de ${entry.speciesId}`);
        if (response.status === 404) {
          results[index] = { ...entry, artworkPath: null, url, sha256: null, omitted404: true };
          continue;
        }
        if (!response.ok) {
          throw new Error(`Artwork de ${entry.speciesId}: HTTP ${response.status} em ${url}; somente 404 individual pode ser omitido.`);
        }

        let bytes;
        try {
          bytes = Buffer.from(await response.arrayBuffer());
        } catch (error) {
          throw new Error(`Artwork de ${entry.speciesId}: resposta ilegível em ${url}: ${errorMessage(error)}`, { cause: error });
        }
        if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
          throw new Error(`Artwork de ${entry.speciesId}: assinatura PNG inválida em ${url}.`);
        }

        const artworkPath = `/pokemon/${entry.dexNumber}.png`;
        const filePath = path.join(pokemonStageDirectory, `${entry.dexNumber}.png`);
        try {
          await writeFile(filePath, bytes, { flag: 'wx' });
        } catch (error) {
          throw new Error(`Artwork de ${entry.speciesId}: não foi possível preparar ${filePath}: ${errorMessage(error)}`, { cause: error });
        }
        results[index] = { ...entry, artworkPath, url, sha256: sha256(bytes), omitted404: false };
      } catch (error) {
        if (!failed) firstFailure = error;
        failed = true;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, species.length) }, () => worker()));
  if (failed) throw firstFailure;
  return results;
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

function createProvenance(results, csvSha256) {
  return {
    pinnedRevisions: {
      pokemonSpeciesCsv: SPECIES_CSV_REVISION,
      pokemonSprites: SPRITES_REVISION,
    },
    sources: {
      speciesCsv: SPECIES_CSV_URL,
      artworkBase: ARTWORK_URL,
      license: LICENSE_URL,
    },
    credit: 'Artwork Pokémon: The Pokémon Company; arquivos-fonte obtidos do repositório PokéAPI/sprites.',
    copyrightWarning: 'As imagens são © The Pokémon Company. A declaração CC0 do repositório de sprites não concede direitos sobre obras de terceiros.',
    licenseWarning: 'Uso apenas como preparação local. Não inclua PNGs ou manifestos gerados em commits/distribuições; qualquer distribuição exige autorização específica dos titulares dos direitos.',
    speciesCsv: {
      url: SPECIES_CSV_URL,
      sha256: csvSha256,
    },
    files: results.filter((result) => !result.omitted404).map((result) => ({
      speciesId: result.speciesId,
      dexNumber: result.dexNumber,
      path: result.artworkPath,
      url: result.url,
      sha256: result.sha256,
    })),
    omitted404Species: results.filter((result) => result.omitted404).map((result) => ({
      speciesId: result.speciesId,
      dexNumber: result.dexNumber,
      url: result.url,
      status: 404,
    })),
  };
}

async function writeStagedOutputs(results, csvSha256, stageManifest, pokemonStageDirectory) {
  const manifest = `${JSON.stringify(createSpeciesManifest(results), null, 2)}\n`;
  const provenance = `${JSON.stringify(createProvenance(results, csvSha256), null, 2)}\n`;
  try {
    await writeFile(stageManifest, manifest, { encoding: 'utf8', flag: 'wx' });
    await writeFile(path.join(pokemonStageDirectory, 'provenance.json'), provenance, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    throw new Error(`Não foi possível gravar os manifestos temporários: ${errorMessage(error)}`, { cause: error });
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
  await mkdir(directoryPath, { recursive: true });
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

async function publishOutputs({ stageRoot, stageManifest, pokemonStageDirectory, manifestDestination, pokemonDestination, createdDirectories }) {
  const manifestParent = path.dirname(manifestDestination);
  const pokemonParent = path.dirname(pokemonDestination);
  await ensureOutputDirectory(manifestParent, createdDirectories);
  await ensureOutputDirectory(pokemonParent, createdDirectories);

  const stagingStats = await lstat(stageRoot);
  const manifestParentStats = await lstat(manifestParent);
  const pokemonParentStats = await lstat(pokemonParent);
  if (stagingStats.dev !== manifestParentStats.dev || stagingStats.dev !== pokemonParentStats.dev) {
    throw new Error('Publicação recusada: staging e destinos não estão no mesmo volume.');
  }

  const manifestType = await getPathType(manifestDestination);
  const pokemonType = await getPathType(pokemonDestination);
  if (manifestType !== 'missing' && manifestType !== 'file') {
    throw new Error(`Destino do manifesto não é um arquivo regular: ${manifestDestination}.`);
  }
  if (pokemonType !== 'missing' && pokemonType !== 'directory') {
    throw new Error(`Destino de artwork não é um diretório regular: ${pokemonDestination}.`);
  }

  const backupDirectory = path.join(stageRoot, 'backups');
  await mkdir(backupDirectory, { recursive: true });
  const manifestBackup = path.join(backupDirectory, 'species-artwork.json');
  const pokemonBackup = path.join(backupDirectory, 'pokemon');
  let oldManifestMoved = false;
  let oldPokemonMoved = false;
  let newManifestPublished = false;
  let newPokemonPublished = false;

  try {
    if (manifestType === 'file') {
      await rename(manifestDestination, manifestBackup);
      oldManifestMoved = true;
    }
    if (pokemonType === 'directory') {
      await rename(pokemonDestination, pokemonBackup);
      oldPokemonMoved = true;
    }
    await rename(stageManifest, manifestDestination);
    newManifestPublished = true;
    await rename(pokemonStageDirectory, pokemonDestination);
    newPokemonPublished = true;
  } catch (error) {
    const rollbackErrors = [];
    const attemptRollback = async (description, action) => {
      try {
        await action();
      } catch (rollbackError) {
        rollbackErrors.push(`${description}: ${errorMessage(rollbackError)}`);
      }
    };

    if (newPokemonPublished) await attemptRollback('remover novo diretório public/pokemon', () => rm(pokemonDestination, { recursive: true, force: true }));
    if (newManifestPublished) await attemptRollback('remover novo manifesto', () => rm(manifestDestination, { force: true }));
    if (oldPokemonMoved) await attemptRollback('restaurar diretório public/pokemon', () => rename(pokemonBackup, pokemonDestination));
    if (oldManifestMoved) await attemptRollback('restaurar manifesto anterior', () => rename(manifestBackup, manifestDestination));

    if (rollbackErrors.length > 0) {
      throw new Error(`Publicação falhou: ${errorMessage(error)}. Falha ao restaurar saída anterior; backups preservados em ${backupDirectory}. ${rollbackErrors.join(' | ')}`, { cause: error });
    }
    throw new Error(`Publicação falhou; saídas anteriores restauradas: ${errorMessage(error)}`, { cause: error });
  }
}

async function main() {
  const { species, csvSha256 } = await readSpeciesCsv();
  const stageRoot = await mkdtemp(path.join(PROJECT_ROOT, '.prepare-ui-assets-'));
  const stageManifest = path.join(stageRoot, 'src', 'data', 'species-artwork.json');
  const pokemonStageDirectory = path.join(stageRoot, 'public', 'pokemon');
  const manifestDestination = path.join(PROJECT_ROOT, 'src', 'data', 'species-artwork.json');
  const pokemonDestination = path.join(PROJECT_ROOT, 'public', 'pokemon');
  const createdDirectories = [];
  let preserveStageForRecovery = false;

  try {
    await mkdir(path.dirname(stageManifest), { recursive: true });
    await mkdir(pokemonStageDirectory, { recursive: true });
    const results = await stageArtwork(species, pokemonStageDirectory);
    await writeStagedOutputs(results, csvSha256, stageManifest, pokemonStageDirectory);

    try {
      await publishOutputs({
        stageRoot,
        stageManifest,
        pokemonStageDirectory,
        manifestDestination,
        pokemonDestination,
        createdDirectories,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('backups preserved in')) preserveStageForRecovery = true;
      throw error;
    }

    console.log(`Artwork local preparado: ${results.length} espécies, ${results.filter((result) => !result.omitted404).length} PNGs, ${results.filter((result) => result.omitted404).length} omissões HTTP 404.`);
  } finally {
    if (!preserveStageForRecovery) {
      try {
        await rm(stageRoot, { recursive: true, force: true });
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
