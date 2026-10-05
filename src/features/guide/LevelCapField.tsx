import {useId} from 'react';
import {isInvalidLevelCapInput} from './evolution-model';
import styles from './LevelCapField.module.css';

export interface LevelCapFieldProps {
  value: string;
  onChange(value: string): void;
}

/** Cap compartilhado por Evoluções e Treino. O app não detecta o cap: vazio ou inválido = desconhecido, nunca presumido. */
export function LevelCapField({value, onChange}: LevelCapFieldProps) {
  const id = useId();
  const invalid = isInvalidLevelCapInput(value);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Level cap atual (opcional)</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min="1"
        max="100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className={invalid ? styles.invalid : styles.muted}>
        {invalid
          ? 'Use um inteiro de 1 a 100; sem cap, o alcance e o nível-alvo ficam não determinados.'
          : 'O app não detecta o cap: sem ele, o alcance das evoluções e o nível-alvo do treino ficam não determinados.'}
      </span>
    </div>
  );
}
