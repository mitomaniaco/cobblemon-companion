import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildGuide, holdsOutcome, LIMITS, pickTeam} = require('../electron/lib/guide/engine.cjs');
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
    const holds = member.matchups.filter((matchup) => matchup.holds).length;
    const holdsText = holds > 0 ? ` e segura ${holds} na troca` : '';
    const fasterWins = member.matchups.filter((matchup) => matchup.faster && matchup.outcome === 'vence').length;
    const fasterText = fasterWins > 0 ? ` Age primeiro em ${fasterWins} desses confrontos.` : '';
    expect(member.reason).toBe(`Blastoise entra porque vence ${wins} de 1 adversários${holdsText} (melhor contra Charizard).${fasterText}`);
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

  it('eficácia sai do mesmo cálculo do dano: habilidade que anula o golpe dá 0 dano e ×0, nunca o ×1 da tabela de tipos', async () => {
    const trainer = {
      ...data.trainers[0],
      id: 'synthetic:absorber',
      team: [{...data.trainers[0].team[0], speciesId: 'cobblemon:vaporeon', ability: 'waterabsorb', moves: ['cobblemon:surf']}],
    };
    const absorbed = await run([individual({species: 'blastoise', level: 40, moves: ['surf']})], trainerGoal('synthetic:absorber'), {
      data: {...data, trainers: [...data.trainers, trainer]},
    });
    const [surf] = absorbed.team[0].matchups[0].damage;
    expect(surf).toEqual({moveId: 'cobblemon:surf', minPercent: 0, maxPercent: 0, effectiveness: 0});

    // Sem habilidade que anule: Water contra Fire é ×2 e o dano é positivo.
    const open = await run([individual({species: 'blastoise', level: 40, moves: ['surf']})], trainerGoal('synthetic:fire'));
    const [open0] = open.team[0].matchups[0].damage;
    expect(open0.effectiveness).toBe(2);
    expect(open0.maxPercent).toBeGreaterThan(0);
  });

  it('imunidade de tipo é ×0 e golpe de dano fixo fica sem eficácia (null), nunca um número presumido', async () => {
    const golem = individual({species: 'golem', moves: ['earthquake']});
    const flyer = await run([golem], trainerGoal('synthetic:flyer'));
    expect(flyer.team[0].matchups[0].damage).toEqual([
      expect.objectContaining({moveId: 'cobblemon:earthquake', maxPercent: 0, effectiveness: 0}),
    ]);

    const fixed = individual({species: 'blastoise', level: 40, moves: ['seismictoss']});
    const result = await run([fixed], trainerGoal('synthetic:fire'));
    const [toss] = result.team[0].matchups[0].damage;
    expect(toss.maxPercent).toBeGreaterThan(0);
    expect(toss.effectiveness).toBeNull();
  });

  it('Final Gambit: dano é o HP de quem usa, igual contra qualquer tipo, então a eficácia é null e nunca ×0,5 ou ×2', async () => {
    const pokemon = (speciesId, ability) => ({...data.trainers[0].team[0], speciesId, ability, moves: ['cobblemon:tackle']});
    const trainer = {
      ...data.trainers[0],
      id: 'synthetic:gambit',
      team: [pokemon('cobblemon:venusaur', 'overgrow'), pokemon('cobblemon:chansey', 'naturalcure')],
    };
    const blastoise = individual({species: 'blastoise', level: 40, moves: ['finalgambit']});
    const result = await run([blastoise], trainerGoal('synthetic:gambit'), {data: {...data, trainers: [...data.trainers, trainer]}});
    const damageVs = (opponentId) => result.team[0].matchups.find((matchup) => matchup.opponentId === opponentId).damage[0];
    // Grass/Poison (×0,5 pela tabela) e Normal (×1): o dano fixo não muda, então nenhum dos dois pode virar número.
    expect(damageVs('synthetic:gambit#0')).toEqual(expect.objectContaining({moveId: 'cobblemon:finalgambit', effectiveness: null}));
    expect(damageVs('synthetic:gambit#1')).toEqual(expect.objectContaining({moveId: 'cobblemon:finalgambit', effectiveness: null}));
    expect(damageVs('synthetic:gambit#0').maxPercent).toBeGreaterThan(0);
  });

  it('Steel Roller sem Terreno Elétrico dá 0 de dano, mas não é imunidade: eficácia null contra Normal puro', async () => {
    const trainer = {
      ...data.trainers[0],
      id: 'synthetic:normal',
      team: [{...data.trainers[0].team[0], speciesId: 'cobblemon:chansey', ability: 'naturalcure', moves: ['cobblemon:tackle']}],
    };
    const metagross = individual({species: 'metagross', level: 40, moves: ['steelroller']});
    const result = await run([metagross], trainerGoal('synthetic:normal'), {data: {...data, trainers: [...data.trainers, trainer]}});
    const [roller] = result.team[0].matchups[0].damage;
    expect(roller).toEqual({moveId: 'cobblemon:steelroller', minPercent: 0, maxPercent: 0, effectiveness: null});
  });

  it('Scrappy: Lutador acerta Fantasma com dano > 0, então a eficácia é null (a tabela diz ×0 e o cálculo não)', async () => {
    const trainer = {
      ...data.trainers[0],
      id: 'synthetic:ghost',
      team: [{...data.trainers[0].team[0], speciesId: 'cobblemon:gengar', ability: 'cursedbody', moves: ['cobblemon:shadowball']}],
    };
    const pancham = individual({species: 'pancham', level: 40, moves: ['closecombat']});
    pancham.observed.ability = 'scrappy';
    const result = await run([pancham], trainerGoal('synthetic:ghost'), {data: {...data, trainers: [...data.trainers, trainer]}});
    const [close] = result.team[0].matchups[0].damage;
    expect(close.maxPercent).toBeGreaterThan(0);
    expect(close.effectiveness).toBeNull();
  });

  it('golpe fora do catálogo não ganha número nem eficácia: fica em moves com evaluated false e fora de damage', async () => {
    const odd = individual({species: 'blastoise', level: 40, moves: ['surf', 'syntheticnotamove']});
    const result = await run([odd], trainerGoal('synthetic:fire'));
    const member = result.team[0];
    expect(member.moves).toContainEqual({id: 'cobblemon:syntheticnotamove', evaluated: false, source: 'equipado'});
    for (const matchup of member.matchups) {
      expect(matchup.damage.map((entry) => entry.moveId)).not.toContain('cobblemon:syntheticnotamove');
    }
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
    expect(byMove['cobblemon:surf']).toMatchObject({route: {kind: 'nível', level: 45}});
    expect(byMove['cobblemon:hydropump']).toMatchObject({route: {kind: 'tm', level: null}});
    expect(byMove['cobblemon:scald']).toMatchObject({route: {kind: 'tutor', level: null}});
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

  describe('rota por ovo', () => {
    const withEgg = (egg, base = data.learnsets.blastoise) => ({...data, learnsets: {...data.learnsets, blastoise: {...base, egg}}});
    const acquireOf = async (extraData) => {
      const blastoise = individual({species: 'blastoise', level: 40, moves: ['tackle']});
      return (await run([blastoise], trainerGoal('synthetic:fire'), {data: extraData})).team[0].acquire;
    };

    it('golpe do catálogo só aprendido por ovo vira sugestão com rota ovo; sem a lista egg ele não existe', async () => {
      expect((await acquireOf(data)).some((entry) => entry.moveId === 'cobblemon:hydrocannon')).toBe(false);
      const acquire = await acquireOf(withEgg(['cobblemon:hydrocannon']));
      const hydrocannon = acquire.find((entry) => entry.moveId === 'cobblemon:hydrocannon');
      expect(hydrocannon).toMatchObject({route: {kind: 'ovo', level: null}});
      expect(hydrocannon.reason).toBe(`Hydro Cannon (ovo) melhora o time em ${hydrocannon.gainPercent}%.`);
    });

    it('fail-closed: golpe de ovo fora do catálogo nunca é sugerido', async () => {
      const acquire = await acquireOf(withEgg(['cobblemon:syntheticnotamove', 'cobblemon:hydrocannon']));
      expect(acquire.map((entry) => entry.moveId)).not.toContain('cobblemon:syntheticnotamove');
      expect(acquire.map((entry) => entry.moveId)).toContain('cobblemon:hydrocannon');
    });

    it('o mesmo golpe em outra rota mantém a rota mais prática: nível, TM e tutor vencem o ovo', async () => {
      const acquire = await acquireOf(withEgg(['cobblemon:surf', 'cobblemon:hydropump', 'cobblemon:scald']));
      const byMove = Object.fromEntries(acquire.map((entry) => [entry.moveId, entry.route.kind]));
      expect(byMove).toMatchObject({'cobblemon:surf': 'nível', 'cobblemon:hydropump': 'tm', 'cobblemon:scald': 'tutor'});
    });

    it('golpe de ovo que o membro já conhece não é sugerido', async () => {
      const knows = individual({species: 'blastoise', level: 40, moves: ['tackle'], benched: ['hydrocannon']});
      const result = await run([knows], trainerGoal('synthetic:fire'), {data: withEgg(['cobblemon:hydrocannon'])});
      expect(result.team[0].acquire.map((entry) => entry.moveId)).not.toContain('cobblemon:hydrocannon');
    });
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

describe('segura, ameaças e táticas', () => {
  it('holdsOutcome: leva o maior acerto na entrada e ainda vence no pior caso; empate de Speed perde', () => {
    expect(holdsOutcome(50, 40, 2, 1)).toBe(true);
    expect(holdsOutcome(50, 40, 1, 2)).toBe(false);
    expect(holdsOutcome(50, 100, 2, 1)).toBe(false);
    expect(holdsOutcome(0, 10, 2, 1)).toBe(false);
    expect(holdsOutcome(50, 40, 1, 1)).toBe(false);
  });

  describe('pickTeam', () => {
    const fake = (uuid, species, wins, holds, faster, score) => ({
      entry: {individual: {uuid, speciesId: `cobblemon:${species}`}},
      evaluated: {outcomes: wins.map((w) => ({wins: w})), score},
      worst: holds.map((h, i) => ({holds: h, faster: faster[i], theirMove: null})),
    });
    const none = [false, false];
    const threats = [
      {weight: 1.8, dangerous: true},
      {weight: 1, dangerous: false},
    ];
    const order = (team) => team.map((member) => member.entry.individual.uuid);

    it('cobertura vem antes da redundância: quem cobre um adversário novo entra antes de um segundo para a ameaça', () => {
      const a = fake('a', 'a', [true, false], none, none, 2);
      const b = fake('b', 'b', [true, false], none, none, 1.9);
      const c = fake('c', 'c', [false, true], none, none, 1);
      expect(order(pickTeam([a, b, c], threats).team)).toEqual(['a', 'c', 'b']);
    });

    it('com a cobertura empatada, uma segunda resposta à ameaça vale mais que a pontuação', () => {
      const a = fake('a', 'a', [true, true], none, none, 3);
      const b = fake('b', 'b', [true, false], none, none, 1);
      const c = fake('c', 'c', [false, true], none, none, 1.5);
      expect(order(pickTeam([a, b, c], threats).team)[1]).toBe('b');
    });

    it('uma "segura" já conta como redundância na ameaça; sem ganho de valor, decide a pontuação', () => {
      const a = fake('a', 'a', [true, true], [true, false], none, 3);
      const b = fake('b', 'b', [true, false], none, none, 1);
      const c = fake('c', 'c', [false, true], none, none, 1.5);
      expect(order(pickTeam([a, b, c], threats).team)[1]).toBe('c');
    });
  });

  it('dica de Will-O-Wisp contra golpe físico e de Thunder Wave contra quem é mais rápido', async () => {
    const venusaur = individual({species: 'venusaur', moves: ['tackle', 'willowisp']});
    const burn = await run([venusaur], trainerGoal('synthetic:mixed'));
    expect(burn.team[0].tips).toContainEqual({
      opponentId: 'synthetic:mixed#1',
      moveId: 'cobblemon:willowisp',
      text: 'Will-O-Wisp em Golem: a queimadura corta pela metade o dano físico dele.',
    });

    const golem = individual({species: 'golem', moves: ['earthquake', 'thunderwave']});
    const paralyze = await run([golem], trainerGoal('synthetic:fire'));
    expect(paralyze.team[0].tips.map((tip) => tip.text)).toEqual(['Thunder Wave em Charizard: paralisado, ele fica mais lento que você.']);
  });

  it('adversários ganham a marca de ameaça quando metade ou mais do pool perde para eles', async () => {
    const result = await run([individual({species: 'golem', moves: ['earthquake']})], trainerGoal('synthetic:flyer'));
    expect(result.opponents.every((opponent) => typeof opponent.dangerous === 'boolean')).toBe(true);
    expect(result.opponents[0].dangerous).toBe(true);
    expect(result.team[0].matchups[0]).toMatchObject({outcome: 'perde', holds: false});
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
