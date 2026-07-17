import { getSkill, listImplementedSkills } from './skillRegistry.js';
import {
  MILESTONE_2_RUNNER_ALLOWLIST,
  explainSkillBlockers as explainValidatorBlockers,
  validateSkillCanRun,
  validateSkillRunnerAllowlist
} from './skillValidator.js';
import {
  loadSkillMemory,
  recordSkillFailure,
  recordSkillPartial,
  recordSkillStart,
  recordSkillSuccess
} from './skillMemory.js';
import { isCancelledError } from './cancellation.js';
import {
  captureAfterSnapshot,
  captureBeforeSnapshot,
  createEvidenceRecord,
  explainEvidenceFailure,
  mergeEvidence,
  verifySkillEvidence
} from './progressEvidence.js';

let activeSkill = null;

function now() {
  return Date.now();
}

function normalizeSkillName(name) {
  const cleaned = String(name || '').trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '_');
  const aliases = new Map([
    ['inventory', 'inventory_summary'],
    ['inventory_status', 'inventory_summary'],
    ['inventory_summary', 'inventory_summary'],
    ['home', 'home_status'],
    ['home_status', 'home_status'],
    ['mining', 'mining_status'],
    ['mining_status', 'mining_status'],
    ['mine_status', 'mining_status'],
    ['farming', 'farming_status'],
    ['farm_status', 'farming_status'],
    ['farming_status', 'farming_status'],
    ['nether', 'nether_checklist'],
    ['nether_status', 'nether_checklist'],
    ['nether_checklist', 'nether_checklist'],
      ['skills', 'skills_status'],
      ['skill_status', 'skills_status'],
      ['skills_status', 'skills_status'],
      ['gear', 'gear_status'],
      ['gear_status', 'gear_status'],
      ['enchanting', 'enchant_status'],
      ['enchant_status', 'enchant_status'],
      ['anvil', 'anvil_status'],
      ['anvil_status', 'anvil_status'],
      ['potions', 'potion_status'],
      ['potion_status', 'potion_status'],
      ['brewing', 'brewing_status'],
      ['brewing_status', 'brewing_status'],
      ['nether_gear', 'nether_gear_readiness'],
      ['nether_gear_readiness', 'nether_gear_readiness'],
      ['villagers', 'villager_status'],
      ['villager_status', 'villager_status'],
      ['scan_villagers', 'scan_villagers'],
      ['village', 'village_status'],
      ['village_status', 'village_status'],
      ['trading', 'trade_status'],
      ['trade_status', 'trade_status'],
      ['economy', 'economy_status'],
      ['economy_status', 'economy_status'],
      ['blueprints', 'blueprint_status'],
      ['blueprint', 'blueprint_status'],
      ['blueprint_status', 'blueprint_status'],
      ['list_blueprints', 'list_blueprints'],
      ['blueprint_preview', 'blueprint_preview'],
      ['blueprint_materials', 'blueprint_materials'],
      ['schematic', 'schematic_status'],
      ['schematic_status', 'schematic_status'],
      ['bridge', 'server_bridge_status'],
      ['bridge_status', 'server_bridge_status'],
      ['server_bridge', 'server_bridge_status'],
      ['server_bridge_status', 'server_bridge_status'],
      ['plugin_status', 'server_bridge_status'],
      ['bridge_health', 'bridge_health'],
      ['bridge_events', 'bridge_recent_events'],
      ['bridge_recent_events', 'bridge_recent_events'],
      ['bridge_deaths', 'bridge_recent_deaths'],
      ['bridge_recent_deaths', 'bridge_recent_deaths'],
      ['bridge_advancements', 'bridge_recent_advancements'],
      ['bridge_recent_advancements', 'bridge_recent_advancements'],
      ['bridge_regions', 'bridge_regions']
    ]);
  return aliases.get(cleaned) || cleaned;
}

function uniqueEvidence(evidence) {
  return mergeEvidence(evidence);
}

