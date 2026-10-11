import {useEffect, useId, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {ArrowClockwise, Info} from '@phosphor-icons/react';
import type {ToolTone} from './guide-model';
import styles from './ToolFrame.module.css';

interface ToolFrameChip {
  tone: ToolTone;
  text: string;
}

export interface ToolFrameProps {
  title: string;
  /** Resumo da ferramenta: ponto colorido + texto, sem borda. */
  chips?: ReadonlyArray<ToolFrameChip>;
  onRecalculate?(): void;
  recalculating?: boolean;
  /** Hipóteses e limites do cálculo, mostrados sob demanda em "Como calculamos". */
  notes?: ReactNode;
  children: ReactNode;
}

/** Moldura comum das ferramentas do Guia dentro do Trainer Card: cabeçalho fixo e corpo que preenche o resto da altura. */
export function ToolFrame({title, chips, onRecalculate, recalculating = false, notes, children}: ToolFrameProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notesOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotesOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setNotesOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [notesOpen]);

  return (
    <section className={styles.frame} aria-label={title}>
      <header className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {chips && chips.length > 0 && (
          <ul className={styles.chips}>
            {chips.map((chip) => (
              <li key={chip.text} className={styles.chip} data-tone={chip.tone}>
                {chip.text}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions} ref={rootRef}>
          {onRecalculate && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Recalcular"
              data-tooltip="Recalcular"
              disabled={recalculating}
              onClick={onRecalculate}
            >
              <ArrowClockwise aria-hidden="true" weight="bold" />
            </button>
          )}
          {notes != null && (
            <>
              <button
                type="button"
                className={styles.notesButton}
                aria-expanded={notesOpen}
                aria-controls={notesId}
                onClick={() => setNotesOpen(!notesOpen)}
              >
                <Info aria-hidden="true" weight="bold" />
                Como calculamos
              </button>
              <div id={notesId} className={styles.notes} hidden={!notesOpen}>
                {notes}
              </div>
            </>
          )}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
