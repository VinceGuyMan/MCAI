import * as goalsStore from './goals.js';
import * as progressTracker from './progressTracker.js';
import { validateGoalStep } from './goalValidator.js';

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

export function mapStepToAction(step) {
  return step?.action || null;
}

export function getStepTimeout(step) {
  return step?.timeoutMs || 180000;
}

export function canExecuteStep(bot, memory, goal, step) {
  const config = bot.mcaiConfig || {};
  if (!goal || !step) return result(false, 'No active goal step.');
  const checked = validateGoalStep(step, config);
  if (!checked.ok) return result(false, checked.reason);
  if (step.requiresConfirmation && !step.confirmed) return result(false, `Step needs confirmation: ${step.description}`, { blocked: true, requiresConfirmation: true });
  if (memory.get().plannerPausedReason) return result(false, `Planner paused: ${memory.get().plannerPausedReason}`, { blocked: true });
  if ((bot.health ?? 20) < 8) return result(false, 'Health is too low for goal work.', { blocked: true });
  if (config.autoPauseGoalsWhenOwnerFar) {
    const owner = bot.players?.[config.ownerUsername]?.entity;
    if (owner && bot.entity?.position && bot.entity.position.distanceTo(owner.position) > (config.maxGoalDistanceFromOwner || 96)) {
      return result(false, 'ModVinny is too far away for goal work.', { blocked: true });
    }
  }
  return result(true, 'Step can execute.');
}

async function callAction(actions, step) {
  const action = mapStepToAction(step);
  const args = step.args || {};
  const fn = actions[action] || actions[action?.replace(/_([a-z])/g, (_, char) => char.toUpperCase())];
  if (!fn) return result(false, `No action handler for ${action}.`);

  if (action === 'craft_item') return fn(args.itemName || args.item || 'torch', args.count || 1, { direct: true });
  if (action === 'smelt_item') return fn(args.itemName || args.item || 'raw_iron', args.count || 1);
  if (action === 'mine_stone') return fn(args.count || 16);
  if (action === 'mine_coal') return fn(args.count || 8);
  if (action === 'mine_iron') return fn(args.count || 8);
  if (action === 'resource_run_wood') return fn(args.count || 16);
  if (action === 'resource_run_stone') return fn(args.count || 32);
  if (action === 'resource_run_coal') return fn(args.count || 8);
  if (action === 'create_farm') return fn(args.cropType || 'wheat');
  if (action === 'create_animal_pen') return fn(args.animalType || 'cow');
  if (action === 'remember_location') return fn(args.name || 'remembered place');
  if (action === 'go_to_waypoint') return fn(args.name || args.waypoint || 'home');
  if (['light_portal', 'enter_nether', 'safe_nether_entry'].includes(action)) return fn({ confirmed: Boolean(step.confirmed), fromGoal: true });
  return fn();
}

export function handleStepSuccess(goal, step, evidence = {}) {
  goalsStore.updateGoalStep(goal.id, step.id, { status: 'completed', completedAt: Date.now(), lastError: null });
  const latest = goalsStore.getGoalById(goal.id);
  const progressPercent = goalsStore.getGoalProgress(latest);
  if (progressPercent >= 100) return goalsStore.completeGoal(goal.id, evidence);
  return goalsStore.updateGoalProgress(goal.id, {
    progressPercent,
    currentStepId: goalsStore.getNextGoalStep(latest)?.id || null,
    evidence: [evidence, ...(latest.evidence || [])].slice(0, 20)
  });
}

export function handleStepFailure(goal, step, reason) {
  const retryCount = (step.retryCount || 0) + 1;
  if (retryCount > (step.maxRetries || 2)) {
    goalsStore.updateGoalStep(goal.id, step.id, { status: 'blocked', failedAt: Date.now(), retryCount, lastError: reason });
    return handleStepBlocked(goal, step, reason);
  }
  return goalsStore.updateGoalStep(goal.id, step.id, { status: 'failed', failedAt: Date.now(), retryCount, lastError: reason });
}

