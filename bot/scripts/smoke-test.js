import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, validateConfig } from '../configSchema.js';
import { createMemory } from '../memory.js';
import { loadMapMemory } from '../mapMemory.js';
import { loadConversationMemory } from '../conversationMemory.js';
import { loadGoals } from '../goals.js';
import { getCommands, validateCommandWiring } from '../commandRegistry.js';
import { validateCapabilitiesAgainstActions, validateCapabilitiesAgainstModules } from '../capabilities.js';
import { createActions } from '../actions.js';
import { createCancellation } from '../cancellation.js';
import { runSafetyAudit } from '../safetyAudit.js';
import { getPluginInstallStatus } from '../pluginStatus.js';
import { buildDashboardState } from '../../dashboard/dashboardState.js';
import { redactSecrets, validateDashboardConfig } from '../../dashboard/dashboardSecurity.js';
import { validateBridgeConfig } from '../../bridge/bridgeValidator.js';

const checks = [];
const envValues = readDotEnv(new URL('../.env', import.meta.url));
const configuredOllamaModelsDir = String(process.env.OLLAMA_MODELS || envValues.OLLAMA_MODELS || '').trim();
const ollamaManifestModels = getManifestModels(configuredOllamaModelsDir);

function pass(name, detail = '') {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = '') {
  checks.push({ ok: false, name, detail });
}

function warn(name, detail = '') {
  checks.push({ ok: true, warning: true, name, detail });
}

function dependency(name) {
  try {
    import.meta.resolve(name);
    pass(`dependency ${name}`);
  } catch (error) {
    fail(`dependency ${name}`, error.message);
  }
}

