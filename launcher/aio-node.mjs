/**
 * MCAI unified All-In-One launcher (Node only — no PowerShell).
 * Entry: MCAI.cmd | MCAI.vbs | node launcher/aio-node.mjs [--start|--stop|--status]
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { createInstallConfig, explainConfigErrors, isPlaceholderToken, validateConfig } from '../bot/configSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Root = path.resolve(__dirname, '..');
const ConfigPath = path.join(Root, 'config.json');
const BotDir = path.join(Root, 'bot');
const BotEntry = path.join(BotDir, 'bot.js');
const RuntimeDir = path.join(Root, '.runtime');
const LogPath = path.join(RuntimeDir, 'aio-node.log');
const SetupStatePath = path.join(RuntimeDir, 'setup-state.json');
const ManagedChildEntry = path.join(__dirname, 'managed-child.mjs');
const ServerStatePath = path.join(RuntimeDir, 'managed-server.json');

fs.mkdirSync(RuntimeDir, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  fs.appendFileSync(LogPath, `${line}\n`, 'utf8');
}

function readJsonFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip UTF-8 BOM
  return JSON.parse(text);
}

function loadConfig() {
  return readJsonFile(ConfigPath);
}

export function initializeConfigIfMissing(filePath = ConfigPath, overrides = {}) {
  if (fs.existsSync(filePath)) return false;
  const config = createInstallConfig(overrides);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
}

export function upgradeLegacyConfigSecrets(filePath = ConfigPath) {
  if (!fs.existsSync(filePath)) return [];
  const config = readJsonFile(filePath);
  const updated = [];
  if (isPlaceholderToken(config.dashboardToken)) {
    config.dashboardToken = crypto.randomBytes(24).toString('base64url');
    updated.push('dashboardToken');
  }
  if (isPlaceholderToken(config.serverPluginToken)) {
    config.serverPluginToken = crypto.randomBytes(24).toString('base64url');
    updated.push('serverPluginToken');
  }
  if (config.allowLanServerBinding === undefined) {
    config.allowLanServerBinding = false;
    updated.push('allowLanServerBinding');
  }
  if (config.firstRunComplete === undefined && /^[A-Za-z0-9_]{1,16}$/.test(String(config.ownerUsername || '')) && config.ownerUsername !== 'Player') {
    config.firstRunComplete = true;
    updated.push('firstRunComplete');
  }
  if (!updated.length) return updated;
  const tmp = `${filePath}.tmp-aio-node`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return updated;
}

function needsFirstRunSetup(config = {}) {
  return config.firstRunComplete === false || !config.ownerUsername || config.ownerUsername === 'Player';
}

async function completeFirstRunSetup(rl) {
  let config = loadConfig();
  if (!needsFirstRunSetup(config)) return true;
  console.log('\n--- MCAI first-run setup ---\n');
  console.log('MCAI created a local config with random dashboard and bridge tokens.');
  let ownerUsername = '';
  while (!/^[A-Za-z0-9_]{1,16}$/.test(ownerUsername)) {
    ownerUsername = (await ask(rl, 'Your Minecraft username: ')).trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(ownerUsername)) console.log('Use a 1-16 character Minecraft name (letters, numbers, underscore).');
  }
  const requestedBot = (await ask(rl, 'Bot username [tj]: ')).trim() || 'tj';
  const botUsername = /^[A-Za-z0-9_]{1,16}$/.test(requestedBot) && requestedBot !== ownerUsername
    ? requestedBot
    : 'tj';
  saveConfigPatch({
    ownerUsername,
    botUsername,
    friendlyPlayers: [ownerUsername],
    firstRunComplete: true
  });
  config = loadConfig();
  const validation = validateConfig(config);
  if (!validation.ok) {
    console.log(explainConfigErrors(validation));
    return false;
  }
  console.log(`Configured owner ${ownerUsername} and bot ${botUsername}.`);
  return true;
}

function saveConfigPatch(patch) {
  const cfg = loadConfig();
  Object.assign(cfg, patch);
  if (patch.models) {
    cfg.models = { ...(cfg.models || {}), ...patch.models };
  }
  const tmp = `${ConfigPath}.tmp-aio-node`;
  // Write without BOM so Node and other tools always parse cleanly.
  fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { encoding: 'utf8' });
  fs.renameSync(tmp, ConfigPath);
}

function tcpOpen(host, port, ms = 400) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const t = setTimeout(() => {
      s.destroy();
      resolve(false);
    }, ms);
    s.on('connect', () => {
      clearTimeout(t);
      s.end();
      resolve(true);
    });
    s.on('error', () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

function httpOk(url, ms = 1500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + u.search,
          timeout: ms
        },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function findPaperJar(version) {
  const files = fs.readdirSync(Root).filter((f) => f.toLowerCase().startsWith(`paper-${version}`) && f.endsWith('.jar'));
  files.sort();
  return files.length ? path.join(Root, files[files.length - 1]) : null;
}

function findJava() {
  const local = path.join(Root, '.runtime', 'java', 'bin', 'java.exe');
  if (fs.existsSync(local)) return local;
  try {
    execFileSync('where', ['java'], { stdio: 'pipe' });
    return 'java';
  } catch {
    return null;
  }
}

function findOllama() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'),
    'ollama'
  ];
  for (const c of candidates) {
    if (c === 'ollama') {
      try {
        execFileSync('where', ['ollama'], { stdio: 'pipe' });
        return 'ollama';
      } catch {
        continue;
      }
    }
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function spawnDetached(command, args, cwd, title, options = {}) {
  // Windows START quirk: the first quoted arg is ALWAYS the window title.
  //   start "something"   -> looks for something.exe  (BAD if title-only intent fails)
  // Correct pattern:
  //   start "" "C:\path\run.bat"
  // Write a tiny .bat so paths/args never get re-parsed by START.
  const safeTitle = String(title || 'MCAI')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'MCAI';

  const argParts = (args || []).map((a) => {
    const s = String(a);
    if (!s.length) return '""';
    // Always quote args that need it
    if (/[\s"&<>|^()]/.test(s) || s.includes('\\')) {
      return `"${s.replace(/"/g, '')}"`;
    }
    return s;
  });

  const cmdPath = String(command).replace(/"/g, '');
  const workDir = String(cwd).replace(/"/g, '');
  const batPath = path.join(RuntimeDir, `run-${safeTitle}.cmd`);

  const bat = [
    '@echo off',
    `title ${safeTitle}`,
    `cd /d "${workDir}"`,
    `echo [${safeTitle}] starting...`,
    `echo Working dir: ${workDir}`,
    `"${cmdPath}" ${argParts.join(' ')}`,
    'set EC=%ERRORLEVEL%',
    'echo.',
    'echo Process exited with code %EC%.',
    ...(options.pauseOnExit === false
      ? ['exit /b %EC%']
      : ['echo Press any key to close this window.', 'pause >nul'])
  ].join('\r\n');

  fs.writeFileSync(batPath, bat, 'utf8');

  // Empty title "" is required so START does not treat the bat path as the title.
  const child = spawn(
    process.env.ComSpec || 'cmd.exe',
    ['/d', '/c', 'start', '', batPath],
    {
      cwd: Root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }
  );
  child.unref();
  log(`spawned: ${safeTitle} via ${batPath} -> ${command} ${(args || []).join(' ')}`);
}

export function eulaIsAccepted(filePath = path.join(Root, 'eula.txt')) {
  if (!fs.existsSync(filePath)) return false;
  return /^\s*eula\s*=\s*true\s*$/im.test(fs.readFileSync(filePath, 'utf8'));
}

async function ensureEula({ rl = null, acceptEula = false } = {}) {
  const eula = path.join(Root, 'eula.txt');
  if (eulaIsAccepted(eula)) return true;
  console.log('Minecraft server use requires accepting the Minecraft EULA: https://aka.ms/MinecraftEULA');
  let accepted = acceptEula === true;
  if (!accepted && rl) {
    const answer = (await ask(rl, 'Do you accept the Minecraft EULA? [y/N]: ')).trim().toLowerCase();
    accepted = answer === 'y' || answer === 'yes';
  }
  if (!accepted) {
    console.log('EULA not accepted. Paper was not started. Re-run interactively or pass --accept-eula after reviewing it.');
    return false;
  }
  fs.writeFileSync(eula, '# https://aka.ms/MinecraftEULA\r\neula=true\r\n', 'utf8');
  console.log('Minecraft EULA acceptance saved locally.');
  return true;
}

async function ensureServerProperties(cfg) {
  const p = path.join(Root, 'server.properties');
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const set = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `\n${key}=${value}`;
  };
  set('server-ip', cfg.host || '127.0.0.1');
  set('server-port', String(cfg.port || 25565));
  set('online-mode', 'false');
  set('level-name', `world-${cfg.minecraftVersion || '1.21.11'}`);
  set('motd', 'Local MCAI Server');
  fs.writeFileSync(p, `${text.trim()}\n`, 'utf8');
}

function yamlScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value ?? ''));
}

function setYamlSectionValue(text, section, key, value) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let sectionStart = lines.findIndex((line) => line.trim() === `${section}:` && !/^\s/.test(line));
  if (sectionStart < 0) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    sectionStart = lines.length;
    lines.push(`${section}:`);
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^[^\s#][^:]*:\s*/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^\\s{2}${escapedKey}:`);
  const keyIndex = lines.findIndex((line, index) => index > sectionStart && index < sectionEnd && keyPattern.test(line));
  const nextLine = `  ${key}: ${yamlScalar(value)}`;
  if (keyIndex >= 0) lines[keyIndex] = nextLine;
  else lines.splice(sectionEnd, 0, nextLine);
  return lines.join('\n');
}

export function syncBridgePluginConfig(cfg, targetRoot = Root) {
  const pluginsDir = path.join(targetRoot, 'plugins');
  const pluginConfigPath = path.join(pluginsDir, 'MCAIBridge', 'config.yml');
  const pluginJarInstalled = fs.existsSync(pluginsDir) && fs.readdirSync(pluginsDir)
    .some((name) => /^mcaibridge(?:-.*)?\.jar$/i.test(name));
  if (!pluginJarInstalled && !fs.existsSync(pluginConfigPath)) return { managed: false, changed: false };

  const templatePath = path.join(targetRoot, 'server-plugin', 'src', 'main', 'resources', 'config.yml');
  let text = fs.existsSync(pluginConfigPath)
    ? fs.readFileSync(pluginConfigPath, 'utf8')
    : (fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : 'bridge:\n\nfeatures:\n');

  const bridgeValues = {
    enabled: cfg.serverPluginBridgeEnabled !== false,
    host: cfg.serverPluginHost || '127.0.0.1',
    port: Number(cfg.serverPluginPort || 8791),
    'require-token': cfg.serverPluginRequireToken !== false,
    token: cfg.serverPluginToken || '',
    'allow-public-bind': cfg.serverPluginLocalOnly === false,
    'allow-control': cfg.serverPluginAllowControl !== false,
    'allow-dangerous-control': false,
    'event-buffer-size': Number(cfg.serverPluginEventBufferSize || 500)
  };
  const featureValues = {
    events: cfg.serverPluginExposeEvents !== false,
    regions: cfg.serverPluginExposeRegionRegistry !== false,
    advancements: cfg.serverPluginExposeAdvancements !== false,
    'death-events': cfg.serverPluginExposeDeathEvents !== false,
    'emergency-stop': cfg.serverPluginAllowControl !== false && cfg.serverPluginAllowEmergencyStop !== false,
    'arbitrary-commands': false,
    teleport: false,
    'give-items': false
  };
  for (const [key, value] of Object.entries(bridgeValues)) text = setYamlSectionValue(text, 'bridge', key, value);
  for (const [key, value] of Object.entries(featureValues)) text = setYamlSectionValue(text, 'features', key, value);
  text = `${text.trim()}\n`;

  const previous = fs.existsSync(pluginConfigPath) ? fs.readFileSync(pluginConfigPath, 'utf8').replace(/\r\n/g, '\n') : null;
  if (previous === text) return { managed: true, changed: false, path: pluginConfigPath };
  fs.mkdirSync(path.dirname(pluginConfigPath), { recursive: true });
  const tmpPath = `${pluginConfigPath}.tmp-aio-node`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, pluginConfigPath);
  return { managed: true, changed: true, path: pluginConfigPath };
}

function isBotProcessRunning() {
  return listWindowsProcesses().some((processInfo) => processMatchesRole(processInfo, 'bot'));
}

async function statusLines(cfg) {
  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  const dashHost = cfg.dashboardHost || '127.0.0.1';
  const dashPort = Number(cfg.dashboardPort || 8787);
  let llmPort = 11434;
  try {
    llmPort = Number(new URL(cfg.ollamaUrl || 'http://127.0.0.1:11434').port) || 11434;
  } catch {
    /* keep default */
  }
  const provider = cfg.llmProvider || 'ollama';
  const llmUrl =
    provider === 'ollama'
      ? `${(cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/tags`
      : `${(cfg.ollamaUrl || 'http://127.0.0.1:1234').replace(/\/$/, '')}/v1/models`;

  const [server, dash, llmTcp, llmHttp] = await Promise.all([
    tcpOpen(host, port),
    tcpOpen(dashHost, dashPort),
    tcpOpen('127.0.0.1', llmPort),
    httpOk(llmUrl)
  ]);

  return {
    server,
    bot: isBotProcessRunning(),
    dash,
    llm: llmTcp || llmHttp,
    model: cfg.models?.default || cfg.ollamaModel || '(unset)',
    provider,
    host,
    port,
    dashHost,
    dashPort,
    ollamaUrl: cfg.ollamaUrl
  };
}

function printMenu(st, cfg) {
  const botName = cfg.botUsername || 'tj';
  console.clear();
  console.log('========================================');
  console.log('          MCAI  All-In-One');
  console.log(`   Paper + ${botName} bot + local LLM setup`);
  console.log('========================================');
  console.log('');
  console.log(` Owner: ${cfg.ownerUsername || 'Player'}   Bot: ${botName}`);
  console.log(` Mode:  ${cfg.interactionMode || cfg.playMode || 'companion'} (companion = living Player 2)`);
  console.log(` MC:    ${cfg.minecraftVersion || '?'}   Join: ${st.host}:${st.port}`);
  console.log(` LLM:   ${st.provider}   Model: ${st.model}   Mode: ${cfg.llmMode || 'dialogue'}`);
  console.log(` URL:   ${st.ollamaUrl || 'http://127.0.0.1:11434'}`);
  console.log('');
  console.log(` [${st.server ? 'ON' : '--'}] Paper server   [${st.bot ? 'ON' : '--'}] Bot (${botName})`);
  console.log(` [${st.dash ? 'ON' : '--'}] Dashboard       [${st.llm ? 'ON' : '--'}] LLM`);
  if (st.dash) console.log(`      Dashboard: http://${st.dashHost}:${st.dashPort}`);
  console.log('');
  console.log('  --- Start ---');
  console.log('  1) Setup LLM (provider + model)');
  console.log('  2) Start Paper server only');
  console.log(`  3) Start bot only (${botName})`);
  console.log('  4) Start All (Paper + bot)');
  console.log('  5) Start server + browser  (Paper + dashboard)');
  console.log('  --- Browser ---');
  console.log('  6) Open Setup page');
  console.log('  7) Open Dashboard');
  console.log('  --- Stop ---');
  console.log('  8) Stop bot only');
  console.log('  9) Stop Paper server only');
  console.log('  S) Stop All (bot + Paper + dashboard)');
  console.log('  R) Refresh status');
  console.log('  0) Exit');
  console.log('');
  console.log(' Tip: MCAI.cmd --start-server | --start-bot | --start | --stop-bot | --stop');
  console.log('');
}

function runQuiet(cmd, args = []) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function listWindowsProcesses() {
  // Prefer PowerShell (wmic is removed on newer Windows).
  try {
    const ps = [
      'Get-CimInstance Win32_Process |',
      'Select-Object ProcessId,Name,CommandLine |',
      'ConvertTo-Json -Compress'
    ].join(' ');
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 30 * 1024 * 1024
      }
    );
    const parsed = JSON.parse(out || '[]');
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row) => ({
        pid: Number(row.ProcessId),
        name: String(row.Name || ''),
        commandLine: String(row.CommandLine || '')
      }))
      .filter((p) => Number.isFinite(p.pid) && p.pid > 0);
  } catch {
    // fall through
  }

  try {
    const out = execSync('wmic process get ProcessId,Name,CommandLine /FORMAT:CSV', {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('Node,'))
      .map((line) => {
        const parts = line.split(',');
        if (parts.length < 3) return null;
        const pid = parts[parts.length - 1];
        const name = parts[parts.length - 2];
        const commandLine = parts.slice(1, -2).join(',');
        return { pid: Number(pid), name, commandLine };
      })
      .filter((p) => p && Number.isFinite(p.pid));
  } catch {
    return [];
  }
}

