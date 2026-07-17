/**
 * Goals + strategic planner handlers.
 */
import * as goalsStore from '../../goals.js';
import * as goalTemplates from '../../goalTemplates.js';
import * as goalValidator from '../../goalValidator.js';
import * as goalExecutor from '../../goalExecutor.js';
import * as progressTracker from '../../progressTracker.js';
import * as advisor from '../../advisor.js';
import * as plannerState from '../../plannerState.js';
import * as planReview from '../../planReview.js';
import * as strategicPlanner from '../../strategicPlanner.js';

export function createPlanningHandlers(ctx) {
  const {
    bot, config, memory, say, perception, taskQueue, throwIfCancelled, state
  } = ctx;

  function findGoal(name = null) {
    if (name) return goalsStore.getGoalByName(name) || goalsStore.getGoalById(name);
    return goalsStore.getActiveGoal() ||
      goalsStore.listGoals({ activeOnly: true }).find((goal) => ['pending_approval', 'draft', 'paused', 'blocked'].includes(goal.status)) ||
      null;
  }

  function goalListText(goals) {
    if (!goals.length) return 'No goals yet.';
    return goals.slice(0, 4).map((goal) => `${goal.name}: ${goal.status}, ${goalsStore.getGoalProgress(goal)}%`).join('; ');
  }

  function sayPlanning(message, options = {}) {
    const mem = memory.get();
    if (config.thinCoreEnabled && (mem.thinCoreTaskActive || mem.activeThinCoreAction)) return;
    if (!options.silent) say(message, true);
  }

  async function goalsStatusAction(options = {}) {
    const goals = goalsStore.listGoals({ activeOnly: true });
    sayPlanning(`Goals: ${goalListText(goals)}`, options);
    return goals;
  }

  async function explainGoalAction(name = null, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No active goal.', options);
      return { ok: false, message: 'No active goal.' };
    }
    const progress = planReview.createProgressReport(goal);
    const risks = planReview.explainRisks(goal);
    sayPlanning(`${progress} ${risks}`, options);
    return { ok: true, goal };
  }

  async function nextGoalStepAction(name = null, options = {}) {
    const goal = findGoal(name);
    const step = goalsStore.getNextGoalStep(goal);
    if (!goal || !step) {
      sayPlanning(goal ? `${goal.name} has no unfinished steps.` : 'No active goal.', options);
      return { ok: false, message: 'No next step.' };
    }
    const why = planReview.explainWhyStepIsNext(goal, step);
    sayPlanning(why, options);
    return { ok: true, goal, step };
  }

  function saveValidatedGoal(goal, options = {}) {
    const checked = goalValidator.validateGoal(goal, config);
    if (!checked.ok) {
      sayPlanning(`I could not save that goal: ${checked.reason}`, options);
      return { ok: false, message: checked.reason };
    }
    const safe = safety.safePlannerGoal?.(checked.goal) || { ok: true };
    if (!safe.ok) {
      sayPlanning(`I blocked that goal: ${safe.reason || safe.message}`, options);
      return { ok: false, message: safe.reason || safe.message };
    }

    const autoApprove = Boolean(options.autoApprove);
    const canStart = autoApprove || (!config.requireOwnerApprovalForNewGoals && !checked.goal.requiresConfirmation);
    const created = goalsStore.createGoal({
      ...checked.goal,
      status: canStart ? 'active' : 'pending_approval',
      approvedByOwner: canStart
    });

    if (canStart) {
      memory.update({ activeGoalId: created.id, currentGoalRunStartedAt: Date.now(), plannerPausedReason: null });
      sayPlanning(`Started goal: ${planReview.summarizePlan(created)}`, options);
    } else {
      plannerState.setPendingGoalConfirmation(memory, { action: 'create_new_goal', goalId: created.id });
      sayPlanning(planReview.createOwnerApprovalMessage(created), options);
    }
    if (created.type === 'nether_prep') {
      sayPlanning('Nether prep only. I will not enter, light, or use a portal until Phase 7.', options);
    }
    return { ok: true, goal: created };
  }

  async function createGoalFromTemplateAction(templateName, options = {}) {
    const normalized = goalTemplates.normalizeTemplateName(templateName);
    const existing = goalsStore.listGoals({ activeOnly: true })
      .find((goal) => goal.name.toLowerCase() === (goalTemplates.getGoalTemplate(normalized)?.name || '').toLowerCase());
    if (existing) {
      sayPlanning(`${existing.name} already exists: ${existing.status}.`, options);
      return { ok: true, goal: existing };
    }
    try {
      const goal = goalTemplates.createTemplateGoal(normalized, {
        createdBy: 'ModVinny',
        approvedByOwner: Boolean(options.autoApprove)
      });
      return saveValidatedGoal(goal, options);
    } catch (error) {
      sayPlanning(`I do not know that goal template: ${templateName}.`, options);
      return { ok: false, message: error.message };
    }
  }

  async function createGoalAction(description, options = {}) {
    const state = perception();
    const plan = await strategicPlanner.createPlanFromRequest(bot, memory, description, { perception: state, config });
    if (plan.speak) sayPlanning(plan.speak, options);
    const goal = plan.goals?.[0];
    if (!goal) {
      sayPlanning('I could not make a safe goal from that.', options);
      return { ok: false, message: 'No safe goal.' };
    }
    return saveValidatedGoal(goal, options);
  }

  async function startGoalAction(name = null, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('I could not find that goal.', options);
      return { ok: false };
    }
    const started = goalsStore.startGoal(goal.id);
    memory.update({ activeGoalId: started.id, currentGoalRunStartedAt: Date.now(), plannerPausedReason: null });
    sayPlanning(`Started ${started.name}. Next: ${goalsStore.getNextGoalStep(started)?.description || 'none'}.`, options);
    return { ok: true, goal: started };
  }

  async function approveGoalAction(name = null, options = {}) {
    const pending = plannerState.getPendingGoalConfirmation(memory);
    const goal = findGoal(name || pending?.goalId);
    if (!goal) {
      sayPlanning('No goal is waiting for approval.', options);
      return { ok: false };
    }
    plannerState.clearPendingGoalConfirmation(memory);
    return startGoalAction(goal.id, options);
  }

  async function rejectGoalAction(name = null, options = {}) {
    const pending = plannerState.getPendingGoalConfirmation(memory);
    const goal = findGoal(name || pending?.goalId);
    if (!goal) {
      sayPlanning('No goal is waiting for rejection.', options);
      return { ok: false };
    }
    const rejected = goalsStore.cancelGoal(goal.id, 'Rejected by owner.');
    memory.update({
      ownerRejectedGoals: [
        { goalId: goal.id, name: goal.name, at: Date.now() },
        ...(memory.get().ownerRejectedGoals || [])
      ].slice(0, 20)
    });
    plannerState.clearPendingGoalConfirmation(memory);
    sayPlanning(`Rejected ${rejected.name}.`, options);
    return { ok: true, goal: rejected };
  }

  async function pauseGoalAction(name = null, reason = 'Paused by owner.', options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No goal to pause.', options);
      return { ok: false };
    }
    const result = goalExecutor.pauseGoalExecution(bot, memory, goal, reason);
    sayPlanning(result.message, options);
    return result;
  }

  async function resumeGoalAction(name = null, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No goal to resume.', options);
      return { ok: false };
    }
    const result = goalExecutor.resumeGoalExecution(bot, memory, goal);
    sayPlanning(result.message, options);
    return result;
  }

  async function cancelGoalAction(name = null, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No goal to cancel.', options);
      return { ok: false };
    }
    const result = goalExecutor.cancelGoalExecution(bot, memory, goal, 'Cancelled by owner.');
    sayPlanning(result.message, options);
    return result;
  }

  async function completeGoalAction(name = null, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No goal to complete.', options);
      return { ok: false };
    }
    const completed = goalsStore.completeGoal(goal.id, { completedBy: 'ModVinny', at: Date.now() });
    memory.update({ activeGoalId: null, activeGoalStepId: null, lastCompletedGoalId: completed.id });
    sayPlanning(`Completed ${completed.name}.`, options);
    return { ok: true, goal: completed };
  }

  async function failGoalAction(name = null, reason = 'Failed by owner.', options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('No goal to fail.', options);
      return { ok: false };
    }
    const failed = goalsStore.failGoal(goal.id, reason);
    memory.update({ activeGoalId: null, activeGoalStepId: null, lastFailedGoalId: failed.id });
    sayPlanning(`Marked ${failed.name} failed: ${reason}`, options);
    return { ok: true, goal: failed };
  }

  async function archiveGoalAction(name, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('I could not find that goal to archive.', options);
      return { ok: false };
    }
    const archived = goalsStore.archiveGoal(goal.id);
    sayPlanning(`Archived ${archived.name}.`, options);
    return { ok: true, goal: archived };
  }

  async function deleteGoalAction(name, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('I could not find that goal to delete.', options);
      return { ok: false };
    }
    plannerState.setPendingGoalConfirmation(memory, { action: 'delete_goal', goalId: goal.id, name: goal.name });
    sayPlanning(`Deleting goals is permanent. Say "tj confirm delete goal" to delete ${goal.name}.`, options);
    return { ok: false, requiresConfirmation: true, goal };
  }

  async function confirmDeleteGoalAction(options = {}) {
    const pending = plannerState.getPendingGoalConfirmation(memory);
    if (pending?.action !== 'delete_goal') {
      sayPlanning('No goal delete confirmation is active.', options);
      return { ok: false };
    }
    const ok = goalsStore.deleteGoal(pending.goalId);
    plannerState.clearPendingGoalConfirmation(memory);
    sayPlanning(ok ? `Deleted ${pending.name || 'goal'}.` : 'I could not delete that goal.', options);
    return { ok };
  }

  async function setGoalPriorityAction(name, priority, options = {}) {
    const goal = findGoal(name);
    if (!goal) {
      sayPlanning('I could not find that goal.', options);
      return { ok: false };
    }
    const updated = goalsStore.setGoalPriority(goal.id, priority);
    sayPlanning(`${updated.name} priority is now ${updated.priority}.`, options);
    return { ok: true, goal: updated };
  }

  async function executeNextGoalStepAction(options = {}) {
    throwIfCancelled();
    const goal = goalsStore.getActiveGoal();
    if (!goal) {
      sayPlanning('No active goal to execute.', options);
      return { ok: false };
    }
    const step = goalsStore.getNextGoalStep(goal);
    if (!step) {
      const completed = goalsStore.completeGoal(goal.id, { reason: 'all steps complete', at: Date.now() });
      memory.update({ activeGoalId: null, activeGoalStepId: null, lastCompletedGoalId: completed.id });
      sayPlanning(`${completed.name} is complete.`, options);
      return { ok: true, goal: completed };
    }

    const safe = safety.safePlannerStep?.(step, perception()) || { ok: true };
    if (!safe.ok) {
      goalsStore.updateGoalProgress(goal.id, {
        status: 'blocked',
        blockers: [{ reason: safe.reason || safe.message, stepId: step.id, at: Date.now() }, ...(goal.blockers || [])].slice(0, 8)
      });
      sayPlanning(`Blocked: ${safe.reason || safe.message}`, options);
      return { ok: false, message: safe.reason || safe.message };
    }

    if ((step.requiresConfirmation || safe.requiresConfirmation) && !step.confirmed && !options.confirmed) {
      plannerState.setPendingGoalConfirmation(memory, { action: 'risky_goal_step', goalId: goal.id, stepId: step.id });
      sayPlanning(`Next step needs confirmation: ${step.description}. Say "tj confirm step" to continue.`, options);
      return { ok: false, requiresConfirmation: true, goal, step };
    }

    const runnable = options.confirmed ? { ...goal, steps: goal.steps.map((item) => item.id === step.id ? { ...item, confirmed: true } : item) } : goal;
    const result = await goalExecutor.executeNextGoalStep(bot, memory, runnable, { actions: api, perception, cancellation });
    const latest = goalsStore.getGoalById(goal.id) || goalsStore.listGoals().find((item) => item.id === goal.id);
    if (latest) goalsStore.updateGoalProgress(latest.id, { progressPercent: goalsStore.getGoalProgress(latest) });
    if (!options.silent) say(result.message || (result.ok ? 'Goal step done.' : 'Goal step failed.'), true);
    return result;
  }

  async function confirmStepAction(options = {}) {
    const pending = plannerState.getPendingGoalConfirmation(memory);
    const goal = findGoal(pending?.goalId);
    const stepId = pending?.stepId || goalsStore.getNextGoalStep(goal)?.id;
    if (!goal || !stepId) {
      sayPlanning('No goal step needs confirmation right now.', options);
      return { ok: false };
    }
    goalsStore.updateGoalStep(goal.id, stepId, { confirmed: true, status: 'pending' });
    plannerState.clearPendingGoalConfirmation(memory);
    return executeNextGoalStepAction({ ...options, confirmed: true });
  }

  async function skipStepAction(options = {}) {
    const goal = goalsStore.getActiveGoal();
    const step = goalsStore.getNextGoalStep(goal);
    if (!goal || !step) {
      sayPlanning('No step to skip.', options);
      return { ok: false };
    }
    goalsStore.updateGoalStep(goal.id, step.id, { status: 'skipped', completedAt: Date.now(), lastError: null });
    const latest = goalsStore.getGoalById(goal.id);
    goalsStore.updateGoalProgress(goal.id, {
      progressPercent: goalsStore.getGoalProgress(latest),
      currentStepId: goalsStore.getNextGoalStep(latest)?.id || null
    });
    sayPlanning(`Skipped: ${step.description}.`, options);
    return { ok: true };
  }

  async function retryStepAction(options = {}) {
    const goal = findGoal();
    const step = goal?.steps?.find((item) => ['failed', 'blocked', 'running'].includes(item.status)) || goalsStore.getNextGoalStep(goal);
    if (!goal || !step) {
      sayPlanning('No failed or blocked step to retry.', options);
      return { ok: false };
    }
    goalsStore.updateGoalStep(goal.id, step.id, { status: 'pending', lastError: null, confirmed: false });
    goalsStore.updateGoalProgress(goal.id, { status: 'active', blockers: [] });
    sayPlanning(`Retrying: ${step.description}.`, options);
    return { ok: true };
  }

  async function suggestGoalsAction(options = {}) {
    const goals = goalsStore.loadGoals();
    const suggestions = advisor.suggestNextGoals(bot, memory, perception(), goals);
    if (suggestions.length) {
      const text = suggestions.map(advisor.explainSuggestion).join('; ');
      memory.update({ lastGoalSuggestion: suggestions[0], lastGoalSuggestionAt: Date.now() });
      sayPlanning(`Suggested goals: ${text}`, options);
      return { ok: true, suggestions };
    }
    const mapMemory = config.mapMemoryEnabled ? mapMemoryStore.loadMapMemory() : null;
    const modelPlan = await strategicPlanner.suggestGoals(bot, memory, mapMemory, goals, perception());
    if (modelPlan.goals?.length) {
      sayPlanning(modelPlan.speak || `I can plan: ${modelPlan.goals.map((goal) => goal.name).join(', ')}.`, options);
      return { ok: true, suggestions: modelPlan.goals };
    }
    sayPlanning(strategicPlanner.explainStrategicPriorities(bot, memory, perception()), options);
    return { ok: true, suggestions: [] };
  }

  async function plannerSuggestNextAction(options = {}) {
    const state = plannerState.getPlannerState(memory);
    if (Date.now() - state.lastGoalSuggestionAt < (config.goalSuggestionCooldownMs || 120000) && !options.force) {
      return { ok: false, message: 'Suggestion cooldown active.' };
    }
    return suggestGoalsAction(options);
  }

  async function plannerStatusAction(options = {}) {
    const state = plannerState.getPlannerState(memory);
    const active = findGoal(state.activeGoalId) || goalsStore.getActiveGoal();
    const cooldown = Math.max(0, (config.plannerDecisionCooldownMs || 45000) - (Date.now() - (state.lastPlannerDecisionAt || 0)));
    sayPlanning(`Planner: ${config.longTermPlanningEnabled ? 'on' : 'off'}, paused ${state.plannerPausedReason || 'no'}, active ${active?.name || 'none'}, cooldown ${cooldown}ms.`, options);
    return state;
  }

  async function plannerPauseAction(reason = 'Paused by owner.', options = {}) {
    plannerState.setPlannerPaused(memory, reason);
    sayPlanning(`Planner paused: ${reason}`, options);
    return { ok: true };
  }

  async function plannerResumeAction(options = {}) {
    plannerState.clearPlannerPaused(memory);
    sayPlanning('Planner resumed.', options);
    return { ok: true };
  }


  return {
    findGoal,
    goalListText,
    sayPlanning,
    goalsStatusAction,
    explainGoalAction,
    nextGoalStepAction,
    saveValidatedGoal,
    createGoalFromTemplateAction,
    createGoalAction,
    startGoalAction,
    approveGoalAction,
    rejectGoalAction,
    pauseGoalAction,
    resumeGoalAction,
    cancelGoalAction,
    completeGoalAction,
    failGoalAction,
    archiveGoalAction,
    deleteGoalAction,
    confirmDeleteGoalAction,
    setGoalPriorityAction,
    executeNextGoalStepAction,
    confirmStepAction,
    skipStepAction,
    retryStepAction,
    suggestGoalsAction,
    plannerSuggestNextAction,
    plannerStatusAction,
    plannerPauseAction,
    plannerResumeAction
  };
}
