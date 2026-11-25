import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, test} from 'vitest';
import {scrubDiagnosticText} from '../src/platform/diagnostics';

const require = createRequire(import.meta.url);
const {PlayerImportError, readPlayerSnapshotFromConfig, readStableSource} = require('../electron/player-import.cjs');

interface PlayerImportFailure {
  code: string;
  message: string;
  source?: string;
}

const PLAYER_UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const WORLD_NAME = 'mundo-sintetico-260';
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-missing-source-'));
  temporaryRoots.push(root);
  return root;
}

function writeConfig(root: string, serverRoot: string): string {
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({serverRoot, playerUuid: PLAYER_UUID}));
  return configPath;
}

function writeServer(serverRoot: string, levelName: string): void {
  fs.mkdirSync(serverRoot, {recursive: true});
  fs.writeFileSync(path.join(serverRoot, 'server.properties'), `level-name=${levelName}\n`);
}

function playerFile(worldRoot: string, folder: 'playerpartystore' | 'pcstore'): string {
  const shard = PLAYER_UUID.slice(0, 2);
  return path.join(worldRoot, 'pokemon', folder, shard, `${PLAYER_UUID}.dat`);
}

function assertNoLocalLeak(message: string, root: string): void {
  assert.equal(scrubDiagnosticText(message), message, 'a mensagem não pode conter caminho, UUID ou hash');
  assert.ok(!message.includes(root), 'a mensagem não pode conter o caminho absoluto');
  assert.ok(!message.includes(WORLD_NAME), 'a mensagem não pode conter o nome do mundo');
  assert.ok(!message.includes(PLAYER_UUID), 'a mensagem não pode conter o UUID do jogador');
  assert.doesNotMatch(message, /[\\/]/, 'a mensagem não pode conter separador de caminho');
}

function assertMissingSource(run: () => unknown, code: string, source: string, root: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PlayerImportError, 'erro deve ser PlayerImportError');
    const failure = error as PlayerImportFailure;
    assert.equal(failure.code, code);
    assert.equal(failure.source, source, 'o erro deve nomear a fonte que faltou');
    assert.ok(failure.message.length > 0);
    assertNoLocalLeak(failure.message, root);
    return true;
  });
}

test('config.json ausente nomeia a fonte config', () => {
  const root = makeRoot();
  const configPath = path.join(root, 'config.json');
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_CONFIG', 'config', root);
});

test('pasta do servidor ausente nomeia a fonte serverRoot', () => {
  const root = makeRoot();
  const configPath = writeConfig(root, path.join(root, 'pasta-inexistente'));
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_SOURCE_MISSING', 'serverRoot', root);
});

test('server.properties ausente nomeia a fonte server.properties', () => {
  const root = makeRoot();
  const serverRoot = path.join(root, 'servidor');
  fs.mkdirSync(serverRoot);
  const configPath = writeConfig(root, serverRoot);
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_SERVER_CONFIG', 'server.properties', root);
});

test('mundo ativo ausente nomeia a fonte world', () => {
  const root = makeRoot();
  const serverRoot = path.join(root, 'servidor');
  writeServer(serverRoot, WORLD_NAME);
  const configPath = writeConfig(root, serverRoot);
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_WORLD', 'world', root);
});

test('party ausente nomeia a fonte party', () => {
  const root = makeRoot();
  const serverRoot = path.join(root, 'servidor');
  writeServer(serverRoot, WORLD_NAME);
  fs.mkdirSync(path.join(serverRoot, WORLD_NAME), {recursive: true});
  const configPath = writeConfig(root, serverRoot);
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_SOURCE_MISSING', 'party', root);
});

test('PC ausente nomeia a fonte pc quando a party existe', () => {
  const root = makeRoot();
  const serverRoot = path.join(root, 'servidor');
  writeServer(serverRoot, WORLD_NAME);
  const worldRoot = path.join(serverRoot, WORLD_NAME);
  const partyPath = playerFile(worldRoot, 'playerpartystore');
  fs.mkdirSync(path.dirname(partyPath), {recursive: true});
  fs.writeFileSync(partyPath, Buffer.alloc(0));
  const configPath = writeConfig(root, serverRoot);
  assertMissingSource(() => readPlayerSnapshotFromConfig({configPath}), 'ERR_IMPORT_SOURCE_MISSING', 'pc', root);
});

test('ENOENT sem fonte conhecida cai em mensagem genérica, sem nomear fonte', () => {
  const root = makeRoot();
  const serverRoot = path.join(root, 'servidor');
  writeServer(serverRoot, WORLD_NAME);
  fs.mkdirSync(path.join(serverRoot, WORLD_NAME), {recursive: true});
  const configPath = writeConfig(root, serverRoot);
  const readSourceWithUnlabeledEnoent = (filePath: string, kind: string, maxBytes: number) => {
    if (kind === 'party') throw Object.assign(new Error('File not found'), {code: 'ENOENT'});
    return readStableSource(filePath, kind, maxBytes);
  };
  assert.throws(
    () => readPlayerSnapshotFromConfig({configPath, readSource: readSourceWithUnlabeledEnoent}),
    (error: unknown) => {
      assert.ok(error instanceof PlayerImportError, 'erro deve ser PlayerImportError');
      const failure = error as PlayerImportFailure;
      assert.equal(failure.code, 'ERR_IMPORT_SOURCE_MISSING');
      assert.equal(failure.source, undefined, 'sem fonte conhecida não pode haver fonte nomeada');
      assertNoLocalLeak(failure.message, root);
      assert.doesNotMatch(failure.message, /mundo|party|pc|config|server\.properties|pasta/i, 'a mensagem genérica não pode nomear fonte');
      return true;
    },
  );
});
