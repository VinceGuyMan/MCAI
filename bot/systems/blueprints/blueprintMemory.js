import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// systems/blueprints → repo root (MCAI/)
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const config = loadConfig();
const DEFAULT_FILE = path.join(projectRoot, config.blueprintMemoryFile || 'blueprint-memory.json');

function now() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultMemory() {
  const at = now();
  return {
    version: 1,
    createdAt: at,
    updatedAt: at,
    knownBlueprints: [],
    buildHistory: [],
    activeBuild: null,
    pausedBuilds: [],
    failedBuilds: [],
    lastBuildStatus: null
  };
}

function backupMalformed(file, text) {
  try {
    fs.writeFileSync(`${file}.malformed-${Date.now()}.bak`, text || '', 'utf8');
  } catch {
    // Best-effort backup only.
  }
}

function atomicWrite(file, data) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    fs.renameSync(temp, file);
  }
}

function point(position = {}) {
  return {
    x: Math.round(Number(position.x ?? 0)),
    y: Math.round(Number(position.y ?? 64)),
    z: Math.round(Number(position.z ?? 0))
  };
}

function ensureRecord(record = {}) {
  return {
    id: String(record.id || `build_${now()}`),
    blueprintId: String(record.blueprintId || ''),
    status: String(record.status || 'planned'),
    dimension: String(record.dimension || 'overworld'),
    origin: point(record.origin),
    rotation: Number(record.rotation || 0),
    createdAt: Number(record.createdAt || now()),
    startedAt: record.startedAt ?? null,
    completedAt: record.completedAt ?? null,
    placedBlocks: Array.isArray(record.placedBlocks) ? record.placedBlocks.slice(0, 512) : [],
    failedBlocks: Array.isArray(record.failedBlocks) ? record.failedBlocks.slice(0, 256) : [],
    remainingBlocks: Array.isArray(record.remainingBlocks) ? record.remainingBlocks.slice(0, 512) : [],
    materialSnapshot: record.materialSnapshot && typeof record.materialSnapshot === 'object' ? record.materialSnapshot : {},
    evidence: Array.isArray(record.evidence) ? record.evidence.slice(0, 100) : [],
    reason: String(record.reason || '')
  };
}

export function ensureBlueprintMemoryShape(memory = {}) {
  const base = defaultMemory();
  const shaped = {
    version: Number(memory.version || 1),
    createdAt: Number(memory.createdAt || base.createdAt),
    updatedAt: Number(memory.updatedAt || memory.createdAt || base.updatedAt),
    knownBlueprints: Array.isArray(memory.knownBlueprints) ? memory.knownBlueprints : [],
    buildHistory: Array.isArray(memory.buildHistory) ? memory.buildHistory.map(ensureRecord).slice(-100) : [],
    activeBuild: memory.activeBuild ? ensureRecord(memory.activeBuild) : null,
    pausedBuilds: Array.isArray(memory.pausedBuilds) ? memory.pausedBuilds.map(ensureRecord).slice(-20) : [],
    failedBuilds: Array.isArray(memory.failedBuilds) ? memory.failedBuilds.map(ensureRecord).slice(-20) : [],
    lastBuildStatus: memory.lastBuildStatus || null
  };
  return shaped;
}

export function loadBlueprintMemory(file = DEFAULT_FILE) {
  if (!fs.existsSync(file)) {
    const memory = defaultMemory();
    saveBlueprintMemory(memory, file);
    return memory;
  }
  const text = fs.readFileSync(file, 'utf8');
  try {
    return ensureBlueprintMemoryShape(JSON.parse(text));
  } catch {
    backupMalformed(file, text);
    const memory = defaultMemory();
    saveBlueprintMemory(memory, file);
    return memory;
  }
}

export function saveBlueprintMemory(memory, file = DEFAULT_FILE) {
  const shaped = ensureBlueprintMemoryShape(memory);
  shaped.updatedAt = now();
  atomicWrite(file, shaped);
  return shaped;
}

function mutate(updater) {
  const memory = loadBlueprintMemory();
  const result = updater(memory) || memory;
  saveBlueprintMemory(memory);
  return clone(result);
}

function findRecord(memory, buildId) {
  if (memory.activeBuild?.id === buildId) return memory.activeBuild;
  return memory.pausedBuilds.find((record) => record.id === buildId) ||
    memory.buildHistory.find((record) => record.id === buildId) ||
    memory.failedBuilds.find((record) => record.id === buildId) || null;
}

export function createBuildRecord(blueprint, origin, options = {}) {
  return mutate((memory) => {
    const id = options.id || `build_${Date.now()}`;
    const record = ensureRecord({
      id,
      blueprintId: blueprint.id,
      status: options.status || 'planned',
      dimension: options.dimension || 'overworld',
      origin,
      rotation: options.rotation || 0,
      remainingBlocks: options.remainingBlocks || blueprint.blocks || [],
      materialSnapshot: options.materialSnapshot || {}
    });
    memory.buildHistory.push(record);
    memory.buildHistory = memory.buildHistory.slice(-100);
    memory.lastBuildStatus = { id, status: record.status, blueprintId: record.blueprintId, at: now() };
    return record;
  });
}

