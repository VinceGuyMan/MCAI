import { loadConfig } from '../configSchema.js';
import { DIALOGUE_SCHEMA, parseDialogueModelOutput } from '../responseGenerator.js';
import { ACTION_SCHEMA, callOllama } from '../ollama.js';

const config = loadConfig();
const checks = [];

function pass(name, detail = '') {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = '') {
  checks.push({ ok: false, name, detail });
}

try {
  const tags = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/tags`);
  if (!tags.ok) throw new Error(`HTTP ${tags.status}`);
  const payload = await tags.json();
  const names = (payload.models || []).map((model) => model.name);
  for (const modelName of new Set(Object.values(config.models || { default: config.ollamaModel }))) {
    names.includes(modelName) ? pass(`model installed ${modelName}`) : fail(`model installed ${modelName}`, names.join(', '));
  }
} catch (error) {
  fail('Ollama reachable', error.message);
}

try {
  const result = await callOllama({
    config,
    role: 'planner',
    messages: [{ role: 'user', content: 'Return a JSON action plan with no actions.' }],
    schema: ACTION_SCHEMA,
    json: true,
    options: { temperature: 0, numPredict: 120 }
  });
  if (!result.ok) throw result.error || new Error(result.reason);
  pass('action schema response', result.model);
} catch (error) {
  fail('action schema response', error.message);
}

try {
  const result = await callOllama({
    config,
    role: 'dialogue',
    messages: [{ role: 'user', content: 'Say hello as schema JSON.' }],
    schema: DIALOGUE_SCHEMA,
    json: true,
    options: { temperature: 0.2, numPredict: 120 }
  });
  if (!result.ok) throw result.error || new Error(result.reason);
  parseDialogueModelOutput(result.content || '{}');
  pass('dialogue schema response', result.model);
} catch (error) {
  fail('dialogue schema response', error.message);
}

try {
  const result = await callOllama({
    config,
    role: 'planner',
    messages: [{ role: 'user', content: 'slow test' }],
    options: { temperature: 0, numPredict: 10, timeoutMs: 1 }
  });
  if (result.ok) fail('timeout handling', 'request unexpectedly completed');
  else pass('timeout handling');
} catch {
  pass('timeout handling');
}

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