function readDotEnv(fileUrl) {
  const values = {};
  try {
    const text = fs.readFileSync(fileUrl, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  } catch {
    // .env is optional for smoke checks.
  }
  return values;
}

function getManifestModels(modelDir) {
  const models = new Set();
  if (!modelDir || !fs.existsSync(modelDir)) return models;

  const manifestsRoot = path.join(modelDir, 'manifests');
  if (!fs.existsSync(manifestsRoot)) return models;

  for (const registry of fs.readdirSync(manifestsRoot, { withFileTypes: true })) {
    if (!registry.isDirectory()) continue;
    const registryPath = path.join(manifestsRoot, registry.name);
    for (const namespace of fs.readdirSync(registryPath, { withFileTypes: true })) {
      if (!namespace.isDirectory()) continue;
      const namespacePath = path.join(registryPath, namespace.name);
      for (const model of fs.readdirSync(namespacePath, { withFileTypes: true })) {
        if (!model.isDirectory()) continue;
        const modelPath = path.join(namespacePath, model.name);
        for (const tag of fs.readdirSync(modelPath, { withFileTypes: true })) {
          if (tag.isFile()) models.add(`${model.name}:${tag.name}`);
        }
      }
    }
  }

  return models;
}

async function tcpReachable(host, port, timeoutMs = 1200) {
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

async function createMockActions(config, memory) {
  const bot = {
    mcaiConfig: config,
    username: config.botUsername,
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: {},
    entities: {},
    inventory: { items: () => [], slots: [] },
    registry: { itemsByName: {}, blocksByName: {} },
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    chat: () => {},
    clearControlStates: () => {},
    lookAt: async () => {},
    equip: async () => {},
    consume: async () => {},
    blockAt: () => null,
    findBlock: () => null,
    findBlocks: () => [],
    nearestEntity: () => null,
    pathfinder: {
      setMovements: () => {},
      setGoal: () => {},
      goto: async () => {}
    }
  };
  const taskQueue = { getCurrentTask: () => null, hasWork: () => false, clearTask: () => {}, clearAll: () => {} };
  const perception = () => ({ position: { x: 0, y: 64, z: 0 }, nearbyPlayers: [], nearbyHostileMobs: [], dangerFlags: {}, health: 20, food: 20 });
  const safety = {};
  return await createActions(bot, config, { memory, taskQueue, perception, safety, cancellation: createCancellation() });
}

const config = loadConfig();
const configResult = validateConfig(config);
if (configResult.ok) pass('config valid');
else fail('config valid', configResult.errors.join('; '));
for (const warning of configResult.warnings) pass('config warning', warning);

for (const dep of ['mineflayer', 'mineflayer-pathfinder', 'minecraft-data', 'vec3']) dependency(dep);

const mineflayerPluginStatus = getPluginInstallStatus();
for (const [key, entry] of Object.entries(mineflayerPluginStatus)) {
  if (entry.installed) pass(`Mineflayer plugin ${key} installed`, entry.version || entry.packageName);
  else if (entry.critical) fail(`Mineflayer critical plugin ${key} installed`, `${entry.packageName} is missing`);
  else pass(`Mineflayer optional plugin ${key} missing`, entry.packageName);
}

try {
  JSON.parse(fs.readFileSync(config.configPath, 'utf8'));
  pass('config.json parses');
} catch (error) {
  fail('config.json parses', error.message);
}

if (config.ownerUsername === 'ModVinny') pass('ownerUsername is ModVinny');
else fail('ownerUsername is ModVinny', config.ownerUsername);
if (config.botUsername === 'tj') pass('botUsername is tj');
else fail('botUsername is tj', config.botUsername);
if (config.minecraftVersion === '1.21.11') pass('Minecraft version is 1.21.11');
else fail('Minecraft version is 1.21.11', config.minecraftVersion);

try {
  const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-smoke-'));
  const memory = createMemory(path.join(smokeDir, 'memory.json'));
  pass('memory module isolated load/create');
  loadMapMemory();
  pass('map memory reads');
  loadGoals();
  pass('goals read');
  loadConversationMemory();
  pass('conversation memory reads');

  const actions = await createMockActions(config, memory);
  const commandValidation = validateCommandWiring(actions);
  commandValidation.ok ? pass('command registry wiring') : fail('command registry wiring', JSON.stringify(commandValidation.missing));
  const capabilityActionValidation = validateCapabilitiesAgainstActions(actions);
  capabilityActionValidation.ok ? pass('capabilities wired to actions') : fail('capabilities wired to actions', JSON.stringify(capabilityActionValidation.missing));
} catch (error) {
  fail('module wiring', error.stack || error.message);
}

try {
  const validation = validateDashboardConfig(config);
  validation.ok ? pass('dashboard config valid') : fail('dashboard config valid', validation.errors.join('; '));
  const mockBot = {
    mcaiConfig: config,
    username: config.botUsername,
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: {},
    entities: {},
    inventory: { items: () => [], slots: [] },
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    mcaiCancellation: createCancellation()
  };
  const dashboardState = await buildDashboardState(mockBot, createMemory(config.memoryPath), { config });
  dashboardState?.bot?.username === 'tj' ? pass('dashboard state builder works') : fail('dashboard state builder works', 'missing bot username');
  const redacted = redactSecrets({ dashboardToken: 'abc123', nested: { apiKey: 'secret' }, path: 'E:\\Games\\MCAI\\config.json' });
  if (redacted.dashboardToken === '[redacted]' && redacted.nested.apiKey === '[redacted]' && !String(redacted.path).includes('E:\\')) {
    pass('dashboard security redacts secrets');
  } else {
    fail('dashboard security redacts secrets', JSON.stringify(redacted));
  }
} catch (error) {
  fail('dashboard modules', error.stack || error.message);
}

try {
  const validation = validateBridgeConfig(config);
  validation.ok ? pass('server plugin bridge config valid') : fail('server plugin bridge config valid', validation.errors.join('; '));
  const redacted = redactSecrets({ serverPluginToken: 'abc123', nested: { token: 'secret' } });
  if (redacted.serverPluginToken === '[redacted]' && redacted.nested.token === '[redacted]') {
    pass('server plugin bridge security redacts secrets');
  } else {
    fail('server plugin bridge security redacts secrets', JSON.stringify(redacted));
  }
} catch (error) {
  fail('server plugin bridge modules', error.stack || error.message);
}

try {
  const moduleValidation = validateCapabilitiesAgainstModules();
  moduleValidation.ok ? pass('capability modules exist') : fail('capability modules exist', JSON.stringify(moduleValidation.missing));
} catch (error) {
  fail('capability module validation', error.message);
}

try {
  if (getCommands().length > 0) pass('command registry loads', `${getCommands().length} commands`);
  else fail('command registry loads', 'no commands');
} catch (error) {
  fail('command registry loads', error.message);
}

try {
  const safetyAudit = runSafetyAudit(config);
  safetyAudit.ok ? pass('safety audit') : fail('safety audit', JSON.stringify(safetyAudit.checks.filter((check) => !check.ok)));
} catch (error) {
  fail('safety audit', error.message);
}

try {
  const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/tags`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (configuredOllamaModelsDir) {
    fs.existsSync(configuredOllamaModelsDir)
      ? pass('OLLAMA_MODELS store exists', configuredOllamaModelsDir)
      : warn('OLLAMA_MODELS configured path is unavailable', configuredOllamaModelsDir);
  }
  const payload = await response.json();
  const names = (payload.models || []).map((model) => model.name);
  for (const [role, modelName] of Object.entries(config.models || {})) {
    if (names.includes(modelName)) pass(`Ollama ${role} model available`, modelName);
    else if (ollamaManifestModels.has(modelName)) fail(`Ollama ${role} model available`, `${modelName} is present in OLLAMA_MODELS=${configuredOllamaModelsDir}, but the active server reports: ${names.join(', ') || 'no models'}. Restart Ollama with that model store.`);
    else fail(`Ollama ${role} model available`, `${modelName} not in ${names.join(', ')}`);
  }
} catch (error) {
  fail('Ollama reachable', error.message);
}

if (await tcpReachable(config.host, config.port)) pass('Minecraft server reachable', `${config.host}:${config.port}`);
else warn('Minecraft server is offline', `${config.host}:${config.port}`);

if (!process.env.OPENAI_API_KEY) pass('no OpenAI API key required');
else pass('OpenAI API key ignored', 'local Ollama only');
if (!process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) pass('no cloud API required');
else pass('cloud API keys ignored', 'local Ollama only');

for (const check of checks) {
  const label = check.warning ? 'WARN' : check.ok ? 'PASS' : 'FAIL';
  console.log(`${label} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
