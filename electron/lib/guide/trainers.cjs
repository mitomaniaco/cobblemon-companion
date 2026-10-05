'use strict';

const PRIMARY_SERIES = 'radicalred';
const NEXT_GOAL_REASON = 'Sugestão pelo nível da sua party; o app não lê o progresso de treinadores.';

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

/**
 * Próximo objetivo pelo nível: o primeiro treinador singles da campanha radicalred (ordem de series.json) cujo nível
 * máximo alcança o maior nível da party. Não usa progresso de treinadores derrotados (exigiria ler outro arquivo do save).
 */
function guideNextGoal({trainers, series}, partyMaxLevel) {
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

module.exports = {listGuideTrainers, guideNextGoal};
