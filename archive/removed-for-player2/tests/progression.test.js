import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProgressionMilestones, validateMilestoneDefinitions } from '../progressionRegistry.js';
import { validateProgressionEvidenceNames } from '../progressionEvidence.js';
import { calculateProgressionPercent, checkMilestone } from '../progressionTracker.js';
import { rankMilestones } from '../progressionAdvisor.js';
import { getNextMilestoneInPath } from '../progressionPaths.js';
import { createPlanForMilestone } from '../progressionPlanner.js';
import { loadProgressionState, resetProgressionState, saveProgressionState } from '../progressionState.js';
import { getVanillaAdvancementStatus, vanillaAdvancementTrackingAvailable } from '../vanillaAdvancementBridge.js';

const mockBot = {
  username: 'tj',
  entity: { position: { x: 0, y: 64, z: 0 } },
  health: 20,
  food: 20,
  game: { dimension: 'overworld' },
  inventory: {
    items: () => [
      { name: 'bread', count: 8 },
      { name: 'oak_log', count: 16 },
      { name: 'stone_pickaxe', count: 1 },
      { name: 'torch', count: 16 }
    ],
    slots: []
  }
};

test('progression milestone registry validates', () => {
  const result = validateMilestoneDefinitions();
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('milestone IDs are unique', () => {
  const ids = getProgressionMilestones().map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('progression evidence names validate', () => {
  const result = validateProgressionEvidenceNames(getProgressionMilestones());
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('progression state loads and saves safely to a temp file', () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-progression-')), 'progression-memory.json');
  const state = loadProgressionState(filePath);
  state.completedMilestones.connect_bot = { id: 'connect_bot', completedAt: Date.now(), evidence: [], notes: '', completedBy: 'test' };
  saveProgressionState(state, filePath);
  const reloaded = loadProgressionState(filePath);
  assert.ok(reloaded.completedMilestones.connect_bot);
});

test('progression percent calculates from custom state', () => {
  const registry = getProgressionMilestones().slice(0, 4);
  const state = { completedMilestones: { [registry[0].id]: {}, [registry[1].id]: {} } };
  assert.equal(calculateProgressionPercent(state, registry), 50);
});

test('next suggestions rank low-risk implemented milestones above future milestones', () => {
  const candidates = getProgressionMilestones().filter((item) => ['get_food', 'defeat_dragon'].includes(item.id));
  const suggestions = rankMilestones(mockBot, {}, candidates, {
    state: { completedMilestones: {}, blockedMilestones: {} },
    options: {}
  });
  assert.equal(suggestions[0].milestoneId, 'get_food');
  assert.equal(suggestions.find((item) => item.milestoneId === 'defeat_dragon').recommended, false);
});

test('safe_survival path returns first incomplete milestone', () => {
  const next = getNextMilestoneInPath('safe_survival', { completedMilestones: {}, blockedMilestones: {} });
  assert.equal(next.id, 'connect_bot');
});

test('nether prep remains blocked if prerequisites are missing', () => {
  const checked = checkMilestone(mockBot, {}, 'prepare_nether_supplies', {
    state: { completedMilestones: {}, blockedMilestones: {} }
  });
  assert.equal(checked.status, 'blocked');
  assert.ok(checked.missingPrerequisites.length > 0);
});

test('progression plan uses existing skill, goal, or curriculum step types only', () => {
  const plan = createPlanForMilestone(mockBot, {}, 'mining_readiness');
  assert.equal(plan.ok, true, plan.blockers.join('\n'));
  assert.ok(plan.steps.length > 0);
  assert.ok(plan.steps.every((step) => ['skill', 'curriculum', 'goal', 'manual'].includes(step.type)));
});

test('reset progression requires confirmation', () => {
  const result = resetProgressionState(false);
  assert.equal(result.ok, false);
});

test('vanilla advancement bridge is graceful without live bot support', () => {
  assert.equal(vanillaAdvancementTrackingAvailable(null), false);
  const status = getVanillaAdvancementStatus({ vanillaAdvancements: [] });
  assert.equal(status.available, false);
  assert.match(status.note, /best-effort/i);
});

