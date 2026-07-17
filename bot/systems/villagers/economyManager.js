import { loadConfig } from '../../config.js';
import * as inventory from '../../inventory.js';
import * as villagerMemory from './villagerMemory.js';
import { getTradeCost, getTradeOutput, rankTrades, isEmeraldEarningTrade } from './tradeScoring.js';

const config = loadConfig();

function countItem(bot, name) {
  return inventory.countItem(bot, name);
}

export function getEmeraldCount(bot) {
  return inventory.getEmeraldCount ? inventory.getEmeraldCount(bot) : countItem(bot, 'emerald');
}

export function getTradeBudget(bot, context = {}) {
  const emeralds = getEmeraldCount(bot);
  const reserve = Number(context.minEmeraldReserve ?? config.minEmeraldReserve ?? 4);
  return {
    emeralds,
    reserve,
    spendableEmeralds: Math.max(0, emeralds - reserve)
  };
}

function requiredItemCounts(trade, times = 1) {
  const counts = {};
  for (const item of getTradeCost(trade)) {
    counts[item.name] = (counts[item.name] || 0) + Number(item.count || 1) * Number(times || 1);
  }
  return counts;
}

export function canAffordTrade(bot, trade, times = 1) {
  const missing = [];
  const required = requiredItemCounts(trade, times);
  for (const [name, needed] of Object.entries(required)) {
    const available = countItem(bot, name);
    if (available < needed) missing.push({ name, needed, available });
  }
  return {
    ok: missing.length === 0,
    missing,
    required
  };
}

export function willViolateEmeraldReserve(bot, trade, times = 1) {
  const cost = getTradeCost(trade);
  const emeraldCost = cost.filter((item) => item.name.includes('emerald')).reduce((sum, item) => sum + item.count, 0) * Number(times || 1);
  const output = getTradeOutput(trade);
  const emeraldEarned = output.name.includes('emerald') ? Number(output.count || 1) * Number(times || 1) : 0;
  const budget = getTradeBudget(bot);
  return {
    violates: emeraldCost > 0 && budget.emeralds - emeraldCost < budget.reserve,
    emeraldCost,
    emeraldEarned,
    emeraldsAfter: budget.emeralds - emeraldCost + emeraldEarned,
    reserve: budget.reserve
  };
}

export function suggestEmeraldEarningTrades(bot, memory = null) {
  const trades = villagerMemory.listKnownTrades().filter(isEmeraldEarningTrade);
  const ranked = rankTrades(trades, { preferEmeralds: true, emeraldBudget: getTradeBudget(bot).spendableEmeralds });
  return ranked.slice(0, 5);
}

export function suggestUsefulSpending(bot, memory = null) {
  const budget = getTradeBudget(bot);
  const trades = villagerMemory.findBestKnownTrades({ limit: 20 })
    .filter((trade) => !willViolateEmeraldReserve(bot, trade).violates)
    .filter((trade) => !trade.category?.includes('decorative'));
  return rankTrades(trades, { emeraldBudget: budget.spendableEmeralds, preferBooks: true }).slice(0, 5);
}

export function recordEmeraldSpend(amount, reason = '') {
  const result = villagerMemory.recordTradeResult({
    ok: true,
    emeraldsSpent: Number(amount || 0),
    reason: reason || 'emerald spend recorded',
    evidence: ['emeralds_spent']
  });
  return result;
}

export function recordEmeraldEarn(amount, reason = '') {
  const result = villagerMemory.recordTradeResult({
    ok: true,
    emeraldsEarned: Number(amount || 0),
    reason: reason || 'emerald earn recorded',
    evidence: ['emeralds_earned']
  });
  return result;
}

export function economySummary(bot, memory = null) {
  const budget = getTradeBudget(bot);
  const stats = villagerMemory.getEconomyStats();
  const knownTrades = villagerMemory.listKnownTrades();
  return {
    emeralds: budget.emeralds,
    emeraldReserve: budget.reserve,
    spendableEmeralds: budget.spendableEmeralds,
    knownTrades: knownTrades.length,
    valuableTrades: knownTrades.filter((trade) => trade.valuable).length,
    emeraldEarningTrades: knownTrades.filter(isEmeraldEarningTrade).length,
    economyStats: stats
  };
}

export function economyStatus(bot, memory = null) {
  const summary = economySummary(bot, memory);
  return {
    ok: true,
    message: `Emeralds: ${summary.emeralds} (${summary.spendableEmeralds} spendable). Known trades: ${summary.knownTrades}, valuable: ${summary.valuableTrades}.`,
    evidence: ['emerald_count_reported'],
    data: summary
  };
}

export default {
  economyStatus,
  getEmeraldCount,
  getTradeBudget,
  canAffordTrade,
  willViolateEmeraldReserve,
  suggestEmeraldEarningTrades,
  suggestUsefulSpending,
  recordEmeraldSpend,
  recordEmeraldEarn,
  economySummary
};
