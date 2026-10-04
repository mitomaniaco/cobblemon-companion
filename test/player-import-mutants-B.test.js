import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {afterAll, test} from 'vitest';

const require = createRequire(import.meta.url);
const {readPlayerSnapshotFromConfig} = require('../electron/player-import.cjs');

const temporaryRoots = [];

function nbtString(value) {
  const text = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(text.length);
  return Buffer.concat([length, text]);
}

function named(type, name, payload) {
  return Buffer.concat([Buffer.from([type]), nbtString(name), payload]);
}

function stringTag(name, value) {
  return named(8, name, nbtString(value));
}

function intTag(name, value) {
  const payload = Buffer.alloc(4);
  payload.writeInt32BE(value);
  return named(3, name, payload);
}

function compoundBody(fields) {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

function compoundTag(name, fields) {
  return named(10, name, compoundBody(fields));
}

function listTag(name, elementType, values) {
  const header = Buffer.alloc(5);
  header[0] = elementType;
  header.writeInt32BE(values.length, 1);
  return named(9, name, Buffer.concat([header, ...values]));
}

function intArrayTag(name, values) {
  const payload = Buffer.alloc(4 + values.length * 4);
  payload.writeInt32BE(values.length, 0);
  values.forEach((value, index) => {
    payload.writeInt32BE(value, 4 + index * 4);
  });
  return named(11, name, payload);
}

function rootNbt(fields) {
  return Buffer.concat([Buffer.from([10, 0, 0]), compoundBody(fields)]);
}

function move(name, options = {}) {
  const fields = [stringTag('MoveName', name)];
  if (options.pp !== undefined) fields.push(intTag('MovePP', options.pp));
  if (options.ppUps !== undefined) fields.push(intTag('RaisedPPStages', options.ppUps));
  return compoundBody(fields);
}

function writeNbt(filePath, fields, {raw = false} = {}) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const bytes = rootNbt(fields);
  fs.writeFileSync(filePath, raw ? bytes : zlib.gzipSync(bytes));
}

function makeWorld(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  const configPath = path.join(root, 'config.json');
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', options.partySpecies ?? 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', options.pcSpecies ?? 'cobblemon:oddish'),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);
  return {root, serverRoot, worldRoot, partyPath, pcPath, configPath, playerUuid};
}

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// ============================================================================
// ensureWithin: Path containment checks (line 109-115)
// ============================================================================

test('ensureWithin aceita caminho válido aninhado', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.ok(snapshot);
});

test('ensureWithin rejeita ".." como worldName', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=..\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_PATH',
  );
});

test('ensureWithin rejeita "../x" como worldName', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=../escape\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_PATH',
  );
});

test('ensureWithin rejeita caminho absoluto como worldName', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  const absolutePath = os.platform() === 'win32' ? 'C:\\absolute' : '/absolute';
  fs.writeFileSync(propsPath, `level-name=${absolutePath}\n`);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_WORLD_NAME',
  );
});

// ============================================================================
// realDirectory: Directory validation (line 117-128)
// ============================================================================

test('realDirectory rejeita quando worldPath não é um diretório', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=badfile\n');
  fs.writeFileSync(path.join(config.serverRoot, 'badfile'), 'not a dir');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_PATH',
  );
});

test('realDirectory rejeita quando worldPath não existe', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=nonexistent\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_WORLD',
  );
});

// ============================================================================
// containedFile: File containment checks (line 130-143)
// ============================================================================

test('containedFile rejeita quando arquivo é um diretório', () => {
  const fixture = makeWorld();
  fs.rmSync(fixture.partyPath, {recursive: true, force: true});
  fs.mkdirSync(fixture.partyPath);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_PATH',
  );
});

test('containedFile retorna candidate path quando ENOENT (não existe)', () => {
  const fixture = makeWorld();
  fs.rmSync(fixture.partyPath, {recursive: true, force: true});

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

// ============================================================================
// parseJson: JSON parsing and validation (line 145-155)
// ============================================================================

test('parseJson rejeita JSON inválido', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.configPath, 'not valid json {');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_CONFIG',
  );
});

test('parseJson rejeita null como raiz', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.configPath, 'null');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_CONFIG',
  );
});

test('parseJson rejeita array como raiz', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.configPath, '[]');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_CONFIG',
  );
});

test('parseJson aceita objeto válido', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.ok(snapshot);
});

// ============================================================================
// parseWorldName: Level-name regex and validation (line 157-165)
// ============================================================================

test('parseWorldName rejeita level-name com null byte', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=world\0bad\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_WORLD_NAME',
  );
});

test('parseWorldName usa última ocorrência de level-name', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));

  fs.mkdirSync(path.join(config.serverRoot, 'world1'), {recursive: true});
  fs.mkdirSync(path.join(config.serverRoot, 'world2'), {recursive: true});

  const playerUuid = config.playerUuid;
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(config.serverRoot, 'world2', 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(config.serverRoot, 'world2', 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', 'cobblemon:oddish'),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=world1\nlevel-name=world2\n');

  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.worldName, 'world2');
});

test('parseWorldName trimma espaços e retorna valor válido', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=  world  \n');

  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.worldName, 'world');
});

test('parseWorldName rejeita level-name vazia', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'level-name=\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_WORLD_NAME',
  );
});

