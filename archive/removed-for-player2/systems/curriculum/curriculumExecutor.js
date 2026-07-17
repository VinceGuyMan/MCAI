import { getSkill } from '../../skillRegistry.js';
import { runSkill, cancelActiveSkill } from '../../skillRunner.js';
import { getCurriculumTemplate, normalizeCurriculumTemplateName } from './curriculumTemplates.js';
import {
  canCurriculumExecuteSkill,
  explainCurriculumExecutionBlockers,
  validateCurriculumApproval
} from './curriculumGuard.js';
import {
  clearActiveCurriculum as clearActiveCurriculumMemory,
  createCurriculumSession as storeCurriculumSession,
  getActiveCurriculum as loadActiveCurriculum,
  getCurriculumHistory,
  getExecutionHistory,
  getLastSuggestions,
  loadCurriculumMemory,
  recordCurriculumCancel,
  recordCurriculumComplete,
  recordCurriculumPause,
  recordCurriculumStepFailure,
  recordCurriculumStepPartial,
  recordCurriculumStepStart,
  recordCurriculumStepSuccess,
  setActiveCurriculum,
  updateCurriculumSession
} from './curriculumMemory.js';
import { createEvidenceRecord, mergeEvidence, summarizeEvidence } from '../../progressEvidence.js';

const ALLOWED_STEP_STATUSES = new Set(['pending', 'approved', 'partial']);
const DONE_STEP_STATUSES = new Set(['completed', 'skipped', 'cancelled']);

function now() {
  return Date.now();
}

function createId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfig(bot, context = {}) {
  return { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
}

function ownerName(bot, context = {}) {
  return context.sender || context.username || bot?.mcaiConfig?.ownerUsername || context.config?.ownerUsername || 'ModVinny';
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
    ['armor_status', 'armor_status'],
    ['storage', 'storage_status'],
    ['storage_status', 'storage_status'],
    ['mining', 'mining_status'],
    ['mine_status', 'mining_status'],
    ['mining_status', 'mining_status'],
    ['farming', 'farming_status'],
    ['farm_status', 'farming_status'],
    ['farming_status', 'farming_status'],
    ['map', 'map_status'],
    ['map_status', 'map_status'],
    ['goals', 'goals_status'],
    ['goal_status', 'goals_status'],
    ['combat', 'combat_status'],
    ['combat_status', 'combat_status'],
    ['nether', 'nether_checklist'],
    ['nether_status', 'nether_checklist'],
    ['nether_checklist', 'nether_checklist'],
    ['skills', 'skills_status'],
    ['skills_status', 'skills_status'],
    ['gear', 'gear_status'],
    ['gear_status', 'gear_status'],
    ['gear_upgrades', 'suggest_gear_upgrades'],
    ['suggest_gear_upgrades', 'suggest_gear_upgrades'],
    ['enchanting', 'enchant_status'],
    ['enchant_status', 'enchant_status'],
    ['anvil', 'anvil_status'],
    ['anvil_status', 'anvil_status'],
    ['potions', 'potion_status'],
    ['potion_status', 'potion_status'],
    ['brewing', 'brewing_status'],
    ['brewing_status', 'brewing_status'],
    ['nether_gear', 'nether_gear_readiness'],
    ['nether_gear_readiness', 'nether_gear_readiness']
  ]);
  return aliases.get(cleaned) || cleaned;
}

function curriculumEvidence(name, status = 'verified', details = {}) {
  return createEvidenceRecord(name, status, {
    source: 'curriculumExecutor',
    confidence: 'high',
    details
  });
}

function compactEvidence(evidence) {
  return mergeEvidence(evidence || []).slice(0, 30);
}

function activeBlocksNewSession(active) {
  return active && !['completed', 'failed', 'cancelled'].includes(active.status);
}

function refreshSession(curriculumId) {
  const memory = loadCurriculumMemory();
  return memory.curriculumSessions.find((item) => item.id === curriculumId) || null;
}

function firstPendingStep(curriculum) {
  return (curriculum?.steps || []).find((step) => ALLOWED_STEP_STATUSES.has(step.status))
    || (curriculum?.steps || []).find((step) => step.status === 'blocked')
    || null;
}

function remainingExecutableSteps(curriculum) {
  return (curriculum?.steps || []).filter((step) => ALLOWED_STEP_STATUSES.has(step.status));
}

