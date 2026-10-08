import {useMemo, useState} from 'react';
import {Header, ListBox, ListBoxItem, ListBoxSection, type Key, type Selection} from 'react-aria-components';
import type {GuideProgress, GuideTrainer} from '../../platform/api';
import {SearchField, Select, Switch} from '../../ui';
import {
  buildCampaignView,
  findStageByVariant,
  formatStageCap,
  goalTrainerId,
  normalizeSearch,
  progressOriginLabel,
  seriesLabel,
  stageLevelSummary,
  stageStateLabel,
  stageTypeLabel,
  variantLabel,
  visibleSeriesIds,
  type Campaign,
  type StageEntry,
} from './campaign-model';
import styles from './CampaignPicker.module.css';

const UPCOMING_COUNT = 3;

export interface CampaignPickerProps {
  campaign: Campaign;
  /** `null`: progresso não lido; nenhuma etapa vira "vencida" nem "liberada" por palpite. */
  progress: GuideProgress | null;
  /** Id RCT da variante que é o objetivo atual do guia. */
  selectedTrainerId: string | null;
  onSelect(trainerId: string): void;
  /** Lista completa de treinadores disponíveis para busca livre fora da campanha. */
  allTrainers?: GuideTrainer[];
}

function EntryRow({entry, selected}: {entry: StageEntry; selected: boolean}) {
  const capText = formatStageCap(entry.stage.capBefore, entry.stage.capAfter);
  return (
    <ListBoxItem
      id={entry.stage.stageId}
      textValue={entry.stage.name}
      aria-label={entry.stage.name}
      isDisabled={entry.disabledReason !== null}
      className={styles.entry}
      data-state={entry.state}
      data-next={entry.state === 'próximo' ? 'true' : undefined}
      data-selected-stage={selected ? 'true' : undefined}
    >
      <span className={styles.stateBadge} data-state={entry.state}>
        {stageStateLabel(entry.state)}
      </span>
      <div className={styles.entryMain}>
        <span className={styles.entryName}>{entry.stage.name}</span>
        <div className={styles.entryMeta}>
          <span>{stageTypeLabel(entry.stage.type)}</span>
          <span>·</span>
          <span>{stageLevelSummary(entry)}</span>
          {capText && (
            <>
              <span>·</span>
              <span className={styles.entryCap}>{capText}</span>
            </>
          )}
        </div>
      </div>
      <span className={styles.victoryBadge} data-victories={entry.victoryCount > 0 ? 'true' : undefined}>
        {entry.victoryCount > 0 ? `${entry.victoryCount} vitórias` : '0 vitórias'}
      </span>
    </ListBoxItem>
  );
}

