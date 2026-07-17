import { getCommands } from './commandRegistry.js';

const DEFAULT_OWNER = 'ModVinny';
const DEFAULT_TTL_MS = 60000;

const pending = new Map();

const riskyTypes = new Set([
  'nether_entry',
  'portal_lighting',
  'villager_trade',
  'blueprint_build',
  'enchant_item',
  'anvil_use',
  'use_book',
  'use_potion',
  'brewing',
  'bridge_region_change',
  'diamond_mining',
  'deep_mining',
  'pvp',
  'large_build',
  'schematic_import',
  'memory_reset',
  'dashboard_control_risky'
]);

function now() {
  return Date.now();
}

function ownerFrom(options = {}) {
  return options.ownerUsername || options.config?.ownerUsername || DEFAULT_OWNER;
}

function isOwner(sender, options = {}) {
  return Boolean(sender && sender === ownerFrom(options));
}

function redactValue(value) {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, next] of Object.entries(value)) {
    if (/token|secret|key|password|env/i.test(key)) out[key] = '[redacted]';
    else out[key] = redactValue(next);
  }
  return out;
}

export function requestConfirmation(type, payload = {}, options = {}) {
  if (!type || typeof type !== 'string') return { ok: false, reason: 'Confirmation type is required.' };
  const createdAt = now();
  const expiresAt = createdAt + Math.max(1, Number(options.expiresInMs ?? options.ttlMs ?? DEFAULT_TTL_MS));
  const confirmation = {
    id: `${type}_${createdAt}`,
    type,
    payload: redactValue(payload),
    description: String(options.description || payload.description || type).slice(0, 240),
    requestedBy: options.requestedBy || options.sender || null,
    ownerUsername: ownerFrom(options),
    risky: riskyTypes.has(type) || Boolean(options.risky),
    createdAt,
    expiresAt
  };
  pending.set(type, confirmation);
  return { ok: true, confirmation };
}

export function getPendingConfirmation(type) {
  clearExpiredConfirmations();
  if (type) return pending.get(type) || null;
  return null;
}

export function listPendingConfirmations() {
  clearExpiredConfirmations();
  return [...pending.values()].map((item) => ({ ...item, payload: redactValue(item.payload) }));
}

export function confirm(type, sender, options = {}) {
  clearExpiredConfirmations();
  const confirmation = pending.get(type);
  if (!confirmation) return { ok: false, reason: `No pending confirmation for ${type}.` };
  if (!isOwner(sender, { ...options, ownerUsername: confirmation.ownerUsername })) {
    return { ok: false, reason: 'Only ModVinny can confirm this action.' };
  }
  pending.delete(type);
  return { ok: true, confirmation };
}

export function rejectConfirmation(type, sender, options = {}) {
  clearExpiredConfirmations();
  const confirmation = pending.get(type);
  if (!confirmation) return { ok: false, reason: `No pending confirmation for ${type}.` };
  if (!isOwner(sender, { ...options, ownerUsername: confirmation.ownerUsername })) {
    return { ok: false, reason: 'Only ModVinny can reject this confirmation.' };
  }
  pending.delete(type);
  return { ok: true, confirmation };
}

export function clearExpiredConfirmations() {
  const cutoff = now();
  for (const [type, confirmation] of pending.entries()) {
    if (confirmation.expiresAt <= cutoff) pending.delete(type);
  }
}

export function clearAllConfirmations(reason = 'cleared') {
  const count = pending.size;
  pending.clear();
  return { ok: true, count, reason };
}

export function requiresConfirmation(actionOrSkill) {
  if (!actionOrSkill) return false;
  if (typeof actionOrSkill === 'object') {
    return Boolean(actionOrSkill.requiresConfirmation || ['medium', 'high'].includes(actionOrSkill.riskLevel));
  }
  const name = String(actionOrSkill);
  const command = getCommands().find((item) => item.action === name || item.name === name);
  if (command) return Boolean(command.requiresConfirmation || ['medium', 'high'].includes(command.riskLevel));
  return riskyTypes.has(name);
}

export function validateConfirmationForAction(actionName, context = {}) {
  if (!requiresConfirmation(actionName)) return { ok: true, confirmed: true };
  if (context.confirmed === true || context.approved === true) return { ok: true, confirmed: true };
  const type = context.confirmationType || actionName;
  const confirmation = getPendingConfirmation(type);
  if (!confirmation) return { ok: false, reason: `${actionName} requires confirmation.` };
  if (context.sender && context.sender !== confirmation.ownerUsername) return { ok: false, reason: 'Only ModVinny can use this confirmation.' };
  return { ok: true, confirmed: true, confirmation };
}

export function getRiskyConfirmationTypes() {
  return [...riskyTypes].sort();
}
