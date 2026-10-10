import type {CSSProperties} from 'react';
import {PokeBallMark} from '../../ui';
import styles from './TrainerFace.module.css';

export interface TrainerFaceProps {
  /** Skin 64×64 do Minecraft (caminho ou data URL); nulo mostra a Poké Ball. */
  src: string | null;
  label: string;
  size: number;
}

/** Rosto de uma skin do Minecraft: recorta a cabeça e a camada do chapéu da frente da textura. */
export function TrainerFace({src, label, size}: TrainerFaceProps) {
  const layer = (x: number): CSSProperties => ({
    backgroundImage: `url("${src}")`,
    backgroundSize: `${size * 8}px auto`,
    backgroundPosition: `-${size * x}px -${size}px`,
  });
  return (
    <span className={styles.face} role="img" aria-label={label} data-portrait={src ? 'skin' : 'none'} style={{width: size, height: size}}>
      {src ? (
        <>
          <span className={styles.layer} style={layer(1)} />
          <span className={styles.layer} style={layer(5)} />
        </>
      ) : (
        <PokeBallMark className={styles.mark} />
      )}
    </span>
  );
}
