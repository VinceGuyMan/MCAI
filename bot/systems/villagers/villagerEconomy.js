import * as villagerMemory from './villagerMemory.js';
import * as villagerScanner from './villagerScanner.js';
import * as villagerTrading from './villagerTrading.js';
import * as economyManager from './economyManager.js';
import * as villageProtection from './villageProtection.js';
import { rankTrades } from './tradeScoring.js';

export function villagerStatus(bot, memory = null) {
  const nearby = villagerScanner.reportNearbyVillagers(bot, memory);
  const remembered = villagerMemory.summarizeVillagerMemory();
  return {
    ok: true,
    message: `${nearby.message} Known villages: ${remembered.villages}; known villagers: ${remembered.villagers}.`,
    evidence: ['villager_seen'],
    data: { nearby: nearby.data, remembered }
  };
}

export function villageStatus(bot, memory = null) {
  const village = villagerScanner.detectVillageLikeArea(bot);
  const known = villagerMemory.listKnownVillages();
  return {
    ok: true,
    message: village.confidence === 'none'
      ? `No village confirmed nearby. Known villages: ${known.length}.`
      : `${village.confidence === 'confirmed' ? 'Village' : 'Possible village'} detected nearby. Known villages: ${known.length}.`,
    evidence: village.confidence === 'none' ? ['villager_seen'] : ['village_found'],
    data: { nearby: village, known }
  };
}

export function scanVillagers(bot, memory = null) {
  const remembered = villagerScanner.rememberNearbyVillagers(bot, memory);
  if (!remembered.villagers.length) {
    return { ok: true, message: 'No nearby villagers to remember.', evidence: ['villager_seen'], data: remembered };
  }
  const summary = remembered.villagers.slice(0, 5).map((v) => v.profession).join(', ');
  return {
    ok: true,
    message: `Remembered ${remembered.villagers.length} villager(s): ${summary}.`,
    evidence: ['villager_seen', 'villager_profession_recorded', 'villager_memory_updated'],
    data: remembered
  };
}

export function rememberVillage(bot, memory = null) {
  const detected = villagerScanner.detectVillageLikeArea(bot);
  if (detected.confidence === 'none') {
    return { ok: false, reason: 'I do not see enough village evidence here yet.', evidence: ['villager_seen'], data: detected };
  }
  const village = villagerMemory.rememberVillage({
    name: detected.confidence === 'confirmed' ? 'Village near tj' : 'Possible village near tj',
    dimension: detected.dimension,
    center: detected.center,
    tags: [detected.confidence === 'confirmed' ? 'safe' : 'possible']
  });
  return {
    ok: true,
    message: `Remembered ${detected.confidence === 'confirmed' ? 'village' : 'possible village'} at ${village.center.x}, ${village.center.y}, ${village.center.z}.`,
    evidence: ['village_found', 'village_waypoint_created'],
    data: { village }
  };
}

export function rememberVillager(bot, memory = null) {
  const scan = scanVillagers(bot, memory);
  return scan;
}

export function tradingStatus(bot, memory = null) {
  return villagerTrading.tradingStatus(bot, memory);
}

export async function inspectVillagerTrades(bot, memory = null, filters = {}) {
  const villager = villagerScanner.findNearestVillager(bot, filters);
  if (!villager) return { ok: false, reason: 'No nearby villager is close enough to inspect.', evidence: ['trade_options_reported'] };
  return villagerTrading.inspectVillagerTrades(bot, villager);
}

export function listKnownTrades(bot = null, memory = null, filters = {}) {
  const trades = villagerMemory.listKnownTrades(filters);
  return {
    ok: true,
    message: trades.length ? `Known trades: ${trades.slice(0, 3).map((t) => `${t.offered} for ${t.priceSummary}`).join('; ')}.` : 'No known villager trades yet.',
    evidence: ['trade_options_reported'],
    data: { trades }
  };
}

