/**
 * Gear upgrades, enchanting, anvil, potions, brewing handlers.
 */
export function createGearHandlers(ctx) {
  const {
    bot, config, memory, say,
    gearUpgradeSystem, enchanting, anvilSystem, potionSystem, brewing, gearMemory
  } = ctx;

  function pendingGearConfirmation(type, args = {}, message = null) {
    memory.update({
      pendingGearUpgradeConfirmation: {
        type,
        args,
        requestedAt: Date.now(),
        expiresAt: Date.now() + 60000
      }
    });
    return {
      ok: false,
      message: message || 'That gear upgrade needs confirmation.',
      reason: message || 'confirmation required',
      requiresConfirmation: true,
      evidence: ['gear_upgrade_status_reported']
    };
  }

  async function sayGearResult(result, fallback = 'Gear action finished.') {
    const message = result?.message || result?.reason || fallback;
    say(message, true);
    return result;
  }

  async function gearStatusAction() {
    const result = gearUpgradeSystem.gearUpgradeStatus(bot, memory);
    return sayGearResult(result);
  }

  async function gearUpgradeStatusAction() {
    const result = gearUpgradeSystem.gearUpgradeStatus(bot, memory);
    return sayGearResult(result);
  }

  async function suggestGearUpgradesAction(context = {}) {
    const result = gearUpgradeSystem.suggestGearUpgrades(bot, memory, context);
    return sayGearResult(result);
  }

  async function suggestNextGearUpgradeAction(context = {}) {
    const result = gearUpgradeSystem.suggestNextGearUpgrade(bot, memory, context);
    return sayGearResult(result);
  }

  async function createGearUpgradePlanAction(target = 'general', options = {}) {
    const targetName = typeof target === 'object' ? target.target || 'general' : target;
    const result = gearUpgradeSystem.createGearUpgradePlan(bot, memory, targetName, options);
    return sayGearResult(result);
  }

  async function enchantStatusAction() {
    const result = enchanting.enchantingStatus(bot, memory);
    return sayGearResult(result);
  }

  async function enchantOptionsAction(options = {}) {
    const result = await enchanting.reportEnchantingOptions(bot, options);
    return sayGearResult(result);
  }

  async function enchantItemAction(itemNameOrArgs = '', options = {}) {
    const args = typeof itemNameOrArgs === 'object' ? itemNameOrArgs : { itemName: itemNameOrArgs };
    const merged = { ...options, ...(args.options || {}), itemName: args.itemName || args.targetItemName };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('enchant_item', merged, 'Enchanting spends XP and lapis. Say "tj confirm enchant" to continue.'));
    }
    const result = await enchanting.enchantItem(bot, merged.itemName, merged);
    gearMemory.recordEnchantingAttempt(result);
    return sayGearResult(result);
  }

  async function enchantHeldItemAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : options;
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('enchant_held_item', merged, 'Enchanting the held item spends XP and lapis. Say "tj confirm enchant" to continue.'));
    }
    const result = await enchanting.enchantHeldItem(bot, merged);
    gearMemory.recordEnchantingAttempt(result);
    return sayGearResult(result);
  }

  async function enchantBestCandidateAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : options;
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('enchant_best_candidate', merged, 'Enchanting the best candidate spends XP and lapis. Say "tj confirm enchant" to continue.'));
    }
    const result = await enchanting.enchantBestCandidate(bot, merged);
    gearMemory.recordEnchantingAttempt(result);
    return sayGearResult(result);
  }

  async function anvilStatusAction() {
    const result = anvilSystem.anvilStatus(bot, memory);
    return sayGearResult(result);
  }

  async function repairItemAction(itemNameOrArgs = '', options = {}) {
    const args = typeof itemNameOrArgs === 'object' ? itemNameOrArgs : { itemName: itemNameOrArgs };
    const merged = { ...options, ...(args.options || {}), itemName: args.itemName || args.targetItemName };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('repair_item', merged, 'Anvil repair spends XP/items. Say "tj confirm repair" or "tj confirm anvil" to continue.'));
    }
    const result = await anvilSystem.repairItem(bot, merged.itemName, merged);
    gearMemory.recordAnvilAttempt(result);
    return sayGearResult(result);
  }

  async function combineItemsAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : { itemOneName: args, ...options };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('combine_items', merged, 'Combining items on an anvil spends XP/items. Say "tj confirm anvil" to continue.'));
    }
    const result = await anvilSystem.combineItems(bot, merged.itemOneName, merged.itemTwoName, merged);
    gearMemory.recordAnvilAttempt(result);
    return sayGearResult(result);
  }

  async function applyBookToItemAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : { itemName: args, ...options };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('apply_book_to_item', merged, 'Using an enchanted book needs confirmation. Say "tj confirm use book" to continue.'));
    }
    const result = await anvilSystem.applyBookToItem(bot, merged.bookSelector || merged.bookName, merged.itemName, merged);
    gearMemory.recordAnvilAttempt(result);
    return sayGearResult(result);
  }

  async function renameItemAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : { itemName: args, ...options };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('rename_item', merged, 'Renaming with an anvil needs confirmation. Say "tj confirm rename" to continue.'));
    }
    const result = await anvilSystem.renameItem(bot, merged.itemName, merged.newName || merged.name, merged);
    gearMemory.recordAnvilAttempt(result);
    return sayGearResult(result);
  }

  async function potionStatusAction() {
    const result = potionSystem.potionStatus(bot, memory);
    return sayGearResult(result);
  }

  async function usePotionAction(potionNameOrArgs = '', options = {}) {
    const args = typeof potionNameOrArgs === 'object' ? potionNameOrArgs : { potionName: potionNameOrArgs };
    const merged = { ...options, ...(args.options || {}), potionName: args.potionName || args.type || args.itemName };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('use_potion', merged, 'Potion use needs confirmation. Say "tj confirm use potion" to continue.'));
    }
    const result = await potionSystem.usePotion(bot, merged.potionName, merged);
    gearMemory.recordPotionUse(result);
    return sayGearResult(result);
  }

  async function carryPotionLoadoutAction(context = {}) {
    const result = potionSystem.carryPotionLoadout(bot, context);
    return sayGearResult(result);
  }

  async function brewingStatusAction() {
    const result = brewing.brewingStatus(bot, memory);
    return sayGearResult(result);
  }

  async function brewPotionAction(potionTypeOrArgs = '', options = {}) {
    const args = typeof potionTypeOrArgs === 'object' ? potionTypeOrArgs : { potionType: potionTypeOrArgs };
    const merged = { ...options, ...(args.options || {}), potionType: args.potionType || args.type };
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('brew_potion', merged, 'Brewing would consume ingredients and needs confirmation. Say "tj confirm brewing" to continue.'));
    }
    const result = await brewing.brewPotion(bot, merged.potionType, merged);
    gearMemory.recordBrewingAttempt(result);
    return sayGearResult(result);
  }

  async function brewFireResistanceAction(args = {}, options = {}) {
    const merged = typeof args === 'object' ? { ...args, ...options } : options;
    if (!merged.confirmed) {
      return sayGearResult(pendingGearConfirmation('brew_fire_resistance', merged, 'Brewing fire resistance would consume ingredients and needs confirmation. Say "tj confirm brewing" to continue.'));
    }
    const result = await brewing.brewFireResistance(bot, merged);
    gearMemory.recordBrewingAttempt(result);
    return sayGearResult(result);
  }

  async function upgradeReadinessAction(target = 'general') {
    const targetName = typeof target === 'object' ? target.target || 'general' : target;
    const result = gearUpgradeSystem.checkGearUpgradeReadiness(bot, memory, targetName);
    return sayGearResult(result);
  }

  async function netherGearReadinessAction() {
    const result = gearUpgradeSystem.netherGearReadiness(bot, memory);
    return sayGearResult(result);
  }

  async function confirmGearUpgradeAction(kind = '') {
    const pending = memory.get().pendingGearUpgradeConfirmation;
    if (!pending || Date.now() > (pending.expiresAt || 0)) {
      memory.update({ pendingGearUpgradeConfirmation: null });
      say('No active gear upgrade confirmation.', true);
      return { ok: false, message: 'No active gear upgrade confirmation.' };
    }
    const requested = String(kind || '').toLowerCase();
    const type = pending.type;
    const requestedTokens = requested.split(/\s+/).filter(Boolean);
    const matchesType = requestedTokens.length === 0 ||
      requestedTokens.some((token) => type.includes(token)) ||
      (requestedTokens.includes('anvil') && ['repair_item', 'combine_items', 'apply_book_to_item', 'rename_item'].includes(type)) ||
      (requestedTokens.includes('enchant') && type.startsWith('enchant')) ||
      (requestedTokens.includes('book') && type === 'apply_book_to_item') ||
      (requestedTokens.includes('brewing') && type.startsWith('brew'));
    if (!matchesType) {
      say(`The pending confirmation is for ${type.replace(/_/g, ' ')}, not ${requested}.`, true);
      return { ok: false, message: 'Gear confirmation mismatch.' };
    }
    memory.update({ pendingGearUpgradeConfirmation: null });
    const pendingText = `${requested} ${type} ${JSON.stringify(pending.args || {})}`;
    const confirmedArgs = {
      ...(pending.args || {}),
      confirmed: true,
      sender: config.ownerUsername,
      confirmDiamondGear: /diamond/.test(pendingText),
      confirmNetherite: /netherite/.test(pendingText),
      confirmRareBook: /book|rare/.test(pendingText)
    };
    if (type === 'enchant_item') return enchantItemAction(confirmedArgs, confirmedArgs);
    if (type === 'enchant_held_item') return enchantHeldItemAction(confirmedArgs, confirmedArgs);
    if (type === 'enchant_best_candidate') return enchantBestCandidateAction(confirmedArgs, confirmedArgs);
    if (type === 'repair_item') return repairItemAction(confirmedArgs, confirmedArgs);
    if (type === 'combine_items') return combineItemsAction(confirmedArgs, confirmedArgs);
    if (type === 'apply_book_to_item') return applyBookToItemAction(confirmedArgs, { ...confirmedArgs, confirmRareBook: true });
    if (type === 'rename_item') return renameItemAction(confirmedArgs, confirmedArgs);
    if (type === 'use_potion') return usePotionAction(confirmedArgs, confirmedArgs);
    if (type === 'brew_potion') return brewPotionAction(confirmedArgs, confirmedArgs);
    if (type === 'brew_fire_resistance') return brewFireResistanceAction(confirmedArgs, confirmedArgs);
    return { ok: false, message: `Unknown pending gear action ${type}.` };
  }


  return {
    pendingGearConfirmation,
    sayGearResult,
    gearStatusAction,
    gearUpgradeStatusAction,
    suggestGearUpgradesAction,
    suggestNextGearUpgradeAction,
    createGearUpgradePlanAction,
    enchantStatusAction,
    enchantOptionsAction,
    enchantItemAction,
    enchantHeldItemAction,
    enchantBestCandidateAction,
    anvilStatusAction,
    repairItemAction,
    combineItemsAction,
    applyBookToItemAction,
    renameItemAction,
    potionStatusAction,
    usePotionAction,
    carryPotionLoadoutAction,
    brewingStatusAction,
    brewPotionAction,
    brewFireResistanceAction,
    upgradeReadinessAction,
    netherGearReadinessAction,
    confirmGearUpgradeAction
  };
}
