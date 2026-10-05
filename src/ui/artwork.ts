type SpeciesArtworkRecord = {
  readonly dexNumber: number;
  readonly artworkPath: string | null;
};

export type ArtworkManifest = Readonly<Record<string, SpeciesArtworkRecord>>;

/** De onde veio a imagem: `exact` e `name` são a espécie certa; `base-form` é a forma normal mostrando por uma forma sem arte própria. */
type ArtworkSource = 'exact' | 'name' | 'base-form';

export type ResolvedArtwork = {path: string; source: ArtworkSource} | {path: null; source: 'none'};

/** Id sem namespace, minúsculo e só alfanumérico: `cobblemon:mr_mime`, `mr-mime` e `Mr. Mime` viram `mrmime`. */
export function normalizeSpeciesKey(speciesId: string): string {
  return speciesId
    .replace(/^[^:]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function buildArtworkIndex(manifest: ArtworkManifest): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const [speciesId, record] of Object.entries(manifest)) {
    if (record.artworkPath !== null) index.set(normalizeSpeciesKey(speciesId), record.artworkPath);
  }
  return index;
}

/**
 * Ordem: arte exata da espécie → arte pelo nome normalizado (ids divergentes do catálogo). Para qualquer forma que não seja
 * a normal (alternativa ou desconhecida), a arte da espécie vira `base-form`: a tela precisa marcar que não é a forma certa.
 */
export function resolveArtwork(
  manifest: ArtworkManifest,
  index: ReadonlyMap<string, string>,
  speciesId: string,
  formId: string,
): ResolvedArtwork {
  const exact = manifest[speciesId]?.artworkPath ?? null;
  const byName = index.get(normalizeSpeciesKey(speciesId)) ?? null;
  const path = exact ?? byName;
  if (path === null) return {path: null, source: 'none'};
  if (formId === 'normal') return {path, source: exact === null ? 'name' : 'exact'};
  return {path, source: 'base-form'};
}

/** Nome legível a partir do id, só para o placeholder (`cobblemon:mr_mime` → `Mr Mime`). */
export function artworkFallbackName(speciesId: string): string {
  return speciesId
    .replace(/^[^:]+:/, '')
    .split(/[_\-\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