function buildStepFromSkill(skill, index = 0, sourceStep = {}) {
  return {
    id: sourceStep.id || `curr_step_${index + 1}`,
    skillName: skill.name,
    description: sourceStep.description || skill.description || `Run ${skill.name}.`,
    status: sourceStep.executableInMilestone5 === false ? 'blocked' : 'approved',
    riskLevel: sourceStep.riskLevel || skill.riskLevel || 'low',
    requiresConfirmation: Boolean(sourceStep.requiresConfirmation || skill.requiresConfirmation),
    args: {},
    suggestedCommand: `tj run skill ${skill.name}`,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    result: null,
    evidence: [],
    blockers: sourceStep.executableInMilestone5 === false ? [sourceStep.reasonIfBlocked || 'blocked for Milestone 5 curriculum execution'] : []
  };
}

function buildSingleSkillSession(skill, options = {}) {
  const timestamp = now();
  const step = buildStepFromSkill(skill, 0, { executableInMilestone5: true });
  return {
    id: createId('curr'),
    name: skill.name,
    type: 'single_skill',
    status: options.approved ? 'approved' : 'pending_approval',
    createdAt: timestamp,
    approvedAt: options.approved ? timestamp : null,
    startedAt: null,
    updatedAt: timestamp,
    completedAt: null,
    createdBy: options.createdBy || 'ModVinny',
    approvedBy: options.approved ? options.approvedBy || 'ModVinny' : null,
    currentStepId: step.id,
    riskLevel: skill.riskLevel || 'low',
    requiresConfirmation: Boolean(skill.requiresConfirmation),
    steps: [step],
    evidence: options.approved ? [curriculumEvidence('curriculum_skill_approved', 'verified', { skillName: skill.name })] : [],
    blockers: [],
    lastResult: null,
    pauseReason: '',
    failureReason: ''
  };
}

function buildTrackSession(template, options = {}) {
  const timestamp = now();
  const steps = (template.steps || []).map((step, index) => {
    const skill = getSkill(step.skillName);
    if (!skill) {
      return {
        id: `curr_step_${index + 1}`,
        skillName: step.skillName,
        description: step.description || `Run ${step.skillName}.`,
        status: 'blocked',
        riskLevel: step.riskLevel || 'high',
        requiresConfirmation: true,
        args: {},
        suggestedCommand: null,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        result: null,
        evidence: [],
        blockers: [`${step.skillName} is not registered`]
      };
    }
    return buildStepFromSkill(skill, index, step);
  });
  const first = steps.find((step) => step.status === 'approved') || steps[0] || null;
  return {
    id: createId('curr'),
    name: template.displayName,
    type: 'track',
    status: options.approved ? 'approved' : 'pending_approval',
    createdAt: timestamp,
    approvedAt: options.approved ? timestamp : null,
    startedAt: null,
    updatedAt: timestamp,
    completedAt: null,
    createdBy: options.createdBy || 'ModVinny',
    approvedBy: options.approved ? options.approvedBy || 'ModVinny' : null,
    currentStepId: first?.id || null,
    riskLevel: template.riskLevel || 'low',
    requiresConfirmation: Boolean(template.requiresConfirmation),
    steps,
    evidence: options.approved ? [curriculumEvidence('curriculum_track_approved', 'verified', { trackName: template.name })] : [],
    blockers: steps.filter((step) => step.status === 'blocked').map((step) => `${step.skillName}: ${step.blockers[0]}`).slice(0, 10),
    lastResult: null,
    pauseReason: '',
    failureReason: ''
  };
}

function structuredFailure(reason, extra = {}) {
  return {
    ok: false,
    reason,
    message: reason,
    evidence: [curriculumEvidence('curriculum_blocked', 'verified', { reason })],
    ...extra
  };
}

export function getActiveCurriculum() {
  return loadActiveCurriculum();
}

export function clearActiveCurriculum() {
  return clearActiveCurriculumMemory();
}

export function getNextCurriculumStep(memory = null) {
  return firstPendingStep(loadActiveCurriculum());
}

