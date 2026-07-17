import { Vec3 } from 'vec3';
import * as inventory from './inventory.js';
import * as miningTools from './miningTools.js';

const dangerousBlockNames = new Set([
  'lava',
  'fire',
  'soul_fire',
  'cactus',
  'powder_snow',
  'magma_block',
  'void_air'
]);

const protectedBlockNames = new Set([
  'chest',
  'trapped_chest',
  'barrel',
  'bed',
  'furnace',
  'blast_furnace',
  'smoker',
  'crafting_table',
  'door',
  'trapdoor',
  'sign',
  'torch',
  'wall_torch',
  'lantern',
  'ladder',
  'rail',
  'redstone_wire',
  'redstone_torch',
  'redstone_wall_torch',
  'repeater',
  'comparator',
  'observer',
  'piston',
  'sticky_piston',
  'dispenser',
  'dropper',
  'hopper',
  'shulker_box',
  'ender_chest',
  'beacon',
  'enchanting_table',
  'anvil',
  'brewing_stand'
]);

const hostileNames = new Set([
  'blaze',
  'bogged',
  'breeze',
  'cave_spider',
  'creeper',
  'drowned',
  'elder_guardian',
  'endermite',
  'evoker',
  'ghast',
  'guardian',
  'hoglin',
  'husk',
  'magma_cube',
  'phantom',
  'piglin_brute',
  'pillager',
  'ravager',
  'shulker',
  'silverfish',
  'skeleton',
  'slime',
  'spider',
  'stray',
  'vex',
  'vindicator',
  'warden',
  'witch',
  'wither_skeleton',
  'zoglin',
  'zombie',
  'zombie_villager'
]);

function entityName(entity) {
  return String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
}

function sameBlock(a, b) {
  return Boolean(a && b && Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y) && Math.floor(a.z) === Math.floor(b.z));
}

function nearbyBlocks(bot, position, names, radius = 2) {
  if (!bot.entity || !position || typeof bot.findBlocks !== 'function') return [];
  const ids = names.map((name) => bot.registry?.blocksByName?.[name]?.id).filter(Boolean);
  if (!ids.length) return [];
  return bot.findBlocks({ matching: ids, point: position, maxDistance: radius, count: 32 })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean);
}

export function isProtectedBlockName(name) {
  const blockName = String(name || '').toLowerCase();
  if (!blockName) return true;
  if (protectedBlockNames.has(blockName)) return true;
  if (blockName.endsWith('_bed') || blockName.endsWith('_door') || blockName.endsWith('_trapdoor')) return true;
  if (blockName.endsWith('_sign') || blockName.endsWith('_shulker_box')) return true;
  return false;
}

export function isDangerousBlock(_bot, block) {
  return dangerousBlockNames.has(block?.name);
}

export function hasLavaNearby(bot, position, radius = 3) {
  return nearbyBlocks(bot, position, ['lava'], radius).length > 0;
}

export function hasFireNearby(bot, position, radius = 3) {
  return nearbyBlocks(bot, position, ['fire', 'soul_fire'], radius).length > 0;
}

export function hasWaterHazardNearby(bot, position, radius = 2) {
  return nearbyBlocks(bot, position, ['water'], radius).length > 0;
}

export function hasFallRisk(bot, position) {
  if (!position) return true;
  const below1 = bot.blockAt(position.offset(0, -1, 0));
  const below2 = bot.blockAt(position.offset(0, -2, 0));
  return ['air', 'cave_air', 'void_air'].includes(below1?.name) && ['air', 'cave_air', 'void_air'].includes(below2?.name);
}

export function hasHostileNearby(bot, radius = 12) {
  if (!bot.entity) return false;
  return Object.values(bot.entities || {}).some((entity) => {
    if (entity === bot.entity || entity.type !== 'mob' || !entity.position) return false;
    return hostileNames.has(entityName(entity)) && bot.entity.position.distanceTo(entity.position) <= radius;
  });
}

export function hasEnoughFoodHealthTools(bot, options = {}) {
  const config = options.config || {};
  const health = bot.health ?? 20;
  const food = bot.food ?? 20;
  const surface = options.surfaceOnly === true || options.skipTorchRequirement === true;
  const minHealth = surface
    ? Math.min(Number(config.minHealthForMining || 14), 10)
    : (config.minHealthForMining || 14);
  const minFood = surface
    ? Math.min(Number(config.minFoodForMining || 14), 10)
    : (config.minFoodForMining || 14);
  if (health < minHealth) return { ok: false, reason: `health is too low for mining (${health}/20)` };
  if (food < minFood) return { ok: false, reason: `food is too low for mining (${food}/20)` };
  // Surface coal / early digs can skip torches so fuel is not a chicken-egg deadlock.
  const skipTorches = options.skipTorchRequirement === true
    || options.surfaceOnly === true
    || config.allowMiningWithoutTorches === true
    || config.minTorchCountForMining === 0;
  if (!skipTorches && (inventory.countItem(bot, 'torch') || 0) < (config.minTorchCountForMining || 4)) {
    return { ok: false, reason: `I need at least ${config.minTorchCountForMining || 4} torches for mining (or make charcoal first).` };
  }
  const minPickRank = Number(options.minPickaxeRank || options.minRank || 1);
  if (!miningTools.hasUsablePickaxe(bot, {
    minRank: minPickRank,
    minDurability: config.returnHomeWhenToolDurabilityBelow || 8
  })) {
    return {
      ok: false,
      reason: minPickRank >= 2
        ? 'I need a stone pickaxe (or better) before mining that ore.'
        : 'I need a usable pickaxe before mining.'
    };
  }
  const free = inventory.countFreeInventorySlots(bot);
  if (free < (config.returnHomeWhenInventorySlotsBelow || 3)) return { ok: false, reason: `inventory is too full (${free} free slots)` };
  return { ok: true, reason: 'ready for mining' };
}

