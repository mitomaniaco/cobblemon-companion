import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildGuide, LIMITS} = require('../electron/lib/guide/engine.cjs');
const {assessEligibility} = require('../electron/lib/guide/eligibility.cjs');
const {COMPATIBILITY} = require('../electron/lib/real-damage.cjs');
const data = require('./fixtures/guide-data.json');

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const fact = (value) => ({state: 'known', value, provenance: {sourceKind: 'party', nbtPath: 'test'}});
const facts = (value) => Object.fromEntries(STATS.map((stat) => [stat, fact(value)]));
let counter = 0;

function individual({species, level = 40, moves, benched = [], heldItem = null, container = 'party', patch = {}}) {
  counter += 1;
  const speciesId = `cobblemon:${species}`;
  return {
    uuid: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    speciesId,
    formId: 'normal',
    level,
    location: container === 'party' ? {container, slot: counter} : {container, box: 1, boxName: null, slot: counter},
    equippedMoves: moves.map((id) => ({id: `cobblemon:${id}`, pp: 20, ppUps: 0})),
    equippedMovesKnown: true,
    learnedMoves: benched.map((id) => ({id: `cobblemon:${id}`, ppUps: 0})),
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:modest', ability: COMPATIBILITY.species[speciesId].abilities[0], heldItem},
    battleStats: {ivs: facts(31), hyperTrainedIvs: facts(null), evs: facts(0)},
    ...patch,
  };
}

const snapshotOf = (...individuals) => ({schemaVersion: 2, sources: [], individuals});
const trainerGoal = (trainerId) => ({kind: 'trainer', trainerId});
const run = (individuals, goal, extra = {}) => buildGuide({snapshot: snapshotOf(...individuals), goal, data, ...extra});