export function setActiveBuild(buildId) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'active';
    record.startedAt = record.startedAt || now();
    memory.activeBuild = ensureRecord(record);
    memory.pausedBuilds = memory.pausedBuilds.filter((item) => item.id !== buildId);
    memory.lastBuildStatus = { id: buildId, status: 'active', at: now() };
    return memory.activeBuild;
  });
}

export function getActiveBuild() {
  return clone(loadBlueprintMemory().activeBuild);
}

export function updateBuildRecord(buildId, updates) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    Object.assign(record, updates || {});
    memory.lastBuildStatus = { id: buildId, status: record.status, at: now() };
    if (memory.activeBuild?.id === buildId) memory.activeBuild = ensureRecord(record);
    return ensureRecord(record);
  });
}

export function recordBlockPlaced(buildId, blockInfo, evidence = []) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.placedBlocks.push({ ...blockInfo, at: now() });
    record.remainingBlocks = record.remainingBlocks.filter((entry) => entry.index !== blockInfo.index);
    record.evidence.push(...evidence);
    return ensureRecord(record);
  });
}

export function recordBlockFailed(buildId, blockInfo, reason) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.failedBlocks.push({ ...blockInfo, reason: String(reason || 'failed'), at: now() });
    record.reason = String(reason || record.reason || 'block failed');
    return ensureRecord(record);
  });
}

export function pauseBuild(buildId, reason = 'paused') {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'paused';
    record.reason = reason;
    memory.pausedBuilds = [ensureRecord(record), ...memory.pausedBuilds.filter((item) => item.id !== buildId)].slice(0, 20);
    if (memory.activeBuild?.id === buildId) memory.activeBuild = null;
    memory.lastBuildStatus = { id: buildId, status: 'paused', reason, at: now() };
    return record;
  });
}

export function resumeBuild(buildId) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'approved';
    record.reason = '';
    memory.pausedBuilds = memory.pausedBuilds.filter((item) => item.id !== buildId);
    memory.lastBuildStatus = { id: buildId, status: 'approved', at: now() };
    return record;
  });
}

export function cancelBuild(buildId, reason = 'cancelled') {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'cancelled';
    record.reason = reason;
    record.completedAt = now();
    record.evidence.push('blueprint_build_cancelled');
    if (memory.activeBuild?.id === buildId) memory.activeBuild = null;
    memory.pausedBuilds = memory.pausedBuilds.filter((item) => item.id !== buildId);
    memory.lastBuildStatus = { id: buildId, status: 'cancelled', reason, at: now() };
    return record;
  });
}

export function completeBuild(buildId, evidence = []) {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'completed';
    record.completedAt = now();
    record.evidence.push(...evidence, 'blueprint_build_completed');
    if (memory.activeBuild?.id === buildId) memory.activeBuild = null;
    memory.lastBuildStatus = { id: buildId, status: 'completed', at: now() };
    return record;
  });
}

export function failBuild(buildId, reason = 'failed') {
  return mutate((memory) => {
    const record = findRecord(memory, buildId);
    if (!record) return null;
    record.status = 'failed';
    record.reason = reason;
    record.completedAt = now();
    record.evidence.push('blueprint_build_failed');
    memory.failedBuilds = [ensureRecord(record), ...memory.failedBuilds.filter((item) => item.id !== buildId)].slice(0, 20);
    if (memory.activeBuild?.id === buildId) memory.activeBuild = null;
    memory.lastBuildStatus = { id: buildId, status: 'failed', reason, at: now() };
    return record;
  });
}

export function getBuildHistory(limit = 20) {
  return clone(loadBlueprintMemory().buildHistory.slice(-limit).reverse());
}

export function getBlueprintBuildStats(blueprintId) {
  const history = loadBlueprintMemory().buildHistory.filter((record) => record.blueprintId === blueprintId);
  return {
    blueprintId,
    total: history.length,
    completed: history.filter((record) => record.status === 'completed').length,
    failed: history.filter((record) => record.status === 'failed').length,
    cancelled: history.filter((record) => record.status === 'cancelled').length
  };
}

export default {
  loadBlueprintMemory,
  saveBlueprintMemory,
  ensureBlueprintMemoryShape,
  createBuildRecord,
  setActiveBuild,
  getActiveBuild,
  updateBuildRecord,
  recordBlockPlaced,
  recordBlockFailed,
  pauseBuild,
  resumeBuild,
  cancelBuild,
  completeBuild,
  failBuild,
  getBuildHistory,
  getBlueprintBuildStats
};
