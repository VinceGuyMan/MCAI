/**
 * MCAI unified All-In-One launcher (Node only — no PowerShell).
 * Entry: MCAI.cmd | MCAI.vbs | node launcher/aio-node.mjs [--start|--stop|--status]
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Root = path.resolve(__dirname, '..');
const ConfigPath = path.join(Root, 'config.json');
const BotDir = path.join(Root, 'bot');
const BotEntry = path.join(BotDir, 'bot.js');
const RuntimeDir = path.join(Root, '.runtime');
const LogPath = path.join(RuntimeDir, 'aio-node.log');
const SetupStatePath = path.join(RuntimeDir, 'setup-state.json');

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

function spawnDetached(command, args, cwd, title) {
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
    'echo.',
    'echo Process exited with code %ERRORLEVEL%.',
    'echo Press any key to close this window.',
    'pause >nul'
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

async function ensureEula() {
  const eula = path.join(Root, 'eula.txt');
  fs.writeFileSync(
    eula,
    '# https://aka.ms/MinecraftEULA\r\neula=true\r\n',
    'utf8'
  );
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

function isBotProcessRunning() {
  const botNeedle = BotEntry.replace(/\\/g, '/').toLowerCase();
  const processes = listWindowsProcesses();
  return processes.some((proc) => {
    const name = String(proc.name || '').toLowerCase();
    const cmd = String(proc.commandLine || '').replace(/\\/g, '/').toLowerCase();
    return name === 'node.exe' && (cmd.includes('bot.js') || cmd.includes(botNeedle));
  });
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
  console.clear();
  console.log('========================================');
  console.log('          MCAI  All-In-One');
  console.log('   Paper + tj bot + local LLM setup');
  console.log('========================================');
  console.log('');
  console.log(` Owner: ${cfg.ownerUsername || 'ModVinny'}   Bot: ${cfg.botUsername || 'tj'}`);
  console.log(` Mode:  ${cfg.interactionMode || cfg.playMode || 'companion'} (companion = living Player 2)`);
  console.log(` MC:    ${cfg.minecraftVersion || '?'}   Join: ${st.host}:${st.port}`);
  console.log(` LLM:   ${st.provider}   Model: ${st.model}   Mode: ${cfg.llmMode || 'dialogue'}`);
  console.log(` URL:   ${st.ollamaUrl || 'http://127.0.0.1:11434'}`);
  console.log('');
  console.log(` [${st.server ? 'ON' : '--'}] Paper server   [${st.bot ? 'ON' : '--'}] Bot (tj)`);
  console.log(` [${st.dash ? 'ON' : '--'}] Dashboard       [${st.llm ? 'ON' : '--'}] LLM`);
  if (st.dash) console.log(`      Dashboard: http://${st.dashHost}:${st.dashPort}`);
  console.log('');
  console.log('  --- Start ---');
  console.log('  1) Setup LLM (provider + model)');
  console.log('  2) Start Paper server only');
  console.log('  3) Start bot only (tj)');
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

function stopBotOnly() {
  console.log('Stopping bot only (Paper server left running)...');
  let killed = 0;
  if (runQuiet('taskkill', ['/F', '/T', '/FI', 'WINDOWTITLE eq MCAI-Bot*'])) {
    console.log('  closed MCAI-Bot window(s)');
    killed += 1;
  }
  const botNeedle = BotEntry.replace(/\\/g, '/').toLowerCase();
  for (const proc of listWindowsProcesses()) {
    const cmd = String(proc.commandLine || '').replace(/\\/g, '/').toLowerCase();
    const name = String(proc.name || '').toLowerCase();
    if (name !== 'node.exe') continue;
    if (!(cmd.includes('bot.js') || cmd.includes(botNeedle))) continue;
    if (cmd.includes('aio-node')) continue;
    if (runQuiet('taskkill', ['/F', '/T', '/PID', String(proc.pid)])) {
      console.log(`  stopped bot PID ${proc.pid}`);
      killed += 1;
    }
  }
  if (!killed) console.log('  bot was not running (or window title differs).');
  else console.log('Bot stopped. Paper server should still be up.');
  log(`stopBotOnly finished (actions=${killed})`);
  return killed;
}

function stopServerOnly() {
  console.log('Stopping Paper server only (bot left alone — it will disconnect)...');
  let killed = 0;
  if (runQuiet('taskkill', ['/F', '/T', '/FI', 'WINDOWTITLE eq MCAI-Server*'])) {
    console.log('  closed MCAI-Server window(s)');
    killed += 1;
  }
  const rootNeedle = Root.replace(/\\/g, '/').toLowerCase();
  for (const proc of listWindowsProcesses()) {
    const cmd = String(proc.commandLine || '').replace(/\\/g, '/').toLowerCase();
    const name = String(proc.name || '').toLowerCase();
    if (name !== 'java.exe') continue;
    if (!(cmd.includes(rootNeedle) && cmd.includes('paper-') && cmd.includes('.jar'))) continue;
    if (runQuiet('taskkill', ['/F', '/T', '/PID', String(proc.pid)])) {
      console.log(`  stopped Paper PID ${proc.pid}`);
      killed += 1;
    }
  }
  if (!killed) console.log('  Paper was not running (or window title differs).');
  else console.log('Paper stopped.');
  log(`stopServerOnly finished (actions=${killed})`);
  return killed;
}

function stopDashboardOnly() {
  let killed = 0;
  if (runQuiet('taskkill', ['/F', '/T', '/FI', 'WINDOWTITLE eq MCAI-Dashboard*'])) {
    console.log('  closed MCAI-Dashboard window(s)');
    killed += 1;
  }
  const dashNeedle = path.join(Root, 'dashboard', 'server.js').replace(/\\/g, '/').toLowerCase();
  for (const proc of listWindowsProcesses()) {
    const cmd = String(proc.commandLine || '').replace(/\\/g, '/').toLowerCase();
    const name = String(proc.name || '').toLowerCase();
    if (name !== 'node.exe') continue;
    if (!(cmd.includes('dashboard') && cmd.includes('server.js')) && !cmd.includes(dashNeedle)) continue;
    if (runQuiet('taskkill', ['/F', '/T', '/PID', String(proc.pid)])) {
      console.log(`  stopped dashboard PID ${proc.pid}`);
      killed += 1;
    }
  }
  return killed;
}

function stopAll() {
  console.log('Stopping MCAI processes (bot + Paper + dashboard)...');
  let killed = 0;
  killed += stopBotOnly() || 0;
  killed += stopServerOnly() || 0;
  killed += stopDashboardOnly() || 0;
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

/** Start Paper only. Returns true if listening (or already was). */
async function startPaperServer(cfg, { waitForReady = true } = {}) {
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

  await ensureEula();
  await ensureServerProperties(cfg);

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
  spawnDetached(java, javaArgs, Root, 'MCAI-Server');

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
  spawnDetached(process.execPath, [dashEntry], path.join(Root, 'dashboard'), 'MCAI-Dashboard');

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
async function startServerAndBrowser(cfg, { page = '/' } = {}) {
  console.log('\n--- Start server + browser ---\n');
  const paperOk = await startPaperServer(cfg, { waitForReady: true });
  if (!paperOk) {
    console.log('Paper did not start; still trying dashboard so you can use Setup in the browser.');
  }
  const dashUrl = await ensureDashboard(cfg, { open: true, page });
  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  console.log('');
  console.log(paperOk ? `  Minecraft: ${host}:${port}` : '  Minecraft: not ready');
  console.log(dashUrl ? `  Browser:   ${dashUrl}${page === '/' ? '' : page}` : '  Browser:   dashboard not ready');
  console.log('  (Bot not started — use Start All when you want tj in-game.)');
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
  console.log('  Chat: tj help');
  console.log('  Kill bot only: menu 8, or Ctrl+C in the MCAI-Bot window.');
  return true;
}

async function startPaperOnly(cfg) {
  console.log('\n--- Start Paper server only ---\n');
  const ok = await startPaperServer(cfg, { waitForReady: true });
  if (ok) {
    const host = cfg.host || '127.0.0.1';
    const port = Number(cfg.port || 25565);
    console.log(`Paper ready. Join: ${host}:${port}`);
    console.log('Bot is NOT started — use menu 3 when you want tj.');
  }
  return ok;
}

async function startAll(cfg) {
  console.log('\n--- Start All (Paper + bot) ---\n');
  if (!(await ensureBotDependencies())) return;
  await ensureOllamaIfNeeded(cfg);

  const host = cfg.host || '127.0.0.1';
  const port = Number(cfg.port || 25565);
  const paperOk = await startPaperServer(cfg, { waitForReady: true });
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
  console.log('  Chat as owner to the bot (e.g. tj help)');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
        await startPaperOnly(loadConfig());
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
        await startAll(loadConfig());
        await ask(rl, 'Press Enter...');
        break;
      case '5':
      case 'sb':
      case 'web':
        await startServerAndBrowser(loadConfig(), { page: '/' });
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
        stopBotOnly();
        await ask(rl, 'Press Enter...');
        break;
      case '9':
        stopServerOnly();
        await ask(rl, 'Press Enter...');
        break;
      case 's':
      case 'stop':
      case '10':
        stopAll();
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
    return;
  }

  if (wants('--status')) {
    const cfg = loadConfig();
    const st = await statusLines(cfg);
    console.log(`LLM:      ${st.llm ? 'ON' : 'OFF'}  (${st.provider} / ${st.model})`);
    console.log(`Server:   ${st.server ? 'ON' : 'OFF'}  (${st.host}:${st.port})`);
    console.log(`Bot:      ${st.bot ? 'ON' : 'OFF'}`);
    console.log(`Dashboard:${st.dash ? 'ON' : 'OFF'}  (http://${st.dashHost}:${st.dashPort})`);
    console.log(`Owner:    ${cfg.ownerUsername || 'ModVinny'}   Bot name: ${cfg.botUsername || 'tj'}`);
    console.log(`Mode:     ${cfg.interactionMode || cfg.playMode || 'companion'}   LLM: ${cfg.llmMode || 'dialogue'}`);
    return;
  }

  if (wants('--stop-bot')) {
    stopBotOnly();
    return;
  }

  if (wants('--stop-server') || wants('--stop-paper')) {
    stopServerOnly();
    return;
  }

  if (wants('--stop')) {
    stopAll();
    return;
  }

  if (wants('--start-bot') || wants('--bot')) {
    await startBotOnly(loadConfig());
    return;
  }

  if (wants('--start-server') || wants('--paper')) {
    await startPaperOnly(loadConfig());
    return;
  }

  if (wants('--start')) {
    await startAll(loadConfig());
    return;
  }

  if (wants('--server-browser') || wants('--web')) {
    await startServerAndBrowser(loadConfig(), {
      page: wants('--setup') ? '/setup.html' : '/'
    });
    return;
  }

  await main();
}

runCli(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
