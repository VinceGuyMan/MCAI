import assert from 'node:assert/strict';
import { createCancellation } from '../cancellation.js';
import { createActions } from '../actions.js';
import { getSkill } from '../skillRegistry.js';
import { saveSkillMemory, recordSkillFailure, recordSkillSuccess, getSkillStats } from '../skillMemory.js';
import {
  canRunSkill,
  listRunnableSkills,
  runSkill
} from '../skillRunner.js';

function makeMemory(initial = {}) {
  let state = { ...initial };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
      return state;
    }
  };
}

function makeBot() {
  return {
    username: 'tj',
    mcaiConfig: { ownerUsername: 'ModVinny' },
    entity: { position: { x: 0, y: 64, z: 0 } },
    health: 20,
    food: 20,
    game: { dimension: 'overworld' },
    players: {},
    inventory: { items: () => [] },
    chat: () => {},
    pathfinder: { setGoal: () => {} },
    clearControlStates: () => {},
    stopDigging: () => {},
    deactivateItem: () => {}
  };
}

function makePerception() {
  return {
    health: 20,
    food: 20,
    armorScore: 0,
    position: { x: 0, y: 64, z: 0 },
    ownerDistance: null,
    currentTask: null,
    nearbyPlayers: [],
    nearbyHostileMobs: []
  };
}

async function main() {
  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: []
  });

  const bot = makeBot();
  const memory = makeMemory();
  const cancellation = createCancellation();
  const actions = await createActions(bot, bot.mcaiConfig, {
    memory,
    taskQueue: { clearTask: () => {} },
    safety: {},
    perception: makePerception,
    cancellation
  });

  assert.equal(typeof actions.executeAction, 'function', 'actions.js must expose executeAction');
  assert.equal(typeof actions.hasAction, 'function', 'actions.js must expose hasAction');
  assert.equal(typeof actions.listActions, 'function', 'actions.js must expose listActions');

  for (const skillName of ['status', 'inventory_summary', 'home_status', 'mining_status', 'farming_status', 'nether_checklist', 'skills_status']) {
    const skill = getSkill(skillName);
    assert.ok(skill, `${skillName} must exist`);
    assert.equal(skill.implemented, true, `${skillName} must be implemented`);
    assert.equal(actions.hasAction(skill.action), true, `${skillName} action ${skill.action} must be wired`);
  }

  assert.ok(listRunnableSkills().includes('status'), 'status should be runnable');
  assert.equal(canRunSkill(bot, memory, 'does_not_exist', {}, { sender: 'ModVinny' }).ok, false, 'unknown skill should not run');
  assert.equal(canRunSkill(bot, memory, 'mine_diamond', {}, { sender: 'ModVinny' }).ok, false, 'unimplemented skill should not run');
  assert.equal(canRunSkill(bot, memory, 'mine_coal', {}, { sender: 'ModVinny' }).ok, false, 'non-allowlisted skill should not run');
  assert.equal(canRunSkill(bot, memory, 'light_portal', {}, { sender: 'ModVinny' }).ok, false, 'risky skill should require confirmation and be non-allowlisted');
  assert.equal(canRunSkill(bot, memory, 'status', {}, { sender: 'SomeoneElse' }).ok, false, 'non-owner should not run owner-only skills');

  const result = await runSkill(bot, memory, 'status', {}, { sender: 'ModVinny', actions, cancellation, force: true });
  assert.equal(result.ok, true, result.reason || result.message);
  assert.ok(result.evidence.map((item) => typeof item === 'string' ? item : item.name).includes('skill_completed'), 'success evidence should include skill_completed');

  recordSkillSuccess('status', ['mock_success'], 1, 'mock success');
  recordSkillFailure('status', 'mock failure', 1);
  const stats = getSkillStats('status');
  assert.ok(stats.successCount >= 1, 'skill memory should record success');
  assert.ok(stats.failureCount >= 1, 'skill memory should record failure');

  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: [],
    evidenceStats: {}
  });

  console.log('skill-runner-test passed');
}

main().catch((error) => {
  console.error(`skill-runner-test failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