export function getCurriculumProgress(memory = null) {
  const curriculum = loadActiveCurriculum();
  if (!curriculum) return { active: false, total: 0, completed: 0, blocked: 0, remaining: 0, progressPercent: 0 };
  const total = curriculum.steps.length;
  const completed = curriculum.steps.filter((step) => step.status === 'completed').length;
  const blocked = curriculum.steps.filter((step) => step.status === 'blocked').length;
  const remaining = curriculum.steps.filter((step) => !DONE_STEP_STATUSES.has(step.status) && step.status !== 'blocked').length;
  return {
    active: true,
    curriculumId: curriculum.id,
    name: curriculum.name,
    status: curriculum.status,
    total,
    completed,
    blocked,
    remaining,
    progressPercent: total ? Math.round((completed / total) * 100) : 0,
    nextStep: firstPendingStep(curriculum)
  };
}

export function explainCurriculumStatus(memory = null) {
  const active = loadActiveCurriculum();
  if (!active) return 'No active curriculum.';
  const progress = getCurriculumProgress(memory);
  const next = progress.nextStep;
  return `${active.name}: ${active.status}, ${progress.completed}/${progress.total} complete.${next ? ` Next: ${next.skillName}.` : ''}`;
}

export function explainNextStep(memory = null) {
  const step = getNextCurriculumStep(memory);
  if (!step) return 'No next curriculum step.';
  if (step.status === 'blocked') return `Next curriculum step is blocked: ${step.skillName}. ${step.blockers?.[0] || 'No reason recorded.'}`;
  return `Next curriculum step: ${step.skillName}. It is a ${step.riskLevel} readiness check.`;
}

export function getCurriculumExecutionStatus(bot, memory) {
  const config = getConfig(bot);
  const active = loadActiveCurriculum();
  const history = getCurriculumHistory(5);
  return {
    ok: true,
    enabled: Boolean(config.curriculumExecutionEnabled),
    autonomous: Boolean(config.allowAutonomousCurriculum),
    oneStepPerApproval: (config.maxCurriculumStepsPerApproval || 1) === 1,
    activeCurriculum: active,
    progress: getCurriculumProgress(memory),
    historyCount: history.length
  };
}

export function createCurriculumSession(bot, memory, trackNameOrSuggestion, options = {}) {
  const active = loadActiveCurriculum();
  if (activeBlocksNewSession(active)) return structuredFailure(`Curriculum already active: ${active.name}. Cancel it before approving another.`);

  if (typeof trackNameOrSuggestion === 'object' && trackNameOrSuggestion?.skillName) {
    return approveCurriculumSuggestion(bot, memory, trackNameOrSuggestion.skillName, options);
  }
  if (typeof trackNameOrSuggestion === 'object' && trackNameOrSuggestion?.trackName) {
    return approveCurriculumTrack(bot, memory, trackNameOrSuggestion.trackName, options);
  }

  const raw = String(trackNameOrSuggestion || '').trim();
  const track = getCurriculumTemplate(raw);
  if (track) return approveCurriculumTrack(bot, memory, raw, options);
  return approveCurriculumSuggestion(bot, memory, raw, options);
}

export function approveCurriculumSuggestion(bot, memory, suggestionIdOrSkillName = '', options = {}) {
  const context = { ...options, bot, sender: options.sender || ownerName(bot, options), isOwner: options.isOwner };
  const name = normalizeSkillName(suggestionIdOrSkillName || getLastSuggestions().find((item) => item.skillName)?.skillName || '');
  const skill = getSkill(name);
  if (!skill) return structuredFailure(`Unknown curriculum skill: ${suggestionIdOrSkillName || 'missing'}.`);

  const active = loadActiveCurriculum();
  if (activeBlocksNewSession(active)) return structuredFailure(`Curriculum already active: ${active.name}.`);

  const validation = canCurriculumExecuteSkill(bot, memory, skill, context);
  if (!validation.ok) return structuredFailure(`Cannot approve ${skill.name}: ${validation.blockers.join('; ')}`, { blockers: validation.blockers });

  const session = buildSingleSkillSession(skill, { approved: true, approvedBy: ownerName(bot, context), createdBy: ownerName(bot, context) });
  storeCurriculumSession(session);
  setActiveCurriculum(session.id);
  const stored = refreshSession(session.id);
  return {
    ok: true,
    curriculum: stored,
    message: `Approved ${skill.name}. Say "tj run approved curriculum step" to run it.`,
    evidence: [curriculumEvidence('curriculum_skill_approved', 'verified', { skillName: skill.name }), curriculumEvidence('curriculum_approved', 'verified', { curriculumId: session.id })]
  };
}

