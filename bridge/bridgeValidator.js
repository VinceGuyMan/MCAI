import { validateBridgeConfig as validateSecurityConfig } from './bridgeSecurity.js';

export const KNOWN_BRIDGE_EVENT_TYPES = new Set([
  'player_join',
  'player_quit',
  'player_death',
  'player_respawn',
  'player_changed_world',
  'player_advancement_done',
  'entity_death_near_region',
  'hostile_near_region',
  'explosion_near_region',
  'block_ignite_near_region',
  'block_break_in_region',
  'block_place_in_region',
  'portal_used',
  'villager_death',
  'iron_golem_death',
  'bridge_emergency_stop',
  'bridge_region_registered',
  'bridge_region_deleted',
  'unknown'
]);

const VALID_DIMENSIONS = new Set(['overworld', 'nether', 'end', 'unknown', '']);

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function validPosition(position = {}) {
  return finiteNumber(position.x) && finiteNumber(position.y) && finiteNumber(position.z) &&
    Math.abs(Number(position.x)) < 30000000 &&
    Number(position.y) > -256 &&
    Number(position.y) < 1024 &&
    Math.abs(Number(position.z)) < 30000000;
}

export function validateBridgeStatus(status = {}) {
  const errors = [];
  if (!status || typeof status !== 'object') errors.push('status must be an object');
  if (status.minecraftVersion != null && typeof status.minecraftVersion !== 'string') errors.push('minecraftVersion must be a string');
  if (status.onlinePlayers != null && !Array.isArray(status.onlinePlayers)) errors.push('onlinePlayers must be an array');
  if (status.worlds != null && !Array.isArray(status.worlds)) errors.push('worlds must be an array');
  if (status.tps != null && !finiteNumber(status.tps)) errors.push('tps must be numeric');
  return { ok: errors.length === 0, errors };
}

export function validateBridgeEvent(event = {}) {
  const errors = [];
  const warnings = [];
  if (!event || typeof event !== 'object') errors.push('event must be an object');
  if (!event.id || typeof event.id !== 'string') errors.push('event.id is required');
  if (!finiteNumber(event.timestamp)) errors.push('event.timestamp must be numeric');
  if (!event.type || typeof event.type !== 'string') errors.push('event.type is required');
  else if (!KNOWN_BRIDGE_EVENT_TYPES.has(event.type)) warnings.push(`unknown bridge event type: ${event.type}`);
  if (event.dimension != null && !VALID_DIMENSIONS.has(String(event.dimension))) warnings.push(`unknown dimension: ${event.dimension}`);
  if (event.position && !validPosition(event.position)) errors.push('event.position is invalid');
  const serializedSize = JSON.stringify(event).length;
  if (serializedSize > 32768) errors.push('event payload is too large');
  return { ok: errors.length === 0, errors, warnings };
}

export function validateBridgeRegion(region = {}) {
  const errors = [];
  if (!region || typeof region !== 'object') errors.push('region must be an object');
  for (const field of ['id', 'name', 'type', 'world']) {
    if (!region[field] || typeof region[field] !== 'string') errors.push(`region.${field} is required`);
  }
  if (!region.min || !validPosition(region.min)) errors.push('region.min is invalid');
  if (!region.max || !validPosition(region.max)) errors.push('region.max is invalid');
  if (region.min && region.max) {
    if (Number(region.min.x) > Number(region.max.x) || Number(region.min.y) > Number(region.max.y) || Number(region.min.z) > Number(region.max.z)) {
      errors.push('region min must not exceed max');
    }
  }
  if (JSON.stringify(region).length > 32768) errors.push('region payload is too large');
  return { ok: errors.length === 0, errors };
}

export function validateBridgePlayer(player = {}) {
  const errors = [];
  if (!player.name || typeof player.name !== 'string') errors.push('player.name is required');
  if (player.position && !validPosition(player.position)) errors.push('player.position is invalid');
  return { ok: errors.length === 0, errors };
}

export function validateBridgeConfig(config = {}) {
  return validateSecurityConfig(config);
}

export function rejectSuspiciousBridgeData(reason) {
  return { ok: false, trusted: false, reason: String(reason || 'suspicious bridge data') };
}

export function isBridgeEventTrusted(event = {}) {
  return validateBridgeEvent(event).ok;
}
