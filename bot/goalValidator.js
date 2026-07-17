import { getCapability, hasCapability } from './capabilities.js';

const allowedTypes = new Set(['mining', 'base', 'food', 'survival', 'exploration', 'combat', 'nether_prep', 'custom']);
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const allowedRisks = new Set(['low', 'medium', 'high']);
const forbiddenRawWords = /\b(raw movement|bot\.pathfinder|bot\.dig|bot\.attack|bot\.placeBlock|goto\(|dig straight down|x-ray|\/locate|teleport|tp )\b/i;

export function sanitizeGoalText(text) {
  return String(text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function isAllowedGoalAction(actionName) {
  const capability = getCapability(actionName);
  return Boolean(capability?.implemented);
}

export function detectStepRisk(step = {}) {
  const capability = getCapability(step.action);
  if (!capability) return 'high';
  if (step.riskLevel && allowedRisks.has(step.riskLevel)) return step.riskLevel;
  return capability.riskLevel || 'medium';
}

export function requiresConfirmation(step = {}) {
  const action = String(step.action || '');
  const capability = getCapability(action);
  if (step.requiresConfirmation || capability?.requiresConfirmation) return true;
  if (/diamond|light_portal|safe_nether_entry|enter_nether|nether exploration|nether mining|fortress|bastion|deep|caving|pvp|major|large/i.test(`${action} ${step.description || ''}`)) return true;
  return false;
}

export function normalizeGoalStep(step = {}, index = 0) {
  const action = String(step.action || '').trim();
  const riskLevel = detectStepRisk({ ...step, action });
  return {
    id: step.id || `step_${index + 1}`,
    description: sanitizeGoalText(step.description || action || 'Goal step'),
    action,
    args: step.args && typeof step.args === 'object' ? step.args : {},
    status: step.status || 'pending',
    riskLevel,
    requiresConfirmation: requiresConfirmation({ ...step, action, riskLevel }),
    successCriteria: step.successCriteria || { type: 'action_result', description: 'Step returns a safe result.' },
    startedAt: step.startedAt ?? null,
    completedAt: step.completedAt ?? null,
    failedAt: step.failedAt ?? null,
    retryCount: Number.isInteger(step.retryCount) ? step.retryCount : 0,
    maxRetries: Number.isInteger(step.maxRetries) ? step.maxRetries : 2,
    lastError: step.lastError ?? null
  };
}

export function detectGoalRisk(goal = {}) {
  if (goal.requiresConfirmation) return 'high';
  const risks = (goal.steps || []).map(detectStepRisk);
  if (risks.includes('high')) return 'high';
  if (risks.includes('medium')) return 'medium';
  return goal.riskLevel || 'low';
}

export function normalizeGoal(goal = {}, config = {}) {
  const maxSteps = config.maxGoalSteps || 12;
  const steps = Array.isArray(goal.steps) ? goal.steps.slice(0, maxSteps).map(normalizeGoalStep) : [];
  const riskLevel = allowedRisks.has(goal.riskLevel) ? goal.riskLevel : detectGoalRisk({ ...goal, steps });
  return {
    ...goal,
    name: sanitizeGoalText(goal.name || 'Unnamed Goal').slice(0, 80),
    type: allowedTypes.has(goal.type) ? goal.type : 'custom',
    priority: allowedPriorities.has(goal.priority) ? goal.priority : 'normal',
    description: sanitizeGoalText(goal.description || ''),
    reason: sanitizeGoalText(goal.reason || ''),
    riskLevel,
    requiresConfirmation: Boolean(goal.requiresConfirmation || riskLevel === 'high' || steps.some((step) => step.requiresConfirmation)),
    steps
  };
}

export function validateGoalStep(step = {}, config = {}) {
  const normalized = normalizeGoalStep(step);
  const text = `${normalized.description} ${normalized.action} ${JSON.stringify(normalized.args)}`;
  if (!normalized.action) return { ok: false, reason: 'missing action', step: normalized };
  if (!hasCapability(normalized.action)) return { ok: false, reason: `unsupported action: ${normalized.action}`, step: normalized };
  if (!getCapability(normalized.action)?.implemented) return { ok: false, reason: `unimplemented action: ${normalized.action}`, step: normalized };
  if (forbiddenRawWords.test(text)) return { ok: false, reason: 'raw movement/dig/attack/place commands are blocked', step: normalized };
  if (/nether_travel|nether exploration|nether mining|fortress|bastion/i.test(text)) return { ok: false, reason: 'Nether exploration/mining/structure search is blocked in this phase', step: normalized };
  if (/enter_nether|use_portal|light_portal|safe_nether_entry/i.test(text)) normalized.requiresConfirmation = true;
  if (/pvp|attack player/i.test(text)) return { ok: false, reason: 'PVP goals are blocked', step: normalized };
  if (/diamond/i.test(text) && !config.allowPlannerToUseDiamonds) normalized.requiresConfirmation = true;
  if (/deep mining|caving|cave mine/i.test(text) && (!config.allowPlannerToStartDeepMining || !config.allowPlannerToStartCaving)) normalized.requiresConfirmation = true;
  return { ok: true, step: normalized };
}

export function enforceGoalLimits(goal = {}, config = {}) {
  const maxSteps = config.maxGoalSteps || 12;
  if ((goal.steps || []).length > maxSteps) return { ok: false, reason: `goal has more than ${maxSteps} steps` };
  return { ok: true };
}

export function validateGoal(goal = {}, config = {}) {
  const normalized = normalizeGoal(goal, config);
  const limits = enforceGoalLimits(normalized, config);
  if (!limits.ok) return { ok: false, reason: limits.reason, goal: normalized };
  if (!normalized.name) return { ok: false, reason: 'missing goal name', goal: normalized };
  if (!allowedTypes.has(normalized.type)) return { ok: false, reason: `unsupported goal type: ${normalized.type}`, goal: normalized };
  if (forbiddenRawWords.test(`${normalized.name} ${normalized.description} ${normalized.reason}`)) {
    return { ok: false, reason: 'goal contains raw unsafe control text', goal: normalized };
  }
  if (normalized.type === 'nether_prep') {
    normalized.requiresConfirmation = true;
    normalized.riskLevel = 'high';
  }
  if (/nether exploration|nether mining|fortress|bastion/i.test(`${normalized.name} ${normalized.description} ${normalized.reason}`)) {
    return { ok: false, reason: 'Nether exploration/mining/structure search is blocked in this phase', goal: normalized };
  }

  for (let i = 0; i < normalized.steps.length; i += 1) {
    const checked = validateGoalStep(normalized.steps[i], config);
    if (!checked.ok) return { ok: false, reason: checked.reason, goal: normalized };
    normalized.steps[i] = checked.step;
  }

  return { ok: true, goal: normalized };
}

export function rejectUnsafeGoal(goal, reason) {
  return { ok: false, reason, goal };
}
