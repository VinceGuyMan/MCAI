import { getSkill } from '../bot/skillRegistry.js';
import { validateSkillRunnerAllowlist } from '../bot/skillValidator.js';
import { runSkill, cancelActiveSkill, isSkillRunning } from '../bot/skillRunner.js';
import {
  approveCurriculumSuggestion,
  approveCurriculumTrack,
  cancelCurriculum,
  executeNextCurriculumStep,
  pauseCurriculum
} from '../bot/curriculumExecutor.js';
import { getCurriculumTemplate } from '../bot/curriculumTemplates.js';
import { cancelGoal, getActiveGoal, getGoalByName, pauseGoal, resumeGoal } from '../bot/goals.js';

const BLOCKED_DASHBOARD_SKILLS = new Set([
  'light_portal',
  'safe_nether_entry',
  'enter_nether',
  'build_portal',
  'mine_stone',
  'mine_coal',
  'mine_iron',
  'mine_diamond',
  'deep_mining',
  'cave_mining',
  'build_camp',
  'build_shelter',
  'create_farm',
  'maintain_farm',
  'store_items',
  'withdraw_item',
  'go_to_waypoint',
  'scout_direction',
  'defend_owner',
  'guard_base',
  'engage_hostile'
]);

function getConfig(bot, context = {}) {
  return { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
}

function ownerContext(bot, context = {}) {
  const config = getConfig(bot, context);
  return {
    ...context,
    source: 'dashboard',
    sender: config.ownerUsername || 'ModVinny',
    username: config.ownerUsername || 'ModVinny',
    isOwner: true,
    approved: true,
    config,
    cancellation: context.cancellation || bot?.mcaiCancellation || null,
    actions: context.actions || bot?.mcaiActions || null
  };
}

function structuredFailure(reason, extra = {}) {
  return { ok: false, reason, message: reason, ...extra };
}

function normalizeSkillName(name) {
  const cleaned = String(name || '').trim().toLowerCase().replace(/[?!.,]/g, '').replace(/[-\s]+/g, '_');
  const aliases = new Map([
    ['inventory', 'inventory_summary'],
    ['inventory_status', 'inventory_summary'],
    ['home', 'home_status'],
    ['home_status', 'home_status'],
    ['food', 'food_status'],
    ['food_status', 'food_status'],
    ['armor', 'armor_status'],
    ['armour', 'armor_status'],
    ['storage', 'storage_status'],
    ['mining', 'mining_status'],
    ['farming', 'farming_status'],
    ['map', 'map_status'],
    ['combat', 'combat_status'],
    ['nether', 'nether_checklist'],
    ['nether_checklist', 'nether_checklist'],
    ['skills', 'skills_status']
  ]);
  return aliases.get(cleaned) || cleaned;
}

export function validateDashboardSkillControl(bot, memory, skillName, context = {}) {
  const config = getConfig(bot, context);
  if (config.dashboardAllowSkillRun === false) return structuredFailure('Dashboard skill running is disabled.');

  const normalized = normalizeSkillName(skillName);
  const skill = getSkill(normalized);
  if (!skill) return structuredFailure(`Unknown skill: ${skillName || 'missing'}.`);
  if (!skill.implemented) return structuredFailure(`${skill.name} is not implemented.`);
  if (BLOCKED_DASHBOARD_SKILLS.has(skill.name)) return structuredFailure(`${skill.name} is blocked from dashboard control.`);
  if (config.dashboardAllowDangerousControl !== true && (skill.riskLevel !== 'low' || skill.requiresConfirmation)) {
    return structuredFailure(`${skill.name} is risky and dashboard dangerous control is disabled.`);
  }

  const allowlist = validateSkillRunnerAllowlist(skill);
  if (!allowlist.ok) return structuredFailure(allowlist.reason);
  return { ok: true, skill };
}

export function dashboardStopAll(bot, memory, context = {}) {
  const reason = context.reason || 'dashboard stop';
  const cancellation = context.cancellation || bot?.mcaiCancellation;
  cancellation?.cancelAll?.(reason);
  if (isSkillRunning()) cancelActiveSkill(reason);
  try {
    pauseCurriculum(bot, memory, reason);
  } catch {
    // No active curriculum is fine for the stop button.
  }
  try {
    bot?.pathfinder?.setGoal?.(null);
    bot?.clearControlStates?.();
  } catch {
    // Stop remains best effort for Mineflayer state.
  }
  return { ok: true, message: 'Stopped dashboard-controlled work.', evidence: ['dashboard_stop_triggered'], data: { reason } };
}

export async function dashboardRunSkill(bot, memory, skillName, args = {}, context = {}) {
  const validation = validateDashboardSkillControl(bot, memory, skillName, context);
  if (!validation.ok) return validation;
  const result = await runSkill(bot, memory, validation.skill.name, args || {}, ownerContext(bot, context));
  return {
    ok: Boolean(result.ok),
    message: result.message || result.reason || `${validation.skill.name} finished.`,
    reason: result.reason || '',
    evidence: result.evidence || [],
    data: result
  };
}

export function dashboardApproveCurriculum(bot, memory, name, context = {}) {
  const config = getConfig(bot, context);
  if (config.dashboardAllowCurriculumControl === false) return structuredFailure('Dashboard curriculum control is disabled.');
  const text = String(name || '').trim();
  if (!text) return structuredFailure('Missing curriculum skill or track name.');
  const ctx = ownerContext(bot, context);
  const template = getCurriculumTemplate(text);
  const result = template
    ? approveCurriculumTrack(bot, memory, text, ctx)
    : approveCurriculumSuggestion(bot, memory, text, ctx);
  return {
    ok: Boolean(result.ok),
    message: result.message || result.reason,
    reason: result.reason || '',
    evidence: result.evidence || [],
    data: result
  };
}

export async function dashboardRunCurriculumStep(bot, memory, context = {}) {
  const config = getConfig(bot, context);
  if (config.dashboardAllowCurriculumControl === false) return structuredFailure('Dashboard curriculum control is disabled.');
  const result = await executeNextCurriculumStep(bot, memory, null, ownerContext(bot, context));
  return {
    ok: Boolean(result.ok),
    message: result.message || result.reason,
    reason: result.reason || '',
    evidence: result.evidence || [],
    data: result
  };
}

export function dashboardCancelCurriculum(bot, memory, context = {}) {
  const config = getConfig(bot, context);
  if (config.dashboardAllowCurriculumControl === false) return structuredFailure('Dashboard curriculum control is disabled.');
  const result = cancelCurriculum(bot, memory, context.reason || 'dashboard cancel');
  return {
    ok: Boolean(result.ok),
    message: result.message || result.reason,
    reason: result.reason || '',
    evidence: result.evidence || [],
    data: result
  };
}

function resolveGoal(goalName) {
  const requested = String(goalName || '').trim();
  return requested ? getGoalByName(requested) : getActiveGoal();
}

export function dashboardPauseGoal(bot, memory, goalName, context = {}) {
  if (getConfig(bot, context).dashboardAllowGoalControl === false) return structuredFailure('Dashboard goal control is disabled.');
  const goal = resolveGoal(goalName);
  if (!goal) return structuredFailure('No matching goal.');
  const result = pauseGoal(goal.id, context.reason || 'dashboard pause');
  return { ok: Boolean(result), message: result ? `Paused ${result.name}.` : 'Could not pause goal.', data: result };
}

export function dashboardResumeGoal(bot, memory, goalName, context = {}) {
  if (getConfig(bot, context).dashboardAllowGoalControl === false) return structuredFailure('Dashboard goal control is disabled.');
  const goal = resolveGoal(goalName);
  if (!goal) return structuredFailure('No matching goal.');
  const result = resumeGoal(goal.id);
  return { ok: Boolean(result), message: result ? `Resumed ${result.name}.` : 'Could not resume goal.', data: result };
}

export function dashboardCancelGoal(bot, memory, goalName, context = {}) {
  if (getConfig(bot, context).dashboardAllowGoalControl === false) return structuredFailure('Dashboard goal control is disabled.');
  const goal = resolveGoal(goalName);
  if (!goal) return structuredFailure('No matching goal.');
  const result = cancelGoal(goal.id, context.reason || 'dashboard cancel');
  return { ok: Boolean(result), message: result ? `Cancelled ${result.name}.` : 'Could not cancel goal.', data: result };
}
