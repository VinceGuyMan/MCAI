import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCommandAlias } from './commandRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MEMORY_PATH = path.resolve(__dirname, '..', 'command-learning-memory.json');
const MAX_MAPPINGS = 200;
const MAX_FAILURES = 100;

function now() {
  return Date.now();
}

function memoryPath(filePath = null) {
  return filePath || process.env.MCAI_COMMAND_LEARNING_MEMORY || DEFAULT_MEMORY_PATH;
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function backupMalformedFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.bad-${Date.now()}`;
  try {
    fs.copyFileSync(filePath, backupPath);
    console.warn(`[commandLearningMemory] Malformed memory backed up to ${backupPath}`);
  } catch (error) {
    console.warn(`[commandLearningMemory] Could not back up malformed memory: ${error.message}`);
  }
}

function defaultMemory() {
  const timestamp = now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    mappings: [],
    failures: []
  };
}

export function normalizeLearnedPhrase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/^@?tj\b\s*/i, '')
    .replace(/^!tj\b\s*/i, '')
    .replace(/^!ai\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCanonical(command) {
  const text = String(command || '').trim();
  if (!text) return '';
  return /^tj\b/i.test(text) ? text.toLowerCase().replace(/\s+/g, ' ').trim() : `tj ${text.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function isOwnerApproved(metadata = {}) {
  return metadata.approvedByOwner === true || metadata.isOwner === true || metadata.sender === 'ModVinny';
}

function safeMapping(input = {}) {
  const phrase = normalizeLearnedPhrase(input.phrase);
  const canonicalCommand = normalizeCanonical(input.canonicalCommand);
  if (!phrase || !canonicalCommand) return null;
  return {
    phrase,
    canonicalCommand,
    confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.8)),
    approvedByOwner: input.approvedByOwner === true,
    timesUsed: Math.max(0, Number(input.timesUsed) || 0),
    successCount: Math.max(0, Number(input.successCount) || 0),
    failureCount: Math.max(0, Number(input.failureCount) || 0),
    lastUsedAt: Math.max(0, Number(input.lastUsedAt) || 0),
    createdAt: Math.max(0, Number(input.createdAt) || now()),
    updatedAt: Math.max(0, Number(input.updatedAt) || now()),
    notes: String(input.notes || '').slice(0, 240)
  };
}

export function ensureCommandLearningMemoryShape(memory) {
  const fallback = defaultMemory();
  const input = memory && typeof memory === 'object' && !Array.isArray(memory) ? memory : {};
  const shaped = {
    version: Number.isFinite(input.version) ? input.version : 1,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : fallback.createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : fallback.updatedAt,
    mappings: Array.isArray(input.mappings) ? input.mappings.map(safeMapping).filter(Boolean).slice(0, MAX_MAPPINGS) : [],
    failures: Array.isArray(input.failures) ? input.failures.filter(Boolean).slice(0, MAX_FAILURES).map((item) => ({
      phrase: normalizeLearnedPhrase(item.phrase),
      canonicalCommand: normalizeCanonical(item.canonicalCommand || ''),
      reason: String(item.reason || '').slice(0, 240),
      at: Math.max(0, Number(item.at) || 0)
    })) : []
  };
  return shaped;
}

export function loadCommandLearningMemory(filePath = null) {
  const targetPath = memoryPath(filePath);
  if (!fs.existsSync(targetPath)) {
    const memory = defaultMemory();
    saveCommandLearningMemory(memory, targetPath);
    return memory;
  }
  try {
    return ensureCommandLearningMemoryShape(JSON.parse(fs.readFileSync(targetPath, 'utf8')));
  } catch (error) {
    console.warn(`[commandLearningMemory] Could not read command-learning-memory.json: ${error.message}`);
    backupMalformedFile(targetPath);
    const memory = defaultMemory();
    saveCommandLearningMemory(memory, targetPath);
    return memory;
  }
}

export function saveCommandLearningMemory(memory, filePath = null) {
  const targetPath = memoryPath(filePath);
  const shaped = ensureCommandLearningMemoryShape(memory);
  shaped.updatedAt = now();
  atomicWriteJson(targetPath, shaped);
  return shaped;
}

function updateMemory(mutator, filePath = null) {
  const memory = loadCommandLearningMemory(filePath);
  const result = mutator(memory) || memory;
  return saveCommandLearningMemory(result, filePath);
}

export function validateLearnedCommandTarget(canonicalCommand, metadata = {}) {
  const canonical = normalizeCanonical(canonicalCommand);
  const command = findCommandAlias(canonical);
  if (!command || !command.implemented) return { ok: false, reason: `Unsupported command mapping: ${canonical || 'none'}.`, command: null, canonicalCommand: canonical };
  if (command.requiresConfirmation && metadata.confirmed !== true) {
    return { ok: false, reason: `Risky command mappings require confirmation: ${canonical}.`, command, canonicalCommand: canonical };
  }
  return { ok: true, command, canonicalCommand: command.aliases?.[0] || canonical };
}

