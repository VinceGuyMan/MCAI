import * as threatAssessment from './threatAssessment.js';

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scanBaseThreats(bot, memory) {
  const home = memory.get?.().homeBasePosition;
  if (!home) return [];
  return threatAssessment.scanThreats(bot, memory, bot.mcaiConfig?.defendBaseRadius || 24)
    .filter((threat) => threat.kind === 'hostile' && distance(home, threat.position) <= (bot.mcaiConfig?.defendBaseRadius || 24));
}

export function baseDefenseStatus(bot, memory) {
  const threats = scanBaseThreats(bot, memory);
  return {
    mode: memory.get?.().combatMode || 'off',
    home: memory.get?.().homeBasePosition || null,
    threats,
    message: threats.length ? `Base threats: ${threatAssessment.summarizeThreats(threats)}.` : 'No base threats nearby.'
  };
}

export async function guardHome(bot, memory, options = {}) {
  memory.update?.({ combatMode: 'guard_base', guardedPosition: memory.get().homeBasePosition || null });
  return { ok: true, message: 'Guarding base.' };
}

export async function guardFarm(bot, memory) {
  memory.update?.({ combatMode: 'guard_base', guardedPosition: memory.get().primaryFarmArea?.center || null });
  return { ok: true, message: 'Guarding farm area.' };
}

export async function guardAnimalPens(bot, memory) {
  memory.update?.({ combatMode: 'guard_base', guardedPosition: memory.get().knownAnimalPens?.[0]?.center || null });
  return { ok: true, message: 'Guarding animal pens.' };
}

export async function defendKnownArea(bot, memory, area, options = {}) {
  memory.update?.({ combatMode: 'guard_position', guardedPosition: area?.center || area || bot.entity?.position });
  return { ok: true, message: 'Guarding known area.' };
}

export async function lightThreatArea(bot, memory, options = {}) {
  if (!bot.mcaiConfig?.homeLightingEnabled) return { ok: false, message: 'Home lighting is disabled.' };
  if (options.actions?.placeTorch) {
    await options.actions.placeTorch();
    return { ok: true, message: 'Placed a defensive torch.' };
  }
  return { ok: false, message: 'Torch placement unavailable.' };
}

export async function baseDefenseTick(bot, memory, options = {}) {
  const status = baseDefenseStatus(bot, memory);
  if (!status.threats.length) return { ok: true, message: 'No base threats.' };
  if (options.actions?.engageHostile) return options.actions.engageHostile(status.threats[0].name);
  return { ok: false, message: status.message };
}
