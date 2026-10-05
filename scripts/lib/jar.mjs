// Leitura somente-leitura de JARs e pastas de dados da instância (compartilhada pelos geradores).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {speciesSlug} from './compat-catalog.mjs';

export const DATA_DIRECTORIES = ['kubejs/data', 'global_packs', 'datapacks', 'world/datapacks', 'config/openloader/data'];

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function unzipSelected(file, predicate) {
  return unzipSync(new Uint8Array(fs.readFileSync(file)), {filter: (entry) => predicate(entry.name)});
}

/** Lança Error com o rótulo se o JSON for inválido. */
export function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`JSON inválido em ${label}`);
  }
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else files.push(full);
  }
  return files;
}

/** Coleta, de um provedor (jar ou pasta), os arquivos que podem alterar espécies ou regras do Showdown. */
export function collectJarProvider(file) {
  const entries = unzipSelected(
    file,
    (name) =>
      /^data\/cobblemon\/species\/.+\.json$/.test(name) ||
      /^data\/cobblemon\/species_additions\/.+\.json$/.test(name) ||
      /\/showdown\/(?:mods\/)?(moves|abilities|items)\.js$/.test(name) ||
      /\/showdown\/battle-actions\.js$/.test(name) ||
      /\/showdown\/held_items\/.+\.js$/.test(name),
  );
  return {entries};
}

export function classifyProviderEntries(provider, label) {
  const result = {label, species: {}, additions: [], showdown: {}, battleActions: null, heldItemOverrides: []};
  for (const [name, bytes] of Object.entries(provider.entries)) {
    const showdownKind = name.match(/\/showdown\/(?:mods\/)?(moves|abilities|items)\.js$/)?.[1];
    if (/^data\/cobblemon\/species\/.+\.json$/.test(name)) result.species[speciesSlug(name)] = parseJsonBytes(bytes, `${label}:${name}`);
    else if (/^data\/cobblemon\/species_additions\/.+\.json$/.test(name)) {
      const json = parseJsonBytes(bytes, `${label}:${name}`);
      const target = typeof json.target === 'string' ? json.target : `cobblemon:${speciesSlug(name)}`;
      result.additions.push({target: target.replace(/^cobblemon:/, ''), json});
    } else if (showdownKind) {
      // O Mega Showdown traz `showdown/moves.js` e `showdown/mods/moves.js`: guardar todos, sem sobrescrever.
      result.showdown[showdownKind] = [...(result.showdown[showdownKind] ?? []), {file: name, source: strFromU8(bytes)}];
    } else if (/\/showdown\/battle-actions\.js$/.test(name)) result.battleActions = strFromU8(bytes);
    else if (/\/showdown\/held_items\/.+\.js$/.test(name)) {
      result.heldItemOverrides.push(
        path
          .basename(name, '.js')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ''),
      );
    }
  }
  return result;
}

export function collectDirectoryProviders(instance) {
  const providers = [];
  for (const relative of DATA_DIRECTORIES) {
    const directory = path.join(instance, relative);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) continue;
    const entries = {};
    for (const file of walkFiles(directory)) {
      const normalized = file.split(path.sep).join('/');
      const speciesMatch = normalized.match(/\/data\/cobblemon\/species\/.+\.json$/) || normalized.match(/\/cobblemon\/species\/.+\.json$/);
      const additionMatch = normalized.match(/\/cobblemon\/species_additions\/.+\.json$/);
      if (speciesMatch) entries[`data/cobblemon/species/${path.basename(file)}`] = fs.readFileSync(file);
      else if (additionMatch) entries[`data/cobblemon/species_additions/${path.basename(file)}`] = fs.readFileSync(file);
    }
    if (Object.keys(entries).length > 0) providers.push(classifyProviderEntries({entries}, relative));
  }
  return providers;
}
