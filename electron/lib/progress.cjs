'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {parseNbt} = require('./nbt.cjs');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');
const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'];
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_NBT_BYTES = 16 * 1024 * 1024;

class ProgressError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProgressError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProgressError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeDataId(value) {
  return (
    typeof value === 'string' &&
    /^[a-z0-9_.-]{1,128}(?::[a-z0-9_.-]{1,128})?$/i.test(value) &&
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  );
}

function within(parent, candidate) {
  const rel = path.relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function readStable(filePath, maxBytes, requiredRoot = null) {
  let fd;
  try {
    const sourcePath = requiredRoot ? fs.realpathSync(filePath) : filePath;
    if (requiredRoot && !within(requiredRoot, sourcePath)) fail('ERR_IMPORT_PATH', 'Progress source is outside active world.');
    fd = fs.openSync(sourcePath, 'r');
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size < 0 || before.size > maxBytes)
      fail('ERR_IMPORT_READ', 'Progress source is invalid or exceeds its safe size limit.');
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('ERR_IMPORT_CHANGED', 'Progress source changed during reading.');
      offset += count;
    }
    const after = fs.fstatSync(fd);
    const current = fs.statSync(sourcePath);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      before.ino !== after.ino ||
      after.dev !== current.dev ||
      after.ino !== current.ino ||
      after.size !== current.size ||
      after.mtimeMs !== current.mtimeMs ||
      after.ctimeMs !== current.ctimeMs
    )
      fail('ERR_IMPORT_CHANGED', 'Progress source changed during reading.');
    return {bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  } catch (error) {
    if (error instanceof ProgressError) throw error;
    if (fd !== undefined && error?.code === 'ENOENT') fail('ERR_IMPORT_CHANGED', 'Progress source changed during reading.');
    fail(error?.code === 'ENOENT' ? 'ERR_IMPORT_SOURCE_MISSING' : 'ERR_IMPORT_READ', 'Unable to read progress source.');
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* best-effort close */
      }
    }
  }
}
function publicProgressError(error) {
  if (error instanceof ProgressError) return error;
  return new ProgressError(
    error?.code === 'ERR_IMPORT_CHANGED' ? 'ERR_IMPORT_CHANGED' : 'ERR_IMPORT_READ',
    'Unable to read guide progress.',
  );
}
function containedSource(worldRoot, candidate) {
  if (!within(worldRoot, candidate)) fail('ERR_IMPORT_PATH', 'Progress source is outside active world.');
  try {
    const real = fs.realpathSync(candidate);
    if (!within(worldRoot, real) || !fs.statSync(real).isFile()) fail('ERR_IMPORT_PATH', 'Progress source is outside active world.');
    return real;
  } catch (error) {
    if (error instanceof ProgressError) throw error;
    if (error?.code !== 'ENOENT') fail('ERR_IMPORT_PATH', 'Unable to validate progress source.');
    let parent = path.dirname(candidate);
    while (parent === worldRoot || within(worldRoot, parent)) {
      try {
        const realParent = fs.realpathSync(parent);
        if (realParent !== worldRoot && !within(worldRoot, realParent)) fail('ERR_IMPORT_PATH', 'Progress source is outside active world.');
        return path.resolve(realParent, path.relative(parent, candidate));
      } catch (parentError) {
        if (parentError instanceof ProgressError) throw parentError;
        if (parentError?.code !== 'ENOENT') fail('ERR_IMPORT_PATH', 'Unable to validate progress source.');
        parent = path.dirname(parent);
      }
    }
    fail('ERR_IMPORT_PATH', 'Progress source is outside active world.');
  }
}

function resolveProgressSourcePaths(options = {}) {
  try {
    const configPath = path.resolve(options.configPath || DEFAULT_CONFIG_PATH);
    const configSource = readStable(configPath, MAX_CONFIG_BYTES);
    const config = JSON.parse(configSource.bytes.toString('utf8'));
    if (
      !isRecord(config) ||
      typeof config.serverRoot !== 'string' ||
      !path.isAbsolute(config.serverRoot) ||
      typeof config.playerUuid !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(config.playerUuid)
    )
      fail('ERR_IMPORT_CONFIG', 'Progress configuration is invalid.');
    const root = fs.realpathSync(path.resolve(config.serverRoot));
    const propertiesPath = path.join(root, 'server.properties');
    const propertiesSource = readStable(propertiesPath, MAX_CONFIG_BYTES);
    const properties = propertiesSource.bytes.toString('utf8');
    const name = [...properties.matchAll(/^\s*level-name\s*=\s*(.*?)\s*$/gm)].at(-1)?.[1];
    if (!name || name.includes('\0') || path.isAbsolute(name)) fail('ERR_IMPORT_WORLD_NAME', 'Active world name is invalid.');
    const candidate = path.resolve(root, name);
    if (!within(root, candidate)) fail('ERR_IMPORT_PATH', 'Active world is outside server root.');
    const worldRoot = fs.realpathSync(candidate);
    if (!within(root, worldRoot) || !fs.statSync(worldRoot).isDirectory()) fail('ERR_IMPORT_PATH', 'Active world is outside server root.');
    const uuid = config.playerUuid.toLowerCase();
    return {
      worldRoot,
      configPath,
      propertiesPath,
      statsPath: path.join(worldRoot, 'data', `rctmod.player.${uuid}.stat.dat`),
      pikaPath: path.join(worldRoot, 'advancements', `${uuid}.json`),
      resolution: {configSha256: configSource.sha256, propertiesSha256: propertiesSource.sha256},
    };
  } catch (error) {
    throw publicProgressError(error);
  }
}

