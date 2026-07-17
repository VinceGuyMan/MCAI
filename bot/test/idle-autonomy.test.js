import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateActionRequest } from '../actionGate.js';
import {
  getIdleDurationMs,
  isTjIdle,
  resetIdleTimer,
  shouldRunIdleAutonomy,
  suppressLastIdleSuggestion
} from '../idleAutonomy.js';
import {
  chooseIdleBehavior,
  filterRecentlyRepeatedBehaviors,
  filterUnsafeIdleBehaviors
} from '../idleDecision.js';
import { loadIdleMemory, recordIdleBehavior, recordIdleSuggestion } from '../idleMemory.js';

const config = {
  ownerUsername: 'ModVinny',
  idleAutonomyEnabled: true,
  idleAutonomyDelayMs: 100000,
  idleAutonomyGlobalCooldownMs: 60000,
  idleAutonomyChatCooldownMs: 120000,
  idleAutonomySuggestionCooldownMs: 180000,
  idleAutonomyRepeatSuppressionMs: 900000,
  idleAutonomyMaxSameSuggestionPerHour: 1,
  idleAutonomyAllowedSkills: ['status', 'food_status', 'home_status', 'skills_status'],
  idleAutonomyBlockedActions: ['mine_stone', 'build_shelter', 'execute_trade', 'enter_nether', 'attack'],
  idleAutonomyAllowWorldMutation: false,
  idleAutonomyAllowInventoryMutation: false,
  idleAutonomyAllowSkillRunner: true
};

function tempIdleFile(name) {
  return path.join(os.tmpdir(), `mcai-idle-${process.pid}-${name}.json`);
}

function withIdleFile(name) {
  const file = tempIdleFile(name);
  fs.rmSync(file, { force: true });
  process.env.MCAI_IDLE_MEMORY_FILE = file;
  return file;
}

function mockMemory(seed = {}) {
  const state = { ...seed };
  return {
    get: () => state,
    update: (patch) => Object.assign(state, patch)
  };
}

function mockBot() {
  return {
    entity: { position: { x: 0, y: 64, z: 0 } },
    mcaiConfig: config,
    mcaiCancellation: { isCancelled: () => false }
  };
}

test('idle autonomy waits for the configured idle delay', () => {
  withIdleFile('delay');
  const memory = mockMemory({ lastIdleResetAt: Date.now() - 50000 });
  assert.equal(shouldRunIdleAutonomy(mockBot(), memory, { config, state: {} }), false);
});

test('idle autonomy can run after true idle delay', () => {
  withIdleFile('ready');
  const memory = mockMemory({ lastIdleResetAt: Date.now() - 101000 });
  assert.equal(shouldRunIdleAutonomy(mockBot(), memory, { config, state: {} }), true);
});

test('active tasks and pending confirmations block idle autonomy', () => {
  withIdleFile('blocked');
  const activeTaskMemory = mockMemory({ lastIdleResetAt: Date.now() - 101000, currentTask: { name: 'mine' } });
  assert.equal(isTjIdle(mockBot(), activeTaskMemory, { config, state: {} }), false);

  const pendingMemory = mockMemory({
    lastIdleResetAt: Date.now() - 101000,
    pendingNaturalCommandIntent: { canonicalCommand: 'tj get food', expiresAt: Date.now() + 30000 }
  });
  assert.equal(isTjIdle(mockBot(), pendingMemory, { config, state: {} }), false);
});

test('danger selects a safety warning behavior', () => {
  const decision = chooseIdleBehavior(mockBot(), mockMemory(), {
    config,
    state: { dangerFlags: { hostileNearby: true } },
    idleMemory: loadIdleMemory(withIdleFile('danger'))
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.type, 'safety_scan');
});

test('repeated suggestions and ambient comments are suppressed by cooldowns', () => {
  const recentAt = Date.now();
  const candidates = [{ type: 'food_check', key: 'low_food', priority: 10, riskLevel: 'low' }];
  const idleMemory = {
    recentSuggestions: [{ key: 'low_food', at: recentAt }],
    recentBehaviors: [],
    suppressedSuggestions: {},
    lastAmbientCommentAt: 0,
    lastHelpfulSuggestionAt: 0
  };
  assert.equal(filterRecentlyRepeatedBehaviors(candidates, idleMemory, { config }).length, 0);

  const ambient = [{ type: 'ambient_comment', key: 'ambient_watch', priority: 1, riskLevel: 'low' }];
  assert.equal(filterRecentlyRepeatedBehaviors(ambient, { ...idleMemory, lastAmbientCommentAt: recentAt }, { config }).length, 0);
});

test('persistent danger warnings obey the danger warning cooldown', () => {
  const recentAt = Date.now();
  const candidates = [{ type: 'safety_scan', key: 'danger_nearby', priority: 100, riskLevel: 'low' }];
  const idleMemory = {
    recentSuggestions: [],
    recentBehaviors: [],
    suppressedSuggestions: {},
    lastSafetyWarningAt: recentAt,
    lastAmbientCommentAt: 0,
    lastHelpfulSuggestionAt: 0
  };
  const dangerConfig = {
    ...config,
    idleAutonomyDangerOverridesCooldown: true,
    idleAutonomyDangerWarningCooldownMs: 60000
  };

  assert.equal(filterRecentlyRepeatedBehaviors(candidates, idleMemory, { config: dangerConfig }).length, 0);
  assert.equal(
    filterRecentlyRepeatedBehaviors(candidates, { ...idleMemory, lastSafetyWarningAt: recentAt - 61000 }, { config: dangerConfig }).length,
    1
  );
});

test('idle behaviors only allow configured low-risk status skills', () => {
  const safe = filterUnsafeIdleBehaviors([{ type: 'status_check', key: 'status', riskLevel: 'low', skillName: 'status' }], { config });
  assert.equal(safe.length, 1);
  const unsafe = filterUnsafeIdleBehaviors([{ type: 'mine', key: 'mine', riskLevel: 'low', skillName: 'mine_stone', mutatesWorld: true }], { config });
  assert.equal(unsafe.length, 0);
});

test('idle source cannot run mutating actions through actionGate', () => {
  const result = validateActionRequest('mine_stone', {}, {
    source: 'idleAutonomy',
    allowOnlyLowRisk: true,
    config,
    sender: 'ModVinny',
    actionApi: { mine_stone: () => ({ ok: true }) }
  });
  assert.equal(result.ok, false);
});

test('owner activity resets idle timer', () => {
  const memory = mockMemory({ lastIdleResetAt: 0 });
  resetIdleTimer(memory, 'test');
  assert.ok(getIdleDurationMs(memory) < 1000);
});

test('idle off disables behavior', () => {
  withIdleFile('off');
  const memory = mockMemory({ idleAutonomyEnabled: false, lastIdleResetAt: Date.now() - 101000 });
  assert.equal(shouldRunIdleAutonomy(mockBot(), memory, { config, state: {} }), false);
});

test("owner can suppress the last idle suggestion", () => {
  const file = withIdleFile('suppress');
  recordIdleBehavior({ type: 'food_check', key: 'low_food', text: 'Food low.' }, file);
  recordIdleSuggestion('low_food', 'Food low.', file);
  const result = suppressLastIdleSuggestion('test');
  assert.equal(result.ok, true);
  const memory = loadIdleMemory(file);
  assert.ok(memory.suppressedSuggestions.low_food);
});
