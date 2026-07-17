import { getProgressionMilestones, listAvailableMilestones, getMilestone } from './progressionRegistry.js';
import { loadProgressionState, recordProgressionSuggestion } from './progressionState.js';
import { checkMilestone, getMissingEvidence, getMissingPrerequisites, refreshProgressionState } from './progressionTracker.js';
import { getProgressionPath as getNamedProgressionPath, getNextMilestoneInPath, getRecommendedPathName } from './progressionPaths.js';

const RISK_SCORE = { low: 25, medium: 10, high: -35 };
const TIER_SCORE = { tutorial: 20, early: 18, mid: 10, advanced: 4, nether: -8, endgame: -30, postgame: -35 };

function now() {
  return Date.now();
}

function readMemory(memory) {
  if (memory?.get) return memory.get();
  return memory || {};
}

function ownerAskedForRisk(options = {}) {
  const text = String(options.query || options.target || '').toLowerCase();
  return /nether|end|dragon|boss|fortress|bastion/.test(text);
}

function scoreMilestone(milestone, context) {
  let score = 0;
  score += RISK_SCORE[milestone.riskLevel] ?? 0;
  score += TIER_SCORE[milestone.tier] ?? 0;
  if (milestone.implemented) score += 25;
  else score -= 80;
  if (milestone.category === 'survival') score += 20;
  if (['tools', 'food', 'base', 'mining', 'gear'].includes(milestone.category)) score += 12;
  if (milestone.requiresConfirmation) score -= 20;
  if (context.pathNextId === milestone.id) score += 18;
  if (context.availableIds.has(milestone.id)) score += 20;
  if (context.blockedIds.has(milestone.id)) score -= 25;
  if (context.recentBlockedIds.has(milestone.id)) score -= 15;
  if (milestone.category === 'nether' && !ownerAskedForRisk(context.options)) score -= 25;
  if (['end', 'villagers', 'enchanting'].includes(milestone.category) && !ownerAskedForRisk(context.options)) score -= 50;
  return Math.max(0, Math.min(100, score));
}

function priority(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'normal';
  return 'low';
}

function buildSuggestion(milestone, score, context) {
  const checked = checkMilestone(context.bot, context.memory, milestone.id, { state: context.state });
  const missingPrerequisites = checked.missingPrerequisites || [];
  const missingEvidence = checked.missingEvidence || [];
  const blockers = [];
  if (!milestone.implemented) blockers.push('future system not implemented');
  if (missingPrerequisites.length) blockers.push(`missing prerequisites: ${missingPrerequisites.join(', ')}`);
  if (milestone.requiresConfirmation) blockers.push('requires owner confirmation');
  if (milestone.riskLevel === 'high') blockers.push('high risk');

  const recommended = milestone.implemented && missingPrerequisites.length === 0 && milestone.riskLevel !== 'high';
  const reason = recommended
    ? `${milestone.name} is a safe next progression step and helps unlock ${milestone.unlocks.slice(0, 2).join(', ') || 'later milestones'}.`
    : `${milestone.name} is not ready yet: ${blockers.join('; ') || 'missing evidence'}.`;

  return {
    milestoneId: milestone.id,
    name: milestone.name,
    category: milestone.category,
    tier: milestone.tier,
    priority: priority(score),
    score,
    riskLevel: milestone.riskLevel,
    implemented: milestone.implemented,
    recommended,
    reason,
    missingPrerequisites,
    missingEvidence,
    blockers,
    suggestedCommand: recommended ? `tj plan progression ${milestone.id}` : null,
    suggestedGoal: milestone.recommendedGoals[0] || null,
    suggestedCurriculumTrack: mapCategoryToCurriculumTrack(milestone.category, milestone.id),
    evidenceSummary: checked.evidenceSummary || ''
  };
}

function mapCategoryToCurriculumTrack(category, milestoneId) {
  if (/nether/.test(milestoneId) || category === 'nether') return 'progression_nether_check';
  if (category === 'mining' || category === 'tools' || category === 'gear') return 'progression_mining_check';
  if (category === 'base' || category === 'storage') return 'progression_base_check';
  if (category === 'food' || category === 'farming' || category === 'animals') return 'progression_food_security_check';
  if (category === 'exploration') return 'progression_survival_check';
  return 'progression_survival_check';
}

export function suggestNextMilestones(bot, memory, options = {}) {
  const state = options.refresh === false ? loadProgressionState() : refreshProgressionState(bot, memory);
  const available = listAvailableMilestones(state);
  const candidates = available.length ? available : getProgressionMilestones().filter((item) => !state.completedMilestones[item.id]);
  const suggestions = rankMilestones(bot, memory, candidates, { state, options, bot, memory })
    .slice(0, options.limit || options.max || 5);
  recordProgressionSuggestion(suggestions);
  return suggestions;
}