function normalizedPathText(value) {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

export function processMatchesRole(processInfo, role, root = Root) {
  const name = String(processInfo?.name || '').toLowerCase();
  const commandLine = normalizedPathText(processInfo?.commandLine);
  const rootNeedle = normalizedPathText(path.resolve(root));
  if (role === 'bot') {
    const botNeedle = normalizedPathText(path.join(root, 'bot', 'bot.js'));
    return name === 'node.exe' && commandLine.includes(botNeedle);
  }
  if (role === 'dashboard') {
    const dashboardNeedle = normalizedPathText(path.join(root, 'dashboard', 'server.js'));
    return name === 'node.exe' && commandLine.includes(dashboardNeedle);
  }
  if (role === 'server') {
    return (name === 'java.exe' || name === 'javaw.exe')
      && commandLine.includes('paper-')
      && commandLine.includes('.jar')
      && commandLine.includes(rootNeedle);
  }
  return false;
}

function processIsRunning(pid) {
  return listWindowsProcesses().some((processInfo) => processInfo.pid === Number(pid));
}

function readManagedServerState() {
  try {
    const state = readJsonFile(ServerStatePath);
    if (state.role !== 'server') return null;
    if (normalizedPathText(path.resolve(String(state.root || ''))) !== normalizedPathText(Root)) return null;
    if (!Number.isInteger(Number(state.childPid)) || !Number.isInteger(Number(state.controlPort))) return null;
    if (!state.nonce || state.controlHost !== '127.0.0.1') return null;
    return state;
  } catch {
    return null;
  }
}

function sendManagedControl(state, action = 'stop', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ action });
    const request = http.request({
      hostname: state.controlHost,
      port: state.controlPort,
      path: '/control',
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-mcai-nonce': state.nonce
      }
    }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.end(body);
  });
}

