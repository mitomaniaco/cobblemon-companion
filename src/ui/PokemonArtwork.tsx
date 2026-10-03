import {useState} from 'react';
import speciesArtworkJson from '../data/species-artwork.json';
import styles from './PokemonArtwork.module.css';

type SpeciesArtworkRecord = {
  readonly dexNumber: number;
  readonly artworkPath: string | null;
};

const speciesArtwork = speciesArtworkJson as Readonly<Record<string, SpeciesArtworkRecord>>;

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
