import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildBattlePlan} = require('../electron/lib/guide/battle-plan.cjs');
const {COMPATIBILITY} = require('../electron/lib/real-damage.cjs');
const data = require('./fixtures/guide-battle-plan.json');

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const facts = (value) => Object.fromEntries(STATS.map((stat) => [stat, {state: 'known', value, provenance: {}}]));
let counter = 0;

function individual(species, level, moves) {
  counter += 1;
  const speciesId = `cobblemon:${species}`;
  return {
    uuid: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    speciesId,
    formId: 'normal',
    level,
    location: {container: 'party', slot: counter},
    equippedMoves: moves.map((id) => ({id: `cobblemon:${id}`, pp: 20, ppUps: 0})),
    equippedMovesKnown: true,
    learnedMoves: [],
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:modest', ability: COMPATIBILITY.species[speciesId].abilities[0], heldItem: null},
    battleStats: {ivs: facts(31), hyperTrainedIvs: facts(null), evs: facts(0)},
  };
}

const blastoise = individual('blastoise', 30, ['surf', 'tackle']);
const pikachu = individual('pikachu', 30, ['thunderbolt', 'quickattack']);
const snapshot = {individuals: [blastoise, pikachu]};
const team = [
  {uuid: blastoise.uuid, moveIds: ['cobblemon:surf', 'cobblemon:tackle'], itemId: null},
  {uuid: pikachu.uuid, moveIds: ['cobblemon:thunderbolt', 'cobblemon:quickattack'], itemId: null},
];
const opponent = (overrides = {}) => ({
  speciesId: 'cobblemon:geodude',
  level: 30,
  moves: ['cobblemon:rocktomb'],
  ability: 'sturdy',
  nature: 'hardy',
  heldItem: [],
  ivs: {},
  evs: {},
  aspects: [],
  ...overrides,
});
const customPlan = (members, {snapshot: custom = snapshot, team: customTeam = team} = {}) =>
  buildBattlePlan({
    snapshot: custom,
    request: {sources: [], trainerId: 'synthetic:custom', team: customTeam},
    data: {trainers: [{id: 'synthetic:custom', name: 'Custom', format: 'singles', team: members}]},
  });
const plan = (trainerId, overrides = {}) => buildBattlePlan({snapshot, request: {sources: [], trainerId, team, ...overrides}, data});

