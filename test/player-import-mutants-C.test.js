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
    intArrayTag('UUID', options.partyUuid ?? [1, 2, 3, 4]),
    stringTag('Species', options.partySpecies ?? 'cobblemon:oddish'),
    byteTag('Level', options.partyLevel ?? 5),
    stringTag('Nature', options.partyNature ?? 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', options.partyAbility ?? 'cobblemon:chlorophyll')]),
    ...(options.partyStatTags ?? []),
  ];
  if (options.partyForm !== undefined) partyFields.push(stringTag('FormId', options.partyForm));
  if (options.partyHeldItem !== undefined) {
    partyFields.push(compoundTag('HeldItem', [stringTag('id', options.partyHeldItem)]));
  }
  partyFields.push(listTag('MoveSet', 10, options.partyMoveSet ?? [move('cobblemon:tackle', {pp: 0})]));
  partyFields.push(listTag('BenchedMoves', 10, options.partyBenchedMoves ?? [move('cobblemon:growl')]));

  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcUuid = options.duplicateUuid ? [1, 2, 3, 4] : [5, 6, 7, 8];
  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', pcUuid),
    stringTag('Species', options.pcSpecies ?? 'cobblemon:oddish'),
    stringTag('FormId', options.pcForm ?? 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', options.pcAbility ?? 'cobblemon:chlorophyll')]),
    ...(options.pcStatTags ?? []),
  ];
  if (!options.unknownPcMoves) {
    pcPokemonFields.push(listTag('MoveSet', 10, options.pcMoveSet ?? []));
    pcPokemonFields.push(listTag('BenchedMoves', 10, options.pcBenchedMoves ?? []));
  }
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);
  return {root, serverRoot, worldRoot, partyPath, pcPath, configPath, playerUuid};
}

afterAll(() => {
  for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});
});

// nonNegativeInteger boundary tests (line 211)
test('nonNegativeInteger: pp value zero is valid', () => {
  const fixture = makeWorld({partyMoveSet: [move('cobblemon:tackle', {pp: 0})]});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].equippedMoves[0].pp, 0);
});

test('nonNegativeInteger: pp value positive is valid', () => {
  const fixture = makeWorld({partyMoveSet: [move('cobblemon:tackle', {pp: 42})]});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].equippedMoves[0].pp, 42);
});

// normalizeMoves unknown tracking tests (lines 215-217, 226, 229)
test('normalizeMoves: unknown when equippedMoves is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 5),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('FormId', 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals[0].equippedMovesKnown, false);
  assert.deepEqual(snapshot.individuals[0].equippedMoves, []);
});

// Move count limit tests (line 220)
test('normalizeMoves: rejects 5 moves for equippedMoves', () => {
  const moves = [];
  for (let i = 0; i < 5; i++) {
    moves.push(move(`cobblemon:move${i}`, {pp: 0}));
  }
  const fixture = makeWorld({partyMoveSet: moves});
  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (error) => error?.code === 'ERR_IMPORT_LIMIT',
  );
});

test('normalizeMoves: accepts 4 moves for equippedMoves', () => {
  const moves = [];
  for (let i = 0; i < 4; i++) {
    moves.push(move(`cobblemon:move${i}`, {pp: 0}));
  }
  const fixture = makeWorld({partyMoveSet: moves});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].equippedMoves.length, 4);
});

// ppUps and pp tests (lines 226, 229)
test('normalizeMoves: ppUps is recorded when present', () => {
  const fixture = makeWorld({partyMoveSet: [move('cobblemon:tackle', {pp: 35, ppUps: 3})]});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].equippedMoves[0].ppUps, 3);
  assert.equal(snapshot.individuals[0].equippedMoves[0].pp, 35);
});

test('normalizeMoves: ppUps in benched moves recorded', () => {
  const fixture = makeWorld({pcBenchedMoves: [move('cobblemon:growl', {ppUps: 2})]});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[1].learnedMoves[0].ppUps, 2);
});

// Battle stats boundary tests (line 282)
test('normalizeBattleStats: IV > 31 is rejected', () => {
  const fixture = makeWorld({partyStatTags: [compoundTag('IVs', [compoundTag('Base', [intTag('cobblemon:hp', 32)])])]});
  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (error) => error?.code === 'ERR_IMPORT_STATS',
  );
});

test('normalizeBattleStats: IV = 31 is accepted', () => {
  const fixture = makeWorld({
    partyStatTags: [
      compoundTag('IVs', [
        compoundTag('Base', [
          intTag('cobblemon:hp', 31),
          intTag('cobblemon:attack', 31),
          intTag('cobblemon:defence', 31),
          intTag('cobblemon:special_attack', 31),
          intTag('cobblemon:special_defence', 31),
          intTag('cobblemon:speed', 31),
        ]),
      ]),
    ],
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].battleStats.ivs.hp.value, 31);
});

