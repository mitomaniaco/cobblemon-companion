import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const {readGuideProgressFromConfig, resolveProgressSourcePaths} = require('../electron/lib/progress.cjs');
const tempDirs = new Set();

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs) fs.rmSync(dir, {recursive: true, force: true});
  tempDirs.clear();
});

function nbtString(value) {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}
function tag(type, name, payload) {
  return Buffer.concat([Buffer.from([type]), nbtString(name), payload]);
}
function compound(name, children) {
  return tag(10, name, Buffer.concat([...children, Buffer.from([0])]));
}
function int(name, value) {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32BE(value);
  return tag(3, name, bytes);
}
function string(name, value) {
  return tag(8, name, nbtString(value));
}
function byte(name, value) {
  return tag(1, name, Buffer.from([value]));
}
function long(name, value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64BE(BigInt(value));
  return tag(4, name, bytes);
}
function syntheticNbt({invalidVictoryCount = false, withLong = false} = {}) {
  const defeats = compound('progressDefeats', [
    int('rctmod:trainer_a', 2),
    int('rctmod:trainer_b', 0),
    ...(withLong ? [long('rctmod:trainer_long', 5)] : []),
    ...(invalidVictoryCount ? [string('invalid', 'nope')] : []),
  ]);
  const completed = compound('completedSeries', [byte('series-a', 1)]);
  const data = compound('data', [string('currentSeries', 'series-a'), byte('currentSeriesCompleted', 1), completed, defeats]);
  return zlib.gzipSync(Buffer.concat([Buffer.from([10]), nbtString(''), data, Buffer.from([0])]));
}
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-reader-'));
  tempDirs.add(dir);
  const root = path.join(dir, 'server');
  const world = path.join(root, 'saves', 'world');
  fs.mkdirSync(path.join(world, 'data'), {recursive: true});
  fs.mkdirSync(path.join(world, 'advancements'), {recursive: true});
  fs.writeFileSync(path.join(root, 'server.properties'), 'level-name=saves/world\n');
  const uuid = '12345678-1234-1234-1234-123456789abc';
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot: root, playerUuid: uuid}));
  const statsPath = path.join(world, 'data', `rctmod.player.${uuid}.stat.dat`);
  const pikaPath = path.join(world, 'advancements', `${uuid}.json`);
  return {configPath, statsPath, pikaPath, options: {configPath}};
}

describe('RCT and Pika progress reader', () => {
  it('reads RCT counts from synthetic gzip NBT and absent Pika keys as false', () => {
    const env = setup();
    fs.writeFileSync(env.statsPath, syntheticNbt());
    fs.writeFileSync(env.pikaPath, JSON.stringify({'allthemons:kanto_pika_star': {done: true, criteria: {star: 'synthetic'}}}));
    const progress = readGuideProgressFromConfig(env.options);
    expect(progress.currentSeries).toBe('series-a');
    expect(progress.currentSeriesCompleted).toBe(true);
    expect(progress.completedSeries).toEqual(['series-a']);
    expect({...progress.victoryCounts}).toEqual({'rctmod:trainer_a': 2, 'rctmod:trainer_b': 0});
    expect(progress.defeated).toEqual(['rctmod:trainer_a']);
    expect(JSON.stringify(progress)).not.toContain('12345678-1234-1234-1234-123456789abc');
    expect(progress.pikaStar.kanto).toBe(true);
    expect(progress.pikaStar.johto).toBe(false);
    expect(progress.sources.map(({kind}) => kind)).toEqual(['rct-stats', 'pika-advancements']);
  });

  it('keeps absent and malformed source fields unknown while preserving a valid independent source', () => {
    const env = setup();
    fs.writeFileSync(env.pikaPath, '{broken');
    let progress = readGuideProgressFromConfig(env.options);
    expect(progress.currentSeries).toBeNull();
    expect(progress.defeated).toBeNull();
    expect(progress.pikaStar.kanto).toBeNull();
    fs.writeFileSync(env.statsPath, syntheticNbt());
    fs.writeFileSync(env.pikaPath, JSON.stringify({'allthemons:kanto_pika_star': {done: 'yes', criteria: {}}}));
    progress = readGuideProgressFromConfig(env.options);
    expect(progress.currentSeries).toBe('series-a');
    expect(progress.pikaStar.kanto).toBeNull();
    expect(progress.pikaStar.johto).toBe(false);
  });

  it('entradas válidas entram em victoryCounts mesmo com uma chave anômala no NBT', () => {
    const env = setup();
    fs.writeFileSync(env.statsPath, syntheticNbt({invalidVictoryCount: true}));
    const progress = readGuideProgressFromConfig(env.options);
    expect({...progress.victoryCounts}).toEqual({'rctmod:trainer_a': 2, 'rctmod:trainer_b': 0});
    expect(progress.defeated).toEqual(['rctmod:trainer_a']);
  });

  it('suporta TAG_Long (strings 64-bit do parser NBT) em progressDefeats', () => {
    const env = setup();
    fs.writeFileSync(env.statsPath, syntheticNbt({withLong: true}));
    const progress = readGuideProgressFromConfig(env.options);
    expect(progress.victoryCounts['rctmod:trainer_long']).toBe(5);
    expect(progress.defeated).toContain('rctmod:trainer_long');
  });

  it('registra diagnóstico sanitizado quando statsPath está ausente', () => {
    const env = setup();
    const progress = readGuideProgressFromConfig(env.options);
    expect(progress.diagnostics).toContainEqual(expect.stringContaining('rctmod.player.<uuid>.stat.dat'));
  });

  it.skipIf(process.platform === 'win32')('resolves progress paths under the real world root and rejects symlink escapes', () => {
    const env = setup();
    fs.writeFileSync(env.statsPath, syntheticNbt());
    expect(resolveProgressSourcePaths(env.options).statsPath).toBe(env.statsPath);
    const outside = path.join(path.dirname(env.configPath), 'outside.json');
    fs.writeFileSync(outside, '{}');
    fs.symlinkSync(outside, env.pikaPath);
    const progress = readGuideProgressFromConfig(env.options);
    expect(progress.currentSeries).toBe('series-a');
    expect(progress.pikaStar.kanto).toBeNull();
  });
  it('propagates ERR_IMPORT_CHANGED when an NBT source changes during its stable read', () => {
    const env = setup();
    fs.writeFileSync(env.statsPath, syntheticNbt());
    const openSync = fs.openSync;
    const readSync = fs.readSync;
    let statsFd = null;
    vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
      const fd = openSync(file, ...args);
      if (file === env.statsPath) statsFd = fd;
      return fd;
    });
    vi.spyOn(fs, 'readSync').mockImplementation((fd, ...args) => {
      const result = readSync(fd, ...args);
      if (fd === statsFd) {
        const changedAt = new Date(Date.now() + 5000);
        fs.utimesSync(env.statsPath, changedAt, changedAt);
      }
      return result;
    });
    let changedError;
    try {
      readGuideProgressFromConfig(env.options);
    } catch (error) {
      changedError = error;
    }
    expect(changedError?.code).toBe('ERR_IMPORT_CHANGED');
  });
});
