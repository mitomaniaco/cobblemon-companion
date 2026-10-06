import {Sparkle} from '@phosphor-icons/react';
import {useState} from 'react';
import {artworkFallbackName, resolveArtwork} from './artwork';
import {useArtwork} from './artwork-store';
import styles from './PokemonArtwork.module.css';
import {PokeBallMark} from './PokeBallMark';

export type PokemonArtworkVariant = 'collection' | 'slot' | 'detail';

export interface PokemonArtworkProps {
  speciesId: string;
  formId: string;
  /** Shiny do indivíduo; ausente ou nulo (desconhecido) mostra a arte normal sem selo. */
  shiny?: boolean | null;
  variant: PokemonArtworkVariant;
  loading?: 'eager' | 'lazy';
  className?: string;
}

const unavailableLabel = 'Imagem indisponível';
const detailCaption = 'Ilustração da espécie';
const shinyCaption = 'Ilustração shiny';
const noFormArt = 'Sem arte da forma';
const noShinyArt = 'Sem arte shiny';
const SLOT_INITIALS = 3;

export function PokemonArtwork({speciesId, formId, shiny, variant, loading, className}: PokemonArtworkProps) {
  const {manifest, index} = useArtwork();
  const isShiny = shiny === true;
  const resolved = resolveArtwork(manifest, index, speciesId, formId, isShiny);
  const artworkPath = resolved.path;
  const artworkKey = `${speciesId}\u0000${formId}\u0000${isShiny}\u0000${artworkPath ?? ''}`;
  const [failedArtworkKey, setFailedArtworkKey] = useState<string | null>(null);
  const imageLoading = loading ?? (variant === 'detail' ? 'eager' : 'lazy');
  const size = variant === 'collection' ? 64 : variant === 'slot' ? 52 : 168;
  const unavailable = artworkPath === null || failedArtworkKey === artworkKey;
  const baseForm = !unavailable && resolved.source === 'base-form';
  const shinyMissing = isShiny && resolved.shiny === 'shiny-missing';
  const missing = [baseForm ? noFormArt : null, shinyMissing ? noShinyArt : null].filter((label): label is string => label !== null);
  const missingLabel = missing.join(' e ').replace(' e Sem', ' e sem');
  const name = artworkFallbackName(speciesId);
  const shinyLabel = shinyMissing ? `Shiny · ${noShinyArt.toLowerCase()}` : 'Shiny';
  const detailText =
    missing.length > 0
      ? [baseForm ? `${noFormArt}: forma normal` : null, shinyMissing ? `${noShinyArt}: versão normal` : null].filter(Boolean).join(' · ')
      : isShiny
        ? shinyCaption
        : detailCaption;

  return (
    <figure
      className={`${styles.artwork} ${styles[variant]}${className ? ` ${className}` : ''}`}
      data-artwork={unavailable ? 'none' : resolved.source}
      data-shiny={isShiny ? (unavailable ? 'shiny-missing' : resolved.shiny) : 'normal'}
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
        {isShiny && (
          <span
            className={styles.shinyMark}
            data-art={shinyMissing ? 'missing' : 'ok'}
            role="img"
            aria-label={shinyLabel}
            title={shinyLabel}
          >
            <Sparkle weight="fill" aria-hidden="true" />
          </span>
        )}
        {missing.length > 0 && (
          <span className={styles.missingMark} role="img" aria-label={missingLabel} title={missingLabel}>
            !
          </span>
        )}
      </div>
      {variant === 'detail' && !unavailable && <figcaption className={styles.caption}>{detailText}</figcaption>}
    </figure>
  );
}
