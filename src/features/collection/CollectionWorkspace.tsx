import {useId} from 'react';
import {ListBox, ListBoxItem} from 'react-aria-components';
import type {PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {Button, PokemonArtwork, SearchField, Select} from '../../ui';
import type {SelectOption} from '../../ui';
import styles from './CollectionWorkspace.module.css';

export type CollectionView = 'team' | 'pc';

export interface CollectionWorkspaceProps {
  snapshot: PlayerSnapshot | null;
  view: CollectionView;
  search: string;
  onSearchChange(value: string): void;
  boxFilter: string | null;
  onBoxFilterChange(value: string | null): void;
  selectedUuid: string | null;
  onSelect(uuid: string): void;
  onClearFilters(): void;
}

type BoxOption = SelectOption;

function speciesLabel(id: string) {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function locationLabel(individual: PlayerIndividual) {
  const {location} = individual;
  if (location.container === 'party') return `Equipe · posição ${location.slot}`;
  const boxName = location.boxName ? ` · ${location.boxName}` : '';
  return `PC · caixa ${location.box}${boxName} · posição ${location.slot}`;
}

function locationSearchText(individual: PlayerIndividual) {
  const {location} = individual;
  if (location.container === 'party') {
    return `${locationLabel(individual)} party equipe slot ${location.slot} posição ${location.slot}`;
  }
  return `${locationLabel(individual)} pc box caixa ${location.box} ${location.boxName ?? ''} slot ${location.slot} posição ${location.slot}`;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function individualTextValue(individual: PlayerIndividual) {
  const level = individual.level === null ? 'nível não capturado' : `nível ${individual.level}`;
  return `${speciesLabel(individual.speciesId)} · ${locationLabel(individual)} · ${level}`;
}

function getBoxOptions(individuals: readonly PlayerIndividual[]): BoxOption[] {
  const boxes = new Map<number, string | null>();
  for (const individual of individuals) {
    if (individual.location.container !== 'pc') continue;
    const currentName = boxes.get(individual.location.box);
    if (!boxes.has(individual.location.box) || currentName === null) {
      boxes.set(individual.location.box, individual.location.boxName);
    }
  }

  return [...boxes.entries()]
    .sort(([first], [second]) => first - second)
    .map(([box, boxName]) => ({
      key: String(box),
      label: boxName ? `Caixa ${box} · ${boxName}` : `Caixa ${box}`,
    }));
}

function sortedIndividuals(individuals: readonly PlayerIndividual[], view: CollectionView) {
  return individuals
    .filter((individual) => (view === 'team' ? individual.location.container === 'party' : individual.location.container === 'pc'))
    .sort((first, second) => {
      if (view === 'team') {
        return first.location.container === 'party' && second.location.container === 'party'
          ? first.location.slot - second.location.slot
          : 0;
      }
      if (first.location.container !== 'pc' || second.location.container !== 'pc') return 0;
      return first.location.box - second.location.box || first.location.slot - second.location.slot;
    });
}

function getUniquePartySlots(individuals: readonly PlayerIndividual[]) {
  const counts = new Map<number, number>();
  for (const individual of individuals) {
    if (individual.location.container !== 'party') continue;
    counts.set(individual.location.slot, (counts.get(individual.location.slot) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count === 1).map(([slot]) => slot));
}

export function CollectionWorkspace({
  snapshot,
  view,
  search,
  onSearchChange,
  boxFilter,
  onBoxFilterChange,
  selectedUuid,
  onSelect,
  onClearFilters,
}: CollectionWorkspaceProps) {
  const headingId = useId();
  const individuals = snapshot?.individuals ?? [];
  const allInView = sortedIndividuals(individuals, view);
  const boxOptions = view === 'pc' ? getBoxOptions(individuals) : [];
  const normalizedSearch = normalizeSearch(search.trim());
  const visibleIndividuals = allInView.filter((individual) => {
    if (view === 'pc' && boxFilter !== null && individual.location.container === 'pc' && String(individual.location.box) !== boxFilter)
      return false;
    if (!normalizedSearch) return true;
    const candidates = [speciesLabel(individual.speciesId), individual.speciesId, locationSearchText(individual)];
    return candidates.some((candidate) => normalizeSearch(candidate).includes(normalizedSearch));
  });
  const selectedIndividualIsHidden =
    selectedUuid !== null &&
    (snapshot?.individuals.some((individual) => individual.uuid === selectedUuid) ?? false) &&
    !visibleIndividuals.some((individual) => individual.uuid === selectedUuid);
  const selectedVisibleKeys =
    selectedUuid !== null && visibleIndividuals.some((individual) => individual.uuid === selectedUuid) ? [selectedUuid] : [];
  const heading = view === 'team' ? 'Equipe' : 'PC';
  const countLabel = view === 'team' ? 'na equipe' : 'no PC';
  const uniquePartySlots = view === 'team' ? getUniquePartySlots(allInView) : new Set<number>();
  const emptyPartySlots =
    view === 'team'
      ? Array.from({length: 6}, (_, slot) => slot).filter(
          (slot) => !allInView.some((individual) => individual.location.container === 'party' && individual.location.slot === slot),
        )
      : [];
  const searchOrBoxFilterActive = normalizedSearch.length > 0 || (view === 'pc' && boxFilter !== null);
  const hasVisibleIndividuals = visibleIndividuals.length > 0;
  const noResults = snapshot !== null && searchOrBoxFilterActive && visibleIndividuals.length === 0;
  const emptyTeam = snapshot !== null && view === 'team' && allInView.length === 0 && !searchOrBoxFilterActive;
  const emptyPc = snapshot !== null && view === 'pc' && allInView.length === 0 && !searchOrBoxFilterActive;

  return (
    <section className={styles.root} data-testid="collection" aria-labelledby={headingId}>
      <header className={styles.header}>
        <h2 className={styles.heading} id={headingId} tabIndex={-1}>
          {heading}
        </h2>
        {snapshot && (
          <p className={styles.count} aria-live="polite">
            {allInView.length} Pokémon {countLabel}
          </p>
        )}
      </header>

      <div className={`${styles.controls}${view === 'pc' && boxOptions.length > 0 ? ` ${styles.controlsFiltered}` : ''}`}>
        <SearchField
          label="Buscar Pokémon"
          value={search}
          onChange={onSearchChange}
          placeholder="Espécie, ID ou localização"
          isDisabled={!snapshot}
          className={styles.search}
        />
        {view === 'pc' && boxOptions.length > 0 && (
          <Select
            label="Filtrar por caixa"
            options={boxOptions}
            value={boxFilter}
            onChange={onBoxFilterChange}
            placeholder="Todas as caixas"
            isDisabled={!snapshot}
            className={styles.boxFilter}
          />
        )}
      </div>

      {selectedIndividualIsHidden && (
        <div className={styles.hiddenSelection} role="status">
          <span>Selecionado fora do filtro</span>
          <Button variant="quiet" onPress={onClearFilters}>
            Limpar filtros
          </Button>
        </div>
      )}

      {!snapshot ? (
        <p className={styles.emptyState} role="status">
          Nenhuma captura disponível. Importe uma captura para consultar a coleção.
        </p>
      ) : noResults ? (
        <p className={styles.emptyState} role="status">
          Nenhum Pokémon corresponde à busca
        </p>
      ) : emptyPc ? (
        <p className={styles.emptyState} role="status">
          Nenhum Pokémon capturado no PC nesta captura.
        </p>
      ) : emptyTeam ? (
        <div className={styles.teamGrid} role="group" aria-label="Posições da equipe">
          {Array.from({length: 6}, (_, slot) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static empty team positions with fixed count of 6, never reorders
            <div className={styles.emptyPosition} data-slot={slot} key={slot}>
              <span className={styles.emptyPositionTitle}>Posição vazia</span>
              <span className={styles.emptyPositionIndex}>Posição {slot + 1}</span>
            </div>
          ))}
        </div>
      ) : hasVisibleIndividuals && view === 'team' ? (
        <div className={styles.teamGrid} role="group" aria-label="Posições da equipe">
          <ListBox
            aria-label="Pokémon da equipe"
            className={styles.teamOptions}
            items={visibleIndividuals}
            selectedKeys={selectedVisibleKeys}
            selectionMode="single"
            selectionBehavior="replace"
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const selection = keys.values().next();
              if (!selection.done) onSelect(String(selection.value));
            }}
          >
            {(individual) => {
              const hasUniqueSlot = uniquePartySlots.has(individual.location.container === 'party' ? individual.location.slot : -1);
              const slot = individual.location.container === 'party' ? individual.location.slot : undefined;
              const dataSlot = hasUniqueSlot && slot !== undefined && slot >= 0 && slot < 6 ? slot : undefined;
              const textValue = individualTextValue(individual);
              return (
                <ListBoxItem
                  id={individual.uuid}
                  key={individual.uuid}
                  textValue={textValue}
                  aria-label={textValue}
                  onAction={() => onSelect(individual.uuid)}
                  data-slot={dataSlot}
                  data-individual-id={individual.uuid}
                  className={`${styles.unit} ${styles.teamUnit}`}
                >
                  <PokemonArtwork
                    speciesId={individual.speciesId}
                    formId={individual.formId}
                    variant="collection"
                    className={styles.artwork}
                  />
                  <span className={styles.unitContent}>
                    <span className={styles.speciesName}>{speciesLabel(individual.speciesId)}</span>
                    <span className={styles.location}>{locationLabel(individual)}</span>
                    <span className={styles.level}>{individual.level === null ? 'Nível não capturado' : `Nível ${individual.level}`}</span>
                  </span>
                </ListBoxItem>
              );
            }}
          </ListBox>
          {emptyPartySlots.map((slot) => (
            <div className={styles.emptyPosition} data-slot={slot} key={slot}>
              <span className={styles.emptyPositionTitle}>Posição vazia</span>
              <span className={styles.emptyPositionIndex}>Posição {slot + 1}</span>
            </div>
          ))}
        </div>
      ) : hasVisibleIndividuals ? (
        <ListBox
          aria-label="Pokémon no PC"
          className={styles.pcList}
          items={visibleIndividuals}
          selectedKeys={selectedVisibleKeys}
          selectionMode="single"
          selectionBehavior="replace"
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const selection = keys.values().next();
            if (!selection.done) onSelect(String(selection.value));
          }}
        >
          {(individual) => {
            const textValue = individualTextValue(individual);
            return (
              <ListBoxItem
                id={individual.uuid}
                key={individual.uuid}
                textValue={textValue}
                aria-label={textValue}
                onAction={() => onSelect(individual.uuid)}
                data-individual-id={individual.uuid}
                className={`${styles.unit} ${styles.pcUnit}`}
              >
                <PokemonArtwork
                  speciesId={individual.speciesId}
                  formId={individual.formId}
                  variant="collection"
                  className={styles.artwork}
                />
                <span className={styles.unitContent}>
                  <span className={styles.speciesName}>{speciesLabel(individual.speciesId)}</span>
                  <span className={styles.location}>{locationLabel(individual)}</span>
                  <span className={styles.level}>{individual.level === null ? 'Nível não capturado' : `Nível ${individual.level}`}</span>
                </span>
              </ListBoxItem>
            );
          }}
        </ListBox>
      ) : null}
    </section>
  );
}
