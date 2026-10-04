import {useEffect, useId, useState} from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import {moveLabel} from '../../domain/catalog-labels';
import {getMoveSwapView, type MoveSwapPlan} from '../../domain/move-swap';
import type {PlayerIndividual} from '../../platform/api';
import {Button, Checkbox, Select, StatusMessage, type SelectOption} from '../../ui';
import {damageSwapBlocker} from './model';
import styles from './MovePreparation.module.css';

export interface MovePreparationProps {
  individual: PlayerIndividual;
  plan: MoveSwapPlan;
  onPlanChange(patch: Partial<Pick<MoveSwapPlan, 'slotIndex' | 'candidateMoveId'>>): void;
  onOpenDamage(candidateMoveId: string, slotIndex: number): void;
}

export function MovePreparation({individual, plan, onPlanChange, onOpenDamage}: MovePreparationProps) {
  const [confirmedPreviewKey, setConfirmedPreviewKey] = useState<string | null>(null);
  const titleId = useId();
  const view = getMoveSwapView(individual, plan);
  const selectedPlan = plan.individualUuid === individual.uuid;
  const preview = view.status === 'ready' ? view.preview : null;
  const previewKey = preview ? `${individual.uuid}:${preview.slotIndex}:${preview.afterMoveId}` : null;
  const damageBlocker = preview ? damageSwapBlocker(individual, preview.slotIndex, preview.afterMoveId) : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencies are intentional triggers to reset preview confirmation when individual or preview changes
  useEffect(() => {
    setConfirmedPreviewKey(null);
  }, [individual.uuid, previewKey]);

  const slotOptions: SelectOption[] =
    view.status === 'ready'
      ? view.equippedMoves.map((move, index) => ({key: String(index), label: `Slot ${index + 1} · ${moveLabel(move.id)}`}))
      : [];
  const candidateOptions: SelectOption[] =
    view.status === 'ready' ? view.candidates.map((move) => ({key: move.id, label: moveLabel(move.id)})) : [];
  const isPreviewConfirmed = previewKey !== null && confirmedPreviewKey === previewKey;

  return (
    <section className={styles.preparation} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <h4 id={titleId}>Preparar uma troca de golpe</h4>
        <p>A prévia usa somente os golpes observados neste UUID. Preparar uma proposta não equipa nem ensina golpes.</p>
      </div>

      {view.status === 'inconclusive' ? (
        <p className={styles.state} role="status" aria-live="polite">
          {view.reason === 'both-unknown'
            ? 'Inconclusivo: os golpes equipados e os golpes aprendidos não foram capturados nesta leitura.'
            : view.reason === 'equipped-unknown'
              ? 'Inconclusivo: a lista de golpes equipados não foi capturada nesta leitura.'
              : 'Inconclusivo: BenchedMoves não foi capturado; não é possível confirmar os candidatos disponíveis.'}
        </p>
      ) : view.status === 'empty' ? (
        <p className={styles.state} role="status" aria-live="polite">
          {view.reason === 'no-equipped'
            ? 'Sem opções: não há golpes equipados registrados para escolher um slot.'
            : 'Sem opções: BenchedMoves está vazio ou contém apenas golpes já equipados.'}
        </p>
      ) : (
        <>
          <p className={styles.state} role="status" aria-live="polite">
            Candidatos já equipados são removidos para evitar duplicatas e uma troca sem mudança.
          </p>
          <div className={styles.fields}>
            <Select
              label="Slot equipado para a prévia"
              options={slotOptions}
              value={selectedPlan && plan.slotIndex !== null ? String(plan.slotIndex) : null}
              onChange={(value) => onPlanChange({slotIndex: value === null ? null : Number(value)})}
              placeholder="Escolha um slot"
              description="A prévia pode usar qualquer slot registrado no MoveSet deste UUID."
            />
            <Select
              label="Golpe aprendido para a proposta"
              options={candidateOptions}
              value={selectedPlan ? plan.candidateMoveId : null}
              onChange={(value) => onPlanChange({candidateMoveId: value})}
              placeholder="Escolha um golpe aprendido"
              description="Candidatos observados em BenchedMoves para este indivíduo."
            />
          </div>

          {preview ? (
            <output className={styles.preview} aria-label="Prévia da troca planejada">
              <div>
                <span>Antes · slot {preview.slotIndex + 1}</span>
                <strong>{moveLabel(preview.beforeMoveId)}</strong>
              </div>
              <ArrowRight className={styles.arrow} aria-hidden="true" weight="bold" />
              <div>
                <span>Depois · proposta</span>
                <strong>{moveLabel(preview.afterMoveId)}</strong>
              </div>
              <p>Observado como aprendido neste indivíduo; nenhum dado do save é alterado.</p>
              <p className={styles.calculationNote}>O cálculo de dano compara o slot {preview.slotIndex + 1} com o candidato.</p>
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
              <>
                <Checkbox
                  className={styles.confirmation}
                  isSelected={isPreviewConfirmed}
                  onChange={(checked) => setConfirmedPreviewKey(checked ? previewKey : null)}
                >
                  Confirmo que esta é apenas uma proposta local; nada será equipado nem ensinado.
                </Checkbox>
                <Button
                  variant="primary"
                  className={styles.openDamage}
                  isDisabled={!isPreviewConfirmed}
                  onPress={() => onOpenDamage(preview.afterMoveId, preview.slotIndex)}
                >
                  Abrir cálculo de dano <ArrowRight aria-hidden="true" weight="bold" />
                </Button>
              </>
            ))}
        </>
      )}
    </section>
  );
}
