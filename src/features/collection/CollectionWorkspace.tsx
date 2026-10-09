import {type CSSProperties, useId} from 'react';
import {ListBox, ListBoxItem} from 'react-aria-components';
import {locationLabel} from '../../domain/location-label';
import {formChipLabel, speciesDisplay} from '../../domain/dex';
import type {PlayerIndividual, PlayerSnapshot} from '../../platform/api';
import {Button, PokeBallMark, PokemonArtwork, SearchField, Select, TypeBadge, typeColorVar} from '../../ui';
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
type PcBox = {box: number; boxName: string | null; individuals: PlayerIndividual[]};

const BOX_COLUMNS = 6;
const MIN_BOX_ROWS = 5;
const BOX_CAPACITY = 30;

function locationSearchText(individual: PlayerIndividual) {
  const {location} = individual;
  const common = `${locationLabel(location)} posição`;
  if (location.container === 'party') return `${common} party equipe`;
  return `${common} pc box caixa ${location.box} ${location.boxName ?? ''}`;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function levelLabel(individual: PlayerIndividual) {
  return individual.level === null ? 'Nv. ?' : `Nv. ${individual.level}`;
}

function individualTextValue(individual: PlayerIndividual) {
  const level = individual.level === null ? 'nível não capturado' : `nível ${individual.level}`;
  return `${speciesDisplay(individual.speciesId, individual.formId).name} · ${locationLabel(individual.location)} · ${level}`;
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

function groupByBox(individuals: readonly PlayerIndividual[]): PcBox[] {
  const boxes = new Map<number, PcBox>();
  for (const individual of individuals) {
    if (individual.location.container !== 'pc') continue;
    const existing = boxes.get(individual.location.box);
    if (existing) {
      existing.individuals.push(individual);
      existing.boxName ??= individual.location.boxName;
    } else {
      boxes.set(individual.location.box, {box: individual.location.box, boxName: individual.location.boxName, individuals: [individual]});
    }
  }
  return [...boxes.values()].sort((first, second) => first.box - second.box);
}

function selectionHandler(onSelect: (uuid: string) => void) {
  return (keys: 'all' | Set<unknown>) => {
    if (keys === 'all') return;
    const selection = keys.values().next();
    if (!selection.done) onSelect(String(selection.value));
  };
}

function TeamCard({
  individual,
  slot,
  index,
  onSelect,
}: {
  individual: PlayerIndividual;
  slot?: number;
  index: number;
  onSelect(uuid: string): void;
}) {
  const display = speciesDisplay(individual.speciesId, individual.formId);
  const chipText = formChipLabel(individual.speciesId, individual.formId);
  const textValue = individualTextValue(individual);
  const style = {'--type-a': typeColorVar(display.types[0] ?? null), '--i': index, '--slot': slot} as CSSProperties;
  return (
    <ListBoxItem
      id={individual.uuid}
      textValue={textValue}
      aria-label={textValue}
      onAction={() => onSelect(individual.uuid)}
      data-slot={slot}
      data-individual-id={individual.uuid}
      className={styles.teamCard}
      style={style}
    >
      <span className={styles.socket}>
        <PokemonArtwork
          speciesId={individual.speciesId}
          formId={individual.formId}
          shiny={individual.shiny === true}
          variant="collection"
        />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>
          <span className={styles.speciesName}>{display.name}</span>
          <span className={styles.levelChip}>{levelLabel(individual)}</span>
        </span>
        <span className={styles.cardTypes}>
          {display.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
          {chipText && <span className={styles.formChip}>{chipText}</span>}
        </span>
      </span>
    </ListBoxItem>
  );
}

function EmptySlot({slot, index, positioned}: {slot: number; index: number; positioned: boolean}) {
  const style = {'--slot': positioned ? slot : undefined, '--i': index} as CSSProperties;
  return (
    <div className={styles.emptySlot} data-slot={slot} style={style}>
      <span className={styles.emptySocket}>
        <PokeBallMark className={styles.emptyMark} />
      </span>
      <span>Vazio</span>
    </div>
  );
}

function BoxSection({
  box,
  fixedSlots,
  total,
  selectedUuid,
  onSelect,
}: {
  box: PcBox;
  fixedSlots: boolean;
  total: number | null;
  selectedUuid: string | null;
  onSelect(uuid: string): void;
}) {
  const headingId = useId();
  const maxSlot = Math.max(...box.individuals.map((individual) => individual.location.slot));
  const rows = Math.max(MIN_BOX_ROWS, Math.ceil((maxSlot + 1) / BOX_COLUMNS));
  const occupied = new Set(box.individuals.map((individual) => individual.location.slot));
  const emptySlots = fixedSlots ? Array.from({length: rows * BOX_COLUMNS}, (_, slot) => slot).filter((slot) => !occupied.has(slot)) : [];
  const selectedKeys =
    selectedUuid !== null && box.individuals.some((individual) => individual.uuid === selectedUuid) ? [selectedUuid] : [];
  const title = box.boxName ? `Caixa ${box.box} · ${box.boxName}` : `Caixa ${box.box}`;

  return (
    <section className={styles.boxSection} aria-labelledby={headingId}>
      <header className={styles.boxHeader}>
        <h3 id={headingId}>{title}</h3>
        {total !== null && (
          <span className={styles.boxCount}>
            {total}/{BOX_CAPACITY}
          </span>
        )}
      </header>
      <div className={styles.boxGrid}>
        {emptySlots.map((slot) => (
          <span
            key={slot}
            className={styles.boxSocket}
            aria-hidden="true"
            style={{gridColumn: (slot % BOX_COLUMNS) + 1, gridRow: Math.floor(slot / BOX_COLUMNS) + 1}}
          />
        ))}
        <ListBox
          aria-label={`Caixa ${box.box}`}
          layout="grid"
          className={styles.boxItems}
          items={box.individuals}
          selectedKeys={selectedKeys}
          selectionMode="single"
          selectionBehavior="replace"
          onSelectionChange={selectionHandler(onSelect)}
        >
          {(individual) => {
            const display = speciesDisplay(individual.speciesId, individual.formId);
            const textValue = individualTextValue(individual);
            const slot = individual.location.slot;
            const style = fixedSlots
              ? ({
                  '--type-a': typeColorVar(display.types[0] ?? null),
                  gridColumn: (slot % BOX_COLUMNS) + 1,
                  gridRow: Math.floor(slot / BOX_COLUMNS) + 1,
                } as CSSProperties)
              : ({'--type-a': typeColorVar(display.types[0] ?? null)} as CSSProperties);
            return (
              <ListBoxItem
                id={individual.uuid}
                textValue={textValue}
                aria-label={textValue}
                onAction={() => onSelect(individual.uuid)}
                data-individual-id={individual.uuid}
                data-name={display.name}
                data-col={fixedSlots ? slot % BOX_COLUMNS : undefined}
                data-form={individual.formId === 'normal' ? undefined : 'alternate'}
                className={styles.boxItem}
                style={style}
              >
                <PokemonArtwork
                  speciesId={individual.speciesId}
                  formId={individual.formId}
                  shiny={individual.shiny === true}
                  variant="slot"
                />
                <span className={styles.levelBadge}>{individual.level ?? '?'}</span>
              </ListBoxItem>
            );
          }}
        </ListBox>
      </div>
    </section>
  );
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
    const candidates = [speciesDisplay(individual.speciesId, individual.formId).name, individual.speciesId, locationSearchText(individual)];
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
  const searchOrBoxFilterActive = normalizedSearch.length > 0 || (view === 'pc' && boxFilter !== null);
  const fixedTeamLayout = view === 'team' && !searchOrBoxFilterActive;
  const emptyPartySlots = fixedTeamLayout
    ? Array.from({length: 6}, (_, slot) => slot).filter(
        (slot) => !allInView.some((individual) => individual.location.container === 'party' && individual.location.slot === slot),
      )
    : [];
  const hasVisibleIndividuals = visibleIndividuals.length > 0;
  const noResults = snapshot !== null && searchOrBoxFilterActive && visibleIndividuals.length === 0;
  const emptyTeam = snapshot !== null && view === 'team' && allInView.length === 0 && !searchOrBoxFilterActive;
  const emptyPc = snapshot !== null && view === 'pc' && allInView.length === 0 && !searchOrBoxFilterActive;
  const boxTotals = new Map(groupByBox(allInView).map((box) => [box.box, box.individuals.length]));
  const pcBoxes = view === 'pc' ? groupByBox(visibleIndividuals) : [];
  const fixedPcLayout = !searchOrBoxFilterActive;

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
          placeholder="Nome, caixa ou slot"
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
          Nenhuma captura disponível.
        </p>
      ) : noResults ? (
        <p className={styles.emptyState} role="status">
          Nenhum Pokémon corresponde à busca.
        </p>
      ) : emptyPc ? (
        <p className={styles.emptyState} role="status">
          PC vazio nesta captura.
        </p>
      ) : emptyTeam ? (
        <fieldset className={styles.teamGrid} aria-label="Posições da equipe">
          {Array.from({length: 6}, (_, slot) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static empty team positions with fixed count of 6, never reorders
            <EmptySlot key={slot} slot={slot} index={slot} positioned />
          ))}
        </fieldset>
      ) : hasVisibleIndividuals && view === 'team' ? (
        <fieldset className={styles.teamGrid} aria-label="Posições da equipe">
          <ListBox
            aria-label="Pokémon da equipe"
            className={styles.teamOptions}
            items={visibleIndividuals}
            selectedKeys={selectedVisibleKeys}
            selectionMode="single"
            selectionBehavior="replace"
            onSelectionChange={selectionHandler(onSelect)}
          >
            {(individual) => {
              const slot = individual.location.container === 'party' ? individual.location.slot : -1;
              const positioned = fixedTeamLayout && uniquePartySlots.has(slot) && slot >= 0 && slot < 6;
              return (
                <TeamCard
                  key={individual.uuid}
                  individual={individual}
                  slot={positioned ? slot : undefined}
                  index={Math.max(slot, 0)}
                  onSelect={onSelect}
                />
              );
            }}
          </ListBox>
          {emptyPartySlots.map((slot) => (
            <EmptySlot key={slot} slot={slot} index={slot} positioned />
          ))}
        </fieldset>
      ) : hasVisibleIndividuals ? (
        <div className={styles.boxes}>
          {pcBoxes.map((box) => (
            <BoxSection
              key={box.box}
              box={box}
              fixedSlots={fixedPcLayout}
              total={fixedPcLayout ? (boxTotals.get(box.box) ?? box.individuals.length) : null}
              selectedUuid={selectedUuid}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