export function approveCurriculumTrack(bot, memory, trackName, options = {}) {
  const context = { ...options, bot, sender: options.sender || ownerName(bot, options), isOwner: options.isOwner };
  const active = loadActiveCurriculum();
  if (activeBlocksNewSession(active)) return structuredFailure(`Curriculum already active: ${active.name}.`);
  const normalized = normalizeCurriculumTemplateName(trackName);
  const template = getCurriculumTemplate(normalized);
  if (!template) return structuredFailure(`Unknown curriculum track: ${trackName || 'missing'}.`);

  const owner = canCurriculumExecuteSkill(bot, memory, 'status', context);
  if (!owner.ok && owner.blockers.includes('Only ModVinny can approve or run curriculum steps.')) {
    return structuredFailure('Only ModVinny can approve curriculum tracks.', { blockers: owner.blockers });
  }

  const session = buildTrackSession(template, { approved: true, approvedBy: ownerName(bot, context), createdBy: ownerName(bot, context) });
  storeCurriculumSession(session);
  setActiveCurriculum(session.id);
  const stored = refreshSession(session.id);
  return {
    ok: true,
    curriculum: stored,
    message: `Approved ${template.displayName}. Next step: ${firstPendingStep(stored)?.skillName || 'none'}. Say "tj run approved curriculum step" to run one step.`,
    evidence: [curriculumEvidence('curriculum_track_approved', 'verified', { trackName: template.name }), curriculumEvidence('curriculum_approved', 'verified', { curriculumId: session.id })]
  };
}

export function startApprovedCurriculum(bot, memory, curriculumId) {
  const curriculum = curriculumId ? refreshSession(curriculumId) : loadActiveCurriculum();
  if (!curriculum) return structuredFailure('No approved curriculum session found.');
  if (!['approved', 'paused'].includes(curriculum.status)) return structuredFailure(`Curriculum is ${curriculum.status}.`);
  const updated = updateCurriculumSession(curriculum.id, { status: 'active', startedAt: curriculum.startedAt || now(), pauseReason: '' });
  setActiveCurriculum(curriculum.id);
  return { ok: true, curriculum: updated, message: `${updated.name} is ready for one step.` };
}

export function validateCurriculumStepForExecution(bot, memory, step, context = {}) {
  const curriculum = context.curriculum || loadActiveCurriculum();
  const approval = validateCurriculumApproval(memory, curriculum, step);
  if (!approval.ok) return { ok: false, reason: approval.reason, blockers: [approval.reason] };
  if (step.status === 'blocked') return { ok: false, reason: step.blockers?.[0] || 'step is blocked', blockers: step.blockers || ['step is blocked'] };
  const skill = getSkill(step.skillName);
  if (!skill) return { ok: false, reason: `unknown skill: ${step.skillName}`, blockers: [`unknown skill: ${step.skillName}`] };
  const validation = canCurriculumExecuteSkill(bot, memory, skill, {
    ...context,
    approved: true,
    sender: context.sender || ownerName(bot, context)
  });
  return validation.ok ? { ok: true, skill, blockers: [] } : validation;
}

export function canExecuteCurriculumStep(bot, memory, step, context = {}) {
  return validateCurriculumStepForExecution(bot, memory, step, context);
}

export async function executeApprovedSkillStep(bot, memory, step, context = {}) {
  const validation = validateCurriculumStepForExecution(bot, memory, step, context);
  if (!validation.ok) return structuredFailure(validation.reason, { blockers: validation.blockers || [] });
  const curriculum = context.curriculum || loadActiveCurriculum();
  const config = getConfig(bot, context);
  const result = await runSkill(bot, memory, step.skillName, step.args || {}, {
    ...context,
    source: 'curriculum',
    curriculumId: curriculum?.id,
    curriculumStepId: step.id,
    sender: context.sender || ownerName(bot, context),
    approved: true,
    timeoutMs: Math.min(Number(config.maxCurriculumStepRuntimeMs) || 120000, Number(validation.skill.maxRuntimeMs) || 120000)
  });
  return result;
}

export function recordCurriculumEvidence(memory, curriculumId, stepId, evidence = []) {
  const session = refreshSession(curriculumId);
  if (!session) return null;
  const merged = compactEvidence([...(session.evidence || []), ...evidence, curriculumEvidence('curriculum_evidence_recorded', 'verified', { stepId })]);
  return updateCurriculumSession(curriculumId, { evidence: merged });
}

