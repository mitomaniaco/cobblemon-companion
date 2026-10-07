'use strict';

const {contextBridge, ipcRenderer} = require('electron');

const bridge = {
  calculate: (request) => ipcRenderer.invoke('companion:calculate', request),
  calculateRealDamage: (request) => ipcRenderer.invoke('companion:calculate-real-damage', request),
  cancel: (jobId) => ipcRenderer.invoke('companion:cancel', {jobId}),
  readPlayerSnapshot: (...args) => {
    if (args.length !== 0) return Promise.reject(new TypeError('A leitura do snapshot não aceita argumentos'));
    return ipcRenderer.invoke('companion:read-player-snapshot');
  },
  listSaveAccounts: (...args) => {
    if (args.length !== 0) return Promise.reject(new TypeError('A lista de contas não aceita argumentos'));
    return ipcRenderer.invoke('companion:list-save-accounts');
  },
  selectSaveAccount: (id) => ipcRenderer.invoke('companion:select-save-account', id),
  onSnapshotChanged: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('onSnapshotChanged precisa de uma função');
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('companion:snapshot-changed', listener);
    return () => ipcRenderer.removeListener('companion:snapshot-changed', listener);
  },
  setAutoRefresh: (enabled) => ipcRenderer.invoke('companion:auto-refresh', enabled),
  buildGuide: (request) => ipcRenderer.invoke('companion:guide-build', request),
  listGuideTrainers: () => ipcRenderer.invoke('companion:guide-trainers'),
  guideNextGoal: () => ipcRenderer.invoke('companion:guide-next-goal'),
  readGuideProgress: () => ipcRenderer.invoke('companion:read-progress'),
  onProgressChanged: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('onProgressChanged precisa de uma função');
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('companion:progress-changed', listener);
    return () => ipcRenderer.removeListener('companion:progress-changed', listener);
  },
  buildBattlePlan: (request) => ipcRenderer.invoke('companion:battle-plan-build', request),
  buildEvolutionPlan: (request) => ipcRenderer.invoke('companion:evolution-plan-build', request),
  buildCapturePlan: (request) => ipcRenderer.invoke('companion:capture-plan-build', request),
  buildTrainingPlan: (request) => ipcRenderer.invoke('companion:training-plan-build', request),
};

if (window.location.search === '?runtime-test') {
  bridge.test = Object.freeze({
    setBehavior: (behavior) => ipcRenderer.invoke('companion:test:behavior', behavior),
    getResponses: () => ipcRenderer.invoke('companion:test:responses'),
  });
}

contextBridge.exposeInMainWorld('cobblemonCompanion', Object.freeze(bridge));
