// Extrai as skins dos treinadores do RCT (JARs da instância) para public/trainers e gera src/data/trainer-portraits.json.
// Local e não versionado: a instância do jogador é a fonte; nada vai ao repositório.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSelected} from './lib/jar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'assets/rctmod/textures/trainers/';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SKIN_SIZE = 64;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function resolveInstance() {
  const given = argument('--instance');
  if (given) return given;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    return typeof config.serverRoot === 'string' && config.serverRoot ? config.serverRoot : null;
  } catch {
    return null;
  }
}

function isSkin(bytes) {
  return (
    bytes.length >= 24 &&
    Buffer.from(bytes.subarray(0, 8)).equals(PNG_SIGNATURE) &&
    Buffer.from(bytes.subarray(12, 16)).toString('latin1') === 'IHDR' &&
    Buffer.from(bytes).readUInt32BE(16) === SKIN_SIZE &&
    Buffer.from(bytes).readUInt32BE(20) === SKIN_SIZE
  );
}

const instance = resolveInstance();
if (!instance) {
  console.log('prepare-trainer-portraits: sem instância (use --instance ou config.json); retratos não preparados.');
  process.exit(0);
}

const modsDirectory = path.join(instance, 'mods');
const jars = fs.existsSync(modsDirectory)
  ? fs
      .readdirSync(modsDirectory)
      .filter((name) => name.endsWith('.jar') && /rct/i.test(name))
      .sort()
  : [];
const files = new Map();
for (const jar of jars) {
  const entries = unzipSelected(path.join(modsDirectory, jar), (name) => name.startsWith(PREFIX) && name.endsWith('.png'));
  for (const [name, bytes] of Object.entries(entries)) files.set(name.slice(PREFIX.length), bytes);
}

const stage = fs.mkdtempSync(path.join(ROOT, '.prepare-trainer-portraits-'));
try {
  let valid = 0;
  let invalid = 0;
  const manifest = {default: null, trainers: {}};
  for (const [relative, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!isSkin(bytes)) {
      invalid += 1;
      continue;
    }
    const target = path.join(stage, 'public', 'trainers', ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes);
    valid += 1;
    if (relative === 'default.png') manifest.default = '/trainers/default.png';
    else if (/^single\/[^/]+\.png$/.test(relative))
      manifest.trainers[relative.slice('single/'.length, -'.png'.length)] = `/trainers/${relative}`;
  }
  fs.mkdirSync(path.join(stage, 'src', 'data'), {recursive: true});
  fs.writeFileSync(path.join(stage, 'src', 'data', 'trainer-portraits.json'), `${JSON.stringify(manifest)}\n`);
  fs.mkdirSync(path.join(stage, 'public', 'trainers'), {recursive: true});

  fs.rmSync(path.join(ROOT, 'public', 'trainers'), {recursive: true, force: true});
  fs.rmSync(path.join(ROOT, 'src', 'data', 'trainer-portraits.json'), {force: true});
  fs.mkdirSync(path.join(ROOT, 'src', 'data'), {recursive: true});
  fs.renameSync(path.join(stage, 'public', 'trainers'), path.join(ROOT, 'public', 'trainers'));
  fs.renameSync(path.join(stage, 'src', 'data', 'trainer-portraits.json'), path.join(ROOT, 'src', 'data', 'trainer-portraits.json'));
  console.log(`Retratos de treinadores preparados: ${valid} (${invalid} inválidos).`);
} finally {
  fs.rmSync(stage, {recursive: true, force: true});
}
