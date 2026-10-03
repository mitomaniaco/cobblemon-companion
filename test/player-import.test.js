import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {afterAll, test} from 'vitest';

const require = createRequire(import.meta.url);
const {readPlayerSnapshotFromConfig, readStableSource} = require('../electron/player-import.cjs');
const {parseNbt} = require('../electron/lib/nbt.cjs');

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

function doubleTag(name, value) {
  const payload = Buffer.alloc(8);
  payload.writeDoubleBE(value);
  return named(6, name, payload);
}

function intArrayTag(name, values) {
  const payload = Buffer.alloc(4 + values.length * 4);
  payload.writeInt32BE(values.length, 0);
  values.forEach((value, index) => payload.writeInt32BE(value, 4 + index * 4));
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

const STAT_NBT_NAMES = [
  'cobblemon:hp',
  'cobblemon:attack',
  'cobblemon:defence',
  'cobblemon:special_attack',
  'cobblemon:special_defence',
  'cobblemon:speed',
];

function statValueTag(name, value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && Number.isFinite(value) ? intTag(name, value) : doubleTag(name, value);
  }
  if (typeof value === 'string') return stringTag(name, value);
  if (Array.isArray(value)) return intArrayTag(name, value);
  throw new TypeError('Tipo sintético de stat não suportado pelo builder.');
}

function statMapTag(name, values) {
  return compoundTag(
    name,
    Object.entries(values).map(([key, value]) => statValueTag(key, value)),
  );
}

function battleStatTags({base, hyperTrained, evs} = {}) {
  const tags = [];
  if (base !== undefined || hyperTrained !== undefined) {
    const ivFields = [];
    if (base !== undefined) ivFields.push(statMapTag('Base', base));
    if (hyperTrained !== undefined) ivFields.push(statMapTag('HyperTrained', hyperTrained));
    tags.push(compoundTag('IVs', ivFields));
  }
  if (evs !== undefined) tags.push(statMapTag('EVs', evs));
  return tags;
}

function valuesByStat(values) {
  return Object.fromEntries(STAT_NBT_NAMES.map((name, index) => [name, values[index]]));
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

test('captura o contrato v2, mantém espécies repetidas por UUID e não inventa valores', () => {
  const fixture = makeWorld();
  const snapshot = readPlayerSnapshotFromConfig({
    configPath: fixture.configPath,
    now: () => new Date('2026-09-24T10:00:00.000Z'),
  });

  assert.deepEqual(
    Object.keys(snapshot).sort(),
    ['capturedAt', 'consistency', 'individuals', 'schemaVersion', 'sources', 'warnings', 'worldName'].sort(),
  );
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.capturedAt, '2026-09-24T10:00:00.000Z');
  assert.equal(snapshot.worldName, 'world');
  assert.equal(snapshot.consistency, 'best-effort');
  assert.deepEqual(
    snapshot.sources.map((source) => source.kind),
    ['party', 'pc'],
  );
  assert(snapshot.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256) && Number.isFinite(Date.parse(source.modifiedAt))));
  assert.equal(snapshot.individuals.length, 2);
  assert.deepEqual(
    snapshot.individuals.map((item) => item.uuid),
    ['00000001-0000-0002-0000-000300000004', '00000005-0000-0006-0000-000700000008'],
  );
  assert(snapshot.individuals.every((item) => item.speciesId === 'cobblemon:oddish'));

  const party = snapshot.individuals[0];
  assert.equal(party.formId, 'unknown');
  assert.equal(party.level, 0);
  assert.deepEqual(party.equippedMoves, [{id: 'cobblemon:tackle', pp: 0, ppUps: null}]);
  assert.equal(party.equippedMovesKnown, true);
  assert.deepEqual(party.learnedMoves, [{id: 'cobblemon:growl', ppUps: null}]);
  assert.equal(party.learnedMovesKnown, true);
  assert.deepEqual(party.observed, {nature: 'cobblemon:brave', ability: 'cobblemon:chlorophyll', heldItem: null});
  assert.equal(snapshot.individuals[1].level, null);
  assert.deepEqual(snapshot.individuals[1].equippedMoves, []);
  assert.equal(snapshot.individuals[1].equippedMovesKnown, true);
  assert.deepEqual(snapshot.individuals[1].learnedMoves, []);
  assert.equal(snapshot.individuals[1].learnedMovesKnown, true);
  assert.deepEqual(snapshot.individuals[1].location, {container: 'pc', box: 0, boxName: 'Test Box', slot: 0});
  for (const group of ['ivs', 'hyperTrainedIvs', 'evs']) {
    for (const fact of Object.values(party.battleStats[group])) {
      assert.equal(fact.state, 'unknown');
      assert.equal(Object.hasOwn(fact, 'value'), false);
    }
  }
  const statUnknownCounts = snapshot.warnings
    .filter((warning) => /IVs|EVs|HyperTrained/.test(warning))
    .map((warning) => Number(warning.match(/em (\d+) campo/)?.[1]));
  assert.deepEqual(statUnknownCounts, [12, 12, 12]);
});

