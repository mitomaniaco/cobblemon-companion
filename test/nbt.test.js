import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'vitest';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const {parseNbt} = require('../electron/lib/nbt.cjs');

// Helper functions to build NBT buffers
function nbtString(value) {
  const text = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(text.length);
  return Buffer.concat([length, text]);
}

function named(type, name, payload) {
  return Buffer.concat([Buffer.from([type]), nbtString(name), payload]);
}

function byteTag(name, value) {
  return named(1, name, Buffer.from([value]));
}

function shortTag(name, value) {
  const payload = Buffer.alloc(2);
  payload.writeInt16BE(value);
  return named(2, name, payload);
}

function intTag(name, value) {
  const payload = Buffer.alloc(4);
  payload.writeInt32BE(value);
  return named(3, name, payload);
}

function longTag(name, value) {
  const payload = Buffer.alloc(8);
  payload.writeBigInt64BE(BigInt(value));
  return named(4, name, payload);
}

function floatTag(name, value) {
  const payload = Buffer.alloc(4);
  payload.writeFloatBE(value);
  return named(5, name, payload);
}

function doubleTag(name, value) {
  const payload = Buffer.alloc(8);
  payload.writeDoubleBE(value);
  return named(6, name, payload);
}

function byteArrayTag(name, bytes) {
  const payload = Buffer.alloc(4 + bytes.length);
  payload.writeInt32BE(bytes.length, 0);
  Buffer.from(bytes).copy(payload, 4);
  return named(7, name, payload);
}

function stringTag(name, value) {
  return named(8, name, nbtString(value));
}

function listTag(name, elementType, values) {
  const header = Buffer.alloc(5);
  header[0] = elementType;
  header.writeInt32BE(values.length, 1);
  return named(9, name, Buffer.concat([header, ...values]));
}

function compoundBody(fields) {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

function compoundTag(name, fields) {
  return named(10, name, compoundBody(fields));
}

function intArrayTag(name, values) {
  const payload = Buffer.alloc(4 + values.length * 4);
  payload.writeInt32BE(values.length, 0);
  values.forEach((value, index) => {
    payload.writeInt32BE(value, 4 + index * 4);
  });
  return named(11, name, payload);
}

function longArrayTag(name, values) {
  const payload = Buffer.alloc(4 + values.length * 8);
  payload.writeInt32BE(values.length, 0);
  values.forEach((value, index) => {
    payload.writeBigInt64BE(BigInt(value), 4 + index * 8);
  });
  return named(12, name, payload);
}

function rootNbt(fields) {
  return Buffer.concat([Buffer.from([10, 0, 0]), compoundBody(fields)]);
}

// Gzip detection tests
test('descompacta NBT gzip antes de interpretar', () => {
  const uncompressed = rootNbt([byteTag('test', 42)]);
  const gzipped = zlib.gzipSync(uncompressed);

  assert(gzipped[0] === 0x1f);
  assert(gzipped[1] === 0x8b);

  const result = parseNbt(gzipped);
  assert.equal(result.test, 42);
});

test('processa NBT raw sem decompactação quando não tem magic bytes', () => {
  const raw = rootNbt([intTag('value', 12345)]);
  assert(raw[0] !== 0x1f || raw[1] !== 0x8b);

  const result = parseNbt(raw);
  assert.equal(result.value, 12345);
});

test('rejeita buffer com 0x1f mas não 0x8b (não é gzip)', () => {
  const raw = rootNbt([byteTag('x', 1)]);
  // Modify first byte to 0x1f but leave second byte different
  raw[0] = 0x1f;
  raw[1] = 0x00; // not 0x8b

  // Should parse as raw NBT, not decompress
  assert.throws(() => parseNbt(raw), {message: /NBT/});
});

test('rejeita buffer com 0x8b mas não 0x1f', () => {
  const raw = rootNbt([byteTag('x', 1)]);
  raw[0] = 0x00; // not 0x1f
  raw[1] = 0x8b;

  assert.throws(() => parseNbt(raw), {message: /NBT/});
});

// Truncation tests - test every read size boundary
test('rejeita NBT truncado na tag inicial', () => {
  const buf = Buffer.from([10]); // Just the type, missing root name
  assert.throws(() => parseNbt(buf), {message: /truncado/});
});

test('rejeita NBT truncado na string length', () => {
  const buf = Buffer.from([10, 0]); // Type + 1 byte of name length
  assert.throws(() => parseNbt(buf), {message: /truncado/});
});

test('rejeita NBT truncado na string content', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10]), // type
    nbtString('root').subarray(0, 2), // just length prefix
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita byte tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]), // root tag header
    Buffer.from([1]), // byte tag type
    nbtString('x'),
    // missing byte value
    Buffer.from([0]), // compound end
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita short tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([2]), // short tag type
    nbtString('x'),
    Buffer.from([0]), // only 1 byte of 2-byte value
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita int tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([3]), // int tag type
    nbtString('x'),
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte value
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita long tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([4]), // long tag type
    nbtString('x'),
    Buffer.from([0, 0, 0, 0, 0, 0, 0]), // only 7 bytes of 8-byte value
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita float tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([5]), // float tag type
    nbtString('x'),
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte value
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita double tag truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([6]), // double tag type
    nbtString('x'),
    Buffer.from([0, 0, 0, 0, 0, 0, 0]), // only 7 bytes of 8-byte value
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita byte array truncado na length', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([7]), // byte array tag type
    nbtString('x'),
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte array length
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita byte array truncado na data', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([7]), // byte array tag type
    nbtString('x'),
    Buffer.alloc(4),
    Buffer.from([0, 0, 0, 10]), // says 10 bytes but we provide none
    Buffer.from([0]),
  ]);
  // Set array length to 10
  incomplete.writeInt32BE(10, incomplete.length - 5);
  incomplete.writeInt32BE(10, 5); // at tag type position
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita string tag truncado na string length', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([8]), // string tag type
    nbtString('x'),
    Buffer.from([0]), // only 1 byte of 2-byte string length
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita string tag truncado na string content', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([8]), // string tag type
    nbtString('x'),
    Buffer.from([0, 5]), // claims 5 bytes but we provide 2
    Buffer.from([0, 1]),
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita list tag truncado na list length', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([9]), // list tag type
    nbtString('x'),
    Buffer.from([1]), // element type
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte length
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita list tag com elemento truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([9]), // list tag type
    nbtString('x'),
    Buffer.from([3]), // int element type
    Buffer.alloc(4),
    Buffer.from([0, 0]), // only 2 bytes of 4-byte int
    Buffer.from([0]),
  ]);
  // Set list length to 1
  incomplete.writeInt32BE(1, 5);
  assert.throws(() => parseNbt(incomplete), {message: /NBT/});
});

