'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {parseNbt} = require('./lib/nbt.cjs');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_PROPERTIES_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_NBT_BYTES = 16 * 1024 * 1024;
const MAX_INDIVIDUALS = 10_000;
const MAX_PC_BOXES = 512;
const MAX_EQUIPPED_MOVES = 4;
const MAX_LEARNED_MOVES = 128;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_ID_LENGTH = 256;
const SOURCE_ID_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/;

class PlayerImportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlayerImportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlayerImportError(code, message);
}

function sourceLabel(kind) {
  if (kind === 'party') return 'party';
  if (kind === 'pc') return 'PC';
  if (kind === 'server.properties') return 'server.properties';
  return 'configuração local';
}

function readStableSource(filePath, kind, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const before = fs.fstatSync(fd);
    if (!before.isFile()) fail('ERR_IMPORT_SOURCE_TYPE', `A fonte de ${sourceLabel(kind)} não é um arquivo regular.`);
    if (before.size > maxBytes) fail('ERR_IMPORT_TOO_LARGE', `A fonte de ${sourceLabel(kind)} excede o limite seguro de leitura.`);
    if (before.size < 0) fail('ERR_IMPORT_SOURCE_SIZE', `O tamanho da fonte de ${sourceLabel(kind)} é inválido.`);

    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (read === 0) fail('ERR_IMPORT_CHANGED', 'Os arquivos mudaram durante a leitura; atualize novamente após o servidor estabilizar.');
      offset += read;
    }

    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino) {
      fail('ERR_IMPORT_CHANGED', 'Os arquivos mudaram durante a leitura; atualize novamente após o servidor estabilizar.');
    }
    const modifiedAt = after.mtime.toISOString();
    return {
      bytes,
      source: {
        kind,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        modifiedAt,
        size: bytes.length,
      },
      observed: {mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs, ino: after.ino},
    };
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    if (error && error.code === 'ENOENT') {
      if (kind === 'party' || kind === 'pc') {
        fail(
          'ERR_IMPORT_SOURCE_MISSING',
          `Não foi possível encontrar os dados de ${sourceLabel(kind)} no mundo ativo. Confirme que o servidor salvou o mundo e tente novamente.`,
        );
      }
      if (kind === 'server.properties')
        fail('ERR_IMPORT_SERVER_CONFIG', 'Não foi possível ler server.properties no diretório configurado.');
      fail('ERR_IMPORT_CONFIG', 'Não foi possível ler a configuração local do importador.');
    }
    fail('ERR_IMPORT_READ', `Falha ao ler a fonte de ${sourceLabel(kind)}.`);
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* fechamento best-effort */
      }
    }
  }
}

function sameObservation(left, right) {
  return (
    left.source.sha256 === right.source.sha256 &&
    left.source.modifiedAt === right.source.modifiedAt &&
    left.source.size === right.source.size &&
    left.observed.mtimeMs === right.observed.mtimeMs &&
    left.observed.ctimeMs === right.observed.ctimeMs &&
    left.observed.ino === right.observed.ino
  );
}

function ensureWithin(parent, candidate, label) {
  const relative = path.relative(parent, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('ERR_IMPORT_PATH', `${label} precisa estar dentro do diretório configurado.`);
  }
  return candidate;
}

function realDirectory(parent, candidate, label) {
  try {
    const parentReal = fs.realpathSync(parent);
    const candidateReal = fs.realpathSync(candidate);
    ensureWithin(parentReal, candidateReal, label);
    if (!fs.statSync(candidateReal).isDirectory()) fail('ERR_IMPORT_PATH', `${label} não é uma pasta válida.`);
    return {parentReal, candidateReal};
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    fail('ERR_IMPORT_WORLD', `Não foi possível acessar ${label} dentro do diretório configurado.`);
  }
}

function containedFile(directory, parts, label) {
  const candidate = path.resolve(directory, ...parts);
  ensureWithin(directory, candidate, label);
  try {
    const real = fs.realpathSync(candidate);
    ensureWithin(directory, real, label);
    if (!fs.statSync(real).isFile()) fail('ERR_IMPORT_PATH', `${label} não é um arquivo válido.`);
    return real;
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    if (error && error.code === 'ENOENT') return candidate;
    fail('ERR_IMPORT_PATH', `Não foi possível validar a fonte de ${label}.`);
  }
}

