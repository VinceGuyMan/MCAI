import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCancellation } from '../cancellation.js';
import { runCoreMacro } from '../competentCore.js';
import { validateCoreMacros } from '../coreMacros.js';
import { routeCoreIntent } from '../coreIntentRouter.js';
import { suggestRecoveryCommands } from '../coreRecovery.js';
import { findCommandAlias } from '../commandRegistry.js';
import { routeNaturalCommand } from '../naturalCommandRouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

function createMemory(initial = {}) {
  let state = { ...initial };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
      return state;
    }
  };
}

function createBot(actions, extra = {}) {
  return {
    username: 'tj',
    mcaiConfig: { ownerUsername: 'ModVinny', botUsername: 'tj', competentCoreEnabled: true },
    mcaiActions: actions,
    mcaiCancellation: createCancellation(),
    inventory: { items: () => [] },
    players: {},
    entities: {},
    health: 20,
    food: 20,
    entity: { position: { distanceTo: () => 0 } },
    ...extra
  };
}

test('core intent maps common natural phrases to deterministic macros', async () => {
  const food = await routeCoreIntent(null, null, 'tj we need food', { config: { competentCoreEnabled: true } });
  assert.equal(food.macroName, 'get_food');
  assert.equal(food.mode, 'execute');

  const wood = await routeCoreIntent(null, null, 'tj get wood', { config: { competentCoreEnabled: true } });
  assert.equal(wood.macroName, 'gather_wood');

  const coal = await routeCoreIntent(null, null, 'tj find coal', { config: { competentCoreEnabled: true } });
  assert.equal(coal.macroName, 'mine_coal');
});

test('vague safety request asks for clarification instead of picking a risky task', async () => {
  const route = await routeCoreIntent(null, null, 'tj make us safe', { config: { competentCoreEnabled: true } });
  assert.equal(route.mode, 'clarify');
  assert.equal(route.canonicalCommand, null);
  assert.ok(route.alternatives.length >= 2);
});

test('natural router prioritizes competent core before broad natural mappings', async () => {
  const bot = createBot({});
  const memory = createMemory({ learnNaturalCommands: true });
  const route = await routeNaturalCommand(bot, memory, {
    sender: 'ModVinny',
    rawText: 'tj lets get ready for mining',
    isOwner: true,
    dryRun: true,
    config: bot.mcaiConfig
  });
  assert.equal(route.source, 'competent_core');
  assert.equal(route.canonicalCommand, 'tj run core prepare for mining');
});

test('core macro rejects non-owner and unsupported macro requests', async () => {
  const actions = { executeAction: async () => ({ ok: true, message: 'ok', evidence: ['status_reported'], data: {} }) };
  const bot = createBot(actions);
  const memory = createMemory();

  const nonOwner = await runCoreMacro(bot, memory, 'status_check', {}, { sender: 'Steve', actions });
  assert.equal(nonOwner.ok, false);
  assert.match(nonOwner.reason, /Only ModVinny/);

  const unsupported = await runCoreMacro(bot, memory, 'fly_to_diamonds', {}, { sender: 'ModVinny', actions });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.reason, /Unsupported/);
});

test('core macro checks cancellation before running work', async () => {
  const actions = { executeAction: async () => ({ ok: true, message: 'ok', evidence: ['status_reported'], data: {} }) };
  const cancellation = createCancellation();
  cancellation.cancelAll('test stop');
  const bot = createBot(actions, { mcaiCancellation: cancellation });
  const result = await runCoreMacro(bot, createMemory(), 'status_check', {}, { sender: 'ModVinny', actions, cancellation });
  assert.equal(result.ok, false);
  assert.match(result.reason, /cancellation is active/i);
});

test('core macro returns standard result and combines evidence', async () => {
  const calls = [];
  const actions = {
    executeAction: async (name, args, context) => {
      calls.push({ name, args, context });
      return { ok: true, message: `${name} ok`, evidence: ['status_reported'], data: {} };
    }
  };
  const result = await runCoreMacro(createBot(actions), createMemory(), 'status_check', {}, { sender: 'ModVinny', actions });
  assert.equal(result.ok, true);
  assert.equal(result.message, 'status check complete.');
  assert.deepEqual(calls.map((call) => call.name), ['thin_status']);
  assert.ok(result.evidence.includes('status_reported'));
  assert.equal(typeof result.data.durationMs, 'number');
});

test('recovery suggestions only return registered commands', () => {
  const suggestions = suggestRecoveryCommands({ reason: 'I need a usable pickaxe first.' });
  assert.ok(suggestions.length);
  for (const command of suggestions) assert.ok(findCommandAlias(command), `${command} should be registered`);
});

test('core macros validate and do not call Ollama for step execution', () => {
  const validation = validateCoreMacros();
  assert.equal(validation.ok, true, validation.problems.join('\n'));

  for (const file of ['competentCore.js', 'coreMacros.js', 'coreObservation.js', 'coreRecovery.js']) {
    const source = fs.readFileSync(path.join(botDir, file), 'utf8');
    assert.doesNotMatch(source, /callOllama|ollama\.js|\/api\/chat/i, `${file} should not call an LLM`);
  }
});