export function recordCurriculumStepResult(memory, curriculumId, stepId, result) {
  const evidence = compactEvidence(result?.evidence || []);
  if (result?.ok && result.resultStatus !== 'partial') {
    const step = recordCurriculumStepSuccess(curriculumId, stepId, result, [...evidence, curriculumEvidence('curriculum_step_completed', 'verified', { stepId })]);
    recordCurriculumEvidence(memory, curriculumId, stepId, step.evidence);
    return step;
  }
  if (result?.resultStatus === 'partial') {
    const step = recordCurriculumStepPartial(curriculumId, stepId, result, [...evidence, curriculumEvidence('curriculum_step_partial', 'verified', { stepId })], result.evidenceSummary || 'partial evidence');
    recordCurriculumEvidence(memory, curriculumId, stepId, step.evidence);
    return step;
  }
  const name = /timeout/i.test(result?.reason || '') ? 'curriculum_step_timed_out' : /cancel/i.test(result?.reason || '') ? 'curriculum_step_cancelled' : 'curriculum_step_failed';
  const step = recordCurriculumStepFailure(curriculumId, stepId, result?.reason || result?.message || 'step failed', [...evidence, curriculumEvidence(name, 'verified', { stepId, reason: result?.reason || '' })]);
  recordCurriculumEvidence(memory, curriculumId, stepId, step.evidence);
  return step;
}

export async function executeNextCurriculumStep(bot, memory, curriculumId = null, context = {}) {
  const curriculum = curriculumId ? refreshSession(curriculumId) : loadActiveCurriculum();
  if (!curriculum) return structuredFailure('No active curriculum. Approve a skill or track first.');
  const step = firstPendingStep(curriculum);
  if (!step) {
    const completed = recordCurriculumComplete(curriculum.id, [curriculumEvidence('curriculum_completed', 'verified', { curriculumId: curriculum.id })]);
    return { ok: true, curriculum: completed, message: `${curriculum.name} is complete.`, evidence: completed.evidence };
  }
  if (step.status === 'blocked') {
    const reason = step.blockers?.[0] || 'step is blocked';
    const updated = updateCurriculumSession(curriculum.id, { status: 'blocked', currentStepId: step.id, pauseReason: reason, blockers: [...(curriculum.blockers || []), `${step.skillName}: ${reason}`] });
    return structuredFailure(`That step is blocked for curriculum execution: ${reason}`, { curriculum: updated, step, blockers: [reason] });
  }

  const validation = validateCurriculumStepForExecution(bot, memory, step, { ...context, curriculum });
  if (!validation.ok) {
    recordCurriculumStepFailure(curriculum.id, step.id, validation.reason, [curriculumEvidence('curriculum_blocked', 'verified', { skillName: step.skillName, reason: validation.reason })]);
    const paused = recordCurriculumPause(curriculum.id, validation.reason);
    return structuredFailure(`That step is blocked for curriculum execution: ${validation.reason}`, { curriculum: paused, step, blockers: validation.blockers || [] });
  }

  recordCurriculumStepStart(curriculum.id, step.id);
  updateCurriculumSession(curriculum.id, { status: 'active', startedAt: curriculum.startedAt || now(), currentStepId: step.id, pauseReason: '' });
  const result = await executeApprovedSkillStep(bot, memory, step, { ...context, curriculum: refreshSession(curriculum.id) });
  const recordedStep = recordCurriculumStepResult(memory, curriculum.id, step.id, result);
  const refreshed = refreshSession(curriculum.id);
  const remaining = remainingExecutableSteps(refreshed).filter((item) => item.id !== step.id);

  if (!result.ok || result.resultStatus === 'partial') {
    const reason = result.evidenceSummary || result.reason || (result.resultStatus === 'partial' ? 'partial evidence' : 'step failed');
    const paused = recordCurriculumPause(curriculum.id, reason);
    return {
      ok: false,
      curriculum: paused,
      step: recordedStep,
      result,
      reason,
      message: `Curriculum step ${step.skillName} did not fully complete: ${reason}. Paused.`,
      evidence: recordedStep?.evidence || result.evidence || []
    };
  }

  if (!remaining.length) {
    const completed = recordCurriculumComplete(curriculum.id, [curriculumEvidence('curriculum_completed', 'verified', { curriculumId: curriculum.id })]);
    return {
      ok: true,
      curriculum: completed,
      step: recordedStep,
      result,
      message: `Curriculum step complete. Evidence: ${summarizeEvidence(recordedStep?.evidence || result.evidence)} Curriculum complete.`,
      evidence: recordedStep?.evidence || result.evidence || []
    };
  }

  const paused = recordCurriculumPause(curriculum.id, 'Paused after one approved step.');
  return {
    ok: true,
    curriculum: paused,
    step: recordedStep,
    result,
    message: `Step complete. Evidence: ${summarizeEvidence(recordedStep?.evidence || result.evidence)} Paused before next step.`,
    evidence: recordedStep?.evidence || result.evidence || []
  };
}

