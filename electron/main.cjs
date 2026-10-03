'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, ipcMain, protocol, utilityProcess} = require('electron');

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
const TRAINER_UI_SNAPSHOT = TRAINER_UI_TEST_MODE ? JSON.parse(fs.readFileSync(TRAINER_UI_SNAPSHOT_PATH, 'utf8')) : null;
const {readPlayerSnapshotFromConfig, publicPlayerImportError} = require(PLAYER_IMPORT_PATH);
const {calculateRealDamage} = require('./lib/real-damage.cjs');
const PROTOCOL = 'cobblemon';
const ORIGIN = `${PROTOCOL}://app`;
const IPC_CALCULATE = 'companion:calculate';
const IPC_REAL_DAMAGE = 'companion:calculate-real-damage';
const IPC_CANCEL = 'companion:cancel';
const IPC_READ_PLAYER_SNAPSHOT = 'companion:read-player-snapshot';
const IPC_TEST_BEHAVIOR = 'companion:test:behavior';
const IPC_TEST_RESPONSES = 'companion:test:responses';
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

function handleReadPlayerSnapshot(event, ...args) {
  requireSender(event);
  if (args.length !== 0) throw new TypeError('A leitura do snapshot não aceita argumentos');
  try {
    return TRAINER_UI_TEST_MODE ? structuredClone(TRAINER_UI_SNAPSHOT) : readPlayerSnapshotFromConfig();
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
  void windowRef.loadURL(`${ORIGIN}/${RUNTIME_TEST_MODE ? '?runtime-test' : ''}`);
  windowRef.on('closed', () => {
    windowRef = undefined;
  });
}
function installIpc() {
  ipcMain.handle(IPC_CALCULATE, handleCalculate);
  ipcMain.handle(IPC_REAL_DAMAGE, handleRealDamageCalculation);
  ipcMain.handle(IPC_CANCEL, handleCancel);
  ipcMain.handle(IPC_READ_PLAYER_SNAPSHOT, handleReadPlayerSnapshot);
  if (RUNTIME_TEST_MODE) {
    ipcMain.handle(IPC_TEST_BEHAVIOR, handleSetTestBehavior);
    ipcMain.handle(IPC_TEST_RESPONSES, handleReadTestResponses);
  }
}

app.whenReady().then(async () => {
  await installProtocol();
  installIpc();
  createWindow();
});
app.on('before-quit', (event) => {
  if (allowQuitAfterWorkerStop) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  for (const job of [...jobs.values()]) settle(job, {status: 'failed', jobId: job.jobId, error: 'Aplicação encerrada'});
  void stopWorker().finally(() => {
    allowQuitAfterWorkerStop = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
