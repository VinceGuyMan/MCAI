import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig as loadRawConfig, configPath, projectRoot } from '../config.js';
import { normalizeConfig, validateConfig, explainConfigErrors } from '../configSchema.js';
import { goalsPath } from '../goals.js';
import { getCommands, validateCommandWiring } from '../commandRegistry.js';
import { validateCapabilitiesAgainstActions, validateCapabilitiesAgainstModules } from '../capabilities.js';
import { createMemory } from '../memory.js';
import { createActions } from '../actions.js';
import { createCancellation } from '../cancellation.js';
import { runSafetyAudit } from '../safetyAudit.js';
import { ACTION_SCHEMA, callOllama } from '../ollama.js';
import { getPluginInstallStatus } from '../pluginStatus.js';
import { validateDashboardConfig } from '../../dashboard/dashboardSecurity.js';
import { validateBridgeConfig } from '../../bridge/bridgeValidator.js';

const execFileAsync = promisify(execFile);
const config = normalizeConfig(loadRawConfig());
const checks = [];
const rootPath = new URL('../../', import.meta.url);
const memoryPath = new URL('../../memory.json', import.meta.url);
const mapMemoryPath = new URL('../../map-memory.json', import.meta.url);
const conversationMemoryPath = new URL('../../conversation-memory.json', import.meta.url);
const serverPropertiesPath = new URL('../../server.properties', import.meta.url);
const expectedModels = {
  default: 'gemma2-2b-local:latest',
  commandRouter: 'gemma2-2b-local:latest',
  planner: 'gemma2-2b-local:latest',
  dialogue: 'gemma2-2b-local:latest',
  codingStructured: 'gemma2-2b-local:latest',
  codingHeavy: 'gemma2-2b-local:latest',
  fastFallback: 'gemma2-2b-local:latest',
  legacyFallback: 'gemma2-2b-local:latest'
};
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