test('rejeita compound tag truncado na tag type dentro do compound', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([10]), // compound tag type
    nbtString('x'),
    Buffer.from([1]), // nested byte tag type
    nbtString('y'),
    // missing byte value
    Buffer.from([0]), // compound end
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita int array truncado na length', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([11]), // int array tag type
    nbtString('x'),
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte array length
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita int array truncado no elemento', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([11]), // int array tag type
    nbtString('x'),
    Buffer.alloc(4),
    Buffer.from([0, 0, 0]), // only 3 bytes of 4-byte int
    Buffer.from([0]),
  ]);
  incomplete.writeInt32BE(1, 5);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

test('rejeita long array truncado', () => {
  const incomplete = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([12]), // long array tag type
    nbtString('x'),
    Buffer.alloc(4),
    Buffer.from([0, 0, 0, 0, 0, 0, 0]), // only 7 bytes of 8-byte long
    Buffer.from([0]),
  ]);
  incomplete.writeInt32BE(1, 5);
  assert.throws(() => parseNbt(incomplete), {message: /truncado/});
});

// Negative length tests
test('rejeita byte array com comprimento negativo', () => {
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([7]), nbtString('x')]);
  const neg = Buffer.alloc(4);
  neg.writeInt32BE(-1, 0);
  const full = Buffer.concat([buf, neg, Buffer.from([0])]);
  assert.throws(() => parseNbt(full), {message: /truncado/});
});

test('rejeita list com comprimento negativo', () => {
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([9]), nbtString('x'), Buffer.from([1])]);
  const neg = Buffer.alloc(4);
  neg.writeInt32BE(-1, 0);
  const full = Buffer.concat([buf, neg, Buffer.from([0])]);
  assert.throws(() => parseNbt(full), {message: /fora do limite/});
});

test('rejeita int array com comprimento negativo', () => {
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([11]), nbtString('x')]);
  const neg = Buffer.alloc(4);
  neg.writeInt32BE(-1, 0);
  const full = Buffer.concat([buf, neg, Buffer.from([0])]);
  assert.throws(() => parseNbt(full), {message: /fora do limite/});
});