export function suggestNextMilestone(bot, memory, options = {}) {
  return suggestNextMilestones(bot, memory, { ...options, limit: 1 })[0] || null;
}

export function rankMilestones(bot, memory, candidates, context = {}) {
  const state = context.state || loadProgressionState();
  const data = readMemory(memory);
  const pathName = context.options?.pathName || data.progressionPreferredPath || getRecommendedPathName(memory);
  const pathNext = getNextMilestoneInPath(pathName, state);
  const available = listAvailableMilestones(state);
  const scoringContext = {
    ...context,
    bot,
    memory,
    state,
    pathNextId: pathNext?.id,
    availableIds: new Set(available.map((item) => item.id)),
    blockedIds: new Set(Object.keys(state.blockedMilestones || {})),
    recentBlockedIds: new Set(Object.values(state.blockedMilestones || {}).filter((item) => now() - (item.blockedAt || 0) < 10 * 60 * 1000).map((item) => item.id)),
    options: context.options || {}
  };
  return candidates
    .map((milestone) => buildSuggestion(milestone, scoreMilestone(milestone, scoringContext), scoringContext))
    .sort((a, b) => b.score - a.score || a.riskLevel.localeCompare(b.riskLevel));
}

export function explainMilestoneSuggestion(milestone, context = {}) {
  const item = typeof milestone === 'string' ? getMilestone(milestone) : milestone;
  if (!item) return 'Unknown milestone.';
  const missingPrerequisites = context.state ? getMissingPrerequisites(item, context.state) : [];
  const blockers = [];
  if (!item.implemented) blockers.push('it is future/blocked');
  if (missingPrerequisites.length) blockers.push(`missing ${missingPrerequisites.join(', ')}`);
  if (item.requiresConfirmation) blockers.push('requires confirmation');
  if (blockers.length) return `${item.name} is not the next safe step because ${blockers.join('; ')}.`;
  return `${item.name} is useful because it is ${item.riskLevel} risk and unlocks ${item.unlocks.slice(0, 3).join(', ') || 'later progress'}.`;
}

export function buildProgressionPlan(bot, memory, targetMilestoneId, options = {}) {
  const milestone = getMilestone(targetMilestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${targetMilestoneId}` };
  const state = options.state || loadProgressionState();
  const path = getNamedProgressionPath(options.pathName || getRecommendedPathName(memory));
  const pathMilestones = path?.milestones || [];
  const index = pathMilestones.indexOf(milestone.id);
  const ids = index >= 0 ? pathMilestones.slice(0, index + 1) : [...milestone.prerequisites, milestone.id];
  const completed = new Set(Object.keys(state.completedMilestones || {}));
  const steps = ids
    .filter((id) => !completed.has(id))
    .map((id) => getMilestone(id))
    .filter(Boolean)
    .slice(0, options.maxSteps || 12)
    .map((item) => ({
      milestoneId: item.id,
      name: item.name,
      type: item.recommendedGoals?.length ? 'goal' : 'curriculum',
      riskLevel: item.riskLevel,
      requiresApproval: true,
      description: item.description
    }));
  return {
    ok: true,
    targetMilestoneId: milestone.id,
    targetName: milestone.name,
    status: 'draft',
    steps,
    blockers: steps.filter((step) => step.riskLevel === 'high').map((step) => `${step.name} is high risk and needs explicit confirmation.`),
    evidenceRequired: milestone.successEvidence
  };
}

export function getProgressionPath(bot, memory, targetMilestoneId) {
  return buildProgressionPlan(bot, memory, targetMilestoneId);
}

export function getRecommendedPath(bot, memory) {
  const state = loadProgressionState();
  const name = getRecommendedPathName(memory);
  const next = getNextMilestoneInPath(name, state);
  return { pathName: name, nextMilestone: next };
}

export function getBlockedPathReport(bot, memory, targetMilestoneId) {
  const milestone = getMilestone(targetMilestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${targetMilestoneId}` };
  const state = loadProgressionState();
  return {
    ok: true,
    milestoneId: milestone.id,
    missingPrerequisites: getMissingPrerequisites(milestone, state),
    missingEvidence: getMissingEvidence(bot, memory, milestone),
    riskLevel: milestone.riskLevel,
    implemented: milestone.implemented
  };
}

export function suggestSafeNextStep(bot, memory) {
  return suggestNextMilestone(bot, memory, { limit: 1 });
}

export function suggestOwnerPreparation(bot, memory, milestoneId) {
  const report = getBlockedPathReport(bot, memory, milestoneId);
  if (!report.ok) return report;
  return {
    ok: true,
    milestoneId,
    suggestions: [
      ...report.missingPrerequisites.map((id) => `Complete prerequisite milestone ${id}.`),
      ...report.missingEvidence.map((name) => `Gather or verify evidence ${name}.`)
    ]
  };
}
