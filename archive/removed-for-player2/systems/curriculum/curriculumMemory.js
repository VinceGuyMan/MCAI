import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// systems/curriculum → repo root (MCAI/)
const projectRoot = path.resolve(__dirname, '..', '..', '..');
export const curriculumMemoryPath = path.resolve(projectRoot, 'curriculum-memory.json');

const MAX_LAST_SUGGESTIONS = 20;
const MAX_HISTORY = 50;
const MAX_SESSIONS = 50;
const MAX_EXECUTION_HISTORY = 100;

function now() {
  return Date.now();
}

function defaultMemory() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSuggestionAt: 0,
    lastSuggestions: [],
    dismissedSuggestions: [],
    acceptedSuggestions: [],
    activeCurriculum: null,
    curriculumSessions: [],
    trackHistory: [],
    executionHistory: [],
    ownerPreferences: {
      preferredTracks: [],
      dismissedTracks: []
    }
  };
}

function createId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactEvidence(evidence) {
  return (Array.isArray(evidence) ? evidence : evidence ? [evidence] : [])
    .slice(0, 20)
    .map((item) => {
      if (typeof item === 'string') return { name: item, status: 'reported' };
      let details = {};
      if (item?.details && typeof item.details === 'object') {
        try {
          details = JSON.parse(JSON.stringify(item.details));
        } catch {
          details = {};
        }
      }
      return {
        name: String(item?.name || 'unknown'),
        status: String(item?.status || 'reported'),
        confidence: item?.confidence || 'low',
        source: item?.source || 'curriculum',
        details
      };
    });
}

function compactStep(step) {
  if (!step || typeof step !== 'object') return null;
  return {
    id: step.id || createId('curr_step'),
    skillName: String(step.skillName || ''),
    description: String(step.description || '').slice(0, 220),
    status: step.status || 'pending',
    riskLevel: step.riskLevel || 'low',
    requiresConfirmation: Boolean(step.requiresConfirmation),
    args: step.args && typeof step.args === 'object' ? step.args : {},
    suggestedCommand: step.suggestedCommand || null,
    startedAt: step.startedAt ?? null,
    completedAt: step.completedAt ?? null,
    durationMs: Number(step.durationMs) || 0,
    result: step.result ? {
      ok: Boolean(step.result.ok),
      message: String(step.result.message || step.result.reason || '').slice(0, 220),
      reason: String(step.result.reason || '').slice(0, 220),
      resultStatus: step.result.resultStatus || null
    } : null,
    evidence: compactEvidence(step.evidence),
    blockers: Array.isArray(step.blockers) ? step.blockers.slice(0, 10).map(String) : []
  };
}

function compactSession(session) {
  if (!session || typeof session !== 'object') return null;
  const timestamp = now();
  return {
    id: session.id || createId('curr'),
    name: String(session.name || 'Curriculum').slice(0, 120),
    type: session.type || 'single_skill',
    status: session.status || 'pending_approval',
    createdAt: Number(session.createdAt) || timestamp,
    approvedAt: session.approvedAt ?? null,
    startedAt: session.startedAt ?? null,
    updatedAt: Number(session.updatedAt) || timestamp,
    completedAt: session.completedAt ?? null,
    createdBy: session.createdBy || 'tj',
    approvedBy: session.approvedBy || null,
    currentStepId: session.currentStepId || null,
    riskLevel: session.riskLevel || 'low',
    requiresConfirmation: Boolean(session.requiresConfirmation),
    steps: Array.isArray(session.steps) ? session.steps.map(compactStep).filter(Boolean) : [],
    evidence: compactEvidence(session.evidence),
    blockers: Array.isArray(session.blockers) ? session.blockers.slice(0, 10).map(String) : [],
    lastResult: session.lastResult ? {
      ok: Boolean(session.lastResult.ok),
      message: String(session.lastResult.message || session.lastResult.reason || '').slice(0, 220),
      reason: String(session.lastResult.reason || '').slice(0, 220),
      resultStatus: session.lastResult.resultStatus || null
    } : null,
    pauseReason: String(session.pauseReason || '').slice(0, 220),
    failureReason: String(session.failureReason || '').slice(0, 220)
  };
}

