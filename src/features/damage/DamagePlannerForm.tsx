import {useId, type FormEvent} from 'react';
import {itemLabel, moveLabel} from '../../domain/catalog-labels';
import {moveDisplay, speciesDisplay} from '../../domain/dex';
import type {PlayerIndividual} from '../../platform/api';
import {Button, Checkbox, HpBar, PokeBallMark, PokemonArtwork, Select, StatusMessage, TypeBadge, type SelectOption} from '../../ui';
import type {DamagePlannerController} from './controller';
import {
  DAMAGE_CONFIRMATION_COPY,
  DAMAGE_CONFIRMATION_KEYS,
  DAMAGE_NATURE_OPTIONS,
  DAMAGE_SPECIES_OPTIONS,
  DAMAGE_STATS,
  DAMAGE_STAT_LABELS,
  damageMoveSupported,
  getDamagePlannerView,
} from './model';
import styles from './DamagePlannerForm.module.css';

export interface DamagePlannerFormProps {
  individual: PlayerIndividual;
  controller: DamagePlannerController;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}

function MoveLine({caption, moveId}: {caption: string; moveId: string}) {
  const display = moveDisplay(moveId);
  return (
    <span className={styles.moveLine}>
      <span>{caption}</span>
      <span className={styles.moveName}>{display.name}</span>
      {display.type && <TypeBadge type={display.type} size="sm" />}
    </span>
  );
}

