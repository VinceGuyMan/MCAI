import { getSkill, getSkills } from '../../skillRegistry.js';
import {
  MILESTONE_2_RUNNER_ALLOWLIST,
  explainSuggestionBlockers,
  isSkillSuggestible,
  validateSkillForSuggestion
} from '../../skillValidator.js';
import { loadSkillMemory } from '../../skillMemory.js';
import {
  hasRecentFailedEvidence,
  hasRecentVerifiedEvidence,
  getLastEvidenceForSkill,
  summarizeEvidenceForCurriculum
} from '../../progressEvidence.js';
import {
  buildTrackSuggestion,
  getCurriculumTemplate,
  getCurriculumTemplates,
  listCurriculumTemplates,
  normalizeCurriculumTemplateName
} from './curriculumTemplates.js';
import { rankByScore, scoreSkillCandidate, scoreTrack } from './curriculumScoring.js';
import { MILESTONE_5_EXECUTION_ALLOWLIST } from './curriculumGuard.js';
import {
  getLastSuggestions as loadLastCurriculumSuggestions,
  getSuggestionHistory,
  isSuggestionRecentlyDismissed,
  recordSuggestionAccepted,
  recordSuggestionDismissed,
  recordSuggestions
} from './curriculumMemory.js';

const DEFAULT_CONFIG = {
  curriculumSuggestionsEnabled: true,
  curriculumExecutionEnabled: false,
  allowAutonomousCurriculum: false,
  allowCurriculumToRunSkills: false,
  curriculumSuggestionCooldownMs: 60000,
  maxCurriculumSuggestions: 3,
  maxBlockedSuggestions: 5,
  maxCurriculumTrackSteps: 8,
  curriculumRiskCeiling: 'medium',
  suggestOnlyImplementedSkills: true,
  suggestOnlySafeSkillsByDefault: true,
  includeBlockedSuggestions: true,
  includeEvidenceInSuggestions: true,
  includeRecentFailureReasons: true,
  curriculumPreferLowRiskSkills: true,
  curriculumPreferSkillsWithEvidence: true,
  curriculumAvoidRecentlyFailedSkills: true,
  curriculumAvoidCooldownSkills: true,
  curriculumAvoidDangerousContext: true
};

const riskRank = { low: 1, medium: 2, high: 3 };

