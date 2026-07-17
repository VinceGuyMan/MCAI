import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  approveCurriculumSuggestion,
  approveCurriculumTrack,
  cancelCurriculum,
  clearActiveCurriculum,
  executeNextCurriculumStep,
  getActiveCurriculum,
  getCurriculumProgress,
  recordCurriculumStepResult
} from '../curriculumExecutor.js';
import { canCurriculumExecuteSkill } from '../curriculumGuard.js';
import { loadCurriculumMemory, saveCurriculumMemory, getExecutionHistory } from '../curriculumMemory.js';
import { cancelActiveSkill, isSkillRunning } from '../skillRunner.js';
import { saveSkillMemory } from '../skillMemory.js';

function resetSkillMemory() {
  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: [],
    evidenceStats: {}
  });
}

function resetCurriculumMemory() {
  saveCurriculumMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSuggestionAt: 0,
    lastSuggestions: [],
    dismissedSuggestions: [],
    acceptedSuggestions: [],
    activeCurriculum: null,
    curriculumSessions: [],
    trackHistory: [],
    executionHistory: [],
    ownerPreferences: { preferredTracks: [], dismissedTracks: [] }
  });
}

function mockBot(actionPatch = {}) {
  const actions = {
    executeAction: async (actionName) => ({
      ok: true,
      message: `${actionName} checked.`,
      evidence: [`${actionName}_reported`],
      data: { actionName }
    }),
    ...actionPatch
  };
  return {
    username: 'tj',
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      curriculumExecutionEnabled: true,
      allowCurriculumToRunSkills: true,
      allowAutonomousCurriculum: false,
      requireOwnerApprovalForCurriculumExecution: true,
      requireOwnerApprovalForEachCurriculumStep: true,
      curriculumExecutionRiskCeiling: 'low',
      maxCurriculumStepsPerApproval: 1,
      curriculumAllowOnlyRunnerEnabledSkills: true,
      curriculumAllowOnlyImplementedSkills: true,
      curriculumAllowNetherEntry: false,
      curriculumAllowCombat: false,
      curriculumAllowMiningExecution: false,
      curriculumAllowBuildingExecution: false,
      curriculumAllowExplorationTravel: false,
      curriculumAllowStorageMutation: false,
      pauseCurriculumWhenOwnerFar: false,
      maxCurriculumStepRuntimeMs: 10000
    },
    mcaiActions: actions,
    mcaiCancellation: { isCancelled: () => false, throwIfCancelled: () => {}, onCancel: () => () => {} },
    health: 20,
    food: 20,
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: {},
    game: { dimension: 'overworld' },
    inventory: { items: () => [{ name: 'cooked_beef', count: 6 }, { name: 'stone_pickaxe', count: 1 }] }
  };
}

function mockMemory(patch = {}) {
  const state = { homeBasePosition: { x: 0, y: 64, z: 0 }, knownStorageChests: [{ x: 1, y: 64, z: 1 }], ...patch };
  return {
    get: () => state,
    update: (updates) => Object.assign(state, updates)
  };
}

function evidenceNames(result) {
  return (result.evidence || []).map((item) => typeof item === 'string' ? item : item.name);
}

beforeEach(() => {
  resetSkillMemory();
  resetCurriculumMemory();
});

afterEach(() => {
  cancelActiveSkill('test cleanup');
  clearActiveCurriculum();
  resetSkillMemory();
  resetCurriculumMemory();
});

test('single-skill curriculum approval creates an active approved session', () => {
  const result = approveCurriculumSuggestion(mockBot(), mockMemory(), 'status', { sender: 'ModVinny' });
  assert.equal(result.ok, true);
  assert.equal(result.curriculum.type, 'single_skill');
  assert.equal(result.curriculum.steps[0].skillName, 'status');
  assert.equal(getActiveCurriculum().id, result.curriculum.id);
});

test('track curriculum approval creates approved steps and blocked future steps', () => {
  const result = approveCurriculumTrack(mockBot(), mockMemory(), 'mining readiness', { sender: 'ModVinny' });
  assert.equal(result.ok, true);
  assert.equal(result.curriculum.type, 'track');
  assert.ok(result.curriculum.steps.some((step) => step.skillName === 'mine_coal' && step.status === 'blocked'));
});

test('non-owner and unknown skill approval are rejected', () => {
  assert.equal(approveCurriculumSuggestion(mockBot(), mockMemory(), 'status', { sender: 'Alex', isOwner: false }).ok, false);
  assert.equal(approveCurriculumSuggestion(mockBot(), mockMemory(), 'not_a_skill', { sender: 'ModVinny' }).ok, false);
});

