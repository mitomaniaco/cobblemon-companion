import {useEffect, useId, useRef} from 'react';
import {ArrowLeft} from '@phosphor-icons/react';
import type {PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {Button, StatusMessage} from '../../ui';
import type {DamagePlannerController} from './controller';
import {DamagePlannerForm} from './DamagePlannerForm';
import styles from './DamageWorkspace.module.css';

export interface DamageWorkspaceProps {
  individual: PlayerIndividual | null;
  snapshot: PlayerSnapshot | null;
  controller: DamagePlannerController;
  phase: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  returnButtonLabel: string;
  onBack(): void;
  onRefresh(): void;
}

export function DamageWorkspace({
  individual,
  snapshot,
  controller,
  phase,
  error,
  returnButtonLabel,
  onBack,
  onRefresh,
}: DamageWorkspaceProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({preventScroll: true});
  }, []);

  return (
    <section className={styles.workspace} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <Button className={styles.backButton} variant="quiet" onPress={onBack}>
          <ArrowLeft aria-hidden="true" weight="bold" />
          {returnButtonLabel}
        </Button>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          Planejador de dano
        </h2>
      </header>

      {!snapshot ? (
        <div className={styles.emptyState}>
          {phase === 'loading' ? (
            <StatusMessage tone="info">Atualizando a captura…</StatusMessage>
          ) : phase === 'error' ? (
            <StatusMessage tone="error" title="Sem captura disponível">
              {error || 'A leitura local não foi concluída.'}
            </StatusMessage>
          ) : (
            <StatusMessage tone="info">Sem captura disponível.</StatusMessage>
          )}
          {phase !== 'loading' && (
            <Button variant="primary" onPress={onRefresh}>
              {phase === 'error' ? 'Tentar novamente' : 'Atualizar do save'}
            </Button>
          )}
        </div>
      ) : !individual ? (
        <StatusMessage tone="info">Selecione um Pokémon na equipe ou no PC.</StatusMessage>
      ) : (
        <DamagePlannerForm individual={individual} controller={controller} />
      )}
    </section>
  );
}
