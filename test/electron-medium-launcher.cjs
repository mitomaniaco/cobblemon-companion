'use strict';

const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const diagnosticsRoot = path.join(appDir, '.runtime', 'diagnostics');
fs.mkdirSync(diagnosticsRoot, {recursive: true});
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const runDir = fs.mkdtempSync(path.join(diagnosticsRoot, `medium-manual-${stamp}-`));
const metadataPath = path.join(runDir, 'run-metadata.json');
const stdoutPath = path.join(runDir, 'stdout.txt');
const stderrPath = path.join(runDir, 'stderr.txt');
const profilePath = path.join(runDir, 'electron-profile');
const screenshotPath = path.join(runDir, 'move-swap-preview.png');
const electronExe = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const harnessArg = '.\\test\\electron-player-import-harness.cjs';
const timeoutMs = 30000;

const metadata = {
  startedAt: new Date().toISOString(),
  command: `"${electronExe}" "${harnessArg}"`,
  workingDirectory: appDir,
  profilePath,
  screenshotPath,
  timeoutMs,
  launcherToken: null,
  runtimeToken: null,
  pid: null,
  exitCode: null,
  timedOut: false,
  status: 'preflight',
};

function saveMetadata() {
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function whoami(args) {
  const result = spawnSync('whoami.exe', args, {encoding: 'utf8', timeout: 5000, windowsHide: true});
  if (result.error || result.status !== 0)
    throw new Error(`whoami ${args.join(' ')} falhou: ${result.error?.message || result.stderr?.trim() || result.status}`);
  return result.stdout.trim();
}

async function main() {
  console.log(`DIAGNOSTICS ${runDir}`);
  try {
    const user = whoami([]);
    const integritySid = whoami(['/groups']).match(/\bS-1-16-\d+\b/)?.[0] || null;
    metadata.launcherToken = {user, integritySid};
    if (integritySid !== 'S-1-16-8192') {
      metadata.status = 'blocked-not-medium';
      console.error(
        `Teste bloqueado: Explorer/launcher iniciou com ${integritySid || 'integridade desconhecida'}; requer Medium (S-1-16-8192). Nenhum Electron foi aberto.`,
      );
      saveMetadata();
      process.exitCode = 2;
      return;
    }
    const electronVersion = require(path.join(appDir, 'node_modules', 'electron', 'package.json')).version;
    if (electronVersion !== '44.4.3' || !fs.existsSync(electronExe))
      throw new Error(`Electron 44.4.3 indisponível (encontrado ${electronVersion}).`);
    metadata.electronVersion = electronVersion;

    const stdoutFd = fs.openSync(stdoutPath, 'w');
    const stderrFd = fs.openSync(stderrPath, 'w');
    let child;
    try {
      child = spawn(electronExe, [harnessArg], {
        cwd: appDir,
        env: {
          ...process.env,
          COMPANION_RUNTIME_PROFILE: profilePath,
          COMPANION_RUNTIME_SCREENSHOT: screenshotPath,
          COMPANION_REQUIRE_MEDIUM: '1',
        },
        stdio: ['ignore', stdoutFd, stderrFd],
        windowsHide: false,
      });
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }
    metadata.pid = child.pid || null;
    metadata.status = 'running';
    saveMetadata();

    let cleanup = null;
    const outcome = await new Promise((resolve) => {
      let spawnError = null;
      const timer = setTimeout(() => {
        metadata.timedOut = true;
        if (child.pid) {
          const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
          });
          cleanup = {targetPid: child.pid, exitCode: killed.status, output: (killed.stdout || killed.stderr || '').trim()};
        }
      }, timeoutMs);
      child.on('error', (error) => {
        spawnError = error.message;
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({code, signal, spawnError});
      });
    });

    const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : '';
    const marker = stdout.match(/^RUNTIME_TOKEN (.+)$/m);
    if (marker) {
      try {
        metadata.runtimeToken = JSON.parse(marker[1]);
      } catch {
        /* kept as unconfirmed */
      }
    }
    metadata.exitCode = outcome.code;
    metadata.signal = outcome.signal;
    metadata.spawnError = outcome.spawnError;
    metadata.cleanup = cleanup;
    metadata.finishedAt = new Date().toISOString();
    const screenshotStat = fs.existsSync(screenshotPath) ? fs.statSync(screenshotPath) : null;
    const screenshotBytes = screenshotStat?.isFile() && screenshotStat.size > 8 ? fs.readFileSync(screenshotPath) : null;
    const pngSignature = screenshotBytes?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || false;
    metadata.screenshotCreated = Boolean(pngSignature);
    metadata.swapAssertionsPassed = stdout.includes('PASS candidato do mesmo UUID, slot, preview antes/depois e golpes restantes');
    metadata.screenshotMarkerSeen = stdout.includes('SCREENSHOT_READY move-swap-preview');
    const tokenConfirmed =
      metadata.runtimeToken?.pid === child.pid &&
      metadata.runtimeToken.integritySid === 'S-1-16-8192' &&
      typeof metadata.runtimeToken.user === 'string' &&
      metadata.runtimeToken.user.toLowerCase() === metadata.launcherToken.user.toLowerCase();
    metadata.status =
      tokenConfirmed &&
      outcome.code === 0 &&
      !metadata.timedOut &&
      metadata.swapAssertionsPassed &&
      metadata.screenshotMarkerSeen &&
      metadata.screenshotCreated
        ? 'passed'
        : 'failed-or-incomplete';
    saveMetadata();
    console.log(
      `PID ${metadata.pid} TOKEN ${metadata.runtimeToken?.integritySid || 'não confirmado'} EXIT ${outcome.code} TIMEOUT ${metadata.timedOut}`,
    );
    console.log(`RESULT ${metadata.status}; logs: ${stdoutPath}, ${stderrPath}`);
    process.exitCode = metadata.status === 'passed' ? 0 : 1;
  } catch (error) {
    metadata.status = 'blocked-launcher-error';
    metadata.error = error.message;
    metadata.finishedAt = new Date().toISOString();
    saveMetadata();
    console.error(`Teste não iniciado: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