test('normalizeBattleStats: IV = 0 is accepted', () => {
  const fixture = makeWorld({
    partyStatTags: [
      compoundTag('IVs', [
        compoundTag('Base', [
          intTag('cobblemon:hp', 0),
          intTag('cobblemon:attack', 0),
          intTag('cobblemon:defence', 0),
          intTag('cobblemon:special_attack', 0),
          intTag('cobblemon:special_defence', 0),
          intTag('cobblemon:speed', 0),
        ]),
      ]),
    ],
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].battleStats.ivs.hp.value, 0);
});

test('normalizeBattleStats: EV sum > 510 is rejected', () => {
  const fixture = makeWorld({
    partyStatTags: [
      compoundTag('EVs', [
        intTag('cobblemon:hp', 252),
        intTag('cobblemon:attack', 252),
        intTag('cobblemon:defence', 7),
        intTag('cobblemon:special_attack', 0),
        intTag('cobblemon:special_defence', 0),
        intTag('cobblemon:speed', 0),
      ]),
    ],
  });
  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
    (error) => error?.code === 'ERR_IMPORT_STATS',
  );
});

test('normalizeBattleStats: EV sum = 510 is accepted', () => {
  const fixture = makeWorld({
    partyStatTags: [
      compoundTag('EVs', [
        intTag('cobblemon:hp', 252),
        intTag('cobblemon:attack', 252),
        intTag('cobblemon:defence', 6),
        intTag('cobblemon:special_attack', 0),
        intTag('cobblemon:special_defence', 0),
        intTag('cobblemon:speed', 0),
      ]),
    ],
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert(snapshot.individuals[0].battleStats.evs.hp.state === 'known');
});

test('normalizeBattleStats: EV sum = 0 is accepted', () => {
  const fixture = makeWorld({
    partyStatTags: [
      compoundTag('EVs', [
        intTag('cobblemon:hp', 0),
        intTag('cobblemon:attack', 0),
        intTag('cobblemon:defence', 0),
        intTag('cobblemon:special_attack', 0),
        intTag('cobblemon:special_defence', 0),
        intTag('cobblemon:speed', 0),
      ]),
    ],
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].battleStats.evs.hp.value, 0);
});

// occupiedIndividual tests (lines 298-302)
test('occupiedIndividual: ignores empty slot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 5),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box'), compoundTag('Slot1', [])];
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals.length, 1);
});

// Unknown field tracking tests (lines 315, 317, 321, 324, 327)
test('unknown fields: formId unknown is tracked', () => {
  const fixture = makeWorld({partyForm: 'unknown'});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].formId, 'unknown');
  const warnings = snapshot.warnings.filter((w) => /formId/.test(w));
  assert(warnings.length > 0);
});

test('unknown fields: level unknown is tracked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('Nature', 'cobblemon:brave'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('FormId', 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals[0].level, null);
  const warnings = snapshot.warnings.filter((w) => /level/.test(w));
  assert(warnings.length > 0);
});

test('unknown fields: nature unknown is tracked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 5),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('FormId', 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals[0].observed.nature, null);
  const warnings = snapshot.warnings.filter((w) => /nature/.test(w));
  assert(warnings.length > 0);
});

test('unknown fields: ability unknown is tracked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-player-import-'));
  temporaryRoots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  const playerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const shard = playerUuid.slice(0, 2);
  const partyPath = path.join(worldRoot, 'pokemon', 'playerpartystore', shard, `${playerUuid}.dat`);
  const pcPath = path.join(worldRoot, 'pokemon', 'pcstore', shard, `${playerUuid}.dat`);
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');

  const partyFields = [
    intArrayTag('UUID', [1, 2, 3, 4]),
    stringTag('Species', 'cobblemon:oddish'),
    byteTag('Level', 5),
    stringTag('Nature', 'cobblemon:brave'),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  writeNbt(partyPath, [compoundTag('Slot0', partyFields)]);

  const pcFields = [stringTag('BoxName', 'Test Box')];
  const pcPokemonFields = [
    intArrayTag('UUID', [5, 6, 7, 8]),
    stringTag('Species', 'cobblemon:oddish'),
    stringTag('FormId', 'regional'),
    compoundTag('Ability', [stringTag('AbilityName', 'cobblemon:chlorophyll')]),
    listTag('MoveSet', 10, []),
    listTag('BenchedMoves', 10, []),
  ];
  pcFields.push(compoundTag('Slot0', pcPokemonFields));
  writeNbt(pcPath, [compoundTag('Box0', pcFields)]);

  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid}));

  const snapshot = readPlayerSnapshotFromConfig({configPath});
  assert.equal(snapshot.individuals[0].observed.ability, null);
  const warnings = snapshot.warnings.filter((w) => /ability/.test(w));
  assert(warnings.length > 0);
});

test('unknown fields: heldItem unknown is tracked', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  assert.equal(snapshot.individuals[0].observed.heldItem, null);
  const warnings = snapshot.warnings.filter((w) => /heldItem/.test(w));
  assert(warnings.length > 0);
});
