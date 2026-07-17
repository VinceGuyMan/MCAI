/**
 * Setup wizard backend: LLM provider/model config + health checklist.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, configPath, projectRoot } from '../bot/config.js';
import { validateConfig, explainConfigErrors } from '../bot/configSchema.js';
import { getRecentLogs } from '../bot/logger.js';
import { getPluginInstallStatus } from '../bot/pluginStatus.js';
import { validateDashboardConfig } from './dashboardSecurity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LLM_PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    defaultUrl: 'http://127.0.0.1:11434',
    apiStyle: 'ollama',
    hint: 'Local Ollama server. Models: ollama pull <name>'
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    defaultUrl: 'http://127.0.0.1:1234',
    apiStyle: 'openai',
    hint: 'Enable Local Server in LM Studio (OpenAI-compatible API).'
  },
  openai_compatible: {
    id: 'openai_compatible',
    label: 'OpenAI-compatible',
    defaultUrl: 'http://127.0.0.1:8000',
    apiStyle: 'openai',
    hint: 'Any OpenAI-style /v1 server (vLLM, text-gen-webui, etc.).'
  }
};

export const MODEL_ROLES = [
  { id: 'default', label: 'Default' },
  { id: 'commandRouter', label: 'Command router' },
  { id: 'planner', label: 'Planner' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'codingStructured', label: 'Coding / structured' },
  { id: 'codingHeavy', label: 'Coding heavy' },
  { id: 'fastFallback', label: 'Fast fallback' },
  { id: 'legacyFallback', label: 'Legacy fallback' }
];

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function providerFromConfig(config = {}) {
  const id = String(config.llmProvider || 'ollama').toLowerCase();
  return LLM_PROVIDERS[id] || LLM_PROVIDERS.ollama;
}

export function getLlmSettings(config = loadConfig()) {
  const provider = providerFromConfig(config);
  return {
    provider: provider.id,
    providerLabel: provider.label,
    apiStyle: provider.apiStyle,
    hint: provider.hint,
    baseUrl: normalizeBaseUrl(config.ollamaUrl || provider.defaultUrl),
    ollamaModel: config.ollamaModel || config.models?.default || '',
    models: { ...(config.models || {}) },
    providers: Object.values(LLM_PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      defaultUrl: p.defaultUrl,
      apiStyle: p.apiStyle,
      hint: p.hint
    })),
    roles: MODEL_ROLES
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function listProviderModels({ provider = 'ollama', baseUrl } = {}) {
  const preset = LLM_PROVIDERS[provider] || LLM_PROVIDERS.ollama;
  const base = normalizeBaseUrl(baseUrl || preset.defaultUrl);
  try {
    if (preset.apiStyle === 'ollama') {
      const response = await fetchWithTimeout(`${base}/api/tags`);
      if (!response.ok) {
        return { ok: false, reachable: false, models: [], reason: `HTTP ${response.status}`, baseUrl: base, provider: preset.id };
      }
      const payload = await response.json();
      const models = (payload.models || []).map((m) => m.name).filter(Boolean).sort();
      return { ok: true, reachable: true, models, baseUrl: base, provider: preset.id };
    }

    // OpenAI-compatible (LM Studio, etc.)
    const response = await fetchWithTimeout(`${base}/v1/models`);
    if (!response.ok) {
      // Some servers mount models at /models
      const alt = await fetchWithTimeout(`${base}/models`);
      if (!alt.ok) {
        return { ok: false, reachable: false, models: [], reason: `HTTP ${response.status}`, baseUrl: base, provider: preset.id };
      }
      const altPayload = await alt.json();
      const models = (altPayload.data || []).map((m) => m.id).filter(Boolean).sort();
      return { ok: true, reachable: true, models, baseUrl: base, provider: preset.id };
    }
    const payload = await response.json();
    const models = (payload.data || []).map((m) => m.id).filter(Boolean).sort();
    return { ok: true, reachable: true, models, baseUrl: base, provider: preset.id };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      models: [],
      reason: error.name === 'AbortError' ? 'timeout' : error.message,
      baseUrl: base,
      provider: preset.id
    };
  }
}

export async function testLlmChat({ provider = 'ollama', baseUrl, model } = {}) {
  const preset = LLM_PROVIDERS[provider] || LLM_PROVIDERS.ollama;
  const base = normalizeBaseUrl(baseUrl || preset.defaultUrl);
  const useModel = String(model || '').trim();
  if (!useModel) return { ok: false, reason: 'No model selected.' };

  try {
    if (preset.apiStyle === 'ollama') {
      const response = await fetchWithTimeout(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: useModel,
          stream: false,
          messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
          options: { temperature: 0, num_predict: 16 }
        })
      }, 15000);
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        return { ok: false, reason: `HTTP ${response.status}: ${detail}` };
      }
      const payload = await response.json();
      const content = String(payload.message?.content || '').trim();
      return { ok: true, content: content.slice(0, 200), model: useModel, provider: preset.id };
    }

    const response = await fetchWithTimeout(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
        temperature: 0,
        max_tokens: 16
      })
    }, 15000);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return { ok: false, reason: `HTTP ${response.status}: ${detail}` };
    }
    const payload = await response.json();
    const content = String(payload.choices?.[0]?.message?.content || '').trim();
    return { ok: true, content: content.slice(0, 200), model: useModel, provider: preset.id };
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : error.message, model: useModel, provider: preset.id };
  }
}

function tcpReachable(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function readJsonSafe(filePath) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * Persist LLM provider + models into config.json (merge, preserve other keys).
 */