function readGuideProgressFromConfig(options = {}) {
  const result = {
    defeated: null,
    victoryCounts: null,
    currentSeries: null,
    currentSeriesCompleted: null,
    completedSeries: null,
    levelCap: null,
    pikaStar: Object.fromEntries(REGIONS.map((region) => [region, null])),
    sources: [],
    diagnostics: [],
  };
  let paths;
  try {
    paths = resolveProgressSourcePaths(options);
  } catch (error) {
    if (error?.code === 'ERR_IMPORT_CHANGED') throw error;
    result.diagnostics.push(error.message || 'Não foi possível resolver os caminhos do mundo ativo.');
    return result;
  }

  try {
    const source = readStable(containedSource(paths.worldRoot, paths.statsPath), MAX_SOURCE_BYTES, paths.worldRoot);
    result.sources.push({kind: 'rct-stats', sha256: source.sha256});
    try {
      const raw =
        source.bytes[0] === 0x1f && source.bytes[1] === 0x8b
          ? zlib.gunzipSync(source.bytes, {maxOutputLength: MAX_NBT_BYTES})
          : source.bytes;
      if (raw.length > MAX_NBT_BYTES) throw new Error();
      const data = parseNbt(raw)?.data;
      if (!isRecord(data)) throw new Error();
      if (safeDataId(data.currentSeries)) result.currentSeries = data.currentSeries;
      if (data.currentSeriesCompleted === 0 || data.currentSeriesCompleted === 1)
        result.currentSeriesCompleted = data.currentSeriesCompleted === 1;
      if (isRecord(data.completedSeries)) {
        const ids = Object.keys(data.completedSeries);
        if (ids.every(safeDataId)) result.completedSeries = ids;
      }
      if (isRecord(data.progressDefeats)) {
        const counts = {};
        const defeated = [];
        for (const [id, count] of Object.entries(data.progressDefeats)) {
          if (!safeDataId(id)) continue;
          const numericCount = typeof count === 'number' || typeof count === 'string' ? Number(count) : null;
          if (numericCount !== null && Number.isSafeInteger(numericCount) && numericCount >= 0) {
            Object.defineProperty(counts, id, {value: numericCount, enumerable: true, writable: true, configurable: true});
            if (numericCount > 0) defeated.push(id);
          }
        }
        if (Object.keys(counts).length > 0) {
          result.victoryCounts = counts;
          result.defeated = defeated;
        } else if (Object.keys(data.progressDefeats).length === 0) {
          result.victoryCounts = {};
          result.defeated = [];
        }
      }
    } catch (error) {
      if (error?.code === 'ERR_IMPORT_CHANGED') throw error;
      /* The source hash remains available so the watcher can observe recovery. */
    }
  } catch (error) {
    if (error?.code === 'ERR_IMPORT_CHANGED') throw error;
    if (error?.code === 'ERR_IMPORT_SOURCE_MISSING') {
      result.diagnostics.push('Arquivo de estatísticas do RCT (rctmod.player.<uuid>.stat.dat) não encontrado no mundo ativo.');
    }
    /* Missing or unreadable source leaves its fields unknown. */
  }

  try {
    const source = readStable(containedSource(paths.worldRoot, paths.pikaPath), MAX_SOURCE_BYTES, paths.worldRoot);
    result.sources.push({kind: 'pika-advancements', sha256: source.sha256});
    const parsed = JSON.parse(source.bytes.toString('utf8'));
    if (!isRecord(parsed)) throw new Error();
    for (const region of REGIONS) {
      const advancement = parsed[`allthemons:${region}_pika_star`];
      if (advancement === undefined) result.pikaStar[region] = false;
      else if (isRecord(advancement) && isRecord(advancement.criteria) && typeof advancement.done === 'boolean')
        result.pikaStar[region] = advancement.done;
    }
  } catch (error) {
    if (error?.code === 'ERR_IMPORT_CHANGED') throw error;
    if (error?.code === 'ERR_IMPORT_SOURCE_MISSING') {
      result.diagnostics.push('Arquivo de advancements (<uuid>.json) não encontrado no mundo ativo.');
    }
    /* Invalid or unreadable source leaves its fields unknown. */
  }

  let confirmed;
  try {
    confirmed = resolveProgressSourcePaths(options);
  } catch {
    fail('ERR_IMPORT_CHANGED', 'Progress sources changed during reading.');
  }
  if (
    confirmed.configPath !== paths.configPath ||
    confirmed.propertiesPath !== paths.propertiesPath ||
    confirmed.worldRoot !== paths.worldRoot ||
    confirmed.statsPath !== paths.statsPath ||
    confirmed.pikaPath !== paths.pikaPath ||
    confirmed.resolution.configSha256 !== paths.resolution.configSha256 ||
    confirmed.resolution.propertiesSha256 !== paths.resolution.propertiesSha256
  )
    fail('ERR_IMPORT_CHANGED', 'Progress sources changed during reading.');
  return result;
}

module.exports = {readGuideProgressFromConfig, resolveProgressSourcePaths, publicProgressError};
