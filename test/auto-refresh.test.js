import {createRequire} from 'node:module';
import {describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {createAutoRefresh} = require('../electron/lib/auto-refresh.cjs');

const fakeWatcher = () => ({start: vi.fn(() => true), stop: vi.fn(), acknowledge: vi.fn()});

describe('monitoramento automático do save', () => {
  it('liga o monitor ao abrir o app, sem esperar a primeira leitura manual', () => {
    const watcher = fakeWatcher();
    createAutoRefresh(watcher).start();
    expect(watcher.start).toHaveBeenCalledTimes(1);
  });

  it('com o interruptor desligado o monitor não liga ao abrir nem depois de uma leitura manual', () => {
    const watcher = fakeWatcher();
    const auto = createAutoRefresh(watcher);
    auto.setEnabled(false);
    watcher.start.mockClear();
    auto.start();
    auto.afterRead({sources: []});
    expect(watcher.start).not.toHaveBeenCalled();
    expect(watcher.stop).toHaveBeenCalledTimes(1);
  });

  it('a leitura manual sempre registra a versão vista, mesmo com o interruptor desligado', () => {
    const watcher = fakeWatcher();
    const auto = createAutoRefresh(watcher);
    auto.setEnabled(false);
    const snapshot = {sources: [{kind: 'party', sha256: 'a'}]};
    auto.afterRead(snapshot);
    expect(watcher.acknowledge).toHaveBeenCalledWith(snapshot);
  });

  it('religar o interruptor liga o monitor; uma leitura depois de abertura sem config tenta ligar de novo', () => {
    const watcher = fakeWatcher();
    const auto = createAutoRefresh(watcher);
    auto.setEnabled(false);
    auto.setEnabled(true);
    expect(watcher.start).toHaveBeenCalledTimes(1);
    auto.afterRead({sources: []});
    expect(watcher.start).toHaveBeenCalledTimes(2);
  });

  it('aciona os watchers de snapshot e progresso juntos sem misturar a confirmação de fontes', () => {
    const snapshotWatcher = fakeWatcher();
    const progressWatcher = fakeWatcher();
    const auto = createAutoRefresh(snapshotWatcher, [progressWatcher]);
    auto.start();
    const progress = {sources: [{kind: 'rct-stats', sha256: 'a'}]};
    auto.afterRead(progress);
    auto.setEnabled(false);
    expect(snapshotWatcher.start).toHaveBeenCalledTimes(2);
    expect(progressWatcher.start).toHaveBeenCalledTimes(2);
    expect(snapshotWatcher.acknowledge).toHaveBeenCalledWith(progress);
    expect(progressWatcher.acknowledge).not.toHaveBeenCalled();
    expect(snapshotWatcher.stop).toHaveBeenCalledTimes(1);
    expect(progressWatcher.stop).toHaveBeenCalledTimes(1);
  });

  it('sem monitor (modo de teste da UI) o interruptor só guarda o estado', () => {
    const auto = createAutoRefresh(null);
    auto.start();
    auto.setEnabled(false);
    auto.afterRead({sources: []});
    auto.stop();
    expect(auto.enabled).toBe(false);
  });
});
