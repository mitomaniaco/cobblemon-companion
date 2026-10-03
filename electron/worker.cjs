'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {adaptOfflineComparison} = require('./lib/offline-adapter.cjs');

const FIXTURE_PATH = path.join(__dirname, '../test/fixtures/offline-companion-snapshot.json');
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const timers = new Map();

function post(message) {
  try {
    process.parentPort.postMessage(message);
  } catch {
    /* parent is already closing */
  }
}

function clone(value) {
  return structuredClone(value);
}

function productResult(output) {
  const current = output.calculation.current;
  const candidate = output.calculation.candidate;
  const mapFact = (fact) => ({
    metric: fact.metric,
    before: fact.before,
    after: fact.after,
    target: fact.target,
    condition: fact.condition,
  });
  return {
    status: output.comparison.status,
    reason: output.comparison.reason,
    current: {
      moveId: current.moveId,
      min: current.min,
      max: current.max,
      targetHP: current.targetHP,
      remainingHP: Math.max(0, current.targetHP - current.min),
    },
    candidate: {
      moveId: candidate.moveId,
      min: candidate.min,
      max: candidate.max,
      targetHP: candidate.targetHP,
      remainingHP: Math.max(0, candidate.targetHP - candidate.min),
    },
    conditions: [...output.explanation.conditions],
    gains: output.comparison.explanation.gains.map(mapFact),
    losses: output.comparison.explanation.losses.map(mapFact),
    traceability: {
      snapshotId: output.analysisRef.snapshotId,
      sourceIds: [...output.calculation.sourceIds],
      evidenceIds: [...output.explanation.evidenceIds],
      analysisId: output.analysisRef.analysisId,
      inputDigest: output.calculation.inputDigest,
      engineVersion: output.analysisRef.engineVersion,
      policyVersion: output.comparison.policyVersion,
    },
    limits: [
      'Demonstração congelada: não representa a party real.',
      'Um alvo, uma ação e roll mínimo; não simula IA, troca ou batalha inteira.',
      'Sem item, habilidade, status, clima, terreno ou boosts modelados.',
      'Não é recomendador geral nem certifica vitória no jogo vivo.',
    ],
  };
}

function runCalculation(message) {
  const delay = message.testBehavior === 'delay' ? 600 : 0;
  const timer = setTimeout(() => {
    timers.delete(message.jobId);
    if (message.testBehavior === 'failure') {
      post({type: 'failure', jobId: message.jobId, error: 'Falha de fixture solicitada pelo harness.'});
      return;
    }
    try {
      const input = clone(FIXTURE);
      input.calculation.target.speciesId = message.form.targetSpecies;
      input.calculation.target.level = message.form.targetLevel;
      input.player.individuals[0].planned.moves[0].id = message.form.candidateMove;
      const output = adaptOfflineComparison(input);
      post({type: 'result', jobId: message.jobId, result: productResult(output)});
    } catch (error) {
      post({type: 'failure', jobId: message.jobId, error: String((error && error.message) || error)});
    }
  }, delay);
  timers.set(message.jobId, timer);
}

process.parentPort.on('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'calculate') return runCalculation(message);
  if (message.type === 'cancel') {
    const timer = timers.get(message.jobId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(message.jobId);
    }
    post({type: 'cancelled', jobId: message.jobId});
  }
});
