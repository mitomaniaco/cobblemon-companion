'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, dialog, ipcMain, protocol, utilityProcess} = require('electron');

const ROOT = path.resolve(__dirname, '../..');
const RENDERER_DIR = path.resolve(__dirname, '../dist/renderer');
const TRAINER_UI_TEST_MODE = process.env.COMPANION_TRAINER_UI_TEST_MODE === '1';
const RUNTIME_TEST_MODE = process.env.COMPANION_RUNTIME_TEST_MODE === '1';
const PRELOAD_PATH = TRAINER_UI_TEST_MODE
  ? path.resolve(__dirname, '../test/electron-trainer-ui-preload.cjs')
  : path.resolve(__dirname, 'preload.cjs');
const WORKER_PATH = path.resolve(__dirname, 'worker.cjs');
const PLAYER_IMPORT_PATH = path.resolve(__dirname, 'player-import.cjs');
const TRAINER_UI_SNAPSHOT_PATH = path.resolve(__dirname, '../test/fixtures/electron-trainer-ui-snapshot.json');
const TRAINER_UI_GUIDE_PATH = path.resolve(__dirname, '../test/fixtures/electron-trainer-ui-guide.json');
const TRAINER_UI_GUIDE = TRAINER_UI_TEST_MODE ? JSON.parse(fs.readFileSync(TRAINER_UI_GUIDE_PATH, 'utf8')) : null;
// Manifesto de artwork sintético: só o modo de teste da UI o lê; produção nunca carrega fixture.
const TRAINER_UI_ARTWORK_PATH = path.resolve(__dirname, '../test/fixtures/electron-trainer-ui-artwork.json');
const TRAINER_UI_ARTWORK = TRAINER_UI_TEST_MODE ? JSON.parse(fs.readFileSync(TRAINER_UI_ARTWORK_PATH, 'utf8')) : null;
const GUIDE_WORKER_PATH = path.resolve(__dirname, 'guide-worker.cjs');
const GUIDE_TIMEOUT_MS = 180000;
const TRAINER_UI_SNAPSHOT = TRAINER_UI_TEST_MODE ? JSON.parse(fs.readFileSync(TRAINER_UI_SNAPSHOT_PATH, 'utf8')) : null;
const TRAINER_UI_PROGRESS = Object.freeze({
  defeated: [],
  victoryCounts: {},
  currentSeries: 'radicalred',
  currentSeriesCompleted: false,
  completedSeries: [],
  levelCap: 15,
  pikaStar: Object.freeze(
    Object.fromEntries(
      ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'].map((region) => [region, false]),
    ),
  ),
  sources: [
    {kind: 'rct-stats', sha256: 'a'.repeat(64)},
    {kind: 'pika-advancements', sha256: 'b'.repeat(64)},
  ],
});
const TRAINER_UI_CAMPAIGN = TRAINER_UI_TEST_MODE
  ? {
      radicalred: {
        levelCapRule: {initialLevelCap: 15},
        stages: [
          {
            stageId: 'radicalred:synthetic',
            name: TRAINER_UI_GUIDE.trainers[0].name,
            type: 'rival',
            order: 0,
            requires: [],
            capBefore: 15,
            capAfter: 21,
            capUnknownReason: null,
            ambiguous: false,
            ambiguousReason: null,
            variants: [
              {
                id: TRAINER_UI_GUIDE.trainers[0].id,
                format: TRAINER_UI_GUIDE.trainers[0].format,
                maxLevel: TRAINER_UI_GUIDE.trainers[0].maxLevel,
                teamSize: TRAINER_UI_GUIDE.trainers[0].teamSize,
                optional: false,
              },
            ],
          },
        ],
      },
    }
  : null;
const {createSaveAccountRegistry} = require('./accounts.cjs');
const saveAccountRegistry = createSaveAccountRegistry();
const {readPlayerSnapshotFromConfig, resolvePlayerSourcePaths, publicPlayerImportError} = require(PLAYER_IMPORT_PATH);
const {createAutoRefresh} = require('./lib/auto-refresh.cjs');
const {createSaveWatcher} = require('./lib/save-watcher.cjs');
const {assertFreshSources, calculateRealDamage} = require('./lib/real-damage.cjs');
const {loadGuideData} = require('./lib/guide/data.cjs');
const {readGuideProgressFromConfig, resolveProgressSourcePaths, publicProgressError} = require('./lib/progress.cjs');
const {deriveProgressLevelCap} = require('./lib/guide/trainers.cjs');
const {guideNextGoal, listGuideTrainers} = require('./lib/guide/trainers.cjs');
const PROTOCOL = 'cobblemon';
const ORIGIN = `${PROTOCOL}://app`;
const IPC_CALCULATE = 'companion:calculate';
const IPC_REAL_DAMAGE = 'companion:calculate-real-damage';
const IPC_CANCEL = 'companion:cancel';
const IPC_LIST_SAVE_ACCOUNTS = 'companion:list-save-accounts';
const IPC_SELECT_SAVE_ACCOUNT = 'companion:select-save-account';
const IPC_READ_PLAYER_SNAPSHOT = 'companion:read-player-snapshot';
const IPC_GUIDE_BUILD = 'companion:guide-build';
const IPC_BATTLE_PLAN_BUILD = 'companion:battle-plan-build';
const IPC_EVOLUTION_PLAN_BUILD = 'companion:evolution-plan-build';
const IPC_CAPTURE_PLAN_BUILD = 'companion:capture-plan-build';
const IPC_TRAINING_PLAN_BUILD = 'companion:training-plan-build';
const IPC_GUIDE_TRAINERS = 'companion:guide-trainers';
const IPC_GUIDE_NEXT_GOAL = 'companion:guide-next-goal';
const IPC_READ_PROGRESS = 'companion:read-progress';
const IPC_PROGRESS_CHANGED = 'companion:progress-changed';
const IPC_AUTO_REFRESH = 'companion:auto-refresh';
const IPC_SNAPSHOT_CHANGED = 'companion:snapshot-changed';
const IPC_TEST_SIMULATE_PROGRESS_CHANGE = 'companion:test:simulate-progress-change';
const IPC_TEST_SIMULATE_CHANGE = 'companion:test:simulate-snapshot-change';
const IPC_TEST_BEHAVIOR = 'companion:test:behavior';
const IPC_TEST_RESPONSES = 'companion:test:responses';
const IPC_TEST_ARTWORK_MANIFEST = 'companion:test:artwork-manifest';
const CURRENT_MOVE = 'cobblemon:spark';
const SUPPORTED_TARGET = 'cobblemon:floatzel';
const SUPPORTED_CANDIDATE = 'cobblemon:thunderbolt';

