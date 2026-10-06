'use strict';

const {buildBattlePlan} = require('./lib/guide/battle-plan.cjs');
const {buildCapturePlan} = require('./lib/guide/capture-plan.cjs');
const {buildEvolutionPlan} = require('./lib/guide/evolution-plan.cjs');
const {buildGuide} = require('./lib/guide/engine.cjs');
const {buildTrainingPlan} = require('./lib/guide/training-plan.cjs');
const {loadGuideData, loadSpawnData} = require('./lib/guide/data.cjs');

const cancelled = new Set();
let running = null;

function post(message) {
  try {
    process.parentPort.postMessage(message);
  } catch {
    /* o processo principal já está encerrando */
  }
}

// Cede o laço de eventos entre indivíduos para que a mensagem de cancelamento seja processada.
async function checkpoint(jobId) {
  await new Promise((resolve) => setImmediate(resolve));
  if (cancelled.has(jobId)) throw Object.assign(new Error('cancelado'), {code: 'CANCELLED'});
}

async function run(message) {
  const {jobId, snapshot, goal, levelCap, respectLevelCap, request, task} = message;
  running = jobId;
  try {
    const input = {snapshot, data: loadGuideData(), checkpoint: () => checkpoint(jobId)};
    let result;
    if (task === 'battle-plan') result = await buildBattlePlan({...input, request});
    else if (task === 'evolution-plan') result = await buildEvolutionPlan({...input, request});
    else if (task === 'training-plan') result = await buildTrainingPlan({...input, request});
    else if (task === 'capture-plan') result = await buildCapturePlan({...input, data: {...input.data, spawns: loadSpawnData()}, request});
    else result = await buildGuide({...input, goal, levelCap: levelCap ?? null, respectLevelCap: respectLevelCap !== false});
    post({type: 'result', jobId, result});
  } catch (error) {
    if (error?.code === 'CANCELLED') post({type: 'cancelled', jobId});
    else post({type: 'failed', jobId, error: String(error?.message || error)});
  } finally {
    cancelled.delete(jobId);
    running = null;
  }
}

process.parentPort.on('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || typeof message.jobId !== 'string') return;
  if (message.type === 'run') void run(message);
  else if (message.type === 'cancel' && running === message.jobId) cancelled.add(message.jobId);
});