function backupMalformed(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.malformed-${now()}.bak`;
  fs.copyFileSync(filePath, backupPath);
}

function isNodeTestProcess() {
  return process.env.NODE_TEST_CONTEXT || process.argv.some((arg) => /(?:\.test|-test)\.js$/i.test(arg) || /node:test/i.test(arg));
}

function resolveCurriculumMemoryPath(filePath) {
  if (filePath) return filePath;
  if (process.env.MCAI_CURRICULUM_MEMORY) return path.resolve(process.env.MCAI_CURRICULUM_MEMORY);
  if (process.env.MCAI_TEST_MEMORY_DIR) return path.resolve(process.env.MCAI_TEST_MEMORY_DIR, 'curriculum-memory.json');
  if (isNodeTestProcess()) return path.resolve(projectRoot, '.test-memory', String(process.pid), 'curriculum-memory.json');
  return curriculumMemoryPath;
}

function compactSuggestion(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return null;
  return {
    type: suggestion.type || 'skill',
    skillName: suggestion.skillName || null,
    trackName: suggestion.trackName || null,
    category: suggestion.category || null,
    score: Number(suggestion.score) || 0,
    priority: suggestion.priority || 'normal',
    riskLevel: suggestion.riskLevel || 'low',
    implemented: Boolean(suggestion.implemented),
    recommended: Boolean(suggestion.recommended),
    reason: String(suggestion.reason || '').slice(0, 260),
    blockers: Array.isArray(suggestion.blockers) ? suggestion.blockers.slice(0, 8).map(String) : [],
    suggestedCommand: suggestion.suggestedCommand || null,
    at: suggestion.at || now()
  };
}

export function ensureCurriculumMemoryShape(memory) {
  const base = defaultMemory();
  const input = memory && typeof memory === 'object' ? memory : {};
  return {
    ...base,
    ...input,
    version: 1,
    createdAt: Number(input.createdAt) || base.createdAt,
    updatedAt: Number(input.updatedAt) || base.updatedAt,
    lastSuggestionAt: Number(input.lastSuggestionAt) || 0,
    lastSuggestions: Array.isArray(input.lastSuggestions) ? input.lastSuggestions.map(compactSuggestion).filter(Boolean).slice(0, MAX_LAST_SUGGESTIONS) : [],
    dismissedSuggestions: Array.isArray(input.dismissedSuggestions) ? input.dismissedSuggestions.slice(-MAX_HISTORY) : [],
    acceptedSuggestions: Array.isArray(input.acceptedSuggestions) ? input.acceptedSuggestions.slice(-MAX_HISTORY) : [],
    activeCurriculum: input.activeCurriculum ? compactSession(input.activeCurriculum) : null,
    curriculumSessions: Array.isArray(input.curriculumSessions) ? input.curriculumSessions.map(compactSession).filter(Boolean).slice(-MAX_SESSIONS) : [],
    trackHistory: Array.isArray(input.trackHistory) ? input.trackHistory.slice(-MAX_HISTORY) : [],
    executionHistory: Array.isArray(input.executionHistory) ? input.executionHistory.slice(-MAX_EXECUTION_HISTORY) : [],
    ownerPreferences: {
      preferredTracks: Array.isArray(input.ownerPreferences?.preferredTracks) ? input.ownerPreferences.preferredTracks.map(String) : [],
      dismissedTracks: Array.isArray(input.ownerPreferences?.dismissedTracks) ? input.ownerPreferences.dismissedTracks.map(String) : []
    }
  };
}

export function loadCurriculumMemory(filePath) {
  filePath = resolveCurriculumMemoryPath(filePath);
  if (!fs.existsSync(filePath)) {
    const created = defaultMemory();
    saveCurriculumMemory(created, filePath);
    return created;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return ensureCurriculumMemoryShape(parsed);
  } catch (error) {
    console.warn(`[curriculumMemory] malformed curriculum memory backed up: ${error.message}`);
    backupMalformed(filePath);
    const reset = defaultMemory();
    saveCurriculumMemory(reset, filePath);
    return reset;
  }
}

export function saveCurriculumMemory(memory, filePath) {
  filePath = resolveCurriculumMemoryPath(filePath);
  const shaped = ensureCurriculumMemoryShape({
    ...memory,
    updatedAt: now()
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(shaped, null, 2));
  fs.renameSync(tmpPath, filePath);
  return shaped;
}

export function recordSuggestions(suggestions) {
  const memory = loadCurriculumMemory();
  const compact = (Array.isArray(suggestions) ? suggestions : [suggestions])
    .map(compactSuggestion)
    .filter(Boolean);
  memory.lastSuggestionAt = now();
  memory.lastSuggestions = compact.slice(0, MAX_LAST_SUGGESTIONS);
  memory.trackHistory = [
    ...memory.trackHistory,
    ...compact.filter((item) => item.trackName)
  ].slice(-MAX_HISTORY);
  return saveCurriculumMemory(memory);
}

export function recordSuggestionAccepted(skillName) {
  const memory = loadCurriculumMemory();
  const name = String(skillName || memory.lastSuggestions[0]?.skillName || memory.lastSuggestions[0]?.trackName || '').trim();
  if (!name) return memory;
  memory.acceptedSuggestions = [
    ...memory.acceptedSuggestions,
    { skillName: name, acceptedAt: now() }
  ].slice(-MAX_HISTORY);
  return saveCurriculumMemory(memory);
}

export function recordSuggestionDismissed(skillName, reason = '') {
  const memory = loadCurriculumMemory();
  const name = String(skillName || memory.lastSuggestions[0]?.skillName || memory.lastSuggestions[0]?.trackName || '').trim();
  if (!name) return memory;
  memory.dismissedSuggestions = [
    ...memory.dismissedSuggestions,
    { skillName: name, reason: String(reason || '').slice(0, 160), dismissedAt: now() }
  ].slice(-MAX_HISTORY);
  return saveCurriculumMemory(memory);
}

export function getLastSuggestions() {
  return loadCurriculumMemory().lastSuggestions;
}

export function getSuggestionHistory(limit = 10) {
  const memory = loadCurriculumMemory();
  return [
    ...memory.acceptedSuggestions.map((item) => ({ ...item, type: 'accepted' })),
    ...memory.dismissedSuggestions.map((item) => ({ ...item, type: 'dismissed' }))
  ]
    .sort((a, b) => (b.acceptedAt || b.dismissedAt || 0) - (a.acceptedAt || a.dismissedAt || 0))
    .slice(0, limit);
}

export function getDismissedSuggestions() {
  return loadCurriculumMemory().dismissedSuggestions;
}

export function clearOldSuggestions() {
  const memory = loadCurriculumMemory();
  const cutoff = now() - 24 * 60 * 60 * 1000;
  memory.dismissedSuggestions = memory.dismissedSuggestions.filter((item) => (item.dismissedAt || 0) >= cutoff);
  memory.acceptedSuggestions = memory.acceptedSuggestions.filter((item) => (item.acceptedAt || 0) >= cutoff);
  return saveCurriculumMemory(memory);
}

export function isSuggestionRecentlyDismissed(skillName) {
  const name = String(skillName || '').trim();
  if (!name) return false;
  const cutoff = now() - 10 * 60 * 1000;
  return loadCurriculumMemory().dismissedSuggestions.some((item) => item.skillName === name && (item.dismissedAt || 0) >= cutoff);
}

export function createCurriculumSession(session) {
  const memory = loadCurriculumMemory();
  const shaped = compactSession(session);
  memory.curriculumSessions = [...memory.curriculumSessions.filter((item) => item.id !== shaped.id), shaped].slice(-MAX_SESSIONS);
  return saveCurriculumMemory(memory).curriculumSessions.find((item) => item.id === shaped.id);
}

export function updateCurriculumSession(curriculumId, updates) {
  const memory = loadCurriculumMemory();
  const index = memory.curriculumSessions.findIndex((item) => item.id === curriculumId);
  if (index < 0) return null;
  const updated = compactSession({
    ...memory.curriculumSessions[index],
    ...updates,
    updatedAt: now()
  });
  memory.curriculumSessions[index] = updated;
  if (memory.activeCurriculum?.id === curriculumId) memory.activeCurriculum = updated;
  saveCurriculumMemory(memory);
  return updated;
}

export function getActiveCurriculum() {
  return loadCurriculumMemory().activeCurriculum;
}

export function setActiveCurriculum(curriculumId) {
  const memory = loadCurriculumMemory();
  const found = memory.curriculumSessions.find((item) => item.id === curriculumId);
  if (!found) return null;
  memory.activeCurriculum = found;
  saveCurriculumMemory(memory);
  return found;
}

export function clearActiveCurriculum() {
  const memory = loadCurriculumMemory();
  memory.activeCurriculum = null;
  return saveCurriculumMemory(memory);
}

function updateStep(curriculumId, stepId, updater) {
  const memory = loadCurriculumMemory();
  const session = memory.curriculumSessions.find((item) => item.id === curriculumId);
  if (!session) return null;
  session.steps = session.steps.map((step) => step.id === stepId ? compactStep(updater(step)) : step);
  session.updatedAt = now();
  if (memory.activeCurriculum?.id === curriculumId) memory.activeCurriculum = session;
  saveCurriculumMemory(memory);
  return session.steps.find((step) => step.id === stepId);
}

function appendExecutionHistory(memory, entry) {
  memory.executionHistory = [...memory.executionHistory, entry].slice(-MAX_EXECUTION_HISTORY);
}

export function recordCurriculumStepStart(curriculumId, stepId) {
  const startedAt = now();
  const step = updateStep(curriculumId, stepId, (item) => ({ ...item, status: 'running', startedAt }));
  const memory = loadCurriculumMemory();
  appendExecutionHistory(memory, { curriculumId, stepId, skillName: step?.skillName, status: 'running', startedAt });
  saveCurriculumMemory(memory);
  return step;
}

export function recordCurriculumStepSuccess(curriculumId, stepId, result, evidence = []) {
  const completedAt = now();
  const step = updateStep(curriculumId, stepId, (item) => ({
    ...item,
    status: 'completed',
    completedAt,
    durationMs: result?.durationMs || (completedAt - (item.startedAt || completedAt)),
    result,
    evidence
  }));
  const memory = loadCurriculumMemory();
  appendExecutionHistory(memory, { curriculumId, stepId, skillName: step?.skillName, status: 'completed', completedAt, evidence: compactEvidence(evidence) });
  saveCurriculumMemory(memory);
  return step;
}

export function recordCurriculumStepPartial(curriculumId, stepId, result, evidence = [], reason = '') {
  const completedAt = now();
  const step = updateStep(curriculumId, stepId, (item) => ({
    ...item,
    status: 'partial',
    completedAt,
    durationMs: result?.durationMs || (completedAt - (item.startedAt || completedAt)),
    result,
    evidence,
    blockers: [reason].filter(Boolean)
  }));
  const memory = loadCurriculumMemory();
  appendExecutionHistory(memory, { curriculumId, stepId, skillName: step?.skillName, status: 'partial', completedAt, reason, evidence: compactEvidence(evidence) });
  saveCurriculumMemory(memory);
  return step;
}

export function recordCurriculumStepFailure(curriculumId, stepId, reason = '', evidence = []) {
  const completedAt = now();
  const step = updateStep(curriculumId, stepId, (item) => ({
    ...item,
    status: /cancel/i.test(reason) ? 'cancelled' : 'failed',
    completedAt,
    durationMs: completedAt - (item.startedAt || completedAt),
    result: { ok: false, reason },
    evidence,
    blockers: [reason].filter(Boolean)
  }));
  const memory = loadCurriculumMemory();
  appendExecutionHistory(memory, { curriculumId, stepId, skillName: step?.skillName, status: step?.status || 'failed', completedAt, reason, evidence: compactEvidence(evidence) });
  saveCurriculumMemory(memory);
  return step;
}

export function recordCurriculumPause(curriculumId, reason = '') {
  return updateCurriculumSession(curriculumId, { status: 'paused', pauseReason: reason });
}

export function recordCurriculumCancel(curriculumId, reason = '') {
  const updated = updateCurriculumSession(curriculumId, { status: 'cancelled', pauseReason: reason, completedAt: now() });
  if (getActiveCurriculum()?.id === curriculumId) clearActiveCurriculum();
  return updated;
}

export function recordCurriculumComplete(curriculumId, evidence = []) {
  const updated = updateCurriculumSession(curriculumId, { status: 'completed', completedAt: now(), evidence });
  if (getActiveCurriculum()?.id === curriculumId) clearActiveCurriculum();
  return updated;
}

export function getCurriculumHistory(limit = 10) {
  return loadCurriculumMemory().curriculumSessions.slice(-limit).reverse();
}

export function getExecutionHistory(limit = 10) {
  return loadCurriculumMemory().executionHistory.slice(-limit).reverse();
}