function normalizeActionResult(output, actionName) {
  if (output && typeof output === 'object' && 'ok' in output) {
    return {
      ok: Boolean(output.ok),
      message: output.message || output.reason || `${actionName} finished.`,
      reason: output.reason || '',
      evidence: Array.isArray(output.evidence) ? output.evidence : [],
      data: output.data ?? output.result ?? null
    };
  }
  if (typeof output === 'string') {
    return { ok: true, message: output, evidence: [], data: null };
  }
  return { ok: true, message: `${actionName} completed.`, evidence: [], data: output ?? null };
}

function cancellationFrom(bot, context) {
  return context?.cancellation || bot?.mcaiCancellation || null;
}

function throwIfCancelled(bot, context) {
  const cancellation = cancellationFrom(bot, context);
  cancellation?.throwIfCancelled?.();
  if (activeSkill?.cancelled) {
    const error = new Error(activeSkill.cancelReason || 'cancelled');
    error.cancelled = true;
    throw error;
  }
}

function buildFailure(skill, runState, reason, error = null, evidence = []) {
  const finishedAt = now();
  const action = skill?.action || runState?.action || null;
  const failureEvidenceName = /timeout/i.test(reason || '') ? 'skill_timed_out' : /cancel/i.test(reason || '') ? 'skill_cancelled' : 'skill_failed';
  return {
    ok: false,
    skillName: skill?.name || runState?.skillName || '',
    action,
    startedAt: runState?.startedAt || finishedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - (runState?.startedAt || finishedAt)),
    evidence: uniqueEvidence([...(runState?.evidence || []), ...normalizeEvidenceInput(evidence), failureEvidenceName, 'skill_failed']),
    reason: reason || error?.message || 'Skill failed.',
    error: error ? { name: error.name, message: error.message } : null
  };
}

function normalizeEvidenceInput(evidence) {
  return Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
}

export function resolveSkill(skillName) {
  const normalized = normalizeSkillName(skillName);
  return getSkill(normalized);
}

export function isSkillRunning() {
  return Boolean(activeSkill);
}

export function getActiveSkill() {
  return activeSkill ? { ...activeSkill, evidence: [...(activeSkill.evidence || [])] } : null;
}

export function getSkillRunStatus() {
  if (!activeSkill) return { running: false, skillName: null, action: null, durationMs: 0 };
  return {
    running: true,
    skillName: activeSkill.skillName,
    action: activeSkill.action,
    startedAt: activeSkill.startedAt,
    durationMs: now() - activeSkill.startedAt,
    cancelled: Boolean(activeSkill.cancelled)
  };
}

export function listRunnableSkills() {
  return listImplementedSkills()
    .filter((skill) => validateSkillRunnerAllowlist(skill).ok)
    .map((skill) => skill.name);
}

export function canRunSkill(bot, memory, skillName, args = {}, context = {}) {
  const skill = resolveSkill(skillName);
  if (!skill) return { ok: false, reason: `unknown skill: ${String(skillName || '') || 'missing'}` };
  if (activeSkill) return { ok: false, reason: `Another skill is already running: ${activeSkill.skillName}` };

  if (context.source === 'idleAutonomy') {
    const allowed = new Set(context.config?.idleAutonomyAllowedSkills || bot?.mcaiConfig?.idleAutonomyAllowedSkills || []);
    if (allowed.size && !allowed.has(skill.name)) {
      return { ok: false, reason: `Idle autonomy is not allowed to run skill: ${skill.name}` };
    }
    if (skill.riskLevel !== 'low' || skill.requiresConfirmation) {
      return { ok: false, reason: `Idle autonomy can only run low-risk status skills: ${skill.name}` };
    }
  }

  const skillMemory = loadSkillMemory();
  const validation = validateSkillCanRun(bot, memory, skill, args, {
    ...context,
    runner: true,
    skillMemory,
    cancellation: cancellationFrom(bot, context)
  });
  return validation.ok ? { ok: true, skill } : validation;
}

