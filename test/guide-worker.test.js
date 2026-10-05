import {createRequire} from 'node:module';
import {afterAll, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const data = require('./fixtures/guide-data.json');

// O worker roda em utilityProcess do Electron: aqui `process.parentPort` é substituído por um canal em memória.
const sent = [];
let deliver;
process.parentPort = {on: (_event, listener) => (deliver = listener), postMessage: (message) => sent.push(message)};
// O worker carrega os dados pelo módulo CommonJS; os fixtures sintéticos entram no lugar dos arquivos grandes.
const dataModulePath = require.resolve('../electron/lib/guide/data.cjs');
require.cache[dataModulePath] = {
  id: dataModulePath,
  filename: dataModulePath,
  loaded: true,
  exports: {...require(dataModulePath), loadGuideData: () => data},
};
require('../electron/guide-worker.cjs');

afterAll(() => {
  delete process.parentPort;
});

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const facts = (value) => Object.fromEntries(STATS.map((stat) => [stat, {state: 'known', value, provenance: {}}]));
const snapshot = {
  individuals: [
    {
      uuid: 'u-1',
      speciesId: 'cobblemon:blastoise',
      formId: 'normal',
      level: 40,
      location: {container: 'party', slot: 1},
      equippedMoves: [{id: 'cobblemon:surf', pp: 1, ppUps: 0}],
      equippedMovesKnown: true,
      learnedMoves: [],
      learnedMovesKnown: true,
      observed: {nature: 'cobblemon:modest', ability: 'cobblemon:torrent', heldItem: null},
      battleStats: {ivs: facts(31), hyperTrainedIvs: facts(null), evs: facts(0)},
    },
  ],
};
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('guide-worker', () => {
  it('responde run com o resultado do motor', async () => {
    deliver({data: {type: 'run', jobId: 'job-ok', snapshot, goal: {kind: 'trainer', trainerId: 'synthetic:fire'}}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-ok'));
    const message = sent.find((candidate) => candidate.jobId === 'job-ok');
    expect(message.type).toBe('result');
    expect(message.result.team).toHaveLength(1);
  });

  it('responde failed com a mensagem quando o motor recusa (dupla)', async () => {
    deliver({data: {type: 'run', jobId: 'job-duo', snapshot, goal: {kind: 'trainer', trainerId: 'synthetic:duo'}}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-duo'));
    expect(sent.find((candidate) => candidate.jobId === 'job-duo')).toEqual({
      type: 'failed',
      jobId: 'job-duo',
      error: 'formato duplas não suportado',
    });
  });

  it('task battle-plan monta o plano do treinador com o time pedido', async () => {
    const request = {sources: [], trainerId: 'synthetic:fire', team: [{uuid: 'u-1', moveIds: ['cobblemon:surf'], itemId: null}]};
    deliver({data: {type: 'run', task: 'battle-plan', jobId: 'job-plan', snapshot, request}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-plan'));
    const message = sent.find((candidate) => candidate.jobId === 'job-plan');
    expect(message.type).toBe('result');
    expect(message.result).toMatchObject({
      status: 'plano',
      entries: [expect.objectContaining({responder: expect.objectContaining({uuid: 'u-1'})})],
    });
  });

  it('task evolution-plan devolve o plano de evoluções do time', async () => {
    const request = {sources: [], team: [{uuid: 'u-1', usefulMoveIds: []}], levelCap: null};
    deliver({data: {type: 'run', task: 'evolution-plan', jobId: 'job-evo', snapshot, request}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-evo'));
    const message = sent.find((candidate) => candidate.jobId === 'job-evo');
    expect(message.type).toBe('result');
    expect(message.result.members[0]).toMatchObject({uuid: 'u-1', status: 'sem-evolução'});
  });

  it('task capture-plan devolve o plano de capturas (dados de spawn reais)', async () => {
    const request = {
      sources: [],
      goal: {kind: 'trainer', trainerId: 'synthetic:fire'},
      teamUuids: [],
      gapOpponentIds: ['synthetic:fire#0'],
    };
    deliver({data: {type: 'run', task: 'capture-plan', jobId: 'job-capture', snapshot, request}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-capture'));
    const message = sent.find((candidate) => candidate.jobId === 'job-capture');
    expect(message.type).toBe('result');
    expect(message.result.gaps).toHaveLength(1);
  });

  it('task training-plan devolve o plano de treino do time', async () => {
    const request = {sources: [], team: [{uuid: 'u-1', usefulMoveIds: []}], levelCap: 50, capOrigin: 'informado'};
    deliver({data: {type: 'run', task: 'training-plan', jobId: 'job-train', snapshot, request}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-train'));
    const message = sent.find((candidate) => candidate.jobId === 'job-train');
    expect(message.type).toBe('result');
    expect(message.result.members[0]).toMatchObject({uuid: 'u-1', targetLevel: 50});
  });

  it('cancel durante a montagem responde cancelled e não devolve resultado', async () => {
    deliver({data: {type: 'run', jobId: 'job-cancel', snapshot, goal: {kind: 'trainer', trainerId: 'synthetic:fire'}}});
    deliver({data: {type: 'cancel', jobId: 'job-cancel'}});
    await waitFor(() => sent.some((message) => message.jobId === 'job-cancel'));
    expect(sent.filter((message) => message.jobId === 'job-cancel')).toEqual([{type: 'cancelled', jobId: 'job-cancel'}]);
  });
});
