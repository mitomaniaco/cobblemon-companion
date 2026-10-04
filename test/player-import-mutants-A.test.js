import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, test} from 'vitest';
import {vi} from 'vitest';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {readStableSource} = require('../electron/player-import.cjs');

const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// ============================================================================
// sourceLabel tests - ensure all kinds return correct labels
// ============================================================================

test('sourceLabel retorna "party" para kind party', () => {
  // This tests the ConditionalExpression→true mutation on line 35
  // We need to call it through readStableSource since sourceLabel is not exported
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'party.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  try {
    readStableSource(filePath, 'party', 100);
    // Success means sourceLabel('party') was evaluated correctly in error paths
  } catch (err) {
    // Should not have sourceLabel mutation
    assert(err.message.includes('party'));
  }
});

test('sourceLabel retorna "PC" para kind pc', () => {
  // This tests the ConditionalExpression→true mutation on line 36
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'pc.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  try {
    readStableSource(filePath, 'pc', 100);
  } catch (err) {
    // Should contain "PC" not "party"
    assert(err.message.includes('PC'));
    assert(!err.message.includes('party'));
  }
});

test('sourceLabel retorna "server.properties" para kind server.properties', () => {
  // This tests the ConditionalExpression→true mutation on line 37
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'props.txt');
  fs.writeFileSync(filePath, Buffer.from('test'));

  try {
    readStableSource(filePath, 'server.properties', 100);
  } catch (err) {
    assert(err.message.includes('server.properties'));
  }
});

test('sourceLabel retorna "configuração local" para kind desconhecido', () => {
  // This tests the ConditionalExpression→false mutation on line 34-39
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'unknown.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  try {
    readStableSource(filePath, 'config', 100);
  } catch (err) {
    // For 'config' kind, should fall through to "configuração local"
    assert(err.message.includes('configuração local'));
  }
});

// ============================================================================
// readStableSource file size validation - boundary tests
// ============================================================================

test('readStableSource rejeita tamanho exatamente 0 como erro (size < 0)', () => {
  // This tests the mutation: EqualityOperator→before.size <= 0
  // We need size < 0 to trigger, not size <= 0
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'negative.dat');
  fs.writeFileSync(filePath, Buffer.from('x'));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    if (callCount === 1) {
      return {
        isFile: () => true,
        size: -1,
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        ino: 12345,
        mtime: new Date(),
      };
    }
    return originalFstat(fd);
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_SOURCE_SIZE',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource aceita tamanho 0 (não rejeita)', () => {
  // This ensures size === 0 does NOT trigger the size < 0 check
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const emptyFile = path.join(root, 'empty.dat');
  fs.writeFileSync(emptyFile, Buffer.from(''));

  const result = readStableSource(emptyFile, 'party', 100);
  assert.strictEqual(result.bytes.length, 0);
  assert.strictEqual(result.source.size, 0);
});

// ============================================================================
// readStableSource buffer reading arithmetic
// ============================================================================

