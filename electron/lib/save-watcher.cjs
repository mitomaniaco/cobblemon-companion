'use strict';

const DEFAULT_DEBOUNCE_MS = 2000;
const DEFAULT_RETRY_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;

/** Assinatura do conteúdo observado: só os hashes das fontes decidem se o save mudou. */
function sourceSignature(snapshot) {
  return snapshot.sources.map((source) => `${source.kind}:${source.sha256}`).join('|');
}

/**
 * Monitor somente leitura do save. Observa os arquivos com `watch` (fs.watch, injetável), agrupa rajadas de eventos
 * em uma única releitura (debounce) e só notifica quando os hashes das fontes mudam. Uma leitura que cai no meio da
 * escrita do servidor (`ERR_IMPORT_CHANGED`) é repetida depois de `retryMs`, no máximo `maxRetries` vezes por rajada.
 *
 * - `resolvePaths()` devolve os caminhos a observar (objeto de caminhos); é chamado a cada `start`.
 * - `readSnapshot()` relê o snapshot e lança em caso de falha.
 * - `onChange(snapshot)` recebe o snapshot novo.
 */
function createSaveWatcher({
  watch,
  resolvePaths,
  readSnapshot,
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  retryMs = DEFAULT_RETRY_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
}) {
  let watchers = [];
  let timer = null;
  let retries = 0;
  let signature = null;
  let running = false;

  function clearTimer() {
    clearTimeout(timer);
    timer = null;
  }

  function refresh() {
    timer = null;
    if (!running) return;
    let snapshot;
    try {
      snapshot = readSnapshot();
    } catch (error) {
      if (error?.code === 'ERR_IMPORT_CHANGED' && retries < maxRetries) {
        retries += 1;
        timer = setTimeout(refresh, retryMs);
      } else {
        retries = 0;
      }
      return;
    }
    retries = 0;
    const next = sourceSignature(snapshot);
    if (next === signature) return;
    signature = next;
    onChange(snapshot);
  }

  function schedule() {
    if (!running) return;
    clearTimer();
    retries = 0;
    timer = setTimeout(refresh, debounceMs);
  }

  function closeWatchers() {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        /* um watcher já fechado não impede fechar os demais */
      }
    }
    watchers = [];
  }

  return {
    /** Registra o snapshot lido pelo usuário como referência, para não notificar o que ele já viu. */
    acknowledge(snapshot) {
      signature = sourceSignature(snapshot);
    },
    /** Liga os watchers nos arquivos atuais. Sem efeito se já estiver ligado; caminhos inválidos deixam desligado. */
    start() {
      if (running) return true;
      let paths;
      try {
        paths = Object.values(resolvePaths());
      } catch {
        return false;
      }
      running = true;
      for (const file of paths) {
        try {
          const watcher = watch(file, schedule);
          watcher.on?.('error', () => {});
          watchers.push(watcher);
        } catch {
          /* arquivo ausente: a próxima leitura manual religa o monitoramento */
        }
      }
      return true;
    },
    stop() {
      running = false;
      clearTimer();
      retries = 0;
      closeWatchers();
    },
    get running() {
      return running;
    },
  };
}

module.exports = {createSaveWatcher};
