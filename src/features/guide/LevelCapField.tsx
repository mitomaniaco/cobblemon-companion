import {useId} from 'react';
import {isInvalidLevelCapInput} from './evolution-model';
import {LEVEL_CAP_REQUIRED_TEXT} from './guide-model';
import styles from './LevelCapField.module.css';

export interface LevelCapFieldProps {
  value: string;
  onChange(value: string): void;
  /** Objetivo de líder: o cap é obrigatório e fica em destaque até ser informado. */
  required?: boolean;
  /** Cap padrão derivado do progresso, mantido como valor efetivo enquanto o campo fica editável. */
  defaultLevelCap?: number | null;
}

/** Cap compartilhado por Evoluções e Treino. O campo pode substituir o padrão do progresso. */
export function LevelCapField({value, onChange, required = false, defaultLevelCap = null}: LevelCapFieldProps) {
  const id = useId();
  const invalid = isInvalidLevelCapInput(value);
  const missing = required && value.trim() === '' && defaultLevelCap === null;
  return (
    <div className={styles.field} data-required={missing ? 'true' : undefined}>
      <label htmlFor={id}>{required ? 'Level cap atual (obrigatório para líder)' : 'Level cap atual (opcional)'}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min="1"
        max="100"
        value={value}
        placeholder={defaultLevelCap === null ? undefined : String(defaultLevelCap)}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || missing}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className={invalid || missing ? styles.invalid : styles.muted}>
        {invalid
          ? 'Use um inteiro de 1 a 100; sem cap, o alcance e o nível-alvo ficam não determinados.'
          : defaultLevelCap !== null
            ? `Padrão do progresso: nível ${defaultLevelCap}. Informe outro valor para substituir.`
            : missing
              ? LEVEL_CAP_REQUIRED_TEXT
              : 'Sem valor informado nem cap disponível no progresso, o alcance das evoluções e o nível-alvo do treino ficam não determinados.'}
      </span>
    </div>
  );
}
