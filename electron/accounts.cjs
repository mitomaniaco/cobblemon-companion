'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_USERCACHE_BYTES = 2 * 1024 * 1024;
const MAX_PROPERTIES_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function foldAsciiCase(value) {
  return value.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
}

function readBoundedProperties(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > MAX_PROPERTIES_BYTES) throw new Error();
    const bytes = Buffer.allocUnsafe(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    const after = fs.fstatSync(fd);
    if (
      offset !== before.size ||
      offset > MAX_PROPERTIES_BYTES ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      before.ino !== after.ino
    )
      throw new Error();
    return bytes.toString('utf8', 0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

function accountError(message) {
  return new Error(message);
}

function parseConfig(configPath) {
  let config;
  try {
    const stat = fs.statSync(configPath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error();
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    throw accountError('Não foi possível ler a configuração local de contas.');
  }
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    typeof config.serverRoot !== 'string' ||
    !path.isAbsolute(config.serverRoot) ||
    typeof config.playerUuid !== 'string' ||
    !UUID_PATTERN.test(config.playerUuid)
  ) {
    throw accountError('A configuração local de contas é inválida.');
  }
  return config;
}

function worldRootFor(serverRoot) {
  let root;
  try {
    root = fs.realpathSync(serverRoot);
    const properties = readBoundedProperties(path.join(root, 'server.properties'));
    const matches = [...properties.matchAll(/^\s*level-name\s*=\s*(.*?)\s*$/gm)];
    const worldName = matches.at(-1)?.[1];
    if (!worldName || path.isAbsolute(worldName)) throw new Error();
    const worldPath = path.resolve(root, worldName);
    const relative = path.relative(root, worldPath);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error();
    const world = fs.realpathSync(worldPath);
    const realRelative = path.relative(root, world);
    if (
      !realRelative ||
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative) ||
      !fs.statSync(world).isDirectory()
    )
      throw new Error();
    return {serverRoot: root, worldRoot: world};
  } catch {
    throw accountError('Não foi possível localizar o mundo configurado para listar contas.');
  }
}

function readUsercache(serverRoot) {
  try {
    const file = path.join(serverRoot, 'usercache.json');
    const realFile = fs.realpathSync(file);
    const relative = path.relative(serverRoot, realFile);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error();
    const stat = fs.statSync(realFile);
    if (!stat.isFile() || stat.size > MAX_USERCACHE_BYTES) throw new Error();
    const parsed = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        /^[A-Za-z0-9_]{1,16}$/.test(entry.name) &&
        typeof entry.uuid === 'string' &&
        UUID_PATTERN.test(entry.uuid),
    );
  } catch {
    throw accountError('Não foi possível ler a lista local de contas do servidor.');
  }
}

function sourceMtime(worldRoot, store, uuid) {
  const normalized = uuid.toLowerCase();
  const file = path.resolve(worldRoot, 'pokemon', store, normalized.slice(0, 2), `${normalized}.dat`);
  const relative = path.relative(worldRoot, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  try {
    const real = fs.realpathSync(file);
    const realRelative = path.relative(worldRoot, real);
    if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
    const stat = fs.statSync(real);
    return stat.isFile() ? stat.mtime.toISOString() : null;
  } catch {
    return null;
  }
}

function discoverAccounts(configPath) {
  const config = parseConfig(configPath);
  const {serverRoot, worldRoot} = worldRootFor(config.serverRoot);
  const cache = readUsercache(serverRoot);
  const byUuid = new Map();
  for (const entry of cache) {
    const uuid = entry.uuid.toLowerCase();
    if (!byUuid.has(uuid)) byUuid.set(uuid, entry.name);
  }
  const selectedUuid = config.playerUuid.toLowerCase();
  const selectedName = byUuid.get(selectedUuid) ?? 'Conta sem nome no usercache';
  if (!byUuid.has(selectedUuid)) byUuid.set(selectedUuid, selectedName);
  const accounts = [...byUuid.entries()].map(([uuid, name]) => {
    const partyLastWriteAt = sourceMtime(worldRoot, 'playerpartystore', uuid);
    const pcLastWriteAt = sourceMtime(worldRoot, 'pcstore', uuid);
    return {
      uuid,
      name,
      selectable: partyLastWriteAt !== null || pcLastWriteAt !== null,
      partyLastWriteAt,
      pcLastWriteAt,
    };
  });
  const visibleAccounts = accounts.filter(
    ({uuid, name}) => uuid === selectedUuid || foldAsciiCase(name) === foldAsciiCase(selectedName),
  );
  const newestParty = visibleAccounts
    .filter(({partyLastWriteAt}) => partyLastWriteAt !== null)
    .sort((left, right) => Date.parse(right.partyLastWriteAt) - Date.parse(left.partyLastWriteAt))[0];
  return {accounts: visibleAccounts, selectedUuid, newestPartyUuid: newestParty?.uuid ?? null};
}

function persistSelection(configPath, uuid) {
  const config = parseConfig(configPath);
  const nextConfig = {...config, playerUuid: uuid};
  const tempPath = `${configPath}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(nextConfig, null, 2)}\n`, {flag: 'wx', mode: 0o600});
    fs.renameSync(tempPath, configPath);
  } catch {
    try {
      fs.rmSync(tempPath, {force: true});
    } catch {}
    throw accountError('Não foi possível salvar a conta escolhida na configuração local.');
  }
}

function createSaveAccountRegistry(options = {}) {
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const tokenToUuid = new Map();
  const TOKEN_TTL_MS = 5 * 60 * 1000;

  function list() {
    const discovered = discoverAccounts(configPath);
    tokenToUuid.clear();
    const idByUuid = new Map();
    for (const account of discovered.accounts) {
      const id = crypto.randomBytes(24).toString('base64url');
      tokenToUuid.set(id, {uuid: account.uuid, selectable: account.selectable, expiresAt: Date.now() + TOKEN_TTL_MS});
      idByUuid.set(account.uuid, id);
    }
    return {
      accounts: discovered.accounts.map(({uuid, name, selectable, partyLastWriteAt, pcLastWriteAt}) => ({
        id: idByUuid.get(uuid),
        name,
        selectable,
        partyLastWriteAt,
        pcLastWriteAt,
        isSelected: uuid === discovered.selectedUuid,
      })),
      selectedAccountId: idByUuid.get(discovered.selectedUuid),
      mostRecentlyWrittenAccountId: discovered.newestPartyUuid ? idByUuid.get(discovered.newestPartyUuid) : null,
    };
  }

  function select(id) {
    const selection = typeof id === 'string' ? tokenToUuid.get(id) : undefined;
    if (!selection?.selectable || selection.expiresAt < Date.now())
      throw accountError('A conta escolhida é inválida ou expirou. Atualize a lista e tente novamente.');
    const discovered = discoverAccounts(configPath);
    const current = discovered.accounts.find(({uuid}) => uuid === selection.uuid);
    if (!current?.selectable) throw accountError('A conta escolhida é inválida ou expirou. Atualize a lista e tente novamente.');
    persistSelection(configPath, selection.uuid);
    tokenToUuid.clear();
  }

  return {list, select};
}

module.exports = {createSaveAccountRegistry};
