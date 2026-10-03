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
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.workspace} aria-labelledby={headingId}>
      <Button className={styles.backButton} variant="quiet" onPress={onBack}>
        <ArrowLeft aria-hidden="true" weight="bold" />
        {returnButtonLabel}
      </Button>
      <header className={styles.heading}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          Planejador de dano
        </h2>
        <p>
          Compare um golpe observado neste indivíduo com um perfil de alvo preenchido manualmente. O cálculo vem do Companion; esta área não
          escreve no save.
        </p>
      </header>

      {!snapshot ? (
        <div className={styles.emptyState}>
          {phase === 'loading' ? (
            <StatusMessage tone="info" title="A captura está sendo atualizada">
              O cálculo anterior foi invalidado antes da nova leitura. Aguarde a captura atual.
            </StatusMessage>
          ) : phase === 'error' ? (
            <StatusMessage tone="error" title="Não há captura disponível">
              {error || 'A leitura local não foi concluída.'} Atualize o save para carregar os fatos necessários.
            </StatusMessage>
          ) : (
            <StatusMessage tone="info" title="Carregue uma captura para começar">
              O planejador não preenche fatos desconhecidos. Atualize o save e selecione um indivíduo para habilitar uma comparação.
            </StatusMessage>
          )}
          {phase !== 'loading' && (
            <Button variant="primary" onPress={onRefresh}>
              {phase === 'error' ? 'Tentar novamente' : 'Atualizar do save'}
            </Button>
          )}
        </div>
      ) : !individual ? (
        <StatusMessage tone="info" title="Nenhum indivíduo selecionado">
          Volte à equipe ou ao PC e selecione o indivíduo que deseja analisar.
        </StatusMessage>
      ) : (
        <DamagePlannerForm individual={individual} controller={controller} />
      )}
    </section>
  );
}
