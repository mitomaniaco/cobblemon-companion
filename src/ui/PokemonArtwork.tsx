import {useState} from 'react';
import {artworkFallbackName, resolveArtwork} from './artwork';
import {useArtwork} from './artwork-store';
import styles from './PokemonArtwork.module.css';
import {PokeBallMark} from './PokeBallMark';

export type PokemonArtworkVariant = 'collection' | 'slot' | 'detail';

export interface PokemonArtworkProps {
  speciesId: string;
  formId: string;
  variant: PokemonArtworkVariant;
  loading?: 'eager' | 'lazy';
  className?: string;
}

const unavailableLabel = 'Imagem indisponível';
const detailCaption = 'Ilustração da espécie';
const baseFormCaption = 'Arte da forma normal';
const SLOT_INITIALS = 3;

export function PokemonArtwork({speciesId, formId, variant, loading, className}: PokemonArtworkProps) {
  const {manifest, index} = useArtwork();
  const resolved = resolveArtwork(manifest, index, speciesId, formId);
  const artworkPath = resolved.path;
  const artworkKey = `${speciesId}\u0000${formId}\u0000${artworkPath ?? ''}`;
  const [failedArtworkKey, setFailedArtworkKey] = useState<string | null>(null);
  const imageLoading = loading ?? (variant === 'detail' ? 'eager' : 'lazy');
  const size = variant === 'collection' ? 64 : variant === 'slot' ? 52 : 168;
  const unavailable = artworkPath === null || failedArtworkKey === artworkKey;
  const baseForm = !unavailable && resolved.source === 'base-form';
  const name = artworkFallbackName(speciesId);

  return (
    <figure
      className={`${styles.artwork} ${styles[variant]}${className ? ` ${className}` : ''}`}
      data-artwork={unavailable ? 'none' : resolved.source}
    >
      <div className={styles.frame}>
        {unavailable ? (
          <span className={styles.unavailable} role="img" aria-label={unavailableLabel} title={name}>
            <PokeBallMark className={styles.unavailableMark} />
            <span className={styles.unavailableName} aria-hidden="true">
              {variant === 'slot' ? name.slice(0, SLOT_INITIALS) : name}
            </span>
          </span>
        ) : (
          <img
            key={artworkKey}
            className={styles.image}
            src={artworkPath}
            width={size}
            height={size}
            alt=""
            decoding="async"
            loading={imageLoading}
            onError={() => setFailedArtworkKey(artworkKey)}
          />
        )}
        {baseForm && (
          <span className={styles.baseFormMark} role="img" aria-label={baseFormCaption} title={baseFormCaption}>
            N
          </span>
        )}
      </div>
      {variant === 'detail' && !unavailable && (
        <figcaption className={styles.caption}>{baseForm ? baseFormCaption : detailCaption}</figcaption>
      )}
    </figure>
  );
}