test('rejeita long array com comprimento negativo', () => {
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([12]), nbtString('x')]);
  const neg = Buffer.alloc(4);
  neg.writeInt32BE(-1, 0);
  const full = Buffer.concat([buf, neg, Buffer.from([0])]);
  assert.throws(() => parseNbt(full), {message: /fora do limite/});
});

// Array/List length limit tests (1000000)
test('aceita list com exatamente 1000000 elementos', () => {
  const header = Buffer.alloc(5);
  header[0] = 1; // byte element type
  header.writeInt32BE(1000000, 1);
  const elements = Buffer.alloc(1000000);
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([9]), nbtString('list'), header, elements, Buffer.from([0])]);
  const result = parseNbt(buf);
  assert.ok(result.list);
  assert.equal(result.list.length, 1000000);
});

test('rejeita list com 1000001 elementos', () => {
  const header = Buffer.alloc(5);
  header[0] = 1;
  header.writeInt32BE(1000001, 1);
  const elements = Buffer.alloc(1000001);
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([9]), nbtString('list'), header, elements, Buffer.from([0])]);
  assert.throws(() => parseNbt(buf), {message: /fora do limite/});
});

test('rejeita list com comprimento máximo inteiro', () => {
  const header = Buffer.alloc(5);
  header[0] = 1;
  header.writeInt32BE(2147483647, 1); // MAX_INT
  const buf = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([9]),
    nbtString('list'),
    header,
    Buffer.alloc(0), // no elements
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(buf), {message: /fora do limite/});
});

test('aceita int array com exatamente 1000000 elementos', () => {
  const payload = Buffer.alloc(4 + 1000000 * 4);
  payload.writeInt32BE(1000000, 0);
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([11]), nbtString('arr'), payload, Buffer.from([0])]);
  const result = parseNbt(buf);
  assert.ok(result.arr);
  assert.equal(result.arr.length, 1000000);
});

test('rejeita int array com 1000001 elementos', () => {
  const payload = Buffer.alloc(4 + 1000001 * 4);
  payload.writeInt32BE(1000001, 0);
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([11]), nbtString('arr'), payload, Buffer.from([0])]);
  assert.throws(() => parseNbt(buf), {message: /fora do limite/});
});

test('rejeita long array com 1000001 elementos', () => {
  const payload = Buffer.alloc(4 + 1000001 * 8);
  payload.writeInt32BE(1000001, 0);
  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([12]), nbtString('arr'), payload, Buffer.from([0])]);
  assert.throws(() => parseNbt(buf), {message: /fora do limite/});
});

// Depth limit tests (100)
test('aceita compound aninhado a exatamente profundidade 100', () => {
  let fields = [byteTag('leaf', 1)];
  for (let i = 0; i < 99; i++) {
    fields = [compoundTag(`level${i}`, fields)];
  }
  const buf = rootNbt(fields);
  const result = parseNbt(buf);
  assert.ok(result);
});

test('rejeita compound aninhado a profundidade 101', () => {
  let fields = [byteTag('leaf', 1)];
  for (let i = 0; i < 100; i++) {
    fields = [compoundTag(`level${i}`, fields)];
  }
  const buf = rootNbt(fields);
  assert.throws(() => parseNbt(buf), {message: /aninhado/});
});

test('rejeita list aninhada além da profundidade limite', () => {
  const innerList = Buffer.alloc(5);
  innerList[0] = 1; // byte type
  innerList.writeInt32BE(0, 1); // 0 elements
  let current = Buffer.concat([Buffer.from([1]), innerList]);

  for (let i = 0; i < 100; i++) {
    const header = Buffer.alloc(5);
    header[0] = 9; // list type
    header.writeInt32BE(1, 1);
    current = Buffer.concat([header, current]);
  }

  const buf = Buffer.concat([Buffer.from([10, 0, 0]), Buffer.from([9]), nbtString('root'), current, Buffer.from([0])]);
  assert.throws(() => parseNbt(buf), {message: /aninhado/});
});

