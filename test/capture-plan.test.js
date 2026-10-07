import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildCapturePlan} = require('../electron/lib/guide/capture-plan.cjs');
const {COMPATIBILITY} = require('../electron/lib/real-damage.cjs');
const guideData = require('./fixtures/guide-data.json');
const spawnFixture = require('./fixtures/guide-spawns.json');

const data = {trainers: guideData.trainers, series: guideData.series, learnsets: spawnFixture.learnsets, spawns: spawnFixture.spawns};
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const facts = (value) => Object.fromEntries(STATS.map((stat) => [stat, {state: 'known', value, provenance: {}}]));
let counter = 0;

function individual(species, level, moves, {container = 'party', slot = counter} = {}) {
  counter += 1;
  const speciesId = `cobblemon:${species}`;
  return {
    uuid: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    speciesId,
    formId: 'normal',
    level,
    location: container === 'party' ? {container, slot} : {container, box: 1, boxName: null, slot},
    equippedMoves: moves.map((id) => ({id: `cobblemon:${id}`, pp: 10, ppUps: 0})),
    equippedMovesKnown: true,
    learnedMoves: [],
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:modest', ability: COMPATIBILITY.species[speciesId].abilities[0], heldItem: null},
    battleStats: {ivs: facts(31), hyperTrainedIvs: facts(null), evs: facts(0)},
  };
}

const venusaur = individual('venusaur', 40, ['tackle'], {slot: 0});
const pcBlastoise = individual('blastoise', 40, ['surf'], {container: 'pc', slot: 3});
const weakPc = individual('venusaur', 12, ['tackle'], {container: 'pc', slot: 4});
const snapshot = {individuals: [venusaur, pcBlastoise, weakPc]};
const goal = {kind: 'trainer', trainerId: 'synthetic:fire'};
const GAP = 'synthetic:fire#0';
const plan = (overrides = {}, input = snapshot, captureData = data) =>
  buildCapturePlan({
    snapshot: input,
    request: {
      sources: [],
      goal,
      teamUuids: [venusaur.uuid],
      gapOpponentIds: [GAP],
      pikaStar: {paldea: null},
      ...overrides,
    },
    data: captureData,
  });