async function waitForProcessExit(pid, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return !processIsRunning(pid);
}

async function confirmForceKill(rl, message) {
  if (!rl) return false;
  const answer = (await ask(rl, `${message} [y/N]: `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

async function stopBotOnly({ force = true } = {}) {
  console.log('Stopping bot only (Paper server left running)...');
  let killed = 0;
  for (const proc of listWindowsProcesses()) {
    if (!processMatchesRole(proc, 'bot')) continue;
    runQuiet('taskkill', ['/T', '/PID', String(proc.pid)]);
    await waitForProcessExit(proc.pid, 3000);
    if (processIsRunning(proc.pid) && force) runQuiet('taskkill', ['/F', '/T', '/PID', String(proc.pid)]);
    if (!processIsRunning(proc.pid)) {
      console.log(`  stopped bot PID ${proc.pid}`);
      killed += 1;
    }
  }
  if (!killed) console.log('  bot was not running (or window title differs).');
  else console.log('Bot stopped. Paper server should still be up.');
  log(`stopBotOnly finished (actions=${killed})`);
  return killed;
}

async function stopServerOnly({ force = false, rl = null } = {}) {
  const managed = readManagedServerState();
  if (managed && processIsRunning(managed.childPid)) {
    console.log(`Sending Minecraft "stop" to managed Paper PID ${managed.childPid}...`);
    const requested = await sendManagedControl(managed, 'stop');
    if (requested && await waitForProcessExit(managed.childPid, 30000)) {
      console.log('Paper saved the world and stopped cleanly.');
      log('stopServerOnly finished (graceful managed stop)');
      return 1;
    }
    console.log('Paper did not exit after the graceful stop request.');
    const allowForce = force || await confirmForceKill(rl, 'Force-kill this exact managed MCAI server process?');
    if (!allowForce) {
      console.log('Server left running. Re-run with --force only if graceful shutdown remains stuck.');
      return 0;
    }
    runQuiet('taskkill', ['/F', '/T', '/PID', String(managed.childPid)]);
    if (managed.supervisorPid) runQuiet('taskkill', ['/F', '/T', '/PID', String(managed.supervisorPid)]);
    console.log('Paper was force-stopped after graceful shutdown failed. Check the world before restarting.');
    log('stopServerOnly finished (forced managed fallback)');
    return 1;
  }
  console.log('Stopping Paper server only (bot left alone — it will disconnect)...');
  const legacy = listWindowsProcesses().filter((processInfo) => processMatchesRole(processInfo, 'server'));
  if (!legacy.length) {
    console.log('  Paper was not running for this MCAI folder.');
    return 0;
  }
  console.log('  This server predates managed graceful shutdown, so its console cannot receive "stop" automatically.');
  const allowLegacyForce = force || await confirmForceKill(rl, 'Force-kill the exact legacy MCAI Paper process?');
  if (!allowLegacyForce) {
    console.log('  Server left running. Type "stop" in its Paper console for a safe shutdown.');
    return 0;
  }
  let killed = 0;
  for (const processInfo of legacy) {
    if (runQuiet('taskkill', ['/F', '/T', '/PID', String(processInfo.pid)])) killed += 1;
  }
  console.log(`Force-stopped ${killed} exact MCAI Paper process(es).`);
  log(`stopServerOnly finished (forced legacy actions=${killed})`);
  return killed;
}

async function stopDashboardOnly({ force = true } = {}) {
  let killed = 0;
  for (const proc of listWindowsProcesses()) {
    if (!processMatchesRole(proc, 'dashboard')) continue;
    runQuiet('taskkill', ['/T', '/PID', String(proc.pid)]);
    await waitForProcessExit(proc.pid, 3000);
    if (processIsRunning(proc.pid) && force) runQuiet('taskkill', ['/F', '/T', '/PID', String(proc.pid)]);
    if (!processIsRunning(proc.pid)) {
      console.log(`  stopped dashboard PID ${proc.pid}`);
      killed += 1;
    }
  }
  return killed;
}

async function stopAll(options = {}) {
  console.log('Stopping MCAI processes (bot + Paper + dashboard)...');
  let killed = 0;
  killed += await stopBotOnly(options) || 0;
  killed += await stopServerOnly(options) || 0;
  killed += await stopDashboardOnly(options) || 0;
  if (!killed) {
    console.log('  nothing matched (already stopped, or titles/paths differ).');
    console.log('  Manual: close MCAI-Bot / MCAI-Server / MCAI-Dashboard windows.');
  } else {
    console.log('Stop All complete.');
  }
  log(`stopAll finished (actions=${killed})`);
}

function openBrowser(url) {
  const safe = String(url || '').replace(/"/g, '');
  spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '', safe], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
  log(`opened browser: ${safe}`);
}

function paperHeapPlan() {
  const freeGb = os.freemem() / 1024 ** 3;
  const totalGb = os.totalmem() / 1024 ** 3;
  let maxHeapGb = Number(process.env.MCAI_MEMORY_GB || (totalGb <= 16 ? 2 : 3));
  if (!Number.isFinite(maxHeapGb) || maxHeapGb < 1) maxHeapGb = 2;
  maxHeapGb = Math.min(4, Math.max(1, Math.floor(maxHeapGb)));
  if (freeGb < maxHeapGb + 1.5) {
    const safer = Math.max(1, Math.floor(freeGb - 1.25));
    if (safer < maxHeapGb) maxHeapGb = safer;
  }
  return { freeGb, totalGb, maxHeapGb };
}

function validateLaunchConfig(config) {
  const result = validateConfig(config);
  if (!result.ok) {
    console.log('ERROR: MCAI configuration is not safe to launch:');
    console.log(explainConfigErrors(result));
    return false;
  }
  return true;
}

/** Start Paper only. Returns true if listening (or already was). */
async function startPaperServer(cfg, { waitForReady = true, rl = null, acceptEula = false } = {}) {
  if (!validateLaunchConfig(cfg)) return false;
  const version = cfg.minecraftVersion || '1.21.11';
  const java = findJava();
  if (!java) {
    console.log('ERROR: Java not found. Install a JDK, or run scripts\\Install-Java.ps1 once.');
    return false;
  }
  const jar = findPaperJar(version);
  if (!jar) {
    console.log(`ERROR: No paper-${version}-*.jar in ${Root}`);
    return false;
  }

  if (!(await ensureEula({ rl, acceptEula }))) return false;
  await ensureServerProperties(cfg);
  const bridgeConfig = syncBridgePluginConfig(cfg);
  if (bridgeConfig.changed) console.log('Synchronized the installed MCAIBridge plugin with the local MCAI security settings.');

  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  if (await tcpOpen(host, port, 500)) {
    console.log(`Paper already listening on ${host}:${port}`);
    return true;
  }

  const { freeGb, totalGb, maxHeapGb } = paperHeapPlan();
  if (freeGb < 1.2) {
    console.log(`ERROR: Almost no free memory (~${freeGb.toFixed(1)} GB). Close apps or set MCAI_MEMORY_GB=1.`);
    return false;
  }
  if (freeGb < maxHeapGb + 1.5) {
    console.log(`Low free RAM (~${freeGb.toFixed(1)} GB of ${totalGb.toFixed(1)} GB). Using Paper -Xmx${maxHeapGb}G.`);
  }

  const javaArgs = ['-Xms512M', `-Xmx${maxHeapGb}G`, '-jar', path.basename(jar), '--nogui'];
  console.log(`Starting Paper server window (heap max ${maxHeapGb}G)...`);
  try { if (fs.existsSync(ServerStatePath)) fs.unlinkSync(ServerStatePath); } catch { /* stale state is harmless */ }
  const nonce = crypto.randomBytes(24).toString('base64url');
  spawnDetached(process.execPath, [
    ManagedChildEntry,
    '--role', 'server',
    '--state', ServerStatePath,
    '--cwd', Root,
    '--nonce', nonce,
    '--', java,
    ...javaArgs
  ], Root, 'MCAI-Server', { pauseOnExit: false });

  if (!waitForReady) return true;

  console.log(`Waiting for Minecraft server on ${host}:${port} (first boot can take 1-2 minutes)...`);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await tcpOpen(host, port, 800)) {
      console.log('Server is up.');
      return true;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('');
  console.log(`ERROR: Server did not open ${host}:${port} in time. Check the MCAI-Server window.`);
  return false;
}

/** Start standalone dashboard if not already listening. Returns base URL or null. */
async function ensureDashboard(cfg, { open = false, page = '/' } = {}) {
  const dashHost = cfg.dashboardHost || '127.0.0.1';
  const dashPort = Number(cfg.dashboardPort || 8787);
  const baseUrl = `http://${dashHost}:${dashPort}`;
  const targetUrl = page.startsWith('http') ? page : `${baseUrl}${page.startsWith('/') ? page : `/${page}`}`;

  if (await tcpOpen(dashHost, dashPort, 400)) {
    console.log(`Dashboard already on ${baseUrl}`);
    if (open) openBrowser(targetUrl);
    return baseUrl;
  }

  if (cfg.dashboardEnabled === false) {
    console.log('Dashboard is disabled in config (dashboardEnabled=false).');
    return null;
  }

  const dashEntry = path.join(Root, 'dashboard', 'server.js');
  if (!fs.existsSync(dashEntry)) {
    console.log(`ERROR: Dashboard entry missing: ${dashEntry}`);
    return null;
  }

  console.log(`Starting dashboard window on ${baseUrl}...`);
  spawnDetached(process.execPath, [dashEntry], path.join(Root, 'dashboard'), 'MCAI-Dashboard', { pauseOnExit: false });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await tcpOpen(dashHost, dashPort, 400)) {
      console.log(`Dashboard is up at ${baseUrl}`);
      if (open) openBrowser(targetUrl);
      return baseUrl;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('WARNING: Dashboard did not open in time. Try option 5 again, or Start All (bot hosts dashboard too).');
  if (open) openBrowser(targetUrl);
  return null;
}

/** Paper + dashboard + open browser (no bot). Good for setup / web UI first. */
async function startServerAndBrowser(cfg, { page = '/', rl = null, acceptEula = false } = {}) {
  console.log('\n--- Start server + browser ---\n');
  const paperOk = await startPaperServer(cfg, { waitForReady: true, rl, acceptEula });
  if (!paperOk) {
    console.log('Paper did not start; still trying dashboard so you can use Setup in the browser.');
  }
  const dashUrl = await ensureDashboard(cfg, { open: true, page });
  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  console.log('');
  console.log(paperOk ? `  Minecraft: ${host}:${port}` : '  Minecraft: not ready');
  console.log(dashUrl ? `  Browser:   ${dashUrl}${page === '/' ? '' : page}` : '  Browser:   dashboard not ready');
  console.log(`  (Bot not started — use Start All when you want ${cfg.botUsername || 'tj'} in-game.)`);
  return { paperOk, dashUrl };
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function fetchJson(url, ms = 4000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + u.search,
          timeout: ms
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
            } catch {
              resolve({ ok: false, json: null });
            }
          });
        }
      );
      req.on('error', () => resolve({ ok: false, json: null }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, json: null });
      });
    } catch {
      resolve({ ok: false, json: null });
    }
  });
}

