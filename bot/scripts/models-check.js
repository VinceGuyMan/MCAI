import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../configSchema.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const envFile = readDotEnv(path.resolve(__dirname, '..', '.env'));
const configuredModelDir = String(process.env.OLLAMA_MODELS || envFile.OLLAMA_MODELS || '').trim();
const fallbackModel = 'phi4-mini:latest';
const criticalRoles = new Set(['default', 'commandRouter', 'planner', 'fastFallback', 'legacyFallback']);
const roleModels = {
  default: config.models?.default || config.ollamaModel || 'qwen3:14b',
  commandRouter: config.models?.commandRouter || config.models?.default || 'qwen3:14b',
  planner: config.models?.planner || config.models?.default || 'qwen3:14b',
  dialogue: config.models?.dialogue || 'mistral-nemo:12b',
  codingStructured: config.models?.codingStructured || 'qwen2.5-coder:14b',
  codingHeavy: config.models?.codingHeavy || 'qwen2.5-coder:14b',
  fastFallback: config.models?.fastFallback || fallbackModel,
  legacyFallback: config.models?.legacyFallback || fallbackModel
};

function readDotEnv(filePath) {
  const values = {};
  try {
    const text = fs.readFileSync(filePath, 'utf8');
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
    // Missing .env is fine; config and process env still drive the check.
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

function parseOllamaList(stdout) {
  return new Set(String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => name && name !== 'NAME'));
}

async function getInstalledFromApi() {
  const baseUrl = String(config.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return {
      source: `${baseUrl}/api/tags`,
      installed: new Set((payload.models || []).map((model) => model.name).filter(Boolean))
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getInstalledFromCli() {
  const { stdout } = await execFileAsync('ollama', ['list'], { timeout: 15000 });
  return { source: 'ollama list', installed: parseOllamaList(stdout) };
}

let installed = new Set();
let source = 'unknown';
let listError = null;
const manifestInstalled = getManifestModels(configuredModelDir);

try {
  ({ installed, source } = await getInstalledFromApi());
} catch (apiError) {
  try {
    ({ installed, source } = await getInstalledFromCli());
  } catch (cliError) {
    listError = new Error(`API: ${apiError.message}; CLI: ${cliError.message}`);
  }
}

if (listError) {
  console.log(`Could not read Ollama models: ${listError.message}`);
} else {
  console.log(`Ollama models found via ${source}:`);
  for (const name of installed) console.log(`- ${name}`);
}

if (configuredModelDir) {
  console.log(`\nConfigured OLLAMA_MODELS store: ${configuredModelDir}`);
  if (!fs.existsSync(configuredModelDir)) {
    console.log('WARN configured OLLAMA_MODELS path does not exist.');
  } else if (manifestInstalled.size === 0) {
    console.log('WARN no Ollama manifests were found in the configured model store.');
  } else {
    console.log('Models present in configured model store manifests:');
    for (const name of manifestInstalled) console.log(`- ${name}`);
  }
}

const rolesByModel = new Map();
for (const [role, model] of Object.entries(roleModels)) {
  if (!rolesByModel.has(model)) rolesByModel.set(model, []);
  rolesByModel.get(model).push(role);
}

let failed = Boolean(listError && installed.size === 0);
console.log('\nConfigured local model roles:');
for (const [model, roles] of rolesByModel.entries()) {
  const ok = installed.has(model);
  const inConfiguredStore = manifestInstalled.has(model);
  const critical = roles.some((role) => criticalRoles.has(role));
  const label = ok ? 'PASS' : critical ? 'FAIL' : 'WARN';
  const suffix = ok
    ? ''
    : inConfiguredStore
      ? ' is present on disk but not visible to the running Ollama server'
      : ' is missing';
  console.log(`${label} ${model} (${roles.join(', ')})${suffix}`);
  if (!ok) {
    if (inConfiguredStore) {
      console.log(`  Restart Ollama with OLLAMA_MODELS=${configuredModelDir}`);
    } else {
      console.log(`  Install with: ollama pull ${model}`);
    }
    if (critical) failed = true;
  }
}

if (!installed.has(roleModels.fastFallback) && !installed.has(roleModels.legacyFallback)) {
  console.log(`FAIL no configured fallback model is installed; expected ${roleModels.fastFallback} or ${roleModels.legacyFallback}`);
  failed = true;
}

process.exitCode = failed ? 1 : 0;