export function saveLlmSettings(patch = {}) {
  const current = loadConfig();
  const raw = readJsonSafe(configPath);
  const disk = raw.ok ? raw.data : {};

  const providerId = String(patch.provider || disk.llmProvider || current.llmProvider || 'ollama').toLowerCase();
  const preset = LLM_PROVIDERS[providerId] || LLM_PROVIDERS.ollama;
  const baseUrl = normalizeBaseUrl(patch.baseUrl || disk.ollamaUrl || preset.defaultUrl);

  const models = {
    ...(current.models || {}),
    ...(disk.models || {}),
    ...(patch.models || {})
  };

  // Keep role models consistent with default if only default provided
  if (patch.models?.default) {
    for (const role of ['commandRouter', 'planner']) {
      if (!patch.models[role]) models[role] = patch.models.default;
    }
  }

  const next = {
    ...disk,
    llmProvider: preset.id,
    ollamaUrl: baseUrl,
    ollamaModel: patch.ollamaModel || models.default || disk.ollamaModel || current.ollamaModel,
    models
  };

  // Atomic write
  const tmp = `${configPath}.tmp-setup-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, configPath);

  return {
    ok: true,
    message: 'LLM settings saved to config.json. Restart the bot to apply fully.',
    settings: getLlmSettings(next),
    note: 'Running bot process keeps its in-memory config until restart.'
  };
}

function check(id, label, status, detail = '', fix = '') {
  return {
    id,
    label,
    status, // pass | fail | warn
    detail: String(detail || ''),
    fix: String(fix || '')
  };
}

/**
 * Full setup checklist for server + bot + LLM.
 */
export async function runSetupChecklist(context = {}) {
  const config = context.config || loadConfig();
  const bot = context.bot || null;
  const items = [];
  const provider = providerFromConfig(config);
  const baseUrl = normalizeBaseUrl(config.ollamaUrl || provider.defaultUrl);

  // --- Runtime ---
  items.push(check('node', 'Node.js', 'pass', process.version));

  // --- Project files ---
  const paperJars = fs.existsSync(projectRoot)
    ? fs.readdirSync(projectRoot).filter((name) => /^paper-.*\.jar$/i.test(name))
    : [];
  items.push(
    paperJars.length
      ? check('paper', 'Paper server jar', 'pass', paperJars.slice(0, 3).join(', '))
      : check('paper', 'Paper server jar', 'fail', 'No paper-*.jar in project root', 'Run scripts/Install-Paper.ps1 or place a Paper jar in F:\\Games\\MCAI')
  );

  const eulaPath = path.join(projectRoot, 'eula.txt');
  if (fs.existsSync(eulaPath)) {
    const eula = fs.readFileSync(eulaPath, 'utf8');
    items.push(
      /eula\s*=\s*true/i.test(eula)
        ? check('eula', 'EULA accepted', 'pass', 'eula=true')
        : check('eula', 'EULA accepted', 'fail', 'eula is not true', 'Set eula=true in eula.txt')
    );
  } else {
    items.push(check('eula', 'EULA accepted', 'warn', 'eula.txt missing (server may create it on first run)'));
  }

  items.push(
    fs.existsSync(configPath)
      ? check('config', 'config.json exists', 'pass', configPath)
      : check('config', 'config.json exists', 'fail', configPath, 'Restore config.json')
  );

  const schema = validateConfig(config);
  items.push(
    schema.ok
      ? check('configSchema', 'Config schema valid', 'pass', schema.warnings?.length ? `warnings: ${schema.warnings.length}` : 'ok')
      : check('configSchema', 'Config schema valid', 'fail', explainConfigErrors(schema), 'Fix config.json fields')
  );

  // --- Minecraft server ---
  const mcHost = config.host || '127.0.0.1';
  const mcPort = Number(config.port || 25565);
  const serverUp = await tcpReachable(mcHost, mcPort);
  items.push(
    serverUp
      ? check('mcServer', 'Minecraft server reachable', 'pass', `${mcHost}:${mcPort}`)
      : check('mcServer', 'Minecraft server reachable', 'fail', `${mcHost}:${mcPort} closed`, 'Start Paper via Start-MCAI.cmd or scripts/Start-Server.ps1')
  );

  // --- Bot process ---
  const botConnected = Boolean(bot?.entity || bot?.player);
  const botSpawned = Boolean(bot?.entity?.position);
  if (bot) {
    items.push(
      botSpawned
        ? check('bot', 'Bot process linked & spawned', 'pass', config.botUsername || 'tj')
        : check('bot', 'Bot process linked & spawned', 'warn', 'Bot object present but not spawned yet', 'Wait for join or check server whitelist/version')
    );
  } else {
    items.push(
      check('bot', 'Bot process linked & spawned', 'fail', 'Dashboard started without bot', 'Start bot with npm start in bot/ (or Start-MCAI.cmd)')
    );
  }

  // --- Dependencies ---
  const plugins = getPluginInstallStatus();
  for (const [key, entry] of Object.entries(plugins)) {
    if (entry.installed) {
      items.push(check(`plugin_${key}`, `Plugin ${key}`, 'pass', entry.version || entry.packageName));
    } else if (entry.critical) {
      items.push(check(`plugin_${key}`, `Plugin ${key}`, 'fail', 'missing', `npm install ${entry.packageName} in bot/`));
    } else {
      items.push(check(`plugin_${key}`, `Plugin ${key}`, 'warn', 'optional missing'));
    }
  }

  // --- LLM ---
  items.push(check('llmProvider', 'LLM provider', 'pass', `${provider.label} @ ${baseUrl}`));
  const listed = await listProviderModels({ provider: provider.id, baseUrl });
  items.push(
    listed.reachable
      ? check('llmReachable', 'LLM server reachable', 'pass', `${listed.models.length} models listed`)
      : check('llmReachable', 'LLM server reachable', 'fail', listed.reason || 'unreachable', provider.id === 'ollama' ? 'Start Ollama (ollama serve)' : 'Start LM Studio local server')
  );

  const roleModels = config.models || { default: config.ollamaModel };
  const missingRoles = [];
  for (const [role, model] of Object.entries(roleModels)) {
    if (!model) continue;
    if (listed.reachable && listed.models.length && !listed.models.includes(model) && !listed.models.some((m) => m.startsWith(`${model}`) || model.startsWith(m.split(':')[0]))) {
      // loose match for lmstudio ids
      const found = listed.models.some((m) => m === model || m.includes(model) || model.includes(m));
      if (!found) missingRoles.push(`${role}=${model}`);
    }
  }
  if (!listed.reachable) {
    items.push(check('llmModels', 'Configured models available', 'warn', 'skipped (server offline)'));
  } else if (missingRoles.length) {
    items.push(
      check('llmModels', 'Configured models available', 'fail', missingRoles.slice(0, 6).join('; '), 'Pick installed models in Setup GUI or load them in Ollama/LM Studio')
    );
  } else {
    items.push(check('llmModels', 'Configured models available', 'pass', Object.values(roleModels).filter(Boolean).slice(0, 4).join(', ')));
  }

  // --- Dashboard ---
  const dash = validateDashboardConfig(config);
  items.push(
    dash.ok
      ? check('dashboard', 'Dashboard config', 'pass', `http://${config.dashboardHost || '127.0.0.1'}:${config.dashboardPort || 8787}`)
      : check('dashboard', 'Dashboard config', 'fail', dash.errors.join('; '))
  );
  if (String(config.dashboardToken || '') === 'change-me-local-token') {
    items.push(check('dashboardToken', 'Dashboard token', 'warn', 'still default token', 'Change dashboardToken in config.json for safety'));
  } else {
    items.push(check('dashboardToken', 'Dashboard token', 'pass', 'custom token set'));
  }

  // --- Errors from logs / memory ---
  const logs = typeof getRecentLogs === 'function' ? getRecentLogs(80) : [];
  const errorLogs = (logs || []).filter((line) => {
    const text = typeof line === 'string' ? line : JSON.stringify(line);
    return /error|fail|exception|ECONNREFUSED|timed out/i.test(text);
  }).slice(-12);

  items.push(
    errorLogs.length
      ? check('recentErrors', 'Recent log errors', 'warn', `${errorLogs.length} matching lines`, 'See Errors panel below')
      : check('recentErrors', 'Recent log errors', 'pass', 'none in recent buffer')
  );

  const mem = context.memory?.get?.() || {};
  const failures = Array.isArray(mem.recentFailures) ? mem.recentFailures.slice(-8) : [];
  items.push(
    failures.length
      ? check('botFailures', 'Bot failure memory', 'warn', failures.slice(-3).map((f) => f.reason || f || f.message || String(f)).join(' | '))
      : check('botFailures', 'Bot failure memory', 'pass', 'no recent failures recorded')
  );

  const passCount = items.filter((i) => i.status === 'pass').length;
  const failCount = items.filter((i) => i.status === 'fail').length;
  const warnCount = items.filter((i) => i.status === 'warn').length;

  return {
    ok: failCount === 0,
    summary: { pass: passCount, fail: failCount, warn: warnCount, total: items.length },
    items,
    llm: getLlmSettings(config),
    errors: {
      logs: errorLogs.map((line) => (typeof line === 'string' ? line : line.message || JSON.stringify(line))).slice(-20),
      failures
    },
    botConnected,
    serverUp,
    timestamp: Date.now()
  };
}