export function CampaignPicker({campaign, progress, selectedTrainerId, onSelect, allTrainers = []}: CampaignPickerProps) {
  const [query, setQuery] = useState('');
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [seriesChoice, setSeriesChoice] = useState<string | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  const defeated = progress?.defeated ?? null;
  const victoryCounts = progress?.victoryCounts ?? null;
  const currentSeries = progress?.currentSeries ?? null;
  const selectedStage = useMemo(() => findStageByVariant(campaign, selectedTrainerId), [campaign, selectedTrainerId]);
  const seriesIds = useMemo(() => visibleSeriesIds(campaign, currentSeries, onlyCurrent), [campaign, currentSeries, onlyCurrent]);
  const fallbackSeries = seriesIds.includes('radicalred') ? 'radicalred' : seriesIds[0];
  const wanted = seriesChoice ?? selectedStage?.seriesId ?? currentSeries ?? fallbackSeries;
  const seriesId = seriesIds.includes(wanted) ? wanted : fallbackSeries;
  const series = campaign[seriesId];

  const view = useMemo(
    () =>
      buildCampaignView(series, {
        seriesId,
        defeated,
        victoryCounts,
        query,
        onlyCurrent,
        upcomingCount: UPCOMING_COUNT,
      }),
    [series, seriesId, defeated, victoryCounts, query, onlyCurrent],
  );

  const entries = useMemo(
    () => new Map(view.groups.flatMap((group) => group.entries).map((entry) => [entry.stage.stageId, entry])),
    [view],
  );

  const allStagesMap = useMemo(() => {
    const records: Record<string, string> = {};
    for (const s of Object.values(campaign)) {
      for (const st of s.stages) {
        records[st.stageId] = st.name;
      }
    }
    return records;
  }, [campaign]);

  // Treinadores da busca livre fora da campanha
  const freeSearchResults = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (normalized.length < 2) return [];
    const campaignTrainerIds = new Set(Object.values(campaign).flatMap((s) => s.stages.flatMap((st) => st.variants.map((v) => v.id))));
    return allTrainers.filter(
      (trainer) =>
        !campaignTrainerIds.has(trainer.id) &&
        (normalizeSearch(trainer.name).includes(normalized) || normalizeSearch(trainer.id).includes(normalized)),
    );
  }, [campaign, allTrainers, query]);

  const selectedKey = expandedStageId ?? (selectedStage?.seriesId === seriesId ? selectedStage.stage.stageId : null);
  const choosing = selectedKey === null ? null : (entries.get(selectedKey) ?? null);
  const matches = view.groups.reduce((sum, group) => sum + group.entries.length, 0);

  // Estatísticas do Trainer Card
  const totalVictories = useMemo(() => {
    return series.stages.reduce((sum, st) => {
      let stageWins = 0;
      if (victoryCounts) {
        for (const v of st.variants) {
          const raw = v.id.replace(/^rctmod:/, '');
          stageWins += victoryCounts[raw] ?? victoryCounts[v.id] ?? 0;
        }
      }
      return sum + stageWins;
    }, 0);
  }, [series, victoryCounts]);

  function handleSelection(keys: Selection) {
    const [key] = keys === 'all' ? [] : [...keys];
    if (key === undefined) return;
    const stageKey = String(key as Key);
    const entry = entries.get(stageKey);
    if (!entry) return;
    setExpandedStageId(entry.stage.stageId);
    const trainerId = goalTrainerId(entry, null);
    if (trainerId !== null) onSelect(trainerId);
  }

  return (
    <section className={styles.card} aria-label="Trainer Card da Campanha">
      <div className={styles.cardHeader}>
        <div className={styles.titleArea}>
          <h3 className={styles.title}>Trainer Card · {seriesLabel(seriesId)}</h3>
          <div className={styles.statsBar}>
            <span>
              Vitórias na série: <strong>{totalVictories}</strong>
            </span>
            <span>·</span>
            <span>
              Level cap da campanha: <strong>{progress?.levelCap ?? 'desconhecido'}</strong>
            </span>
            <span>·</span>
            <span className={styles.origin}>{progressOriginLabel(defeated)}</span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        {seriesIds.length > 1 ? (
          <Select
            className={styles.seriesField}
            label="Série da campanha"
            options={seriesIds.map((id) => ({key: id, label: seriesLabel(id)}))}
            value={seriesId}
            onChange={(value) => {
              if (value !== null) {
                setSeriesChoice(value);
                setExpandedStageId(null);
              }
            }}
          />
        ) : null}
        <SearchField
          className={styles.search}
          label="Buscar treinador"
          value={query}
          onChange={setQuery}
          placeholder="Nome, tipo ou id do treinador…"
        />
        <Switch isSelected={onlyCurrent} onChange={setOnlyCurrent}>
          Só campanha atual
        </Switch>
      </div>

      {matches === 0 && freeSearchResults.length === 0 ? (
        <p className={styles.empty} role="status">
          Nenhum treinador encontrado{query.trim() === '' ? '' : ` para “${query.trim()}”`}.
        </p>
      ) : (
        <ListBox
          aria-label="Etapas da campanha"
          className={styles.list}
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          selectedKeys={selectedKey === null ? [] : [selectedKey]}
          onSelectionChange={handleSelection}
        >
          {view.groups.map((group) => (
            <ListBoxSection key={group.key} className={styles.group}>
              <Header className={styles.groupHeader}>{group.label}</Header>
              {group.entries.map((entry) => (
                <EntryRow key={entry.stage.stageId} entry={entry} selected={entry.stage.stageId === selectedKey} />
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      )}

      {/* Resultados da busca livre fora da campanha */}
      {freeSearchResults.length > 0 && (
        <div className={styles.group}>
          <h4 className={styles.groupHeader}>Outros treinadores (fora da campanha)</h4>
          <ul className={styles.list}>
            {freeSearchResults.map((trainer) => (
              <li key={trainer.id}>
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => onSelect(trainer.id)}
                  data-selected={selectedTrainerId === trainer.id ? 'true' : undefined}
                >
                  <span className={styles.stateBadge} data-state="liberado">
                    Livre
                  </span>
                  <div className={styles.entryMain}>
                    <span className={styles.entryName}>{trainer.name}</span>
                    <span className={styles.entryMeta}>{trainer.id}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detalhe da etapa selecionada */}
      {choosing && (
        <section className={styles.detailCard} aria-label={`Detalhes de ${choosing.stage.name}`}>
          <div className={styles.detailHeader}>
            <h4 className={styles.detailTitle}>{choosing.stage.name}</h4>
            <span className={styles.stateBadge} data-state={choosing.state}>
              {stageStateLabel(choosing.state)}
            </span>
          </div>

          <dl className={styles.detailFacts}>
            <div>
              <dt>Tipo</dt>
              <dd>{stageTypeLabel(choosing.stage.type)}</dd>
            </div>
            <div>
              <dt>Level cap</dt>
              <dd>
                {choosing.stage.capBefore !== null && choosing.stage.capAfter !== null
                  ? `${choosing.stage.capBefore} → ${choosing.stage.capAfter}`
                  : (choosing.stage.capUnknownReason ?? 'Desconhecido')}
              </dd>
            </div>
            <div>
              <dt>Vitórias</dt>
              <dd>{choosing.victoryCount} vitórias</dd>
            </div>
          </dl>

          {choosing.stage.requires.length > 0 ? (
            <p className={styles.detailRequires}>
              <strong>Pré-requisitos:</strong> {choosing.stage.requires.map((reqId) => allStagesMap[reqId] ?? reqId).join(', ')}
            </p>
          ) : (
            <p className={styles.detailRequires}>Sem pré-requisitos na campanha.</p>
          )}

          {choosing.needsVariantChoice && (
            <fieldset className={styles.variants}>
              <legend className={styles.variantLegend}>Escolha a variante de {choosing.stage.name}</legend>
              <p className={styles.variantReason}>
                {choosing.stage.ambiguousReason ?? 'O app não sabe qual variante foi gerada; escolha uma para montar o time:'}
              </p>
              {choosing.stage.variants
                .filter((variant) => variant.format === 'singles')
                .map((variant, index) => (
                  <label key={variant.id} className={styles.variantOption}>
                    <input
                      type="radio"
                      name={`variante-${choosing.stage.stageId}`}
                      checked={selectedTrainerId === variant.id}
                      onChange={() => onSelect(variant.id)}
                    />
                    <span>{variantLabel(variant, index)}</span>
                  </label>
                ))}
            </fieldset>
          )}
        </section>
      )}
    </section>
  );
}
