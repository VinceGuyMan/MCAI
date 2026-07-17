import {
  getProgressionMilestones,
  getMilestone,
  listAvailableMilestones,
  generateProgressionSummary
} from './progressionRegistry.js';
import {
  verifyMilestoneEvidence,
  summarizeMilestoneEvidence,
  evidenceIsSatisfied
} from './progressionEvidence.js';
import {
  loadProgressionState,
  saveProgressionState,
  recordProgressionCheck
} from './progressionState.js';

function now() {
  return Date.now();
}

function completedIds(state) {
  return new Set(Object.keys(state?.completedMilestones || {}));
}

function compactEvidence(evidence) {
  return (Array.isArray(evidence) ? evidence : [])
    .slice(0, 25)
    .map((record) => ({
      name: record.name,
      status: record.status,
      confidence: record.confidence,
      source: record.source,
      details: record.details || {}
    }));
}

function milestoneEvidenceSatisfied(records) {
  return records.length > 0 && records.every(evidenceIsSatisfied);
}

export function checkProgression(bot, memory, options = {}) {
  const state = refreshProgressionState(bot, memory, options);
  return getProgressionSummary(bot, memory, { state });
}

export function checkMilestone(bot, memory, milestoneId, options = {}) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  const state = options.state || loadProgressionState();
  const evidence = verifyMilestoneEvidence(bot, memory, milestone);
  const missingPrerequisites = getMissingPrerequisites(milestone, state);
  const missingEvidence = evidence.filter((record) => !evidenceIsSatisfied(record)).map((record) => record.name);
  const status = state.completedMilestones[milestone.id]
    ? 'completed'
    : !milestone.implemented
      ? 'future'
      : missingPrerequisites.length
        ? 'blocked'
        : missingEvidence.length
          ? 'incomplete'
          : 'complete_ready';
  return {
    ok: true,
    milestone,
    status,
    evidence,
    evidenceSummary: summarizeMilestoneEvidence(milestone, evidence),
    missingPrerequisites,
    missingEvidence
  };
}

export function refreshProgressionState(bot, memory, options = {}) {
  const state = options.state || loadProgressionState();
  const updated = {
    ...state,
    completedMilestones: { ...state.completedMilestones },
    blockedMilestones: { ...state.blockedMilestones },
    lastProgressionCheckAt: now()
  };

  for (const milestone of getProgressionMilestones()) {
    if (updated.completedMilestones[milestone.id]) continue;
    if (!milestone.implemented) {
      updated.blockedMilestones[milestone.id] = {
        id: milestone.id,
        blockedAt: updated.blockedMilestones[milestone.id]?.blockedAt || now(),
        reason: 'Future milestone; supporting system is not implemented yet.',
        missingPrerequisites: [],
        missingEvidence: milestone.successEvidence,
        riskLevel: milestone.riskLevel
      };
      continue;
    }

    const missingPrerequisites = getMissingPrerequisites(milestone, updated);
    if (missingPrerequisites.length) {
      updated.blockedMilestones[milestone.id] = {
        id: milestone.id,
        blockedAt: updated.blockedMilestones[milestone.id]?.blockedAt || now(),
        reason: 'Missing prerequisite milestones.',
        missingPrerequisites,
        missingEvidence: [],
        riskLevel: milestone.riskLevel
      };
      continue;
    }

    const evidence = verifyMilestoneEvidence(bot, memory, milestone);
    const missingEvidence = evidence.filter((record) => !evidenceIsSatisfied(record)).map((record) => record.name);
    if (milestoneEvidenceSatisfied(evidence)) {
      updated.completedMilestones[milestone.id] = {
        id: milestone.id,
        completedAt: now(),
        evidence: compactEvidence(evidence),
        notes: summarizeMilestoneEvidence(milestone, evidence),
        completedBy: 'system'
      };
      delete updated.blockedMilestones[milestone.id];
    } else if (missingEvidence.length) {
      updated.blockedMilestones[milestone.id] = {
        id: milestone.id,
        blockedAt: updated.blockedMilestones[milestone.id]?.blockedAt || now(),
        reason: 'Missing required evidence.',
        missingPrerequisites: [],
        missingEvidence,
        riskLevel: milestone.riskLevel
      };
    }
  }

  const saved = saveProgressionState(updated);
  recordProgressionCheck(generateProgressionSummary(saved));
  return loadProgressionState();
}

export function detectCompletedMilestones(bot, memory) {
  const state = refreshProgressionState(bot, memory);
  return Object.values(state.completedMilestones);
}

export function detectBlockedMilestones(bot, memory) {
  const state = refreshProgressionState(bot, memory);
  return Object.values(state.blockedMilestones);
}

export function calculateProgressionPercent(state = loadProgressionState(), registry = getProgressionMilestones()) {
  const total = registry.length;
  const completed = Object.keys(state.completedMilestones || {}).length;
  return total ? Math.round((completed / total) * 100) : 0;
}

export function calculateCategoryProgress(category, state = loadProgressionState(), registry = getProgressionMilestones()) {
  const items = registry.filter((item) => item.category === category);
  const complete = completedIds(state);
  const completed = items.filter((item) => complete.has(item.id)).length;
  return { category, total: items.length, completed, percent: items.length ? Math.round((completed / items.length) * 100) : 0 };
}

export function calculateTierProgress(tier, state = loadProgressionState(), registry = getProgressionMilestones()) {
  const items = registry.filter((item) => item.tier === tier);
  const complete = completedIds(state);
  const completed = items.filter((item) => complete.has(item.id)).length;
  return { tier, total: items.length, completed, percent: items.length ? Math.round((completed / items.length) * 100) : 0 };
}

export function getNextAvailableMilestones(bot, memory, options = {}) {
  const state = options.refresh === false ? loadProgressionState() : refreshProgressionState(bot, memory);
  return listAvailableMilestones(state).slice(0, options.limit || 10);
}

export function getMissingPrerequisites(milestone, state = loadProgressionState()) {
  const complete = completedIds(state);
  return (milestone?.prerequisites || []).filter((id) => !complete.has(id));
}

export function getMissingEvidence(bot, memory, milestone) {
  return verifyMilestoneEvidence(bot, memory, milestone)
    .filter((record) => !evidenceIsSatisfied(record))
    .map((record) => record.name);
}

export function getProgressionSummary(bot, memory, options = {}) {
  const state = options.state || loadProgressionState();
  const summary = generateProgressionSummary(state);
  const available = listAvailableMilestones(state);
  return {
    ...summary,
    lastProgressionCheckAt: state.lastProgressionCheckAt,
    nextAvailable: available.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      tier: item.tier,
      riskLevel: item.riskLevel
    })),
    blockedCount: Object.keys(state.blockedMilestones || {}).length
  };
}

export function explainMilestoneStatus(bot, memory, milestoneId) {
  const checked = checkMilestone(bot, memory, milestoneId);
  if (!checked.ok) return checked.reason;
  const { milestone, status, missingPrerequisites, missingEvidence, evidenceSummary } = checked;
  const parts = [`${milestone.name}: ${status}.`];
  if (missingPrerequisites.length) parts.push(`Missing prerequisites: ${missingPrerequisites.join(', ')}.`);
  if (missingEvidence.length) parts.push(`Missing evidence: ${missingEvidence.join(', ')}.`);
  parts.push(evidenceSummary);
  return parts.join(' ');
}

