import * as threatAssessment from './threatAssessment.js';

export function scanOwnerThreats(bot, memory) {
  const owner = bot.players?.[bot.mcaiConfig?.ownerUsername]?.entity;
  if (!owner) return [];
  return threatAssessment.scanThreats(bot, memory, bot.mcaiConfig?.defendOwnerRadius || 16)
    .filter((threat) => threat.kind === 'hostile' && threat.ownerThreat);
}

export function ownerDefenseStatus(bot, memory) {
  const threats = scanOwnerThreats(bot, memory);
  return {
    mode: memory.get?.().combatMode || 'off',
    threats,
    message: threats.length ? `Owner threats: ${threatAssessment.summarizeThreats(threats)}.` : 'No threats near ModVinny.'
  };
}

export async function warnOwnerOfThreat(bot, threat) {
  const now = Date.now();
  const memory = bot.mcaiMemory;
  if (now - (memory?.get?.().lastThreatWarningAt || 0) < (bot.mcaiConfig?.combatReportCooldownMs || 5000)) return { ok: true, message: 'warning throttled' };
  bot.chat(`Threat near ModVinny: ${threat.name} ${threat.distance} blocks away.`);
  memory?.update?.({ lastThreatWarningAt: now });
  return { ok: true, message: 'warned owner' };
}

export async function interceptThreatNearOwner(bot, memory, threat, options = {}) {
  if (!threat) return { ok: false, message: 'No owner threat.' };
  if (threat.name === 'creeper' && threat.distance <= 4) {
    await warnOwnerOfThreat(bot, threat);
    return options.actions?.fleeThreat?.(threat);
  }
  return options.actions?.engageThreat?.(threat.entity, { defendOwner: true }) || { ok: false, message: 'No engage action available.' };
}

export async function stayBetweenOwnerAndThreat(bot, memory, threat) {
  if (!threat) return { ok: false, message: 'No threat.' };
  await warnOwnerOfThreat(bot, threat);
  return { ok: true, message: 'Staying alert near ModVinny.' };
}

export async function defendOwnerTick(bot, memory, options = {}) {
  const threats = scanOwnerThreats(bot, memory);
  if (!threats.length) return { ok: true, message: 'No owner threats.' };
  return interceptThreatNearOwner(bot, memory, threats[0], options);
}
