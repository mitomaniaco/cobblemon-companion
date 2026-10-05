import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildTrainingPlan} = require('../electron/lib/guide/training-plan.cjs');
const {COMPATIBILITY} = require('../electron/lib/real-damage.cjs');
const data = require('./fixtures/guide-training.json');

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const known = (value) => ({state: 'known', value, provenance: {}});
const unknown = {state: 'unknown', reason: 'not-captured', provenance: {}};
let counter = 0;

function individual(species, level, moves, evs = 0) {
  counter += 1;
  const speciesId = `cobblemon:${species}`;
  const evFacts = Object.fromEntries(STATS.map((stat) => [stat, typeof evs === 'object' ? evs[stat] : known(evs)]));
  return {
    uuid: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    speciesId,
    formId: 'normal',
    level,
    location: {container: 'party', slot: counter},
    equippedMoves: moves.map((id) => ({id: `cobblemon:${id}`, pp: 10, ppUps: 0})),
    equippedMovesKnown: true,
    learnedMoves: [],
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:modest', ability: COMPATIBILITY.species[speciesId].abilities[0], heldItem: null},
    battleStats: {evs: evFacts},
  };
}

const run = (members, {levelCap = 40, capOrigin = levelCap === null ? 'desconhecida' : 'informado', useful = []} = {}) =>
  buildTrainingPlan({
    snapshot: {individuals: members},
    request: {sources: [], team: members.map((member) => ({uuid: member.uuid, usefulMoveIds: useful})), levelCap, capOrigin},
    data,
  });

describe('plano de treino até o level cap', () => {
  it('mostra nível atual, cap, origem e os golpes por nível até o cap, marcando os úteis', async () => {
    const result = await run([individual('blastoise', 20, ['surf'])], {levelCap: 30, useful: ['cobblemon:icebeam']});
    const [member] = result.members;
    expect(member).toMatchObject({
      level: 20,
      levelCap: 30,
      capOrigin: 'informado',
      targetLevel: 30,
      targetNote: 'subir do nível 20 até o cap 30 (informado)',
    });
    // Hydro Pump (40) passa do cap; golpe fora do catálogo não útil é omitido; nível 1 já foi aprendido.
    expect(member.moves).toEqual([
      {moveId: 'cobblemon:surf', level: 25, useful: false},
      {moveId: 'cobblemon:icebeam', level: 30, useful: true},
    ]);
  });

  it('nunca sugere nível acima do cap: quem já está no cap ou acima fica onde está', async () => {
    const [atCap, above] = (await run([individual('blastoise', 30, ['surf']), individual('gardevoir', 35, ['psychic'])], {levelCap: 30}))
      .members;
    expect(atCap).toMatchObject({targetLevel: 30, moves: [], targetNote: 'já no cap 30; não suba mais'});
    expect(above).toMatchObject({targetLevel: 35, moves: []});
    const below = (await run([individual('blastoise', 10, ['surf'])], {levelCap: 30})).members[0];
    expect(below.targetLevel).toBeLessThanOrEqual(30);
  });

  it('cap desconhecido mostra "cap não determinado" e não calcula nível-alvo nem golpes', async () => {
    const [member] = (await run([individual('blastoise', 20, ['surf'])], {levelCap: null})).members;
    expect(member).toMatchObject({
      levelCap: null,
      capOrigin: 'desconhecida',
      targetLevel: null,
      targetNote: 'cap não determinado',
      moves: [],
    });
  });

  it('EVs respeitam o papel, 252 por atributo e 510 no total', async () => {
    const special = individual('gardevoir', 20, ['psychic']);
    const physicalFast = individual('blastoise', 20, ['surf']);
    const result = await run([special, physicalFast]);
    const [gardevoir] = result.members;
    expect(gardevoir.evs).toMatchObject({role: 'atacante-especial', status: 'sugerido', suggestedEvs: {spa: 252, spe: 252, hp: 6}});
    for (const member of result.members) {
      const values = Object.values(member.evs.suggestedEvs);
      expect(Math.max(...values)).toBeLessThanOrEqual(252);
      expect(values.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(510);
    }
    expect(gardevoir.evs.reason).toContain('evYield');
    expect(gardevoir.evs.sources).toEqual([]);
  });

  it('EV desconhecido não vira zero: o plano de EVs fica não-determinado, sem distribuição', async () => {
    const partial = individual('gardevoir', 20, ['psychic'], {
      hp: known(0),
      atk: known(0),
      def: known(0),
      spa: unknown,
      spd: known(0),
      spe: known(0),
    });
    const [member] = (await run([partial])).members;
    expect(member.evs).toMatchObject({status: 'não-determinado', suggestedEvs: {}, sources: []});
    expect(member.evs.currentEvs).toEqual({hp: 0, atk: 0, def: 0, spa: null, spd: 0, spe: 0});
    expect(member.evs.reason).toContain('desconhecido não vira zero');
  });

  it('EVs já atingidos são reconhecidos e o papel de resistência sugere HP e defesa', async () => {
    const done = individual('gardevoir', 20, ['psychic'], {
      hp: known(6),
      atk: known(0),
      def: known(0),
      spa: known(252),
      spd: known(0),
      spe: known(252),
    });
    expect((await run([done])).members[0].evs.reason).toContain('EVs já atingem a sugestão');
    const tank = individual('chansey', 20, ['tackle']);
    const evs = (await run([tank])).members[0].evs;
    expect(evs.role).toBe('resistência');
    expect(evs.suggestedEvs.hp).toBe(252);
  });

  it('recusa pedido inválido e declara hipóteses e limites', async () => {
    const member = individual('blastoise', 20, ['surf']);
    const request = (patch) => ({
      snapshot: {individuals: [member]},
      request: {sources: [], team: [{uuid: member.uuid, usefulMoveIds: []}], levelCap: 30, capOrigin: 'informado', ...patch},
      data,
    });
    await expect(buildTrainingPlan(request({team: []}))).rejects.toThrow('de 1 a 6 membros');
    await expect(buildTrainingPlan(request({team: [{uuid: 'x', usefulMoveIds: []}]}))).rejects.toThrow('não está no snapshot');
    await expect(buildTrainingPlan(request({levelCap: 101}))).rejects.toThrow('levelCap');
    await expect(buildTrainingPlan(request({capOrigin: 'desconhecida'}))).rejects.toThrow('não combinam');
    const result = await buildTrainingPlan(request({}));
    expect(result.limits.join(' ')).toContain('Não lê inventário');
    expect(result.assumptions.join(' ')).toContain('252 por atributo');
  });
});
