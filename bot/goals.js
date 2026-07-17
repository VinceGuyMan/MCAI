import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTemplateGoal } from './goalTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
export const goalsPath = path.join(projectRoot, 'goals.json');

function now() {
  return Date.now();
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function id(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultGoals() {
  const t = now();
  return {
    version: 1,
    createdAt: t,
    updatedAt: t,
    activeGoals: [],
    completedGoals: [],
    failedGoals: [],
    archivedGoals: [],
    plannerNotes: [],
    lastPlannerRunAt: 0
  };
}

function normalizeStep(step = {}, index = 0) {
  return {
    id: step.id || `step_${index + 1}`,
    description: String(step.description || step.action || 'Goal step').slice(0, 160),
    action: String(step.action || 'status'),
    args: step.args && typeof step.args === 'object' ? step.args : {},
    status: step.status || 'pending',
    riskLevel: step.riskLevel || 'low',
    requiresConfirmation: Boolean(step.requiresConfirmation),
    successCriteria: step.successCriteria || { type: 'action_result', description: 'Step returns a safe result.' },
    startedAt: step.startedAt ?? null,
    completedAt: step.completedAt ?? null,
    failedAt: step.failedAt ?? null,
    retryCount: Number.isInteger(step.retryCount) ? step.retryCount : 0,
    maxRetries: Number.isInteger(step.maxRetries) ? step.maxRetries : 2,
    lastError: step.lastError ?? null
  };
}

export function ensureGoalsShape(goals) {
  const base = defaultGoals();
  const shaped = goals && typeof goals === 'object' ? { ...base, ...goals } : base;
  for (const key of ['activeGoals', 'completedGoals', 'failedGoals', 'archivedGoals', 'plannerNotes']) {
    if (!Array.isArray(shaped[key])) shaped[key] = [];
  }
  for (const bucket of ['activeGoals', 'completedGoals', 'failedGoals', 'archivedGoals']) {
    shaped[bucket] = shaped[bucket].filter(Boolean).map((goal) => normalizeGoal(goal));
  }
  shaped.version = 1;
  shaped.updatedAt = shaped.updatedAt || now();
  return shaped;
}

export function loadGoals() {
  if (!fs.existsSync(goalsPath)) {
    const goals = defaultGoals();
    saveGoals(goals);
    return goals;
  }

  try {
    return ensureGoalsShape(JSON.parse(fs.readFileSync(goalsPath, 'utf8')));
  } catch (error) {
    const backup = `${goalsPath}.bad-${now()}`;
    try {
      fs.copyFileSync(goalsPath, backup);
      console.warn(`[goals] malformed goals.json backed up to ${backup}`);
    } catch (copyError) {
      console.warn(`[goals] could not back up malformed goals.json: ${copyError.message}`);
    }
    const goals = defaultGoals();
    saveGoals(goals);
    return goals;
  }
}

export function saveGoals(goals) {
  const shaped = ensureGoalsShape({ ...goals, updatedAt: now() });
  atomicWriteJson(goalsPath, shaped);
  return shaped;
}

export function normalizeGoal(goal = {}) {
  const t = now();
  const steps = Array.isArray(goal.steps) ? goal.steps.map(normalizeStep) : [];
  const currentStep = goal.currentStepId || steps.find((step) => ['pending', 'running', 'blocked'].includes(step.status))?.id || steps[0]?.id || null;
  return {
    id: goal.id || id('goal'),
    name: String(goal.name || 'Unnamed Goal').slice(0, 80),
    type: goal.type || 'custom',
    priority: goal.priority || 'normal',
    status: goal.status || 'draft',
    createdBy: goal.createdBy || 'tj',
    approvedByOwner: Boolean(goal.approvedByOwner),
    riskLevel: goal.riskLevel || 'low',
    requiresConfirmation: Boolean(goal.requiresConfirmation),
    createdAt: goal.createdAt || t,
    updatedAt: goal.updatedAt || t,
    startedAt: goal.startedAt ?? null,
    completedAt: goal.completedAt ?? null,
    progressPercent: Number.isFinite(goal.progressPercent) ? goal.progressPercent : 0,
    currentStepId: currentStep,
    description: String(goal.description || '').slice(0, 240),
    reason: String(goal.reason || '').slice(0, 240),
    steps,
    blockers: Array.isArray(goal.blockers) ? goal.blockers : [],
    evidence: Array.isArray(goal.evidence) ? goal.evidence : [],
    notes: Array.isArray(goal.notes) ? goal.notes : []
  };
}

function allBuckets(goals) {
  return ['activeGoals', 'completedGoals', 'failedGoals', 'archivedGoals'].flatMap((bucket) => goals[bucket].map((goal) => ({ bucket, goal })));
}

function findGoalContainer(goals, goalIdOrName) {
  const wanted = String(goalIdOrName || '').toLowerCase();
  return allBuckets(goals).find(({ goal }) => goal.id === goalIdOrName || goal.name.toLowerCase() === wanted || goal.name.toLowerCase().includes(wanted));
}

export function createGoal(goal) {
  const goals = loadGoals();
  const normalized = normalizeGoal(goal);
  goals.activeGoals.unshift(normalized);
  saveGoals(goals);
  return normalized;
}

export function createGoalFromTemplate(templateName, context = {}) {
  return createGoal(createTemplateGoal(templateName, context));
}

export function listGoals(filters = {}) {
  const goals = loadGoals();
  let list = allBuckets(goals).map(({ bucket, goal }) => ({ ...goal, bucket }));
  if (filters.status) list = list.filter((goal) => goal.status === filters.status);
  if (filters.activeOnly) list = list.filter((goal) => ['active', 'paused', 'pending_approval', 'blocked', 'draft'].includes(goal.status));
  return list;
}

export function getActiveGoal() {
  const goals = loadGoals();
  return goals.activeGoals.find((goal) => goal.status === 'active') || goals.activeGoals.find((goal) => goal.status === 'blocked') || null;
}

export function getGoalByName(name) {
  const goals = loadGoals();
  return findGoalContainer(goals, name)?.goal || null;
}

export function getGoalById(goalId) {
  const goals = loadGoals();
  return findGoalContainer(goals, goalId)?.goal || null;
}

function updateGoal(goalId, updater) {
  const goals = loadGoals();
  const found = findGoalContainer(goals, goalId);
  if (!found) return null;
  const updated = normalizeGoal({ ...found.goal, ...updater(found.goal), updatedAt: now() });
  goals[found.bucket] = goals[found.bucket].map((goal) => goal.id === found.goal.id ? updated : goal);
  saveGoals(goals);
  return updated;
}

function moveGoal(goalId, targetBucket, patch = {}) {
  const goals = loadGoals();
  const found = findGoalContainer(goals, goalId);
  if (!found) return null;
  goals[found.bucket] = goals[found.bucket].filter((goal) => goal.id !== found.goal.id);
  const moved = normalizeGoal({ ...found.goal, ...patch, updatedAt: now() });
  goals[targetBucket].unshift(moved);
  saveGoals(goals);
  return moved;
}

export const startGoal = (goalId) => updateGoal(goalId, (goal) => ({
  status: 'active',
  approvedByOwner: true,
  startedAt: goal.startedAt || now(),
  blockers: []
}));
export const pauseGoal = (goalId, reason = 'paused') => updateGoal(goalId, (goal) => ({
  status: 'paused',
  blockers: reason ? [{ reason, at: now() }, ...goal.blockers].slice(0, 8) : goal.blockers
}));
export const resumeGoal = (goalId) => updateGoal(goalId, () => ({ status: 'active', blockers: [] }));
export const cancelGoal = (goalId, reason = 'cancelled') => updateGoal(goalId, (goal) => ({ status: 'cancelled', blockers: [{ reason, at: now() }, ...goal.blockers].slice(0, 8) }));
export const completeGoal = (goalId, evidence = {}) => moveGoal(goalId, 'completedGoals', { status: 'completed', completedAt: now(), progressPercent: 100, evidence: [evidence] });
export const failGoal = (goalId, reason = 'failed') => moveGoal(goalId, 'failedGoals', { status: 'failed', blockers: [{ reason, at: now() }] });
export const archiveGoal = (goalId) => moveGoal(goalId, 'archivedGoals', { status: 'cancelled' });

export function deleteGoal(goalId) {
  const goals = loadGoals();
  const found = findGoalContainer(goals, goalId);
  if (!found) return false;
  goals[found.bucket] = goals[found.bucket].filter((goal) => goal.id !== found.goal.id);
  saveGoals(goals);
  return true;
}

export const updateGoalProgress = (goalId, updates) => updateGoal(goalId, () => updates || {});
export const setGoalPriority = (goalId, priority) => updateGoal(goalId, () => ({ priority }));

export function addGoalStep(goalId, step) {
  return updateGoal(goalId, (goal) => ({ steps: [...goal.steps, normalizeStep(step, goal.steps.length)] }));
}

export function updateGoalStep(goalId, stepId, updates) {
  return updateGoal(goalId, (goal) => ({
    steps: goal.steps.map((step) => step.id === stepId ? normalizeStep({ ...step, ...updates }, 0) : step)
  }));
}

export const markStepComplete = (goalId, stepId, evidence = {}) => updateGoalStep(goalId, stepId, { status: 'completed', completedAt: now(), lastError: null, evidence });
export const markStepFailed = (goalId, stepId, reason = 'failed') => updateGoalStep(goalId, stepId, { status: 'failed', failedAt: now(), retryCount: 1, lastError: reason });

export function getNextGoalStep(goal) {
  if (!goal?.steps?.length) return null;
  return goal.steps.find((step) => ['pending', 'blocked'].includes(step.status)) || null;
}

export function getGoalProgress(goal) {
  if (!goal?.steps?.length) return Number(goal?.progressPercent || 0);
  const completed = goal.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length;
  return Math.round((completed / goal.steps.length) * 100);
}

export function getGoalSummary(goal) {
  if (!goal) return 'No active goal.';
  const step = getNextGoalStep(goal);
  return `${goal.name}: ${goal.status}, ${getGoalProgress(goal)}% complete. Next: ${step?.description || 'none'}.`;
}
