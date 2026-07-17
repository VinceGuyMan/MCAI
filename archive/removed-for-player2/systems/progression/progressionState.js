import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// systems/progression → repo root (MCAI/)
export const progressionMemoryPath = path.resolve(__dirname, '..', '..', '..', 'progression-memory.json');

const MAX_HISTORY = 100;
const MAX_SUGGESTIONS = 20;

function now() {
  return Date.now();
}

function defaultState() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedMilestones: {},
    blockedMilestones: {},
    activeProgressionPlan: null,
    progressionHistory: [],
    lastProgressionCheckAt: 0,
    lastSuggestions: [],
    vanillaAdvancements: [],
    ownerPreferences: {
      preferredPath: 'safe_survival',
      avoidRiskyProgression: true
    }
  };
}

function backupMalformedFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.bad-${now()}`;
  fs.copyFileSync(filePath, backupPath);
  console.warn(`[progressionState] malformed progression memory backed up to ${backupPath}`);
}

function atomicWriteJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function compactEvidence(evidence = []) {
  return (Array.isArray(evidence) ? evidence : [evidence])
    .filter(Boolean)
    .slice(0, 25)
    .map((item) => {
      if (typeof item === 'string') return { name: item, status: 'reported' };
      return {
        name: String(item.name || 'unknown'),
        status: String(item.status || 'reported'),
        confidence: item.confidence || 'low',
        source: item.source || 'progression',
        details: item.details && typeof item.details === 'object' ? JSON.parse(JSON.stringify(item.details)) : {}
      };
    });
}

export function ensureProgressionStateShape(state = {}) {
  const base = defaultState();
  const input = state && typeof state === 'object' ? state : {};
  return {
    ...base,
    ...input,
    version: 1,
    createdAt: Number(input.createdAt) || base.createdAt,
    updatedAt: Number(input.updatedAt) || base.updatedAt,
    completedMilestones: input.completedMilestones && typeof input.completedMilestones === 'object' ? input.completedMilestones : {},
    blockedMilestones: input.blockedMilestones && typeof input.blockedMilestones === 'object' ? input.blockedMilestones : {},
    activeProgressionPlan: input.activeProgressionPlan || null,
    progressionHistory: Array.isArray(input.progressionHistory) ? input.progressionHistory.slice(-MAX_HISTORY) : [],
    lastProgressionCheckAt: Number(input.lastProgressionCheckAt) || 0,
    lastSuggestions: Array.isArray(input.lastSuggestions) ? input.lastSuggestions.slice(0, MAX_SUGGESTIONS) : [],
    vanillaAdvancements: Array.isArray(input.vanillaAdvancements) ? input.vanillaAdvancements.slice(-100) : [],
    ownerPreferences: {
      preferredPath: input.ownerPreferences?.preferredPath || 'safe_survival',
      avoidRiskyProgression: input.ownerPreferences?.avoidRiskyProgression !== false
    }
  };
}

export function loadProgressionState(filePath = progressionMemoryPath) {
  if (!fs.existsSync(filePath)) {
    const created = defaultState();
    saveProgressionState(created, filePath);
    return created;
  }

  try {
    return ensureProgressionStateShape(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    backupMalformedFile(filePath);
    const reset = defaultState();
    saveProgressionState(reset, filePath);
    return reset;
  }
}

export function saveProgressionState(state, filePath = progressionMemoryPath) {
  const shaped = ensureProgressionStateShape({ ...state, updatedAt: now() });
  atomicWriteJson(filePath, shaped);
  return shaped;
}

export function markMilestoneComplete(id, evidence = [], notes = '', completedBy = 'system') {
  const state = loadProgressionState();
  state.completedMilestones[id] = {
    id,
    completedAt: now(),
    evidence: compactEvidence(evidence),
    notes: String(notes || '').slice(0, 500),
    completedBy
  };
  delete state.blockedMilestones[id];
  state.progressionHistory.push({ type: 'completed', id, at: now(), notes: state.completedMilestones[id].notes });
  state.progressionHistory = state.progressionHistory.slice(-MAX_HISTORY);
  return saveProgressionState(state).completedMilestones[id];
}

export function markMilestoneBlocked(id, reason, details = {}) {
  const state = loadProgressionState();
  state.blockedMilestones[id] = {
    id,
    blockedAt: now(),
    reason: String(reason || 'Blocked').slice(0, 500),
    missingPrerequisites: Array.isArray(details.missingPrerequisites) ? details.missingPrerequisites : [],
    missingEvidence: Array.isArray(details.missingEvidence) ? details.missingEvidence : [],
    riskLevel: details.riskLevel || 'low'
  };
  state.progressionHistory.push({ type: 'blocked', id, at: now(), reason: state.blockedMilestones[id].reason });
  state.progressionHistory = state.progressionHistory.slice(-MAX_HISTORY);
  return saveProgressionState(state).blockedMilestones[id];
}

export function clearMilestoneBlock(id) {
  const state = loadProgressionState();
  delete state.blockedMilestones[id];
  state.progressionHistory.push({ type: 'unblocked', id, at: now() });
  state.progressionHistory = state.progressionHistory.slice(-MAX_HISTORY);
  saveProgressionState(state);
  return true;
}

export function getMilestoneStatus(id) {
  const state = loadProgressionState();
  if (state.completedMilestones[id]) return { status: 'completed', record: state.completedMilestones[id] };
  if (state.blockedMilestones[id]) return { status: 'blocked', record: state.blockedMilestones[id] };
  return { status: 'incomplete', record: null };
}

export function getCompletedMilestones() {
  return loadProgressionState().completedMilestones;
}

export function getBlockedMilestones() {
  return loadProgressionState().blockedMilestones;
}

export function recordProgressionCheck(summary) {
  const state = loadProgressionState();
  state.lastProgressionCheckAt = now();
  state.progressionHistory.push({ type: 'check', at: state.lastProgressionCheckAt, summary });
  state.progressionHistory = state.progressionHistory.slice(-MAX_HISTORY);
  return saveProgressionState(state);
}

export function recordProgressionSuggestion(suggestions) {
  const state = loadProgressionState();
  state.lastSuggestions = (Array.isArray(suggestions) ? suggestions : [suggestions])
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => ({
      milestoneId: item.milestoneId,
      name: item.name,
      priority: item.priority,
      riskLevel: item.riskLevel,
      recommended: Boolean(item.recommended),
      reason: String(item.reason || '').slice(0, 300),
      at: now()
    }));
  state.progressionHistory.push({ type: 'suggestion', at: now(), suggestions: state.lastSuggestions });
  state.progressionHistory = state.progressionHistory.slice(-MAX_HISTORY);
  return saveProgressionState(state);
}

export function getProgressionHistory(limit = 20) {
  return loadProgressionState().progressionHistory.slice(-limit).reverse();
}

export function resetProgressionState(confirm = false) {
  if (!confirm) {
    return { ok: false, reason: 'Reset progression requires confirmation.' };
  }
  const reset = defaultState();
  saveProgressionState(reset);
  return { ok: true, state: reset };
}