test('mapeia IVs, overrides e EVs por indivíduo com procedência de party e PC', () => {
  const stats = [
    ['cobblemon:hp', 'hp'],
    ['cobblemon:attack', 'atk'],
    ['cobblemon:defence', 'def'],
    ['cobblemon:special_attack', 'spa'],
    ['cobblemon:special_defence', 'spd'],
    ['cobblemon:speed', 'spe'],
  ];
  const partyValues = {base: [1, 2, 3, 4, 5, 6], hyperTrained: [10, 11, 12, 13, 14, 15], evs: [1, 2, 3, 4, 5, 6]};
  const pcValues = {base: [26, 27, 28, 29, 30, 31], hyperTrained: [0, 1, 2, 3, 4, 5], evs: [40, 41, 42, 43, 44, 45]};
  const fixture = makeWorld({
    partyStatTags: battleStatTags({
      base: valuesByStat(partyValues.base),
      hyperTrained: valuesByStat(partyValues.hyperTrained),
      evs: valuesByStat(partyValues.evs),
    }),
    pcStatTags: battleStatTags({
      base: valuesByStat(pcValues.base),
      hyperTrained: valuesByStat(pcValues.hyperTrained),
      evs: valuesByStat(pcValues.evs),
    }),
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});

  for (const [index, [nbtName, stat]] of stats.entries()) {
    for (const [individual, container, values] of [
      [snapshot.individuals[0], 'party', partyValues],
      [snapshot.individuals[1], 'pc', pcValues],
    ]) {
      const root = container === 'party' ? 'Slot0' : 'Box0.Slot0';
      assert.deepEqual(individual.battleStats.ivs[stat], {
        state: 'known',
        value: values.base[index],
        provenance: {sourceKind: container, nbtPath: `${root}.IVs.Base.${nbtName}`},
      });
      assert.deepEqual(individual.battleStats.hyperTrainedIvs[stat], {
        state: 'known',
        value: values.hyperTrained[index],
        provenance: {sourceKind: container, nbtPath: `${root}.IVs.HyperTrained.${nbtName}`},
      });
      assert.deepEqual(individual.battleStats.evs[stat], {
        state: 'known',
        value: values.evs[index],
        provenance: {sourceKind: container, nbtPath: `${root}.EVs.${nbtName}`},
      });
    }
  }
  assert.equal(snapshot.individuals[0].uuid === snapshot.individuals[1].uuid, false);
  assert.equal(snapshot.individuals[0].battleStats.ivs.hp.value, 1);
  assert.equal(snapshot.individuals[1].battleStats.ivs.hp.value, 26);
  assert(snapshot.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
});

test('distingue ausência, mapas vazios, parciais e override observado sem base', () => {
  const completePc = battleStatTags({
    base: valuesByStat([1, 2, 3, 4, 5, 6]),
    hyperTrained: valuesByStat([7, 8, 9, 10, 11, 12]),
    evs: valuesByStat([13, 14, 15, 16, 17, 18]),
  });
  const partialFixture = makeWorld({
    partyStatTags: battleStatTags({
      base: {'cobblemon:hp': 0},
      hyperTrained: {},
      evs: {'cobblemon:hp': 0},
    }),
    pcStatTags: completePc,
  });
  const partial = readPlayerSnapshotFromConfig({configPath: partialFixture.configPath}).individuals[0].battleStats;
  assert.deepEqual(partial.ivs.hp, {
    state: 'known',
    value: 0,
    provenance: {sourceKind: 'party', nbtPath: 'Slot0.IVs.Base.cobblemon:hp'},
  });
  assert.equal(partial.ivs.atk.state, 'unknown');
  assert.equal(Object.hasOwn(partial.ivs.atk, 'value'), false);
  assert.deepEqual(partial.hyperTrainedIvs.hp, {
    state: 'known',
    value: null,
    provenance: {sourceKind: 'party', nbtPath: 'Slot0.IVs.HyperTrained.cobblemon:hp'},
  });
  assert.equal(partial.evs.hp.value, 0);
  assert.equal(partial.evs.atk.state, 'unknown');
  assert.equal(
    readPlayerSnapshotFromConfig({configPath: partialFixture.configPath}).warnings.some((warning) => /HyperTrained/.test(warning)),
    false,
  );

  const emptyMapsFixture = makeWorld({
    partyStatTags: battleStatTags({base: {}, hyperTrained: {}, evs: {}}),
  });
  const emptyMaps = readPlayerSnapshotFromConfig({configPath: emptyMapsFixture.configPath}).individuals[0].battleStats;
  assert.equal(emptyMaps.ivs.hp.state, 'unknown');
  assert.equal(Object.hasOwn(emptyMaps.ivs.hp, 'value'), false);
  assert.deepEqual(emptyMaps.hyperTrainedIvs.hp, {
    state: 'known',
    value: null,
    provenance: {sourceKind: 'party', nbtPath: 'Slot0.IVs.HyperTrained.cobblemon:hp'},
  });
  assert.equal(emptyMaps.evs.hp.state, 'unknown');

  const overrideOnlyFixture = makeWorld({
    partyStatTags: battleStatTags({hyperTrained: {'cobblemon:attack': 0}}),
  });
  const overrideOnly = readPlayerSnapshotFromConfig({configPath: overrideOnlyFixture.configPath}).individuals[0].battleStats;
  assert.equal(overrideOnly.ivs.atk.state, 'unknown');
  assert.deepEqual(overrideOnly.hyperTrainedIvs.atk, {
    state: 'known',
    value: 0,
    provenance: {sourceKind: 'party', nbtPath: 'Slot0.IVs.HyperTrained.cobblemon:attack'},
  });
  assert.equal(overrideOnly.hyperTrainedIvs.hp.value, null);

  const missingSubmapsFixture = makeWorld({partyStatTags: [compoundTag('IVs', [])]});
  const missingSubmaps = readPlayerSnapshotFromConfig({configPath: missingSubmapsFixture.configPath}).individuals[0].battleStats;
  assert.equal(missingSubmaps.ivs.hp.state, 'unknown');
  assert.equal(missingSubmaps.hyperTrainedIvs.hp.state, 'unknown');
});

test('aceita limites de IV/EV e rejeita valores, mapas e totais inválidos', () => {
  const boundaryFixture = makeWorld({
    partyStatTags: battleStatTags({
      base: {'cobblemon:hp': 0, 'cobblemon:attack': 31},
      hyperTrained: {'cobblemon:hp': 0, 'cobblemon:attack': 31},
      evs: {'cobblemon:hp': 252, 'cobblemon:attack': 252, 'cobblemon:defence': 0, 'cobblemon:speed': 6},
    }),
  });
  const boundaryStats = readPlayerSnapshotFromConfig({configPath: boundaryFixture.configPath}).individuals[0].battleStats;
  assert.equal(boundaryStats.ivs.hp.value, 0);
  assert.equal(boundaryStats.ivs.atk.value, 31);
  assert.equal(boundaryStats.hyperTrainedIvs.hp.value, 0);
  assert.equal(boundaryStats.evs.def.value, 0);
  assert.equal(boundaryStats.evs.hp.value + boundaryStats.evs.atk.value + boundaryStats.evs.spe.value, 510);

  const invalidFixtures = [
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': -1}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': 32}})},
    {partyStatTags: battleStatTags({hyperTrained: {'cobblemon:hp': -1}})},
    {partyStatTags: battleStatTags({hyperTrained: {'cobblemon:hp': 32}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': 253}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': 252, 'cobblemon:attack': 252, 'cobblemon:defence': 7}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': 1.5}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': Number.NaN}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': Number.POSITIVE_INFINITY}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': '12'}})},
    {partyStatTags: battleStatTags({base: {'cobblemon:hp': [1]}})},
    {partyStatTags: battleStatTags({hyperTrained: {'cobblemon:hp': 1.5}})},
    {partyStatTags: battleStatTags({hyperTrained: {'cobblemon:hp': '12'}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': 1.5}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': Number.NaN}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': Number.POSITIVE_INFINITY}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': '12'}})},
    {partyStatTags: battleStatTags({evs: {'cobblemon:hp': [1]}})},
    {partyStatTags: [compoundTag('IVs', [intTag('cobblemon:hp', 12)])]},
    {partyStatTags: [compoundTag('IVs', [compoundTag('Base', [intTag('hp', 12)])])]},
    {partyStatTags: [compoundTag('IVs', [compoundTag('Base', [intTag('other:hp', 12)])])]},
    {partyStatTags: [compoundTag('IVs', [compoundTag('Base', [intTag('cobblemon:hp', 12), intTag('extra', 1)])])]},
    {partyStatTags: [listTag('IVs', 3, [])]},
    {partyStatTags: [stringTag('IVs', 'legacy')]},
    {partyStatTags: [compoundTag('IVs', [intArrayTag('Base', [12])])]},
    {partyStatTags: [compoundTag('IVs', [stringTag('Base', 'legacy')])]},
    {partyStatTags: [intArrayTag('EVs', [1, 2, 3])]},
    {partyStatTags: [stringTag('EVs', '1,2,3')]},
  ];
  for (const options of invalidFixtures) {
    const fixture = makeWorld(options);
    assert.throws(
      () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
      (error) =>
        error?.code === 'ERR_IMPORT_STATS' && error.message === 'IVs/EVs têm dados inválidos ou formato não suportado; snapshot recusado.',
    );
  }
});

