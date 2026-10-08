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

  it('forma alternativa (como Geodude de Alola) é planejada com cálculo real e sem bloqueio', async () => {
    const result = await plan('synthetic:brock');
    const alolan = result.entries[2];
    expect(alolan.status).toBe('planejado');
    expect(alolan.responder).toBeTruthy();
    expect(alolan.dealt.max).toBeGreaterThan(0);
    expect(alolan.received.targetHP).toBeGreaterThan(0);
    expect(result.entries.filter((entry) => entry.status === 'planejado')).toHaveLength(3);
  });

  it('heldItem com várias alternativas não escolhe item; Mega/Z vira risco sem bloquear', async () => {
    const result = await plan('synthetic:surge');
    const raichu = result.entries[0];
    expect(raichu.heldItemAlternatives).toEqual(['mega_showdown:manectite', 'cobblemon:expert_belt']);
    expect(raichu.status).toBe('planejado');
    expect(raichu.risks.some((risk) => risk.text.includes('Mega Evolução ou Cristal Z'))).toBe(true);

    const pika = result.entries[1];
    expect(pika.status).toBe('planejado');
    expect(pika.heldItemAlternatives).toEqual(['cobblemon:expert_belt', 'cobblemon:life_orb']);
    expect(pika.risks.map((risk) => risk.text).join(' ')).toContain('Expert Belt ou Life Orb');
  });

  it('terreno de habilidade ativa o campo e dano real sem bloquear; imunidade vira risco', async () => {
    const result = await plan('synthetic:surge');
    const surgeVoltorb = result.entries[2];
    expect(surgeVoltorb.status).toBe('planejado');
    expect(surgeVoltorb.risks.some((risk) => risk.text.includes('Terreno Elétrico'))).toBe(true);
    expect(surgeVoltorb.dealt.max).toBeGreaterThan(0);

    const absorb = result.entries[3];
    expect(absorb.status).toBe('planejado');
    expect(absorb.dealt.max).toBeGreaterThan(0);
    const immune = await plan('synthetic:surge', {team: [{...team[1], moveIds: ['cobblemon:thunderbolt']}]});
    expect(immune.entries[3].dealt).toMatchObject({moveId: 'cobblemon:thunderbolt', min: 0, max: 0});
    expect(immune.entries[3].risks).toContainEqual({kind: 'habilidade', text: 'Voltorb anula golpes do tipo Electric com Voltabsorb.'});
  });

  it('habilidade Intimidate reduz Ataque e gera risco sem bloquear o confronto', async () => {
    const staraptorOpponent = {
      id: 'synthetic:custom',
      name: 'Custom',
      format: 'singles',
      team: [
        {
          speciesId: 'cobblemon:staraptor',
          level: 30,
          moves: ['cobblemon:brave_bird', 'cobblemon:close_combat'],
          ability: 'intimidate',
          nature: 'jolly',
          heldItem: [],
          ivs: {},
          evs: {},
          aspects: [],
        },
      ],
    };
    const customData = {trainers: [staraptorOpponent]};
    const result = await buildBattlePlan({snapshot, request: {sources: [], trainerId: 'synthetic:custom', team}, data: customData});
    expect(result.entries[0].status).toBe('planejado');
    expect(result.entries[0].risks.some((r) => r.text.includes('Intimidate'))).toBe(true);
    expect(result.lead.uuid).toBe(result.entries[0].responder.uuid);
  });

  it('treinador em dupla é fora do escopo: mensagem, sem entradas e sem lead', async () => {
    const result = await plan('synthetic:duo');
    expect(result).toMatchObject({status: 'fora-do-escopo', scopeReason: 'batalha em dupla, fora do escopo', entries: [], lead: null});
  });

  it('sugere um lead entre os membros do time e declara as hipóteses junto do plano', async () => {
    const result = await plan('synthetic:brock');
    expect(team.map((member) => member.uuid)).toContain(result.lead.uuid);
    expect(result.lead.reason).toContain('abre porque');
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
