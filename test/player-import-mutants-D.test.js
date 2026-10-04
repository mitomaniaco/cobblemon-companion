import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {afterAll, test} from 'vitest';

const require = createRequire(import.meta.url);
const {readPlayerSnapshotFromConfig, readStableSource, PlayerImportError} = require('../electron/player-import.cjs');

const temporaryRoots = [];

// ============================================================================
// NBT helpers (copied from player-import.test.js)
// ============================================================================

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

function byteTag(name, value) {
  return named(1, name, Buffer.from([value]));
}

function intTag(name, value) {
  const payload = Buffer.alloc(4);
  payload.writeInt32BE(value);
  return named(3, name, payload);
}

function intArrayTag(name, values) {
  const payload = Buffer.alloc(4 + values.length * 4);
  payload.writeInt32BE(values.length, 0);
  values.forEach((value, index) => {
    payload.writeInt32BE(value, 4 + index * 4);
  });
  return named(11, name, payload);
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

function move(name, options = {}) {
  const fields = [stringTag('MoveName', name)];
  if (options.pp !== undefined) fields.push(intTag('MovePP', options.pp));
  if (options.ppUps !== undefined) fields.push(intTag('RaisedPPStages', options.ppUps));
  return compoundBody(fields);
}

function rootNbt(fields) {
  return Buffer.concat([Buffer.from([10, 0, 0]), compoundBody(fields)]);
}

function writeNbt(filePath, fields, {raw = false} = {}) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const bytes = rootNbt(fields);
  fs.writeFileSync(filePath, raw ? bytes : zlib.gzipSync(bytes));
}

// ============================================================================
// Test fixtures and helper functions
// ============================================================================

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
    byteTag('Level', 0),
    stringTag('Nature', options.partyNature ?? 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', options.partyAbility ?? 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move(options.partyEquippedMove ?? 'cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, [move(options.partyLearnedMove ?? 'cobblemon:growl')]),
    ...(options.partyStatTags ?? []),
  ];
  if (options.partyForm !== undefined) partyFields.push(stringTag('FormId', options.partyForm));
  if (options.partyHeldItem !== undefined) {
    partyFields.push(compoundTag('HeldItem', [stringTag('id', options.partyHeldItem)]));
  }
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)], {raw: options.rawNbt === true});

  const pcUuid = options.duplicateUuid ? [1, 2, 3, 4] : [5, 6, 7, 8];
  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', pcUuid),
    stringTag('Species', options.pcSpecies ?? 'cobblemon:oddish'),
    stringTag('FormId', 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    ...(options.pcStatTags ?? []),
  ];
  if (!options.unknownMoves) {
    pcPokemonFields.push(listTag('MoveSet', 10, []));
    pcPokemonFields.push(listTag('BenchedMoves', 10, []));
  }
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)], {raw: options.rawNbt === true});
  return {root, serverRoot, worldRoot, partyPath, pcPath, configPath, playerUuid};
}

afterAll(() => {
  for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});
});

// ============================================================================
// Tests for party/PC slot key parsing (lines 355-372)
// ============================================================================

test('analisa slot válido da party com padrão Slot(\\d+)', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals.length, 2);
  assert.deepEqual(snapshot.individuals[0].location, {container: 'party', slot: 0});
});

test('rejeita slot da party acima do limite esperado (slot > 5)', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  const partyData = [
    compoundTag('Slot0', slotFields),
    compoundTag('Slot6', slotFields), // Slot > 5, occupied -> should fail
  ];
  writeNbt(partyPath, partyData);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_SLOT',
  );
});

test('ignora chaves que não correspondem a padrão Slot na party', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  const emptyFields = [];
  const partyData = [compoundTag('Slot0', slotFields), compoundTag('SlotX', emptyFields), compoundTag('metadata', emptyFields)];
  writeNbt(partyPath, partyData);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals.length, 2);
  assert.equal(snapshot.individuals[0].location.slot, 0);
});

test('analisa slot válido da caixa do PC com padrão Box(\\d+)Slot(\\d+)', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];

  const partyData = [compoundTag('Slot0', slotFields)];
  writeNbt(partyPath, partyData);

  const pcBoxFields = [stringTag('BoxName', 'Test Box')];
  pcBoxFields.push(
    compoundTag('Slot3', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );

  const pcData = [compoundTag('Box0', pcBoxFields)];
  writeNbt(pcPath, pcData);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals.length, 2);
  const pcIndividual = snapshot.individuals.find((ind) => ind.location.container === 'pc');
  assert.equal(pcIndividual.location.box, 0);
  assert.equal(pcIndividual.location.slot, 3);
  assert.equal(pcIndividual.location.boxName, 'Test Box');
});

