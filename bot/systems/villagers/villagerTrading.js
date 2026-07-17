import { loadConfig } from '../../config.js';
import * as villagerMemory from './villagerMemory.js';
import * as villagerScanner from './villagerScanner.js';
import * as tradeSafety from './tradeSafety.js';
import { rankTrades, classifyTrade, getTradeCost, getTradeOutput, isValuableTrade, scoreTrade } from './tradeScoring.js';
import { willViolateEmeraldReserve } from './economyManager.js';

const config = loadConfig();

function timeoutPromise(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

function throwIfCancelled(bot) {
  bot?.mcaiCancellation?.throwIfCancelled?.();
}

function isCancelled(bot) {
  return Boolean(bot?.mcaiCancellation?.isCancelled?.());
}

function itemLabel(item) {
  if (!item) return 'unknown';
  const name = item.displayName || item.name || item.type || 'unknown';
  const count = Number(item.count ?? item.amount ?? 1);
  return `${count} ${String(name).toLowerCase().replace(/^minecraft:/, '')}`;
}

function safeClose(window) {
  try {
    if (window?.close) window.close();
  } catch {
    // Ignore close failures; the server will clean up stale windows.
  }
}

export function tradingStatus(bot, memory = null) {
  const apiAvailable = typeof bot?.openVillager === 'function' && typeof bot?.trade === 'function';
  const nearby = villagerScanner.scanNearbyVillagers(bot, memory);
  const summary = villagerMemory.summarizeVillagerMemory();
  return {
    ok: true,
    message: apiAvailable
      ? `Trading API ready. Nearby villagers: ${nearby.count}. Known trades: ${summary.trades}.`
      : `Villager trading API is unavailable. Scanning still works. Nearby villagers: ${nearby.count}.`,
    evidence: ['trade_options_reported'],
    data: {
      apiAvailable,
      nearbyVillagers: nearby.count,
      memory: summary
    }
  };
}

export function canOpenVillagerTrade(bot, villagerEntity) {
  if (typeof bot?.openVillager !== 'function') return { ok: false, reason: 'Mineflayer openVillager API is unavailable.' };
  if (!villagerEntity) return { ok: false, reason: 'No villager selected.' };
  const distance = bot?.entity?.position && villagerEntity.position ? bot.entity.position.distanceTo(villagerEntity.position) : Infinity;
  if (distance > Number(config.villagerScanRadius || 32)) return { ok: false, reason: 'Villager is too far away.' };
  return { ok: true };
}

export async function openVillagerTrades(bot, villagerEntity) {
  const openCheck = canOpenVillagerTrade(bot, villagerEntity);
  if (!openCheck.ok) throw new Error(openCheck.reason);
  throwIfCancelled(bot);
  return Promise.race([
    bot.openVillager(villagerEntity),
    timeoutPromise(Number(config.tradeSessionTimeoutMs || 120000), 'Timed out opening villager trade window.')
  ]);
}

export function normalizeTrade(trade, villagerEntity = null, index = 0) {
  const cost = getTradeCost(trade);
  const output = getTradeOutput(trade);
  const normalized = {
    id: trade.id || `trade_${villagerEntity?.id ?? 'nearby'}_${index}`,
    tradeIndex: trade.tradeIndex ?? trade.index ?? index,
    villagerEntityId: villagerEntity?.id ?? null,
    profession: villagerScanner.getVillagerProfession(villagerEntity) || 'unknown',
    wanted: cost.map((item) => item.name),
    offered: output.name,
    inputs: cost,
    outputs: [output],
    priceSummary: cost.map((item) => `${item.count} ${item.name}`).join(' + ') || 'unknown cost',
    outputSummary: `${output.count || 1} ${output.name}`,
    disabled: Boolean(trade.tradeDisabled || trade.disabled),
    category: classifyTrade(trade),
    score: scoreTrade(trade),
    valuable: isValuableTrade(trade),
    rawTrade: {
      realPrice: trade.realPrice ?? null,
      nbTradeUses: trade.nbTradeUses ?? null,
      maximumNbTradeUses: trade.maximumNbTradeUses ?? null
    }
  };
  return normalized;
}

export async function inspectVillagerTrades(bot, villagerEntity) {
  const context = { sender: config.ownerUsername };
  const safety = tradeSafety.canInspectVillager(bot, villagerEntity, context);
  if (!safety.ok) {
    return { ok: false, reason: safety.blockers.join('; '), evidence: ['trade_options_reported'], data: { blockers: safety.blockers } };
  }

  let window = null;
  try {
    window = await openVillagerTrades(bot, villagerEntity);
    throwIfCancelled(bot);
    const trades = rankTrades((window.trades || []).map((trade, index) => normalizeTrade(trade, villagerEntity, index)));
    const rememberedVillager = villagerMemory.rememberVillager({
      ...villagerScanner.classifyVillagerEntity(villagerEntity),
      dimension: bot?.game?.dimension || 'overworld'
    });
    const rememberedTrades = trades.map((trade) => villagerMemory.rememberTrade({
      ...trade,
      villagerId: rememberedVillager.id,
      profession: rememberedVillager.profession,
      lastSeenAt: Date.now()
    }));
    return {
      ok: true,
      message: trades.length ? `Inspected ${trades.length} trades. Best: ${trades[0].outputSummary} for ${trades[0].priceSummary}.` : 'Villager has no visible trades.',
      evidence: ['villager_trade_inspected', 'trade_options_reported', 'villager_memory_updated'],
      data: {
        villager: rememberedVillager,
        trades: rememberedTrades
      }
    };
  } catch (error) {
    return { ok: false, reason: error.message, evidence: ['trade_options_reported'], data: {} };
  } finally {
    safeClose(window);
  }
}

export async function listTradesForVillager(bot, villagerEntity) {
  return inspectVillagerTrades(bot, villagerEntity);
}

export function scoreVillagerTrades(bot, trades, context = {}) {
  return rankTrades(trades, context);
}

export function chooseBestTrade(bot, trades, context = {}) {
  return scoreVillagerTrades(bot, trades, context)[0] || null;
}

export async function tradeWithVillager(bot, villagerEntity, tradeIndex, times = 1, options = {}) {
  let window = null;
  try {
    throwIfCancelled(bot);
    window = await openVillagerTrades(bot, villagerEntity);
    const trade = window.trades?.[Number(tradeIndex)];
    if (!trade) return { ok: false, reason: `Trade ${Number(tradeIndex) + 1} was not found.`, evidence: ['trade_options_reported'] };
    const normalized = normalizeTrade(trade, villagerEntity, Number(tradeIndex));
    const context = {
      sender: options.sender || config.ownerUsername,
      confirmed: Boolean(options.confirmed),
      approved: Boolean(options.approved),
      confirmBookBuying: Boolean(options.confirmBookBuying || options.confirmed),
      confirmGearBuying: Boolean(options.confirmGearBuying || options.confirmed),
      confirmRareInput: Boolean(options.confirmRareInput || options.confirmed),
      confirmSpendEmeralds: Boolean(options.confirmSpendEmeralds || options.confirmed)
    };
    const safety = tradeSafety.canTradeWithVillager(bot, villagerEntity, normalized, times, context);
    if (!safety.ok) return { ok: false, reason: safety.blockers.join('; '), evidence: ['trade_options_reported'], data: { blockers: safety.blockers, trade: normalized } };
    throwIfCancelled(bot);
    await Promise.race([
      bot.trade(window, Number(tradeIndex), Number(times || 1)),
      timeoutPromise(Number(config.tradeSessionTimeoutMs || 120000), 'Timed out while trading.')
    ]);
    const reserve = willViolateEmeraldReserve(bot, normalized, times);
    const result = {
      ok: true,
      message: `Trade complete: ${normalized.outputSummary}.`,
      tradeId: normalized.id,
      villagerId: String(villagerEntity?.id ?? ''),
      wanted: normalized.wanted,
      offered: normalized.offered,
      emeraldsSpent: reserve.emeraldCost,
      emeraldsEarned: reserve.emeraldEarned,
      evidence: ['trade_completed', reserve.emeraldCost > 0 ? 'emeralds_spent' : 'emeralds_earned'].filter(Boolean),
      data: { trade: normalized, times: Number(times || 1) }
    };
    villagerMemory.recordTradeResult(result);
    return result;
  } catch (error) {
    const result = { ok: false, reason: isCancelled(bot) ? 'cancelled' : error.message, evidence: ['trade_options_reported'], data: {} };
    villagerMemory.recordTradeResult(result);
    return result;
  } finally {
    safeClose(window);
  }
}

export async function executeApprovedTrade(bot, memory, tradeRequest = {}) {
  const requestCheck = tradeSafety.validateTradeRequest(bot, memory, tradeRequest);
  if (!requestCheck.ok) return { ok: false, reason: requestCheck.blockers.join('; '), evidence: ['trade_options_reported'] };
  const villager = tradeRequest.villagerEntity || villagerScanner.findNearestVillager(bot, { profession: tradeRequest.profession });
  if (!villager) return { ok: false, reason: 'No nearby villager is available for the requested trade.', evidence: ['trade_options_reported'] };
  return tradeWithVillager(bot, villager, Number(tradeRequest.tradeIndex || 0), Number(tradeRequest.times || 1), {
    ...tradeRequest,
    confirmed: true,
    approved: true
  });
}

export function closeVillagerTradeWindow(villagerWindow) {
  safeClose(villagerWindow);
}

export function explainTradeOptions(bot, trades) {
  const ranked = rankTrades(trades || []);
  if (!ranked.length) return 'No villager trades are known yet.';
  return ranked.slice(0, 3).map((trade, index) => `${index + 1}. ${trade.outputSummary || trade.offered} for ${trade.priceSummary} (${trade.score})`).join('; ');
}

export function reportTradeResult(bot, result) {
  if (!result?.ok) return result?.reason || 'Trade failed.';
  return result.message || 'Trade completed.';
}

export default {
  tradingStatus,
  canOpenVillagerTrade,
  openVillagerTrades,
  inspectVillagerTrades,
  normalizeTrade,
  listTradesForVillager,
  scoreVillagerTrades,
  chooseBestTrade,
  tradeWithVillager,
  executeApprovedTrade,
  closeVillagerTradeWindow,
  explainTradeOptions,
  reportTradeResult
};
