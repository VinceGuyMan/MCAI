import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// systems/villagers → repo root (MCAI/)
const DEFAULT_FILE = path.join(__dirname, '..', '..', '..', 'villager-memory.json');

const MAX_VILLAGES = 100;
const MAX_VILLAGERS = 300;
const MAX_TRADES = 500;
const MAX_TRADE_HISTORY = 200;

function now() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultMemory() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    knownVillages: [],
    knownVillagers: [],
    knownTrades: [],
    tradeHistory: [],
    valuableVillagers: [],
    blockedTrades: {},
    economyStats: {
      emeraldsSpent: 0,
      emeraldsEarned: 0,
      tradesCompleted: 0
    }
  };
}

function backupMalformedFile(filePath, reason = 'malformed') {
  if (!fs.existsSync(filePath)) return;
  const parsed = path.parse(filePath);
  const backupPath = path.join(parsed.dir, `${parsed.name}.${reason}.${now()}${parsed.ext}.bak`);
  fs.copyFileSync(filePath, backupPath);
}

function atomicSave(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function normalizePosition(position = {}) {
  return {
    x: Number(position.x ?? 0),
    y: Number(position.y ?? 64),
    z: Number(position.z ?? 0)
  };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x ?? 0) - Number(b.x ?? 0);
  const dy = Number(a.y ?? 0) - Number(b.y ?? 0);
  const dz = Number(a.z ?? 0) - Number(b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function capArray(items, max) {
  return Array.isArray(items) ? items.slice(-max) : [];
}

export function ensureVillagerMemoryShape(memory) {
  const base = defaultMemory();
  const shaped = memory && typeof memory === 'object' ? { ...base, ...memory } : base;
  shaped.version = Number(shaped.version || 1);
  shaped.createdAt = Number(shaped.createdAt || now());
  shaped.updatedAt = Number(shaped.updatedAt || now());
  shaped.knownVillages = capArray(shaped.knownVillages, MAX_VILLAGES).map((v) => ({
    id: v.id || makeId('village'),
    name: v.name || 'Known village',
    dimension: v.dimension || 'overworld',
    center: normalizePosition(v.center),
    firstSeenAt: Number(v.firstSeenAt || now()),
    lastVisitedAt: Number(v.lastVisitedAt || v.firstSeenAt || now()),
    notes: String(v.notes || ''),
    tags: Array.isArray(v.tags) ? v.tags.map(String) : []
  }));
  shaped.knownVillagers = capArray(shaped.knownVillagers, MAX_VILLAGERS).map((v) => ({
    id: v.id || makeId('villager'),
    entityId: v.entityId ?? null,
    customName: String(v.customName || ''),
    profession: String(v.profession || 'unknown'),
    level: String(v.level || 'unknown'),
    dimension: v.dimension || 'overworld',
    lastKnownPosition: normalizePosition(v.lastKnownPosition),
    villageId: v.villageId || null,
    firstSeenAt: Number(v.firstSeenAt || now()),
    lastSeenAt: Number(v.lastSeenAt || v.firstSeenAt || now()),
    valuable: Boolean(v.valuable),
    notes: String(v.notes || '')
  }));
  shaped.knownTrades = capArray(shaped.knownTrades, MAX_TRADES).map((t) => ({
    id: t.id || makeId('trade'),
    villagerId: t.villagerId || null,
    profession: String(t.profession || 'unknown'),
    wanted: Array.isArray(t.wanted) ? t.wanted.map(String) : [],
    offered: String(t.offered || 'unknown'),
    priceSummary: String(t.priceSummary || ''),
    score: Number(t.score || 0),
    category: String(t.category || 'unknown'),
    valuable: Boolean(t.valuable),
    lastSeenAt: Number(t.lastSeenAt || now()),
    timesTraded: Number(t.timesTraded || 0),
    notes: String(t.notes || '')
  }));
  shaped.tradeHistory = capArray(shaped.tradeHistory, MAX_TRADE_HISTORY);
  shaped.valuableVillagers = Array.isArray(shaped.valuableVillagers) ? shaped.valuableVillagers.map(String) : [];
  shaped.blockedTrades = shaped.blockedTrades && typeof shaped.blockedTrades === 'object' ? shaped.blockedTrades : {};
  shaped.economyStats = {
    emeraldsSpent: Number(shaped.economyStats?.emeraldsSpent || 0),
    emeraldsEarned: Number(shaped.economyStats?.emeraldsEarned || 0),
    tradesCompleted: Number(shaped.economyStats?.tradesCompleted || 0)
  };
  return shaped;
}

export function loadVillagerMemory(filePath = DEFAULT_FILE) {
  if (!fs.existsSync(filePath)) {
    const created = defaultMemory();
    atomicSave(filePath, created);
    return created;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return ensureVillagerMemoryShape(JSON.parse(raw));
  } catch (error) {
    backupMalformedFile(filePath);
    const repaired = defaultMemory();
    repaired.repairReason = `Recovered from malformed villager memory: ${error.message}`;
    atomicSave(filePath, repaired);
    return repaired;
  }
}

export function saveVillagerMemory(memory, filePath = DEFAULT_FILE) {
  const shaped = ensureVillagerMemoryShape(memory);
  shaped.updatedAt = now();
  atomicSave(filePath, shaped);
  return shaped;
}

function withMemory(mutator) {
  const memory = loadVillagerMemory();
  const result = mutator(memory);
  saveVillagerMemory(memory);
  return result;
}

function findNearbyVillage(memory, village) {
  const center = normalizePosition(village.center);
  return memory.knownVillages.find((known) =>
    known.dimension === (village.dimension || 'overworld') && distance(known.center, center) <= 96
  );
}

export function rememberVillage(village) {
  return withMemory((memory) => {
    const timestamp = now();
    const shaped = {
      id: village.id || makeId('village'),
      name: village.name || 'Known village',
      dimension: village.dimension || 'overworld',
      center: normalizePosition(village.center),
      firstSeenAt: Number(village.firstSeenAt || timestamp),
      lastVisitedAt: Number(village.lastVisitedAt || timestamp),
      notes: String(village.notes || ''),
      tags: Array.isArray(village.tags) ? village.tags.map(String) : []
    };
    const existing = findNearbyVillage(memory, shaped);
    if (existing) {
      Object.assign(existing, {
        ...shaped,
        id: existing.id,
        firstSeenAt: existing.firstSeenAt,
        tags: Array.from(new Set([...(existing.tags || []), ...shaped.tags]))
      });
      return clone(existing);
    }
    memory.knownVillages.push(shaped);
    memory.knownVillages = capArray(memory.knownVillages, MAX_VILLAGES);
    return clone(shaped);
  });
}

function findMatchingVillager(memory, villager) {
  if (villager.id) {
    const byId = memory.knownVillagers.find((known) => known.id === villager.id);
    if (byId) return byId;
  }
  if (villager.entityId != null) {
    const byEntity = memory.knownVillagers.find((known) => known.entityId === villager.entityId);
    if (byEntity) return byEntity;
  }
  const position = normalizePosition(villager.lastKnownPosition);
  return memory.knownVillagers.find((known) =>
    known.dimension === (villager.dimension || 'overworld') &&
    known.profession === (villager.profession || 'unknown') &&
    distance(known.lastKnownPosition, position) <= 8
  );
}

export function rememberVillager(villager) {
  return withMemory((memory) => {
    const timestamp = now();
    const shaped = {
      id: villager.id || makeId('villager'),
      entityId: villager.entityId ?? null,
      customName: String(villager.customName || ''),
      profession: String(villager.profession || 'unknown'),
      level: String(villager.level || 'unknown'),
      dimension: villager.dimension || 'overworld',
      lastKnownPosition: normalizePosition(villager.lastKnownPosition),
      villageId: villager.villageId || null,
      firstSeenAt: Number(villager.firstSeenAt || timestamp),
      lastSeenAt: Number(villager.lastSeenAt || timestamp),
      valuable: Boolean(villager.valuable),
      notes: String(villager.notes || '')
    };
    const existing = findMatchingVillager(memory, shaped);
    if (existing) {
      Object.assign(existing, {
        ...shaped,
        id: existing.id,
        firstSeenAt: existing.firstSeenAt,
        valuable: existing.valuable || shaped.valuable,
        notes: shaped.notes || existing.notes
      });
      if (existing.valuable && !memory.valuableVillagers.includes(existing.id)) {
        memory.valuableVillagers.push(existing.id);
      }
      return clone(existing);
    }
    memory.knownVillagers.push(shaped);
    memory.knownVillagers = capArray(memory.knownVillagers, MAX_VILLAGERS);
    if (shaped.valuable && !memory.valuableVillagers.includes(shaped.id)) memory.valuableVillagers.push(shaped.id);
    return clone(shaped);
  });
}

export function updateVillager(id, updates) {
  return withMemory((memory) => {
    const villager = memory.knownVillagers.find((entry) => entry.id === id);
    if (!villager) return null;
    Object.assign(villager, updates, { lastSeenAt: now() });
    if (updates.lastKnownPosition) villager.lastKnownPosition = normalizePosition(updates.lastKnownPosition);
    if (villager.valuable && !memory.valuableVillagers.includes(villager.id)) memory.valuableVillagers.push(villager.id);
    return clone(villager);
  });
}

function tradeKey(trade) {
  return [
    trade.villagerId || 'unknown',
    trade.profession || 'unknown',
    Array.isArray(trade.wanted) ? trade.wanted.join('+') : '',
    trade.offered || 'unknown',
    trade.priceSummary || ''
  ].join('|');
}

export function rememberTrade(trade) {
  return withMemory((memory) => {
    const timestamp = now();
    const shaped = {
      id: trade.id || makeId('trade'),
      villagerId: trade.villagerId || null,
      profession: String(trade.profession || 'unknown'),
      wanted: Array.isArray(trade.wanted) ? trade.wanted.map(String) : [],
      offered: String(trade.offered || 'unknown'),
      priceSummary: String(trade.priceSummary || ''),
      score: Number(trade.score || 0),
      category: String(trade.category || 'unknown'),
      valuable: Boolean(trade.valuable),
      lastSeenAt: Number(trade.lastSeenAt || timestamp),
      timesTraded: Number(trade.timesTraded || 0),
      notes: String(trade.notes || '')
    };
    const key = tradeKey(shaped);
    const existing = memory.knownTrades.find((known) => tradeKey(known) === key);
    if (existing) {
      Object.assign(existing, {
        ...shaped,
        id: existing.id,
        timesTraded: Math.max(existing.timesTraded || 0, shaped.timesTraded || 0)
      });
      return clone(existing);
    }
    memory.knownTrades.push(shaped);
    memory.knownTrades = capArray(memory.knownTrades, MAX_TRADES);
    return clone(shaped);
  });
}

export function recordTradeResult(result) {
  return withMemory((memory) => {
    const timestamp = now();
    const entry = {
      id: result.id || makeId('trade_result'),
      ok: Boolean(result.ok),
      tradeId: result.tradeId || null,
      villagerId: result.villagerId || null,
      offered: result.offered || '',
      wanted: Array.isArray(result.wanted) ? result.wanted : [],
      emeraldsSpent: Number(result.emeraldsSpent || 0),
      emeraldsEarned: Number(result.emeraldsEarned || 0),
      reason: String(result.reason || ''),
      evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 20) : [],
      createdAt: timestamp
    };
    memory.tradeHistory.push(entry);
    memory.tradeHistory = capArray(memory.tradeHistory, MAX_TRADE_HISTORY);
    if (entry.ok) {
      memory.economyStats.tradesCompleted += 1;
      memory.economyStats.emeraldsSpent += entry.emeraldsSpent;
      memory.economyStats.emeraldsEarned += entry.emeraldsEarned;
      const trade = memory.knownTrades.find((known) => known.id === entry.tradeId);
      if (trade) trade.timesTraded = Number(trade.timesTraded || 0) + 1;
    }
    return clone(entry);
  });
}

export function listKnownVillages() {
  return clone(loadVillagerMemory().knownVillages);
}

export function listKnownVillagers(filters = {}) {
  const memory = loadVillagerMemory();
  let villagers = memory.knownVillagers;
  if (filters.profession) villagers = villagers.filter((v) => v.profession === filters.profession);
  if (filters.valuable) villagers = villagers.filter((v) => v.valuable || memory.valuableVillagers.includes(v.id));
  return clone(villagers);
}

export function listKnownTrades(filters = {}) {
  let trades = loadVillagerMemory().knownTrades;
  if (filters.category) trades = trades.filter((trade) => trade.category === filters.category);
  if (filters.profession) trades = trades.filter((trade) => trade.profession === filters.profession);
  if (filters.valuable) trades = trades.filter((trade) => trade.valuable);
  if (filters.offered) trades = trades.filter((trade) => trade.offered.includes(filters.offered));
  return clone(trades);
}

export function findBestKnownTrades(filters = {}) {
  return listKnownTrades(filters).sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, filters.limit || 10);
}