protocol.registerSchemesAsPrivileged([{scheme: PROTOCOL, privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

let windowRef;
let worker;
let latestJobId;
let nextTestBehavior = 'normal';
const testResponses = [];
const jobs = new Map();
const guideJobs = new Map();
let guideSequence = 0;
let shutdownStarted = false;
let allowQuitAfterWorkerStop = false;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value, allowed, name) {
  if (!isRecord(value)) throw new TypeError(`${name} precisa ser um objeto`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new TypeError(`${name}.${key} não é suportado`);
}
function identifier(value, name) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,128}$/.test(value)) throw new TypeError(`${name} precisa ser um identificador válido`);
}
function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new TypeError(`${name} precisa ser um inteiro entre ${min} e ${max}`);
}
function validateForm(form) {
  exactKeys(form, ['targetSpecies', 'targetLevel', 'candidateMove'], 'request.form');
  if (form.targetSpecies !== SUPPORTED_TARGET) throw new TypeError('O alvo disponível nesta demonstração é Floatzel');
  integer(form.targetLevel, 'request.form.targetLevel', 1, 100);
  if (form.candidateMove !== SUPPORTED_CANDIDATE) throw new TypeError('O golpe proposto disponível nesta demonstração é Thunderbolt');
  if (form.candidateMove === CURRENT_MOVE) throw new TypeError('A comparação precisa trocar Spark por outro golpe');
  return Object.freeze({...form});
}
function validateRequest(request) {
  exactKeys(request, ['jobId', 'revision', 'form'], 'request');
  identifier(request.jobId, 'request.jobId');
  integer(request.revision, 'request.revision', 0, Number.MAX_SAFE_INTEGER);
  const form = validateForm(request.form);
  if (jobs.has(request.jobId)) throw new TypeError('request.jobId já está ativo');
  return Object.freeze({jobId: request.jobId, revision: request.revision, form});
}
function validateCancel(request) {
  exactKeys(request, ['jobId'], 'cancel');
  identifier(request.jobId, 'cancel.jobId');
  return request.jobId;
}
function validSender(event) {
  if (
    !windowRef ||
    windowRef.isDestroyed() ||
    event.sender !== windowRef.webContents ||
    event.senderFrame !== windowRef.webContents.mainFrame
  )
    return false;
  try {
    const url = new URL(event.senderFrame.url);
    return url.protocol === `${PROTOCOL}:` && url.host === 'app' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
function requireSender(event) {
  if (!validSender(event)) throw new Error('Remetente IPC rejeitado');
}
function settle(job, response) {
  if (!job || job.settled) return;
  job.settled = true;
  clearTimeout(job.timeout);
  jobs.delete(job.jobId);
  if (RUNTIME_TEST_MODE) testResponses.push({jobId: job.jobId, status: response.status});
  job.resolve(response);
}
function stopWorker(child = worker) {
  if (!child) return Promise.resolve(true);
  if (child.stopping) return child.stopping;
  child.stopping = new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(false);
      }
    }, 1000);
    child.once('exit', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
    try {
      child.kill();
    } catch {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
  return child.stopping;
}
function ensureWorker() {
  if (worker?.pid) return worker;
  const child = utilityProcess.fork(WORKER_PATH, [], {cwd: ROOT, stdio: 'ignore', serviceName: 'Cobblemon Companion local calculator'});
  worker = child;
  child.on('message', (event) => {
    const message = event;
    if (!message || typeof message !== 'object' || typeof message.jobId !== 'string') return;
    const job = jobs.get(message.jobId);
    if (!job) return;
    if (message.type === 'cancelled') return settle(job, {status: 'cancelled', jobId: job.jobId});
    if (message.type === 'failure') return settle(job, {status: 'failed', jobId: job.jobId, error: message.error});
    if (message.type === 'result') {
      if (job.cancelRequested) return settle(job, {status: 'cancelled', jobId: job.jobId});
      if (latestJobId !== job.jobId) return settle(job, {status: 'stale', jobId: job.jobId});
      return settle(job, {status: 'current', jobId: job.jobId, result: message.result});
    }
  });
  child.on('exit', (code) => {
    if (worker === child) worker = undefined;
    for (const job of [...jobs.values()]) {
      if (job.child !== child) continue;
      settle(job, {
        status: job.cancelRequested ? 'cancelled' : 'failed',
        jobId: job.jobId,
        error: job.cancelRequested ? undefined : `Processo de análise encerrou antes do resultado (${code})`,
      });
    }
  });
  child.on('error', (error) => {
    if (worker === child) worker = undefined;
    for (const job of [...jobs.values()]) settle(job, {status: 'failed', jobId: job.jobId, error: error.message});
  });
  return child;
}
function handleCalculate(event, request) {
  requireSender(event);
  const checked = validateRequest(request);
  latestJobId = checked.jobId;
  const child = ensureWorker();
  return new Promise((resolve) => {
    const job = {jobId: checked.jobId, child, resolve, cancelRequested: false, settled: false};
    job.timeout = setTimeout(() => {
      if (job.settled) return;
      job.cancelRequested = true;
      try {
        child.postMessage({type: 'cancel', jobId: job.jobId});
      } catch {
        /* timeout remains authoritative */
      }
      settle(job, {status: 'timeout', jobId: job.jobId});
    }, 5000);
    jobs.set(job.jobId, job);
    const message = {type: 'calculate', ...checked};
    if (RUNTIME_TEST_MODE) {
      message.testBehavior = nextTestBehavior;
      nextTestBehavior = 'normal';
    }
    try {
      child.postMessage(message);
    } catch (error) {
      settle(job, {status: 'failed', jobId: job.jobId, error: error.message});
    }
  });
}
function handleCancel(event, request) {
  requireSender(event);
  const jobId = validateCancel(request);
  const guideJob = guideJobs.get(jobId);
  if (guideJob) {
    guideJob.cancelRequested = true;
    try {
      guideJob.child.postMessage({type: 'cancel', jobId});
    } catch {
      settleGuide(guideJob, new Error('Cancelamento do guia falhou'));
    }
    return {status: 'cancel-requested', jobId};
  }
  const job = jobs.get(jobId);
  if (!job) return {status: 'not-active', jobId};
  job.cancelRequested = true;
  try {
    job.child.postMessage({type: 'cancel', jobId});
  } catch (error) {
    settle(job, {status: 'failed', jobId, error: `Cancelamento falhou: ${error.message}`});
  }
  return {status: 'cancel-requested', jobId};
}
function handleTestArtworkManifest(event) {
  requireSender(event);
  return structuredClone(TRAINER_UI_ARTWORK);
}
function readSnapshotForRenderer() {
  try {
    return TRAINER_UI_TEST_MODE ? structuredClone(TRAINER_UI_SNAPSHOT) : readPlayerSnapshotFromConfig();
  } catch (error) {
    throw new Error(publicPlayerImportError(error));
  }
}
// Modo de teste da UI: o resultado sintético respeita o level cap como o motor real (membro acima do cap vai para excluídos).
const overCapOf = (member, levelCap) => ({
  uuid: member.uuid,
  speciesId: member.speciesId,
  level: member.level,
  levelCap,
  text: `Nível ${member.level} acima do level cap (${levelCap}): baixe o nível para ${levelCap} antes da luta ou guarde no PC.`,
});
function applyLevelCapToFixture(result, goal, levelCap, respectLevelCap = true) {
  if (goal.kind !== 'trainer') return result;
  if (levelCap === null) {
    result.assumptions.push(
      'O level cap não foi informado e não foi considerado: o time pode conter Pokémon acima do cap, que o treinador do RCT não aceita enfrentar.',
    );
    return result;
  }
  const above = result.team.filter((member) => member.level > levelCap);
  if (!respectLevelCap) {
    result.overCap = above.map((member) => overCapOf(member, levelCap));
    return result;
  }
  result.team = result.team.filter((member) => member.level <= levelCap);
  for (const member of above) result.excluded.push({uuid: member.uuid, reason: `acima do level cap (${levelCap})`});
  const kept = new Set(result.team.map((member) => member.uuid));
  result.currentPartyComparison.kept = result.currentPartyComparison.kept.filter((uuid) => kept.has(uuid));
  result.currentPartyComparison.removed.push(
    ...above.map((member) => member.uuid).filter((uuid) => !result.currentPartyComparison.removed.includes(uuid)),
  );
  return result;
}
function validateGuideRequest(request) {
  exactKeys(request, ['sources', 'goal', 'levelCap', 'respectLevelCap', 'jobId'], 'request');
  if (request.respectLevelCap !== undefined && typeof request.respectLevelCap !== 'boolean')
    throw new TypeError('request.respectLevelCap precisa ser verdadeiro ou falso');
  const levelCap = request.levelCap ?? null;
  if (levelCap !== null) integer(levelCap, 'request.levelCap', 1, 100);
  if (!isRecord(request.goal)) throw new TypeError('request.goal precisa ser um objeto');
  if (request.goal.kind === 'pve') exactKeys(request.goal, ['kind'], 'request.goal');
  else if (request.goal.kind === 'trainer') {
    exactKeys(request.goal, ['kind', 'trainerId'], 'request.goal');
    if (typeof request.goal.trainerId !== 'string' || request.goal.trainerId.length === 0 || request.goal.trainerId.length > 200)
      throw new TypeError('request.goal.trainerId precisa ser texto não vazio');
  } else throw new TypeError('request.goal.kind não é suportado');
  if (request.jobId !== undefined) identifier(request.jobId, 'request.jobId');
  const jobId = request.jobId ?? `guide-${Date.now()}-${++guideSequence}`;
  if (guideJobs.has(jobId) || jobs.has(jobId)) throw new TypeError('request.jobId já está ativo');
  return {jobId, goal: structuredClone(request.goal), levelCap, respectLevelCap: request.respectLevelCap ?? true};
}
function settleGuide(job, failure, result) {
  if (job.settled) return;
  job.settled = true;
  clearTimeout(job.timeout);
  guideJobs.delete(job.jobId);
  try {
    job.child.kill();
  } catch {
    /* o processo já saiu */
  }
  if (failure) job.reject(failure);
  else job.resolve(result);
}
function handleGuideBuild(event, request) {
  requireSender(event);
  const {jobId, goal, levelCap, respectLevelCap} = validateGuideRequest(request);
  const snapshot = readSnapshotForRenderer();
  assertFreshSources(request.sources, snapshot.sources);
  if (TRAINER_UI_TEST_MODE) {
    if (goal.kind === 'trainer' && goal.trainerId !== TRAINER_UI_GUIDE.result.goal.trainerId)
      throw new Error('Treinador sintético não encontrado');
    return applyLevelCapToFixture(structuredClone({...TRAINER_UI_GUIDE.result, goal}), goal, levelCap, respectLevelCap);
  }
  return runGuideJob(jobId, {type: 'run', jobId, snapshot, goal, levelCap, respectLevelCap});
}
function validateBattlePlanRequest(request) {
  exactKeys(request, ['sources', 'trainerId', 'team', 'levelCap', 'respectLevelCap', 'jobId'], 'request');
  if (request.respectLevelCap !== undefined && typeof request.respectLevelCap !== 'boolean')
    throw new TypeError('request.respectLevelCap precisa ser verdadeiro ou falso');
  const levelCap = request.levelCap ?? null;
  if (levelCap !== null) integer(levelCap, 'request.levelCap', 1, 100);
  if (typeof request.trainerId !== 'string' || request.trainerId.length === 0 || request.trainerId.length > 200)
    throw new TypeError('request.trainerId precisa ser texto não vazio');
  if (!Array.isArray(request.team) || request.team.length < 1 || request.team.length > 6)
    throw new TypeError('request.team precisa ter de 1 a 6 membros');
  const team = request.team.map((member, index) => {
    exactKeys(member, ['uuid', 'moveIds', 'itemId'], `request.team[${index}]`);
    if (typeof member.uuid !== 'string' || member.uuid.length === 0 || member.uuid.length > 64)
      throw new TypeError(`request.team[${index}].uuid precisa ser texto`);
    if (
      !Array.isArray(member.moveIds) ||
      member.moveIds.length > 4 ||
      member.moveIds.some((id) => typeof id !== 'string' || id.length > 100)
    )
      throw new TypeError(`request.team[${index}].moveIds precisa ter até 4 ids`);
    if (member.itemId !== null && (typeof member.itemId !== 'string' || member.itemId.length > 100))
      throw new TypeError(`request.team[${index}].itemId precisa ser texto ou null`);
    return {uuid: member.uuid, moveIds: [...member.moveIds], itemId: member.itemId};
  });
  if (request.jobId !== undefined) identifier(request.jobId, 'request.jobId');
  const jobId = request.jobId ?? `plan-${Date.now()}-${++guideSequence}`;
  if (guideJobs.has(jobId) || jobs.has(jobId)) throw new TypeError('request.jobId já está ativo');
  return {jobId, plan: {trainerId: request.trainerId, team, levelCap, respectLevelCap: request.respectLevelCap ?? true}};
}
function handleBattlePlanBuild(event, request) {
  requireSender(event);
  const {jobId, plan} = validateBattlePlanRequest(request);
  const snapshot = readSnapshotForRenderer();
  assertFreshSources(request.sources, snapshot.sources);
  if (TRAINER_UI_TEST_MODE) {
    if (plan.trainerId !== TRAINER_UI_GUIDE.battlePlan.trainer.id) throw new Error('Treinador sintético não encontrado');
    return structuredClone(TRAINER_UI_GUIDE.battlePlan);
  }
  return runGuideJob(jobId, {type: 'run', task: 'battle-plan', jobId, snapshot, request: {sources: request.sources, ...plan}});
}
function validateEvolutionPlanRequest(request) {
  exactKeys(request, ['sources', 'team', 'levelCap', 'jobId'], 'request');
  if (!Array.isArray(request.team) || request.team.length < 1 || request.team.length > 6)
    throw new TypeError('request.team precisa ter de 1 a 6 membros');
  const team = request.team.map((member, index) => {
    exactKeys(member, ['uuid', 'usefulMoveIds'], `request.team[${index}]`);
    if (typeof member.uuid !== 'string' || member.uuid.length === 0 || member.uuid.length > 64)
      throw new TypeError(`request.team[${index}].uuid precisa ser texto`);
    if (
      !Array.isArray(member.usefulMoveIds) ||
      member.usefulMoveIds.length > 40 ||
      member.usefulMoveIds.some((id) => typeof id !== 'string' || id.length > 100)
    )
      throw new TypeError(`request.team[${index}].usefulMoveIds precisa ter até 40 ids`);
    return {uuid: member.uuid, usefulMoveIds: [...member.usefulMoveIds]};
  });
  if (request.levelCap !== null) integer(request.levelCap, 'request.levelCap', 1, 100);
  if (request.jobId !== undefined) identifier(request.jobId, 'request.jobId');
  const jobId = request.jobId ?? `evolution-${Date.now()}-${++guideSequence}`;
  if (guideJobs.has(jobId) || jobs.has(jobId)) throw new TypeError('request.jobId já está ativo');
  return {jobId, plan: {team, levelCap: request.levelCap}};
}
function handleEvolutionPlanBuild(event, request) {
  requireSender(event);
  const {jobId, plan} = validateEvolutionPlanRequest(request);
  const snapshot = readSnapshotForRenderer();
  assertFreshSources(request.sources, snapshot.sources);
  if (TRAINER_UI_TEST_MODE) return structuredClone({...TRAINER_UI_GUIDE.evolutionPlan, levelCap: plan.levelCap});
  return runGuideJob(jobId, {type: 'run', task: 'evolution-plan', jobId, snapshot, request: {sources: request.sources, ...plan}});
}
function validateCapturePlanRequest(request) {
  exactKeys(request, ['sources', 'goal', 'teamUuids', 'gapOpponentIds', 'pikaStar', 'jobId'], 'request');
  const {goal} = validateGuideRequest({sources: request.sources, goal: request.goal, jobId: request.jobId});
  const uuids = (value, name, max) => {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 200)
    )
      throw new TypeError(`request.${name} precisa ser uma lista de até ${max} textos`);
    return [...value];
  };
  const teamUuids = uuids(request.teamUuids, 'teamUuids', 6);
  const gapOpponentIds = uuids(request.gapOpponentIds, 'gapOpponentIds', 30);
  const regions = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'];
  exactKeys(request.pikaStar, regions, 'request.pikaStar');
  const pikaStar = Object.fromEntries(
    regions.map((region) => {
      const status = request.pikaStar[region];
      if (status !== true && status !== false && status !== null)
        throw new TypeError(`request.pikaStar.${region} precisa ser verdadeiro, falso ou null`);
      return [region, status];
    }),
  );
  const jobId = request.jobId ?? `capture-${Date.now()}-${++guideSequence}`;
  return {jobId, plan: {goal, teamUuids, gapOpponentIds, pikaStar}};
}
function handleCapturePlanBuild(event, request) {
  requireSender(event);
  const {jobId, plan} = validateCapturePlanRequest(request);
  const snapshot = readSnapshotForRenderer();
  assertFreshSources(request.sources, snapshot.sources);
  if (TRAINER_UI_TEST_MODE) return structuredClone(TRAINER_UI_GUIDE.capturePlan);
  return runGuideJob(jobId, {type: 'run', task: 'capture-plan', jobId, snapshot, request: {sources: request.sources, ...plan}});
}
function validateTrainingPlanRequest(request) {
  exactKeys(request, ['sources', 'team', 'levelCap', 'capOrigin', 'jobId'], 'request');
  if (!Array.isArray(request.team) || request.team.length < 1 || request.team.length > 6)
    throw new TypeError('request.team precisa ter de 1 a 6 membros');
  const team = request.team.map((member, index) => {
    exactKeys(member, ['uuid', 'usefulMoveIds'], `request.team[${index}]`);
    if (typeof member.uuid !== 'string' || member.uuid.length === 0 || member.uuid.length > 64)
      throw new TypeError(`request.team[${index}].uuid precisa ser texto`);
    if (
      !Array.isArray(member.usefulMoveIds) ||
      member.usefulMoveIds.length > 40 ||
      member.usefulMoveIds.some((id) => typeof id !== 'string' || id.length > 100)
    )
      throw new TypeError(`request.team[${index}].usefulMoveIds precisa ter até 40 ids`);
    return {uuid: member.uuid, usefulMoveIds: [...member.usefulMoveIds]};
  });
  if (request.levelCap !== null) integer(request.levelCap, 'request.levelCap', 1, 100);
  if (request.capOrigin !== 'informado' && request.capOrigin !== 'desconhecida') throw new TypeError('request.capOrigin inválido');
  if ((request.capOrigin === 'informado') !== (request.levelCap !== null))
    throw new TypeError('request.capOrigin e request.levelCap não combinam');
  if (request.jobId !== undefined) identifier(request.jobId, 'request.jobId');
  const jobId = request.jobId ?? `training-${Date.now()}-${++guideSequence}`;
  if (guideJobs.has(jobId) || jobs.has(jobId)) throw new TypeError('request.jobId já está ativo');
  return {jobId, plan: {team, levelCap: request.levelCap, capOrigin: request.capOrigin}};
}
function handleTrainingPlanBuild(event, request) {
  requireSender(event);
  const {jobId, plan} = validateTrainingPlanRequest(request);
  const snapshot = readSnapshotForRenderer();
  assertFreshSources(request.sources, snapshot.sources);
  if (TRAINER_UI_TEST_MODE) {
    const result = structuredClone(TRAINER_UI_GUIDE.trainingPlan);
    if (plan.levelCap === 21) {
      const cap21Member = TRAINER_UI_GUIDE.trainingPlanCap21Member;
      const member = result.members.find(({uuid}) => uuid === cap21Member.uuid);
      if (!member) throw new Error('Fixture de treino sem membro correspondente ao cap 21.');
      Object.assign(member, cap21Member);
    }
    if (plan.levelCap === null) {
      for (const member of result.members)
        Object.assign(member, {levelCap: null, capOrigin: 'desconhecida', targetLevel: null, targetNote: 'cap não determinado', moves: []});
    }
    return result;
  }
  return runGuideJob(jobId, {type: 'run', task: 'training-plan', jobId, snapshot, request: {sources: request.sources, ...plan}});
}
function runGuideJob(jobId, message) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(GUIDE_WORKER_PATH, [], {cwd: ROOT, stdio: 'ignore', serviceName: 'Cobblemon Companion guide'});
    const job = {jobId, child, resolve, reject, settled: false, cancelRequested: false};
    job.timeout = setTimeout(() => settleGuide(job, new Error('A montagem do guia excedeu o tempo limite')), GUIDE_TIMEOUT_MS);
    guideJobs.set(jobId, job);
    child.on('message', (message) => {
      if (!message || message.jobId !== jobId) return;
      if (message.type === 'result') settleGuide(job, null, message.result);
      else if (message.type === 'cancelled') settleGuide(job, new Error('A montagem do guia foi cancelada'));
      else if (message.type === 'failed') settleGuide(job, new Error(`Guia: ${message.error}`));
    });
    child.on('exit', () =>
      settleGuide(
        job,
        new Error(job.cancelRequested ? 'A montagem do guia foi cancelada' : 'O processo do guia encerrou antes do resultado'),
      ),
    );
    child.on('error', (error) => settleGuide(job, error));
    try {
      child.postMessage(message);
    } catch (error) {
      settleGuide(job, error);
    }
  });
}
function handleGuideTrainers(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('A lista de treinadores não aceita argumentos');
  if (TRAINER_UI_TEST_MODE) return structuredClone(TRAINER_UI_GUIDE.trainers);
  return listGuideTrainers(loadGuideData());
}
function guideDataForRenderer() {
  return TRAINER_UI_TEST_MODE ? {trainers: TRAINER_UI_GUIDE.trainers, series: {}, campaign: TRAINER_UI_CAMPAIGN} : loadGuideData();
}
function readProgressForRenderer() {
  const progress = TRAINER_UI_TEST_MODE ? structuredClone(TRAINER_UI_PROGRESS) : readGuideProgressFromConfig();
  progress.levelCap = deriveProgressLevelCap(guideDataForRenderer().campaign, progress);
  return progress;
}
function handleReadGuideProgress(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('A leitura do progresso não aceita argumentos');
  try {
    const progress = readProgressForRenderer();
    progressWatcher?.acknowledge(progress);
    if (autoRefresh.enabled) progressWatcher?.start();
    return progress;
  } catch (error) {
    const safeError = publicProgressError(error);
    throw Object.assign(new Error(safeError.message), {code: safeError.code});
  }
}
function handleGuideNextGoal(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('O próximo objetivo não aceita argumentos');
  const snapshot = readSnapshotForRenderer();
  const levels = snapshot.individuals
    .filter((individual) => individual.location.container === 'party' && Number.isSafeInteger(individual.level))
    .map((individual) => individual.level);
  const data = guideDataForRenderer();
  let progress;
  try {
    progress = readProgressForRenderer();
    progressWatcher?.acknowledge(progress);
    if (autoRefresh.enabled) progressWatcher?.start();
  } catch (error) {
    if (error?.code !== 'ERR_IMPORT_CHANGED') throw error;
    progress = {currentSeries: null, victoryCounts: null};
  }
  return guideNextGoal(data, levels.length > 0 ? Math.max(...levels) : null, progress);
}
function handleRealDamageCalculation(event, request) {
  requireSender(event);
  let snapshot;
  try {
    snapshot = TRAINER_UI_TEST_MODE ? structuredClone(TRAINER_UI_SNAPSHOT) : readPlayerSnapshotFromConfig();
  } catch (error) {
    throw new Error(publicPlayerImportError(error));
  }
  return {status: 'calculated', result: calculateRealDamage(snapshot, request)};
}

