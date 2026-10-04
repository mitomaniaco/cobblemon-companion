import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, test, vi} from 'vitest';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {readStableSource} = require('../electron/player-import.cjs');

const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// Test readStableSource with file type validation
test('readStableSource rejects directories (non-regular files)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const testDir = path.join(root, 'notafile');
  fs.mkdirSync(testDir);

  assert.throws(
    () => readStableSource(testDir, 'party', 1024 * 1024),
    (error) => error?.code === 'ERR_IMPORT_SOURCE_TYPE',
  );
});

// Test readStableSource size limit enforcement
test('readStableSource rejects files exceeding maxBytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'oversized.dat');
  const maxBytes = 1000;
  fs.writeFileSync(filePath, Buffer.alloc(maxBytes + 1));

  assert.throws(
    () => readStableSource(filePath, 'party', maxBytes),
    (error) => error?.code === 'ERR_IMPORT_TOO_LARGE',
  );
});

// Test readStableSource accepts files at boundary
test('readStableSource accepts files exactly at maxBytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'boundary.dat');
  const maxBytes = 100;
  const data = Buffer.alloc(maxBytes);
  fs.writeFileSync(filePath, data);

  const result = readStableSource(filePath, 'party', maxBytes);
  assert(result);
  assert.equal(result.source.size, maxBytes);
  assert.equal(result.bytes.length, maxBytes);
});

// Test readStableSource ENOENT handling for party
test('readStableSource maps ENOENT to ERR_IMPORT_SOURCE_MISSING for party', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const missingFile = path.join(root, 'missing.dat');

  assert.throws(
    () => readStableSource(missingFile, 'party', 1024 * 1024),
    (error) => error?.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

// Test readStableSource ENOENT handling for pc
test('readStableSource maps ENOENT to ERR_IMPORT_SOURCE_MISSING for pc', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const missingFile = path.join(root, 'missing.dat');

  assert.throws(
    () => readStableSource(missingFile, 'pc', 1024 * 1024),
    (error) => error?.code === 'ERR_IMPORT_SOURCE_MISSING',
  );
});

// Test readStableSource ENOENT handling for server.properties
test('readStableSource maps ENOENT to ERR_IMPORT_SERVER_CONFIG for server.properties', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const missingFile = path.join(root, 'server.properties');

  assert.throws(
    () => readStableSource(missingFile, 'server.properties', 1024 * 1024),
    (error) => error?.code === 'ERR_IMPORT_SERVER_CONFIG',
  );
});

// Test readStableSource ENOENT handling for config
test('readStableSource maps ENOENT to ERR_IMPORT_CONFIG for other kinds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const missingFile = path.join(root, 'config.json');

  assert.throws(
    () => readStableSource(missingFile, 'config', 1024 * 1024),
    (error) => error?.code === 'ERR_IMPORT_CONFIG',
  );
});

// Test readStableSource successful read returns correct structure
test('readStableSource returns complete data structure with sha256, modifiedAt, and observed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'valid.dat');
  const data = Buffer.from('test data content');
  fs.writeFileSync(filePath, data);

  const result = readStableSource(filePath, 'party', 10000);

  assert(result.bytes);
  assert.deepEqual(result.bytes, data);
  assert.equal(result.source.kind, 'party');
  assert(result.source.sha256);
  assert.equal(result.source.sha256.length, 64); // hex sha256
  assert(result.source.modifiedAt);
  assert(typeof result.source.modifiedAt, 'string');
  assert.equal(result.source.size, data.length);
  assert(typeof result.observed.mtimeMs, 'number');
  assert(typeof result.observed.ctimeMs, 'number');
  assert(typeof result.observed.ino, 'number');
});

test('readStableSource reads large files in multiple chunks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'large.dat');
  const largeData = Buffer.alloc(50000, 'x');
  fs.writeFileSync(filePath, largeData);

  const result = readStableSource(filePath, 'party', 1024 * 1024);
  assert.equal(result.bytes.length, 50000);
  assert.deepEqual(result.bytes, largeData);
  assert.equal(result.source.size, 50000);
});

