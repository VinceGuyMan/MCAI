import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCancellation } from '../cancellation.js';
import {
  cancelActiveSkill,
  canRunSkill,
  getSkillRunStatus,
  isSkillRunning,
  runSkill
} from '../skillRunner.js';
import { getRecentSkillRuns, getSkillStats, saveSkillMemory } from '../skillMemory.js';

function resetSkillMemory() {
  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: []
  });
}

function mockBot() {
  return {
    username: 'tj',
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      allowPvp: false,
      allowDiamondMining: false,
      allowDeepMining: false,
      allowCaving: false,
      allowCaveExploration: false,
      allowNetherExploration: false,
      allowNetherMining: false,
      allowFortressSearch: false,
      allowBastionSearch: false
    },
    game: { dimension: 'overworld' },
    players: {},
    inventory: { items: () => [] }
  };
}

function mockMemory(patch = {}) {
  return { get: () => patch };
}

function mockActions(patch = {}) {
  return {
    hasAction: (name) => ['status', 'inventory_summary', 'home_status', 'mining_status', 'farming_status', 'nether_checklist', 'skills_status'].includes(name),
    executeAction: async (actionName) => ({
      ok: true,
      message: `${actionName} checked.`,
      evidence: [`${actionName}_reported`],
      data: { actionName }
    }),
    ...patch
  };
}

function evidenceNames(result) {
  return (result.evidence || []).map((item) => typeof item === 'string' ? item : item.name);
}

beforeEach(() => resetSkillMemory());
afterEach(() => {
  cancelActiveSkill('test cleanup');
  resetSkillMemory();
});

test('runSkill rejects unknown, unimplemented, non-allowlisted, and non-owner runs', async () => {
  const bot = mockBot();
  const memory = mockMemory();
  const context = { sender: 'ModVinny', actions: mockActions(), force: true };

  assert.equal((await runSkill(bot, memory, 'does_not_exist', {}, context)).ok, false);
  assert.equal((await runSkill(bot, memory, 'mine_diamond', {}, context)).ok, false);
  assert.equal((await runSkill(bot, memory, 'mine_coal', {}, context)).ok, false);
  assert.equal((await runSkill(bot, memory, 'status', {}, { ...context, sender: 'NotModVinny' })).ok, false);
});

test('runSkill validates cooldown through canRunSkill', async () => {
  const bot = mockBot();
  const memory = mockMemory();
  const context = { sender: 'ModVinny', actions: mockActions() };

  const first = await runSkill(bot, memory, 'status', {}, context);
  assert.equal(first.ok, true);
  const second = canRunSkill(bot, memory, 'status', {}, context);
  assert.equal(second.ok, false);
  assert.match(second.reason, /cooldown/i);
});

test('runSkill records success and normalizes action result', async () => {
  const result = await runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    actions: mockActions(),
    force: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.skillName, 'status');
  assert.equal(result.action, 'status');
  assert.ok(evidenceNames(result).includes('skill_started'));
  assert.ok(evidenceNames(result).includes('skill_completed'));
  const stats = getSkillStats('status');
  assert.equal(stats.successCount, 1);
  const recent = getRecentSkillRuns(5).filter((run) => run.skillName === 'status');
  assert.equal(recent.length, 1);
  assert.equal(recent[0].ok, true);
  assert.equal(recent[0].resultStatus, 'success');
  assert.ok(recent[0].durationMs >= 0);
});

test('runSkill records failure and catches action errors', async () => {
  const result = await runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    actions: mockActions({
      executeAction: async () => {
        throw new Error('boom');
      }
    }),
    force: true
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /boom/);
  const stats = getSkillStats('status');
  assert.equal(stats.failureCount, 1);
});

test('active skill status and cancellation clear active state', async () => {
  const cancellation = createCancellation();
  const promise = runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    cancellation,
    actions: mockActions({
      executeAction: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { ok: true, message: 'slow status', evidence: ['status_reported'] };
      }
    }),
    force: true
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(isSkillRunning(), true);
  assert.equal(getSkillRunStatus().running, true);
  const cancelled = cancelActiveSkill('test cancel');
  assert.equal(cancelled.ok, true);
  assert.equal(isSkillRunning(), false);

  const result = await promise;
  assert.equal(result.ok, false);
  assert.match(result.reason, /cancelled/);
  assert.ok(evidenceNames(result).includes('skill_cancelled'));
});