function notifySnapshotChanged(snapshot) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send(IPC_SNAPSHOT_CHANGED, snapshot);
}
function notifyProgressChanged(progress) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send(IPC_PROGRESS_CHANGED, progress);
}
// Progresso RCT/advancements têm fontes e notificações próprias; alterações não provocam releitura da party/PC.
const progressWatcher = TRAINER_UI_TEST_MODE
  ? null
  : createSaveWatcher({
      watch: (file, listener) => fs.watch(file, listener),
      resolvePaths: () => {
        const paths = resolveProgressSourcePaths();
        const insideWorld = (candidate) => {
          try {
            const real = fs.realpathSync(candidate);
            const relative = path.relative(paths.worldRoot, real);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
              ? candidate
              : null;
          } catch {
            return null;
          }
        };
        const watched = [
          paths.configPath,
          paths.propertiesPath,
          paths.worldRoot,
          insideWorld(path.dirname(paths.statsPath)),
          insideWorld(paths.statsPath),
          insideWorld(path.dirname(paths.pikaPath)),
          insideWorld(paths.pikaPath),
        ].filter(Boolean);
        return Object.fromEntries(watched.map((file, index) => [`source${index}`, file]));
      },
      readSnapshot: readProgressForRenderer,
      onChange: notifyProgressChanged,
    });
