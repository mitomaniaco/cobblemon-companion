// Espécies efetivas do jogo: Cobblemon base + provedores (JARs em ordem alfabética, depois pastas de dados).
import fs from 'node:fs';
import path from 'node:path';
import {speciesSlug} from './compat-catalog.mjs';
import {mergeSpecies} from './guide-data.mjs';
import {classifyProviderEntries, collectDirectoryProviders, collectJarProvider, parseJsonBytes, sha256, unzipSelected} from './jar.mjs';

/** Lança Error se o JAR do Cobblemon não for exatamente o fixado no manifesto. */
export function loadMergedSpecies({instance, modsDirectory, jars, pinnedCobblemonSha256}) {
  const cobblemonJars = jars.filter((name) => /^Cobblemon-neoforge-.+\.jar$/.test(name));
  if (cobblemonJars.length !== 1) throw new Error(`esperado exatamente um JAR do Cobblemon, encontrado ${cobblemonJars.length}`);
  const cobblemonFile = path.join(modsDirectory, cobblemonJars[0]);
  if (sha256(fs.readFileSync(cobblemonFile)) !== pinnedCobblemonSha256)
    throw new Error('o JAR do Cobblemon não é o fixado em data/compat/manifest.json');

  const baseSpecies = {};
  for (const [name, bytes] of Object.entries(unzipSelected(cobblemonFile, (entry) => /^data\/cobblemon\/species\/.+\.json$/.test(entry)))) {
    baseSpecies[speciesSlug(name)] = parseJsonBytes(bytes, name);
  }
  const providers = jars
    .filter((name) => name !== cobblemonJars[0])
    .sort()
    .map((jar) => classifyProviderEntries(collectJarProvider(path.join(modsDirectory, jar)), jar));
  providers.push(...collectDirectoryProviders(instance));
  return mergeSpecies(baseSpecies, providers);
}
