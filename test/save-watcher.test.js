import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {createSaveWatcher} = require('../electron/lib/save-watcher.cjs');

const PATHS = {configPath: '/c', propertiesPath: '/p', partyPath: '/party', pcPath: '/pc'};
const snapshot = (party, pc = 'pc-1') => ({
  sources: [
    {kind: 'party', sha256: party},
    {kind: 'pc', sha256: pc},
  ],
});

function setup({reads, paths = () => PATHS, watchFails = []} = {}) {
  const listeners = new Map();
  const closed = [];
  const watch = vi.fn((file, listener) => {
    if (watchFails.includes(file)) throw Object.assign(new Error('gone'), {code: 'ENOENT'});
    listeners.set(file, listener);
    return {on: vi.fn(), close: () => closed.push(file)};
  });
  const queue = [...reads];
  const readSnapshot = vi.fn(() => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const onChange = vi.fn();
  const watcher = createSaveWatcher({watch, resolvePaths: paths, readSnapshot, onChange});
  return {watcher, watch, listeners, closed, readSnapshot, onChange, fire: (file = '/party') => listeners.get(file)('change')};
}

const changedError = () => Object.assign(new Error('mudou'), {code: 'ERR_IMPORT_CHANGED'});

describe('monitoramento do save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('observa os quatro arquivos e junta uma rajada de eventos em uma única releitura após 2 s', () => {
    const t = setup({reads: [snapshot('new')]});
    t.watcher.acknowledge(snapshot('old'));
    expect(t.watcher.start()).toBe(true);
    expect([...t.listeners.keys()].sort()).toEqual(Object.values(PATHS).sort());

    t.fire('/party');
    vi.advanceTimersByTime(1500);
    t.fire('/pc');
    vi.advanceTimersByTime(1999);
    expect(t.readSnapshot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.readSnapshot).toHaveBeenCalledTimes(1);
    expect(t.onChange).toHaveBeenCalledWith(snapshot('new'));
  });

  it('não notifica quando os hashes das fontes não mudaram (só o mtime mexeu)', () => {
    const t = setup({reads: [snapshot('same')]});
    t.watcher.acknowledge(snapshot('same'));
    t.watcher.start();
    t.fire();
    vi.advanceTimersByTime(2000);
    expect(t.readSnapshot).toHaveBeenCalledTimes(1);
    expect(t.onChange).not.toHaveBeenCalled();
  });

  it('notifica uma mudança do PC mesmo com a party igual, e não repete a mesma versão', () => {
    const t = setup({reads: [snapshot('p', 'pc-2'), snapshot('p', 'pc-2')]});
    t.watcher.acknowledge(snapshot('p', 'pc-1'));
    t.watcher.start();
    t.fire('/pc');
    vi.advanceTimersByTime(2000);
    t.fire('/pc');
    vi.advanceTimersByTime(2000);
    expect(t.onChange).toHaveBeenCalledTimes(1);
  });

  it('repete após 5 s quando a leitura pega o servidor escrevendo e entrega o resultado da nova tentativa', () => {
    const t = setup({reads: [changedError(), snapshot('new')]});
    t.watcher.acknowledge(snapshot('old'));
    t.watcher.start();
    t.fire();
    vi.advanceTimersByTime(2000);
    expect(t.onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(t.readSnapshot).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(t.readSnapshot).toHaveBeenCalledTimes(2);
    expect(t.onChange).toHaveBeenCalledWith(snapshot('new'));
  });

  it('desiste depois de 3 novas tentativas e recomeça a contagem no próximo evento', () => {
    const t = setup({reads: Array.from({length: 8}, changedError)});
    t.watcher.acknowledge(snapshot('old'));
    t.watcher.start();
    t.fire();
    vi.advanceTimersByTime(2000 + 5000 * 10);
    expect(t.readSnapshot).toHaveBeenCalledTimes(4);

    t.fire();
    vi.advanceTimersByTime(2000 + 5000 * 10);
    expect(t.readSnapshot).toHaveBeenCalledTimes(8);
    expect(t.onChange).not.toHaveBeenCalled();
  });

  it('outro erro de leitura não agenda nova tentativa nem derruba o monitor', () => {
    const t = setup({reads: [new Error('ERR_IMPORT_FAILED'), snapshot('new')]});
    t.watcher.acknowledge(snapshot('old'));
    t.watcher.start();
    t.fire();
    vi.advanceTimersByTime(60000);
    expect(t.readSnapshot).toHaveBeenCalledTimes(1);
    t.fire();
    vi.advanceTimersByTime(2000);
    expect(t.onChange).toHaveBeenCalledWith(snapshot('new'));
  });

  it('stop fecha todos os watchers e cancela a releitura pendente', () => {
    const t = setup({reads: [snapshot('new')]});
    t.watcher.acknowledge(snapshot('old'));
    t.watcher.start();
    t.fire();
    t.watcher.stop();
    vi.advanceTimersByTime(10000);
    expect(t.closed.sort()).toEqual(Object.values(PATHS).sort());
    expect(t.readSnapshot).not.toHaveBeenCalled();
    expect(t.watcher.running).toBe(false);
  });

  it('pode ser religado depois de parado e não duplica watchers se já estiver ligado', () => {
    const t = setup({reads: []});
    t.watcher.start();
    t.watcher.start();
    expect(t.watch).toHaveBeenCalledTimes(4);
    t.watcher.stop();
    t.watcher.start();
    expect(t.watch).toHaveBeenCalledTimes(8);
  });

  it('não liga quando os caminhos não podem ser resolvidos e segue com os arquivos que existem', () => {
    const broken = setup({
      reads: [],
      paths: () => {
        throw new Error('sem config');
      },
    });
    expect(broken.watcher.start()).toBe(false);
    expect(broken.watcher.running).toBe(false);

    const partial = setup({reads: [], watchFails: ['/pc']});
    expect(partial.watcher.start()).toBe(true);
    expect([...partial.listeners.keys()]).not.toContain('/pc');
  });
});
