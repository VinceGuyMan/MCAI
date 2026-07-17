import { MILESTONE_2_RUNNER_ALLOWLIST } from '../../skillValidator.js';

const riskRank = { low: 1, medium: 2, high: 3 };

function categoryNeed(skill, context) {
  const needs = context.needs || {};
  if (skill.category === 'food' && needs.food) return true;
  if (skill.category === 'base' && needs.base) return true;
  if (skill.category === 'storage' && needs.storage) return true;
  if (skill.category === 'mining' && needs.mining) return true;
  if (skill.category === 'combat' && needs.safety) return true;
  if (skill.category === 'nether' && needs.nether) return true;
  if (skill.category === 'exploration' && needs.exploration) return true;
  return false;
}

export function normalizeScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
}

export function scoreNeedUrgency(skill, context = {}) {
  if (categoryNeed(skill, context)) return 25;
  if (['status', 'food_status', 'inventory_summary', 'armor_status', 'home_status'].includes(skill.name)) return 12;
  return 0;
}

export function scoreSafety(skill, context = {}) {
  if (context.unsafe) return -100;
  if (skill.riskLevel === 'low' && !skill.requiresConfirmation) return 20;
  if (skill.riskLevel === 'medium' && !skill.requiresConfirmation) return 6;
  return -30;
}

export function scoreImplementation(skill, context = {}) {
  let score = skill.implemented ? 20 : -50;
  if (MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) score += 15;
  else score -= 20;
  return score;
}

export function scoreEvidence(skill, context = {}) {
  const evidence = context.evidenceBySkill?.[skill.name] || {};
  if (evidence.hasVerified) return 15;
  if (evidence.hasReported) return 8;
  if (evidence.hasFailed) return -20;
  return -10;
}

export function scoreRecentFailures(skill, context = {}) {
  const stats = context.skillStats?.[skill.name];
  if (!stats) return 0;
  if ((stats.failureCount || 0) > 0 && (stats.successCount || 0) === 0) return -20;
  if (stats.lastFailureAt && stats.lastSuccessAt && stats.lastFailureAt > stats.lastSuccessAt) return -15;
  return 0;
}

export function scoreCooldown(skill, context = {}) {
  const stats = context.skillStats?.[skill.name];
  if (stats?.cooldownUntil > Date.now()) return -25;
  return 0;
}

export function scoreOwnerUsefulness(skill, context = {}) {
  if (context.ownerAskedCategory && skill.category === context.ownerAskedCategory) return 10;
  if (['status', 'food_status', 'inventory_summary', 'home_status', 'nether_checklist'].includes(skill.name)) return 8;
  return 0;
}

export function scoreSkillCandidate(skill, context = {}) {
  let score = 20;
  if (['food', 'survival', 'combat'].includes(skill.category)) score += 30;
  score += scoreNeedUrgency(skill, context);
  score += scoreSafety(skill, context);
  score += scoreImplementation(skill, context);
  score += scoreEvidence(skill, context);
  score += scoreRecentFailures(skill, context);
  score += scoreCooldown(skill, context);
  score += scoreOwnerUsefulness(skill, context);
  return normalizeScore(score);
}

export function scoreTrack(template, context = {}) {
  if (!template) return 0;
  const skillScores = (template.skills || [])
    .map((skillName) => context.skillsByName?.[skillName])
    .filter(Boolean)
    .map((skill) => scoreSkillCandidate(skill, context));
  const average = skillScores.length ? skillScores.reduce((sum, item) => sum + item, 0) / skillScores.length : 0;
  const riskPenalty = template.riskLevel === 'high' ? 35 : template.riskLevel === 'medium' ? 10 : 0;
  return normalizeScore(average + 10 - riskPenalty);
}

export function rankByScore(items) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.skillName || a.trackName || '').localeCompare(String(b.skillName || b.trackName || '')));
}
