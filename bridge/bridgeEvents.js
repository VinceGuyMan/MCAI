import { bridgeEventToEvidence } from './bridgeEvidence.js';
import { validateBridgeEvent } from './bridgeValidator.js';
import { addDangerZone, addWaypoint, loadMapMemory, saveMapMemory } from '../bot/mapMemory.js';

function now() {
  return Date.now();
}

function normalizePosition(position = {}) {
  return {
    x: Math.floor(Number(position.x || 0)),
    y: Math.floor(Number(position.y || 0)),
    z: Math.floor(Number(position.z || 0))
  };
}

function dimensionFromWorld(world = '') {
  const value = String(world).toLowerCase();
  if (value.includes('nether')) return 'nether';
  if (value.includes('end')) return 'end';
  return 'overworld';
}

export function normalizeBridgeEvent(raw = {}) {
  const world = String(raw.world || raw.dimension || '');
  return {
    id: String(raw.id || `evt_local_${now()}`),
    timestamp: Number(raw.timestamp || now()),
    type: String(raw.type || 'unknown'),
    world,
    dimension: String(raw.dimension || dimensionFromWorld(world)),
    player: String(raw.player || ''),
    position: normalizePosition(raw.position || {}),
    message: String(raw.message || raw.type || 'bridge event'),
    details: raw.details && typeof raw.details === 'object' ? { ...raw.details } : {}
  };
}

export function classifyBridgeEvent(event = {}) {
  if (/death|explosion|ignite|hostile|danger/.test(event.type)) return 'safety';
  if (/advancement/.test(event.type)) return 'progression';
  if (/region|portal/.test(event.type)) return 'region';
  if (/villager|golem/.test(event.type)) return 'villagers';
  if (/emergency_stop/.test(event.type)) return 'control';
  return 'telemetry';
}

export function eventToEvidence(event = {}) {
  return bridgeEventToEvidence(event);
}

export function eventToMemoryUpdate(event = {}) {
  return {
    lastBridgeEvent: event,
    lastBridgeEventAt: Date.now()
  };
}

export function eventToDashboardUpdate(event = {}) {
  return {
    id: event.id,
    type: event.type,
    message: event.message,
    timestamp: event.timestamp,
    category: classifyBridgeEvent(event)
  };
}

export function shouldNotifyOwner(event = {}) {
  return [
    'bridge_emergency_stop',
    'player_death',
    'hostile_near_region',
    'explosion_near_region',
    'block_ignite_near_region',
    'block_break_in_region',
    'villager_death',
    'iron_golem_death'
  ].includes(event.type);
}

export function summarizeBridgeEvent(event = {}) {
  const where = event.position ? ` at ${event.position.x},${event.position.y},${event.position.z}` : '';
  return `${event.type}: ${event.message || 'server event'}${where}`;
}

export function routeBridgeEvent(bot, memory, event) {
  const normalized = normalizeBridgeEvent(event);
  const validation = validateBridgeEvent(normalized);
  if (!validation.ok) return { ok: false, reason: validation.errors.join('; ') };
  const update = eventToMemoryUpdate(normalized);
  const current = typeof memory?.get === 'function' ? memory.get() : memory || {};
  const recent = Array.isArray(current.recentBridgeEvents) ? current.recentBridgeEvents.slice(-49) : [];
  recent.push(eventToDashboardUpdate(normalized));
  if (typeof memory?.update === 'function') memory.update({ ...update, recentBridgeEvents: recent });
  else Object.assign(memory || {}, { ...update, recentBridgeEvents: recent });
  try {
    const mapMemory = loadMapMemory();
    if (/region/.test(normalized.type) && normalized.position) {
      addWaypoint(mapMemory, {
        name: normalized.details?.regionId || normalized.message || normalized.type,
        type: 'bridge_region',
        dimension: normalized.dimension,
        position: normalized.position,
        createdBy: 'server_bridge',
        tags: ['bridge', normalized.type],
        notes: normalized.message
      });
      saveMapMemory(mapMemory);
    } else if (/death|explosion|ignite|hostile|danger/.test(normalized.type) && normalized.position) {
      addDangerZone(mapMemory, {
        dangerType: normalized.type,
        dimension: normalized.dimension,
        position: normalized.position,
        radius: 16,
        severity: /death|explosion/.test(normalized.type) ? 'high' : 'medium',
        notes: normalized.message
      });
      saveMapMemory(mapMemory);
    }
  } catch {
    // Bridge map sync is best-effort; bridge telemetry must never break chat or bot startup.
  }
  return {
    ok: true,
    event: normalized,
    category: classifyBridgeEvent(normalized),
    evidence: eventToEvidence(normalized),
    notifyOwner: shouldNotifyOwner(normalized)
  };
}