export function rememberCommandMapping(phrase, canonicalCommand, metadata = {}) {
  const normalizedPhrase = normalizeLearnedPhrase(phrase);
  if (!normalizedPhrase) return { ok: false, reason: 'No phrase provided.' };
  if (!isOwnerApproved(metadata)) return { ok: false, reason: 'Only ModVinny can teach command mappings.' };

  const target = validateLearnedCommandTarget(canonicalCommand, metadata);
  if (!target.ok) return target;

  const confidence = Math.max(0.55, Math.min(1, Number(metadata.confidence) || 0.84));
  const notes = String(metadata.notes || '').slice(0, 240);
  let saved = null;
  updateMemory((memory) => {
    const existing = memory.mappings.find((item) => item.phrase === normalizedPhrase);
    if (existing) {
      existing.canonicalCommand = target.canonicalCommand;
      existing.confidence = Math.max(existing.confidence || 0, confidence);
      existing.approvedByOwner = true;
      existing.updatedAt = now();
      if (notes) existing.notes = notes;
      saved = existing;
    } else {
      saved = {
        phrase: normalizedPhrase,
        canonicalCommand: target.canonicalCommand,
        confidence,
        approvedByOwner: true,
        timesUsed: 0,
        successCount: 0,
        failureCount: 0,
        lastUsedAt: 0,
        createdAt: now(),
        updatedAt: now(),
        notes
      };
      memory.mappings.unshift(saved);
      memory.mappings = memory.mappings.slice(0, MAX_MAPPINGS);
    }
    return memory;
  }, metadata.filePath);

  return { ok: true, message: `Learned "${normalizedPhrase}" -> ${target.canonicalCommand}.`, mapping: { ...saved } };
}

function phraseSimilarity(a, b) {
  const left = new Set(normalizeLearnedPhrase(a).split(' ').filter(Boolean));
  const right = new Set(normalizeLearnedPhrase(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

export function findLearnedCommandMapping(phrase, filePath = null) {
  const normalizedPhrase = normalizeLearnedPhrase(phrase);
  if (!normalizedPhrase) return null;
  const memory = loadCommandLearningMemory(filePath);
  const exact = memory.mappings.find((item) => item.phrase === normalizedPhrase && item.approvedByOwner);
  if (exact) return { ...exact, matchConfidence: Math.max(0.9, exact.confidence || 0.84), matchType: 'exact' };

  const candidates = memory.mappings
    .filter((item) => item.approvedByOwner)
    .map((item) => {
      const similarity = phraseSimilarity(normalizedPhrase, item.phrase);
      const confidence = Math.min(0.86, (item.confidence || 0.75) * similarity);
      return { ...item, matchConfidence: confidence, matchType: 'fuzzy' };
    })
    .filter((item) => item.matchConfidence >= 0.68)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);
  return candidates[0] || null;
}

export function updateMappingSuccess(phrase, filePath = null) {
  const normalizedPhrase = normalizeLearnedPhrase(phrase);
  let updated = null;
  updateMemory((memory) => {
    const mapping = memory.mappings.find((item) => item.phrase === normalizedPhrase);
    if (mapping) {
      mapping.timesUsed += 1;
      mapping.successCount += 1;
      mapping.lastUsedAt = now();
      mapping.confidence = Math.min(0.98, (mapping.confidence || 0.84) + 0.02);
      mapping.updatedAt = now();
      updated = mapping;
    }
    return memory;
  }, filePath);
  return updated ? { ok: true, mapping: { ...updated } } : { ok: false, reason: 'Mapping not found.' };
}

export function updateMappingFailure(phrase, reason = '', filePath = null) {
  const normalizedPhrase = normalizeLearnedPhrase(phrase);
  updateMemory((memory) => {
    const mapping = memory.mappings.find((item) => item.phrase === normalizedPhrase);
    if (mapping) {
      mapping.failureCount += 1;
      mapping.confidence = Math.max(0.45, (mapping.confidence || 0.84) - 0.05);
      mapping.updatedAt = now();
    }
    memory.failures.unshift({
      phrase: normalizedPhrase,
      canonicalCommand: mapping?.canonicalCommand || '',
      reason: String(reason || '').slice(0, 240),
      at: now()
    });
    memory.failures = memory.failures.slice(0, MAX_FAILURES);
    return memory;
  }, filePath);
  return { ok: true };
}

export function listLearnedMappings(filePath = null) {
  return loadCommandLearningMemory(filePath).mappings.map((item) => ({ ...item }));
}

export function forgetCommandMapping(phrase, filePath = null) {
  const normalizedPhrase = normalizeLearnedPhrase(phrase);
  let removed = null;
  updateMemory((memory) => {
    const before = memory.mappings.length;
    memory.mappings = memory.mappings.filter((item) => {
      const keep = item.phrase !== normalizedPhrase;
      if (!keep) removed = item;
      return keep;
    });
    if (memory.mappings.length !== before) memory.updatedAt = now();
    return memory;
  }, filePath);
  return removed ? { ok: true, mapping: { ...removed } } : { ok: false, reason: 'Mapping not found.' };
}
