import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../config.js';

const memoryPath = path.join(projectRoot, 'gear-memory.json');
const HISTORY_LIMIT = 100;

function now() {
  return Date.now();
}

function defaultMemory() {
  const createdAt = now();
  return {
    version: 1,
    createdAt,
    updatedAt: createdAt,
    knownBestGear: {},
    upgradeHistory: [],
    enchantingHistory: [],
    anvilHistory: [],
    potionHistory: [],
    brewingHistory: [],
    blockedUpgrades: {},
    lastGearStatus: null,
    lastSuggestedUpgrade: null
  };
}

function backupMalformedFile() {
  if (!fs.existsSync(memoryPath)) return;
  const backupPath = `${memoryPath}.malformed.${now()}.bak`;
  fs.copyFileSync(memoryPath, backupPath);
}

function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function compactResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    message: String(result.message || result.reason || '').slice(0, 240),
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 12) : [],
    at: now()
  };
}

function capped(list, limit = HISTORY_LIMIT) {
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

export function ensureGearMemoryShape(memory = {}) {
  const base = defaultMemory();
  return {
    ...base,
    ...memory,
    knownBestGear: memory.knownBestGear && typeof memory.knownBestGear === 'object' ? memory.knownBestGear : {},
    upgradeHistory: capped(memory.upgradeHistory),
    enchantingHistory: capped(memory.enchantingHistory),
    anvilHistory: capped(memory.anvilHistory),
    potionHistory: capped(memory.potionHistory),
    brewingHistory: capped(memory.brewingHistory),
    blockedUpgrades: memory.blockedUpgrades && typeof memory.blockedUpgrades === 'object' ? memory.blockedUpgrades : {},
    updatedAt: memory.updatedAt || base.updatedAt
  };
}

export function loadGearMemory() {
  if (!fs.existsSync(memoryPath)) {
    const memory = defaultMemory();
    saveGearMemory(memory);
    return memory;
  }
  try {
    return ensureGearMemoryShape(JSON.parse(fs.readFileSync(memoryPath, 'utf8')));
  } catch {
    backupMalformedFile();
    const memory = defaultMemory();
    saveGearMemory(memory);
    return memory;
  }
}

export function saveGearMemory(memory) {
  const shaped = ensureGearMemoryShape(memory);
  shaped.updatedAt = now();
  atomicWrite(memoryPath, shaped);
  return shaped;
}

function update(mutator) {
  const memory = loadGearMemory();
  mutator(memory);
  return saveGearMemory(memory);
}

export function recordGearStatus(status) {
  return update((memory) => {
    memory.lastGearStatus = {
      at: now(),
      armorScore: status?.armorScore ?? null,
      best: status?.best || {},
      needs: status?.needs || []
    };
    memory.knownBestGear = status?.best || memory.knownBestGear || {};
  });
}

export function recordUpgradeSuggestion(suggestion) {
  return update((memory) => {
    memory.lastSuggestedUpgrade = { ...suggestion, at: now() };
    memory.upgradeHistory.unshift({ type: 'suggestion', ...memory.lastSuggestedUpgrade });
    memory.upgradeHistory = capped(memory.upgradeHistory);
  });
}

export function recordEnchantingAttempt(result) {
  return update((memory) => {
    memory.enchantingHistory.unshift(compactResult(result));
    memory.enchantingHistory = capped(memory.enchantingHistory);
  });
}

export function recordAnvilAttempt(result) {
  return update((memory) => {
    memory.anvilHistory.unshift(compactResult(result));
    memory.anvilHistory = capped(memory.anvilHistory);
  });
}

export function recordPotionUse(result) {
  return update((memory) => {
    memory.potionHistory.unshift(compactResult(result));
    memory.potionHistory = capped(memory.potionHistory);
  });
}

export function recordBrewingAttempt(result) {
  return update((memory) => {
    memory.brewingHistory.unshift(compactResult(result));
    memory.brewingHistory = capped(memory.brewingHistory);
  });
}

export function markUpgradeBlocked(id, reason) {
  return update((memory) => {
    memory.blockedUpgrades[id] = { id, reason: String(reason || 'blocked'), blockedAt: now() };
  });
}

export function getGearHistory(limit = 20) {
  const memory = loadGearMemory();
  return [
    ...memory.upgradeHistory.map((entry) => ({ ...entry, category: 'upgrade' })),
    ...memory.enchantingHistory.map((entry) => ({ ...entry, category: 'enchanting' })),
    ...memory.anvilHistory.map((entry) => ({ ...entry, category: 'anvil' })),
    ...memory.potionHistory.map((entry) => ({ ...entry, category: 'potion' })),
    ...memory.brewingHistory.map((entry) => ({ ...entry, category: 'brewing' }))
  ]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, Math.max(1, Number(limit) || 20));
}

export { memoryPath as gearMemoryPath };

