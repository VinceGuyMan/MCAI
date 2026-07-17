import { getCommands, findCommandAlias } from './commandRegistry.js';
import { getSkills } from './skillRegistry.js';
import { getSkillStats, listSkillStats } from './skillMemory.js';
import { listLearnedMappings } from './commandLearningMemory.js';

function reliabilityFromStats(stats = {}, implemented = true) {
  if (!implemented) return 'unsupported';
  const successes = Number(stats.successCount) || 0;
  const failures = Number(stats.failureCount) || 0;
  const partials = Number(stats.partialCount) || 0;
  const total = successes + failures + partials;
  if (!total) return 'untested';
  const successRate = successes / total;
  if (failures >= 3 && successRate < 0.4) return 'blocked';
  if (successRate >= 0.8 && successes >= 3) return 'reliable';
  if (successRate >= 0.5) return 'improving';
  return 'shaky';
}

function scoreForLevel(level) {
  return {
    unsupported: 0,
    blocked: 10,
    untested: 25,
    shaky: 40,
    improving: 65,
    reliable: 90
  }[level] ?? 25;
}

export function scoreSkillReliability(skillName, statsOverride = null) {
  const name = String(skillName || '').trim();
  const skill = getSkills().find((item) => item.name === name);
  const stats = statsOverride || getSkillStats(name);
  const level = reliabilityFromStats(stats, skill?.implemented !== false);
  return {
    skillName: name,
    level,
    score: scoreForLevel(level),
    successCount: Number(stats.successCount) || 0,
    failureCount: Number(stats.failureCount) || 0,
    partialCount: Number(stats.partialCount) || 0,
    lastFailureReason: stats.lastFailureReason || ''
  };
}

export function scoreCommandReliability(command) {
  const resolved = findCommandAlias(command) || getCommands().find((item) => item.name === command);
  if (!resolved || !resolved.implemented) return { command, level: 'unsupported', score: 0 };
  const learned = listLearnedMappings().filter((item) => item.canonicalCommand === (resolved.aliases?.[0] || command));
  const failures = learned.reduce((sum, item) => sum + (Number(item.failureCount) || 0), 0);
  const successes = learned.reduce((sum, item) => sum + (Number(item.successCount) || 0), 0);
  const total = successes + failures;
  if (!total) return { command: resolved.aliases?.[0] || command, level: 'untested', score: 25 };
  const level = reliabilityFromStats({ successCount: successes, failureCount: failures }, true);
  return { command: resolved.aliases?.[0] || command, level, score: scoreForLevel(level), successCount: successes, failureCount: failures };
}

export function listReliableSkills() {
  return getSkills().map((skill) => scoreSkillReliability(skill.name)).filter((item) => item.level === 'reliable');
}

export function listShakySkills() {
  return getSkills().map((skill) => scoreSkillReliability(skill.name)).filter((item) => ['shaky', 'blocked'].includes(item.level));
}

export function listUntestedSkills() {
  return getSkills().map((skill) => scoreSkillReliability(skill.name)).filter((item) => item.level === 'untested');
}

export function listFailingSkills() {
  return listSkillStats()
    .filter((stats) => (Number(stats.failureCount) || 0) > 0)
    .map((stats) => scoreSkillReliability(stats.name || stats.skillName, stats))
    .filter((item) => item.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount);
}

export function explainCompetency(skillName) {
  const score = scoreSkillReliability(skillName);
  if (score.level === 'reliable') return `${skillName} looks reliable: ${score.successCount} successes and ${score.failureCount} failures.`;
  if (score.level === 'improving') return `${skillName} is improving but still worth watching.`;
  if (score.level === 'shaky') return `${skillName} is shaky. Last blocker: ${score.lastFailureReason || 'unknown'}.`;
  if (score.level === 'blocked') return `${skillName} is blocked by repeated failures. Last blocker: ${score.lastFailureReason || 'unknown'}.`;
  if (score.level === 'unsupported') return `${skillName} is not implemented yet.`;
  return `${skillName} has not been tested enough yet.`;
}

export function getCompetencyReport() {
  const skillScores = getSkills().map((skill) => scoreSkillReliability(skill.name));
  const counts = skillScores.reduce((acc, item) => {
    acc[item.level] = (acc[item.level] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: Date.now(),
    counts,
    reliable: skillScores.filter((item) => item.level === 'reliable').slice(0, 12),
    improving: skillScores.filter((item) => item.level === 'improving').slice(0, 12),
    shaky: skillScores.filter((item) => ['shaky', 'blocked'].includes(item.level)).slice(0, 12),
    untested: skillScores.filter((item) => item.level === 'untested').slice(0, 20),
    learnedMappings: listLearnedMappings().slice(0, 20)
  };
}

export function updateCompetencyFromEvidence(skillName, evidence) {
  const score = scoreSkillReliability(skillName);
  return {
    ...score,
    evidenceSeen: Array.isArray(evidence) ? evidence.length : evidence ? 1 : 0
  };
}

export function updateCompetencyFromFailure(command, reason) {
  const reliability = scoreCommandReliability(command);
  return {
    ...reliability,
    lastFailureReason: String(reason || '').slice(0, 240)
  };
}