test('ignora chaves que não correspondem a padrão Slot ou Box no PC', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];

  const partyData = [compoundTag('Slot0', slotFields)];
  writeNbt(partyPath, partyData);

  const pcBoxFields = [stringTag('BoxName', 'Test Box')];
  pcBoxFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );

  const pcData = [compoundTag('Box0', pcBoxFields), compoundTag('BoxX', [])];
  writeNbt(pcPath, pcData);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals.length, 2);
});

test('rejeita PC quando excede limite máximo de caixas (MAX_PC_BOXES = 512)', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];

  const partyData = [compoundTag('Slot0', slotFields)];
  writeNbt(partyPath, partyData);

  const pcData = [];
  for (let i = 0; i < 513; i++) {
    const boxName = i < 512 ? `Box${i}` : 'Box512';
    const boxFields = [stringTag('BoxName', boxName)];
    if (i < 513) {
      boxFields.push(
        compoundTag('Slot0', [
          intArrayTag('UUID', [5 + i, 6 + i, 7 + i, 8 + i]),
          stringTag('Species', 'cobblemon:oddish'),
          stringTag('FormId', 'regional'),
          compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
          listTag('MoveSet', 10, []),
          listTag('BenchedMoves', 10, []),
        ]),
      );
    }
    pcData.push(compoundTag(`Box${i}`, boxFields));
  }
  writeNbt(pcPath, pcData);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_LIMIT',
  );
});

test('rejeita caixa do PC com estrutura inválida', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 0),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];

  const partyData = [compoundTag('Slot0', slotFields)];
  writeNbt(partyPath, partyData);

  const pcData = [stringTag('Box0', 'invalid-structure')];
  writeNbt(pcPath, pcData);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_SLOT',
  );
});

// ============================================================================
// Tests for warnings text (lines 380-402)
// ============================================================================

test('gera aviso para FormId ausente', () => {
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
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 5),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  const formIdWarning = snapshot.warnings?.find((w) => w.includes('FormId ausente'));
  assert(formIdWarning, 'Should have FormId warning');
  assert(formIdWarning.includes('1 campo'), 'Should report 1 field with missing FormId');
});

test('gera aviso para Level ausente', () => {
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
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  const levelWarning = snapshot.warnings?.find((w) => w.includes('Level ausente'));
  assert(levelWarning, 'Should have Level warning');
  // The warning includes the field count
  assert(levelWarning.includes('campo'), 'Should mention campo(s)');
});

test('gera warnings para IVs/EVs desconhecidos', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert(snapshot.warnings && snapshot.warnings.length > 0);
  const warningText = snapshot.warnings.join(' | ');
  assert(warningText.includes('ausentes') || warningText.includes('desconhecidos'));
});

test('gera múltiplos avisos para múltiplos campos ausentes', () => {
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
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert(snapshot.warnings && snapshot.warnings.length > 0);
  const formIdWarning = snapshot.warnings.find((w) => w.includes('FormId ausente'));
  const levelWarning = snapshot.warnings.find((w) => w.includes('Level ausente'));
  assert(formIdWarning, 'Should have FormId warning');
  assert(levelWarning, 'Should have Level warning');
});

// ============================================================================
// Tests for config validation (lines 407-413)
// ============================================================================

test('rejeita serverRoot se não for absoluto', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot: 'relative/path', playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_CONFIG' && error.message.includes('serverRoot'),
  );
});

test('rejeita serverRoot se não for string', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot: 123, playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_CONFIG',
  );
});

test('rejeita playerUuid se não for string UUID válido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  fs.mkdirSync(serverRoot);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot: path.resolve(serverRoot), playerUuid: 'not-a-uuid'}));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_CONFIG' && error.message.includes('playerUuid'),
  );
});

test('rejeita playerUuid se for número em vez de string', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  fs.mkdirSync(serverRoot);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot: path.resolve(serverRoot), playerUuid: 123}));

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_CONFIG',
  );
});

