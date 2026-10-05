import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildEvolutionPlan} = require('../electron/lib/guide/evolution-plan.cjs');
const data = require('./fixtures/guide-evolutions.json');

let counter = 0;
function individual(species, level, {formId = 'normal', nature = 'cobblemon:hardy', moves = [], movesKnown = true} = {}) {
  counter += 1;
  return {
    uuid: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    speciesId: `cobblemon:${species}`,
    formId,
    level,
    location: {container: 'party', slot: counter},
    equippedMoves: moves.map((id) => ({id: `cobblemon:${id}`, pp: 10, ppUps: 0})),
    equippedMovesKnown: movesKnown,
    learnedMoves: [],
    learnedMovesKnown: movesKnown,
    observed: {nature, ability: 'cobblemon:x', heldItem: null},
  };
}

const run = (members, {levelCap = 40, useful = []} = {}) =>
  buildEvolutionPlan({
    snapshot: {individuals: members},
    request: {sources: [], team: members.map((member) => ({uuid: member.uuid, usefulMoveIds: useful})), levelCap},
    data,
  });
const first = (result) => result.members[0];

describe('plano de evoluções do time', () => {
  it('mostra a próxima evolução, o requisito de nível e se cabe no cap', async () => {
    const geodude = individual('geodude', 20);
    const withinCap = first(await run([geodude], {levelCap: 30}));
    expect(withinCap).toMatchObject({status: 'evolui', blockedReason: null});
    expect(withinCap.options[0]).toMatchObject({
      toSpeciesId: 'cobblemon:graveler',
      method: 'level_up',
      requirements: [{kind: 'nível', text: 'nível 25', status: 'pendente'}],
      withinCap: true,
      reachText: 'nível 25 cabe no cap 30',
    });
    const aboveCap = first(await run([geodude], {levelCap: 20}));
    expect(aboveCap.options[0]).toMatchObject({withinCap: false, reachText: 'exige nível 25, acima do cap 20'});
  });

  it('nível já atingido marca o requisito como cumprido; cap desconhecido deixa o alcance não verificado', async () => {
    const ready = first(await run([individual('geodude', 27)], {levelCap: 30}));
    expect(ready.options[0].requirements[0].status).toBe('cumprido');
    expect(ready.options[0].reachText).toBe('nível 25 já atingido e dentro do cap 30');
    const unknownCap = first(await run([individual('geodude', 20)], {levelCap: null}));
    expect(unknownCap.options[0]).toMatchObject({withinCap: null, reachText: 'o app não conhece o level cap; alcance não verificado'});
  });

  it('amizade, horário, item, troca e bioma nunca saem como cumpridos', async () => {
    const result = await run([individual('eevee', 50), individual('scyther', 50), individual('pikachu', 50), individual('graveler', 50)]);
    const [eevee, scyther, pikachu, graveler] = result.members;
    const espeon = eevee.options.find((option) => option.toSpeciesId === 'cobblemon:espeon');
    expect(espeon.requirements).toEqual([
      {kind: 'amizade', text: 'amizade 160 ou mais', status: 'não verificado'},
      {kind: 'horário', text: 'horário: day', status: 'não verificado'},
    ]);
    expect(eevee.options.find((option) => option.toSpeciesId === 'cobblemon:vaporeon').requirements).toEqual([
      {kind: 'item', text: 'usar Water Stone', status: 'não verificado'},
    ]);
    expect(scyther.options[0].requirements).toEqual([
      {kind: 'troca', text: 'troca com outro jogador', status: 'não verificado'},
      {kind: 'item', text: 'segurando Metal Coat', status: 'não verificado'},
    ]);
    expect(graveler.options[0].requirements).toEqual([{kind: 'troca', text: 'troca com outro jogador', status: 'não verificado'}]);
    expect(pikachu.options.map((option) => option.requirements.map((requirement) => requirement.text))).toEqual([
      ['usar Thunder Stone', 'fora do bioma: Pikachu Alolabiome'],
      ['usar Thunder Stone', 'no bioma: Pikachu Alolabiome'],
    ]);
    const statuses = result.members.flatMap((member) =>
      member.options.flatMap((option) => option.requirements.map((requirement) => requirement.status)),
    );
    expect(statuses).not.toContain('cumprido');
    expect(first(result).options.every((option) => option.withinCap === null)).toBe(true);
  });

  it('gênero e propriedades sem dado capturado ficam não verificados', async () => {
    const [requirements] = first(await run([individual('kirlia', 40)])).options.map((option) => option.requirements);
    expect(requirements).toEqual([
      {kind: 'item', text: 'usar Dawn Stone', status: 'não verificado'},
      {kind: 'outro', text: 'gênero: male', status: 'não verificado'},
    ]);
  });

  it('golpe conhecido cumpre o requisito de golpe; sem lista de golpes capturada fica não verificado', async () => {
    const fairy = first(await run([individual('eevee', 50, {moves: ['moonblast']})]));
    const sylveon = (member) => member.options.find((option) => option.toSpeciesId === 'cobblemon:sylveon').requirements[1];
    expect(sylveon(fairy)).toEqual({kind: 'golpe', text: 'conhecer um golpe do tipo Fairy', status: 'cumprido'});
    expect(sylveon(first(await run([individual('eevee', 50, {moves: ['tackle']})])))).toMatchObject({status: 'pendente'});
    expect(sylveon(first(await run([individual('eevee', 50, {moves: [], movesKnown: false})])))).toMatchObject({status: 'não verificado'});
  });

  it('natureza capturada escolhe a variante certa; as outras variantes não aparecem', async () => {
    const hardy = first(await run([individual('toxel', 35, {nature: 'cobblemon:hardy'})]));
    expect(hardy.options).toHaveLength(1);
    expect(hardy.options[0].requirements).toEqual([
      {kind: 'nível', text: 'nível 30', status: 'cumprido'},
      {kind: 'natureza', text: 'natureza Hardy', status: 'cumprido'},
    ]);
    const unknown = first(await run([individual('toxel', 35, {nature: null})]));
    expect(unknown.options).toHaveLength(2);
    expect(unknown.options.every((option) => option.requirements[1].status === 'não verificado')).toBe(true);
    const other = first(await run([individual('toxel', 35, {nature: 'cobblemon:timid'})]));
    expect(other).toMatchObject({status: 'sem-evolução', options: []});
  });

  it('mostra golpes atrasados, perdidos e adiantados, marcando os úteis para o objetivo', async () => {
    const result = await run([individual('geodude', 20)], {useful: ['cobblemon:rockslide']});
    const changes = first(result).options[0].moveChanges;
    expect(changes).toEqual(
      [
        {
          moveId: 'cobblemon:rockslide',
          useful: true,
          kind: 'atrasado',
          levelWithoutEvolving: 30,
          levelAfterEvolving: 36,
          note: 'aprende Rock Slide no nível 30 sem evoluir; evoluído, só no 36',
        },
        {
          moveId: 'cobblemon:earthquake',
          useful: false,
          kind: 'adiantado',
          levelWithoutEvolving: 34,
          levelAfterEvolving: 28,
          note: 'aprende Earthquake no nível 34 sem evoluir; evoluído, já no 28',
        },
        {
          moveId: 'cobblemon:stoneedge',
          useful: false,
          kind: 'atrasado',
          levelWithoutEvolving: 40,
          levelAfterEvolving: 38,
          note: expect.any(String),
        },
      ].map((change) =>
        change.moveId === 'cobblemon:stoneedge'
          ? {...change, kind: 'adiantado', note: 'aprende Stone Edge no nível 40 sem evoluir; evoluído, já no 38'}
          : change,
      ),
    );
  });

  it('golpe que a evolução não aprende por nível aparece como perdido e só conta o que ainda não foi aprendido', async () => {
    const lost = {
      ...data,
      learnsets: {
        geodude: {
          levelUp: [
            {level: 33, moveId: 'cobblemon:rockslide'},
            {level: 5, moveId: 'cobblemon:tackle'},
          ],
        },
        graveler: {levelUp: []},
      },
    };
    const member = individual('geodude', 20);
    const result = await buildEvolutionPlan({
      snapshot: {individuals: [member]},
      request: {sources: [], team: [{uuid: member.uuid, usefulMoveIds: []}], levelCap: 40},
      data: lost,
    });
    expect(first(result).options[0].moveChanges).toEqual([
      expect.objectContaining({
        moveId: 'cobblemon:rockslide',
        kind: 'perdido',
        levelAfterEvolving: null,
        note: 'aprende Rock Slide no nível 33 sem evoluir; evoluído, não aprende por nível',
      }),
    ]);
  });

  it('forma desconhecida ou regional bloqueia a sugestão com o motivo; espécie sem evolução é sem-evolução', async () => {
    const result = await run([
      individual('geodude', 20, {formId: 'unknown'}),
      individual('geodude', 20, {formId: 'alola'}),
      individual('golem', 60),
      individual('nao_existe', 20),
    ]);
    expect(result.members.map((member) => [member.status, member.blockedReason])).toEqual([
      ['bloqueado', 'forma desconhecida: não dá para saber quais evoluções valem'],
      ['bloqueado', 'evoluções da forma alola não estão nos dados (só a forma normal)'],
      ['sem-evolução', null],
      ['bloqueado', 'espécie sem dados de evolução'],
    ]);
    expect(result.members.every((member) => member.status === 'sem-evolução' || member.options.length === 0)).toBe(true);
  });

  it('recusa pedido inválido e declara hipóteses e limites', async () => {
    const member = individual('geodude', 20);
    const request = (patch) => ({
      snapshot: {individuals: [member]},
      request: {sources: [], team: [{uuid: member.uuid, usefulMoveIds: []}], levelCap: 40, ...patch},
      data,
    });
    await expect(buildEvolutionPlan(request({team: []}))).rejects.toThrow('de 1 a 6 membros');
    await expect(buildEvolutionPlan(request({team: [{uuid: 'x', usefulMoveIds: []}]}))).rejects.toThrow('não está no snapshot');
    await expect(buildEvolutionPlan(request({levelCap: 101}))).rejects.toThrow('levelCap');
    const result = await buildEvolutionPlan(request({}));
    expect(result.assumptions.join(' ')).toContain('não lê inventário');
    expect(result.limits.join(' ')).toContain('não vêm do save');
  });
});