test('parseWorldName rejeita quando level-name ausente', () => {
  const fixture = makeWorld();
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  const propsPath = path.join(config.serverRoot, 'server.properties');
  fs.writeFileSync(propsPath, 'other-property=value\n');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_WORLD_NAME',
  );
});

// ============================================================================
// parseBoundedNbt: Gzip detection and size limits (line 167-183)
// ============================================================================

test('parseBoundedNbt descompacta gzip corretamente', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.ok(snapshot);
});

test('parseBoundedNbt rejeita NBT > MAX_NBT_BYTES após gunzip', () => {
  const fixture = makeWorld();
  const hugeData = Buffer.alloc(20 * 1024 * 1024);
  hugeData[0] = 0x0a;
  fs.writeFileSync(fixture.partyPath, zlib.gzipSync(hugeData));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_TOO_LARGE',
  );
});

test('parseBoundedNbt rejeita NBT > MAX_NBT_BYTES sem gzip', () => {
  const fixture = makeWorld();
  const hugeData = Buffer.alloc(20 * 1024 * 1024);
  hugeData[0] = 0x0a;
  fs.writeFileSync(fixture.partyPath, hugeData);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_TOO_LARGE',
  );
});

test('parseBoundedNbt rejeita estrutura NBT inválida', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.partyPath, zlib.gzipSync(Buffer.from([0x01])));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_NBT',
  );
});

test('parseBoundedNbt rejeita NBT que é null', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.partyPath, zlib.gzipSync(Buffer.from([0x00])));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_NBT',
  );
});

test('parseBoundedNbt aceita NBT raw (sem gzip)', () => {
  const fixture = makeWorld({rawNbt: true});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.ok(snapshot);
});

// ============================================================================
// isRecord: Record validation (line 185-187)
// ============================================================================

test('isRecord rejeita null em config', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.configPath, 'null');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_CONFIG',
  );
});

test('isRecord rejeita array em config', () => {
  const fixture = makeWorld();
  fs.writeFileSync(fixture.configPath, '[]');

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_CONFIG',
  );
});

// ============================================================================
// sourceId: ID pattern and length validation (line 189-192)
// ============================================================================

test('sourceId rejeita ID acima do limite (256)', () => {
  const MAX_SOURCE_ID_LENGTH = 256;
  const overLimitId = `mod:${'a'.repeat(MAX_SOURCE_ID_LENGTH - 3)}`;
  const overLimit = makeWorld({partySpecies: overLimitId});

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: overLimit.configPath}),
    (err) => err?.message?.includes('speciesId'),
  );
});

test('sourceId aceita ID exatamente no limite (256)', () => {
  const MAX_SOURCE_ID_LENGTH = 256;
  const boundaryId = `mod:${'a'.repeat(MAX_SOURCE_ID_LENGTH - 4)}`;
  const atBoundary = makeWorld({partySpecies: boundaryId});
  const snapshot = readPlayerSnapshotFromConfig({configPath: atBoundary.configPath});

  assert.equal(snapshot.individuals[0].speciesId, boundaryId);
});

// ============================================================================
// formatUuid: UUID array validation (line 194-204)
// ============================================================================

test('formatUuid rejeita array vazio', () => {
  const fixture = makeWorld();
  const partyFields = [
    intArrayTag('UUID', []),
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(fixture.partyPath, [compoundTag('Slot0', partyFields)]);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_IDENTITY',
  );
});

test('formatUuid rejeita array com < 4 elementos', () => {
  const fixture = makeWorld();
  const partyFields = [
    intArrayTag('UUID', [1, 2, 3]),
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(fixture.partyPath, [compoundTag('Slot0', partyFields)]);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_IDENTITY',
  );
});

test('formatUuid rejeita array com > 4 elementos', () => {
  const fixture = makeWorld();
  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4, 5]),
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(fixture.partyPath, [compoundTag('Slot0', partyFields)]);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (err) => err?.code === 'ERR_IMPORT_IDENTITY',
  );
});

test('formatUuid aceita int32 nos limites', () => {
  const fixture = makeWorld();
  const payload = Buffer.alloc(4 + 4 * 4);
  payload.writeInt32BE(4, 0);
  payload.writeInt32BE(-2147483648, 4);
  payload.writeInt32BE(0, 8);
  payload.writeInt32BE(1, 12);
  payload.writeInt32BE(2147483647, 16);

  const uuidTag = named(11, 'UUID', payload);
  const partyFields = [
    uuidTag,
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(fixture.partyPath, [compoundTag('Slot0', partyFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.ok(snapshot.individuals);
});

test('formatUuid converte para formato UUID string de 36 caracteres', () => {
  const fixture = makeWorld();
  const payload = Buffer.alloc(4 + 4 * 4);
  payload.writeInt32BE(4, 0);
  payload.writeInt32BE(0x12345678, 4);
  payload.writeInt32BE(-1, 8);
  payload.writeInt32BE(0x13579bdf, 12);
  payload.writeInt32BE(0x7f354621, 16);

  const uuidTag = named(11, 'UUID', payload);
  const partyFields = [
    uuidTag,
    stringTag('Species', 'cobblemon:oddish'),
    intTag('Level', 1),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move('cobblemon:growl')]),
  ];
  writeNbt(fixture.partyPath, [compoundTag('Slot0', partyFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  const uuid = snapshot.individuals[0].uuid;
  assert.equal(typeof uuid, 'string');
  assert.equal(uuid.length, 36);
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
