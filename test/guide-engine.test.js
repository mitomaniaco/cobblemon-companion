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

  it('cada confronto traz a faixa de dano de cada golpe avaliado, e o melhor golpe tem o maior dano médio', async () => {
    const blastoise = individual({species: 'blastoise', level: 40, moves: ['tackle', 'bite', 'watergun', 'headbutt']});
    const result = await run([blastoise], trainerGoal('synthetic:fire'));
    const member = result.team[0];
    const evaluated = member.moves.filter((move) => move.evaluated).map((move) => move.id);
    expect(member.matchups.length).toBeGreaterThan(0);
    for (const matchup of member.matchups) {
      expect(matchup.damage.map((entry) => entry.moveId)).toEqual(evaluated);
      for (const entry of matchup.damage) {
        expect(entry.minPercent).toBeGreaterThanOrEqual(0);
        expect(entry.maxPercent).toBeGreaterThanOrEqual(entry.minPercent);
      }
      const average = (entry) => (entry.minPercent + entry.maxPercent) / 2;
      const best = matchup.damage.find((entry) => entry.moveId === matchup.moveId);
      expect(best).toBeDefined();
      expect(average(best) + 0.1).toBeGreaterThanOrEqual(Math.max(...matchup.damage.map(average)));
    }
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
    expect(byMove['cobblemon:surf'].replacesMoveId).toBeNull();
    expect(byMove['cobblemon:tackle']).toBeUndefined();

    const knows = individual({species: 'blastoise', level: 40, moves: ['tackle'], benched: ['surf']});
    const withSurf = await run([knows], trainerGoal('synthetic:fire'));
    expect(withSurf.team[0].acquire.some((entry) => entry.moveId === 'cobblemon:surf')).toBe(false);
  });

  it('com 4 golpes, a sugestão informa o golpe que sai do conjunto', async () => {
    const blastoise = individual({species: 'blastoise', level: 40, moves: ['tackle', 'bite', 'watergun', 'headbutt']});
    const result = await run([blastoise], trainerGoal('synthetic:fire'));
    const surf = result.team[0].acquire.find((entry) => entry.moveId === 'cobblemon:surf');
    expect(surf).toBeDefined();
    expect(['cobblemon:tackle', 'cobblemon:bite', 'cobblemon:watergun', 'cobblemon:headbutt']).toContain(surf.replacesMoveId);
    expect(surf.reason).toMatch(/^Surf \(nível 45\) no lugar de .+ melhora o time em [\d.]+%\.$/);
    for (const matchup of result.team[0].matchups) expect(matchup.moveId).toMatch(/^cobblemon:/);
  });

  it('cláusula de espécie: múltiplos indivíduos da mesma espécie nunca entram juntos no time', async () => {
    const blastoise1 = individual({species: 'blastoise', level: 50, moves: ['surf']});
    const blastoise2 = individual({species: 'blastoise', level: 45, moves: ['surf'], container: 'pc'});
    const venusaur = individual({species: 'venusaur', level: 40, moves: ['tackle']});
    const result = await run([blastoise1, blastoise2, venusaur], trainerGoal('synthetic:mixed'));
    const blastoiseCount = result.team.filter((m) => m.speciesId === 'cobblemon:blastoise').length;
    expect(blastoiseCount).toBe(1);
  });

  it('golpes do save sem namespace (equipados ou no banco) não são sugeridos como aquisição', async () => {
    const asSaved = (ids) => ids.map((id) => ({id, pp: 20, ppUps: 0}));
    const blastoise = individual({
      species: 'blastoise',
      level: 40,
      moves: ['tackle'],
      patch: {
        equippedMoves: asSaved(['tackle']),
        learnedMoves: [
          {id: 'surf', ppUps: 0},
          {id: 'hydropump', ppUps: 0},
        ],
      },
    });
    const result = await run([blastoise], trainerGoal('synthetic:fire'));
    const suggested = result.team[0].acquire.map((entry) => entry.moveId);
    expect(suggested).not.toContain('cobblemon:surf');
    expect(suggested).not.toContain('cobblemon:hydropump');
  });

  it('empate de cobertura: quem estava na recomendação anterior fica à frente; sem recomendação anterior vale a pontuação', async () => {
    const strong = individual({species: 'blastoise', level: 60, moves: ['surf']});
    const weaker = individual({species: 'floatzel', level: 40, moves: ['surf']});
    const without = await run([strong, weaker], trainerGoal('synthetic:fire'));
    expect(without.team[0].uuid).toBe(strong.uuid);
    const withPrevious = await run([strong, weaker], trainerGoal('synthetic:fire'), {previousTeamUuids: [weaker.uuid]});
    expect(withPrevious.team[0].uuid).toBe(weaker.uuid);
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
  });

  it('remove adversário com espécie fora do catálogo e cita na lista de hipóteses', async () => {
    const result = await run([individual({species: 'blastoise', moves: ['surf']})], trainerGoal('synthetic:mixed'));
    expect(result.opponents.map((opponent) => opponent.speciesId)).toEqual(['cobblemon:charizard', 'cobblemon:golem']);
    expect(result.assumptions.some((line) => line.includes('mod:especie_desconhecida'))).toBe(true);
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
      [alternate.uuid]: 'forma alola fora do subconjunto compatível versionado',
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

describe('level cap do RCT no guia (Issue #142)', () => {
  const party = () => [
    individual({species: 'blastoise', level: 75, moves: ['surf']}),
    individual({species: 'venusaur', level: 75, moves: ['tackle']}),
    individual({species: 'golem', level: 50, moves: ['earthquake']}),
    individual({species: 'gengar', level: 55, moves: ['shadowball'], container: 'pc'}),
  ];

  it('contra treinador, quem passa do cap sai do time e vai para excluded; quem está no cap ou abaixo fica elegível', async () => {
    const members = party();
    const result = await run(members, trainerGoal('synthetic:fire'), {levelCap: 55});
    expect(result.team.every((member) => member.level <= 55)).toBe(true);
    expect(result.team.map((member) => member.uuid).sort()).toEqual([members[2].uuid, members[3].uuid].sort());
    expect(
      result.excluded
        .filter((entry) => entry.reason === 'acima do level cap (55)')
        .map((entry) => entry.uuid)
        .sort(),
    ).toEqual([members[0].uuid, members[1].uuid].sort());
  });

  it('avisa que o treinador não luta com nenhum Pokémon da party acima do cap, mesmo fora do time', async () => {
    const result = await run(party(), trainerGoal('synthetic:fire'), {levelCap: 55});
    expect(result.assumptions.join(' ')).toContain('guarde no PC os 2 acima do cap');
  });

  it('toggle desligado: todos entram, ninguém é excluído e overCap lista quem passa do cap', async () => {
    const members = party();
    const result = await run(members, trainerGoal('synthetic:fire'), {levelCap: 55, respectLevelCap: false});
    expect(result.excluded.some((entry) => entry.reason.includes('level cap'))).toBe(false);
    expect(result.team).toHaveLength(4);
    const over = result.overCap.map((item) => item.uuid).sort();
    expect(over).toEqual([members[0].uuid, members[1].uuid].sort());
    expect(result.overCap[0]).toMatchObject({levelCap: 55});
    expect(result.overCap[0].text).toContain('baixe o nível para 55');
    expect(result.assumptions.join(' ')).toContain('ignorado a seu pedido');
  });

  it('toggle ligado (padrão) devolve overCap vazio; PvE nunca devolve overCap', async () => {
    expect((await run(party(), trainerGoal('synthetic:fire'), {levelCap: 55})).overCap).toEqual([]);
    const pveMembers = [
      individual({species: 'blastoise', level: 40, moves: ['surf']}),
      individual({species: 'golem', level: 38, moves: ['earthquake']}),
    ];
    const pve = await run(pveMembers, {kind: 'pve'}, {levelCap: 10, respectLevelCap: false});
    expect(pve.overCap).toEqual([]);
  });

  it('cap nulo não exclui ninguém e avisa que o cap não foi considerado', async () => {
    const result = await run(party(), trainerGoal('synthetic:fire'));
    expect(result.excluded).toEqual([]);
    expect(result.team).toHaveLength(4);
    expect(result.assumptions.join(' ')).toContain('O level cap não foi informado e não foi considerado');
  });

  it('cap alto não exclui ninguém e não gera aviso de cap', async () => {
    const result = await run(party(), trainerGoal('synthetic:fire'), {levelCap: 100});
    expect(result.excluded).toEqual([]);
    expect(result.team).toHaveLength(4);
    expect(result.assumptions.join(' ')).not.toContain('level cap');
  });

  it('PvE geral (exploração) não aplica o cap', async () => {
    const members = [
      individual({species: 'blastoise', level: 40, moves: ['surf']}),
      individual({species: 'golem', level: 38, moves: ['earthquake']}),
    ];
    const result = await run(members, {kind: 'pve'}, {levelCap: 10});
    expect(result.team).toHaveLength(2);
    expect(result.excluded.some((entry) => entry.reason.includes('level cap'))).toBe(false);
    expect(result.assumptions.join(' ')).not.toContain('level cap');
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
