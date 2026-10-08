type ArtworkVariantRecord = {
  readonly artworkPath: string | null;
  /** Arte shiny desta espécie/forma; ausente ou nula = sem arte shiny. */
  readonly shinyPath?: string | null;
};

type SpeciesArtworkRecord = ArtworkVariantRecord & {
  readonly dexNumber: number;
  /** Arte própria de formas alternativas, por `formId`; forma que não está aqui não tem arte própria. */
  readonly forms?: Readonly<Record<string, ArtworkVariantRecord>>;
};

export type ArtworkManifest = Readonly<Record<string, SpeciesArtworkRecord>>;

/**
 * De onde veio a imagem: `exact` e `name` são a espécie certa na forma normal; `form` é a arte da própria forma;
 * `base-form` é a forma normal mostrada no lugar de uma forma sem arte própria (a tela precisa marcar).
 */
type ArtworkSource = 'exact' | 'name' | 'form' | 'base-form';

/** `shiny`: arte shiny; `shiny-missing`: o indivíduo é shiny mas só há a arte normal (a tela marca); `normal`: não é shiny. */
type ArtworkShiny = 'normal' | 'shiny' | 'shiny-missing';

export type ResolvedArtwork =
  | {path: string; source: ArtworkSource; shiny: ArtworkShiny}
  | {path: null; source: 'none'; shiny: ArtworkShiny};

/** Id sem namespace, minúsculo e só alfanumérico: `cobblemon:mr_mime`, `mr-mime` e `Mr. Mime` viram `mrmime`. */
export function normalizeSpeciesKey(speciesId: string): string {
  return speciesId
    .replace(/^[^:]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type ArtworkIndex = ReadonlyMap<string, SpeciesArtworkRecord>;

/** Índice por nome normalizado, só de espécies com alguma arte (normal ou shiny). */
export function buildArtworkIndex(manifest: ArtworkManifest): ArtworkIndex {
  const index = new Map<string, SpeciesArtworkRecord>();
  for (const [speciesId, record] of Object.entries(manifest)) {
    if (record.artworkPath !== null || record.shinyPath) index.set(normalizeSpeciesKey(speciesId), record);
  }
  return index;
}

function withShiny(variant: ArtworkVariantRecord, shiny: boolean): {path: string | null; shiny: ArtworkShiny} {
  if (!shiny) return {path: variant.artworkPath, shiny: 'normal'};
  if (variant.shinyPath) return {path: variant.shinyPath, shiny: 'shiny'};
  return {path: variant.artworkPath, shiny: 'shiny-missing'};
}

/**
 * Ordem: espécie exata → espécie pelo nome normalizado (ids divergentes do catálogo). Forma alternativa usa a arte da
 * própria forma (`form`) e, sem ela, a da forma normal marcada `base-form`; forma desconhecida também é `base-form`.
 * Shiny usa a arte shiny da mesma variante; sem ela, a arte normal marcada `shiny-missing`. Nada vira outra espécie.
 */
export function resolveArtwork(
  manifest: ArtworkManifest,
  index: ArtworkIndex,
  speciesId: string,
  formId: string,
  isShiny: boolean,
): ResolvedArtwork {
  const exactRecord = manifest[speciesId];
  const record = exactRecord ?? index.get(normalizeSpeciesKey(speciesId));
  if (!record) return {path: null, source: 'none', shiny: isShiny ? 'shiny-missing' : 'normal'};
  const base = withShiny(record, isShiny);
  const formArt =
    formId === 'normal'
      ? undefined
      : (record.forms?.[formId] ?? record.forms?.[formLookupKey(formId)] ?? record.forms?.[formLookupKey(formId, true)]);
  if (formArt) {
    const own = withShiny(formArt, isShiny);
    if (own.path !== null) return {path: own.path, source: 'form', shiny: own.shiny};
  }
  if (base.path === null) return {path: null, source: 'none', shiny: base.shiny};
  if (formId === 'normal') return {path: base.path, source: exactRecord ? 'exact' : 'name', shiny: base.shiny};
  return {path: base.path, source: 'base-form', shiny: base.shiny};
}

const REGIONAL_ASPECT_MAP: Record<string, string> = {
  alolan: 'alola',
  galarian: 'galar',
  hisuian: 'hisui',
  paldean: 'paldea',
};
const REGIONAL_NAME_MAP: Record<string, string> = {
  alola: 'alolan',
  galar: 'galarian',
  hisui: 'hisuian',
  paldea: 'paldean',
};

/** Chave de forma do manifesto: aspectos em minúsculas, ordenados e unidos por "+" (`Alolan` → `alolan`, `male-galar` → `galar+male`). */
function formLookupKey(formId: string, mapToNames = false): string {
  const map = mapToNames ? REGIONAL_NAME_MAP : REGIONAL_ASPECT_MAP;
  return formId
    .toLowerCase()
    .split(/[-_+\s]+/)
    .filter((token) => token !== '')
    .map((token) => map[token] ?? token)
    .sort()
    .join('+');
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