async function tcpReachable(host, port, timeoutMs = 1500) {
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

function dependencyInstalled(name) {
  try {
    return Boolean(import.meta.resolve(name));
  } catch {
    return false;
  }
}

function parseOllamaListNames(stdout = '') {
  return String(stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
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
    // .env is optional for doctor; config.json still gets checked.
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

async function createMockActions(memory) {
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
    pathfinder: { setMovements: () => {}, setGoal: () => {}, goto: async () => {} }
  };
  const taskQueue = { getCurrentTask: () => null, hasWork: () => false, clearTask: () => {}, clearAll: () => {} };
  const perception = () => ({ position: { x: 0, y: 64, z: 0 }, nearbyPlayers: [], nearbyHostileMobs: [], dangerFlags: {}, health: 20, food: 20 });
  return await createActions(bot, config, { memory, taskQueue, perception, safety: {}, cancellation: createCancellation() });
}

pass('Node version', process.version);

try {
  const npmFromEnv = String(process.env.npm_config_user_agent || '').match(/npm\/([^\s]+)/)?.[1];
  if (npmFromEnv) {
    pass('npm version', npmFromEnv);
  } else {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const { stdout } = await execFileAsync(npmCommand, ['--version'], { timeout: 10000 });
    pass('npm version', stdout.trim());
  }
} catch (error) {
  pass('npm version warning', `could not query npm directly (${error.message})`);
}

try {
  const { stdout, stderr } = await execFileAsync('java', ['-version'], { timeout: 10000 });
  pass('Java availability', (stderr || stdout).split(/\r?\n/)[0]);
} catch (error) {
  pass('Java availability warning', `java was not found on PATH (${error.message}). This is acceptable if the Paper server is launched outside this project.`);
}

const paperJars = fs.readdirSync(projectRoot).filter((name) => /^paper-.*\.jar$/i.test(name));
if (paperJars.length) pass('Paper jar exists', paperJars.join(', '));
else fail('Paper jar exists', 'no paper-*.jar found');

for (const dep of ['mineflayer', 'mineflayer-pathfinder', 'minecraft-data', 'vec3']) {
  if (dependencyInstalled(dep)) pass(`dependency ${dep}`);
  else fail(`dependency ${dep}`, 'not resolvable');
}

const mineflayerPluginStatus = getPluginInstallStatus();
for (const [key, entry] of Object.entries(mineflayerPluginStatus)) {
  if (entry.installed) pass(`Mineflayer plugin ${key} installed`, entry.version || entry.packageName);
  else if (entry.critical) fail(`Mineflayer critical plugin ${key} installed`, `${entry.packageName} is missing`);
  else pass(`Mineflayer optional plugin ${key} missing`, entry.packageName);
}

if (fs.existsSync(configPath)) pass('config.json exists', configPath);
else fail('config.json exists', configPath);

try {
  JSON.parse(fs.readFileSync(configPath, 'utf8'));
  pass('config.json valid JSON');
} catch (error) {
  fail('config.json valid JSON', error.message);
}

const configValidation = validateConfig(config);
if (configValidation.ok) pass('config schema valid');
else fail('config schema valid', explainConfigErrors(configValidation));
for (const warning of configValidation.warnings) pass('config schema warning', warning);

try {
  const dashboardValidation = validateDashboardConfig(config);
  dashboardValidation.ok ? pass('dashboard config valid') : fail('dashboard config valid', dashboardValidation.errors.join('; '));
  for (const warning of dashboardValidation.warnings) pass('dashboard config warning', warning);
  if (config.dashboardHost === '127.0.0.1') pass('dashboard host is local', config.dashboardHost);
  else if (config.dashboardLocalOnly === false) pass('dashboard host warning', `non-local host ${config.dashboardHost}`);
  else fail('dashboard host is local', config.dashboardHost);
  if (await tcpReachable(config.dashboardHost || '127.0.0.1', Number(config.dashboardPort || 8787), 500)) {
    pass('dashboard port status', `${config.dashboardHost || '127.0.0.1'}:${config.dashboardPort || 8787} is occupied or dashboard is running`);
  } else {
    pass('dashboard port status', `${config.dashboardHost || '127.0.0.1'}:${config.dashboardPort || 8787} is available`);
  }
} catch (error) {
  fail('dashboard checks', error.message);
}

try {
  const bridgeValidation = validateBridgeConfig(config);
  bridgeValidation.ok ? pass('server plugin bridge config valid') : fail('server plugin bridge config valid', bridgeValidation.errors.join('; '));
  for (const warning of bridgeValidation.warnings) pass('server plugin bridge warning', warning);
  if (config.serverPluginHost === '127.0.0.1') pass('server plugin bridge host is local', config.serverPluginHost);
  else if (config.serverPluginLocalOnly === false) pass('server plugin bridge host warning', `non-local host ${config.serverPluginHost}`);
  else fail('server plugin bridge host is local', config.serverPluginHost);
  if (await tcpReachable(config.serverPluginHost || '127.0.0.1', Number(config.serverPluginPort || 8791), 500)) {
    pass('server plugin bridge port status', `${config.serverPluginHost || '127.0.0.1'}:${config.serverPluginPort || 8791} is occupied or bridge is running`);
  } else {
    pass('server plugin bridge port status', `${config.serverPluginHost || '127.0.0.1'}:${config.serverPluginPort || 8791} is available`);
  }
} catch (error) {
  fail('server plugin bridge checks', error.message);
}

if (config.ownerUsername === 'ModVinny') pass('ownerUsername is ModVinny');
else fail('ownerUsername is ModVinny', config.ownerUsername);

if (config.botUsername === 'tj') pass('botUsername is tj');
else fail('botUsername is tj', config.botUsername);

if (config.minecraftVersion === '1.21.11') pass('Minecraft version is 1.21.11');
else fail('Minecraft version is 1.21.11', config.minecraftVersion);

for (const key of ['homeBaseEnabled', 'baseBuildingEnabled', 'storageEnabled', 'resourceRunsEnabled']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

for (const key of ['smartMiningEnabled', 'farmingEnabled', 'animalPensEnabled']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

for (const key of ['explorationEnabled', 'mapMemoryEnabled', 'combatEnabled', 'allowDefensiveCombat']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

for (const key of ['longTermPlanningEnabled', 'allowPlannerToSuggestGoals', 'allowSemiAutonomousGoalProgress']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

for (const key of ['netherPrepEnabled', 'netherTravelImplemented', 'allowNetherEntry']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

for (const key of ['lifelikeDialogueEnabled', 'dialogueEnabled', 'conversationMemoryEnabled', 'typoToleranceEnabled', 'promptInjectionDefenseEnabled']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

if (config.ollamaModel === expectedModels.default) pass('default Ollama model is gemma2-2b-local');
else fail('default Ollama model is gemma2-2b-local', config.ollamaModel);
if (config.dialogueModel === expectedModels.dialogue) pass('dialogueModel is gemma2-2b-local');
else fail('dialogueModel is gemma2-2b-local', config.dialogueModel);
if (config.llmMode === 'dialogue' || config.llmMode === 'off' || config.llmMode === 'full') {
  pass(`llmMode=${config.llmMode}`);
} else {
  fail('llmMode should be dialogue|off|full', String(config.llmMode));
}
for (const [role, expectedModel] of Object.entries(expectedModels)) {
  if (config.models?.[role] === expectedModel) pass(`model role ${role}`, expectedModel);
  else fail(`model role ${role}`, config.models?.[role] || 'missing');
}

for (const key of ['allowAutonomousNetherEntry', 'allowNetherExploration', 'allowNetherMining', 'allowFortressSearch', 'allowBastionSearch']) {
  if (config[key] === false) pass(`${key}=false`);
  else fail(`${key}=false`, String(config[key]));
}

for (const key of ['requireConfirmationForNetherEntry', 'requireConfirmationForPortalLighting']) {
  if (config[key] === true) pass(`${key}=true`);
  else fail(`${key}=true`, String(config[key]));
}

if ((config.maxBaseBuildRadius || 0) <= 12) pass('maxBaseBuildRadius capped', String(config.maxBaseBuildRadius));
else fail('maxBaseBuildRadius capped', String(config.maxBaseBuildRadius));

try {
  const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/tags`);
  if (response.ok) {
    pass('Ollama reachable', config.ollamaUrl);
    if (configuredOllamaModelsDir) {
      fs.existsSync(configuredOllamaModelsDir)
        ? pass('OLLAMA_MODELS store exists', configuredOllamaModelsDir)
        : warn('OLLAMA_MODELS configured path is unavailable', configuredOllamaModelsDir);
    }
    const payload = await response.json();
    const names = (payload.models || []).map((model) => model.name);
    for (const modelName of new Set(Object.values(expectedModels))) {
      if (names.includes(modelName)) pass(`${modelName} exists in Ollama`);
      else if (ollamaManifestModels.has(modelName)) fail(`${modelName} exists in Ollama`, `present in OLLAMA_MODELS=${configuredOllamaModelsDir}, but active server reports: ${names.join(', ') || 'no models'}. Restart Ollama with that model store.`);
      else fail(`${modelName} exists in Ollama`, names.join(', ') || 'no models');
    }
  } else {
    fail('Ollama reachable', `HTTP ${response.status}`);
  }
} catch (error) {
  fail('Ollama reachable', error.message);
}

try {
  const result = await callOllama({
    config,
    role: 'fastFallback',
    messages: [{ role: 'user', content: 'Reply with ok.' }],
    options: { temperature: 0, numPredict: 8, timeoutMs: 30000, attempts: 1, disableFallback: true }
  });
  if (result.ok) pass('Ollama tiny prompt responds', result.model);
  else fail('Ollama tiny prompt responds', result.reason);
} catch (error) {
  fail('Ollama tiny prompt responds', error.message);
}

try {
  const result = await callOllama({
    config,
    role: 'fastFallback',
    messages: [{ role: 'user', content: 'Return schema JSON with intent none and no actions.' }],
    schema: ACTION_SCHEMA,
    json: true,
    options: { temperature: 0, numPredict: 120, timeoutMs: 30000, attempts: 1, disableFallback: true }
  });
  if (!result.ok) throw result.error || new Error(result.reason);
  pass('Ollama structured JSON response', result.model);
} catch (error) {
  fail('Ollama structured JSON response', error.message);
}

try {
  const { stdout } = await execFileAsync('ollama', ['list'], { timeout: 10000 });
  const listedModels = parseOllamaListNames(stdout);
  for (const modelName of new Set(Object.values(expectedModels))) {
    if (listedModels.includes(modelName)) pass(`ollama list contains ${modelName}`);
    else fail(`ollama list contains ${modelName}`, stdout);
  }
} catch (error) {
  fail('ollama list', error.message);
}

if (await tcpReachable(config.host, config.port)) pass('server reachable', `${config.host}:${config.port}`);
else warn('server is offline', `${config.host}:${config.port}`);

try {
  const raw = fs.readFileSync(memoryPath, 'utf8');
  JSON.parse(raw);
  fs.accessSync(memoryPath, fs.constants.R_OK);
  pass('memory.json readable', memoryPath.pathname);
} catch (error) {
  fail('memory.json readable/writable', error.message);
}

try {
  const raw = fs.readFileSync(mapMemoryPath, 'utf8');
  JSON.parse(raw);
  fs.accessSync(mapMemoryPath, fs.constants.R_OK);
  pass('map-memory.json readable', mapMemoryPath.pathname);
} catch (error) {
  fail('map-memory.json readable/writable', error.message);
}

try {
  const raw = fs.readFileSync(conversationMemoryPath, 'utf8');
  JSON.parse(raw);
  fs.accessSync(conversationMemoryPath, fs.constants.R_OK);
  pass('conversation-memory.json readable', conversationMemoryPath.pathname);
} catch (error) {
  fail('conversation-memory.json readable/writable', error.message);
}

try {
  const raw = fs.readFileSync(goalsPath, 'utf8');
  JSON.parse(raw);
  fs.accessSync(goalsPath, fs.constants.R_OK);
  pass('goals.json readable', goalsPath);
} catch (error) {
  fail('goals.json readable/writable', error.message);
}

try {
  const doctorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-doctor-'));
  const memory = createMemory(path.join(doctorDir, 'memory.json'));
  const actions = await createMockActions(memory);
  const commands = getCommands();
  if (commands.length) pass('command registry loads', `${commands.length} commands`);
  else fail('command registry loads', 'no commands');
  const commandValidation = validateCommandWiring(actions);
  commandValidation.ok ? pass('command registry valid') : fail('command registry valid', JSON.stringify(commandValidation.missing));
  const capabilityActions = validateCapabilitiesAgainstActions(actions);
  capabilityActions.ok ? pass('capabilities valid against actions') : fail('capabilities valid against actions', JSON.stringify(capabilityActions.missing));
  const capabilityModules = validateCapabilitiesAgainstModules();
  capabilityModules.ok ? pass('capabilities valid against modules') : fail('capabilities valid against modules', JSON.stringify(capabilityModules.missing));
} catch (error) {
  fail('command/action/capability registry', error.message);
}

try {
  const safetyAudit = runSafetyAudit(config);
  safetyAudit.ok ? pass('safety audit checks') : fail('safety audit checks', JSON.stringify(safetyAudit.checks.filter((check) => !check.ok)));
} catch (error) {
  fail('safety audit checks', error.message);
}

const stopCommand = getCommands().find((command) => command.name === 'stop');
if (stopCommand?.implemented) pass('emergency stop command registered');
else fail('emergency stop command registered');

const ownerOnlyProblems = getCommands().filter((command) => command.implemented && command.action !== 'help' && !command.ownerOnly);
if (ownerOnlyProblems.length === 0) pass('owner-only commands registered');
else fail('owner-only commands registered', ownerOnlyProblems.map((command) => command.name).join(', '));

const riskyProblems = getCommands().filter((command) => command.implemented && ['mine_diamond', 'light_portal', 'enter_nether', 'attack_player'].includes(command.name) && !command.requiresConfirmation);
if (riskyProblems.length === 0) pass('risky commands require confirmation');
else fail('risky commands require confirmation', riskyProblems.map((command) => command.name).join(', '));

try {
  const raw = fs.readFileSync(serverPropertiesPath, 'utf8');
  if (/^online-mode=false$/m.test(raw)) pass('server.properties online-mode=false');
  else fail('server.properties online-mode=false');
} catch (error) {
  fail('server.properties readable', error.message);
}

if (!process.env.OPENAI_API_KEY) pass('no OpenAI API key required');
else pass('OpenAI API key ignored', 'bot uses local Ollama only');

if (!process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) pass('no cloud API required');
else pass('cloud API keys ignored', 'bot uses local Ollama only');

for (const check of checks) {
  const label = check.warning ? 'WARN' : check.ok ? 'PASS' : 'FAIL';
  console.log(`${label} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
