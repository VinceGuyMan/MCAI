import { generateIdleBanter } from './responseGenerator.js';
import { isCompanionMode, buildGroundedAmbientLine } from './companionMode.js';

function ownerNearby(bot, config) {
  const owner = bot.players?.[config.ownerUsername]?.entity;
  if (!owner || !bot.entity) return false;
  return bot.entity.position.distanceTo(owner.position) <= (config.maxAutonomyDistanceFromOwner || 32);
}

export function canIdleBanter(bot, memory) {
  const config = bot.mcaiConfig || {};
  const mem = memory.get();
  const now = Date.now();
  const quietAfterActivityMs = Number(config.ambientAfterOwnerActivityCooldownMs || config.idleAutonomyDelayMs || 100000);
  if (!config.lifelikeDialogueEnabled || !config.allowAmbientComments || mem.ambientDialogueEnabled === false || mem.banterEnabled === false) return false;
  if (!ownerNearby(bot, config)) return false;
  if (mem.currentTask || mem.activeMiningExpedition || mem.activeExploration || mem.netherScoutActive || mem.followOwnerActive) return false;
  // Allow ambient while soft-following as a companion; block other movement modes.
  if (mem.movementMode && mem.movementMode !== 'companion_soft_follow') return false;
  if ((mem.combatMode || 'off') !== 'off') return false;
  if (bot.health <= 8 || bot.food <= 8) return false;
  if (/nether|end/.test(String(bot.game?.dimension || ''))) return false;
  if (now - Number(mem.lastOwnerActivityAt || 0) < quietAfterActivityMs) return false;
  if (now - Number(mem.lastManualStopAt || 0) < quietAfterActivityMs) return false;
  if (now - Number(mem.lastActionAt || 0) < Math.min(quietAfterActivityMs, 30000)) return false;
  return now - (mem.lastAmbientCommentAt || 0) >= (config.ambientCommentCooldownMs || 120000);
}

export function getIdleBanterContext(bot, memory, mapMemory) {
  return {
    position: bot.entity?.position,
    home: memory.get().homeBasePosition || null,
    waypoints: mapMemory?.waypoints?.slice(0, 3) || []
  };
}

export async function maybeIdleBanter(bot, memory, mapMemory) {
  if (!canIdleBanter(bot, memory)) return false;
  const config = bot.mcaiConfig || {};
  // Prefer short world-grounded lines in companion mode; LLM banter is fallback.
  if (isCompanionMode(config, memory) && config.companionAmbientGrounded !== false) {
    const grounded = buildGroundedAmbientLine({
      ownerDistance: (() => {
        const owner = bot.players?.[config.ownerUsername]?.entity;
        if (!owner || !bot.entity) return null;
        return bot.entity.position.distanceTo(owner.position);
      })(),
      health: bot.health,
      food: bot.food,
      dangerFlags: {
        nightTime: Boolean(bot.time?.isNight || (bot.time?.timeOfDay >= 12500 && bot.time?.timeOfDay <= 23000))
      },
      homeExists: Boolean(memory.get().homeBasePosition),
      nearHome: false
    }, config, memory);
    if (grounded) {
      memory.update({ lastAmbientCommentAt: Date.now(), lastDialogueAt: Date.now(), lastDialogueTopic: 'companion_ambient' });
      bot.chat(String(grounded).slice(0, config.maxChatResponseLength || 280));
      return true;
    }
  }
  const text = await generateIdleBanter(bot, memory, getIdleBanterContext(bot, memory, mapMemory));
  if (!text) return false;
  memory.update({ lastAmbientCommentAt: Date.now(), lastDialogueAt: Date.now(), lastDialogueTopic: 'ambient' });
  bot.chat(String(text).slice(0, bot.mcaiConfig?.maxChatResponseLength || 280));
  return true;
}
