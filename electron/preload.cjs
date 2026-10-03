'use strict';

const {contextBridge, ipcRenderer} = require('electron');

const bridge = {
  calculate: request => ipcRenderer.invoke('companion:calculate', request),
  calculateRealDamage: request => ipcRenderer.invoke('companion:calculate-real-damage', request),
  cancel: jobId => ipcRenderer.invoke('companion:cancel', {jobId}),
  readPlayerSnapshot: (...args) => {
    if (args.length !== 0) return Promise.reject(new TypeError('A leitura do snapshot não aceita argumentos'));
    return ipcRenderer.invoke('companion:read-player-snapshot');
  },
};

if (window.location.search === '?runtime-test') {
  bridge.test = Object.freeze({
    setBehavior: behavior => ipcRenderer.invoke('companion:test:behavior', behavior),
    getResponses: () => ipcRenderer.invoke('companion:test:responses'),
  });
}

contextBridge.exposeInMainWorld('cobblemonCompanion', Object.freeze(bridge));