test('o parser rejeita chaves duplicadas sem manter a última ocorrência', () => {
  const input = rootNbt([
    compoundTag('Slot0', [compoundTag('IVs', [compoundTag('Base', [intTag('cobblemon:hp', 7), intTag('cobblemon:hp', 31)])])]),
  ]);

  assert.throws(
    () => parseNbt(input),
    (error) => error?.message === 'Chave NBT duplicada',
  );
});

test('recusa snapshot quando Base ou IVs contém uma chave NBT repetida', () => {
  const duplicateStat = makeWorld({
    partyStatTags: [compoundTag('IVs', [compoundTag('Base', [intTag('cobblemon:hp', 7), intTag('cobblemon:hp', 31)])])],
  });
  const duplicateIvs = makeWorld({
    partyStatTags: [compoundTag('IVs', []), compoundTag('IVs', [])],
  });

  for (const fixture of [duplicateStat, duplicateIvs]) {
    assert.throws(
      () => readPlayerSnapshotFromConfig({configPath: fixture.configPath}),
      (error) => error?.code === 'ERR_IMPORT_NBT' && error.message === 'Não foi possível interpretar os dados NBT de party.',
    );
  }
});

test('descarta alteração de bytes IV/EV entre as leituras de consistência', () => {
  const fixture = makeWorld({
    rawNbt: true,
    partyStatTags: battleStatTags({base: {'cobblemon:hp': 1}}),
  });
  let changed = false;
  const readSource = (filePath, kind, maxBytes) => {
    const observation = readStableSource(filePath, kind, maxBytes);
    if (kind === 'party' && !changed) {
      changed = true;
      const bytes = fs.readFileSync(fixture.partyPath);
      const encodedTag = intTag('cobblemon:hp', 1);
      const offset = bytes.indexOf(encodedTag);
      assert.notEqual(offset, -1);
      bytes.writeInt32BE(2, offset + encodedTag.length - 4);
      fs.writeFileSync(fixture.partyPath, bytes);
    }
    return observation;
  };

  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath: fixture.configPath, readSource}),
    (error) => error?.code === 'ERR_IMPORT_CHANGED',
  );
});

