'use strict';

const PRIMARY_SERIES = 'radicalred';
const NEXT_GOAL_REASON = 'Sem progresso legível; sugestão pelo nível da sua party.';

function seriesOf(seriesData, trainerId) {
  if (seriesData[PRIMARY_SERIES]?.trainerIds.includes(trainerId)) return PRIMARY_SERIES;
  for (const [name, series] of Object.entries(seriesData)) if (series.trainerIds.includes(trainerId)) return name;
  return null;
}

function summary(trainer, seriesData) {
  return {
    id: trainer.id,
    name: trainer.name,
    format: trainer.format,
    teamSize: trainer.team.length,
    maxLevel: Math.max(0, ...trainer.team.map((member) => member.level)),
    series: seriesOf(seriesData, trainer.id),
  };
}

/** Treinadores como objetivo: radicalred primeiro, na ordem da campanha; os demais depois, por nome e id. */
function listGuideTrainers({trainers, series}) {
  const byId = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  const campaign = (series[PRIMARY_SERIES]?.order ?? []).map((id) => byId.get(id)).filter(Boolean);
  const inCampaign = new Set(campaign.map((trainer) => trainer.id));
  const rest = trainers
    .filter((trainer) => !inCampaign.has(trainer.id))
    .sort((left, right) => left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1));
  return [...campaign, ...rest].map((trainer) => summary(trainer, series));
}

function stageIsDefeated(stage, victoryCounts) {
  return stage.variants.some((variant) => victoryCounts[variant.id] > 0);
}

function publicStage(stage) {
  return {
    stageId: stage.stageId,
    name: stage.name,
    type: stage.type,
    order: stage.order,
    requires: [...stage.requires],
    capBefore: Number.isSafeInteger(stage.capBefore) ? stage.capBefore : null,
    capAfter: Number.isSafeInteger(stage.capAfter) ? stage.capAfter : null,
    capUnknownReason: stage.capUnknownReason ?? null,
    ambiguous: stage.ambiguous === true,
    ambiguousReason: stage.ambiguousReason ?? null,
    variants: stage.variants.map((variant) => ({
      trainerId: variant.id,
      format: variant.format,
      maxLevel: variant.maxLevel,
      teamSize: variant.teamSize,
      optional: variant.optional === true,
      ambiguous: stage.ambiguous === true,
      rule: stage.ambiguousReason ?? null,
    })),
  };
}

function capForFrontier(series, stages) {
  const initialCap = series.levelCapRule?.initialLevelCap;
  if (!Number.isSafeInteger(initialCap)) return null;
  if (stages.length === 0) return 100;
  const caps = stages.map((stage) => stage.capBefore);
  if (caps.some((cap) => !Number.isSafeInteger(cap))) return null;
  return Math.max(initialCap, Math.min(...caps));
}

function progressGoal(campaign, progress) {
  const {currentSeries, victoryCounts} = progress ?? {};
  const selected = currentSeries && campaign[currentSeries];
  if (!selected || !Array.isArray(selected.stages) || !isRecord(victoryCounts)) return null;

  const ordered = [...selected.stages].sort((left, right) => left.order - right.order);
  const defeated = new Set(ordered.filter((stage) => stageIsDefeated(stage, victoryCounts)).map((stage) => stage.stageId));
  const completed = (stage) => defeated.has(stage.stageId);
  const ready = (stage) => stage.requires.every((requirement) => defeated.has(requirement));
  const frontier = ordered.filter((stage) => !completed(stage) && ready(stage));
  const next = frontier[0];
  const upcoming = next
    ? ordered
        .filter((stage) => stage.order > next.order && !completed(stage))
        .slice(0, 3)
        .map(publicStage)
    : [];
  const levelCap = capForFrontier(selected, frontier);
  const result = {
    progress: {
      defeated: Object.entries(victoryCounts)
        .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
        .map(([id]) => id),
      victoryCounts,
      currentSeries,
      currentSeriesCompleted: progress.currentSeriesCompleted ?? null,
      completedSeries: progress.completedSeries ?? null,
      levelCap,
      pikaStar: progress.pikaStar ?? {},
      sources: progress.sources ?? [],
    },
    goal: next
      ? {
          trainerId: next.ambiguous === true || next.variants.length !== 1 ? null : next.variants[0].id,
          basis: 'progresso',
          reason: `Próxima etapa de ${currentSeries}: ${next.name}; os requisitos anteriores estão cumpridos.`,
          stage: publicStage(next),
          upcoming,
        }
      : {
          trainerId: null,
          basis: 'progresso',
          reason: `Não há etapas pendentes disponíveis na série ${currentSeries}.`,
          upcoming: [],
        },
  };
  return result;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Próximo objetivo usa campaign.json quando a série e progressDefeats estão disponíveis; caso contrário mantém
 * a sugestão pelo nível da party para compatibilidade com mundos sem progresso legível.
 */
function guideNextGoal({trainers, series, campaign = {}}, partyMaxLevel, progress = null) {
  const byProgress = progressGoal(campaign, progress);
  if (byProgress) return byProgress.goal;
  if (!Number.isSafeInteger(partyMaxLevel)) {
    return {trainerId: null, basis: 'nível', reason: 'Sem indivíduo na party para sugerir um objetivo pelo nível.'};
  }
  const byId = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  for (const id of series[PRIMARY_SERIES]?.order ?? []) {
    const trainer = byId.get(id);
    if (trainer?.format !== 'singles') continue;
    if (summary(trainer, series).maxLevel >= partyMaxLevel) return {trainerId: id, basis: 'nível', reason: NEXT_GOAL_REASON};
  }
  return {
    trainerId: null,
    basis: 'nível',
    reason: 'Nenhum treinador singles da campanha radicalred alcança o nível da sua party.',
  };
}

function deriveProgressLevelCap(campaign, progress) {
  const result = progressGoal(campaign, progress);
  return result?.progress.levelCap ?? null;
}

module.exports = {listGuideTrainers, guideNextGoal, deriveProgressLevelCap};