// Test that different file contents produce different hashes
test('readStableSource produces different sha256 for different content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);

  const file1 = path.join(root, 'file1.dat');
  fs.writeFileSync(file1, Buffer.from('content one'));

  const file2 = path.join(root, 'file2.dat');
  fs.writeFileSync(file2, Buffer.from('content two'));

  const result1 = readStableSource(file1, 'party', 10000);
  const result2 = readStableSource(file2, 'party', 10000);

  assert.notEqual(result1.source.sha256, result2.source.sha256);
});

// Test that identical content produces same hash
test('readStableSource produces same sha256 for identical content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);

  const data = Buffer.from('identical data');

  const file1 = path.join(root, 'file1.dat');
  fs.writeFileSync(file1, data);

  const file2 = path.join(root, 'file2.dat');
  fs.writeFileSync(file2, data);

  const result1 = readStableSource(file1, 'party', 10000);
  const result2 = readStableSource(file2, 'party', 10000);

  assert.equal(result1.source.sha256, result2.source.sha256);
});

// Test returned size matches actual data
test('readStableSource returned size matches actual buffer length', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  const testData = Buffer.from('test content 12345');
  fs.writeFileSync(filePath, testData);

  const result = readStableSource(filePath, 'party', 10000);
  assert.equal(result.source.size, testData.length);
  assert.equal(result.bytes.length, testData.length);
  assert.equal(result.source.size, result.bytes.length);
});

// ============================================================================
// Targeted tests for specific survivors in readStableSource
// ============================================================================

test('readStableSource rejects negative file size', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test content'));

  let callCount = 0;
  const originalFstat = fs.fstatSync;

  vi.spyOn(fs, 'fstatSync').mockImplementation((fd) => {
    callCount++;
    if (callCount === 1) {
      // First call (checking initial file state)
      return {
        isFile: () => true,
        size: -1, // Negative size - should be rejected
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

test('readStableSource detects size change between before and after fstat', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  let callCount = 0;

  vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        isFile: () => true,
        size: 4,
        mtimeMs: 1000,
        ctimeMs: 1000,
        ino: 12345,
        mtime: new Date(),
      };
    }
    // Second call: different size
    return {
      isFile: () => true,
      size: 5,
      mtimeMs: 1000,
      ctimeMs: 1000,
      ino: 12345,
      mtime: new Date(),
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detects mtimeMs change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  let callCount = 0;

  vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        isFile: () => true,
        size: 4,
        mtimeMs: 1000,
        ctimeMs: 1000,
        ino: 12345,
        mtime: new Date(),
      };
    }
    // Second call: different mtimeMs
    return {
      isFile: () => true,
      size: 4,
      mtimeMs: 2000,
      ctimeMs: 1000,
      ino: 12345,
      mtime: new Date(),
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detects ctimeMs change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  let callCount = 0;

  vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        isFile: () => true,
        size: 4,
        mtimeMs: 1000,
        ctimeMs: 1000,
        ino: 12345,
        mtime: new Date(),
      };
    }
    // Second call: different ctimeMs
    return {
      isFile: () => true,
      size: 4,
      mtimeMs: 1000,
      ctimeMs: 2000,
      ino: 12345,
      mtime: new Date(),
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource detects ino change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

  let callCount = 0;

  vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        isFile: () => true,
        size: 4,
        mtimeMs: 1000,
        ctimeMs: 1000,
        ino: 12345,
        mtime: new Date(),
      };
    }
    // Second call: different ino
    return {
      isFile: () => true,
      size: 4,
      mtimeMs: 1000,
      ctimeMs: 1000,
      ino: 99999,
      mtime: new Date(),
    };
  });

  try {
    assert.throws(
      () => readStableSource(filePath, 'party', 1000),
      (err) => err.code === 'ERR_IMPORT_CHANGED',
    );
  } finally {
    vi.restoreAllMocks();
  }
});

test('readStableSource handles readSync returning 0 (incomplete read)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test'));

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

test('readStableSource ignores closeSync errors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'test.dat');
  fs.writeFileSync(filePath, Buffer.from('test content'));

  vi.spyOn(fs, 'closeSync').mockImplementation(() => {
    throw new Error('closeSync mock error');
  });

  try {
    // Should succeed despite closeSync throwing
    const source = readStableSource(filePath, 'party', 1000);
    assert.equal(source.source.size, 12);
  } finally {
    vi.restoreAllMocks();
  }
});
