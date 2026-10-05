import {useId} from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import {moveLabel} from '../../domain/catalog-labels';
import {moveDisplay} from '../../domain/dex';
import {getMoveSwapView, type MoveSwapPlan} from '../../domain/move-swap';
import type {PlayerIndividual} from '../../platform/api';
import {Button, Select, StatusMessage, TypeBadge, type SelectOption} from '../../ui';
import {damageSwapBlocker} from './model';
import styles from './MovePreparation.module.css';

export interface MovePreparationProps {
  individual: PlayerIndividual;
  plan: MoveSwapPlan;
  onPlanChange(patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void;
  onOpenDamage(candidateMoveId: string, slotIndex: number): void;
}

function PreviewTile({caption, moveId}: {caption: string; moveId: string}) {
  const display = moveDisplay(moveId);
  return (
    <div className={styles.tile}>
      <span>{caption}</span>
      <strong>{display.name}</strong>
      {display.type && <TypeBadge type={display.type} size="sm" />}
    </div>
  );
}

export function MovePreparation({individual, plan, onPlanChange, onOpenDamage}: MovePreparationProps) {
  const titleId = useId();
  const view = getMoveSwapView(individual, plan);
  const selectedPlan = plan.individualUuid === individual.uuid;
  const preview = view.status === 'ready' ? view.preview : null;
  const damageBlocker = preview ? damageSwapBlocker(individual, preview.slotIndex, preview.afterMoveId) : null;

  const slotOptions: SelectOption[] =
    view.status === 'ready'
      ? view.equippedMoves.map((move, index) => ({key: String(index), label: `Slot ${index + 1} · ${moveLabel(move.id)}`}))
      : [];
  const candidateOptions: SelectOption[] =
    view.status === 'ready' ? view.candidates.map((move) => ({key: move.id, label: moveLabel(move.id)})) : [];

  return (
    <section className={styles.preparation} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <h4 id={titleId}>Planejar troca</h4>
        <p>Simule trocar um golpe equipado por um aprendido. Nada é gravado.</p>
      </div>

      {view.status === 'inconclusive' ? (
        <p className={styles.state} role="status" aria-live="polite">
          {view.reason === 'both-unknown'
            ? 'Golpes não capturados nesta leitura.'
            : view.reason === 'equipped-unknown'
              ? 'Golpes equipados não capturados nesta leitura.'
              : 'Golpes aprendidos não capturados nesta leitura.'}
        </p>
      ) : view.status === 'empty' ? (
        <p className={styles.state} role="status" aria-live="polite">
          {view.reason === 'no-equipped' ? 'Nenhum golpe equipado para trocar.' : 'Nenhum golpe aprendido disponível para troca.'}
        </p>
      ) : (
        <>
          <div className={styles.fields}>
            <Select
              label="Slot equipado para a prévia"
              options={slotOptions}
              value={selectedPlan && plan.slotIndex !== null ? String(plan.slotIndex) : null}
              onChange={(value) => onPlanChange({slotIndex: value === null ? null : Number(value)})}
              placeholder="Escolha um slot"
            />
            <Select
              label="Golpe aprendido para a proposta"
              options={candidateOptions}
              value={selectedPlan ? plan.candidateMoveId : null}
              onChange={(value) => onPlanChange({candidateMoveId: value})}
              placeholder="Escolha um golpe aprendido"
            />
          </div>

          {preview ? (
            <output className={styles.preview} aria-label="Prévia da troca planejada">
              <PreviewTile caption={`Slot ${preview.slotIndex + 1}`} moveId={preview.beforeMoveId} />
              <ArrowRight className={styles.arrow} aria-hidden="true" weight="bold" />
              <PreviewTile caption="Proposta" moveId={preview.afterMoveId} />
              <p className={styles.calculationNote}>O cálculo compara o slot {preview.slotIndex + 1} com o candidato.</p>
            </output>
          ) : (
            <p className={styles.emptyPreview}>Escolha um slot e um candidato para conferir o antes e depois.</p>
          )}

          {preview &&
            (damageBlocker !== null ? (
              <StatusMessage tone="info" title="Cálculo de dano indisponível">
                {damageBlocker}.
              </StatusMessage>
            ) : (
              <Button variant="primary" className={styles.openDamage} onPress={() => onOpenDamage(preview.afterMoveId, preview.slotIndex)}>
                Abrir cálculo de dano <ArrowRight aria-hidden="true" weight="bold" />
              </Button>
            ))}
        </>
      )}
    </section>
  );
}