export function pauseCurriculum(bot, memory, reason = 'paused') {
  const active = loadActiveCurriculum();
  if (!active) return structuredFailure('No active curriculum to pause.');
  const paused = recordCurriculumPause(active.id, reason);
  return { ok: true, curriculum: paused, message: `Curriculum paused: ${reason}.`, evidence: [curriculumEvidence('curriculum_paused', 'verified', { reason })] };
}

export function resumeCurriculum(bot, memory, curriculumId = null) {
  const curriculum = curriculumId ? refreshSession(curriculumId) : loadActiveCurriculum();
  if (!curriculum) return structuredFailure('No curriculum session to resume.');
  if (!['paused', 'approved'].includes(curriculum.status)) return structuredFailure(`Curriculum is ${curriculum.status}.`);
  const updated = updateCurriculumSession(curriculum.id, { status: 'approved', pauseReason: '' });
  setActiveCurriculum(curriculum.id);
  return { ok: true, curriculum: updated, message: `Curriculum resumed. Next step: ${firstPendingStep(updated)?.skillName || 'none'}.`, evidence: [curriculumEvidence('curriculum_resumed', 'verified', { curriculumId: curriculum.id })] };
}

export function cancelCurriculum(bot, memory, reason = 'cancelled') {
  const active = loadActiveCurriculum();
  if (!active) return structuredFailure('No active curriculum to cancel.');
  cancelActiveSkill(reason);
  const cancelled = recordCurriculumCancel(active.id, reason);
  return { ok: true, curriculum: cancelled, message: `Curriculum cancelled: ${reason}.`, evidence: [curriculumEvidence('curriculum_step_cancelled', 'verified', { reason }), curriculumEvidence('curriculum_paused', 'verified', { reason })] };
}

export function completeCurriculum(bot, memory, curriculumId, evidence = []) {
  const curriculum = curriculumId ? refreshSession(curriculumId) : loadActiveCurriculum();
  if (!curriculum) return structuredFailure('No curriculum session to complete.');
  const completed = recordCurriculumComplete(curriculum.id, [...evidence, curriculumEvidence('curriculum_completed', 'verified', { curriculumId: curriculum.id })]);
  return { ok: true, curriculum: completed, message: `${completed.name} completed.`, evidence: completed.evidence };
}

export function failCurriculum(bot, memory, curriculumId, reason = 'failed') {
  const curriculum = curriculumId ? refreshSession(curriculumId) : loadActiveCurriculum();
  if (!curriculum) return structuredFailure('No curriculum session to fail.');
  const failed = updateCurriculumSession(curriculum.id, { status: 'failed', failureReason: reason, completedAt: now(), evidence: [...(curriculum.evidence || []), curriculumEvidence('curriculum_failed', 'verified', { reason })] });
  if (loadActiveCurriculum()?.id === curriculum.id) clearActiveCurriculumMemory();
  return { ok: false, curriculum: failed, reason, message: `${curriculum.name} failed: ${reason}.`, evidence: failed.evidence };
}

export function explainCurriculumBlockers(bot, memory, curriculum = null) {
  const session = curriculum || loadActiveCurriculum();
  if (!session) return ['No active curriculum.'];
  const step = firstPendingStep(session);
  if (!step) return [];
  if (step.status === 'blocked') return step.blockers || ['step is blocked'];
  return explainCurriculumExecutionBlockers(bot, memory, step.skillName, { curriculum: session, sender: ownerName(bot) });
}

export function getCurriculumExecutionHistory(limit = 10) {
  return getExecutionHistory(limit);
}