describe('plano de capturas recomendadas', () => {
  it('o indivíduo do PC que cobre a lacuna aparece em owned, e quem não cobre não aparece', async () => {
    const [gap] = (await plan()).gaps;
    expect(gap).toMatchObject({opponentId: GAP, speciesId: 'cobblemon:charizard', level: 40});
    expect(gap.owned.map((owned) => owned.uuid)).toEqual([pcBlastoise.uuid]);
    expect(gap.owned[0]).toMatchObject({container: 'pc', level: 40});
    expect(gap.owned[0].reason).toContain('Blastoise (PC, nível 40) derruba Charizard');
  });

  it('lista candidatos com biomas legíveis, condições, faixa de nível, bucket e regra de captura pelo nível da party', async () => {
    const result = await plan();
    expect(result.firstPartyLevel).toBe(40);
    const bySpecies = Object.fromEntries(result.gaps[0].candidates.map((candidate) => [candidate.speciesId, candidate]));
    const swampert = bySpecies['cobblemon:swampert'];
    expect(swampert).toBeDefined();
    expect(swampert.spawns).toEqual([
      {biomes: ['River'], conditions: ['com chuva'], levelMin: 36, levelMax: 40, bucket: 'uncommon', position: 'grounded'},
    ]);
    expect(swampert.catchable).toBe('liberada');
    expect(swampert.requirements[0]).toEqual({kind: 'nível', text: expect.stringContaining('alvo até o nível 40'), status: 'cumprido'});
    expect(swampert.reason).toContain('derruba Charizard');
    expect(swampert.catchableReason).toContain('limite de captura 40');

    const blastoise = bySpecies['cobblemon:blastoise'];
    expect(blastoise.catchable).toBe('depende-do-nível');
    expect(blastoise.requirements[0].status).toBe('pendente');
    expect(blastoise.spawns.map((spawn) => [spawn.bucket, spawn.biomes])).toEqual([
      ['common', ['Deep Ocean']],
      ['rare', ['Ocean, Deep Ocean']],
    ]);
    expect(blastoise.spawns[1].conditions).toEqual(['horário: noite', 'a céu aberto']);
  });

  it('nível do primeiro Pokémon da party decide: spawn acima do limite fica bloqueado e a liberada vem primeiro', async () => {
    const lowParty = individual('venusaur', 34, ['tackle'], {slot: 0});
    const result = await plan({teamUuids: [lowParty.uuid]}, {individuals: [lowParty, pcBlastoise]});
    const bySpecies = Object.fromEntries(result.gaps[0].candidates.map((candidate) => [candidate.speciesId, candidate]));
    expect(bySpecies['cobblemon:swampert'].catchable).toBe('bloqueada');
    expect(bySpecies['cobblemon:swampert'].requirements[0].status).toBe('pendente');
    expect(bySpecies['cobblemon:blastoise'].catchable).toBe('bloqueada');
    expect(bySpecies['cobblemon:walkingwake'].catchable).toBe('bloqueada');
    // Liberada vem antes de depende-do-nível e de bloqueada.
    const order = result.gaps[0].candidates.map((candidate) => candidate.catchable);
    expect(order).toEqual(
      [...order].sort(
        (left, right) =>
          ['liberada', 'depende-do-nível', 'bloqueada'].indexOf(left) - ['liberada', 'depende-do-nível', 'bloqueada'].indexOf(right),
      ),
    );
  });

  it('party vazia usa o teto de 15 sem líder', async () => {
    const result = await plan({teamUuids: []}, {individuals: [pcBlastoise]});
    expect(result.firstPartyLevel).toBeNull();
    expect(
      result.gaps[0].candidates.every(
        (candidate) => candidate.catchable !== 'liberada' || candidate.spawns.every((spawn) => spawn.levelMax <= 15),
      ),
    ).toBe(true);
    expect(result.gaps[0].candidates[0].catchableReason).toContain('limite de captura 15');
  });

  it('usa Pika Star regional verdadeiro, falso ou desconhecido sem alterar a regra de nível', async () => {
    const incomplete = (await plan({pikaStar: {paldea: false}})).gaps[0].candidates.find(
      (candidate) => candidate.speciesId === 'cobblemon:walkingwake',
    );
    expect(incomplete.requirements).toEqual([
      expect.objectContaining({kind: 'nível', status: 'pendente'}),
      {
        kind: 'pika-star',
        text: 'advancement Pika Star de paldea (allthemons:<região>_pika_star)',
        status: 'pendente',
      },
    ]);

    const unknown = (await plan({pikaStar: {paldea: null}})).gaps[0].candidates.find(
      (candidate) => candidate.speciesId === 'cobblemon:walkingwake',
    );
    expect(unknown.requirements[1].status).toBe('não verificado');
    const missing = (await plan({pikaStar: {}})).gaps[0].candidates.find((candidate) => candidate.speciesId === 'cobblemon:walkingwake');
    expect(missing.requirements[1].status).toBe('não verificado');

    const walkingWakeMultiRegionData = {
      ...data,
      spawns: {
        ...data.spawns,
        rules: {
          ...data.spawns.rules,
          species: {
            ...data.spawns.rules.species,
            walkingwake: {...data.spawns.rules.species.walkingwake, pikaStarRegions: ['kanto', 'paldea']},
          },
        },
      },
    };
    const pikaRequirement = (result) =>
      result.gaps[0].candidates
        .find((candidate) => candidate.speciesId === 'cobblemon:walkingwake')
        .requirements.find((requirement) => requirement.kind === 'pika-star');
    const trueAndFalse = await plan({pikaStar: {kanto: true, paldea: false}}, snapshot, walkingWakeMultiRegionData);
    const completeCandidate = trueAndFalse.gaps[0].candidates.find((candidate) => candidate.speciesId === 'cobblemon:walkingwake');
    expect(completeCandidate.requirements.filter((requirement) => requirement.kind === 'pika-star')).toHaveLength(1);
    expect(pikaRequirement(trueAndFalse)).toEqual({
      kind: 'pika-star',
      text: 'advancement Pika Star de kanto ou paldea (allthemons:<região>_pika_star)',
      status: 'cumprido',
    });
    const falseAndUnknown = await plan({pikaStar: {kanto: false, paldea: null}}, snapshot, walkingWakeMultiRegionData);
    expect(pikaRequirement(falseAndUnknown).status).toBe('não verificado');
    const allFalse = await plan({pikaStar: {kanto: false, paldea: false}}, snapshot, walkingWakeMultiRegionData);
    expect(pikaRequirement(allFalse).status).toBe('pendente');
    const swampertData = {
      ...data,
      spawns: {
        ...data.spawns,
        rules: {
          ...data.spawns.rules,
          species: {
            ...data.spawns.rules.species,
            swampert: {...data.spawns.rules.species.swampert, pikaStarRegions: ['kanto']},
          },
        },
      },
    };
    const completed = (
      await buildCapturePlan({
        snapshot,
        request: {sources: [], goal, teamUuids: [venusaur.uuid], gapOpponentIds: [GAP], pikaStar: {kanto: true}},
        data: swampertData,
      })
    ).gaps[0].candidates.find((candidate) => candidate.speciesId === 'cobblemon:swampert');
    expect(completed.requirements.map(({kind, status}) => [kind, status])).toEqual([
      ['nível', 'cumprido'],
      ['pika-star', 'cumprido'],
    ]);
  });

  it('espécie sem spawn natural conhecido, forma regional e quem não vence não ganham local nem entram', async () => {
    const species = (await plan()).gaps[0].candidates.map((candidate) => candidate.speciesId);
    expect(species).not.toContain('cobblemon:lapras'); // vence, mas não tem spawn nos dados
    expect(species).not.toContain('cobblemon:venusaur'); // só spawn alolan
    expect(species).not.toContain('cobblemon:golem'); // Ground não acerta Flying
  });

  it('explica quando nenhuma captura cobre a lacuna e ignora adversário que não existe', async () => {
    const noCover = {...data, spawns: {...data.spawns, pools: {species: {golem: data.spawns.pools.species.golem}}}};
    const result = await buildCapturePlan({
      snapshot,
      request: {
        sources: [],
        goal,
        teamUuids: [venusaur.uuid],
        gapOpponentIds: [GAP, 'synthetic:fire#9'],
        pikaStar: {},
      },
      data: noCover,
    });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].candidates).toEqual([]);
    expect(result.gaps[0].note).toContain('Nenhuma espécie com spawn natural conhecido');
    expect(result.assumptions.join(' ')).toContain('synthetic:fire#9');
  });

  it('declara hipóteses e limites, e recusa lista de lacunas grande demais', async () => {
    const result = await plan();
    expect(result.assumptions.join(' ')).toContain('IVs 15');
    expect(result.assumptions.join(' ')).toContain('desmaiado');
    expect(result.limits.join(' ')).toContain('não lê inventário');
    await expect(plan({gapOpponentIds: Array.from({length: 31}, (_, index) => `x#${index}`)})).rejects.toThrow('até 30');
  });
});
