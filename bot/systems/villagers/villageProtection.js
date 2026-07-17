import { loadConfig } from '../../config.js';
import * as villagerMemory from './villagerMemory.js';
import { scanNearbyVillagers } from './villagerScanner.js';

const config = loadConfig();

const VILLAGE_THREATS = new Set([
  'zombie',
  'zombie_villager',
  'husk',
  'drowned',
  'skeleton',
  'stray',
  'creeper',
  'witch',
  'pillager',
  'vindicator',
  'evoker',
  'ravager'
]);

function nearbyThreats(bot, radius = 24) {
  if (!bot?.entities || !bot?.entity?.position) return [];
  return Object.values(bot.entities)
    .filter((entity) => VILLAGE_THREATS.has(String(entity.name || '').toLowerCase()))
    .filter((entity) => entity.position && bot.entity.position.distanceTo(entity.position) <= radius)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      distance: Math.round(bot.entity.position.distanceTo(entity.position)),
      position: {
        x: Math.round(entity.position.x),
        y: Math.round(entity.position.y),
        z: Math.round(entity.position.z)
      }
    }))
    .sort((a, b) => a.distance - b.distance);
}

export function scanVillageThreats(bot, memory = null) {
  const villagers = scanNearbyVillagers(bot, memory, Number(config.villagerScanRadius || 32));
  const threats = nearbyThreats(bot);
  return {
    ok: true,
    villagers: villagers.villagers,
    threats,
    danger: threats.length > 0
  };
}

export function villageProtectionStatus(bot, memory = null) {
  const scan = scanVillageThreats(bot, memory);
  const known = villagerMemory.summarizeVillagerMemory();
  return {
    ok: true,
    message: scan.danger
      ? `Village warning: ${scan.threats.length} threat(s) near villagers.`
      : `Village protection is quiet. Nearby villagers: ${scan.villagers.length}; known valuable villagers: ${known.valuableVillagers}.`,
    evidence: ['villager_protected_reported'],
    data: {
      ...scan,
      known
    }
  };
}

export function warnAboutVillageThreats(bot, memory = null) {
  const scan = scanVillageThreats(bot, memory);
  if (!scan.danger) return { ok: true, message: 'No immediate village threats detected.', evidence: ['villager_protected_reported'], data: scan };
  return {
    ok: true,
    message: `Village danger: ${scan.threats.slice(0, 3).map((t) => `${t.name} ${t.distance}m`).join(', ')}.`,
    evidence: ['villager_protected_reported'],
    data: scan
  };
}

export function markVillagerAtRisk(bot, memory, villagerId, reason = '') {
  const villager = villagerMemory.updateVillager(villagerId, {
    notes: reason || 'Marked at risk near village threat.',
    valuable: true
  });
  return {
    ok: Boolean(villager),
    message: villager ? `Marked ${villager.profession} villager as at risk.` : 'Could not find that villager in memory.',
    evidence: villager ? ['villager_memory_updated'] : [],
    data: { villager }
  };
}

export function suggestVillageSafetyActions(bot, memory = null) {
  const scan = scanVillageThreats(bot, memory);
  const suggestions = [];
  if (scan.threats.length) suggestions.push('stay close to villagers and avoid hitting iron golems');
  if (scan.villagers.length) suggestions.push('light paths around villagers if ModVinny approves');
  if (!scan.villagers.length) suggestions.push('scan for villagers before planning protection');
  return {
    ok: true,
    message: `Village safety suggestion: ${suggestions[0] || 'no action needed'}.`,
    evidence: ['villager_protected_reported'],
    data: { suggestions, scan }
  };
}

export function lightVillageAreaIfSafe(bot, memory = null) {
  return {
    ok: false,
    reason: 'Village lighting is planned but not enabled for Phase 14 automation. Use normal torch placement commands with confirmation.',
    evidence: ['villager_protected_reported'],
    data: suggestVillageSafetyActions(bot, memory).data
  };
}

export async function guardVillageArea(bot, memory = null, options = {}) {
  return {
    ok: false,
    reason: 'Active village guarding is not enabled in Phase 14. tj can warn and track threats without starting risky combat.',
    evidence: ['villager_protected_reported'],
    data: scanVillageThreats(bot, memory)
  };
}

export default {
  villageProtectionStatus,
  scanVillageThreats,
  warnAboutVillageThreats,
  guardVillageArea,
  markVillagerAtRisk,
  suggestVillageSafetyActions,
  lightVillageAreaIfSafe
};
