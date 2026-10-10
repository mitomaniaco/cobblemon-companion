'use strict';

// Busca da skin do jogador na API da Mojang (D17). Só o UUID do config sai do app; nunca é registrado em log nem gravado em claro.
const crypto = require('node:crypto');
const fs = require('node:fs');

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PROFILE_URL = 'https://sessionserver.mojang.com/session/minecraft/profile/';
const SKIN_HOST = 'textures.minecraft.net';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_SKIN_BYTES = 64 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const dataUrlOf = (pngBase64) => ({dataUrl: `data:image/png;base64,${pngBase64}`});

function readConfigUuid(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof config?.playerUuid === 'string' && UUID_PATTERN.test(config.playerUuid) ? config.playerUuid.toLowerCase() : null;
  } catch {
    return null;
  }
}

function readCache(cachePath, uuidHash) {
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cache?.uuidHash !== uuidHash || typeof cache.pngBase64 !== 'string' || typeof cache.fetchedAt !== 'number') return null;
    return cache;
  } catch {
    return null;
  }
}

async function fetchSkin(uuid, fetchImpl) {
  const profile = await fetchImpl(`${PROFILE_URL}${uuid.replaceAll('-', '')}`, {signal: AbortSignal.timeout(TIMEOUT_MS)});
  if (profile.status !== 200) return null;
  const properties = (await profile.json())?.properties;
  const encoded = Array.isArray(properties) ? properties.find((property) => property?.name === 'textures')?.value : null;
  if (typeof encoded !== 'string') return null;
  const skinUrl = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))?.textures?.SKIN?.url;
  if (typeof skinUrl !== 'string') return null;
  const url = new URL(skinUrl);
  if (url.hostname !== SKIN_HOST) return null;
  url.protocol = 'https:';
  const response = await fetchImpl(url.href, {signal: AbortSignal.timeout(TIMEOUT_MS)});
  if (response.status !== 200) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length > MAX_SKIN_BYTES ||
    bytes.length < PNG_SIGNATURE.length ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return null;
  }
  return bytes.toString('base64');
}

async function readPlayerAvatar({configPath, cachePath, fetchImpl = fetch, now = () => Date.now()}) {
  const uuid = readConfigUuid(configPath);
  if (uuid === null) return null;
  const uuidHash = crypto.createHash('sha256').update(uuid).digest('hex');
  const cached = readCache(cachePath, uuidHash);
  if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) return dataUrlOf(cached.pngBase64);
  try {
    const pngBase64 = await fetchSkin(uuid, fetchImpl);
    if (pngBase64 === null) return cached ? dataUrlOf(cached.pngBase64) : null;
    fs.writeFileSync(cachePath, JSON.stringify({uuidHash, fetchedAt: now(), pngBase64}));
    return dataUrlOf(pngBase64);
  } catch {
    return cached ? dataUrlOf(cached.pngBase64) : null;
  }
}

module.exports = {readPlayerAvatar};