async function listRemoteModels(provider, baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  if (provider === 'ollama') {
    const r = await fetchJson(`${base}/api/tags`, 5000);
    if (!r.ok) return { reachable: false, models: [] };
    const models = (r.json?.models || []).map((m) => m.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return { reachable: true, models };
  }
  let r = await fetchJson(`${base}/v1/models`, 5000);
  if (!r.ok) r = await fetchJson(`${base}/models`, 5000);
  if (!r.ok) return { reachable: false, models: [] };
  const models = (r.json?.data || []).map((m) => m.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return { reachable: true, models };
}

/** Print numbered list; user picks 1..N or Enter for defaultIndex (1-based). Returns chosen string or null. */
async function pickFromList(rl, title, items, { allowCustom = true, defaultIndex = 1, current = '' } = {}) {
  console.log(`\n${title}`);
  if (!items.length) {
    console.log('  (none found)');
    if (!allowCustom) return null;
    const typed = (await ask(rl, current ? `Type a value [${current}]: ` : 'Type a value: ')).trim();
    return typed || current || null;
  }

  items.forEach((name, i) => {
    const mark = name === current ? '  <-- current' : '';
    console.log(`  ${i + 1}) ${name}${mark}`);
  });
  if (allowCustom) {
    console.log(`  ${items.length + 1}) Type a custom name...`);
  }

  const def = Math.min(Math.max(1, defaultIndex), items.length);
  const raw = (await ask(rl, `Pick number [1-${items.length}${allowCustom ? ` or ${items.length + 1}` : ''}, Enter=${def}]: `)).trim();

  if (!raw) return items[def - 1];

  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1 && n <= items.length) {
    return items[n - 1];
  }
  if (allowCustom && n === items.length + 1) {
    const typed = (await ask(rl, current ? `Custom name [${current}]: ` : 'Custom name: ')).trim();
    return typed || current || null;
  }
  // typed a name directly
  if (!Number.isFinite(n) && raw) return raw;
  console.log('Invalid pick; using default.');
  return items[def - 1];
}

async function setupLlm(rl, cfg) {
  console.log('\n--- Setup LLM ---\n');

  const providers = [
    { id: 'ollama', label: 'Ollama (local)', url: 'http://127.0.0.1:11434' },
    { id: 'lmstudio', label: 'LM Studio (local server)', url: 'http://127.0.0.1:1234' },
    { id: 'openai_compatible', label: 'Other OpenAI-compatible server', url: 'http://127.0.0.1:8000' }
  ];

  // Pre-select current provider in list
  const currentProvider = cfg.llmProvider || 'ollama';
  let defProv = providers.findIndex((p) => p.id === currentProvider) + 1;
  if (defProv < 1) defProv = 1;

  const providerLabels = providers.map((p) => p.label);
  const pickedLabel = await pickFromList(rl, 'Which program serves your models?', providerLabels, {
    allowCustom: false,
    defaultIndex: defProv,
    current: providers[defProv - 1]?.label
  });
  const providerEntry = providers.find((p) => p.label === pickedLabel) || providers[0];
  const provider = providerEntry.id;
  let defaultUrl = providerEntry.url;
  if (cfg.ollamaUrl && (cfg.llmProvider || 'ollama') === provider) {
    defaultUrl = cfg.ollamaUrl;
  }

  console.log(`\nBase URL for ${providerEntry.label}`);
  console.log(`  1) Use default: ${defaultUrl}`);
  console.log('  2) Type a different URL');
  const urlPick = (await ask(rl, 'Pick [1/2, Enter=1]: ')).trim() || '1';
  let baseUrl = defaultUrl;
  if (urlPick === '2') {
    const urlIn = (await ask(rl, `URL [${defaultUrl}]: `)).trim();
    baseUrl = urlIn || defaultUrl;
  }

  console.log('\nContacting LLM and listing models...');
  let listed = await listRemoteModels(provider, baseUrl);
  if (!listed.reachable) {
    console.log('Could not reach LLM at', baseUrl);
    if (provider === 'ollama') {
      console.log('\nTips:');
      console.log('  - Start Ollama from the Start menu (tray icon)');
      console.log(`  - Or run: "${path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')}" serve`);
      console.log('  - Pull Andy-4.2 example:');
      console.log('      ollama pull hf.co/Mindcraft-CE/Andy-4.2-GGUF:Q4_K_M');
      console.log('  - Then come back and choose Setup LLM again');
    } else {
      console.log('\nTips: start the local server in LM Studio (or your app), then retry Setup LLM.');
    }
    const retry = (await ask(rl, 'Press Enter to retry listing, or type s to save URL only and skip model: ')).trim().toLowerCase();
    if (retry !== 's') {
      listed = await listRemoteModels(provider, baseUrl);
    }
  }

  let model = cfg.models?.default || cfg.ollamaModel || '';
  if (listed.reachable && listed.models.length) {
    // Prefer current model as default pick if present
    let defIdx = 1;
    const cur = cfg.models?.default || cfg.ollamaModel || '';
    const found = listed.models.indexOf(cur);
    if (found >= 0) defIdx = found + 1;

    const chosen = await pickFromList(rl, 'Models found (pick a number):', listed.models, {
      allowCustom: true,
      defaultIndex: defIdx,
      current: cur
    });
    model = chosen || cur || listed.models[0];
  } else {
    console.log('\nNo model list available. You can still type a model name.');
    model =
      (await ask(rl, `Model name [${cfg.models?.default || cfg.ollamaModel || 'qwen2.5:7b'}]: `)).trim() ||
      cfg.models?.default ||
      cfg.ollamaModel ||
      'qwen2.5:7b';
  }

  console.log(`\nUsing model: ${model}`);
  const confirm = (await ask(rl, 'Save this to config.json? [Y/n]: ')).trim().toLowerCase();
  if (confirm === 'n' || confirm === 'no') {
    console.log('Not saved.');
    await ask(rl, 'Press Enter...');
    return;
  }

  const models = {
    default: model,
    commandRouter: model,
    planner: model,
    dialogue: model,
    codingStructured: model,
    codingHeavy: model,
    fastFallback: model,
    legacyFallback: model
  };
  saveConfigPatch({ llmProvider: provider, ollamaUrl: baseUrl, ollamaModel: model, models });
  console.log('Saved.');
  console.log(`  provider = ${provider}`);
  console.log(`  url      = ${baseUrl}`);
  console.log(`  model    = ${model}`);
  await ask(rl, 'Press Enter...');
}

async function ensureBotDependencies() {
  if (fs.existsSync(path.join(BotDir, 'node_modules'))) return true;
  console.log('Installing bot npm packages (first time)...');
  try {
    execFileSync('npm.cmd', ['install'], { cwd: BotDir, stdio: 'inherit' });
    return true;
  } catch (e) {
    console.log('npm install failed:', e.message);
    return false;
  }
}

async function ensureOllamaIfNeeded(cfg) {
  if ((cfg.llmProvider || 'ollama') !== 'ollama') return;
  if ((cfg.llmMode || 'dialogue') === 'off' || cfg.llmEnabled === false) {
    console.log('LLM mode is off — not starting Ollama.');
    return;
  }
  const tags = `${(cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/tags`;
  if (await httpOk(tags)) {
    console.log('Ollama already reachable.');
    return;
  }
  const ollama = findOllama();
  if (ollama) {
    console.log('Starting Ollama serve...');
    const child = spawn(ollama, ['serve'], {
      cwd: Root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } else {
    console.log('Ollama not found on PATH. Start it manually if you want dialogue.');
  }
}

/** Start tj bot only (expects Paper already up, or will retry). */
async function startBotOnly(cfg, { requireServer = true } = {}) {
  console.log('\n--- Start bot only ---\n');
  if (!validateLaunchConfig(cfg)) return false;
  if (!(await ensureBotDependencies())) return false;

  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  if (requireServer && !(await tcpOpen(host, port, 500))) {
    console.log(`Paper is not listening on ${host}:${port}.`);
    console.log('  Start Paper first (menu 2), then start the bot (menu 3).');
    console.log('  Or use Start All (menu 4).');
    return false;
  }

  if (isBotProcessRunning()) {
    console.log('Bot process already looks running (node bot.js).');
    console.log('  Stop bot first (menu 8) if you want a fresh start.');
    return true;
  }

  const stoppedStandaloneDashboard = await stopDashboardOnly({ force: true });
  if (stoppedStandaloneDashboard) {
    console.log('Stopped the standalone dashboard so TJ can host live telemetry on the same port.');
  }

  await ensureOllamaIfNeeded(cfg);

  const botWrapper = path.join(RuntimeDir, 'run-MCAI-Bot.cmd');
  const nodePath = process.execPath.replace(/"/g, '');
  const botPath = BotEntry.replace(/"/g, '');
  const botDirSafe = BotDir.replace(/"/g, '');
  fs.writeFileSync(
    botWrapper,
    [
      '@echo off',
      'title MCAI-Bot',
      `cd /d "${botDirSafe}"`,
      'set ATTEMPT=0',
      ':retry',
      'set /a ATTEMPT+=1',
      'echo [MCAI-Bot] start attempt %ATTEMPT%',
      `"${nodePath}" "${botPath}"`,
      'set EC=%ERRORLEVEL%',
      'if "%EC%"=="2" if %ATTEMPT% LSS 40 (',
      '  echo [MCAI-Bot] server not ready yet, retrying in 3s...',
      '  timeout /t 3 /nobreak >nul',
      '  goto retry',
      ')',
      'echo.',
      'echo Process exited with code %EC%.',
      'echo Press any key to close this window.',
      'pause >nul'
    ].join('\r\n'),
    'utf8'
  );

  console.log('Starting MCAI-Bot window...');
  spawn(
    process.env.ComSpec || 'cmd.exe',
    ['/d', '/c', 'start', '', botWrapper],
    { cwd: Root, detached: true, stdio: 'ignore', windowsHide: true }
  ).unref();

  console.log('Bot starting.');
  console.log(`  Join Minecraft: ${host}:${port}`);
  console.log(`  Dashboard (when bot is up): http://${cfg.dashboardHost || '127.0.0.1'}:${cfg.dashboardPort || 8787}`);
  console.log(`  Chat: ${cfg.botUsername || 'tj'} help`);
  console.log('  Kill bot only: menu 8, or Ctrl+C in the MCAI-Bot window.');
  return true;
}

async function startPaperOnly(cfg, options = {}) {
  console.log('\n--- Start Paper server only ---\n');
  const ok = await startPaperServer(cfg, { ...options, waitForReady: true });
  if (ok) {
    const host = cfg.host || '127.0.0.1';
    const port = Number(cfg.port || 25565);
    console.log(`Paper ready. Join: ${host}:${port}`);
    console.log(`Bot is NOT started — use menu 3 when you want ${cfg.botUsername || 'tj'}.`);
  }
  return ok;
}

async function startAll(cfg, options = {}) {
  console.log('\n--- Start All (Paper + bot) ---\n');
  if (!(await ensureBotDependencies())) return;
  await ensureOllamaIfNeeded(cfg);

  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  const paperOk = await startPaperServer(cfg, { ...options, waitForReady: true });
  if (!paperOk) {
    console.log('Check the MCAI-Server window for Java/Paper errors, then try again.');
    return;
  }
  console.log('Waiting 3s for server to accept players...');
  await new Promise((r) => setTimeout(r, 3000));
  await startBotOnly(cfg, { requireServer: false });

  console.log('Started All.');
  console.log(`  Join Minecraft: ${host}:${port}`);
  console.log(`  Dashboard: http://${cfg.dashboardHost || '127.0.0.1'}:${cfg.dashboardPort || 8787}`);
  console.log(`  Chat as owner to the bot (e.g. ${cfg.botUsername || 'tj'} help)`);
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!(await completeFirstRunSetup(rl))) {
    rl.close();
    return;
  }
  let running = true;
  while (running) {
    const cfg = loadConfig();
    const st = await statusLines(cfg);
    printMenu(st, cfg);
    const choice = (await ask(rl, 'Choice: ')).trim().toLowerCase();
    switch (choice) {
      case '1':
        await setupLlm(rl, loadConfig());
        break;
      case '2':
      case 'paper':
        await startPaperOnly(loadConfig(), { rl });
        await ask(rl, 'Press Enter...');
        break;
      case '3':
      case 'bot':
      case 'tj':
        await startBotOnly(loadConfig());
        await ask(rl, 'Press Enter...');
        break;
      case '4':
      case 'all':
        await startAll(loadConfig(), { rl });
        await ask(rl, 'Press Enter...');
        break;
      case '5':
      case 'sb':
      case 'web':
        await startServerAndBrowser(loadConfig(), { page: '/', rl });
        await ask(rl, 'Press Enter...');
        break;
      case '6': {
        const c = loadConfig();
        await ensureDashboard(c, { open: true, page: '/setup.html' });
        break;
      }
      case '7': {
        const c = loadConfig();
        await ensureDashboard(c, { open: true, page: '/' });
        break;
      }
      case '8':
        await stopBotOnly();
        await ask(rl, 'Press Enter...');
        break;
      case '9':
        await stopServerOnly({ rl });
        await ask(rl, 'Press Enter...');
        break;
      case 's':
      case 'stop':
      case '10':
        await stopAll({ rl });
        await ask(rl, 'Press Enter...');
        break;
      case 'r':
      case '11':
        break;
      case '0':
        running = false;
        break;
      default:
        break;
    }
  }
  rl.close();
  try {
    fs.writeFileSync(
      SetupStatePath,
      JSON.stringify({ completed: true, via: 'aio-node', at: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch {
    /* ignore */
  }
}

async function runCli(argv) {
  const args = argv.slice(2).map((a) => String(a).toLowerCase());
  const wants = (flag) => args.includes(flag) || args.includes(flag.replace(/^--/, '-'));

  if (wants('--help') || wants('-h')) {
    console.log('MCAI unified launcher');
    console.log('  MCAI.cmd                   interactive menu');
    console.log('  MCAI.cmd --start-server    start Paper only');
    console.log('  MCAI.cmd --start-bot       start bot only (Paper must be up)');
    console.log('  MCAI.cmd --start           start Paper + bot');
    console.log('  MCAI.cmd --server-browser  start Paper + dashboard + open browser');
    console.log('  MCAI.cmd --stop-bot        stop bot only');
    console.log('  MCAI.cmd --stop-server     stop Paper only');
    console.log('  MCAI.cmd --stop            stop bot + Paper + dashboard');
    console.log('  MCAI.cmd --status          print status');
    console.log('  --accept-eula              accept the Minecraft EULA after reviewing its URL');
    console.log('  --force                    allow exact-PID force kill if graceful stop fails');
    return;
  }

  const force = wants('--force');
  const acceptEula = wants('--accept-eula');

  if (wants('--stop-bot')) {
    await stopBotOnly({ force: true });
    return;
  }

  if (wants('--stop-server') || wants('--stop-paper')) {
    await stopServerOnly({ force });
    return;
  }

  if (wants('--stop')) {
    await stopAll({ force });
    return;
  }

  const createdConfig = initializeConfigIfMissing();
  if (createdConfig) console.log(`Created first-run config: ${ConfigPath}`);

  if (!createdConfig && !wants('--status')) {
    const upgraded = upgradeLegacyConfigSecrets();
    if (upgraded.length) console.log(`Upgraded legacy local config defaults: ${upgraded.join(', ')}.`);
  }

  if (wants('--status')) {
    const cfg = loadConfig();
    const st = await statusLines(cfg);
    console.log(`LLM:      ${st.llm ? 'ON' : 'OFF'}  (${st.provider} / ${st.model})`);
    console.log(`Server:   ${st.server ? 'ON' : 'OFF'}  (${st.host}:${st.port})`);
    console.log(`Bot:      ${st.bot ? 'ON' : 'OFF'}`);
    console.log(`Dashboard:${st.dash ? 'ON' : 'OFF'}  (http://${st.dashHost}:${st.dashPort})`);
    console.log(`Owner:    ${cfg.ownerUsername || 'Player'}   Bot name: ${cfg.botUsername || 'tj'}`);
    console.log(`Mode:     ${cfg.interactionMode || cfg.playMode || 'companion'}   LLM: ${cfg.llmMode || 'dialogue'}`);
    return;
  }

  const config = loadConfig();
  const requestedStart = wants('--start-bot') || wants('--bot')
    || wants('--start-server') || wants('--paper') || wants('--start')
    || wants('--server-browser') || wants('--web');
  if (requestedStart && needsFirstRunSetup(config)) {
    console.log('First-run identity setup is incomplete. Run MCAI.cmd without flags and enter your Minecraft username.');
    process.exitCode = 2;
    return;
  }

  if (wants('--start-bot') || wants('--bot')) {
    await startBotOnly(config);
    return;
  }

  if (wants('--start-server') || wants('--paper')) {
    await startPaperOnly(config, { acceptEula });
    return;
  }

  if (wants('--start')) {
    await startAll(config, { acceptEula });
    return;
  }

  if (wants('--server-browser') || wants('--web')) {
    await startServerAndBrowser(config, {
      page: wants('--setup') ? '/setup.html' : '/',
      acceptEula
    });
    return;
  }

  await main();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