function parseJson(bytes, label) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('ERR_IMPORT_CONFIG', `A fonte de ${label} precisa conter um objeto JSON.`);
    return value;
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    fail('ERR_IMPORT_CONFIG', `Não foi possível interpretar ${label}.`);
  }
}

function parseWorldName(bytes) {
  const text = bytes.toString('utf8');
  const matches = [...text.matchAll(/^\s*level-name\s*=\s*(.*?)\s*$/gm)];
  const worldName = matches.at(-1)?.[1];
  if (!worldName || worldName.includes('\0') || path.isAbsolute(worldName)) {
    fail('ERR_IMPORT_WORLD_NAME', 'server.properties não informa um nome relativo válido para o mundo ativo.');
  }
  return worldName;
}

function parseBoundedNbt(bytes, kind) {
  try {
    const input = bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes, {maxOutputLength: MAX_NBT_BYTES}) : bytes;
    if (input.length > MAX_NBT_BYTES)
      fail('ERR_IMPORT_TOO_LARGE', `Os dados de ${sourceLabel(kind)} excedem o limite seguro após descompressão.`);
    const value = parseNbt(input);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('ERR_IMPORT_NBT', `Os dados de ${sourceLabel(kind)} têm estrutura NBT inválida.`);
    return value;
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    if (error?.code === 'ERR_BUFFER_TOO_LARGE') {
      fail('ERR_IMPORT_TOO_LARGE', `Os dados de ${sourceLabel(kind)} excedem o limite seguro após descompressão.`);
    }
    fail('ERR_IMPORT_NBT', `Não foi possível interpretar os dados NBT de ${sourceLabel(kind)}.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SOURCE_ID_LENGTH) return null;
  return SOURCE_ID_PATTERN.test(value) ? value : null;
}

function formatUuid(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((part) => !Number.isInteger(part) || part < -0x80000000 || part > 0xffffffff)
  ) {
    fail('ERR_IMPORT_IDENTITY', 'Um indivíduo da party/PC tem UUID ausente ou inválido; snapshot recusado.');
  }
  const hex = value.map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function addUnknown(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeMoves(value, field, maxLength, unknownCounts) {
  if (value === undefined || value === null) {
    addUnknown(unknownCounts, field);
    return {moves: [], known: false};
  }
  if (!Array.isArray(value)) fail('ERR_IMPORT_MOVES', `O campo ${field} tem estrutura inválida; snapshot recusado.`);
  if (value.length > maxLength) fail('ERR_IMPORT_LIMIT', `O campo ${field} excede o limite seguro de golpes.`);
  const moves = value.map((move) => {
    if (!isRecord(move)) fail('ERR_IMPORT_MOVES', `O campo ${field} contém um golpe inválido; snapshot recusado.`);
    const id = sourceId(move.MoveName);
    if (!id) fail('ERR_IMPORT_MOVES', `O campo ${field} contém golpe sem identificador; snapshot recusado.`);
    const ppUps = nonNegativeInteger(move.RaisedPPStages);
    if (ppUps === null) addUnknown(unknownCounts, `${field}PpUps`);
    if (field === 'equippedMoves') {
      const pp = nonNegativeInteger(move.MovePP);
      if (pp === null) addUnknown(unknownCounts, 'movePp');
      return {id, pp, ppUps};
    }
    return {id, ppUps};
  });
  return {moves, known: true};
}

const STAT_FIELDS = [
  ['cobblemon:hp', 'hp'],
  ['cobblemon:attack', 'atk'],
  ['cobblemon:defence', 'def'],
  ['cobblemon:special_attack', 'spa'],
  ['cobblemon:special_defence', 'spd'],
  ['cobblemon:speed', 'spe'],
];
const STAT_FIELD_NAMES = new Set(STAT_FIELDS.map(([name]) => name));
const INVALID_STATS_MESSAGE = 'IVs/EVs têm dados inválidos ou formato não suportado; snapshot recusado.';

function normalizeBattleStats(value, location, unknownCounts) {
  const nbtRoot = location.container === 'party' ? `Slot${location.slot}` : `Box${location.box}.Slot${location.slot}`;
  const provenance = (nbtPath) => ({sourceKind: location.container, nbtPath});
  const known = (factValue, nbtPath) => ({state: 'known', value: factValue, provenance: provenance(nbtPath)});
  const unknown = (group, nbtPath) => {
    addUnknown(unknownCounts, group);
    return {state: 'unknown', reason: 'not-captured', provenance: provenance(nbtPath)};
  };
  const invalid = () => fail('ERR_IMPORT_STATS', INVALID_STATS_MESSAGE);
  const validateMap = (map) => {
    if (!isRecord(map) || Object.keys(map).some((name) => !STAT_FIELD_NAMES.has(name))) invalid();
    return map;
  };

  let baseMap;
  let hyperTrainedMap;
  if (value.IVs !== undefined) {
    if (!isRecord(value.IVs) || Object.keys(value.IVs).some((name) => name !== 'Base' && name !== 'HyperTrained')) invalid();
    if (value.IVs.Base !== undefined) baseMap = validateMap(value.IVs.Base);
    if (value.IVs.HyperTrained !== undefined) hyperTrainedMap = validateMap(value.IVs.HyperTrained);
  }

  let evMap;
  if (value.EVs !== undefined) evMap = validateMap(value.EVs);

  const readGroup = (map, group, rootPath, max, missingOverrideIsKnownNull = false) => {
    const facts = {};
    for (const [nbtName, stat] of STAT_FIELDS) {
      const nbtPath = `${rootPath}.${nbtName}`;
      if (map === undefined || !Object.hasOwn(map, nbtName)) {
        facts[stat] = missingOverrideIsKnownNull && map !== undefined ? known(null, nbtPath) : unknown(group, nbtPath);
        continue;
      }
      const factValue = map[nbtName];
      if (typeof factValue !== 'number' || !Number.isSafeInteger(factValue) || factValue < 0 || factValue > max) invalid();
      facts[stat] = known(factValue, nbtPath);
    }
    return facts;
  };

  const ivs = readGroup(baseMap, 'ivs', `${nbtRoot}.IVs.Base`, 31);
  const hyperTrainedIvs = readGroup(hyperTrainedMap, 'hyperTrainedIvs', `${nbtRoot}.IVs.HyperTrained`, 31, true);
  const evs = readGroup(evMap, 'evs', `${nbtRoot}.EVs`, 252);
  const knownEvTotal = Object.values(evs)
    .filter((fact) => fact.state === 'known')
    .reduce((total, fact) => total + fact.value, 0);
  if (knownEvTotal > 510) invalid();
  return {ivs, hyperTrainedIvs, evs};
}

function occupiedIndividual(value) {
  if (value === undefined || value === null) return false;
  if (!isRecord(value)) fail('ERR_IMPORT_SLOT', 'Um slot da party/PC tem estrutura inválida; snapshot recusado.');
  if (Object.keys(value).length === 0) return false;
  return true;
}

function collectSlot(value, location, output, seenUuids, unknownCounts) {
  if (!occupiedIndividual(value)) return;
  if (output.length >= MAX_INDIVIDUALS) fail('ERR_IMPORT_LIMIT', 'A quantidade de indivíduos excede o limite seguro de importação.');
  const speciesId = sourceId(value.Species);
  if (!speciesId) fail('ERR_IMPORT_IDENTITY', 'Um slot ocupado não tem speciesId válido; snapshot recusado.');
  const uuid = formatUuid(value.UUID);
  if (seenUuids.has(uuid)) fail('ERR_IMPORT_DUPLICATE_UUID', 'UUID repetido entre party e PC; snapshot recusado como inconsistente.');
  seenUuids.add(uuid);

  const formId = sourceId(value.FormId) || 'unknown';
  if (formId === 'unknown') addUnknown(unknownCounts, 'formId');
  const level = nonNegativeInteger(value.Level);
  if (level === null) addUnknown(unknownCounts, 'level');

  const natureSource = typeof value.MintedNature === 'string' && value.MintedNature.trim() ? value.MintedNature : value.Nature;
  const nature = sourceId(natureSource);
  if (nature === null) addUnknown(unknownCounts, 'nature');

  const ability = sourceId(value.Ability?.AbilityName);
  if (ability === null) addUnknown(unknownCounts, 'ability');

  const heldItem = sourceId(value.HeldItem?.id);
  if (heldItem === null) addUnknown(unknownCounts, 'heldItem');

  const equippedMoves = normalizeMoves(value.MoveSet, 'equippedMoves', MAX_EQUIPPED_MOVES, unknownCounts);
  const learnedMoves = normalizeMoves(value.BenchedMoves, 'learnedMoves', MAX_LEARNED_MOVES, unknownCounts);

  const battleStats = normalizeBattleStats(value, location, unknownCounts);
  const individual = {
    uuid,
    speciesId,
    formId,
    level,
    location,
    equippedMoves: equippedMoves.moves,
    equippedMovesKnown: equippedMoves.known,
    learnedMoves: learnedMoves.moves,
    learnedMovesKnown: learnedMoves.known,
    observed: {nature, ability, heldItem},
    battleStats,
  };
  output.push(individual);
}

function collectIndividuals(partyData, pcData) {
  const individuals = [];
  const seenUuids = new Set();
  const unknownCounts = Object.create(null);

  for (const [key, value] of Object.entries(partyData)) {
    const match = key.match(/^Slot(\d+)$/);
    if (!match) continue;
    const slot = Number(match[1]);
    if (occupiedIndividual(value) && slot > 5) fail('ERR_IMPORT_SLOT', 'A party tem slot fora do limite esperado; snapshot recusado.');
    collectSlot(value, {container: 'party', slot}, individuals, seenUuids, unknownCounts);
  }

  let boxCount = 0;
  for (const [boxKey, boxData] of Object.entries(pcData)) {
    const boxMatch = boxKey.match(/^Box(\d+)$/);
    if (!boxMatch) continue;
    boxCount++;
    if (boxCount > MAX_PC_BOXES) fail('ERR_IMPORT_LIMIT', 'A quantidade de caixas excede o limite seguro de importação.');
    if (!isRecord(boxData)) fail('ERR_IMPORT_SLOT', 'Uma caixa do PC tem estrutura inválida; snapshot recusado.');
    const box = Number(boxMatch[1]);
    const boxName = typeof boxData.BoxName === 'string' ? boxData.BoxName : null;
    for (const [slotKey, value] of Object.entries(boxData)) {
      const slotMatch = slotKey.match(/^Slot(\d+)$/);
      if (!slotMatch) continue;
      const slot = Number(slotMatch[1]);
      collectSlot(value, {container: 'pc', box, boxName, slot}, individuals, seenUuids, unknownCounts);
    }
  }
  return {individuals, unknownCounts};
}

function warningsFor(counts) {
  const warnings = [];
  const labels = {
    formId: ['FormId ausente ou inválido', 'formId="unknown"'],
    level: ['Level ausente ou inválido', 'level=null'],
    nature: ['Nature/MintedNature ausente ou inválida', 'nature=null'],
    ability: ['AbilityName ausente ou inválido', 'ability=null'],
    heldItem: ['HeldItem.id ausente ou inválido', 'heldItem=null não confirma que o Pokémon esteja sem item'],
    equippedMoves: ['MoveSet ausente', 'equippedMoves=[] representa desconhecido'],
    learnedMoves: ['BenchedMoves ausente', 'learnedMoves=[] representa desconhecido'],
    movePp: ['MovePP ausente ou inválido', 'pp=null'],
    equippedMovesPpUps: ['RaisedPPStages ausente em MoveSet', 'ppUps=null'],
    learnedMovesPpUps: ['RaisedPPStages ausente em BenchedMoves', 'ppUps=null'],
    ivs: ['IVs ausentes ou incompletos', 'nenhum IV foi preenchido automaticamente'],
    hyperTrainedIvs: ['HyperTrained ausente ou incompleto', 'nenhum override foi presumido'],
    evs: ['EVs ausentes ou incompletos', 'nenhum EV foi preenchido automaticamente'],
  };
  for (const [key, [label, meaning]] of Object.entries(labels)) {
    const count = counts[key] || 0;
    if (count > 0) warnings.push(`${label} em ${count} campo(s); ${meaning}.`);
  }
  if (warnings.length) warnings.push('Campos desconhecidos permanecem explícitos; nenhum valor ausente é preenchido automaticamente.');
  return warnings;
}

function assertConfig(config) {
  if (typeof config.serverRoot !== 'string' || !path.isAbsolute(config.serverRoot)) {
    fail('ERR_IMPORT_CONFIG', 'serverRoot precisa ser um caminho absoluto na configuração local.');
  }
  if (typeof config.playerUuid !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(config.playerUuid)) {
    fail('ERR_IMPORT_CONFIG', 'playerUuid precisa ser um UUID válido na configuração local.');
  }
  return {serverRoot: path.resolve(config.serverRoot), playerUuid: config.playerUuid.toLowerCase()};
}

function readPlayerSnapshotFromConfig(options = {}) {
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const readSource = options.readSource || readStableSource;
  const now = options.now || (() => new Date());
  try {
    const initialConfigSource = readSource(configPath, 'config', MAX_CONFIG_BYTES);
    const config = assertConfig(parseJson(initialConfigSource.bytes, 'config.json'));

    const serverRoot = fs.realpathSync(config.serverRoot);
    const propertiesPath = path.join(serverRoot, 'server.properties');
    const initialProperties = readSource(propertiesPath, 'server.properties', MAX_PROPERTIES_BYTES);
    const worldName = parseWorldName(initialProperties.bytes);
    const worldPath = path.resolve(serverRoot, worldName);
    ensureWithin(serverRoot, worldPath, 'O mundo ativo');
    const {candidateReal: worldRoot} = realDirectory(serverRoot, worldPath, 'O mundo ativo');

    const shard = config.playerUuid.slice(0, 2);
    const playerStem = `${config.playerUuid}.dat`;
    const partyPath = containedFile(worldRoot, ['pokemon', 'playerpartystore', shard, playerStem], 'party');
    const pcPath = containedFile(worldRoot, ['pokemon', 'pcstore', shard, playerStem], 'PC');

    const partyFirst = readSource(partyPath, 'party', MAX_SOURCE_BYTES);
    const pcFirst = readSource(pcPath, 'pc', MAX_SOURCE_BYTES);
    const partyData = parseBoundedNbt(partyFirst.bytes, 'party');
    const pcData = parseBoundedNbt(pcFirst.bytes, 'pc');
    const {individuals, unknownCounts} = collectIndividuals(partyData, pcData);

    const partyAgain = readSource(partyPath, 'party', MAX_SOURCE_BYTES);
    const pcAgain = readSource(pcPath, 'pc', MAX_SOURCE_BYTES);
    const propertiesAgain = readSource(propertiesPath, 'server.properties', MAX_PROPERTIES_BYTES);
    const configAgain = readSource(configPath, 'config', MAX_CONFIG_BYTES);
    if (
      !sameObservation(partyFirst, partyAgain) ||
      !sameObservation(pcFirst, pcAgain) ||
      !sameObservation(initialProperties, propertiesAgain) ||
      !sameObservation(initialConfigSource, configAgain)
    ) {
      fail(
        'ERR_IMPORT_CHANGED',
        'Party, PC ou configuração do mundo mudou durante a leitura; atualize novamente após o servidor estabilizar.',
      );
    }

    const snapshot = {
      schemaVersion: 2,
      capturedAt: now().toISOString(),
      worldName,
      consistency: 'best-effort',
      sources: [
        {kind: 'party', sha256: partyFirst.source.sha256, modifiedAt: partyFirst.source.modifiedAt},
        {kind: 'pc', sha256: pcFirst.source.sha256, modifiedAt: pcFirst.source.modifiedAt},
      ],
      individuals,
    };
    const warnings = warningsFor(unknownCounts);
    if (warnings.length) snapshot.warnings = warnings;
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_OUTPUT_BYTES) {
      fail('ERR_IMPORT_LIMIT', 'O snapshot excede o limite seguro de resposta.');
    }
    return snapshot;
  } catch (error) {
    if (error instanceof PlayerImportError) throw error;
    if (error?.code === 'ENOENT') fail('ERR_IMPORT_SOURCE_MISSING', 'Não foi possível encontrar uma fonte necessária do mundo ativo.');
    fail('ERR_IMPORT_FAILED', 'A importação da party/PC falhou. Confirme que os dados foram salvos e tente novamente.');
  }
}

function publicPlayerImportError(error) {
  return error instanceof PlayerImportError
    ? error.message
    : 'A importação da party/PC falhou. Confirme que os dados foram salvos e tente novamente.';
}

module.exports = {
  MAX_SOURCE_BYTES,
  PlayerImportError,
  publicPlayerImportError,
  readPlayerSnapshotFromConfig,
  readStableSource,
};
