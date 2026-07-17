/**
 * Villager economy / trading handlers.
 */
export function createVillagerHandlers(ctx) {
  const {
    bot, config, memory, say, villagerEconomy, villagerMemory
  } = ctx;

  function pendingTradeConfirmation(args = {}, message = null) {
    memory.update({
      pendingTradeConfirmation: {
        args,
        requestedAt: Date.now(),
        expiresAt: Date.now() + 60000
      }
    });
    const text = message || 'That trade needs confirmation before I spend anything.';
    say(text, true);
    return {
      ok: false,
      message: text,
      reason: 'confirmation required',
      requiresConfirmation: true,
      evidence: ['trade_options_reported']
    };
  }

  async function sayVillagerResult(result, fallback = 'Villager economy action finished.') {
    const message = result?.message || result?.reason || fallback;
    say(message, true);
    return result;
  }

  async function villagerStatusAction() {
    return sayVillagerResult(villagerEconomy.villagerStatus(bot, memory));
  }

  async function scanVillagersAction() {
    return sayVillagerResult(villagerEconomy.scanVillagers(bot, memory));
  }

  async function villageStatusAction() {
    return sayVillagerResult(villagerEconomy.villageStatus(bot, memory));
  }

  async function knownVillagesAction() {
    const villages = villagerMemory.listKnownVillages();
    const message = villages.length
      ? `Known villages: ${villages.slice(0, 5).map((v) => `${v.name} at ${v.center.x},${v.center.z}`).join('; ')}.`
      : 'No villages remembered yet.';
    say(message, true);
    return { ok: true, message, evidence: ['village_found'], data: { villages } };
  }

  async function knownVillagersAction(filters = {}) {
    const villagers = villagerMemory.listKnownVillagers(filters);
    const message = villagers.length
      ? `Known villagers: ${villagers.slice(0, 5).map((v) => `${v.profession} at ${v.lastKnownPosition.x},${v.lastKnownPosition.z}`).join('; ')}.`
      : 'No villagers remembered yet.';
    say(message, true);
    return { ok: true, message, evidence: ['villager_seen'], data: { villagers } };
  }

  async function rememberVillageAction() {
    return sayVillagerResult(villagerEconomy.rememberVillage(bot, memory));
  }

  async function rememberVillagerAction() {
    return sayVillagerResult(villagerEconomy.rememberVillager(bot, memory));
  }

  async function tradingStatusAction() {
    return sayVillagerResult(villagerEconomy.tradingStatus(bot, memory));
  }

  async function inspectVillagerTradesAction(filters = {}) {
    return sayVillagerResult(await villagerEconomy.inspectVillagerTrades(bot, memory, filters));
  }

  async function listKnownTradesAction(filters = {}) {
    return sayVillagerResult(villagerEconomy.listKnownTrades(bot, memory, filters));
  }

  async function bestKnownTradesAction(filters = {}) {
    return sayVillagerResult(villagerEconomy.bestKnownTrades(bot, memory, filters));
  }

  async function economyStatusAction() {
    return sayVillagerResult(villagerEconomy.economyStatus(bot, memory));
  }

  async function suggestTradesAction(filters = {}) {
    return sayVillagerResult(villagerEconomy.suggestTrades(bot, memory, filters));
  }

  async function executeApprovedTradeAction(args = {}, options = {}) {
    const tradeArgs = typeof args === 'object' ? args : { tradeIndex: Number(args) || 0 };
    if (!options.confirmed && !tradeArgs.confirmed) {
      const index = Number(tradeArgs.tradeIndex ?? 0) + 1;
      return pendingTradeConfirmation(tradeArgs, `Trade ${index} needs confirmation. Say "tj confirm trade" if you want me to do it.`);
    }
    const result = await villagerEconomy.executeApprovedTrade(bot, memory, {
      ...tradeArgs,
      confirmed: true,
      approved: true,
      sender: config.ownerUsername,
      confirmBookBuying: true,
      confirmGearBuying: true,
      confirmRareInput: true,
      confirmSpendEmeralds: true
    });
    memory.update({ pendingTradeConfirmation: null });
    return sayVillagerResult(result);
  }

  async function confirmTradeAction(kind = '') {
    const pending = memory.get().pendingTradeConfirmation;
    if (!pending || Date.now() > (pending.expiresAt || 0)) {
      memory.update({ pendingTradeConfirmation: null });
      say('No active trade confirmation.', true);
      return { ok: false, message: 'No active trade confirmation.' };
    }
    return executeApprovedTradeAction(pending.args || {}, { confirmed: true, kind });
  }

  async function tradeHistoryAction() {
    return sayVillagerResult(villagerEconomy.tradeHistory(bot, memory));
  }

  async function valuableVillagersAction() {
    return sayVillagerResult(villagerEconomy.valuableVillagers(bot, memory));
  }

  async function markVillagerValuableAction(idOrReason = '', options = {}) {
    if (!options.confirmed) {
      memory.update({
        pendingVillagerMemoryConfirmation: {
          type: 'mark_villager_valuable',
          args: { idOrReason },
          expiresAt: Date.now() + 60000
        }
      });
      const message = 'Marking a villager valuable needs confirmation. Say "tj confirm mark villager valuable" if that is what you want.';
      say(message, true);
      return { ok: false, message, reason: 'confirmation required', requiresConfirmation: true, evidence: ['villager_memory_updated'] };
    }
    memory.update({ pendingVillagerMemoryConfirmation: null });
    return sayVillagerResult(villagerEconomy.markVillagerValuable(bot, memory, idOrReason));
  }

  async function confirmVillagerMemoryAction() {
    const pending = memory.get().pendingVillagerMemoryConfirmation;
    if (!pending || Date.now() > (pending.expiresAt || 0)) {
      memory.update({ pendingVillagerMemoryConfirmation: null });
      say('No active villager memory confirmation.', true);
      return { ok: false, message: 'No active villager memory confirmation.' };
    }
    if (pending.type === 'mark_villager_valuable') {
      return markVillagerValuableAction(pending.args?.idOrReason || '', { confirmed: true });
    }
    memory.update({ pendingVillagerMemoryConfirmation: null });
    say('That villager confirmation is no longer valid.', true);
    return { ok: false, message: 'That villager confirmation is no longer valid.' };
  }

  async function protectVillagerStatusAction() {
    return sayVillagerResult(villagerEconomy.protectVillagerStatus(bot, memory));
  }

  async function villageProtectionStatusAction() {
    return sayVillagerResult(villagerEconomy.villageProtectionStatus(bot, memory));
  }


  return {
    pendingTradeConfirmation,
    sayVillagerResult,
    villagerStatusAction,
    scanVillagersAction,
    villageStatusAction,
    knownVillagesAction,
    knownVillagersAction,
    rememberVillageAction,
    rememberVillagerAction,
    tradingStatusAction,
    inspectVillagerTradesAction,
    listKnownTradesAction,
    bestKnownTradesAction,
    economyStatusAction,
    suggestTradesAction,
    executeApprovedTradeAction,
    confirmTradeAction,
    tradeHistoryAction,
    valuableVillagersAction,
    markVillagerValuableAction,
    confirmVillagerMemoryAction,
    protectVillagerStatusAction,
    villageProtectionStatusAction
  };
}
