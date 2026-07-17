import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findLearnedCommandMapping,
  forgetCommandMapping,
  rememberCommandMapping
} from '../commandLearningMemory.js';
import { routeNaturalCommand } from '../naturalCommandRouter.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-learning-'));
process.env.MCAI_COMMAND_LEARNING_MEMORY = path.join(tempDir, 'command-learning-memory.json');
process.env.MCAI_SESSION_LOG = path.join(tempDir, 'session-log.jsonl');

function memory(initial = {}) {
  let state = {
    learnNaturalCommands: true,
    pendingNaturalCommandIntent: null,
    ...initial
  };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
    }
  };
}

function bot(config = {}) {
  return {
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      botUsername: 'tj',
      naturalCommandRouterEnabled: true,
      learnNaturalCommands: true,
      sessionRecorderEnabled: false,
      ...config
    }
  };
}

test('learned mapping is used after owner approval', async () => {
  forgetCommandMapping('make us safer');
  const saved = rememberCommandMapping('make us safer', 'tj light home', {
    isOwner: true,
    approvedByOwner: true,
    confirmed: true
  });
  assert.equal(saved.ok, true);

  const route = await routeNaturalCommand(bot(), memory(), {
    rawText: 'tj make us safer',
    isOwner: true
  });
  assert.equal(route.mode, 'execute');
  assert.equal(route.canonicalCommand, 'tj light home');
  assert.equal(route.source, 'learned_mapping');
});

test('clarification answer stores a learned mapping', async () => {
  forgetCommandMapping('tj make us safe');
  const store = memory();
  const first = await routeNaturalCommand(bot(), store, {
    rawText: 'tj make us safe',
    isOwner: true
  });
  assert.equal(first.mode, 'clarify');
  assert.ok(store.get().pendingNaturalCommandIntent);

  const second = await routeNaturalCommand(bot(), store, {
    rawText: 'light home',
    isOwner: true
  });
  assert.equal(second.mode, 'execute');
  assert.equal(second.canonicalCommand, 'tj light home');

  const learned = findLearnedCommandMapping('tj make us safe');
  assert.equal(learned.canonicalCommand, 'tj light home');
});

test('non-owner and unsupported mappings are rejected', () => {
  assert.equal(rememberCommandMapping('do wild thing', 'tj light home', { isOwner: false }).ok, false);
  assert.equal(rememberCommandMapping('do wild thing', 'tj made up command', { isOwner: true }).ok, false);
});

test('risky mappings require confirmation', () => {
  const result = rememberCommandMapping('fix this with book', 'tj apply book to item', {
    isOwner: true,
    approvedByOwner: true
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /confirmation/i);

  const confirmed = rememberCommandMapping('fix this with book', 'tj apply book to item', {
    isOwner: true,
    approvedByOwner: true,
    confirmed: true
  });
  assert.equal(confirmed.ok, true);
});

