import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {guideNextGoal, listGuideTrainers} = require('../electron/lib/guide/trainers.cjs');
const data = require('./fixtures/guide-data.json');

const REASON = 'Sugestão pelo nível da sua party; o app não lê o progresso de treinadores.';

const trainer = (id, format, levels) => ({
  id,
  name: id,
  format,
  team: levels.map((level) => ({speciesId: 'cobblemon:eevee', level, moves: []})),
});
const series = (order, extra = {}) => ({radicalred: {trainerIds: order, order}, ...extra});

describe('próximo objetivo pelo nível', () => {
  const trainers = [
    trainer('a', 'singles', [10, 14]),
    trainer('b', 'doubles', [30]),
    trainer('c', 'singles', [20, 25]),
    trainer('d', 'singles', [40]),
  ];
  const campaign = {trainers, series: series(['a', 'b', 'c', 'd'])};

  it('sugere o primeiro singles da campanha cujo nível máximo alcança o da party', () => {
    expect(guideNextGoal(campaign, 5)).toEqual({trainerId: 'a', basis: 'nível', reason: REASON});
    expect(guideNextGoal(campaign, 14).trainerId).toBe('a');
    expect(guideNextGoal(campaign, 15).trainerId).toBe('c');
  });

  it('pula duplas mesmo quando o nível alcança', () => {
    expect(guideNextGoal(campaign, 28).trainerId).toBe('d');
  });

  it('respeita a ordem da série, não a ordem do arquivo de treinadores', () => {
    const reordered = {trainers, series: series(['d', 'c', 'a'])};
    expect(guideNextGoal(reordered, 5).trainerId).toBe('d');
  });

  it('ignora treinadores de outras séries', () => {
    const others = {trainers, series: series(['c'], {bdsp: {trainerIds: ['a'], order: ['a']}})};
    expect(guideNextGoal(others, 5).trainerId).toBe('c');
  });

  it('sem treinador ao alcance ou sem party devolve trainerId null e explica', () => {
    expect(guideNextGoal(campaign, 41)).toMatchObject({trainerId: null, basis: 'nível'});
    expect(guideNextGoal(campaign, null)).toMatchObject({trainerId: null, basis: 'nível'});
  });
});

describe('lista de treinadores do guia', () => {
  it('radicalred primeiro na ordem da campanha, depois os demais, com tamanho, nível máximo e série', () => {
    const list = listGuideTrainers(data);
    expect(list.map((item) => item.id)).toEqual(['synthetic:fire', 'synthetic:duo', 'synthetic:flyer', 'synthetic:mixed', 'synthetic:far']);
    expect(list[0]).toEqual({
      id: 'synthetic:fire',
      name: 'Sintético Fogo',
      format: 'singles',
      teamSize: 1,
      maxLevel: 40,
      series: 'radicalred',
    });
    expect(list[1].format).toBe('doubles');
    expect(list[4]).toMatchObject({maxLevel: 90, series: null});
  });
});

describe('dados reais do guia', () => {
  it('a campanha radicalred real sugere um treinador singles para uma party de nível 5', () => {
    const {loadGuideData} = require('../electron/lib/guide/data.cjs');
    const real = loadGuideData();
    const goal = guideNextGoal(real, 5);
    const picked = real.trainers.find((item) => item.id === goal.trainerId);
    expect(picked.format).toBe('singles');
    expect(Math.max(...picked.team.map((member) => member.level))).toBeGreaterThanOrEqual(5);
    expect(listGuideTrainers(real)[0].series).toBe('radicalred');
  });
});
