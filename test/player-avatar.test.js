import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {readPlayerAvatar} = require('../electron/lib/player-avatar.cjs');

const UUID = '11111111-2222-4333-8444-555555555555';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const profileFor = (url) => ({
  properties: [{name: 'textures', value: Buffer.from(JSON.stringify({textures: {SKIN: {url}}})).toString('base64')}],
});
const reply = (status, body) => ({
  status,
  json: async () => body,
  arrayBuffer: async () => body,
});

let dir;
let configPath;
let cachePath;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-'));
  configPath = path.join(dir, 'config.json');
  cachePath = path.join(dir, 'skin.json');
  fs.writeFileSync(configPath, JSON.stringify({playerUuid: UUID}));
});
afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

const fetchWith = (skinUrl) => async (url) =>
  url.startsWith('https://sessionserver.mojang.com/')
    ? reply(200, profileFor(skinUrl))
    : reply(200, PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length));

describe('skin do jogador', () => {
  it('baixa a skin e guarda o cache sem o UUID em claro', async () => {
    const result = await readPlayerAvatar({configPath, cachePath, fetchImpl: fetchWith('http://textures.minecraft.net/texture/abc')});
    expect(result?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const cache = fs.readFileSync(cachePath, 'utf8');
    expect(cache).not.toContain(UUID);
    expect(cache).not.toContain(UUID.replaceAll('-', ''));
  });

  it('servidor offline (204) não devolve skin', async () => {
    expect(await readPlayerAvatar({configPath, cachePath, fetchImpl: async () => reply(204, null)})).toBeNull();
  });

  it('recusa skin de outro host', async () => {
    expect(await readPlayerAvatar({configPath, cachePath, fetchImpl: fetchWith('https://evil.example/texture/abc')})).toBeNull();
  });

  it('sem rede, usa o cache mesmo vencido', async () => {
    let clock = 1_000;
    await readPlayerAvatar({configPath, cachePath, fetchImpl: fetchWith('https://textures.minecraft.net/texture/abc'), now: () => clock});
    clock += 48 * 60 * 60 * 1000;
    const offline = async () => {
      throw new Error('sem rede');
    };
    const result = await readPlayerAvatar({configPath, cachePath, fetchImpl: offline, now: () => clock});
    expect(result?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('cache de outro UUID não é reaproveitado', async () => {
    await readPlayerAvatar({configPath, cachePath, fetchImpl: fetchWith('https://textures.minecraft.net/texture/abc')});
    fs.writeFileSync(configPath, JSON.stringify({playerUuid: '99999999-2222-4333-8444-555555555555'}));
    const offline = async () => {
      throw new Error('sem rede');
    };
    expect(await readPlayerAvatar({configPath, cachePath, fetchImpl: offline})).toBeNull();
  });
});