export function explainWhySkillCannotRun(bot, memory, skillName, args = {}, context = {}) {
  const skill = resolveSkill(skillName);
  if (!skill) return [`Unknown skill: ${String(skillName || '') || 'missing'}`];
  if (activeSkill) return [`Another skill is already running: ${activeSkill.skillName}`];
  return explainValidatorBlockers(bot, memory, skill, args, {
    ...context,
    runner: true,
    skillMemory: loadSkillMemory(),
    cancellation: cancellationFrom(bot, context)
  });
}

export function prepareSkillRun(bot, memory, skill, args = {}, context = {}) {
  const cancellation = cancellationFrom(bot, context);
  const runState = {
    skillName: skill.name,
    action: skill.action,
    args,
    context: {
      sender: context.sender || context.username || '',
      source: context.source || 'skill_runner'
    },
    startedAt: now(),
    evidence: ['skill_started'],
    cancelled: false,
    cancelReason: '',
    finalized: false,
    cancellation,
    removeCancelHandler: null,
    timeoutId: null
  };

  if (cancellation?.onCancel) {
    runState.removeCancelHandler = cancellation.onCancel(({ reason }) => {
      if (activeSkill?.skillName === skill.name) {
        activeSkill.cancelled = true;
        activeSkill.cancelReason = reason || 'cancelled';
      }
    });
  }

  activeSkill = runState;
  const startRecord = recordSkillStart(skill.name, { ...runState.context, action: skill.action });
  runState.runId = startRecord?.id || null;
  return runState;
}

export async function executeSkillAction(bot, memory, skill, args = {}, context = {}) {
  const actions = context.actions || bot?.mcaiActions;
  if (!actions) return { ok: false, reason: 'actions.js is not available to the skill runner' };
  if (typeof actions.executeAction === 'function') {
    return normalizeActionResult(await actions.executeAction(skill.action, args, { ...context, skillName: skill.name }), skill.action);
  }
  const handler = actions[skill.action];
  if (typeof handler !== 'function') return { ok: false, reason: `Action ${skill.action} is not wired.` };
  return normalizeActionResult(await handler(args, context), skill.action);
}

export function finishSkillRun(bot, memory, runState, result) {
  if (runState?.finalized) return buildFailure({ name: runState.skillName, action: runState.action }, runState, runState.cancelReason || 'cancelled');
  const finishedAt = now();
  if (runState.timeoutId) clearTimeout(runState.timeoutId);
  runState.removeCancelHandler?.();
  runState.finalized = true;
  const evidence = uniqueEvidence([
    ...(runState.evidence || []),
    ...(result?.evidence || []),
    'skill_completed'
  ]);
  const resultStatus = result?.evidenceReport?.status === 'partial' ? 'partial' : 'success';
  const finalResult = {
    ok: true,
    resultStatus,
    skillName: runState.skillName,
    action: runState.action,
    startedAt: runState.startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - runState.startedAt),
    evidence,
    evidenceSummary: result?.evidenceReport?.summary || '',
    result: result?.data ?? result?.result ?? {},
    message: result?.message || `${runState.skillName} completed.`
  };
  if (resultStatus === 'partial') recordSkillPartial(runState.skillName, evidence, finalResult.durationMs, finalResult.evidenceSummary || 'partial evidence', { runId: runState.runId });
  else recordSkillSuccess(runState.skillName, evidence, finalResult.durationMs, finalResult.message, { runId: runState.runId });
  activeSkill = null;
  return finalResult;
}

