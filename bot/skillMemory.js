import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkill } from './skillRegistry.js';
import { summarizeEvidence } from './progressEvidence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const skillMemoryPath = path.resolve(__dirname, '..', 'skill-memory.json');
const RECENT_RUN_LIMIT = 100;

function now() {
  return Date.now();
}

function defaultSkillMemory() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    skills: {},
    recentRuns: [],
    evidenceStats: {}
  };
}

function defaultSkillEntry(name) {
  return {
    name,
    successCount: 0,
    failureCount: 0,
    partialCount: 0,
    lastRunAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastFailureReason: '',
    averageDurationMs: 0,
    cooldownUntil: 0,
    lastEvidence: [],
    lastEvidenceSummary: '',
    commonFailureReasons: {}
  };
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function isNodeTestProcess() {
  return process.env.NODE_TEST_CONTEXT || process.argv.some((arg) => /(?:\.test|-test)\.js$/i.test(arg) || /node:test/i.test(arg));
}

function resolveSkillMemoryPath(filePath) {
  if (filePath) return filePath;
  if (process.env.MCAI_SKILL_MEMORY) return path.resolve(process.env.MCAI_SKILL_MEMORY);
  if (process.env.MCAI_TEST_MEMORY_DIR) return path.resolve(process.env.MCAI_TEST_MEMORY_DIR, 'skill-memory.json');
  if (isNodeTestProcess()) return path.resolve(__dirname, '..', '.test-memory', String(process.pid), 'skill-memory.json');
  return skillMemoryPath;
}

function backupMalformedFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.bad-${Date.now()}`;
  try {
    fs.copyFileSync(filePath, backupPath);
    console.warn(`[skillMemory] Malformed skill memory backed up to ${backupPath}`);
  } catch (error) {
    console.warn(`[skillMemory] Could not back up malformed skill memory: ${error.message}`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeEvidence(evidence = []) {
  const list = Array.isArray(evidence) ? evidence : [evidence];
  return list
    .filter((item) => item !== null && item !== undefined)
    .slice(0, 24)
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isPlainObject(item)) {
        return {
          name: String(item.name || '').slice(0, 80),
          status: String(item.status || 'unknown').slice(0, 24),
          category: String(item.category || 'unknown').slice(0, 40),
          source: String(item.source || 'unknown').slice(0, 40),
          confidence: String(item.confidence || 'low').slice(0, 24),
          details: isPlainObject(item.details) ? Object.fromEntries(Object.entries(item.details).slice(0, 8)) : {},
          createdAt: Math.max(0, Number(item.createdAt) || 0)
        };
      }
      return String(item);
    });
}

export function ensureSkillMemoryShape(memory) {
  const fallback = defaultSkillMemory();
  const input = isPlainObject(memory) ? memory : {};
  const shaped = {
    version: Number.isFinite(input.version) ? input.version : 1,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : fallback.createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : fallback.updatedAt,
    skills: isPlainObject(input.skills) ? input.skills : {},
    recentRuns: Array.isArray(input.recentRuns) ? input.recentRuns : [],
    evidenceStats: isPlainObject(input.evidenceStats) ? input.evidenceStats : {}
  };

  for (const [name, entry] of Object.entries(shaped.skills)) {
    const safeEntry = isPlainObject(entry) ? entry : {};
    shaped.skills[name] = {
      ...defaultSkillEntry(name),
      ...safeEntry,
      name,
      successCount: Math.max(0, Number(safeEntry.successCount) || 0),
      failureCount: Math.max(0, Number(safeEntry.failureCount) || 0),
      partialCount: Math.max(0, Number(safeEntry.partialCount) || 0),
      lastRunAt: Math.max(0, Number(safeEntry.lastRunAt) || 0),
      lastSuccessAt: Math.max(0, Number(safeEntry.lastSuccessAt) || 0),
      lastFailureAt: Math.max(0, Number(safeEntry.lastFailureAt) || 0),
      averageDurationMs: Math.max(0, Number(safeEntry.averageDurationMs) || 0),
      cooldownUntil: Math.max(0, Number(safeEntry.cooldownUntil) || 0),
      lastEvidence: safeEvidence(safeEntry.lastEvidence),
      lastEvidenceSummary: String(safeEntry.lastEvidenceSummary || ''),
      commonFailureReasons: isPlainObject(safeEntry.commonFailureReasons) ? safeEntry.commonFailureReasons : {}
    };
  }

  shaped.recentRuns = shaped.recentRuns
    .filter(isPlainObject)
    .map((run) => ({
      id: String(run.id || `run_${run.startedAt || Date.now()}`),
      skillName: String(run.skillName || run.name || '').trim(),
      startedAt: Math.max(0, Number(run.startedAt || run.at) || 0),
      finishedAt: Math.max(0, Number(run.finishedAt || run.at) || 0),
      durationMs: Math.max(0, Number(run.durationMs) || 0),
      ok: typeof run.ok === 'boolean' ? run.ok : run.status === 'success' ? true : run.status === 'failure' ? false : null,
      resultStatus: ['success', 'partial', 'failed', 'cancelled', 'timeout'].includes(run.resultStatus) ? run.resultStatus : run.ok === true ? 'success' : run.ok === false ? 'failed' : 'partial',
      reason: String(run.reason || ''),
      evidence: safeEvidence(run.evidence),
      evidenceSummary: String(run.evidenceSummary || ''),
      action: String(run.action || '')
    }))
    .filter((run) => run.skillName)
    .slice(0, RECENT_RUN_LIMIT);

  return shaped;
}

export function loadSkillMemory(filePath) {
  filePath = resolveSkillMemoryPath(filePath);
  if (!fs.existsSync(filePath)) {
    const memory = defaultSkillMemory();
    saveSkillMemory(memory, filePath);
    return memory;
  }

  try {
    return ensureSkillMemoryShape(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    console.warn(`[skillMemory] Could not read skill-memory.json: ${error.message}`);
    backupMalformedFile(filePath);
    const memory = defaultSkillMemory();
    saveSkillMemory(memory, filePath);
    return memory;
  }
}

export function saveSkillMemory(memory, filePath) {
  filePath = resolveSkillMemoryPath(filePath);
  const shaped = ensureSkillMemoryShape(memory);
  shaped.updatedAt = now();
  atomicWriteJson(filePath, shaped);
  return shaped;
}

function updateSkillMemory(mutator) {
  const memory = loadSkillMemory();
  const result = mutator(memory) || memory;
  return saveSkillMemory(result);
}

function entryFor(memory, skillName) {
  const name = String(skillName || '').trim();
  if (!memory.skills[name]) memory.skills[name] = defaultSkillEntry(name);
  return memory.skills[name];
}

function runId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resultStatusFromReason(reason) {
  if (/timeout/i.test(reason || '')) return 'timeout';
  if (/cancel/i.test(reason || '')) return 'cancelled';
  return 'failed';
}

function updateEvidenceStats(memory, evidence) {
  for (const item of safeEvidence(evidence)) {
    const name = typeof item === 'string' ? item : item.name;
    if (!name) continue;
    if (!memory.evidenceStats[name]) memory.evidenceStats[name] = { seen: 0, verified: 0, failed: 0, partial: 0, reported: 0, unknown: 0, skipped: 0 };
    const stats = memory.evidenceStats[name];
    stats.seen += 1;
    const status = typeof item === 'string' ? 'reported' : item.status || 'unknown';
    stats[status] = (stats[status] || 0) + 1;
  }
}

function saveRecentRun(memory, recorded, runId = null) {
  if (runId) {
    const index = memory.recentRuns.findIndex((run) => run.id === runId);
    if (index !== -1) {
      const existing = memory.recentRuns[index];
      memory.recentRuns[index] = {
        ...existing,
        ...recorded,
        id: existing.id,
        startedAt: existing.startedAt || recorded.startedAt,
        durationMs: Math.max(0, (recorded.finishedAt || now()) - (existing.startedAt || recorded.startedAt || now()))
      };
      memory.recentRuns = memory.recentRuns.slice(0, RECENT_RUN_LIMIT);
      return memory.recentRuns[index];
    }
  }

  memory.recentRuns.unshift(recorded);
  memory.recentRuns = memory.recentRuns.slice(0, RECENT_RUN_LIMIT);
  return recorded;
}

export function recordSkillStart(skillName, metadata = {}) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  const skill = getSkill(name);
  const timestamp = now();
  let recorded = null;

  updateSkillMemory((memory) => {
    const entry = entryFor(memory, name);
    entry.lastRunAt = timestamp;
    entry.cooldownUntil = timestamp + (skill?.cooldownMs || 0);
    const run = {
      id: runId(),
      skillName: name,
      startedAt: timestamp,
      finishedAt: 0,
      durationMs: 0,
      ok: null,
      resultStatus: 'partial',
      reason: '',
      evidence: ['skill_started'],
      evidenceSummary: 'Skill started.',
      action: skill?.action || ''
    };
    if (metadata && Object.keys(metadata).length) {
      run.metadata = {
        source: String(metadata.source || metadata.sender || '').slice(0, 64),
        action: String(metadata.action || '').slice(0, 64)
      };
    }
    memory.recentRuns.unshift(run);
    memory.recentRuns = memory.recentRuns.slice(0, RECENT_RUN_LIMIT);
    recorded = run;
    return memory;
  });

  return recorded;
}

export function recordSkillSuccess(skillName, evidence = [], durationMs = 0, resultSummary = '', metadata = {}) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  const timestamp = now();
  let recorded = null;

  updateSkillMemory((memory) => {
    const entry = entryFor(memory, name);
    const previousTotal = entry.averageDurationMs * entry.successCount;
    entry.successCount += 1;
    entry.lastSuccessAt = timestamp;
    entry.lastRunAt = timestamp;
    entry.lastFailureReason = '';
    entry.averageDurationMs = Math.round((previousTotal + Math.max(0, Number(durationMs) || 0)) / entry.successCount);
    entry.lastEvidence = safeEvidence(evidence);
    entry.lastEvidenceSummary = summarizeEvidence(entry.lastEvidence);
    const duration = Math.max(0, Number(durationMs) || 0);
    recorded = {
      id: runId(),
      skillName: name,
      startedAt: Math.max(0, timestamp - duration),
      finishedAt: timestamp,
      durationMs: duration,
      ok: true,
      resultStatus: 'success',
      reason: '',
      evidence: entry.lastEvidence,
      evidenceSummary: entry.lastEvidenceSummary,
      action: getSkill(name)?.action || ''
    };
    if (resultSummary) recorded.resultSummary = String(resultSummary).slice(0, 180);
    recorded = saveRecentRun(memory, recorded, metadata?.runId || null);
    updateEvidenceStats(memory, entry.lastEvidence);
    return memory;
  });

  return recorded;
}

export function recordSkillPartial(skillName, evidence = [], durationMs = 0, reason = '', metadata = {}) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  const timestamp = now();
  let recorded = null;

  updateSkillMemory((memory) => {
    const entry = entryFor(memory, name);
    entry.partialCount += 1;
    entry.lastRunAt = timestamp;
    entry.lastEvidence = safeEvidence(evidence);
    entry.lastEvidenceSummary = summarizeEvidence(entry.lastEvidence);
    const duration = Math.max(0, Number(durationMs) || 0);
    recorded = {
      id: runId(),
      skillName: name,
      startedAt: Math.max(0, timestamp - duration),
      finishedAt: timestamp,
      durationMs: duration,
      ok: true,
      resultStatus: 'partial',
      reason: String(reason || 'partial evidence').slice(0, 240),
      evidence: entry.lastEvidence,
      evidenceSummary: entry.lastEvidenceSummary,
      action: getSkill(name)?.action || ''
    };
    recorded = saveRecentRun(memory, recorded, metadata?.runId || null);
    updateEvidenceStats(memory, entry.lastEvidence);
    return memory;
  });

  return recorded;
}

export function recordSkillFailure(skillName, reason = '', durationMs = 0, evidence = [], metadata = {}) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  const timestamp = now();
  let recorded = null;

  updateSkillMemory((memory) => {
    const entry = entryFor(memory, name);
    entry.failureCount += 1;
    entry.lastFailureAt = timestamp;
    entry.lastRunAt = timestamp;
    entry.lastFailureReason = String(reason || 'unknown failure').slice(0, 240);
    const evidenceInput = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
    entry.lastEvidence = safeEvidence(evidenceInput.length ? evidenceInput : ['skill_failed']);
    entry.lastEvidenceSummary = summarizeEvidence(entry.lastEvidence);
    const commonKey = entry.lastFailureReason || 'unknown failure';
    entry.commonFailureReasons[commonKey] = (entry.commonFailureReasons[commonKey] || 0) + 1;
    const duration = Math.max(0, Number(durationMs) || 0);
    recorded = {
      id: runId(),
      skillName: name,
      startedAt: Math.max(0, timestamp - duration),
      finishedAt: timestamp,
      durationMs: duration,
      ok: false,
      resultStatus: resultStatusFromReason(entry.lastFailureReason),
      reason: entry.lastFailureReason,
      evidence: entry.lastEvidence,
      evidenceSummary: entry.lastEvidenceSummary,
      action: getSkill(name)?.action || ''
    };
    recorded = saveRecentRun(memory, recorded, metadata?.runId || null);
    updateEvidenceStats(memory, entry.lastEvidence);
    return memory;
  });

  return recorded;
}

export function getSkillStats(skillName) {
  const name = String(skillName || '').trim();
  const memory = loadSkillMemory();
  return memory.skills[name] ? { ...memory.skills[name], lastEvidence: safeEvidence(memory.skills[name].lastEvidence) } : defaultSkillEntry(name);
}

export function listSkillStats() {
  const memory = loadSkillMemory();
  return Object.values(memory.skills).map((entry) => ({ ...entry, lastEvidence: safeEvidence(entry.lastEvidence) }));
}

export function getRecentSkillRuns(limit = 10) {
  const memory = loadSkillMemory();
  return memory.recentRuns.slice(0, Math.max(0, Number(limit) || 10)).map((run) => ({
    ...run,
    evidence: safeEvidence(run.evidence)
  }));
}

export function getSkillEvidenceHistory(skillName, limit = 10) {
  const name = String(skillName || '').trim();
  return getRecentSkillRuns(RECENT_RUN_LIMIT)
    .filter((run) => run.skillName === name)
    .slice(0, Math.max(0, Number(limit) || 10))
    .map((run) => ({
      id: run.id,
      skillName: run.skillName,
      resultStatus: run.resultStatus,
      evidence: safeEvidence(run.evidence),
      evidenceSummary: run.evidenceSummary,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt
    }));
}

export function getCommonFailureReasons(skillName) {
  return { ...(getSkillStats(skillName).commonFailureReasons || {}) };
}

export function summarizeSkillEvidence(skillName) {
  const stats = getSkillStats(skillName);
  if (!stats.lastEvidence?.length) return 'No evidence recorded.';
  return stats.lastEvidenceSummary || summarizeEvidence(stats.lastEvidence);
}

export function isSkillOnCooldown(skillName) {
  const stats = getSkillStats(skillName);
  return stats.cooldownUntil > now();
}