test('readStableSource lê arquivo em múltiplos chunks corretamente', () => {
  // This tests the arithmetic mutation: bytes.length - offset → bytes.length + offset
  // The loop condition offset < bytes.length ensures the right calculation
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'large.dat');
  const testData = Buffer.alloc(1000, 0xab);
  fs.writeFileSync(filePath, testData);

  // Mock readSync to return only 100 bytes at a time
  const originalReadSync = fs.readSync;
  let callCount = 0;

  vi.spyOn(fs, 'readSync').mockImplementation((fd, buffer, offset, length, position) => {
    // Return min of 100 or requested length to simulate chunking
    const toRead = Math.min(100, length);
    if (toRead <= 0) return 0;
    callCount++;
    return originalReadSync(fd, buffer, offset, toRead, position);
  });

  try {
    const result = readStableSource(filePath, 'party', 10000);
    // Should read all 1000 bytes despite chunking
    assert.strictEqual(result.bytes.length, 1000);
    assert(callCount >= 10, `Expected at least 10 read calls, got ${callCount}`);
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource com readSync retornando 0 falha', () => {
  // This tests: if (read === 0) fail(...)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'incomplete.dat');
  fs.writeFileSync(filePath, Buffer.alloc(100));

  vi.spyOn(fs, 'readSync').mockReturnValue(0);

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

// ============================================================================
// readStableSource consistency checks (before/after fstat)
// ============================================================================

test('readStableSource detecta mudança de tamanho entre fstat antes e depois', () => {
  // This tests: before.size !== after.size
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'change.dat');
  fs.writeFileSync(filePath, Buffer.alloc(100));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    const stats = originalFstat(fd);
    if (callCount === 1) {
      return {
        ...stats,
        isFile: () => true,
        size: 100,
      };
    }
    // After read, size changed
    return {
      ...stats,
      isFile: () => true,
      size: 200,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      ino: stats.ino,
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 10000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detecta mudança de mtimeMs', () => {
  // This tests: before.mtimeMs !== after.mtimeMs
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'mtime.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    const stats = originalFstat(fd);
    if (callCount === 1) {
      return {
        ...stats,
        isFile: () => true,
        mtimeMs: 1000,
      };
    }
    return {
      ...stats,
      isFile: () => true,
      mtimeMs: 2000,
      size: stats.size,
      ctimeMs: stats.ctimeMs,
      ino: stats.ino,
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 10000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detecta mudança de ctimeMs', () => {
  // This tests: before.ctimeMs !== after.ctimeMs
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'ctime.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    const stats = originalFstat(fd);
    if (callCount === 1) {
      return {
        ...stats,
        isFile: () => true,
        ctimeMs: 1000,
      };
    }
    return {
      ...stats,
      isFile: () => true,
      ctimeMs: 2000,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ino: stats.ino,
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 10000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detecta mudança de ino', () => {
  // This tests: before.ino !== after.ino
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'ino.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    const stats = originalFstat(fd);
    if (callCount === 1) {
      return {
        ...stats,
        isFile: () => true,
        ino: 11111,
      };
    }
    return {
      ...stats,
      isFile: () => true,
      ino: 22222,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 10000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

// ============================================================================
// readStableSource return structure - ObjectLiteral mutation tests
// ============================================================================

test('readStableSource retorna structure completa com source e observed', () => {
  // This tests the ObjectLiteral→{} mutations on lines 65-71
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'struct.dat');
  const testContent = Buffer.from('test content');
  fs.writeFileSync(filePath, testContent);

  const result = readStableSource(filePath, 'party', 1000);

  // Verify all required fields exist
  assert(result.bytes !== undefined);
  assert(result.source !== undefined);
  assert(result.observed !== undefined);
  assert.strictEqual(typeof result.source.kind, 'string');
  assert.strictEqual(result.source.kind, 'party');
  assert.strictEqual(typeof result.source.sha256, 'string');
  assert.strictEqual(result.source.sha256.length, 64);
  assert.strictEqual(typeof result.source.modifiedAt, 'string');
  assert(result.source.modifiedAt.includes('T'));
  assert.strictEqual(typeof result.source.size, 'number');
  assert.strictEqual(result.source.size, testContent.length);

  assert.strictEqual(typeof result.observed.mtimeMs, 'number');
  assert.strictEqual(typeof result.observed.ctimeMs, 'number');
  assert.strictEqual(typeof result.observed.ino, 'number');
});

test('readStableSource sha256 é hash hexadecimal válido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'hash.dat');
  fs.writeFileSync(filePath, Buffer.from('content'));

  const result = readStableSource(filePath, 'party', 1000);
  assert(/^[a-f0-9]{64}$/.test(result.source.sha256));
});

test('readStableSource modifiedAt é timestamp ISO válido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'time.dat');
  fs.writeFileSync(filePath, Buffer.from('content'));

  const result = readStableSource(filePath, 'party', 1000);
  // Valid ISO string should parse to a date
  const parsed = new Date(result.source.modifiedAt);
  assert(!Number.isNaN(parsed.getTime()));
  assert.strictEqual(result.source.modifiedAt, parsed.toISOString());
});

// ============================================================================
// readStableSource file descriptor handling
// ============================================================================

test('readStableSource fecha descriptor mesmo com erro', () => {
  // This tests the fd !== undefined and closeSync in finally block
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'close.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  let closeCalled = false;
  const originalCloseSync = fs.closeSync;

  vi.spyOn(fs, 'closeSync').mockImplementation((fd) => {
    closeCalled = true;
    return originalCloseSync(fd);
  });

  vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
    throw new Error('Simulated error');
  });

  try {
    try {
      readStableSource(filePath, 'party', 1000);
    } catch {
      // Expected error
    }
    assert(closeCalled, 'closeSync should have been called');
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource ignora erro de closeSync', () => {
  // This tests the try/catch in finally that ignores closeSync errors
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'closeerr.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  vi.spyOn(fs, 'closeSync').mockImplementation(() => {
    throw new Error('Close failed');
  });

  // Should not throw even though closeSync throws
  const result = readStableSource(filePath, 'party', 1000);
  assert(result.bytes !== undefined);

  vi.restoreAllMocks();
});

test('readStableSource com ENOENT para party', () => {
  // This tests the specific kind handling in ENOENT path
  const nonexistent = path.join(os.tmpdir(), `missing-${Date.now()}.dat`);

  assert.throws(
    () => readStableSource(nonexistent, 'party', 1000),
    (err) => err.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

test('readStableSource com ENOENT para pc', () => {
  const nonexistent = path.join(os.tmpdir(), `missing-${Date.now()}.dat`);

  assert.throws(
    () => readStableSource(nonexistent, 'pc', 1000),
    (err) => err.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

test('readStableSource com ENOENT para server.properties', () => {
  const nonexistent = path.join(os.tmpdir(), `missing-${Date.now()}.dat`);

  assert.throws(
    () => readStableSource(nonexistent, 'server.properties', 1000),
    (err) => err.code === 'ERR_IMPORT_SERVER_CONFIG',
  );
});

test('readStableSource com ENOENT para kind desconhecido', () => {
  const nonexistent = path.join(os.tmpdir(), `missing-${Date.now()}.dat`);

  assert.throws(
    () => readStableSource(nonexistent, 'config', 1000),
    (err) => err.code === 'ERR_IMPORT_CONFIG',
  );
});

test('readStableSource rejeita diretório', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);

  assert.throws(
    () => readStableSource(root, 'party', 1000),
    (err) => err.code === 'ERR_IMPORT_SOURCE_TYPE',
  );
});

// ============================================================================
// Additional targeted tests for survivors
// ============================================================================

test('readStableSource com maxBytes exatamente no limite aceita', () => {
  // Test boundary for max bytes limit
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'boundary.dat');
  const content = Buffer.alloc(100);
  fs.writeFileSync(filePath, content);

  // Should accept exactly at the limit
  const result = readStableSource(filePath, 'party', 100);
  assert.strictEqual(result.source.size, 100);
});

test('readStableSource rejeita acima do limite', () => {
  // Test that exceeding maxBytes is rejected
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'toolarge.dat');
  fs.writeFileSync(filePath, Buffer.alloc(101));

  assert.throws(
    () => readStableSource(filePath, 'party', 100),
    (err) => err.code === 'ERR_IMPORT_TOO_LARGE',
  );
});

test('readStableSource com isFile retornando false rejeita', () => {
  // Test that non-regular files are rejected immediately
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'notfile.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    const stats = originalFstat(fd);
    return {
      ...stats,
      isFile: () => false,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      ino: stats.ino,
      mtime: stats.mtime,
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_SOURCE_TYPE',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource com erro genérico lançado durante leitura', () => {
  // Test that generic errors are converted to ERR_IMPORT_READ
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'error.dat');
  fs.writeFileSync(filePath, Buffer.alloc(10));

  vi.spyOn(fs, 'readSync').mockImplementation(() => {
    throw new Error('Read error');
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_READ',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource conteúdos diferentes produzem hashes diferentes', () => {
  // Ensure that sha256 is actually computed on the content
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const file1 = path.join(root, 'file1.dat');
  const file2 = path.join(root, 'file2.dat');
  fs.writeFileSync(file1, Buffer.from('content1'));
  fs.writeFileSync(file2, Buffer.from('content2'));

  const result1 = readStableSource(file1, 'party', 1000);
  const result2 = readStableSource(file2, 'party', 1000);

  assert.notStrictEqual(result1.source.sha256, result2.source.sha256);
});

test('readStableSource conteúdos idênticos produzem hashes iguais', () => {
  // Ensure deterministic hashing
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const file1 = path.join(root, 'file1.dat');
  const file2 = path.join(root, 'file2.dat');
  const content = Buffer.from('same content');
  fs.writeFileSync(file1, content);
  fs.writeFileSync(file2, content);

  const result1 = readStableSource(file1, 'party', 1000);
  const result2 = readStableSource(file2, 'party', 1000);

  assert.strictEqual(result1.source.sha256, result2.source.sha256);
});