test('blocked action-heavy skills cannot execute through curriculum', () => {
  const bot = mockBot();
  const memory = mockMemory();
  for (const skillName of ['safe_nether_entry', 'light_portal', 'engage_hostile', 'mine_coal', 'build_camp', 'store_items', 'go_to_waypoint']) {
    assert.equal(canCurriculumExecuteSkill(bot, memory, skillName, { sender: 'ModVinny' }).ok, false, `${skillName} should be blocked`);
  }
});

test('approved skill executes through skillRunner and records evidence', async () => {
  const bot = mockBot();
  const memory = mockMemory();
  approveCurriculumSuggestion(bot, memory, 'status', { sender: 'ModVinny' });
  const result = await executeNextCurriculumStep(bot, memory, null, { sender: 'ModVinny', actions: bot.mcaiActions, force: true });
  assert.equal(result.ok, true);
  assert.equal(result.step.status, 'completed');
  assert.ok(evidenceNames(result).includes('status_reported'));
  assert.equal(isSkillRunning(), false);
  assert.ok(getExecutionHistory(5).some((entry) => entry.skillName === 'status'));
});

test('one curriculum step runs per command and then pauses', async () => {
  const bot = mockBot();
  const memory = mockMemory();
  approveCurriculumTrack(bot, memory, 'survival basics', { sender: 'ModVinny' });
  const first = await executeNextCurriculumStep(bot, memory, null, { sender: 'ModVinny', actions: bot.mcaiActions, force: true });
  assert.equal(first.ok, true);
  let progress = getCurriculumProgress(memory);
  assert.equal(progress.completed, 1);
  assert.equal(loadCurriculumMemory().activeCurriculum.status, 'paused');

  const second = await executeNextCurriculumStep(bot, memory, null, { sender: 'ModVinny', actions: bot.mcaiActions, force: true });
  assert.equal(second.ok, true);
  progress = getCurriculumProgress(memory);
  assert.equal(progress.completed, 2);
});

test('failed skill pauses curriculum', async () => {
  const bot = mockBot({
    executeAction: async () => ({ ok: false, reason: 'mock failure', evidence: ['action_result_failed'] })
  });
  const memory = mockMemory();
  approveCurriculumSuggestion(bot, memory, 'status', { sender: 'ModVinny' });
  const result = await executeNextCurriculumStep(bot, memory, null, { sender: 'ModVinny', actions: bot.mcaiActions, force: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /Paused/i);
  assert.equal(loadCurriculumMemory().activeCurriculum.status, 'paused');
});

test('partial evidence records partial step and pauses curriculum', () => {
  const approved = approveCurriculumSuggestion(mockBot(), mockMemory(), 'status', { sender: 'ModVinny' });
  const stepId = approved.curriculum.steps[0].id;
  const step = recordCurriculumStepResult(mockMemory(), approved.curriculum.id, stepId, {
    ok: true,
    resultStatus: 'partial',
    evidenceSummary: 'partial test',
    evidence: ['curriculum_step_partial']
  });
  assert.equal(step.status, 'partial');
});

test('cancel curriculum records cancellation and clears active session', () => {
  approveCurriculumSuggestion(mockBot(), mockMemory(), 'status', { sender: 'ModVinny' });
  const cancelled = cancelCurriculum(mockBot(), mockMemory(), 'test cancel');
  assert.equal(cancelled.ok, true);
  assert.equal(getActiveCurriculum(), null);
});

test('curriculum execution history is capped', () => {
  for (let i = 0; i < 120; i += 1) {
    const saved = loadCurriculumMemory();
    saved.executionHistory.push({ skillName: 'status', status: 'completed', completedAt: Date.now() + i });
    saveCurriculumMemory(saved);
  }
  assert.ok(loadCurriculumMemory().executionHistory.length <= 100);
});

test('curriculumExecutor does not import actions, Mineflayer, or Ollama directly', () => {
  // Resolve shim → systems/curriculum/curriculumExecutor.js
  let full = new URL('../curriculumExecutor.js', import.meta.url);
  let source = fs.readFileSync(full, 'utf8');
  const shim = source.match(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/);
  if (shim) {
    full = new URL(shim[1], full);
    source = fs.readFileSync(full, 'utf8');
  }
  assert.equal(/from\s+['"]\.\/actions\.js['"]/.test(source), false);
  assert.equal(/from\s+['"]\.\.\/\.\.\/actions\.js['"]/.test(source), false);
  assert.equal(/mineflayer/i.test(source), false);
  assert.equal(/ollama/i.test(source), false);
  assert.match(source, /runSkill\s*\(/);
});