test('converte playerUuid para minúsculas', () => {
  const fixture = makeWorld();
  const configWithUpperCase = path.join(fixture.root, 'config-upper.json');
  fs.writeFileSync(
    configWithUpperCase,
    JSON.stringify({
      serverRoot: fixture.serverRoot,
      playerUuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    }),
  );

  const snapshot = readPlayerSnapshotFromConfig({configPath: configWithUpperCase});
  assert.equal(snapshot.individuals[0].uuid, '00000001-0000-0002-0000-000300000004');
});

// ============================================================================
// Tests for world path validation (line 429)
// ============================================================================

test('valida que o caminho do mundo está dentro da raiz do servidor', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert(snapshot.worldName);
  assert(snapshot.schemaVersion === 2);
});

test('rejeita mundo fora da raiz do servidor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const outsideRoot = path.join(root, 'outside');
  fs.mkdirSync(outsideRoot);
  const configPath = path.join(root, 'config.json');
  const serverRoot = path.join(root, 'server');
  fs.mkdirSync(serverRoot);

  fs.writeFileSync(path.join(serverRoot, 'server.properties'), `level-name=${path.relative(serverRoot, outsideRoot)}\n`);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      serverRoot: path.resolve(serverRoot),
      playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }),
  );

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_PATH',
  );
});

// ============================================================================
// Tests for snapshot output limit (lines 471-473)
// ============================================================================

test('inclui warnings na snapshot quando há campos desconhecidos', () => {
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
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, [move('cobblemon:tackle', {pp: 0})]),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Box')];
  pcFields.push(
    compoundTag('Slot0', [
      intArrayTag('UUID', [5, 6, 7, 8]),
      stringTag('Species', 'cobblemon:oddish'),
      stringTag('FormId', 'regional'),
      compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
      listTag('MoveSet', 10, []),
      listTag('BenchedMoves', 10, []),
    ]),
  );
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert(snapshot.warnings && snapshot.warnings.length > 0);
});

test('rejeita snapshot quando tamanho excede MAX_OUTPUT_BYTES', () => {
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

  const slotFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', `cobblemon:${'a'.repeat(100)}`),
    byteTag('Level', 0),
    stringTag('Nature', `cobblemon:${'b'.repeat(100)}`),
    compoundTag('Ability', [stringTag('AbilityName', `cobblemon:${'c'.repeat(100)}`)]),
    listTag('MoveSet', 10, [move(`cobblemon:${'d'.repeat(100)}`, {pp: 0})]),
    listTag('BenchedMoves', 10, [move(`cobblemon:${'e'.repeat(100)}`)]),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', slotFields)]);

  const pcData = [];
  for (let box = 0; box < 100; box++) {
    const boxFields = [stringTag('BoxName', `Box${'x'.repeat(100)}`)];
    for (let slot = 0; slot < 30; slot++) {
      boxFields.push(
        compoundTag(`Slot${slot}`, [
          intArrayTag('UUID', [5 + box * 30 + slot, 6, 7, 8]),
          stringTag('Species', `cobblemon:${'f'.repeat(100)}`),
          stringTag('FormId', `cobblemon:${'g'.repeat(100)}`),
          compoundTag('Ability', [stringTag('AbilityName', `cobblemon:${'h'.repeat(100)}`)]),
          listTag('MoveSet', 10, [move(`cobblemon:${'i'.repeat(100)}`)]),
          listTag('BenchedMoves', 10, [move(`cobblemon:${'j'.repeat(100)}`)]),
        ]),
      );
    }
    pcData.push(compoundTag(`Box${box}`, boxFields));
  }
  writeNbt(pcPath, pcData);

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_LIMIT',
  );
});

// ============================================================================
// Tests for error mapping (lines 478-479)
// ============================================================================

test('mapeia ENOENT a ERR_IMPORT_SOURCE_MISSING', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      serverRoot: path.resolve(root),
      playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }),
  );

  const readSourceWithEnoent = (filePath, kind, maxBytes) => {
    if (filePath === configPath) {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      throw error;
    }
    return readStableSource(filePath, kind, maxBytes);
  };

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath, readSource: readSourceWithEnoent}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

test('mapeia outros erros a ERR_IMPORT_FAILED', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      serverRoot: path.resolve(root),
      playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }),
  );

  const readSourceWithError = (_filePath, _kind, _maxBytes) => {
    const error = new Error('Arbitrary read error');
    error.code = 'EACCES';
    throw error;
  };

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath, readSource: readSourceWithError}),
    (error) => error instanceof PlayerImportError && error.code === 'ERR_IMPORT_FAILED',
  );
});
