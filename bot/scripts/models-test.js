import { loadConfig } from '../configSchema.js';
import { callOllama, extractJsonObject, resolveModelRole } from '../ollama.js';

const config = loadConfig();
const checks = [];
const JSON_TEST_TIMEOUT_MS = 120000;
const TEXT_TEST_TIMEOUT_MS = 120000;
const FALLBACK_TEST_TIMEOUT_MS = 30000;

function pass(name, detail = '') {
  const check = { ok: true, name, detail };
  checks.push(check);
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail = '') {
  const check = { ok: false, name, detail };
  checks.push(check);
  console.log(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOllamaWithScriptTimeout(request, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      callOllama(request),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          resolve({
            ok: false,
            reason: `${label} did not return within ${timeoutMs}ms`,
            content: '',
            json: null,
            role: request.role,
            requestedRole: request.role,
            model: request.options?.model || null,
            error: null
          });
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const tinySchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    label: { type: 'string' }
  },
  required: ['ok', 'label'],
  additionalProperties: false
};

async function testJsonRole(role, expectedModel, prompt) {
  console.log(`Testing ${role} on ${expectedModel}...`);
  const result = await callOllamaWithScriptTimeout({
    config,
    role,
    messages: [
      { role: 'system', content: 'Return only valid JSON matching the schema.' },
      { role: 'user', content: prompt }
    ],
    schema: tinySchema,
    json: true,
    options: { numPredict: 32, timeoutMs: JSON_TEST_TIMEOUT_MS, attempts: 1, disableFallback: true, keepAlive: '0s' }
  }, JSON_TEST_TIMEOUT_MS + 5000, `${role} JSON schema`);
  if (result.ok && result.model === expectedModel && result.json?.ok === true) pass(`${role} JSON schema`, result.model);
  else fail(`${role} JSON schema`, result.reason || `model=${result.model} json=${JSON.stringify(result.json)}`);
}

await testJsonRole('commandRouter', 'qwen3:14b', 'Return {"ok":true,"label":"commandRouter"}');
await testJsonRole('planner', 'qwen3:14b', 'Return {"ok":true,"label":"planner"}');
await wait(3000);
await testJsonRole('codingStructured', 'qwen2.5-coder:14b', 'Return {"ok":true,"label":"codingStructured"}');
await wait(3000);

{
  console.log('Testing dialogue on mistral-nemo:12b...');
  const result = await callOllamaWithScriptTimeout({
    config,
    role: 'dialogue',
    messages: [
      { role: 'system', content: 'Reply in one short natural sentence. Do not mention tools.' },
      { role: 'user', content: 'Say hello to ModVinny.' }
    ],
    options: { numPredict: 32, timeoutMs: TEXT_TEST_TIMEOUT_MS, attempts: 1, disableFallback: true, keepAlive: '0s' }
  }, TEXT_TEST_TIMEOUT_MS + 5000, 'dialogue natural reply');
  if (result.ok && result.model === 'mistral-nemo:12b' && result.content.trim()) pass('dialogue natural reply', result.model);
  else fail('dialogue natural reply', result.reason || `model=${result.model}`);
}

{
  console.log('Testing fastFallback on phi4-mini:latest...');
  const result = await callOllamaWithScriptTimeout({
    config,
    role: 'fastFallback',
    messages: [{ role: 'user', content: 'Reply with ok.' }],
    options: { numPredict: 12, timeoutMs: FALLBACK_TEST_TIMEOUT_MS, attempts: 1, disableFallback: true, keepAlive: '0s' }
  }, FALLBACK_TEST_TIMEOUT_MS + 5000, 'fastFallback model');
  if (result.ok && result.model === 'phi4-mini:latest') pass('fastFallback model', result.model);
  else fail('fastFallback model', result.reason || `model=${result.model}`);
}

{
  console.log('Testing missing-model fallback simulation...');
  const result = await callOllamaWithScriptTimeout({
    config,
    role: 'codingStructured',
    messages: [{ role: 'user', content: 'Reply with ok.' }],
    options: { model: 'missing-local-model:latest', numPredict: 12, timeoutMs: FALLBACK_TEST_TIMEOUT_MS, attempts: 1, keepAlive: '0s' }
  }, FALLBACK_TEST_TIMEOUT_MS + 5000, 'missing model fallback simulation');
  if (result.ok && result.model === 'phi4-mini:latest') pass('missing model fallback simulation', result.model);
  else fail('missing model fallback simulation', result.reason || `model=${result.model}`);
}

try {
  extractJsonObject('this is not json');
  fail('invalid JSON recovery parser', 'unexpectedly parsed invalid text');
} catch (error) {
  pass('invalid JSON recovery parser', error.message);
}

{
  const resolved = resolveModelRole({ ...config, models: { ...config.models, commandRouter: '' } }, 'commandRouter');
  if (resolved.model === config.models.default) pass('missing role falls back to default', resolved.model);
  else fail('missing role falls back to default', resolved.model);
}

const exitCode = checks.some((check) => !check.ok) ? 1 : 0;
process.exitCode = exitCode;

// Some local Ollama/undici calls can leave sockets alive after a hard timeout.
// Exit deliberately after printing checks so this diagnostic script never hangs.
setTimeout(() => process.exit(exitCode), 25);
