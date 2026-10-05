import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {itemLabel} from '../../domain/catalog-labels';
import {dexId, moveDisplay, speciesDisplay} from '../../domain/dex';
import type {PlayerIndividual} from '../../platform/api';
import {
  Button,
  Checkbox,
  ComboBox,
  Disclosure,
  HpBar,
  ItemIcon,
  MovePicker,
  PokeBallMark,
  PokemonArtwork,
  Select,
  StatusMessage,
  TypeBadge,
  type ComboBoxOption,
  type SelectOption,
} from '../../ui';
import type {DamagePlannerController} from './controller';
import {
  DAMAGE_CONFIRMATION_KEYS,
  damageConfirmationCopy,
  DAMAGE_NATURE_OPTIONS,
  DAMAGE_SPECIES_OPTIONS,
  DAMAGE_STATS,
  DAMAGE_STAT_LABELS,
  damageMoveSupported,
  getDamagePlannerView,
  parseDamageInteger,
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
  const resultRef = useRef<HTMLDivElement>(null);
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [checklistOpen, setChecklistOpen] = useState(() => DAMAGE_CONFIRMATION_KEYS.some((key) => !state.confirmations[key]));
  const calculating = state.phase === 'calculating';
  const confirmedCount = DAMAGE_CONFIRMATION_KEYS.filter((key) => state.confirmations[key]).length;
  const speciesOptions: ComboBoxOption[] = DAMAGE_SPECIES_OPTIONS.map((species) => ({key: species.id, label: species.name}));
  const natureOptions: SelectOption[] = DAMAGE_NATURE_OPTIONS.map((nature) => ({key: nature.id, label: nature.name}));
  const abilityOptions: SelectOption[] = view.abilities.map((ability) => ({key: ability.id, label: ability.name}));
  const selectedSpeciesAvailable = DAMAGE_SPECIES_OPTIONS.some((species) => species.id === state.target.speciesId);
  const actor = speciesDisplay(individual.speciesId, individual.formId);
  const targetSpeciesId = selectedSpeciesAvailable ? `cobblemon:${state.target.speciesId.replace(/^[^:]+:/, '')}` : null;
  const target = targetSpeciesId ? speciesDisplay(targetSpeciesId, 'normal') : null;
  const result = state.result;
  const evTotal = DAMAGE_STATS.reduce((sum, stat) => sum + (parseDamageInteger(state.target.evs[stat], 0, 252) ?? 0), 0);

  useEffect(() => {
    setSpeciesQuery(DAMAGE_SPECIES_OPTIONS.find((species) => species.id === state.target.speciesId)?.name ?? '');
  }, [state.target.speciesId]);

  useEffect(() => {
    if (state.result !== null) resultRef.current?.scrollIntoView({block: 'nearest'});
  }, [state.result]);

  const slotItems = individual.equippedMoves.map((move, index) => {
    const display = moveDisplay(move.id);
    return {
      key: String(index),
      textValue: `Slot ${index + 1} · ${display.name}`,
      name: display.name,
      type: display.type,
      category: display.category,
      power: display.power,
      isDisabled: !damageMoveSupported(move.id),
      note: 'Fora do cálculo',
    };
  });
  const candidateItems = view.candidateMoves.map((move) => {
    const display = moveDisplay(move.id);
    return {
      key: move.id,
      textValue: display.name,
      name: display.name,
      type: display.type,
      category: display.category,
      power: display.power,
    };
  });
  if (state.candidateMoveId && !view.candidateMoves.some((move) => move.id === state.candidateMoveId)) {
    const display = moveDisplay(state.candidateMoveId);
    candidateItems.unshift({
      key: state.candidateMoveId,
      textValue: display.name,
      name: display.name,
      type: display.type,
      category: display.category,
      power: display.power,
      isDisabled: true,
      note: 'Fora do subconjunto compatível',
    } as (typeof candidateItems)[number]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void controller.calculate();
  }

  const matchup = (
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
            {individual.observed.heldItem !== null && <ItemIcon itemDexId={dexId(individual.observed.heldItem)} />}
            <span>
              {individual.observed.heldItem === null
                ? 'Item não registrado no save'
                : `Item: ${itemLabel(individual.observed.heldItem)} · entra no cálculo`}
            </span>
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
  );

  function setAllStats(group: 'ivs' | 'evs', value: string) {
    for (const stat of DAMAGE_STATS) controller.updateStat(group, stat, value);
  }

  function statGroup(group: 'ivs' | 'evs') {
    const isIv = group === 'ivs';
    return (
      <fieldset className={`${styles.statGroup} real-stat-group`}>
        <legend>{isIv ? 'IVs · 0–31' : 'EVs · 0–252, soma até 510'}</legend>
        <div className={styles.presets}>
          {isIv ? (
            <>
              <Button variant="quiet" className={styles.presetButton} onPress={() => setAllStats('ivs', '31')}>
                31 em todos
              </Button>
              <Button variant="quiet" className={styles.presetButton} onPress={() => setAllStats('ivs', '0')}>
                0 em todos
              </Button>
            </>
          ) : (
            <>
              <Button variant="quiet" className={styles.presetButton} onPress={() => setAllStats('evs', '0')}>
                Zerar
              </Button>
              <span className={styles.evTotal} data-over={evTotal > 510 ? 'true' : undefined}>
                Soma {evTotal}/510
              </span>
            </>
          )}
        </div>
        <div className={`${styles.statGrid} real-stat-grid`}>
          {DAMAGE_STATS.map((stat) => {
            const statId = `${ids}-${isIv ? 'iv' : 'ev'}-${stat}`;
            return (
              <div className={`${styles.formField} field`} key={`${group}-${stat}`}>
                <label htmlFor={statId}>{DAMAGE_STAT_LABELS[stat]}</label>
                <input
                  id={statId}
                  type="number"
                  min="0"
                  max={isIv ? '31' : '252'}
                  step="1"
                  value={state.target[group][stat]}
                  onChange={(event) => controller.updateStat(group, stat, event.target.value)}
                  disabled={calculating}
                />
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }

  function differenceLine(current: {min: number; max: number}, candidate: {min: number; max: number; moveId: string}) {
    const deltaMin = candidate.min - current.min;
    const deltaMax = candidate.max - current.max;
    const name = moveDisplay(candidate.moveId).name;
    const low = Math.min(Math.abs(deltaMin), Math.abs(deltaMax));
    const high = Math.max(Math.abs(deltaMin), Math.abs(deltaMax));
    if (deltaMin === 0 && deltaMax === 0) return {tone: 'neutral', text: 'Mesmo dano nos dois golpes.'};
    if (deltaMin >= 0 && deltaMax >= 0) return {tone: 'gain', text: `${name} causa ${low}–${high} HP a mais.`};
    if (deltaMin <= 0 && deltaMax <= 0) return {tone: 'loss', text: `${name} causa ${low}–${high} HP a menos.`};
    return {tone: 'mixed', text: `Diferença do candidato: ${signed(deltaMin)} a ${signed(deltaMax)} HP.`};
  }

  const header = (
    <>
      <h3 id={`${ids}-title`} className={styles.visuallyHidden}>
        Calcular dano com este indivíduo
      </h3>
      <p className={`${styles.intro} real-damage-intro`}>
        Compare o golpe de um slot com um golpe aprendido contra um alvo que você define.
      </p>
    </>
  );

  if (view.blocker) {
    return (
      <section className={`${styles.planner} real-damage-planner`} aria-labelledby={`${ids}-title`} aria-busy={calculating}>
        {header}
        {matchup}
        <StatusMessage tone="info" title="Cálculo indisponível" className={`${styles.blocker} real-damage-blocker`}>
          {view.blocker}.
        </StatusMessage>
      </section>
    );
  }

  const diff = result ? differenceLine(result.current, result.candidate) : null;

  return (
    <section className={`${styles.planner} real-damage-planner`} aria-labelledby={`${ids}-title`} aria-busy={calculating}>
      {header}
      <form className={`${styles.layout} real-damage-form`} onSubmit={submit} noValidate>
        <div className={styles.inputsColumn}>
          <fieldset className={`${styles.inputs} real-damage-inputs`} disabled={calculating}>
            <legend className={`${styles.visuallyHidden} real-damage-inputs-legend`}>Entradas do cálculo</legend>

            <section className={styles.moves} aria-labelledby={`${ids}-moves-title`}>
              <h4 id={`${ids}-moves-title`} className={styles.sectionTitle}>
                Golpes comparados
              </h4>
              <MovePicker
                variant="tile"
                label="Slot comparado"
                items={slotItems}
                selectedKey={String(state.currentSlotIndex)}
                onSelectionChange={(key) => controller.selectSlot(Number(key))}
                isDisabled={calculating}
              />
              {candidateItems.length === 0 ? (
                <p className={styles.blockerText} role="status">
                  Nenhum golpe aprendido compatível com o cálculo.
                </p>
              ) : (
                <MovePicker
                  variant="chip"
                  label="Golpe aprendido para comparar"
                  items={candidateItems}
                  selectedKey={state.candidateMoveId || null}
                  onSelectionChange={(key) => controller.selectCandidate(key)}
                  isDisabled={calculating}
                />
              )}
            </section>

            <fieldset className={`${styles.targetProfile} real-target-profile`}>
              <legend>Alvo</legend>
              <div className={`${styles.targetFields} real-target-fields`}>
                <ComboBox
                  className={styles.formField}
                  label="Espécie"
                  options={speciesOptions}
                  selectedKey={selectedSpeciesAvailable ? state.target.speciesId : null}
                  onSelectionChange={(key) => controller.updateTarget({speciesId: key ?? ''})}
                  inputValue={speciesQuery}
                  onInputChange={setSpeciesQuery}
                  placeholder="Buscar espécie"
                  emptyMessage="Nenhuma espécie encontrada."
                  isDisabled={calculating}
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
                    disabled={calculating}
                  />
                </div>
                <Select
                  className={styles.formField}
                  label="Natureza"
                  options={natureOptions}
                  value={state.target.nature || null}
                  onChange={(value) => controller.updateTarget({nature: value ?? ''})}
                  placeholder="Escolha uma natureza"
                  isDisabled={calculating}
                />
                <Select
                  className={styles.formField}
                  label="Habilidade"
                  options={abilityOptions}
                  value={abilityOptions.some((option) => option.key === state.target.ability) ? state.target.ability : null}
                  onChange={(value) => controller.updateTarget({ability: value ?? ''})}
                  placeholder={selectedSpeciesAvailable ? 'Escolha uma habilidade' : 'Escolha a espécie primeiro'}
                  isDisabled={!selectedSpeciesAvailable || calculating}
                  emptyMessage="Nenhuma habilidade mapeada para esta espécie."
                />
              </div>

              {!selectedSpeciesAvailable && state.target.speciesId && (
                <p className={styles.unknownSelection} role="status">
                  A espécie escolhida anteriormente não está no catálogo compatível. Selecione outra para continuar.
                </p>
              )}
            </fieldset>

            <div className={`${styles.statGroups} real-stats-groups`}>
              {statGroup('ivs')}
              {statGroup('evs')}
            </div>
          </fieldset>
        </div>

        <aside className={styles.battle} aria-label="Painel de batalha">
          {matchup}

          <div ref={resultRef} className={styles.resultRegion}>
            {result && diff ? (
              <section className={`${styles.result} real-damage-result`} aria-live="polite" aria-labelledby={`${ids}-result-title`}>
                <div className={styles.resultHeader}>
                  <h4 id={`${ids}-result-title`}>Dano se acertar</h4>
                  <span className={styles.resultTarget}>
                    Alvo: {target?.name ?? '—'} Nv. {state.target.level} · {result.current.targetHP} HP
                  </span>
                </div>
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
                <span className={styles.diff} data-tone={diff.tone}>
                  {diff.text}
                </span>
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
            ) : calculating ? (
              <div className={styles.skeleton} aria-busy="true">
                <span className={styles.skeletonBar} />
                <span className={styles.skeletonBar} />
              </div>
            ) : (
              <div className={styles.placeholder}>
                <PokeBallMark className={styles.placeholderMark} />
                <p>Defina o alvo, confirme o checklist e calcule.</p>
              </div>
            )}
          </div>

          <Disclosure
            headingLevel={4}
            title={`Checklist do cenário · ${confirmedCount}/${DAMAGE_CONFIRMATION_KEYS.length}`}
            isExpanded={checklistOpen}
            onExpandedChange={setChecklistOpen}
          >
            <fieldset className={`${styles.confirmations} real-confirmations`} aria-label="Checklist do cenário">
              {DAMAGE_CONFIRMATION_KEYS.map((key) => (
                <Checkbox
                  key={key}
                  description={damageConfirmationCopy(key, individual.observed.heldItem).detail}
                  isSelected={state.confirmations[key]}
                  isDisabled={calculating}
                  onChange={(checked) => controller.updateConfirmation(key, checked)}
                >
                  {damageConfirmationCopy(key, individual.observed.heldItem).label}
                </Checkbox>
              ))}
            </fieldset>
          </Disclosure>

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
              {calculating ? 'Calculando…' : 'Calcular rolls de dano'}
            </Button>
            <span>Gen 9 · singles · 16 rolls</span>
          </div>
        </aside>
      </form>
    </section>
  );
}
