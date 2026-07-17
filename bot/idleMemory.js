import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capHistoryArray, loadJsonSafe, saveJsonAtomic } from './memorySafeWrite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function now() {
  return Date.now();
}

function defaultIdleMemory() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastIdleAt: 0,
    lastIdleBehavior: null,
    recentBehaviors: [],
    recentSuggestions: [],
    suppressedSuggestions: {},
    lastAmbientCommentAt: 0,
    lastHelpfulSuggestionAt: 0,
    lastSafetyWarningAt: 0
  };
}

function memoryPath(filePath = null) {
  return filePath || process.env.MCAI_IDLE_MEMORY_FILE || path.join(ROOT_DIR, 'idle-memory.json');
}

function compactBehavior(behavior = {}) {
  return {
    type: behavior.type || behavior.behaviorType || 'unknown',
    key: behavior.key || behavior.suggestionKey || behavior.type || 'unknown',
    text: String(behavior.text || behavior.message || behavior.speak || '').slice(0, 220),
    at: behavior.at || now()
  };
}

export function ensureIdleMemoryShape(memory = {}) {
  const base = defaultIdleMemory();
  const next = { ...base, ...(memory && typeof memory === 'object' ? memory : {}) };
  next.version = 1;
  next.createdAt = Number.isFinite(Number(next.createdAt)) && Number(next.createdAt) > 0 ? Number(next.createdAt) : base.createdAt;
  next.updatedAt = Number.isFinite(Number(next.updatedAt)) ? Number(next.updatedAt) : base.updatedAt;
  next.lastIdleAt = Number(next.lastIdleAt || 0);
  next.recentBehaviors = Array.isArray(next.recentBehaviors) ? next.recentBehaviors : [];
  next.recentSuggestions = Array.isArray(next.recentSuggestions) ? next.recentSuggestions : [];
  next.suppressedSuggestions = next.suppressedSuggestions && typeof next.suppressedSuggestions === 'object' ? next.suppressedSuggestions : {};
  next.lastAmbientCommentAt = Number(next.lastAmbientCommentAt || 0);
  next.lastHelpfulSuggestionAt = Number(next.lastHelpfulSuggestionAt || 0);
  next.lastSafetyWarningAt = Number(next.lastSafetyWarningAt || 0);
  capHistoryArray(next, 'recentBehaviors', 100);
  capHistoryArray(next, 'recentSuggestions', 100);
  return next;
}

export function loadIdleMemory(filePath = null) {
  return ensureIdleMemoryShape(loadJsonSafe(memoryPath(filePath), defaultIdleMemory, (data) => ({
    ok: Boolean(data && typeof data === 'object'),
    reason: 'Idle memory must be a JSON object.'
  })));
}

export function saveIdleMemory(memory, filePath = null) {
  const next = ensureIdleMemoryShape(memory);
  next.updatedAt = now();
  return saveJsonAtomic(memoryPath(filePath), next);
}

export function recordIdleBehavior(behavior, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const record = compactBehavior(behavior);
  memory.lastIdleAt = record.at;
  memory.lastIdleBehavior = record;
  memory.recentBehaviors.push(record);
  if (record.type === 'ambient_comment') memory.lastAmbientCommentAt = record.at;
  if (/suggest|progression|gear|food|base|curriculum|followup/i.test(record.type)) memory.lastHelpfulSuggestionAt = record.at;
  if (/safety|danger/i.test(record.type)) memory.lastSafetyWarningAt = record.at;
  return saveIdleMemory(memory, filePath);
}

export function recordIdleSuggestion(key, text, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const record = { key: String(key || 'suggestion'), text: String(text || '').slice(0, 220), at: now() };
  memory.recentSuggestions.push(record);
  memory.lastHelpfulSuggestionAt = record.at;
  return saveIdleMemory(memory, filePath);
}

export function wasSuggestionRecent(key, windowMs, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const cutoff = now() - Math.max(0, Number(windowMs || 0));
  return memory.recentSuggestions.some((item) => item.key === key && Number(item.at || 0) >= cutoff);
}

export function countSuggestionInWindow(key, windowMs, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const cutoff = now() - Math.max(0, Number(windowMs || 0));
  return memory.recentSuggestions.filter((item) => item.key === key && Number(item.at || 0) >= cutoff).length;
}

export function suppressSuggestion(key, reason = 'suppressed by owner', until = null, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const suppressionKey = String(key || memory.lastIdleBehavior?.key || 'last_suggestion');
  memory.suppressedSuggestions[suppressionKey] = {
    reason: String(reason || 'suppressed'),
    until: until || now() + 24 * 60 * 60 * 1000,
    at: now()
  };
  return saveIdleMemory(memory, filePath);
}

export function isSuggestionSuppressed(key, filePath = null) {
  const memory = loadIdleMemory(filePath);
  const record = memory.suppressedSuggestions?.[String(key || '')];
  if (!record) return false;
  if (Number(record.until || 0) <= now()) return false;
  return true;
}

export function getRecentIdleSummary(filePath = null) {
  const memory = loadIdleMemory(filePath);
  return {
    lastIdleAt: memory.lastIdleAt,
    lastIdleBehavior: memory.lastIdleBehavior,
    recentBehaviors: memory.recentBehaviors.slice(-20),
    recentSuggestions: memory.recentSuggestions.slice(-20),
    suppressedSuggestions: memory.suppressedSuggestions
  };
}

export function clearOldIdleMemory(filePath = null) {
  const memory = loadIdleMemory(filePath);
  const cutoff = now() - 24 * 60 * 60 * 1000;
  memory.recentBehaviors = memory.recentBehaviors.filter((item) => Number(item.at || 0) >= cutoff).slice(-100);
  memory.recentSuggestions = memory.recentSuggestions.filter((item) => Number(item.at || 0) >= cutoff).slice(-100);
  for (const [key, record] of Object.entries(memory.suppressedSuggestions || {})) {
    if (Number(record.until || 0) <= now()) delete memory.suppressedSuggestions[key];
  }
  return saveIdleMemory(memory, filePath);
}

export function resetIdleMemory(confirm = false, filePath = null) {
  if (confirm !== true) return { ok: false, reason: 'Resetting idle memory requires confirmation.' };
  const next = defaultIdleMemory();
  saveIdleMemory(next, filePath);
  return { ok: true, message: 'Idle memory reset.', data: next };
}