// Monitoramento somente leitura do save; no modo de teste da UI o snapshot é sintético e não há arquivo a observar.
const saveWatcher = TRAINER_UI_TEST_MODE
  ? null
  : createSaveWatcher({
      watch: (file, listener) => fs.watch(file, listener),
      resolvePaths: resolvePlayerSourcePaths,
      readSnapshot: readPlayerSnapshotFromConfig,
      onChange: notifySnapshotChanged,
    });
const autoRefresh = createAutoRefresh(saveWatcher, [progressWatcher]);
function handleSetAutoRefresh(event, enabled) {
  requireSender(event);
  if (typeof enabled !== 'boolean') throw new TypeError('O auto-refresh precisa ser verdadeiro ou falso');
  autoRefresh.setEnabled(enabled);
  return {enabled};
}
function handleSimulateSnapshotChange(event) {
  requireSender(event);
  if (!TRAINER_UI_TEST_MODE) throw new Error('Harness de UI indisponível');
  if (!autoRefresh.enabled) return {sent: false};
  const snapshot = structuredClone(TRAINER_UI_SNAPSHOT);
  snapshot.capturedAt = new Date().toISOString();
  snapshot.sources[0].sha256 = 'c'.repeat(64);
  notifySnapshotChanged(snapshot);
  return {sent: true};
}
function handleSimulateProgressChange(event) {
  requireSender(event);
  if (!TRAINER_UI_TEST_MODE) throw new Error('Harness de UI indisponível');
  if (!autoRefresh.enabled) return {sent: false};
  const progress = structuredClone(TRAINER_UI_PROGRESS);
  progress.defeated = ['rctmod:leader_brock_019e'];
  progress.victoryCounts = {'rctmod:leader_brock_019e': 1};
  progress.levelCap = 21;
  progress.sources[0].sha256 = 'c'.repeat(64);
  notifyProgressChanged(progress);
  return {sent: true};
}
let testSelectedAccountKey = 'selected';
const testAccountTokens = new Map();
const TEST_ACCOUNT_TOKEN_TTL_MS = 5 * 60 * 1000;
function syntheticSaveAccounts() {
  testAccountTokens.clear();
  const definitions = [
    {
      key: 'selected',
      name: 'Treinador Sintético',
      partyLastWriteAt: '2001-01-01T10:00:00.000Z',
      pcLastWriteAt: '2001-02-01T10:00:00.000Z',
      selectable: true,
    },
    {
      key: 'recent',
      name: 'Treinador Sintético',
      partyLastWriteAt: '2003-01-01T10:00:00.000Z',
      pcLastWriteAt: null,
      selectable: true,
    },
    {
      key: 'cache-only',
      name: 'Treinador Sintético',
      partyLastWriteAt: null,
      pcLastWriteAt: null,
      selectable: false,
    },
  ];
  const idByKey = new Map();
  for (const account of definitions) {
    const id = crypto.randomBytes(24).toString('base64url');
    idByKey.set(account.key, id);
    testAccountTokens.set(id, {
      key: account.key,
      selectable: account.selectable,
      expiresAt: Date.now() + TEST_ACCOUNT_TOKEN_TTL_MS,
    });
  }
  return {
    accounts: definitions.map(({key, ...account}) => ({
      ...account,
      id: idByKey.get(key),
      isSelected: key === testSelectedAccountKey,
    })),
    selectedAccountId: idByKey.get(testSelectedAccountKey),
    mostRecentlyWrittenAccountId: idByKey.get('recent'),
  };
}
function handleListSaveAccounts(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('A lista de contas não aceita argumentos');
  return TRAINER_UI_TEST_MODE ? syntheticSaveAccounts() : saveAccountRegistry.list();
}
function handleSelectSaveAccount(event, id) {
  requireSender(event);
  if (TRAINER_UI_TEST_MODE) {
    const account = typeof id === 'string' ? testAccountTokens.get(id) : undefined;
    if (!account?.selectable || account.expiresAt < Date.now())
      throw new TypeError('A conta escolhida é inválida ou expirou. Atualize a lista e tente novamente.');
    testSelectedAccountKey = account.key;
    testAccountTokens.clear();
    return;
  }
  saveAccountRegistry.select(id);
  saveWatcher.stop();
  progressWatcher.stop();
  if (autoRefresh.enabled) autoRefresh.start();
}

