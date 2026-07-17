import fs from 'node:fs';
import path from 'node:path';

function cloneDefault(defaultShape) {
  if (typeof defaultShape === 'function') return defaultShape();
  return JSON.parse(JSON.stringify(defaultShape ?? {}));
}

export function backupCorruptFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.corrupt-${Date.now()}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function validateJsonShape(data, schemaOrValidator) {
  if (!schemaOrValidator) return { ok: true };
  if (typeof schemaOrValidator === 'function') {
    const result = schemaOrValidator(data);
    if (result === true || result?.ok) return { ok: true };
    return { ok: false, reason: result?.reason || 'JSON shape validation failed.' };
  }
  if (schemaOrValidator && typeof schemaOrValidator === 'object') {
    for (const key of Object.keys(schemaOrValidator)) {
      if (!(key in (data || {}))) return { ok: false, reason: `Missing key: ${key}` };
    }
  }
  return { ok: true };
}

export function loadJsonSafe(filePath, defaultShape = {}, validator = null) {
  try {
    if (!fs.existsSync(filePath)) {
      const next = cloneDefault(defaultShape);
      saveJsonAtomic(filePath, next);
      return next;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validation = validateJsonShape(parsed, validator);
    if (!validation.ok) {
      backupCorruptFile(filePath);
      const next = cloneDefault(defaultShape);
      saveJsonAtomic(filePath, next);
      return next;
    }
    return parsed;
  } catch {
    backupCorruptFile(filePath);
    const next = cloneDefault(defaultShape);
    saveJsonAtomic(filePath, next);
    return next;
  }
}

export function saveJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
  return { ok: true, filePath };
}

export function capHistoryArray(data, key, limit = 100) {
  if (!data || !Array.isArray(data[key])) return data;
  if (data[key].length > limit) data[key] = data[key].slice(-limit);
  return data;
}