// Duplicate key tests
test('rejeita compound com chaves duplicadas', () => {
  const buf = Buffer.concat([
    Buffer.from([10, 0, 0]),
    byteTag('name', 1),
    byteTag('name', 2), // duplicate key
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(buf), {message: /duplicada/});
});

test('rejeita compound aninhado com chave duplicada', () => {
  const buf = Buffer.concat([
    Buffer.from([10, 0, 0]),
    Buffer.from([10]),
    nbtString('inner'),
    byteTag('x', 1),
    byteTag('x', 2),
    Buffer.from([0]),
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(buf), {message: /duplicada/});
});

// Tag type tests - cover all cases
test('decodifica byte tag (tipo 1)', () => {
  const buf = rootNbt([byteTag('byte_val', -128)]);
  const result = parseNbt(buf);
  assert.equal(result.byte_val, -128);
});

test('decodifica byte tag com valor máximo', () => {
  const buf = rootNbt([byteTag('byte_val', 127)]);
  const result = parseNbt(buf);
  assert.equal(result.byte_val, 127);
});

test('decodifica short tag (tipo 2)', () => {
  const buf = rootNbt([shortTag('short_val', -32768)]);
  const result = parseNbt(buf);
  assert.equal(result.short_val, -32768);
});

test('decodifica int tag (tipo 3)', () => {
  const buf = rootNbt([intTag('int_val', -2147483648)]);
  const result = parseNbt(buf);
  assert.equal(result.int_val, -2147483648);
});

test('decodifica long tag (tipo 4) como string', () => {
  const buf = rootNbt([longTag('long_val', 9223372036854775807n)]);
  const result = parseNbt(buf);
  assert.equal(result.long_val, '9223372036854775807');
});

test('decodifica long tag com valor negativo', () => {
  const buf = rootNbt([longTag('long_val', -9223372036854775808n)]);
  const result = parseNbt(buf);
  assert.equal(result.long_val, '-9223372036854775808');
});

test('decodifica float tag (tipo 5)', () => {
  const buf = rootNbt([floatTag('float_val', 3.14)]);
  const result = parseNbt(buf);
  assert.ok(Math.abs(result.float_val - 3.14) < 0.01);
});

test('decodifica double tag (tipo 6)', () => {
  const buf = rootNbt([doubleTag('double_val', Math.PI)]);
  const result = parseNbt(buf);
  assert.equal(result.double_val, Math.PI);
});

test('decodifica byte array (tipo 7)', () => {
  const bytes = [1, 2, 3, 4, 5];
  const buf = rootNbt([byteArrayTag('bytes', bytes)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.bytes, bytes);
});

test('decodifica string tag (tipo 8)', () => {
  const buf = rootNbt([stringTag('str', 'hello')]);
  const result = parseNbt(buf);
  assert.equal(result.str, 'hello');
});

test('decodifica empty string tag', () => {
  const buf = rootNbt([stringTag('str', '')]);
  const result = parseNbt(buf);
  assert.equal(result.str, '');
});

test('decodifica list tag (tipo 9) com bytes', () => {
  const elements = [Buffer.from([1]), Buffer.from([2]), Buffer.from([3])];
  const buf = rootNbt([listTag('list', 1, elements)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.list, [1, 2, 3]);
});

test('decodifica empty list tag', () => {
  const buf = rootNbt([listTag('list', 1, [])]);
  const result = parseNbt(buf);
  assert.deepEqual(result.list, []);
});

test('decodifica compound tag (tipo 10)', () => {
  const buf = rootNbt([compoundTag('compound', [byteTag('x', 10), intTag('y', 20)])]);
  const result = parseNbt(buf);
  assert.equal(result.compound.x, 10);
  assert.equal(result.compound.y, 20);
});

test('decodifica empty compound tag', () => {
  const buf = rootNbt([compoundTag('empty', [])]);
  const result = parseNbt(buf);
  assert.ok(result.empty);
  assert.equal(Object.keys(result.empty).length, 0);
});

test('decodifica int array (tipo 11)', () => {
  const values = [100, 200, 300];
  const buf = rootNbt([intArrayTag('ints', values)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.ints, values);
});

test('decodifica empty int array', () => {
  const buf = rootNbt([intArrayTag('ints', [])]);
  const result = parseNbt(buf);
  assert.deepEqual(result.ints, []);
});

test('decodifica long array (tipo 12) como strings', () => {
  const values = [1n, 9223372036854775807n];
  const buf = rootNbt([longArrayTag('longs', values)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.longs, ['1', '9223372036854775807']);
});

test('decodifica empty long array', () => {
  const buf = rootNbt([longArrayTag('longs', [])]);
  const result = parseNbt(buf);
  assert.deepEqual(result.longs, []);
});

test('rejeita tag type desconhecida (255)', () => {
  const buf = Buffer.concat([
    Buffer.from([255, 0, 0]), // unknown tag type
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(buf), {message: /desconhecida/});
});

test('rejeita tag type desconhecida (13)', () => {
  const buf = Buffer.concat([
    Buffer.from([13, 0, 0]), // unknown tag type
    Buffer.from([0]),
  ]);
  assert.throws(() => parseNbt(buf), {message: /desconhecida/});
});

// Trailing bytes tests
test('rejeita NBT com bytes extras após o final', () => {
  const buf = Buffer.concat([
    rootNbt([byteTag('x', 1)]),
    Buffer.from([255, 255]), // trailing garbage
  ]);
  assert.throws(() => parseNbt(buf), {message: /inesperados/});
});

test('rejeita NBT com um byte extra', () => {
  const base = rootNbt([byteTag('x', 1)]);
  const withExtra = Buffer.concat([base, Buffer.from([0])]);
  assert.throws(() => parseNbt(withExtra), {message: /inesperados/});
});

// Mixed tag types in compound
test('decodifica compound com múltiplos tipos de tags', () => {
  const buf = rootNbt([
    byteTag('b', 10),
    shortTag('s', 20),
    intTag('i', 30),
    longTag('l', 40n),
    floatTag('f', 3.14),
    doubleTag('d', 2.71),
    stringTag('str', 'test'),
    compoundTag('nested', [byteTag('inner', 1)]),
  ]);
  const result = parseNbt(buf);
  assert.equal(result.b, 10);
  assert.equal(result.s, 20);
  assert.equal(result.i, 30);
  assert.equal(result.l, '40');
  assert.ok(Math.abs(result.f - 3.14) < 0.01);
  assert.equal(result.d, 2.71);
  assert.equal(result.str, 'test');
  assert.ok(result.nested);
  assert.equal(result.nested.inner, 1);
});

// List with different element types
test('decodifica list de shorts', () => {
  const elements = [Buffer.alloc(2), Buffer.alloc(2)];
  elements[0].writeInt16BE(100, 0);
  elements[1].writeInt16BE(200, 0);
  const buf = rootNbt([listTag('shorts', 2, elements)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.shorts, [100, 200]);
});

test('decodifica list de ints', () => {
  const elements = [Buffer.alloc(4), Buffer.alloc(4)];
  elements[0].writeInt32BE(1000, 0);
  elements[1].writeInt32BE(2000, 0);
  const buf = rootNbt([listTag('ints', 3, elements)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.ints, [1000, 2000]);
});

test('decodifica list de longs como strings', () => {
  const elements = [Buffer.alloc(8), Buffer.alloc(8)];
  elements[0].writeBigInt64BE(100n, 0);
  elements[1].writeBigInt64BE(200n, 0);
  const buf = rootNbt([listTag('longs', 4, elements)]);
  const result = parseNbt(buf);
  assert.deepEqual(result.longs, ['100', '200']);
});

test('decodifica list de compounds', () => {
  const innerCompound = Buffer.concat([
    byteTag('x', 1),
    Buffer.from([0]), // compound end
  ]);
  const buf = rootNbt([listTag('compounds', 10, [innerCompound])]);
  const result = parseNbt(buf);
  assert.ok(Array.isArray(result.compounds));
  assert.equal(result.compounds[0].x, 1);
});

test('decodifica list de listas (aninhado)', () => {
  const innerList = Buffer.alloc(5);
  innerList[0] = 1; // byte type
  innerList.writeInt32BE(2, 1);
  const innerData = Buffer.concat([innerList, Buffer.from([10, 20])]);

  const buf = rootNbt([listTag('listOfLists', 9, [innerData])]);
  const result = parseNbt(buf);
  assert.ok(Array.isArray(result.listOfLists));
  assert.ok(Array.isArray(result.listOfLists[0]));
  assert.deepEqual(result.listOfLists[0], [10, 20]);
});

// Edge case: large valid array
test('aceita byte array grande', () => {
  const largeArray = Buffer.alloc(100000);
  const buf = rootNbt([byteArrayTag('large', Array.from(largeArray))]);
  const result = parseNbt(buf);
  assert.equal(result.large.length, 100000);
});

// Edge case: deeply nested but within limits
test('decodifica compound profundo (profundidade 99)', () => {
  let fields = [stringTag('value', 'deep')];
  for (let i = 0; i < 98; i++) {
    fields = [compoundTag(`level${i}`, fields)];
  }
  const buf = rootNbt(fields);
  const result = parseNbt(buf);
  assert.ok(result);
});
