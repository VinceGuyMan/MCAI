export function getPlannerState(memory) {
  return {
    activeGoalId: memory.get().activeGoalId || null,
    activeGoalStepId: memory.get().activeGoalStepId || null,
    lastPlannerTickAt: memory.get().lastPlannerTickAt || 0,
    lastPlannerDecisionAt: memory.get().lastPlannerDecisionAt || 0,
    lastGoalProgressReportAt: memory.get().lastGoalProgressReportAt || 0,
    lastGoalSuggestionAt: memory.get().lastGoalSuggestionAt || 0,
    pendingGoalConfirmation: memory.get().pendingGoalConfirmation || null,
    plannerPausedReason: memory.get().plannerPausedReason || null,
    currentGoalRunStartedAt: memory.get().currentGoalRunStartedAt || 0,
    plannerAutonomyLevel: memory.get().plannerAutonomyLevel || 'semi'
  };
}

export function setPlannerPaused(memory, reason = 'paused') {
  memory.update({ plannerPausedReason: reason });
}

export function clearPlannerPaused(memory) {
  memory.update({ plannerPausedReason: null });
}

export function isPlannerPaused(memory) {
  return Boolean(memory.get().plannerPausedReason);
}

export function updateLastPlannerTick(memory) {
  memory.update({ lastPlannerTickAt: Date.now() });
}

export function updateLastPlannerDecision(memory) {
  memory.update({ lastPlannerDecisionAt: Date.now() });
}

export function canPlannerMakeDecision(memory, config) {
  return Date.now() - (memory.get().lastPlannerDecisionAt || 0) >= (config.plannerDecisionCooldownMs || 45000);
}

export function setPendingGoalConfirmation(memory, confirmation) {
  memory.update({
    pendingGoalConfirmation: confirmation ? { ...confirmation, createdAt: Date.now(), expiresAt: Date.now() + 60000 } : null,
    pendingGoalConfirmationExpiresAt: confirmation ? Date.now() + 60000 : 0
  });
}

export function clearPendingGoalConfirmation(memory) {
  memory.update({ pendingGoalConfirmation: null, pendingGoalConfirmationExpiresAt: 0 });
}

export function getPendingGoalConfirmation(memory) {
  const pending = memory.get().pendingGoalConfirmation;
  if (!pending) return null;
  if (Date.now() > (pending.expiresAt || memory.get().pendingGoalConfirmationExpiresAt || 0)) {
    clearPendingGoalConfirmation(memory);
    return null;
  }
  return pending;
}