export function bestKnownTrades(bot = null, memory = null, filters = {}) {
  const budget = bot ? economyManager.getTradeBudget(bot) : { spendableEmeralds: 0 };
  const trades = rankTrades(villagerMemory.findBestKnownTrades({ limit: filters.limit || 10 }), {
    emeraldBudget: budget.spendableEmeralds,
    preferBooks: true
  });
  return {
    ok: true,
    message: trades.length ? `Best known trades: ${trades.slice(0, 3).map((t) => `${t.offered} (${t.score})`).join(', ')}.` : 'No known trades to rank yet.',
    evidence: trades.length ? ['valuable_trade_found'] : ['trade_options_reported'],
    data: { trades }
  };
}

export function economyStatus(bot, memory = null) {
  return economyManager.economyStatus(bot, memory);
}

export function suggestTrades(bot, memory = null, filters = {}) {
  const earning = economyManager.suggestEmeraldEarningTrades(bot, memory);
  const spending = economyManager.suggestUsefulSpending(bot, memory);
  const suggestions = [...spending, ...earning].slice(0, 5);
  return {
    ok: true,
    message: suggestions.length ? `Suggested trades: ${suggestions.slice(0, 3).map((t) => `${t.offered} (${t.score})`).join(', ')}.` : 'I do not know any useful trades yet.',
    evidence: suggestions.length ? ['valuable_trade_found'] : ['trade_options_reported'],
    data: { suggestions, earning, spending }
  };
}

export async function executeApprovedTrade(bot, memory = null, request = {}) {
  return villagerTrading.executeApprovedTrade(bot, memory, request);
}

export function tradeHistory(bot = null, memory = null) {
  const history = villagerMemory.loadVillagerMemory().tradeHistory.slice(-10).reverse();
  return {
    ok: true,
    message: history.length ? `Recent trades: ${history.slice(0, 3).map((h) => h.offered || h.reason || 'trade').join(', ')}.` : 'No trade history yet.',
    evidence: ['trade_options_reported'],
    data: { history }
  };
}

export function valuableVillagers(bot = null, memory = null) {
  const villagers = villagerMemory.listKnownVillagers({ valuable: true });
  return {
    ok: true,
    message: villagers.length ? `Valuable villagers: ${villagers.slice(0, 5).map((v) => `${v.profession} ${v.notes ? `(${v.notes})` : ''}`).join(', ')}.` : 'No valuable villagers marked yet.',
    evidence: ['villager_memory_updated'],
    data: { villagers }
  };
}

export function markVillagerValuable(bot, memory = null, idOrReason = '') {
  const known = villagerMemory.listKnownVillagers();
  const target = known.find((v) => v.id === idOrReason || String(v.entityId) === String(idOrReason)) || known[known.length - 1];
  if (!target) return { ok: false, reason: 'No known villager to mark valuable.', evidence: [] };
  const villager = villagerMemory.markVillagerValuable(target.id, idOrReason && target.id !== idOrReason ? idOrReason : 'Marked valuable by ModVinny.');
  return {
    ok: true,
    message: `Marked ${villager.profession} villager as valuable.`,
    evidence: ['villager_memory_updated'],
    data: { villager }
  };
}

export function protectVillagerStatus(bot, memory = null) {
  return villageProtection.villageProtectionStatus(bot, memory);
}

export function villageProtectionStatus(bot, memory = null) {
  return villageProtection.villageProtectionStatus(bot, memory);
}

export default {
  villagerStatus,
  villageStatus,
  scanVillagers,
  rememberVillage,
  rememberVillager,
  tradingStatus,
  inspectVillagerTrades,
  listKnownTrades,
  bestKnownTrades,
  economyStatus,
  suggestTrades,
  executeApprovedTrade,
  tradeHistory,
  valuableVillagers,
  markVillagerValuable,
  protectVillagerStatus,
  villageProtectionStatus
};