describe('motor do guia', () => {
  it('vantagem de tipo vence e entra no time, com a explicação citando as vitórias reais', async () => {
    const blastoise = individual({species: 'blastoise', moves: ['surf', 'tackle']});
    const weak = individual({species: 'venusaur', moves: ['tackle']});
    const result = await run([blastoise, weak], trainerGoal('synthetic:fire'));

    const member = result.team.find((candidate) => candidate.uuid === blastoise.uuid);
    expect(member).toBeDefined();
    expect(member.matchups).toEqual([expect.objectContaining({opponentId: 'synthetic:fire#0', outcome: 'vence'})]);
    const wins = member.matchups.filter((matchup) => matchup.outcome === 'vence').length;
    expect(member.reason).toBe(`Blastoise entra porque vence ${wins} de 1 adversários (melhor contra Charizard).`);
    expect(member.moves[0]).toEqual({id: 'cobblemon:surf', evaluated: true, source: 'equipado'});
  });

  it('imunidade de tipo perde: golpe de Ground não acerta Flying e o adversário vence', async () => {
    const golem = individual({species: 'golem', moves: ['earthquake']});
    const result = await run([golem], trainerGoal('synthetic:flyer'));
    const [matchup] = result.team[0].matchups;
    expect(matchup.outcome).toBe('perde');
    expect(matchup.ourTurns).toBe(Number.POSITIVE_INFINITY);
    expect(result.team[0].reason).toContain('vence 0 de 1 adversários.');
  });

  it('heldItem null conta como sem item: sugere um item e marca como "obter"', async () => {
    // Procura um nível em que o item vira o confronto, para que a sugestão seja exercitada de verdade.
    let suggestion = null;
    for (let level = 30; level <= 60 && !suggestion; level += 1) {
      const attacker = individual({species: 'blastoise', level, moves: ['surf']});
      const result = await run([attacker], trainerGoal('synthetic:fire'));
      if (result.team[0].item.status === 'obter') suggestion = result.team[0];
    }
    expect(suggestion).not.toBeNull();
    expect(suggestion.item.id).toMatch(/^cobblemon:[a-z_]+$/);
    expect(suggestion.item.reason).toMatch(/^.+ aumenta as vitórias de 0 para 1\.$/);
  });

  it('sem ganho com item, mantém o atual: nenhum quando não há item e "tem" quando já segura um', async () => {
    const bare = individual({species: 'blastoise', level: 60, moves: ['surf']});
    const held = individual({species: 'blastoise', level: 60, moves: ['surf'], heldItem: 'cobblemon:mystic_water'});
    const [bareResult, heldResult] = await Promise.all([
      run([bare], trainerGoal('synthetic:fire')),
      run([held], trainerGoal('synthetic:fire')),
    ]);
    expect(bareResult.team[0].item).toEqual({id: null, status: 'nenhum', reason: 'Mantém o item atual.'});
    expect(heldResult.team[0].item).toEqual({id: 'cobblemon:mystic_water', status: 'tem', reason: 'Mantém o item atual.'});
  });

  it('golpe melhor do learnset aparece em acquire com o requisito certo e só se não for conhecido', async () => {
    const blastoise = individual({species: 'blastoise', level: 40, moves: ['tackle']});
    const result = await run([blastoise], trainerGoal('synthetic:fire'));
    const acquire = result.team[0].acquire;
    const byMove = Object.fromEntries(acquire.map((entry) => [entry.moveId, entry]));
    expect(byMove['cobblemon:surf']).toMatchObject({requirement: 'nível 45'});
    expect(byMove['cobblemon:hydropump']).toMatchObject({requirement: 'TM'});
    expect(byMove['cobblemon:scald']).toMatchObject({requirement: 'tutor'});
    expect(byMove['cobblemon:surf'].gainPercent).toBeGreaterThanOrEqual(5);
    expect(byMove['cobblemon:surf'].reason).toBe(`Surf (nível 45) melhora o time em ${byMove['cobblemon:surf'].gainPercent}%.`);
    expect(byMove['cobblemon:tackle']).toBeUndefined();

    const knows = individual({species: 'blastoise', level: 40, moves: ['tackle'], benched: ['surf']});
    const withSurf = await run([knows], trainerGoal('synthetic:fire'));
    expect(withSurf.team[0].acquire.some((entry) => entry.moveId === 'cobblemon:surf')).toBe(false);
  });

  it('recusa treinador em dupla e treinador inexistente', async () => {
    const one = individual({species: 'blastoise', moves: ['surf']});
    await expect(run([one], trainerGoal('synthetic:duo'))).rejects.toThrow('formato duplas não suportado');
    await expect(run([one], trainerGoal('synthetic:nao-existe'))).rejects.toThrow('não encontrado');
  });

  it('com menos de 6 elegíveis monta time menor e explica o motivo', async () => {
    const three = [
      individual({species: 'blastoise', moves: ['surf']}),
      individual({species: 'venusaur', moves: ['tackle']}),
      individual({species: 'golem', moves: ['earthquake'], container: 'pc'}),
    ];
    const result = await run(three, trainerGoal('synthetic:fire'));
    expect(result.team).toHaveLength(3);
    expect(result.assumptions).toContain('Só 3 indivíduo(s) elegível(is) entre party e PC; o time tem 3 membro(s).');
  });

  it('escolhe 6 de uma coleção maior, com no máximo 4 golpes cada, limits fixo e comparação com a party', async () => {
    const party = ['blastoise', 'venusaur', 'golem', 'gardevoir', 'dragonite', 'eevee'].map((species) =>
      individual({species, moves: ['tackle']}),
    );
    const pc = [
      individual({species: 'floatzel', moves: ['surf', 'tackle', 'icebeam', 'hydropump', 'scratch'], container: 'pc'}),
      individual({species: 'gengar', moves: ['shadowball'], container: 'pc'}),
    ];
    const result = await run([...party, ...pc], trainerGoal('synthetic:mixed'));
    expect(result.team.length).toBeLessThanOrEqual(6);
    expect(result.team).toHaveLength(6);
    for (const member of result.team) {
      expect(member.moves.length).toBeLessThanOrEqual(4);
      expect(member.reason.length).toBeGreaterThan(0);
    }
    expect(result.limits).toEqual(LIMITS);
    const partyUuids = party.map((member) => member.uuid);
    const {kept, added, removed} = result.currentPartyComparison;
    expect([...kept, ...added].sort()).toEqual(result.team.map((member) => member.uuid).sort());
    expect(kept.every((uuid) => partyUuids.includes(uuid))).toBe(true);
    expect(added.every((uuid) => !partyUuids.includes(uuid))).toBe(true);
    expect(removed.every((uuid) => partyUuids.includes(uuid))).toBe(true);
    expect(removed).toHaveLength(partyUuids.length - kept.length);
  });

  it('remove adversário com espécie fora do catálogo e cita na lista de hipóteses', async () => {
    const result = await run([individual({species: 'blastoise', moves: ['surf']})], trainerGoal('synthetic:mixed'));
    expect(result.opponents.map((opponent) => opponent.speciesId)).toEqual(['cobblemon:charizard', 'cobblemon:golem']);
    expect(result.assumptions.some((line) => line.includes('espécie mod:especie_desconhecida'))).toBe(true);
  });

  it('PvE usa a janela de nível da party, uma espécie por vez e sem duplas', async () => {
    const result = await run([individual({species: 'blastoise', level: 40, moves: ['surf']})], {kind: 'pve'});
    expect(result.referenceLevel).toBe(40);
    const species = result.opponents.map((opponent) => opponent.speciesId);
    expect(new Set(species).size).toBe(species.length);
    expect(result.opponents.every((opponent) => opponent.level >= 30 && opponent.level <= 45)).toBe(true);
    expect(result.opponents.some((opponent) => opponent.trainerId === 'synthetic:duo')).toBe(false);
    expect(result.opponents.some((opponent) => opponent.trainerId === 'synthetic:far')).toBe(false);
  });

  it('cancelamento no checkpoint interrompe a montagem', async () => {
    const one = individual({species: 'blastoise', moves: ['surf']});
    const checkpoint = async () => {
      throw Object.assign(new Error('cancelado'), {code: 'CANCELLED'});
    };
    await expect(run([one], trainerGoal('synthetic:fire'), {checkpoint})).rejects.toMatchObject({code: 'CANCELLED'});
  });

  it('indivíduo fora da elegibilidade vai para excluded com o motivo e não entra no time', async () => {
    const fine = individual({species: 'blastoise', moves: ['surf']});
    const alternate = individual({species: 'venusaur', moves: ['tackle'], patch: {formId: 'alola'}});
    const noLevel = individual({species: 'golem', moves: ['earthquake'], patch: {level: null}});
    const noMoves = individual({species: 'gengar', moves: ['nao_existe']});
    const result = await run([fine, alternate, noLevel, noMoves], trainerGoal('synthetic:fire'));
    expect(result.team.map((member) => member.uuid)).toEqual([fine.uuid]);
    expect(Object.fromEntries(result.excluded.map((entry) => [entry.uuid, entry.reason]))).toEqual({
      [alternate.uuid]: 'só a forma normal é compatível',
      [noLevel.uuid]: 'nível não foi capturado',
      [noMoves.uuid]: 'nenhum golpe conhecido pertence ao subconjunto compatível',
    });
  });

  it('golpes equipados fora do catálogo ocupam slots que sobram, sem avaliação', async () => {
    const odd = individual({species: 'blastoise', moves: ['surf', 'swordsdance', 'protect']});
    const result = await run([odd], trainerGoal('synthetic:fire'));
    expect(result.team[0].moves).toEqual([
      {id: 'cobblemon:surf', evaluated: true, source: 'equipado'},
      {id: 'cobblemon:swordsdance', evaluated: false, source: 'equipado'},
      {id: 'cobblemon:protect', evaluated: false, source: 'equipado'},
    ]);
  });
});

describe('elegibilidade do guia', () => {
  it('não exige item: heldItem fora do catálogo não exclui o indivíduo', () => {
    const modded = individual({species: 'blastoise', moves: ['surf'], heldItem: 'mega_showdown:blastoisinite'});
    const {eligible, excluded} = assessEligibility([modded]);
    expect(eligible).toHaveLength(1);
    expect(excluded).toEqual([]);
  });
});