test('usa a última ocorrência de level-name e interpreta NBT sem gzip', () => {
  const fixture = makeWorld({rawNbt: true});
  fs.writeFileSync(path.join(fixture.serverRoot, 'server.properties'), 'level-name=inactive\nlevel-name=world\n');

  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});

  assert.equal(snapshot.worldName, 'world');
  assert.equal(snapshot.individuals.length, 2);
  assert.equal(snapshot.individuals[0].equippedMoves[0].id, 'cobblemon:tackle');
});

test('preserva namespaces e pontuação de espécies e golpes sem colapsar slugs iguais', () => {
  const fixture = makeWorld({
    partySpecies: 'mod-a:oddish.v2',
    pcSpecies: 'mod-b:oddish.v2',
    partyEquippedMove: 'mod-a:shared-move.v2/path',
    partyLearnedMove: 'mod-b:shared-move.v2/path',
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});

  assert.equal(snapshot.individuals[0].speciesId, 'mod-a:oddish.v2');
  assert.equal(snapshot.individuals[1].speciesId, 'mod-b:oddish.v2');
  assert.equal(snapshot.individuals[0].equippedMoves[0].id, 'mod-a:shared-move.v2/path');
  assert.equal(snapshot.individuals[0].learnedMoves[0].id, 'mod-b:shared-move.v2/path');
});

