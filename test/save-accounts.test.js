import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, test} from 'vitest';

const require = createRequire(import.meta.url);
const {createSaveAccountRegistry} = require('../electron/accounts.cjs');
const roots = [];
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const registry = (configPath) => createSaveAccountRegistry({configPath});

function fixture(entries = [{uuid: UUID_A, name: 'Synthetic'}]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-save-accounts-'));
  roots.push(root);
  const serverRoot = path.join(root, 'server');
  const worldRoot = path.join(serverRoot, 'world');
  fs.mkdirSync(worldRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), 'level-name=world\n');
  fs.writeFileSync(path.join(serverRoot, 'usercache.json'), JSON.stringify(entries));
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid: UUID_A, retained: 'synthetic'}));
  return {root, serverRoot, worldRoot, configPath};
}

function saveFile(worldRoot, store, uuid, time) {
  const file = path.join(worldRoot, 'pokemon', store, uuid.slice(0, 2), `${uuid}.dat`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `synthetic-${store}`);
  if (time !== null) fs.utimesSync(file, new Date(time), new Date(time));
  return file;
}

const party = (world, uuid, time) => saveFile(world.worldRoot, 'playerpartystore', uuid, time);
const pc = (world, uuid, time) => saveFile(world.worldRoot, 'pcstore', uuid, time);

afterAll(() => {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
});

test('conta única: lista somente identidade opaca, nome e mtimes, sem escolher outra conta', () => {
  const world = fixture();
  const partyPath = party(world, UUID_A, Date.UTC(2001, 0, 1, 10));
  const pcPath = pc(world, UUID_A, Date.UTC(2001, 0, 1, 11));
  const result = registry(world.configPath).list();
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].name, 'Synthetic');
  assert.equal(result.accounts[0].isSelected, true);
  assert.equal(result.selectedAccountId, result.accounts[0].id);
  assert.equal(result.mostRecentlyWrittenAccountId, result.accounts[0].id);
  assert.equal(result.accounts[0].partyLastWriteAt, new Date(Date.UTC(2001, 0, 1, 10)).toISOString());
  assert.equal(result.accounts[0].pcLastWriteAt, new Date(Date.UTC(2001, 0, 1, 11)).toISOString());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(UUID_A), false);
  assert.equal(serialized.includes(world.root), false);
  assert.equal(fs.existsSync(partyPath), true);
  assert.equal(fs.existsSync(pcPath), true);
});

test('mesmo nome: mantém a conta configurada selecionada, sugere party mais recente e persiste só após escolha explícita', () => {
  const world = fixture([
    {uuid: UUID_A, name: 'SameName'},
    {uuid: UUID_B, name: 'SameName'},
  ]);
  const oldParty = party(world, UUID_A, Date.UTC(2001, 0, 1));
  const oldPc = pc(world, UUID_A, Date.UTC(2001, 1, 1));
  const newParty = party(world, UUID_B, Date.UTC(2003, 0, 1));
  const newPc = pc(world, UUID_B, Date.UTC(2001, 2, 1));
  const before = [oldParty, oldPc, newParty, newPc].map((file) => fs.readFileSync(file));

  const accounts = registry(world.configPath);
  const result = accounts.list();
  const selected = result.accounts.find((account) => account.isSelected);
  const latestParty = result.accounts.find((account) => account.id === result.mostRecentlyWrittenAccountId);
  assert.equal(result.accounts.length, 2);
  assert.equal(selected.name, 'SameName');
  assert.equal(latestParty.partyLastWriteAt > selected.partyLastWriteAt, true);
  assert.notEqual(result.selectedAccountId, result.mostRecentlyWrittenAccountId);
  assert.notEqual(selected.id, latestParty.id);
  assert.equal(accounts.select(latestParty.id), undefined);
  const afterSelection = accounts.list();
  assert.equal(
    afterSelection.selectedAccountId,
    afterSelection.accounts.find((account) => account.name === 'SameName' && account.partyLastWriteAt === latestParty.partyLastWriteAt).id,
  );
  assert.equal(afterSelection.accounts.find((account) => account.isSelected).name, 'SameName');
  const savedConfig = JSON.parse(fs.readFileSync(world.configPath, 'utf8'));
  assert.equal(savedConfig.playerUuid, UUID_B);
  assert.equal(savedConfig.retained, 'synthetic');
  assert.deepEqual(
    [oldParty, oldPc, newParty, newPc].map((file) => fs.readFileSync(file)),
    before,
  );
});

test('PC recente não substitui a sugestão de party; outras pessoas não são expostas', () => {
  const world = fixture([
    {uuid: UUID_A, name: 'Synthetic'},
    {uuid: UUID_B, name: 'Synthetic'},
    {uuid: UUID_C, name: 'Unrelated'},
  ]);
  party(world, UUID_A, Date.UTC(2001, 0, 1));
  pc(world, UUID_A, Date.UTC(2006, 0, 1));
  party(world, UUID_B, Date.UTC(2003, 0, 1));
  pc(world, UUID_B, Date.UTC(2001, 1, 1));
  party(world, UUID_C, Date.UTC(2007, 0, 1));
  const result = registry(world.configPath).list();
  const olderParty = result.accounts.find((account) => account.isSelected);
  const newerParty = result.accounts.find((account) => account.id === result.mostRecentlyWrittenAccountId);
  assert.equal(result.accounts.length, 2);
  assert.equal(olderParty.pcLastWriteAt > newerParty.pcLastWriteAt, true);
  assert.equal(result.mostRecentlyWrittenAccountId, newerParty.id);
  assert.equal(
    result.accounts.some((account) => account.name === 'Unrelated'),
    false,
  );

  const empty = fixture([
    {uuid: UUID_A, name: 'Synthetic'},
    {uuid: UUID_B, name: 'Synthetic'},
  ]);
  const emptyAccounts = registry(empty.configPath);
  const noFiles = emptyAccounts.list();
  assert.equal(noFiles.accounts.length, 2);
  assert.equal(noFiles.accounts[0].partyLastWriteAt, null);
  assert.equal(noFiles.accounts[0].pcLastWriteAt, null);
  assert.equal(noFiles.accounts.find((account) => !account.isSelected).selectable, false);
  assert.equal(noFiles.mostRecentlyWrittenAccountId, null);
  const unavailable = noFiles.accounts.find((account) => !account.isSelected);
  assert.equal(unavailable.selectable, false);
  assert.throws(() => emptyAccounts.select(unavailable.id), {
    message: 'A conta escolhida é inválida ou expirou. Atualize a lista e tente novamente.',
  });
});

test('token de conta é efêmero e inválido recebe erro genérico', () => {
  const world = fixture([
    {uuid: UUID_A, name: 'Same'},
    {uuid: UUID_B, name: 'Same'},
  ]);
  party(world, UUID_B, Date.UTC(2003, 0, 1));
  const accounts = registry(world.configPath);
  const first = accounts.list();
  const previousToken = first.accounts.find((account) => !account.isSelected).id;
  const second = accounts.list();
  assert.notEqual(second.accounts.find((account) => !account.isSelected).id, previousToken);
  assert.throws(() => accounts.select(previousToken), {
    message: 'A conta escolhida é inválida ou expirou. Atualize a lista e tente novamente.',
  });
  assert.equal(fs.readFileSync(world.configPath, 'utf8').includes(UUID_B), false);
});