export function shouldAbortMining(bot, memory, options = {}) {
  const config = options.config || {};
  const reasons = [];
  if (options.isCancelled?.()) reasons.push('cancelled');
  if ((bot.health ?? 20) < (config.minHealthForMining || 14)) reasons.push('low health');
  if ((bot.food ?? 20) < Math.min(config.minFoodForMining || 14, 10)) reasons.push('low food');
  if (hasHostileNearby(bot, 12) && !config.allowCombat) reasons.push('hostile nearby');
  if (bot.entity?.position && hasLavaNearby(bot, bot.entity.position, 3)) reasons.push('lava nearby');
  if (bot.entity?.position && hasFireNearby(bot, bot.entity.position, 3)) reasons.push('fire nearby');
  if (inventory.countFreeInventorySlots(bot) < (config.returnHomeWhenInventorySlotsBelow || 5)) reasons.push('inventory nearly full');
  const pickaxe = miningTools.getBestPickaxe(bot);
  const durability = miningTools.getToolDurabilityStatus(bot, pickaxe);
  if (typeof durability.durabilityLeft === 'number' && durability.durabilityLeft < (config.returnHomeWhenToolDurabilityBelow || 20)) {
    reasons.push('pickaxe durability low');
  }
  if ((memory.get?.().stuckCounter || 0) >= 4) reasons.push('stuck');
  return { abort: reasons.length > 0, reasons };
}

export function validateMiningArea(bot, area = {}) {
  const center = area.center || bot.entity?.position;
  if (!center) return { ok: false, reason: 'no mining area center' };
  if (hasLavaNearby(bot, center, area.radius || 4)) return { ok: false, reason: 'lava nearby' };
  if (hasFireNearby(bot, center, area.radius || 4)) return { ok: false, reason: 'fire nearby' };
  if (hasHostileNearby(bot, area.hostileRadius || 12)) return { ok: false, reason: 'hostile nearby' };
  return { ok: true, reason: 'safe area' };
}

export function isSafeToMineBlock(bot, block, ownerPosition = null, options = {}) {
  if (!block || !bot.entity) return { ok: false, reason: 'no block' };
  if (!block.diggable) return { ok: false, reason: `${block.name} is not diggable` };
  if (isProtectedBlockName(block.name)) return { ok: false, reason: `protected block: ${block.name}` };
  if (isDangerousBlock(bot, block)) return { ok: false, reason: `dangerous block: ${block.name}` };
  const botFeet = bot.entity.position.floored();
  if (sameBlock(block.position, botFeet.offset(0, -1, 0))) return { ok: false, reason: 'would dig under self' };
  if (ownerPosition && sameBlock(block.position, { x: ownerPosition.x, y: ownerPosition.y - 1, z: ownerPosition.z })) {
    return { ok: false, reason: 'would dig under owner' };
  }
  if (!options.allowLava && hasLavaNearby(bot, block.position, 2)) return { ok: false, reason: 'lava too close' };
  if (!options.allowWater && hasWaterHazardNearby(bot, block.position, 1)) return { ok: false, reason: 'water hazard nearby' };
  if (['sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel'].includes(block.name)) {
    const above = bot.blockAt(block.position.offset(0, 1, 0));
    if (above && above.boundingBox === 'block' && !options.allowFallingBlocks) return { ok: false, reason: 'falling block risk' };
  }
  const belowDest = block.position.offset(0, -1, 0);
  if (hasFallRisk(bot, belowDest)) return { ok: false, reason: 'fall risk beyond block' };
  return { ok: true, reason: 'safe to mine' };
}

export async function safeDigBlock(bot, block, options = {}) {
  if (options.throwIfCancelled) options.throwIfCancelled();
  const safe = isSafeToMineBlock(bot, block, options.ownerPosition, options);
  if (!safe.ok) return { ok: false, message: safe.reason, reason: safe.reason };
  const tool = await miningTools.equipBestMiningTool(bot, block, { minDurability: options.minDurability || 3 });
  if (!tool.ok) return tool;
  if (options.throwIfCancelled) options.throwIfCancelled();
  console.log(`[mining] digging ${block.name} at ${block.position.x},${block.position.y},${block.position.z}`);
  await bot.dig(block);
  return { ok: true, message: `Mined ${block.name}.`, blockName: block.name, position: new Vec3(block.position.x, block.position.y, block.position.z) };
}

export { protectedBlockNames, dangerousBlockNames };