test('preserva identificadores sem namespace sem acrescentar um namespace presumido', () => {
  const fixture = makeWorld({
    partySpecies: 'oddish',
    partyEquippedMove: 'quick-move',
    partyLearnedMove: 'ancient_power',
    partyNature: 'brave',
    partyAbility: 'chlorophyll',
    partyHeldItem: 'power-item',
    partyForm: 'regional-form',
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  const party = snapshot.individuals[0];

  assert.equal(party.speciesId, 'oddish');
  assert.equal(party.equippedMoves[0].id, 'quick-move');
  assert.equal(party.learnedMoves[0].id, 'ancient_power');
  assert.equal(party.formId, 'regional-form');
  assert.deepEqual(party.observed, {nature: 'brave', ability: 'chlorophyll', heldItem: 'power-item'});
});

test('rejeita IDs obrigatórios inválidos ou acima do limite e mantém IDs opcionais inválidos como desconhecidos', () => {
  const invalidSpecies = makeWorld({partySpecies: 'Mod:oddish'});
  assert.throws(() => readPlayerSnapshotFromConfig({configPath: invalidSpecies.configPath}), /speciesId válido/);

  const invalidMove = makeWorld({partyEquippedMove: 'mod:move with spaces'});
  assert.throws(() => readPlayerSnapshotFromConfig({configPath: invalidMove.configPath}), /golpe sem identificador/);

  const boundaryMoveId = `mod:${'a'.repeat(252)}`;
  const boundaryMove = makeWorld({partyLearnedMove: boundaryMoveId});
  const boundarySnapshot = readPlayerSnapshotFromConfig({configPath: boundaryMove.configPath});
  assert.equal(boundarySnapshot.individuals[0].learnedMoves[0].id, boundaryMoveId);

  const oversizedMove = makeWorld({partyLearnedMove: `mod:${'a'.repeat(253)}`});
  assert.throws(() => readPlayerSnapshotFromConfig({configPath: oversizedMove.configPath}), /golpe sem identificador/);

  const invalidOptionalIds = makeWorld({
    partyNature: 'brave nature',
    partyAbility: `mod:${'a'.repeat(253)}`,
    partyHeldItem: 'mod:bad item',
    partyForm: 'bad form',
  });
  const snapshot = readPlayerSnapshotFromConfig({configPath: invalidOptionalIds.configPath});
  const party = snapshot.individuals[0];
  assert.equal(party.formId, 'unknown');
  assert.deepEqual(party.observed, {nature: null, ability: null, heldItem: null});
});

test('distingue listas de golpes ausentes de listas presentes e vazias', () => {
  const fixture = makeWorld({unknownMoves: true});
  const snapshot = readPlayerSnapshotFromConfig({configPath: fixture.configPath});
  const party = snapshot.individuals.find((item) => item.location.container === 'party');
  const pc = snapshot.individuals.find((item) => item.location.container === 'pc');

  assert.deepEqual(party.equippedMoves, [{id: 'cobblemon:tackle', pp: 0, ppUps: null}]);
  assert.equal(party.equippedMovesKnown, true);
  assert.deepEqual(pc.equippedMoves, []);
  assert.equal(pc.equippedMovesKnown, false);
  assert.deepEqual(pc.learnedMoves, []);
  assert.equal(pc.learnedMovesKnown, false);
});

test('recusa UUID duplicado entre party e PC', () => {
  const fixture = makeWorld({duplicateUuid: true});
  assert.throws(() => readPlayerSnapshotFromConfig({configPath: fixture.configPath}), /UUID repetido entre party e PC/);
});

test('recusa indivíduo sem UUID em vez de associá-lo por espécie', () => {
  const fixture = makeWorld();
  writeNbt(fixture.partyPath, [
    compoundTag('Slot0', [stringTag('Species', 'cobblemon:oddish'), listTag('MoveSet', 10, []), listTag('BenchedMoves', 10, [])]),
  ]);

  assert.throws(() => readPlayerSnapshotFromConfig({configPath: fixture.configPath}), /UUID ausente ou inválido/);
});

test('descarta o snapshot se party ou PC mudar entre as leituras de consistência', () => {
  const fixture = makeWorld();
  let changedPc = false;
  const readSource = (filePath, kind, maxBytes) => {
    const observed = readStableSource(filePath, kind, maxBytes);
    if (kind === 'pc' && !changedPc) {
      changedPc = true;
      writeNbt(fixture.pcPath, [
        compoundTag('Box0', [
          stringTag('BoxName', 'Changed Box'),
          compoundTag('Slot0', [
            intArrayTag('UUID', [9, 10, 11, 12]),
            stringTag('Species', 'cobblemon:oddish'),
            listTag('MoveSet', 10, []),
            listTag('BenchedMoves', 10, []),
          ]),
        ]),
      ]);
    }
    return observed;
  };

  assert.throws(() => readPlayerSnapshotFromConfig({configPath: fixture.configPath, readSource}), /mudou durante a leitura/);
});
