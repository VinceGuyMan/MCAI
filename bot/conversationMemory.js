import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const conversationMemoryUrl = new URL('../conversation-memory.json', import.meta.url);
export const conversationMemoryPath = fileURLToPath(conversationMemoryUrl);

const defaultConversationMemory = {
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  recentTurns: [],
  memoryFacts: [],
  playerProfiles: {},
  botSelfNotes: [],
  relationshipNotes: [],
  conversationStats: {}
};

function now() {
  return Date.now();
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function id(prefix) {
  return `${prefix}_${now()}_${Math.floor(Math.random() * 1000)}`;
}

export function ensureConversationMemoryShape(memory = {}) {
  const createdAt = memory.createdAt || now();
  return {
    ...defaultConversationMemory,
    ...memory,
    version: 1,
    createdAt,
    updatedAt: memory.updatedAt || createdAt,
    recentTurns: Array.isArray(memory.recentTurns) ? memory.recentTurns : [],
    memoryFacts: Array.isArray(memory.memoryFacts) ? memory.memoryFacts : [],
    playerProfiles: memory.playerProfiles && typeof memory.playerProfiles === 'object' ? memory.playerProfiles : {},
    botSelfNotes: Array.isArray(memory.botSelfNotes) ? memory.botSelfNotes : [],
    relationshipNotes: Array.isArray(memory.relationshipNotes) ? memory.relationshipNotes : [],
    conversationStats: memory.conversationStats && typeof memory.conversationStats === 'object' ? memory.conversationStats : {}
  };
}

export function loadConversationMemory() {
  if (!fs.existsSync(conversationMemoryUrl)) {
    const fresh = ensureConversationMemoryShape({ createdAt: now(), updatedAt: now() });
    saveConversationMemory(fresh);
    return fresh;
  }

  try {
    return ensureConversationMemoryShape(JSON.parse(fs.readFileSync(conversationMemoryUrl, 'utf8')));
  } catch (error) {
    const backup = `${conversationMemoryPath}.bad-${now()}`;
    try {
      fs.copyFileSync(conversationMemoryUrl, backup);
    } catch {
      // Best effort backup only.
    }
    const fresh = ensureConversationMemoryShape({ createdAt: now(), updatedAt: now() });
    saveConversationMemory(fresh);
    return fresh;
  }
}

export function saveConversationMemory(memory) {
  const shaped = ensureConversationMemoryShape(memory);
  shaped.updatedAt = now();
  atomicWriteJson(conversationMemoryPath, shaped);
  return shaped;
}

export function addConversationTurn(sender, text, response, metadata = {}) {
  const memory = loadConversationMemory();
  memory.recentTurns.unshift({
    id: id('turn'),
    sender,
    text: String(text || '').slice(0, 350),
    response: String(response || '').slice(0, 350),
    at: now(),
    metadata
  });
  memory.recentTurns = memory.recentTurns.slice(0, 80);
  saveConversationMemory(memory);
  return memory.recentTurns[0];
}

export function getRecentConversation(playerName, limit = 10) {
  return loadConversationMemory().recentTurns
    .filter((turn) => !playerName || turn.sender === playerName)
    .slice(0, limit);
}

function safeFactText(text) {
  return String(text || '')
    .replace(/api[_ -]?key\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/password\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function addMemoryFact(fact) {
  const memory = loadConversationMemory();
  const text = safeFactText(typeof fact === 'string' ? fact : fact?.text);
  if (!text) return null;
  const existing = memory.memoryFacts.find((entry) => entry.text.toLowerCase() === text.toLowerCase());
  if (existing) {
    existing.lastUsedAt = now();
    saveConversationMemory(memory);
    return existing;
  }
  const entry = {
    id: id('mem'),
    type: fact?.type || 'custom',
    text,
    createdBy: fact?.createdBy || 'ModVinny',
    createdAt: now(),
    lastUsedAt: 0,
    importance: fact?.importance || 'normal',
    source: fact?.source || 'chat',
    tags: Array.isArray(fact?.tags) ? fact.tags : []
  };
  memory.memoryFacts.unshift(entry);
  memory.memoryFacts = memory.memoryFacts.slice(0, 200);
  saveConversationMemory(memory);
  return entry;
}

export function updateMemoryFact(idValue, updates) {
  const memory = loadConversationMemory();
  const entry = memory.memoryFacts.find((fact) => fact.id === idValue);
  if (!entry) return null;
  Object.assign(entry, updates || {}, { text: updates?.text ? safeFactText(updates.text) : entry.text });
  saveConversationMemory(memory);
  return entry;
}

export function forgetMemoryFact(idOrQuery) {
  const memory = loadConversationMemory();
  const query = String(idOrQuery || '').toLowerCase();
  const before = memory.memoryFacts.length;
  memory.memoryFacts = memory.memoryFacts.filter((fact) => fact.id.toLowerCase() !== query && !fact.text.toLowerCase().includes(query));
  const removed = before - memory.memoryFacts.length;
  saveConversationMemory(memory);
  return removed;
}

export function searchMemoryFacts(query) {
  const q = String(query || '').toLowerCase();
  return loadConversationMemory().memoryFacts
    .filter((fact) => !q || fact.id.toLowerCase().includes(q) || fact.text.toLowerCase().includes(q) || fact.tags.some((tag) => tag.toLowerCase().includes(q)))
    .slice(0, 10);
}

export function summarizeRelevantMemories(context = {}) {
  const query = String(context.query || context.rawText || '').toLowerCase();
  const facts = loadConversationMemory().memoryFacts
    .filter((fact) => {
      if (!query) return fact.importance !== 'low';
      return fact.text.toLowerCase().split(/\W+/).some((word) => word.length > 3 && query.includes(word));
    })
    .slice(0, 5);
  return facts.map((fact) => fact.text).join(' | ');
}

export function getPlayerProfile(playerName) {
  const memory = loadConversationMemory();
  return memory.playerProfiles[playerName] || { name: playerName, preferences: [], trust: playerName === 'ModVinny' ? 'owner' : 'unknown' };
}

export function updatePlayerProfile(playerName, updates) {
  const memory = loadConversationMemory();
  memory.playerProfiles[playerName] = { ...getPlayerProfile(playerName), ...updates, name: playerName, updatedAt: now() };
  saveConversationMemory(memory);
  return memory.playerProfiles[playerName];
}

export function shouldSaveMemory(text, responseContext = {}) {
  const clean = String(text || '').toLowerCase();
  if (/api key|password|token|secret/.test(clean)) return false;
  if (/^remember (that|this:)/.test(clean)) return true;
  if (responseContext.shouldSaveMemory) return true;
  return /(i like|i prefer|remember that|we call this|our base|safe mining|do not waste)/i.test(text);
}

export function extractMemoryCandidate(text) {
  const raw = String(text || '').trim();
  const explicit = raw.match(/^remember (?:that|this:)\s+(.+)$/i);
  if (explicit) return explicit[1].trim();
  return raw;
}

export function pruneOldConversationMemory() {
  const memory = loadConversationMemory();
  memory.recentTurns = memory.recentTurns.slice(0, 80);
  memory.memoryFacts = memory.memoryFacts.slice(0, 200);
  saveConversationMemory(memory);
  return memory;
}

export function resetConversationMemory(reason = 'logout') {
  return saveConversationMemory(ensureConversationMemoryShape({
    createdAt: now(),
    updatedAt: now(),
    conversationStats: { resetReason: reason, resetAt: now() }
  }));
}
