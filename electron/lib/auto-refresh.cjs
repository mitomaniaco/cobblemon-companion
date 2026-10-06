'use strict';

/**
 * Política do monitoramento contínuo do save. O monitor liga ao abrir o app (sem esperar a primeira leitura manual);
 * o interruptor "Atualizar automaticamente" só liga e desliga o monitor. A leitura inicial e os botões de releitura
 * independem dele. `watcher` é o `createSaveWatcher` (ou null no modo de teste da UI, onde não há arquivo a observar).
 */
function createAutoRefresh(watcher) {
  let enabled = true;
  return {
    get enabled() {
      return enabled;
    },
    /** Ao abrir o app: liga o monitor se o interruptor estiver ligado. Config inválida deixa desligado, sem erro. */
    start() {
      if (watcher && enabled) watcher.start();
    },
    /** Interruptor do usuário. */
    setEnabled(next) {
      enabled = next;
      if (!watcher) return;
      if (next) watcher.start();
      else watcher.stop();
    },
    /** Depois de uma leitura bem-sucedida: guarda a versão vista e (re)tenta ligar o monitor, caso a abertura tenha falhado. */
    afterRead(snapshot) {
      if (!watcher) return;
      watcher.acknowledge(snapshot);
      if (enabled) watcher.start();
    },
    stop() {
      watcher?.stop();
    },
  };
}

module.exports = {createAutoRefresh};