function stateFromMemory(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function getConfig(bot, options = {}) {
  return { ...DEFAULT_CONFIG, ...(bot?.mcaiConfig || {}), ...(options.config || {}) };
}

function hasInventoryItem(bot, predicate) {
  try {
    return bot?.inventory?.items?.().some((item) => predicate(item.name, item)) || false;
  } catch {
    return false;
  }
}

function countFood(bot) {
  const foodNames = new Set(['apple', 'baked_potato', 'bread', 'carrot', 'cooked_beef', 'cooked_chicken', 'cooked_cod', 'cooked_mutton', 'cooked_porkchop', 'cooked_salmon', 'golden_apple']);
  try {
    return bot?.inventory?.items?.().filter((item) => foodNames.has(item.name)).reduce((sum, item) => sum + (item.count || 0), 0) || 0;
  } catch {
    return 0;
  }
}

function compactBlockers(blockers, limit = 6) {
  return [...new Set((blockers || []).filter(Boolean).map(String))].slice(0, limit);
}

function priorityFromScore(score) {
  if (score >= 80) return 'high';
  if (score >= 55) return 'normal';
  return 'low';
}

function isRunnerEnabled(skillName) {
  return MILESTONE_2_RUNNER_ALLOWLIST.includes(skillName);
}

function executionBlockersFor(skill, blockers = [], context = {}) {
  const executionBlockers = [];
  if (!skill?.implemented) executionBlockers.push('not implemented');
  if (!isRunnerEnabled(skill?.name)) executionBlockers.push('not enabled in skillRunner');
  if (!MILESTONE_5_EXECUTION_ALLOWLIST.includes(skill?.name)) executionBlockers.push('not enabled for Milestone 5 curriculum execution');
  if (skill?.riskLevel !== 'low') executionBlockers.push(`risk is ${skill?.riskLevel || 'unknown'}`);
  if (skill?.requiresConfirmation) executionBlockers.push('requires confirmation');
  if (context.unsafe) executionBlockers.push('current context is unsafe');
  return compactBlockers([...blockers, ...executionBlockers]);
}

export function normalizeCurriculumOptions(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  return {
    ...options,
    config,
    maxSuggestions: Number(options.maxSuggestions || config.maxCurriculumSuggestions || 3),
    maxBlocked: Number(options.maxBlocked || config.maxBlockedSuggestions || 5),
    includeBlocked: options.includeBlocked ?? config.includeBlockedSuggestions,
    force: Boolean(options.force)
  };
}

export function analyzeCurrentNeeds(bot, memory, context = {}) {
  const state = stateFromMemory(memory);
  const foodCount = countFood(bot);
  const health = Number(bot?.health ?? context.health ?? 20);
  const food = Number(bot?.food ?? context.food ?? 20);
  return {
    food: food < 14 || foodCount < 4,
    safety: Boolean(context.hostileNearby || state.nearbyHostiles?.length || health < 14),
    base: !state.homeBasePosition,
    storage: !(state.knownStorageChests || []).length,
    mining: !hasInventoryItem(bot, (name) => name.endsWith('_pickaxe')),
    exploration: !state.homeBasePosition || food < 14,
    nether: Boolean(context.netherRequested || state.netherPrepStarted || !state.netherPrepCompleted)
  };
}

export function buildCurriculumContext(bot, memory, options = {}) {
  const config = getConfig(bot, options);
  const skillMemory = options.skillMemory || loadSkillMemory();
  const skills = getSkills();
  const skillsByName = Object.fromEntries(skills.map((skill) => [skill.name, skill]));
  const skillStats = skillMemory.skills || {};
  const evidenceBySkill = {};
  for (const skill of skills) {
    const evidence = getLastEvidenceForSkill(skill.name, skillMemory);
    evidenceBySkill[skill.name] = {
      evidence,
      hasVerified: hasRecentVerifiedEvidence(skill.name, skillMemory),
      hasReported: evidence.some((item) => item.status === 'reported'),
      hasFailed: hasRecentFailedEvidence(skill.name, skillMemory),
      summary: summarizeEvidenceForCurriculum(skill.name, skillMemory)
    };
  }
  const needs = analyzeCurrentNeeds(bot, memory, options);
  const unsafe = Boolean(options.unsafe || (config.curriculumAvoidDangerousContext && (needs.safety || bot?.mcaiCancellation?.isCancelled?.())));
  return {
    ...options,
    config,
    skillMemory,
    skills,
    skillsByName,
    skillStats,
    evidenceBySkill,
    needs,
    unsafe,
    runnerAllowlist: MILESTONE_2_RUNNER_ALLOWLIST
  };
}

export function analyzeSkillReadiness(bot, memory, skill, context) {
  return validateSkillForSuggestion(bot, memory, skill, {
    ...context,
    skillMemory: context.skillMemory,
    runnerOnly: true
  });
}

export function analyzeSkillEvidence(skill, skillStats, context = {}) {
  const evidence = context.evidenceBySkill?.[skill.name] || {};
  return {
    hasVerified: Boolean(evidence.hasVerified),
    hasFailed: Boolean(evidence.hasFailed),
    summary: evidence.summary || 'No recent evidence.',
    stats: skillStats?.[skill.name] || {}
  };
}

export function analyzeSkillBlockers(bot, memory, skill, context = {}) {
  return explainSuggestionBlockers(bot, memory, skill, {
    ...context,
    skillMemory: context.skillMemory,
    runnerOnly: true
  });
}

export function shouldAvoidSuggestion(skill, context = {}) {
  const config = context.config || DEFAULT_CONFIG;
  if (!skill) return true;
  if (config.suggestOnlyImplementedSkills && !skill.implemented) return true;
  if (config.suggestOnlySafeSkillsByDefault && (skill.riskLevel === 'high' || skill.requiresConfirmation)) return true;
  if (riskRank[skill.riskLevel] > riskRank[config.curriculumRiskCeiling || 'medium']) return true;
  if (config.curriculumAvoidRecentlyFailedSkills && context.evidenceBySkill?.[skill.name]?.hasFailed) return true;
  const stats = context.skillStats?.[skill.name];
  if (config.curriculumAvoidCooldownSkills && stats?.cooldownUntil > Date.now()) return true;
  if (isSuggestionRecentlyDismissed(skill.name)) return true;
  return false;
}

export function createSkillSuggestion(skill, score, reasons = [], blockers = [], context = {}) {
  const runnable = skill.implemented && isRunnerEnabled(skill.name) && blockers.length === 0;
  const executionBlockers = executionBlockersFor(skill, blockers, context);
  const executableNow = runnable && executionBlockers.length === 0;
  return {
    type: 'skill',
    skillName: skill.name,
    category: skill.category,
    score,
    priority: priorityFromScore(score),
    riskLevel: skill.riskLevel,
    implemented: skill.implemented,
    runnableViaSkillRunner: runnable,
    canRunViaSkillRunner: runnable,
    executableNow,
    executionBlocked: !executableNow,
    executionBlockers,
    approvalRequired: true,
    evidenceAvailable: Boolean(context.evidenceBySkill?.[skill.name]?.hasVerified || context.evidenceBySkill?.[skill.name]?.hasReported),
    requiresConfirmation: skill.requiresConfirmation,
    recommended: runnable,
    reason: reasons.filter(Boolean).join(' ') || `${skill.description}`,
    evidenceSummary: context.evidenceBySkill?.[skill.name]?.summary || 'No recent evidence.',
    blockers: compactBlockers(blockers),
    suggestedCommand: runnable ? `tj run skill ${skill.name}` : null,
    suggestedApprovalCommand: executableNow ? `tj approve curriculum ${skill.name}` : null,
    suggestedRunCommand: executableNow ? 'tj run approved curriculum step' : null
  };
}

export function createBlockedSuggestion(skill, blockers = [], context = {}) {
  const executionBlockers = executionBlockersFor(skill, blockers, context);
  return {
    type: 'blocked_skill',
    skillName: skill?.name || 'unknown',
    category: skill?.category || 'unknown',
    score: skill ? scoreSkillCandidate(skill, context) : 0,
    priority: 'low',
    riskLevel: skill?.riskLevel || 'high',
    implemented: Boolean(skill?.implemented),
    runnableViaSkillRunner: false,
    canRunViaSkillRunner: false,
    executableNow: false,
    executionBlocked: true,
    executionBlockers,
    approvalRequired: true,
    evidenceAvailable: skill ? Boolean(context.evidenceBySkill?.[skill.name]?.hasVerified || context.evidenceBySkill?.[skill.name]?.hasReported) : false,
    requiresConfirmation: Boolean(skill?.requiresConfirmation),
    recommended: false,
    reason: skill ? `${skill.name} is registered, but blocked for curriculum suggestions.` : 'Unknown skills are never suggested.',
    evidenceSummary: skill ? context.evidenceBySkill?.[skill.name]?.summary || 'No recent evidence.' : 'No evidence.',
    blockers: compactBlockers(blockers.length ? blockers : ['blocked']),
    suggestedCommand: null,
    suggestedApprovalCommand: null,
    suggestedRunCommand: null
  };
}

export function rankSkillCandidates(bot, memory, candidates, context) {
  const suggestions = [];
  for (const skill of candidates) {
    const blockers = analyzeSkillBlockers(bot, memory, skill, context);
    const score = scoreSkillCandidate(skill, context);
    const reasons = [];
    if (context.needs?.[skill.category]) reasons.push(`${skill.category} is currently useful.`);
    if (skill.riskLevel === 'low') reasons.push('It is low risk.');
    if (isRunnerEnabled(skill.name)) reasons.push('It is enabled in the safe skill runner.');
    if (context.evidenceBySkill?.[skill.name]?.hasVerified) reasons.push('It has recent verified evidence.');
    else if (context.evidenceBySkill?.[skill.name]?.hasReported) reasons.push('It has recent reported evidence.');

    if (blockers.length || shouldAvoidSuggestion(skill, context) || !isSkillSuggestible(skill, { runnerOnly: true })) {
      suggestions.push(createBlockedSuggestion(skill, blockers.length ? blockers : ['not recommended in current context'], context));
    } else {
      suggestions.push(createSkillSuggestion(skill, score, reasons, [], context));
    }
  }
  return rankByScore(suggestions);
}

export function suggestNextSkills(bot, memory, options = {}) {
  const normalized = normalizeCurriculumOptions(options);
  const context = buildCurriculumContext(bot, memory, normalized);
  if (!context.config.curriculumSuggestionsEnabled) return [];
  if (!normalized.force && !canSuggestNow(memory, context.config)) return getLastCurriculumSuggestions();

  const ranked = rankSkillCandidates(bot, memory, context.skills, context);
  const recommended = ranked.filter((item) => item.recommended).slice(0, normalized.maxSuggestions);
  const blocked = normalized.includeBlocked
    ? ranked.filter((item) => !item.recommended).slice(0, normalized.maxBlocked)
    : [];
  const suggestions = [...recommended, ...blocked];
  recordCurriculumSuggestion(memory, suggestions);
  return suggestions;
}

export function suggestNextSkill(bot, memory, options = {}) {
  return suggestNextSkills(bot, memory, { ...options, maxSuggestions: 1 })[0] || null;
}

export function suggestCurriculumTrack(bot, memory, trackName, options = {}) {
  const context = buildCurriculumContext(bot, memory, normalizeCurriculumOptions(options));
  const track = getCurriculumTemplate(trackName);
  if (!track) return null;
  const skillSuggestions = rankSkillCandidates(
    bot,
    memory,
    track.skills.map((skillName) => getSkill(skillName)).filter(Boolean),
    context
  );
  const blockers = skillSuggestions.filter((item) => !item.recommended).map((item) => `${item.skillName}: ${item.blockers.join(', ')}`);
  const trackSuggestion = {
    ...buildTrackSuggestion(bot, memory, track.name, context),
    score: scoreTrack(track, context),
    skills: skillSuggestions.slice(0, context.config.maxCurriculumTrackSteps || 8),
    blockers: compactBlockers(blockers, 10),
    evidenceSummary: skillSuggestions.map((item) => `${item.skillName}: ${item.evidenceSummary}`).slice(0, 4).join(' | '),
    executableNow: skillSuggestions.some((item) => item.executableNow),
    executionBlocked: !skillSuggestions.some((item) => item.executableNow),
    executionBlockers: compactBlockers(blockers, 10),
    approvalRequired: true,
    suggestedCommand: skillSuggestions.find((item) => item.recommended)?.suggestedCommand || null,
    suggestedApprovalCommand: `tj approve ${track.displayName.toLowerCase()}`,
    suggestedRunCommand: 'tj run approved curriculum step'
  };
  recordCurriculumSuggestion(memory, [{ ...trackSuggestion, type: 'track', trackName: track.name }]);
  return trackSuggestion;
}

export function suggestCurriculumTracks(bot, memory, options = {}) {
  const context = buildCurriculumContext(bot, memory, normalizeCurriculumOptions(options));
  return listCurriculumTemplates()
    .map((track) => ({
      ...track,
      type: 'track',
      trackName: track.name,
      score: scoreTrack(track, context),
      blockers: buildTrackSuggestion(bot, memory, track.name, context)?.blockers || []
    }))
    .sort((a, b) => b.score - a.score);
}

export function explainSuggestion(suggestion, context = {}) {
  if (!suggestion) return 'No curriculum suggestion is available.';
  if (suggestion.type === 'track') return explainCurriculumTrack(suggestion, context);
  if (suggestion.recommended) {
    const approval = suggestion.suggestedApprovalCommand ? `Approve with "${suggestion.suggestedApprovalCommand}".` : '';
    return `Best next practice: ${suggestion.skillName}. ${suggestion.reason} ${suggestion.evidenceSummary} ${approval}`.replace(/\s+/g, ' ').trim();
  }
  return `${suggestion.skillName} is blocked: ${suggestion.blockers.join(', ')}.`;
}

export function explainCurriculumTrack(track, context = {}) {
  if (!track) return 'Unknown curriculum track.';
  const skills = (track.skills || []).map((item) => item.skillName || item).slice(0, 6).join(', ');
  const blockers = track.blockers?.length ? ` Blocked pieces: ${track.blockers.slice(0, 3).join('; ')}.` : '';
  return `${track.displayName || track.trackName}: ${track.description || 'curriculum track'} Skills: ${skills}.${blockers}`;
}

export function listSuggestedCommands(suggestions) {
  return (suggestions || []).map((item) => item.suggestedCommand).filter(Boolean);
}

export function getLastCurriculumSuggestions(memory) {
  return loadLastCurriculumSuggestions();
}

export function recordCurriculumSuggestion(memory, suggestions) {
  const saved = recordSuggestions(suggestions);
  const state = stateFromMemory(memory);
  if (typeof memory?.update === 'function') {
    memory.update({
      ...state,
      lastCurriculumSuggestionAt: saved.lastSuggestionAt,
      lastCurriculumSuggestions: saved.lastSuggestions
    });
  }
  return saved;
}

export function canSuggestNow(memory, config = DEFAULT_CONFIG) {
  const state = stateFromMemory(memory);
  const last = Number(state.lastCurriculumSuggestionAt || loadLastCurriculumSuggestions()?.[0]?.at || 0);
  return Date.now() - last >= Number(config.curriculumSuggestionCooldownMs || DEFAULT_CONFIG.curriculumSuggestionCooldownMs);
}

export function getCurriculumStatus(bot, memory, context = {}) {
  const config = getConfig(bot, context);
  const suggestions = getLastCurriculumSuggestions(memory);
  return {
    enabled: Boolean(config.curriculumSuggestionsEnabled),
    executionEnabled: Boolean(config.curriculumExecutionEnabled && config.allowCurriculumToRunSkills),
    autonomous: Boolean(config.allowAutonomousCurriculum),
    runnerExecutionAllowed: Boolean(config.curriculumExecutionEnabled && config.allowCurriculumToRunSkills && !config.allowAutonomousCurriculum),
    tracks: getCurriculumTemplates().length,
    lastSuggestionAt: suggestions[0]?.at || 0,
    lastSuggestions: suggestions
  };
}

export function acceptLastSuggestion(skillName = '') {
  return recordSuggestionAccepted(skillName);
}

export function dismissLastSuggestion(skillName = '', reason = '') {
  return recordSuggestionDismissed(skillName, reason);
}

export function getCurriculumHistory(limit = 10) {
  return getSuggestionHistory(limit);
}

export { normalizeCurriculumTemplateName };