describe('plano de batalha contra o líder', () => {
  it('mostra respondedor, golpe, dano nos dois sentidos, ordem de ação e riscos por adversário (estilo Brock)', async () => {
    const result = await plan('synthetic:brock');
    expect(result.status).toBe('plano');
    expect(result.entries).toHaveLength(3);

    const geodude = result.entries[0];
    expect(geodude.status).toBe('planejado');
    expect(geodude.responder).toEqual({uuid: blastoise.uuid, speciesId: 'cobblemon:blastoise', moveId: 'cobblemon:surf'});
    expect(geodude.dealt).toMatchObject({moveId: 'cobblemon:surf'});
    expect(geodude.dealt.min).toBeGreaterThan(0);
    expect(geodude.dealt.max).toBeGreaterThanOrEqual(geodude.dealt.min);
    expect(geodude.received.targetHP).toBeGreaterThan(0);
    // Custap Berry pode inverter a ordem mesmo com o jogador mais rápido: o plano não promete a ordem.
    expect(geodude.firstToAct).toBe('incerto');
    expect(geodude.actReason).toContain('Custap Berry');
    expect(geodude.risks).toContainEqual({
      kind: 'habilidade',
      text: 'Geodude aguenta um golpe com Sturdy e pode agir antes com Custap Berry.',
    });

    const onix = result.entries[1];
    expect(onix.risks.map((risk) => risk.text)).toEqual(
      expect.arrayContaining(['Onix aguenta um golpe com Sturdy.', expect.stringContaining('Berry Juice: recupera 20 HP')]),
    );
    expect(onix.firstToAct).toBe('jogador');
  });

  it('bolsa × maxItemUses e IA entram como riscos do treinador', async () => {
    const result = await plan('synthetic:brock');
    expect(result.trainer).toEqual({
      id: 'synthetic:brock',
      name: 'Brock Sintético',
      maxItemUses: 2,
      bag: [{itemId: 'cobblemon:potion', quantity: 1}],
    });
    const texts = Object.fromEntries(result.trainerRisks.map((risk) => [risk.kind, risk.text]));
    expect(texts.bolsa).toContain('1 Potion');
    expect(texts.bolsa).toContain('até 2 usos');
    expect(texts.ia).toContain('IA do RCT não é modelada');
  });

  it('forma alternativa (como Geodude de Alola) é planejada com a forma do catálogo, não a normal', async () => {
    const result = await plan('synthetic:brock');
    const alolan = result.entries[2];
    expect(alolan.status).toBe('planejado');
    expect(alolan.responder).toBeTruthy();
    expect(alolan.dealt.max).toBeGreaterThan(0);
    expect(alolan.risks.some((risk) => risk.text.startsWith('Geodude-Alola aguenta'))).toBe(true);
    expect(result.entries.filter((entry) => entry.status === 'planejado')).toHaveLength(3);
  });

  it('aspects sem forma no catálogo bloqueiam o confronto', async () => {
    const result = await customPlan([opponent({speciesId: 'cobblemon:geodude', aspects: ['inexistente']})]);
    expect(result.entries[0].status).toBe('bloqueado');
    expect(result.entries[0].blockedReason).toContain('sem correspondência');
  });

  it('natureza fora do catálogo bloqueia, sem cair em Hardy', async () => {
    const result = await customPlan([opponent({nature: 'cobblemon:xyz'})]);
    expect(result.entries[0].status).toBe('bloqueado');
    expect(result.entries[0].blockedReason).toContain('natureza');
  });

  it('golpe de dano fora do catálogo bloqueia; golpe de status vira risco', async () => {
    const bad = await customPlan([opponent({moves: ['cobblemon:superfang']})]);
    expect(bad.entries[0].status).toBe('bloqueado');
    expect(bad.entries[0].blockedReason).toContain('Super Fang');
    const status = await customPlan([opponent({moves: ['cobblemon:tackle', 'cobblemon:swordsdance']})]);
    expect(status.entries[0].status).toBe('planejado');
    expect(status.entries[0].risks.some((risk) => risk.text.includes('Swords Dance'))).toBe(true);
  });

  it('habilidade de entrada fora do adaptador bloqueia', async () => {
    const result = await customPlan([opponent({ability: 'neutralizinggas'})]);
    expect(result.entries[0].status).toBe('bloqueado');
    expect(result.entries[0].blockedReason).toContain('fora do adaptador');
  });

  it('heldItem com várias alternativas: pior caso entre as catalogadas; item de Mega vira parcial; só Mega bloqueia', async () => {
    const result = await plan('synthetic:surge');
    const raichu = result.entries[0];
    expect(raichu.heldItemAlternatives).toEqual(['mega_showdown:manectite', 'cobblemon:expert_belt']);
    expect(raichu.status).toBe('parcial');
    expect(raichu.partialReason).toContain('Manectite');
    expect(raichu.dealt.max).toBeGreaterThan(0);

    const pika = result.entries[1];
    expect(pika.status).toBe('planejado');
    expect(pika.risks.map((risk) => risk.text).join(' ')).toContain('Expert Belt ou Life Orb');

    const onlyMega = await customPlan([opponent({heldItem: ['mega_showdown:red_orb']})]);
    expect(onlyMega.entries[0].status).toBe('bloqueado');
    expect(onlyMega.entries[0].blockedReason).toContain('Red Orb');
  });

  it('a pior variante de item para o jogador é a que vale', async () => {
    const lifeOrbOnly = await customPlan([opponent({heldItem: ['cobblemon:life_orb']})]);
    const either = await customPlan([opponent({heldItem: ['cobblemon:oran_berry', 'cobblemon:life_orb']})]);
    expect(either.entries[0].received.max).toBe(lifeOrbOnly.entries[0].received.max);
  });

  it('terreno de habilidade do adversário entra no dano que o jogador recebe', async () => {
    const withTerrain = await customPlan([
      opponent({speciesId: 'cobblemon:voltorb', ability: 'electricsurge', moves: ['cobblemon:thunderbolt']}),
    ]);
    const without = await customPlan([opponent({speciesId: 'cobblemon:voltorb', ability: 'static', moves: ['cobblemon:thunderbolt']})]);
    expect(withTerrain.entries[0].status).toBe('planejado');
    expect(withTerrain.entries[0].risks.some((risk) => risk.text.includes('Terreno Elétrico'))).toBe(true);
    expect(withTerrain.entries[0].received.max).toBeGreaterThan(without.entries[0].received.max);
  });

  it('imunidade por habilidade vira risco', async () => {
    const immune = await plan('synthetic:surge', {team: [{...team[1], moveIds: ['cobblemon:thunderbolt']}]});
    expect(immune.entries[3].dealt).toMatchObject({moveId: 'cobblemon:thunderbolt', min: 0, max: 0});
    expect(immune.entries[3].risks).toContainEqual({kind: 'habilidade', text: 'Voltorb anula golpes do tipo Electric com Volt Absorb.'});
  });

  it('clima ou terreno diferentes entre adversário e membro ficam em disputa e o membro não é avaliado', async () => {
    const pelipper = individual('pelipper', 30, ['surf']);
    pelipper.observed.ability = 'cobblemon:drizzle';
    const members = [{uuid: pelipper.uuid, moveIds: ['cobblemon:surf'], itemId: null}];
    const result = await customPlan([opponent({ability: 'drought'})], {snapshot: {individuals: [pelipper]}, team: members});
    expect(result.entries[0].status).toBe('bloqueado');
    expect(result.entries[0].blockedReason).toContain('clima em disputa');
    expect(result.lead).toBeNull();

    const mixed = await customPlan([opponent({ability: 'drought'})], {
      snapshot: {individuals: [pelipper, blastoise]},
      team: [...members, team[0]],
    });
    expect(mixed.entries[0].status).toBe('planejado');
    expect(mixed.entries[0].responder.uuid).toBe(blastoise.uuid);
    expect(mixed.entries[0].risks.some((risk) => risk.text.includes('em disputa'))).toBe(true);
  });

  describe('Intimidate', () => {
    const tackleTeam = [{uuid: blastoise.uuid, moveIds: ['cobblemon:tackle'], itemId: null}];
    const staraptor = (ability) => opponent({speciesId: 'cobblemon:staraptor', ability, moves: ['cobblemon:bravebird']});
    const dealtBy = async (foe, request = {}) => (await customPlan([foe], {team: tackleTeam, ...request})).entries[0].dealt.max;

    it('reduz o Ataque do membro e o dano dele cai em relação à mesma batalha sem Intimidate', async () => {
      const result = await customPlan([staraptor('intimidate')], {team: tackleTeam});
      expect(result.entries[0].status).toBe('planejado');
      expect(result.entries[0].risks.some((risk) => risk.text.includes('Intimidate'))).toBe(true);
      expect(await dealtBy(staraptor('intimidate'))).toBeLessThan(await dealtBy(staraptor('reckless')));
    });

    it('Clear Body não sofre a queda', async () => {
      const beldum = individual('beldum', 30, ['tackle']);
      const request = {snapshot: {individuals: [beldum]}, team: [{uuid: beldum.uuid, moveIds: ['cobblemon:tackle'], itemId: null}]};
      expect(await dealtBy(staraptor('intimidate'), request)).toBe(await dealtBy(staraptor('reckless'), request));
    });

    it('Intimidate do membro reduz o Ataque do adversário', async () => {
      const gyarados = individual('gyarados', 30, ['waterfall']);
      expect(gyarados.observed.ability).toBe('cobblemon:intimidate');
      const request = {snapshot: {individuals: [gyarados]}, team: [{uuid: gyarados.uuid, moveIds: ['cobblemon:waterfall'], itemId: null}]};
      const received = async (foe) => (await customPlan([foe], request)).entries[0].received.max;
      const physical = opponent({speciesId: 'cobblemon:staraptor', ability: 'reckless', moves: ['cobblemon:bravebird']});
      const withIntimidate = await received(physical);
      const plain = individual('gyarados', 30, ['waterfall']);
      plain.observed.ability = 'cobblemon:moxie';
      const noIntimidate = (
        await customPlan([physical], {
          snapshot: {individuals: [plain]},
          team: [{uuid: plain.uuid, moveIds: ['cobblemon:waterfall'], itemId: null}],
        })
      ).entries[0].received.max;
      expect(withIntimidate).toBeLessThan(noIntimidate);
    });
  });

  it('o lead é o respondedor do primeiro adversário; com ele bloqueado, não há lead', async () => {
    const planned = await customPlan([opponent({speciesId: 'cobblemon:staraptor', ability: 'intimidate'}), opponent({})]);
    expect(planned.lead.uuid).toBe(planned.entries[0].responder.uuid);
    expect(planned.lead.reason).toContain('abre contra o primeiro adversário');

    const blockedFirst = await customPlan([opponent({nature: 'cobblemon:xyz'}), opponent({})]);
    expect(blockedFirst.entries[0].status).toBe('bloqueado');
    expect(blockedFirst.entries[1].status).toBe('planejado');
    expect(blockedFirst.lead).toBeNull();
  });

  describe('simulação da batalha inteira', () => {
    const hitOf = (damage) => Math.floor((damage.min + damage.max) / 2);

    it('carrega o HP do membro de um adversário ao próximo e conta o dano como a média dos rolls', async () => {
      const result = await plan('synthetic:brock');
      const {simulation} = result;
      expect(simulation.status).toBe('concluída');
      expect(simulation.opponentsDefeated).toBe(3);
      expect(simulation.opponentsTotal).toBe(3);
      const [first, second] = simulation.steps;
      expect(first).toMatchObject({
        entry: 'lead',
        memberUuid: blastoise.uuid,
        memberHpBefore: first.memberMaxHp,
        outcome: 'adversário derrotado',
      });
      // O membro é mais rápido: age primeiro e o adversário só acerta nos turnos em que sobrevive.
      expect(first.memberHpBefore - first.memberHpAfter).toBe((first.turns - 1) * hitOf(result.entries[0].received));
      expect(first.memberHpBefore - first.memberHpAfter).toBeGreaterThan(0);
      expect(second.memberHpBefore).toBe(first.memberHpAfter);
      expect(simulation.remaining.find((member) => member.uuid === blastoise.uuid).hp).toBe(simulation.steps.at(-1).memberHpAfter);
    });

    it('Sturdy em HP cheio segura o primeiro golpe letal e custa um turno', async () => {
      const turnsAgainst = async (ability) => {
        const result = await customPlan([opponent({ability, level: 13})], {team: [team[0]]});
        return result.simulation.steps[0].turns;
      };
      expect(await turnsAgainst('rockhead')).toBe(1);
      expect(await turnsAgainst('sturdy')).toBe(2);
    });

    it('um time que não derruba o primeiro adversário termina derrotado', async () => {
      const fragile = individual('pikachu', 5, ['thunderbolt']);
      const result = await buildBattlePlan({
        snapshot: {individuals: [fragile]},
        request: {
          sources: [],
          trainerId: 'synthetic:brock',
          team: [{uuid: fragile.uuid, moveIds: ['cobblemon:thunderbolt'], itemId: null}],
        },
        data,
      });
      expect(result.simulation.status).toBe('time derrotado');
      expect(result.simulation.opponentsDefeated).toBe(0);
      expect(result.simulation.remaining).toEqual([]);
      expect(result.simulation.steps.at(-1).outcome).toBe('membro derrotado');
    });

    it('adversário bloqueado interrompe a simulação e diz qual', async () => {
      const result = await customPlan([opponent({nature: 'cobblemon:xyz'}), opponent({})]);
      expect(result.simulation.status).toBe('interrompida');
      expect(result.simulation.stopReason).toMatch(/^adversário 1 \(Geodude\) bloqueado: natureza/);
      expect(result.simulation.steps).toEqual([]);
    });

    it('troca para quem derruba o adversário seguinte, que acerta primeiro o membro que entra', async () => {
      const quick = individual('pikachu', 30, ['thunderbolt']);
      const tank = individual('blastoise', 30, ['surf']);
      const result = await customPlan(
        [opponent({speciesId: 'cobblemon:gyarados', level: 30, moves: ['cobblemon:tackle'], ability: 'moxie'}), opponent({level: 30})],
        {
          snapshot: {individuals: [quick, tank]},
          team: [
            {uuid: quick.uuid, moveIds: ['cobblemon:thunderbolt'], itemId: null},
            {uuid: tank.uuid, moveIds: ['cobblemon:surf'], itemId: null},
          ],
        },
      );
      const {steps} = result.simulation;
      expect(steps[0]).toMatchObject({entry: 'lead', memberUuid: quick.uuid});
      const swap = steps.find((step) => step.entry === 'troca');
      expect(swap).toMatchObject({opponentIndex: 1, memberUuid: tank.uuid, memberHpBefore: swap.memberMaxHp});
      expect(swap.memberHpAfter).toBeLessThan(swap.memberHpBefore);
      expect(swap.outcome).toBe('adversário derrotado');
    });

    it('após KO entra o próximo membro sem acerto grátis e o adversário mantém o HP que ficou', async () => {
      const result = await customPlan(
        [opponent({speciesId: 'cobblemon:gyarados', level: 70, ability: 'moxie', moves: ['cobblemon:waterfall', 'cobblemon:earthquake']})],
        {
          snapshot: {individuals: [blastoise, pikachu]},
          team: [team[0], team[1]],
        },
      );
      const {steps} = result.simulation;
      const replacement = steps.find((step) => step.entry === 'após KO');
      expect(replacement).toBeDefined();
      const previous = steps[steps.indexOf(replacement) - 1];
      expect(previous.outcome).toBe('membro derrotado');
      expect(replacement.opponentHpBefore).toBe(previous.opponentHpAfter);
      expect(replacement.memberHpBefore).toBe(replacement.memberMaxHp);
    });

    it('treinador em dupla não tem simulação', async () => {
      expect((await plan('synthetic:duo')).simulation).toBeNull();
    });
  });

  it('treinador em dupla é fora do escopo: mensagem, sem entradas e sem ninguém para abrir a batalha', async () => {
    const result = await plan('synthetic:duo');
    expect(result).toMatchObject({status: 'fora-do-escopo', scopeReason: 'batalha em dupla, fora do escopo', entries: [], lead: null});
  });

  it('sugere um lead entre os membros do time e declara as hipóteses junto do plano', async () => {
    const result = await plan('synthetic:brock');
    expect(team.map((member) => member.uuid)).toContain(result.lead.uuid);
    expect(result.lead.reason).toContain('abre contra o primeiro adversário');
    expect(result.assumptions.join(' ')).toContain('HP e PP cheios');
    expect(result.assumptions.join(' ')).toContain('não verifica se você tem os itens');
    expect(result.limits.join(' ')).toContain('IA do RCT');
  });

  it('level cap: membro acima do cap não entra no plano; sem cap, avisa; sem ninguém dentro do cap, recusa', async () => {
    const high = individual('venusaur', 75, ['tackle']);
    const mixed = {individuals: [blastoise, pikachu, high]};
    const withHigh = [...team, {uuid: high.uuid, moveIds: ['cobblemon:tackle'], itemId: null}];
    const capped = await buildBattlePlan({
      snapshot: mixed,
      request: {sources: [], trainerId: 'synthetic:brock', team: withHigh, levelCap: 55},
      data,
    });
    const responders = capped.entries.filter((entry) => entry.responder).map((entry) => entry.responder.uuid);
    expect(responders).not.toContain(high.uuid);
    expect(capped.assumptions.join(' ')).toContain('Venusaur (nível 75) ficou fora do plano por estar acima do level cap (55)');
    expect(capped.lead.uuid).not.toBe(high.uuid);

    const noCap = await buildBattlePlan({snapshot: mixed, request: {sources: [], trainerId: 'synthetic:brock', team: withHigh}, data});
    expect(noCap.assumptions.join(' ')).toContain('O level cap não foi informado e não foi considerado');

    const ignored = await buildBattlePlan({
      snapshot: mixed,
      request: {sources: [], trainerId: 'synthetic:brock', team: withHigh, levelCap: 55, respectLevelCap: false},
      data,
    });
    expect(ignored.overCap.map((item) => item.uuid)).toEqual([high.uuid]);
    expect(ignored.assumptions.join(' ')).toContain('ignorado a seu pedido');

    await expect(
      buildBattlePlan({snapshot: mixed, request: {sources: [], trainerId: 'synthetic:brock', team: [withHigh[2]], levelCap: 55}, data}),
    ).rejects.toThrow('nenhum membro do time está dentro do level cap (55)');
  });

  it('nenhum texto promete vitória', async () => {
    for (const trainerId of ['synthetic:brock', 'synthetic:surge']) {
      const text = JSON.stringify(await plan(trainerId));
      expect(text).not.toMatch(/garant|vit[óo]ria|vence|certeza/i);
    }
  });

  it('recusa pedido inválido: treinador desconhecido, time vazio, membro fora do snapshot ou sem golpes do catálogo', async () => {
    await expect(plan('synthetic:nao-existe')).rejects.toThrow('não encontrado');
    await expect(plan('synthetic:brock', {team: []})).rejects.toThrow('de 1 a 6 membros');
    await expect(plan('synthetic:brock', {team: [{uuid: 'x', moveIds: ['cobblemon:surf'], itemId: null}]})).rejects.toThrow(
      'não está no snapshot',
    );
    await expect(
      plan('synthetic:brock', {team: [{uuid: blastoise.uuid, moveIds: ['cobblemon:nao_existe'], itemId: null}]}),
    ).rejects.toThrow('não tem golpes do catálogo');
    await expect(plan('synthetic:brock', {team: [team[0], team[0]]})).rejects.toThrow('repetido');
  });

  it('o item do time entra no cálculo e o cancelamento no checkpoint interrompe o plano', async () => {
    const bare = await plan('synthetic:brock');
    const scarf = await plan('synthetic:brock', {team: [{...team[0], itemId: 'cobblemon:choice_specs'}, team[1]]});
    expect(scarf.entries[0].dealt.max).toBeGreaterThan(bare.entries[0].dealt.max);
    const checkpoint = async () => {
      throw Object.assign(new Error('cancelado'), {code: 'CANCELLED'});
    };
    await expect(
      buildBattlePlan({snapshot, request: {sources: [], trainerId: 'synthetic:brock', team}, data, checkpoint}),
    ).rejects.toMatchObject({code: 'CANCELLED'});
  });
});
