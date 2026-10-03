import {useId, type FormEvent} from 'react';
import type {PlayerIndividual} from '../../platform/api';
import {Button, Checkbox, Select, StatusMessage, type SelectOption} from '../../ui';
import type {DamagePlannerController} from './controller';
import {
  DAMAGE_CONFIRMATION_COPY,
  DAMAGE_CONFIRMATION_KEYS,
  DAMAGE_NATURE_OPTIONS,
  DAMAGE_SPECIES_OPTIONS,
  DAMAGE_STATS,
  DAMAGE_STAT_LABELS,
  getDamagePlannerView,
  importedLabel,
} from './model';
import styles from './DamagePlannerForm.module.css';

export interface DamagePlannerFormProps {
  individual: PlayerIndividual;
  controller: DamagePlannerController;
}

export function DamagePlannerForm({individual, controller}: DamagePlannerFormProps) {
  const {state} = controller;
  const view = getDamagePlannerView(individual, state);
  const ids = useId();
  const levelId = `${ids}-level`;
  const moveOptions: SelectOption[] = view.candidateMoves.map((move) => ({key: move.id, label: importedLabel(move.id)}));
  if (state.candidateMoveId && !view.candidateMoves.some((move) => move.id === state.candidateMoveId)) {
    moveOptions.unshift({
      key: state.candidateMoveId,
      label: `${importedLabel(state.candidateMoveId)} · fora do subconjunto compatível`,
      isDisabled: true,
    });
  }
  const speciesOptions: SelectOption[] = DAMAGE_SPECIES_OPTIONS.map((species) => ({key: species.id, label: species.name}));
  const natureOptions: SelectOption[] = DAMAGE_NATURE_OPTIONS.map((nature) => ({key: nature.id, label: nature.name}));
  const abilityOptions: SelectOption[] = view.abilities.map((ability) => ({key: ability.id, label: ability.name}));
  const selectedSpeciesAvailable = DAMAGE_SPECIES_OPTIONS.some((species) => species.id === state.target.speciesId);
  const currentMove = individual.equippedMoves[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void controller.calculate();
  }

  return (
    <section className={`${styles.planner} real-damage-planner`} aria-labelledby={`${ids}-title`} aria-busy={state.phase === 'calculating'}>
      <h3 id={`${ids}-title`}>Calcular dano com este indivíduo</h3>
      <p className={`${styles.intro} real-damage-intro`}>
        O primeiro golpe equipado é comparado a um golpe aprendido deste UUID. O perfil do alvo é manual e não recebe valores presumidos.
      </p>
      {view.blocker ? (
        <StatusMessage tone="info" title="Cálculo indisponível" className={`${styles.blocker} real-damage-blocker`}>
          {view.blocker}.
        </StatusMessage>
      ) : (
        <>
          <form className={`${styles.form} real-damage-form`} onSubmit={submit} noValidate>
            <fieldset className={`${styles.inputs} real-damage-inputs`} disabled={state.phase === 'calculating'}>
              <legend className={`${styles.inputsLegend} real-damage-inputs-legend`}>Entradas do cálculo</legend>
              <div className={`${styles.moveField} real-damage-move-field`}>
                <Select
                  className={styles.formField}
                  label="Golpe aprendido para comparar"
                  options={moveOptions}
                  value={state.candidateMoveId || null}
                  onChange={(value) => controller.selectCandidate(value ?? '')}
                  placeholder="Escolha um golpe compatível"
                  isDisabled={state.phase === 'calculating'}
                />
                <p className={`${styles.fieldHelp} field-help`}>
                  Atual: {currentMove ? importedLabel(currentMove.id) : 'não capturado'} · somente o primeiro slot muda.
                </p>
              </div>

              <fieldset className={`${styles.targetProfile} real-target-profile`}>
                <legend>Perfil manual do alvo</legend>
                <div className={`${styles.targetFields} real-target-fields`}>
                  <Select
                    className={styles.formField}
                    label="Espécie"
                    options={speciesOptions}
                    value={selectedSpeciesAvailable ? state.target.speciesId : null}
                    onChange={(value) => controller.updateTarget({speciesId: value ?? ''})}
                    placeholder="Escolha uma espécie"
                    isDisabled={state.phase === 'calculating'}
                  />
                  <div className={`${styles.formField} field`}>
                    <label htmlFor={levelId}>Nível</label>
                    <input
                      id={levelId}
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={state.target.level}
                      onChange={(event) => controller.updateTarget({level: event.target.value})}
                      disabled={state.phase === 'calculating'}
                    />
                  </div>
                  <Select
                    className={styles.formField}
                    label="Natureza"
                    options={natureOptions}
                    value={state.target.nature || null}
                    onChange={(value) => controller.updateTarget({nature: value ?? ''})}
                    placeholder="Escolha uma natureza"
                    isDisabled={state.phase === 'calculating'}
                  />
                  <Select
                    className={styles.formField}
                    label="Habilidade"
                    options={abilityOptions}
                    value={abilityOptions.some((option) => option.key === state.target.ability) ? state.target.ability : null}
                    onChange={(value) => controller.updateTarget({ability: value ?? ''})}
                    placeholder={selectedSpeciesAvailable ? 'Escolha uma habilidade' : 'Escolha a espécie primeiro'}
                    isDisabled={!selectedSpeciesAvailable || state.phase === 'calculating'}
                    emptyMessage="Nenhuma habilidade mapeada para esta espécie."
                  />
                </div>

                {!selectedSpeciesAvailable && state.target.speciesId && (
                  <p className={styles.unknownSelection} role="status">
                    A espécie escolhida anteriormente não está no catálogo compatível. Selecione outra para continuar.
                  </p>
                )}

                <div className={`${styles.statGroups} real-stats-groups`}>
                  <fieldset className={`${styles.statGroup} real-stat-group`}>
                    <legend>IVs · 0–31</legend>
                    <div className={`${styles.statGrid} real-stat-grid`}>
                      {DAMAGE_STATS.map((stat) => {
                        const statId = `${ids}-iv-${stat}`;
                        return (
                          <div className={`${styles.formField} field`} key={`iv-${stat}`}>
                            <label htmlFor={statId}>{DAMAGE_STAT_LABELS[stat]}</label>
                            <input
                              id={statId}
                              type="number"
                              min="0"
                              max="31"
                              step="1"
                              value={state.target.ivs[stat]}
                              onChange={(event) => controller.updateStat('ivs', stat, event.target.value)}
                              disabled={state.phase === 'calculating'}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                  <fieldset className={`${styles.statGroup} real-stat-group`}>
                    <legend>EVs · 0–252, soma até 510</legend>
                    <div className={`${styles.statGrid} real-stat-grid`}>
                      {DAMAGE_STATS.map((stat) => {
                        const statId = `${ids}-ev-${stat}`;
                        return (
                          <div className={`${styles.formField} field`} key={`ev-${stat}`}>
                            <label htmlFor={statId}>{DAMAGE_STAT_LABELS[stat]}</label>
                            <input
                              id={statId}
                              type="number"
                              min="0"
                              max="252"
                              step="1"
                              value={state.target.evs[stat]}
                              onChange={(event) => controller.updateStat('evs', stat, event.target.value)}
                              disabled={state.phase === 'calculating'}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>

                <fieldset className={`${styles.confirmations} real-confirmations`} aria-label="Confirmações do cenário">
                  {DAMAGE_CONFIRMATION_KEYS.map((key) => (
                    <Checkbox
                      key={key}
                      isSelected={state.confirmations[key]}
                      isDisabled={state.phase === 'calculating'}
                      onChange={(checked) => controller.updateConfirmation(key, checked)}
                    >
                      {DAMAGE_CONFIRMATION_COPY[key]}
                    </Checkbox>
                  ))}
                </fieldset>
              </fieldset>
            </fieldset>

            {view.profileBlocker && (
              <p className={`${styles.blockerText} real-damage-blocker`} role="status">
                Para habilitar: {view.profileBlocker}.
              </p>
            )}
            {view.confirmationBlocker && !view.profileBlocker && (
              <p className={`${styles.blockerText} real-damage-blocker`} role="status">
                Confirme todas as condições do cenário para habilitar o cálculo.
              </p>
            )}
            {state.error && (
              <StatusMessage tone="error" title="O cálculo não foi concluído" className={`${styles.error} real-damage-error`}>
                {state.error} Atualize o save se os arquivos mudaram.
              </StatusMessage>
            )}
            <div className={`${styles.actions} real-damage-actions`}>
              <Button variant="primary" type="submit" isDisabled={!view.ready}>
                {state.phase === 'calculating' ? 'Calculando…' : 'Calcular rolls de dano'}
              </Button>
              <span>Gen 9 · singles · um acerto · min/máx entre 16 rolls</span>
            </div>
          </form>
          {state.result && (
            <section className={`${styles.result} real-damage-result`} aria-live="polite" aria-labelledby={`${ids}-result-title`}>
              <div className={`${styles.resultHeading} real-damage-result-heading`}>
                <h4 id={`${ids}-result-title`}>Dano se acertar</h4>
                <span>não estima chance de acerto ou nocaute</span>
              </div>
              <div className={`${styles.ranges} real-damage-ranges`}>
                <div>
                  <span>Atual · {importedLabel(state.result.current.moveId)}</span>
                  <strong>
                    {state.result.current.min}–{state.result.current.max}
                    <small> HP</small>
                  </strong>
                  <p>Alvo com {state.result.current.targetHP} HP máximos</p>
                </div>
                <div>
                  <span>Candidato · {importedLabel(state.result.candidate.moveId)}</span>
                  <strong>
                    {state.result.candidate.min}–{state.result.candidate.max}
                    <small> HP</small>
                  </strong>
                  <p>Alvo com {state.result.candidate.targetHP} HP máximos</p>
                </div>
              </div>
              <p className={`${styles.limits} real-damage-limits`}>
                Sem precisão, críticos, efeitos secundários, turnos futuros, ranking ou recomendação.
              </p>
              <details className={`${styles.trace} real-damage-trace`}>
                <summary>Versões e vínculo da captura</summary>
                <dl>
                  <div>
                    <dt>Catálogo</dt>
                    <dd>{state.result.ruleset.id}</dd>
                  </div>
                  <div>
                    <dt>Motor</dt>
                    <dd>
                      @smogon/calc {state.result.ruleset.calcVersion} · adaptador {state.result.ruleset.adapterVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>Snapshot</dt>
                    <dd>
                      {state.result.snapshot.capturedAt} · {state.result.snapshot.worldName}
                    </dd>
                  </div>
                  <div>
                    <dt>Entrada SHA-256</dt>
                    <dd>
                      <code>{state.result.inputDigest}</code>
                    </dd>
                  </div>
                </dl>
              </details>
            </section>
          )}
        </>
      )}
    </section>
  );
}
