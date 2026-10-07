'use strict';

/**
 * Política do monitoramento contínuo do save. O monitor liga ao abrir o app (sem esperar a primeira leitura manual);
 * o interruptor "Atualizar automaticamente" só liga e desliga o monitor. A leitura inicial e os botões de releitura
 * independem dele. `watcher` é o `createSaveWatcher` (ou null no modo de teste da UI, onde não há arquivo a observar).
 */
function createAutoRefresh(watcher, additionalWatchers = []) {
  const watchers = [watcher, ...additionalWatchers].filter(Boolean);
  let enabled = true;
  return {
    get enabled() {
      return enabled;
    },
    /** Ao abrir o app: liga os monitores se o interruptor estiver ligado. Configuração inválida deixa-os desligados. */
    start() {
      if (enabled) for (const item of watchers) item.start();
    },
    /** Interruptor do usuário. */
    setEnabled(next) {
      enabled = next;
      for (const item of watchers) {
        if (next) item.start();
        else item.stop();
      }
    },
    /** Depois de uma leitura bem-sucedida: guarda a versão vista e (re)tenta ligar o monitor. */
    afterRead(snapshot) {
      watcher?.acknowledge(snapshot);
      if (enabled) for (const item of watchers) item.start();
    },
    stop() {
      for (const item of watchers) item.stop();
    },
  };
}

module.exports = {createAutoRefresh};