export function failSkillRun(bot, memory, runState, reason, error = null, evidence = []) {
  if (runState?.finalized) return buildFailure({ name: runState.skillName, action: runState.action }, runState, reason || runState.cancelReason || 'cancelled', error, evidence);
  if (runState?.timeoutId) clearTimeout(runState.timeoutId);
  runState?.removeCancelHandler?.();
  if (runState) runState.finalized = true;
  const skill = runState ? { name: runState.skillName, action: runState.action } : null;
  const finalResult = buildFailure(skill, runState, reason, error, evidence);
  finalResult.resultStatus = /timeout/i.test(finalResult.reason) ? 'timeout' : /cancel/i.test(finalResult.reason) ? 'cancelled' : 'failed';
  finalResult.evidenceSummary = finalResult.evidence?.length ? finalResult.evidence.map((item) => typeof item === 'string' ? item : `${item.name}:${item.status}`).slice(0, 6).join(', ') : '';
  if (runState?.skillName) recordSkillFailure(runState.skillName, finalResult.reason, finalResult.durationMs, finalResult.evidence, { runId: runState.runId });
  if (activeSkill?.skillName === runState?.skillName) activeSkill = null;
  return finalResult;
}

export function cancelActiveSkill(reason = 'cancelled') {
  if (!activeSkill) return { ok: false, reason: 'No active skill is running.' };
  const runState = activeSkill;
  runState.cancelled = true;
  runState.cancelReason = reason;
  runState.cancellation?.cancelAll?.(reason);
  failSkillRun(null, null, runState, 'cancelled', null, [
    createEvidenceRecord('skill_cancelled', 'verified', { source: 'skillRunner', confidence: 'high', details: { reason } })
  ]);
  return { ok: true, skillName: runState.skillName, reason };
}

export async function runSkill(bot, memory, skillName, args = {}, context = {}) {
  const skill = resolveSkill(skillName);
  if (!skill) return buildFailure(null, null, `unknown skill: ${String(skillName || '') || 'missing'}`);

  const canRun = canRunSkill(bot, memory, skill.name, args, context);
  if (!canRun.ok) return buildFailure(skill, null, canRun.reason);

  const beforeSnapshot = captureBeforeSnapshot(bot, memory, skill, args);
  const runState = prepareSkillRun(bot, memory, skill, args, context);
  runState.beforeSnapshot = beforeSnapshot;
  try {
    throwIfCancelled(bot, context);
    const timeoutMs = Math.max(1, Number(context.timeoutMs || skill.maxRuntimeMs) || 10000);
    const timeoutPromise = new Promise((_, reject) => {
      runState.timeoutId = setTimeout(() => {
        const error = new Error('Skill timed out.');
        error.timedOut = true;
        runState.cancelled = true;
        runState.cancelReason = 'Skill timed out.';
        runState.cancellation?.cancelAll?.('Skill timed out.');
        reject(error);
      }, timeoutMs);
    });
    const actionResult = await Promise.race([
      executeSkillAction(bot, memory, skill, args, context),
      timeoutPromise
    ]);
    throwIfCancelled(bot, context);
    const afterSnapshot = captureAfterSnapshot(bot, memory, skill, args);
    runState.afterSnapshot = afterSnapshot;
    const evidenceReport = verifySkillEvidence(bot, memory, skill, args, beforeSnapshot, afterSnapshot, actionResult);

    if (!actionResult?.ok) {
      return failSkillRun(bot, memory, runState, actionResult?.reason || actionResult?.message || 'Action failed.', null, evidenceReport.evidence);
    }

    if (evidenceReport.status === 'failed') {
      return failSkillRun(bot, memory, runState, explainEvidenceFailure(evidenceReport.evidence) || 'Required evidence failed.', null, evidenceReport.evidence);
    }

    return finishSkillRun(bot, memory, runState, { ...actionResult, evidence: evidenceReport.evidence, evidenceReport });
  } catch (error) {
    const reason = error?.timedOut ? 'Skill timed out.' : isCancelledError(error) || runState.cancelled ? 'cancelled' : error?.message || 'Skill failed.';
    const evidenceName = error?.timedOut ? 'skill_timed_out' : isCancelledError(error) || runState.cancelled ? 'skill_cancelled' : 'skill_failed';
    return failSkillRun(bot, memory, runState, reason, error, [
      createEvidenceRecord(evidenceName, 'verified', { source: 'skillRunner', confidence: 'high', details: { reason } })
    ]);
  }
}

export { MILESTONE_2_RUNNER_ALLOWLIST };