function handleReadPlayerSnapshot(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('A leitura do snapshot não aceita argumentos');
  try {
    if (TRAINER_UI_TEST_MODE) return structuredClone(TRAINER_UI_SNAPSHOT);
    const snapshot = readPlayerSnapshotFromConfig();
    autoRefresh.afterRead(snapshot);
    return snapshot;
  } catch (error) {
    throw new Error(publicPlayerImportError(error));
  }
}
function handleSetTestBehavior(event, behavior) {
  requireSender(event);
  if (!RUNTIME_TEST_MODE) throw new Error('Harness de runtime indisponível');
  if (!['normal', 'delay', 'failure'].includes(behavior)) throw new TypeError('Comportamento de teste inválido');
  nextTestBehavior = behavior;
  return {status: 'armed', behavior};
}
function handleReadTestResponses(event) {
  requireSender(event);
  if (!RUNTIME_TEST_MODE) throw new Error('Harness de runtime indisponível');
  return testResponses.map((response) => ({...response}));
}
function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}
async function installProtocol() {
  protocol.handle(PROTOCOL, async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = path.resolve(RENDERER_DIR, relative);
    if (!candidate.startsWith(`${RENDERER_DIR}${path.sep}`)) return new Response('not found', {status: 404});
    try {
      const body = await fs.promises.readFile(candidate);
      return new Response(body, {headers: {'content-type': contentType(candidate)}});
    } catch {
      return new Response('not found', {status: 404});
    }
  });
}
const DIAGNOSTICS_LOG_MAX_BYTES = 256 * 1024;
// Só `reason` (enum) e `exitCode` (número) entram no log: nenhum caminho, UUID ou dado do jogador.
function appendDiagnosticLine(line) {
  try {
    const file = path.join(app.getPath('userData'), 'diagnostics.log');
    if (fs.existsSync(file) && fs.statSync(file).size > DIAGNOSTICS_LOG_MAX_BYTES) fs.writeFileSync(file, line);
    else fs.appendFileSync(file, line);
  } catch {
    // Falha de log nunca pode derrubar o processo principal.
  }
}
function handleRendererGone(details) {
  if (details.reason === 'clean-exit') return;
  appendDiagnosticLine(`${new Date().toISOString()} render-process-gone reason=${details.reason} exitCode=${details.exitCode}\n`);
  if (TRAINER_UI_TEST_MODE || !windowRef || windowRef.isDestroyed()) return;
  void dialog
    .showMessageBox(windowRef, {
      type: 'error',
      title: 'Companion',
      message: 'A interface parou de funcionar.',
      detail: `Motivo: ${details.reason} (código ${details.exitCode}). Nada foi gravado no save. Um registro foi salvo em diagnostics.log, na pasta de dados do app.`,
      buttons: ['Recarregar', 'Fechar'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({response}) => {
      if (!windowRef || windowRef.isDestroyed()) return;
      if (response === 0) windowRef.webContents.reload();
      else windowRef.close();
    });
}
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#111318',
    webPreferences: {preload: PRELOAD_PATH, nodeIntegration: false, contextIsolation: true, sandbox: true},
  });
  windowRef.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  windowRef.webContents.on('render-process-gone', (_event, details) => handleRendererGone(details));
  windowRef.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, _url, isMainFrame) => {
    if (isMainFrame) handleRendererGone({reason: 'did-fail-load', exitCode: errorCode});
  });
  void windowRef.loadURL(`${ORIGIN}/${RUNTIME_TEST_MODE ? '?runtime-test' : ''}`);
  windowRef.on('closed', () => {
    windowRef = undefined;
  });
}
function installIpc() {
  ipcMain.handle(IPC_LIST_SAVE_ACCOUNTS, handleListSaveAccounts);
  ipcMain.handle(IPC_SELECT_SAVE_ACCOUNT, handleSelectSaveAccount);
  ipcMain.handle(IPC_CALCULATE, handleCalculate);
  ipcMain.handle(IPC_REAL_DAMAGE, handleRealDamageCalculation);
  ipcMain.handle(IPC_CANCEL, handleCancel);
  ipcMain.handle(IPC_READ_PLAYER_SNAPSHOT, handleReadPlayerSnapshot);
  ipcMain.handle(IPC_AUTO_REFRESH, handleSetAutoRefresh);
  ipcMain.handle(IPC_GUIDE_BUILD, handleGuideBuild);
  ipcMain.handle(IPC_BATTLE_PLAN_BUILD, handleBattlePlanBuild);
  ipcMain.handle(IPC_EVOLUTION_PLAN_BUILD, handleEvolutionPlanBuild);
  ipcMain.handle(IPC_CAPTURE_PLAN_BUILD, handleCapturePlanBuild);
  ipcMain.handle(IPC_TRAINING_PLAN_BUILD, handleTrainingPlanBuild);
  ipcMain.handle(IPC_GUIDE_TRAINERS, handleGuideTrainers);
  ipcMain.handle(IPC_GUIDE_NEXT_GOAL, handleGuideNextGoal);
  ipcMain.handle(IPC_READ_PROGRESS, handleReadGuideProgress);
  if (TRAINER_UI_TEST_MODE) {
    ipcMain.handle(IPC_TEST_SIMULATE_CHANGE, handleSimulateSnapshotChange);
    ipcMain.handle(IPC_TEST_SIMULATE_PROGRESS_CHANGE, handleSimulateProgressChange);
    ipcMain.handle(IPC_TEST_ARTWORK_MANIFEST, handleTestArtworkManifest);
  }
  if (RUNTIME_TEST_MODE) {
    ipcMain.handle(IPC_TEST_BEHAVIOR, handleSetTestBehavior);
    ipcMain.handle(IPC_TEST_RESPONSES, handleReadTestResponses);
  }
}

app.whenReady().then(async () => {
  await installProtocol();
  installIpc();
  createWindow();
  autoRefresh.start();
});
app.on('before-quit', (event) => {
  autoRefresh.stop();
  if (allowQuitAfterWorkerStop) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  for (const job of [...jobs.values()]) settle(job, {status: 'failed', jobId: job.jobId, error: 'Aplicação encerrada'});
  for (const job of [...guideJobs.values()]) settleGuide(job, new Error('Aplicação encerrada'));
  void stopWorker().finally(() => {
    allowQuitAfterWorkerStop = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
