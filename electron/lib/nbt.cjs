'use strict';

const zlib = require('node:zlib');

// Read-only NBT parser for Minecraft/Cobblemon player files.
function parseNbt(input) {
  const b = input[0] === 0x1f && input[1] === 0x8b ? zlib.gunzipSync(input) : input;
  let p = 0;
  const check = (n) => {
    if (n < 0 || p + n > b.length) throw new Error('NBT truncado/invalido');
  };
  function take(n) {
    check(n);
    const v = b.subarray(p, p + n);
    p += n;
    return v;
  }
  function u8() {
    return take(1)[0];
  }
  function i32() {
    return take(4).readInt32BE();
  }
  function str() {
    const n = take(2).readUInt16BE();
    return take(n).toString('utf8');
  }
  function array(read) {
    const n = i32();
    if (n < 0 || n > 1000000) throw new Error('Lista NBT fora do limite');
    return Array.from({length: n}, read);
  }
  function value(t, depth = 0) {
    if (depth > 100) throw new Error('NBT excessivamente aninhado');
    switch (t) {
      case 1:
        return take(1).readInt8();
      case 2:
        return take(2).readInt16BE();
      case 3:
        return i32();
      case 4:
        return take(8).readBigInt64BE().toString();
      case 5:
        return take(4).readFloatBE();
      case 6:
        return take(8).readDoubleBE();
      case 7:
        return [...take(i32())];
      case 8:
        return str();
      case 9: {
        const subtype = u8();
        return array(() => value(subtype, depth + 1));
      }
      case 10: {
        const object = Object.create(null);
        for (let type; (type = u8()) !== 0; ) {
          const name = str();
          if (Object.hasOwn(object, name)) throw new Error('Chave NBT duplicada');
          object[name] = value(type, depth + 1);
        }
        return object;
      }
      case 11:
        return array(i32);
      case 12:
        return array(() => take(8).readBigInt64BE().toString());
      default:
        throw new Error(`Tag NBT desconhecida: ${t}`);
    }
  }
  const type = u8();
  str();
  const result = value(type);
  if (p !== b.length) throw new Error('Bytes NBT inesperados');
  return result;
}

module.exports = {parseNbt};