export function handleStepBlocked(goal, step, reason) {
  goalsStore.updateGoalStep(goal.id, step.id, { status: 'blocked', lastError: reason });
  return goalsStore.updateGoalProgress(goal.id, {
    status: 'blocked',
    blockers: [{ reason, stepId: step.id, at: Date.now() }, ...(goal.blockers || [])].slice(0, 8)
  });
}

export async function executeGoalStep(bot, memory, goal, step, context = {}) {
  const actions = context.actions;
  const perception = context.perception?.() || {};
  const allowed = canExecuteStep(bot, memory, goal, step);
  if (!allowed.ok) {
    if (allowed.blocked) handleStepBlocked(goal, step, allowed.message);
    return allowed;
  }

  context.cancellation?.throwIfCancelled?.();
  goalsStore.updateGoalStep(goal.id, step.id, { status: 'running', startedAt: Date.now() });
  memory.update({ activeGoalId: goal.id, activeGoalStepId: step.id, currentGoalRunStartedAt: memory.get().currentGoalRunStartedAt || Date.now() });
  console.log(`[goals] executing ${goal.name} / ${step.action}`);

  try {
    const actionResult = await callAction(actions, step);
    context.cancellation?.throwIfCancelled?.();
    const updatedGoal = goalsStore.getGoalById(goal.id) || goal;
    const updatedStep = updatedGoal.steps.find((item) => item.id === step.id) || step;
    const evidence = progressTracker.collectStepEvidence(bot, memory, updatedStep, perception);
    if (actionResult?.ok === false || actionResult?.success === false || actionResult?.failed) {
      handleStepFailure(updatedGoal, updatedStep, actionResult.message || actionResult.reason || 'step failed');
      return result(false, actionResult.message || 'Step failed.', { actionResult });
    }
    handleStepSuccess(updatedGoal, updatedStep, { ...evidence, actionResult: actionResult?.message || 'ok' });
    return result(true, actionResult?.message || `Completed ${step.description}.`, { actionResult });
  } catch (error) {
    if (error?.cancelled || error?.name === 'CancelledError') {
      pauseGoalExecution(bot, memory, goal, 'Stopped.');
      return result(false, 'Stopped.', { cancelled: true });
    }
    handleStepFailure(goal, step, error.message);
    return result(false, error.message);
  }
}

export async function executeNextGoalStep(bot, memory, goal, context = {}) {
  const latest = goalsStore.getGoalById(goal?.id) || goal;
  const step = goalsStore.getNextGoalStep(latest);
  if (!latest) return result(false, 'No active goal.');
  if (!step) {
    goalsStore.completeGoal(latest.id, { reason: 'all steps complete', at: Date.now() });
    return result(true, `${latest.name} is complete.`);
  }
  return executeGoalStep(bot, memory, latest, step, context);
}

export function pauseGoalExecution(_bot, memory, goal, reason = 'paused') {
  if (goal?.id) goalsStore.pauseGoal(goal.id, reason);
  memory.update({ activeGoalStepId: null, plannerPausedReason: reason });
  return result(true, `Paused ${goal?.name || 'goal'}: ${reason}.`);
}

export function resumeGoalExecution(_bot, memory, goal) {
  if (goal?.id) goalsStore.resumeGoal(goal.id);
  memory.update({ plannerPausedReason: null, activeGoalId: goal?.id || null });
  return result(true, `Resumed ${goal?.name || 'goal'}.`);
}

export function cancelGoalExecution(_bot, memory, goal, reason = 'cancelled') {
  if (goal?.id) goalsStore.cancelGoal(goal.id, reason);
  memory.update({ activeGoalId: null, activeGoalStepId: null, plannerPausedReason: null });
  return result(true, `Cancelled ${goal?.name || 'goal'}.`);
}
