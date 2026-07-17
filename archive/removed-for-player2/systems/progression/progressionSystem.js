import { getMilestone, listMilestones, generateProgressionSummary } from './progressionRegistry.js';
import { loadProgressionState, markMilestoneComplete, markMilestoneBlocked, resetProgressionState } from './progressionState.js';
import { getProgressionSummary, refreshProgressionState, explainMilestoneStatus } from './progressionTracker.js';
import { suggestNextMilestones } from './progressionAdvisor.js';
import {
  createPlanForMilestone,
  createGoalForMilestone,
  createCurriculumForMilestone,
  explainProgressionPlan
} from './progressionPlanner.js';
import { listProgressionPaths, getProgressionPath, getNextMilestoneInPath } from './progressionPaths.js';
import { getVanillaAdvancementStatus } from './vanillaAdvancementBridge.js';

const CONFIRMATION_TTL_MS = 60_000;

function now() {
  return Date.now();
}

function data(memory) {
  if (memory?.get) return memory.get();
  return memory || {};
}

function updateMemory(memory, patch) {
  if (memory?.update) memory.update(patch);
  else Object.assign(memory, patch);
}

function setPending(memory, pending) {
  updateMemory(memory, {
    pendingProgressionConfirmation: pending,
    pendingProgressionConfirmationExpiresAt: now() + CONFIRMATION_TTL_MS
  });
}

function getPending(memory) {
  const current = data(memory);
  const pending = current.pendingProgressionConfirmation;
  if (!pending || (current.pendingProgressionConfirmationExpiresAt || 0) < now()) return null;
  return pending;
}

function clearPending(memory) {
  updateMemory(memory, {
    pendingProgressionConfirmation: null,
    pendingProgressionConfirmationExpiresAt: 0
  });
}

export function getProgressionStatus(bot, memory) {
  const state = loadProgressionState();
  return {
    ok: true,
    enabled: true,
    summary: getProgressionSummary(bot, memory, { state }),
    state
  };
}

export function getProgressionMilestoneList(filter = {}) {
  const state = loadProgressionState();
  const items = listMilestones(filter).map((milestone) => ({
    ...milestone,
    status: state.completedMilestones[milestone.id] ? 'completed' : state.blockedMilestones[milestone.id] ? 'blocked' : milestone.implemented ? 'incomplete' : 'future'
  }));
  return { ok: true, milestones: items };
}

export function checkProgressionNow(bot, memory) {
  const state = refreshProgressionState(bot, memory);
  return { ok: true, summary: generateProgressionSummary(state), state };
}

export function suggestProgression(bot, memory, options = {}) {
  const suggestions = suggestNextMilestones(bot, memory, options);
  return { ok: true, suggestions };
}

export function explainMilestone(bot, memory, milestoneId) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  return {
    ok: true,
    milestone,
    explanation: explainMilestoneStatus(bot, memory, milestone.id)
  };
}

export function listPaths(memory) {
  const state = loadProgressionState();
  return {
    ok: true,
    paths: listProgressionPaths().map((path) => ({
      ...path,
      nextMilestone: getNextMilestoneInPath(path.name, state)
    }))
  };
}

export function explainPath(memory, pathName) {
  const state = loadProgressionState();
  const path = getProgressionPath(pathName);
  if (!path) return { ok: false, reason: `Unknown progression path: ${pathName}` };
  return { ok: true, path, nextMilestone: getNextMilestoneInPath(path.name, state) };
}

export function planMilestone(bot, memory, milestoneId, options = {}) {
  const plan = createPlanForMilestone(bot, memory, milestoneId, options);
  return { ...plan, message: explainProgressionPlan(plan) };
}

export function requestCreateProgressionGoal(bot, memory, milestoneId) {
  const draft = createGoalForMilestone(bot, memory, milestoneId, { persist: false });
  if (!draft.ok) return draft;
  setPending(memory, { type: 'create_progression_goal', milestoneId, createdAt: now() });
  return {
    ok: true,
    pending: true,
    message: `${draft.message} Say "tj confirm progression goal" within 60 seconds.`
  };
}

export function confirmCreateProgressionGoal(bot, memory) {
  const pending = getPending(memory);
  if (pending?.type !== 'create_progression_goal') return { ok: false, reason: 'No pending progression goal confirmation.' };
  const result = createGoalForMilestone(bot, memory, pending.milestoneId, { persist: true, createdBy: 'ModVinny' });
  clearPending(memory);
  return result;
}

export function requestCreateProgressionCurriculum(bot, memory, milestoneId) {
  const draft = createCurriculumForMilestone(bot, memory, milestoneId);
  if (!draft.ok) return draft;
  setPending(memory, { type: 'create_progression_curriculum', milestoneId, createdAt: now() });
  return {
    ok: true,
    pending: true,
    message: `${draft.message} Say "tj confirm progression curriculum" within 60 seconds.`
  };
}

export function confirmCreateProgressionCurriculum(bot, memory) {
  const pending = getPending(memory);
  if (pending?.type !== 'create_progression_curriculum') return { ok: false, reason: 'No pending progression curriculum confirmation.' };
  const result = createCurriculumForMilestone(bot, memory, pending.milestoneId);
  clearPending(memory);
  return result;
}

export function requestManualMilestoneComplete(memory, milestoneId) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  setPending(memory, { type: 'manual_milestone_complete', milestoneId: milestone.id, createdAt: now() });
  return { ok: true, message: `Manual completion for ${milestone.name} needs confirmation. Say "tj confirm mark milestone complete".` };
}

export function confirmManualMilestoneComplete(memory, notes = 'Manually confirmed by ModVinny.') {
  const pending = getPending(memory);
  if (pending?.type !== 'manual_milestone_complete') return { ok: false, reason: 'No pending manual milestone completion.' };
  const record = markMilestoneComplete(pending.milestoneId, [{ name: 'manual_owner_confirmation', status: 'reported', source: 'ModVinny' }], notes, 'ModVinny');
  clearPending(memory);
  return { ok: true, record };
}

export function requestManualMilestoneBlocked(memory, milestoneId, reason = 'Manually blocked by ModVinny.') {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  setPending(memory, { type: 'manual_milestone_blocked', milestoneId: milestone.id, reason, createdAt: now() });
  return { ok: true, message: `Manual block for ${milestone.name} needs confirmation. Say "tj confirm mark milestone blocked".` };
}

export function confirmManualMilestoneBlocked(memory) {
  const pending = getPending(memory);
  if (pending?.type !== 'manual_milestone_blocked') return { ok: false, reason: 'No pending manual milestone block.' };
  const record = markMilestoneBlocked(pending.milestoneId, pending.reason || 'Manually blocked by ModVinny.');
  clearPending(memory);
  return { ok: true, record };
}

export function requestResetProgression(memory) {
  setPending(memory, { type: 'reset_progression', createdAt: now() });
  return { ok: true, message: 'Reset progression needs confirmation. Say "tj confirm reset progression" within 60 seconds.' };
}

export function confirmResetProgression(memory) {
  const pending = getPending(memory);
  if (pending?.type !== 'reset_progression') return { ok: false, reason: 'No pending progression reset.' };
  const result = resetProgressionState(true);
  clearPending(memory);
  return result;
}

export function vanillaStatus() {
  return { ok: true, status: getVanillaAdvancementStatus(loadProgressionState()) };
}