export function DamagePlannerForm({individual, controller}: DamagePlannerFormProps) {
  const {state} = controller;
  const view = getDamagePlannerView(individual, state);
  const ids = useId();
  const levelId = `${ids}-level`;
  const moveOptions: SelectOption[] = view.candidateMoves.map((move) => ({key: move.id, label: moveLabel(move.id)}));
  const slotOptions: SelectOption[] = individual.equippedMoves.map((move, index) => ({
    key: String(index),
    label: `Slot ${index + 1} · ${moveLabel(move.id)}`,
    isDisabled: !damageMoveSupported(move.id),
  }));
  if (state.candidateMoveId && !view.candidateMoves.some((move) => move.id === state.candidateMoveId)) {
    moveOptions.unshift({
      key: state.candidateMoveId,
      label: `${moveLabel(state.candidateMoveId)} · fora do subconjunto compatível`,
      isDisabled: true,
    });
  }
  const speciesOptions: SelectOption[] = DAMAGE_SPECIES_OPTIONS.map((species) => ({key: species.id, label: species.name}));
  const natureOptions: SelectOption[] = DAMAGE_NATURE_OPTIONS.map((nature) => ({key: nature.id, label: nature.name}));
  const abilityOptions: SelectOption[] = view.abilities.map((ability) => ({key: ability.id, label: ability.name}));
  const selectedSpeciesAvailable = DAMAGE_SPECIES_OPTIONS.some((species) => species.id === state.target.speciesId);
  const actor = speciesDisplay(individual.speciesId, individual.formId);
  const targetSpeciesId = selectedSpeciesAvailable ? `cobblemon:${state.target.speciesId.replace(/^[^:]+:/, '')}` : null;
  const target = targetSpeciesId ? speciesDisplay(targetSpeciesId, 'normal') : null;
  const result = state.result;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void controller.calculate();
  }

  return (
    <section className={`${styles.planner} real-damage-planner`} aria-labelledby={`${ids}-title`} aria-busy={state.phase === 'calculating'}>
      <h3 id={`${ids}-title`} className={styles.visuallyHidden}>
        Calcular dano com este indivíduo
      </h3>
      <p className={`${styles.intro} real-damage-intro`}>
        Compare o golpe de um slot com um golpe aprendido contra um alvo que você define.
      </p>

      <div className={styles.matchup}>
        <div className={styles.combatant}>
          <PokemonArtwork speciesId={individual.speciesId} formId={individual.formId} variant="collection" />
          <div className={styles.combatantInfo}>
            <span className={styles.combatantName}>{actor.name}</span>
            <span className={styles.combatantTypes}>
              {actor.types.map((type) => (
                <TypeBadge key={type} type={type} size="sm" />
              ))}
              <span className={styles.levelText}>{individual.level === null ? 'Nv. ?' : `Nv. ${individual.level}`}</span>
            </span>
            <span className={styles.itemText}>
              {individual.observed.heldItem === null
                ? 'Item: nenhum'
                : `Item: ${itemLabel(individual.observed.heldItem)} · entra no cálculo`}
            </span>
          </div>
        </div>
        <PokeBallMark className={styles.versus} />
        <div className={styles.combatant}>
          {targetSpeciesId && target ? (
            <>
              <PokemonArtwork speciesId={targetSpeciesId} formId="normal" variant="collection" />
              <div className={styles.combatantInfo}>
                <span className={styles.combatantName}>{target.name}</span>
                <span className={styles.combatantTypes}>
                  {target.types.map((type) => (
                    <TypeBadge key={type} type={type} size="sm" />
                  ))}
                </span>
              </div>
            </>
          ) : (
            <div className={styles.combatantInfo}>
              <span className={styles.combatantName}>Escolha o alvo</span>
            </div>
          )}
        </div>
      </div>

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
                  label="Slot comparado"
                  options={slotOptions}
                  value={String(state.currentSlotIndex)}
                  onChange={(value) => controller.selectSlot(Number(value ?? 0))}
                  isDisabled={state.phase === 'calculating'}
                />
                <Select
                  className={styles.formField}
                  label="Golpe aprendido para comparar"
                  options={moveOptions}
                  value={state.candidateMoveId || null}
                  onChange={(value) => controller.selectCandidate(value ?? '')}
                  placeholder="Escolha um golpe compatível"
                  isDisabled={state.phase === 'calculating'}
                />
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
              </fieldset>
            </fieldset>

            <div className={styles.side}>
              <fieldset className={`${styles.confirmations} real-confirmations`} aria-label="Checklist do cenário">
                <legend className={styles.checklistTitle}>Checklist do cenário</legend>
                {DAMAGE_CONFIRMATION_KEYS.map((key) => (
                  <Checkbox
                    key={key}
                    description={DAMAGE_CONFIRMATION_COPY[key].detail}
                    isSelected={state.confirmations[key]}
                    isDisabled={state.phase === 'calculating'}
                    onChange={(checked) => controller.updateConfirmation(key, checked)}
                  >
                    {DAMAGE_CONFIRMATION_COPY[key].label}
                  </Checkbox>
                ))}
              </fieldset>

              {view.profileBlocker && (
                <p className={`${styles.blockerText} real-damage-blocker`} role="status">
                  Para habilitar: {view.profileBlocker}.
                </p>
              )}
              {view.confirmationBlocker && !view.profileBlocker && (
                <p className={`${styles.blockerText} real-damage-blocker`} role="status">
                  Marque todo o checklist para habilitar o cálculo.
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
                <span>Gen 9 · singles · 16 rolls</span>
              </div>
            </div>
          </form>

          {result && (
            <section className={`${styles.result} real-damage-result`} aria-live="polite" aria-labelledby={`${ids}-result-title`}>
              <h4 id={`${ids}-result-title`}>Dano se acertar</h4>
              <div className={`${styles.ranges} real-damage-ranges`}>
                {[
                  {caption: `Slot ${result.actor.currentSlotIndex + 1}`, row: result.current},
                  {caption: 'Candidato', row: result.candidate},
                ].map(({caption, row}) => (
                  <div className={styles.rangeRow} key={caption}>
                    <MoveLine caption={caption} moveId={row.moveId} />
                    <strong>
                      {row.min}–{row.max}
                      <small> HP</small>
                    </strong>
                    <HpBar
                      total={row.targetHP}
                      minDamage={row.min}
                      maxDamage={row.max}
                      label={`Alvo: ${Math.max(0, row.targetHP - row.min)} HP restantes de ${row.targetHP} no roll mínimo`}
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const deltaMin = result.candidate.min - result.current.min;
                const deltaMax = result.candidate.max - result.current.max;
                const tone = deltaMin >= 0 && deltaMax >= 0 ? 'gain' : deltaMin <= 0 && deltaMax <= 0 ? 'loss' : 'mixed';
                return (
                  <span className={styles.diff} data-tone={tone}>
                    Candidato: {signed(deltaMin)} a {signed(deltaMax)} HP
                  </span>
                );
              })()}
              <p className={`${styles.limits} real-damage-limits`}>
                Sem precisão, crítico, efeitos secundários, nocaute, turnos futuros, ranking ou recomendação.
              </p>
              <details className={`${styles.trace} real-damage-trace`}>
                <summary>Versões e vínculo da captura</summary>
                <dl>
                  <div>
                    <dt>Catálogo</dt>
                    <dd>{result.ruleset.id}</dd>
                  </div>
                  <div>
                    <dt>Motor</dt>
                    <dd>
                      @smogon/calc {result.ruleset.calcVersion} · adaptador {result.ruleset.adapterVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>Snapshot</dt>
                    <dd>
                      {result.snapshot.capturedAt} · {result.snapshot.worldName}
                    </dd>
                  </div>
                  <div>
                    <dt>Entrada SHA-256</dt>
                    <dd>
                      <code>{result.inputDigest}</code>
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
