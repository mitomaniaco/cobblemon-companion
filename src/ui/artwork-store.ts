import {useSyncExternalStore} from 'react';
import {buildArtworkIndex, type ArtworkManifest} from './artwork';

// O manifesto é gerado por `npm run prepare:ui-assets` e não é versionado. Sem ele, toda espécie mostra o placeholder
// com o nome da espécie (nunca um ícone igual para todas).
const generated = import.meta.glob<ArtworkManifest>('../data/species-artwork.json', {eager: true, import: 'default'});

type ArtworkState = {manifest: ArtworkManifest; index: ReadonlyMap<string, string>};

function createState(manifest: ArtworkManifest): ArtworkState {
  return {manifest, index: buildArtworkIndex(manifest)};
}

let state = createState(Object.values(generated)[0] ?? {});
const listeners = new Set<() => void>();

/** Troca o manifesto em uso (o modo de teste do harness injeta um manifesto sintético por aqui). */
export function setArtworkManifest(manifest: ArtworkManifest): void {
  state = createState(manifest);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useArtwork(): ArtworkState {
  return useSyncExternalStore(subscribe, () => state);
}
