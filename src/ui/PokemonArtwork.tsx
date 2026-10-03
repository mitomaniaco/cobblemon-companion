import {useState} from 'react';
import styles from './PokemonArtwork.module.css';

type SpeciesArtworkRecord = {
  readonly dexNumber: number;
  readonly artworkPath: string | null;
};

// O manifesto é gerado por `npm run prepare:ui-assets` e não é versionado. Sem ele,
// todas as espécies mostram o placeholder "Imagem indisponível".
const manifests = import.meta.glob<Readonly<Record<string, SpeciesArtworkRecord>>>(
  '../data/species-artwork.json',
  {eager: true, import: 'default'},
);
const speciesArtwork: Readonly<Record<string, SpeciesArtworkRecord>> = Object.values(manifests)[0] ?? {};

export type PokemonArtworkVariant = 'collection' | 'detail';

export interface PokemonArtworkProps {
  speciesId: string;
  formId: string;
  variant: PokemonArtworkVariant;
  loading?: 'eager' | 'lazy';
  className?: string;
}

const unavailableLabel = 'Imagem indisponível';
const detailCaption = 'Ilustração da espécie; aparência do indivíduo não capturada';

export function PokemonArtwork({
  speciesId,
  formId,
  variant,
  loading,
  className,
}: PokemonArtworkProps) {
  const record = formId === 'normal' ? speciesArtwork[speciesId] : undefined;
  const artworkPath = record?.artworkPath ?? null;
  const artworkKey = `${speciesId}\u0000${formId}\u0000${artworkPath ?? ''}`;
  const [failedArtworkKey, setFailedArtworkKey] = useState<string | null>(null);
  const imageLoading = loading ?? (variant === 'detail' ? 'eager' : 'lazy');
  const size = variant === 'collection' ? 88 : 160;
  const unavailable = artworkPath === null || failedArtworkKey === artworkKey;

  return (
    <figure className={`${styles.artwork} ${styles[variant]}${className ? ` ${className}` : ''}`}>
      <div className={styles.frame}>
        {unavailable ? (
          <span className={styles.unavailable} role="img" aria-label={unavailableLabel}>
            {unavailableLabel}
          </span>
        ) : (
          <img
            key={artworkKey}
            className={styles.image}
            src={artworkPath}
            width={size}
            height={size}
            alt=""
            loading={imageLoading}
            onError={() => setFailedArtworkKey(artworkKey)}
          />
        )}
      </div>
      {variant === 'detail' && <figcaption className={styles.caption}>{detailCaption}</figcaption>}
    </figure>
  );
}
