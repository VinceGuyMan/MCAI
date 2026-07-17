import { loadConfig } from '../../config.js';
import * as inventory from '../../inventory.js';
import { getTradeCost, getTradeOutput } from './tradeScoring.js';
import { willViolateEmeraldReserve, canAffordTrade } from './economyManager.js';

const config = loadConfig();

const RARE_INPUTS = ['diamond', 'netherite', 'ancient_debris', 'enchanted_book', 'elytra', 'totem'];
const HOSTILE_NAMES = new Set([
  'zombie',
  'skeleton',
  'creeper',
  'spider',
  'enderman',
  'witch',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'drowned',
  'husk',
  'stray'
]);

function isOwner(context = {}) {
  const sender = String(context.sender || context.username || '');
  return sender.toLowerCase() === String(config.ownerUsername || 'ModVinny').toLowerCase();
}

function distanceFromBot(bot, entity) {
  if (!bot?.entity?.position || !entity?.position) return Infinity;
  return bot.entity.position.distanceTo(entity.position);
}

function ownerDistance(bot) {
  const owner = bot?.players?.[config.ownerUsername]?.entity;
  return owner ? distanceFromBot(bot, owner) : Infinity;
}

function hostileNearby(bot, radius = 16) {
  if (!bot?.entities || !bot?.entity?.position) return false;
  return Object.values(bot.entities).some((entity) =>
    HOSTILE_NAMES.has(String(entity.name || '').toLowerCase()) &&
    entity.position &&
    bot.entity.position.distanceTo(entity.position) <= radius
  );
}

function angryOrUnsafeGolemNearby(bot, radius = 12) {
  if (!bot?.entities || !bot?.entity?.position) return false;
  return Object.values(bot.entities).some((entity) =>
    String(entity.name || '').toLowerCase() === 'iron_golem' &&
    entity.position &&
    bot.entity.position.distanceTo(entity.position) <= radius &&
    (entity.target || entity.isValid === false)
  );
}

function isBotCancelled(bot) {
  return Boolean(bot?.mcaiCancellation?.isCancelled?.());
}

export function validateOwnerApproval(context = {}) {
  const blockers = [];
  if (!isOwner(context)) blockers.push('only ModVinny can approve villager trades');
  if (!context.confirmed && !context.approved) blockers.push('trade execution requires confirmation');
  return { ok: blockers.length === 0, blockers };
}

export function validateVillagerSafety(bot, villager) {
  const blockers = [];
  if (!villager) blockers.push('no villager selected');
  if (villager && distanceFromBot(bot, villager) > Number(config.villagerScanRadius || 32)) blockers.push('villager is too far away');
  if (hostileNearby(bot)) blockers.push('hostiles are nearby');
  if (config.avoidIronGolems !== false && angryOrUnsafeGolemNearby(bot)) blockers.push('iron golem safety is uncertain');
  return { ok: blockers.length === 0, blockers };
}

export function validateTradeCost(bot, trade, times = 1, context = {}) {
  const blockers = [];
  const affordability = canAffordTrade(bot, trade, times);
  if (!affordability.ok) {
    blockers.push(`missing trade inputs: ${affordability.missing.map((m) => `${m.needed - m.available} ${m.name}`).join(', ')}`);
  }
  const reserve = willViolateEmeraldReserve(bot, trade, times);
  if (reserve.violates && !context.confirmSpendEmeralds) {
    blockers.push(`would spend below emerald reserve (${reserve.reserve})`);
  }
  const rare = getTradeCost(trade).filter((item) => RARE_INPUTS.some((term) => item.name.includes(term)));
  if (rare.length && !context.confirmRareInput) blockers.push('rare trade input requires confirmation');
  return { ok: blockers.length === 0, blockers, affordability, reserve };
}

export function validateTradeOutput(bot, trade, context = {}) {
  const blockers = [];
  const output = getTradeOutput(trade);
  if (!output || output.name === 'unknown') blockers.push('trade output is unknown');
  if (output.name.includes('enchanted_book') && !context.confirmBookBuying) blockers.push('buying enchanted books requires confirmation');
  if (/(sword|pickaxe|axe|shovel|helmet|chestplate|leggings|boots|bow|crossbow)/.test(output.name) && !context.confirmGearBuying) {
    blockers.push('buying gear requires confirmation');
  }
  return { ok: blockers.length === 0, blockers };
}

export function canInspectVillager(bot, villager, context = {}) {
  const blockers = [];
  if (!isOwner(context)) blockers.push('only ModVinny can request villager trade inspection');
  if (!bot?.openVillager) blockers.push('Mineflayer villager API is unavailable');
  const safety = validateVillagerSafety(bot, villager);
  blockers.push(...safety.blockers);
  if (isBotCancelled(bot)) blockers.push('task is cancelled');
  return { ok: blockers.length === 0, blockers };
}

export function canTradeWithVillager(bot, villager, trade, times = 1, context = {}) {
  const blockers = [];
  if (!bot?.openVillager || !bot?.trade) blockers.push('Mineflayer villager trading API is unavailable');
  const owner = validateOwnerApproval(context);
  const safety = validateVillagerSafety(bot, villager);
  const cost = validateTradeCost(bot, trade, times, context);
  const output = validateTradeOutput(bot, trade, context);
  blockers.push(...owner.blockers, ...safety.blockers, ...cost.blockers, ...output.blockers);
  if (ownerDistance(bot) > Number(config.maxTradeDistanceFromOwner || 64)) blockers.push('owner is too far away for trading');
  if (Number(times || 1) > Number(config.maxTradesPerSession || 5)) blockers.push('too many trades requested for one session');
  if (isBotCancelled(bot)) blockers.push('task is cancelled');
  return { ok: blockers.length === 0, blockers, cost, output };
}

export function validateTradeRequest(bot, memory, request = {}) {
  const blockers = [];
  if (request.tradeIndex == null && !request.tradeId && !request.offered) blockers.push('no trade selected');
  if (Number(request.times || 1) < 1) blockers.push('trade count must be at least 1');
  if (Number(request.times || 1) > Number(config.maxTradesPerSession || 5)) blockers.push('trade count exceeds session limit');
  return { ok: blockers.length === 0, blockers };
}

export function explainTradeBlockers(bot, memory, request = {}) {
  const validation = validateTradeRequest(bot, memory, request);
  return validation.blockers.length ? validation.blockers.join('; ') : 'No trade blockers detected yet.';
}

export default {
  canInspectVillager,
  canTradeWithVillager,
  validateTradeRequest,
  validateTradeCost,
  validateTradeOutput,
  validateOwnerApproval,
  validateVillagerSafety,
  explainTradeBlockers
};
