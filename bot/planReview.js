import { getCapabilityDescription, getCapabilityRequirements } from './capabilities.js';
import { getGoalProgress, getNextGoalStep } from './goals.js';

export function summarizeStep(step) {
  if (!step) return 'No next step.';
  const risk = step.riskLevel && step.riskLevel !== 'low' ? ` (${step.riskLevel} risk)` : '';
  return `${step.description}${risk}`;
}

export function summarizePlan(goal) {
  if (!goal) return 'No plan.';
  const steps = (goal.steps || []).slice(0, 5).map((step) => step.description).join(', ');
  const more = (goal.steps || []).length > 5 ? ', then more' : '';
  return `${goal.name}: ${steps}${more}.`;
}

export function explainRisks(goal) {
  const risky = (goal?.steps || []).filter((step) => step.requiresConfirmation || step.riskLevel !== 'low');
  if (!risky.length) return 'No unusual risks.';
  return risky.slice(0, 3).map((step) => `${step.description}: ${step.riskLevel}${step.requiresConfirmation ? ', needs confirmation' : ''}`).join('; ');
}

export function explainMissingRequirements(_bot, _memory, goal) {
  const step = getNextGoalStep(goal);
  if (!step) return 'No missing requirements.';
  const requirements = getCapabilityRequirements(step.action);
  return requirements.length ? `Next step needs: ${requirements.join(', ')}.` : 'No special requirements for the next step.';
}

export function explainWhyStepIsNext(goal, step = null) {
  const next = step || getNextGoalStep(goal);
  if (!goal || !next) return 'There is no next step.';
  return `Next is "${next.description}" because it is the first unfinished step in ${goal.name}. ${getCapabilityDescription(next.action)}`;
}

export function createOwnerApprovalMessage(goal) {
  if (!goal) return 'No goal needs approval.';
  return `Plan ready: ${summarizePlan(goal)} Say "tj approve goal" to start it, or "tj reject goal".`;
}

export function createProgressReport(goal) {
  if (!goal) return 'No active goal.';
  const next = getNextGoalStep(goal);
  return `${goal.name}: ${getGoalProgress(goal)}% complete. Next: ${next?.description || 'none'}.`;
}

export function createBlockedReport(goal, reason = '') {
  if (!goal) return 'No blocked goal.';
  const blocker = reason || goal.blockers?.[0]?.reason || 'blocked';
  return `${goal.name} is blocked: ${blocker}.`;
}