export function markVillagerValuable(id, reason = '') {
  return withMemory((memory) => {
    const villager = memory.knownVillagers.find((entry) => entry.id === id || String(entry.entityId) === String(id));
    if (!villager) return null;
    villager.valuable = true;
    villager.notes = reason || villager.notes;
    if (!memory.valuableVillagers.includes(villager.id)) memory.valuableVillagers.push(villager.id);
    return clone(villager);
  });
}

export function markTradeBlocked(id, reason = '') {
  return withMemory((memory) => {
    memory.blockedTrades[id] = {
      reason: String(reason || 'blocked'),
      blockedAt: now()
    };
    return clone(memory.blockedTrades[id]);
  });
}

export function getEconomyStats() {
  return clone(loadVillagerMemory().economyStats);
}

export function summarizeVillagerMemory() {
  const memory = loadVillagerMemory();
  return {
    villages: memory.knownVillages.length,
    villagers: memory.knownVillagers.length,
    valuableVillagers: memory.valuableVillagers.length,
    trades: memory.knownTrades.length,
    valuableTrades: memory.knownTrades.filter((trade) => trade.valuable).length,
    tradeHistory: memory.tradeHistory.length,
    economyStats: clone(memory.economyStats)
  };
}

export default {
  loadVillagerMemory,
  saveVillagerMemory,
  ensureVillagerMemoryShape,
  rememberVillage,
  rememberVillager,
  updateVillager,
  rememberTrade,
  recordTradeResult,
  listKnownVillages,
  listKnownVillagers,
  listKnownTrades,
  findBestKnownTrades,
  markVillagerValuable,
  markTradeBlocked,
  getEconomyStats,
  summarizeVillagerMemory
};
