/**
 * Nether prep / portal / scout handlers.
 */
export function createNetherHandlers(ctx) {
  const {
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, posText,
    resourceOptions, loadMapMemory, saveMapMemory,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory, brewing
  } = ctx;

  function setPendingNetherConfirmation(action, extra = {}) {
    const expiresAt = Date.now() + 60000;
    memory.update({
      pendingNetherConfirmation: { action, createdAt: Date.now(), ...extra },
      pendingNetherConfirmationExpiresAt: expiresAt
    });
    return expiresAt;
  }

  function getPendingNetherConfirmation(action = null) {
    const mem = memory.get();
    const pending = mem.pendingNetherConfirmation;
    if (!pending) return null;
    if ((mem.pendingNetherConfirmationExpiresAt || 0) < Date.now()) {
      memory.update({ pendingNetherConfirmation: null, pendingNetherConfirmationExpiresAt: 0 });
      return null;
    }
    if (action && pending.action !== action) return null;
    return pending;
  }

  function clearPendingNetherConfirmation() {
    memory.update({ pendingNetherConfirmation: null, pendingNetherConfirmationExpiresAt: 0 });
  }

  async function netherStatusAction() {
    const mapMemory = loadMapMemory();
    const status = netherPrep.netherStatus(bot, memory, mapMemory);
    const brew = brewing.brewingStatus(bot);
    const missing = status.missing.length ? status.missing.join(', ') : 'nothing critical';
    say(`Nether: ${status.ready ? 'ready' : 'not ready'}. Missing: ${missing}. Portals known O/N: ${status.overworldPortals ? 'yes' : 'no'}/${status.netherPortals ? 'yes' : 'no'}. ${brew.fireResistance ? `Fire resist carried: ${brew.fireResistance}.` : ''}`, true);
    return status;
  }

  async function netherChecklistAction() {
    const checklist = netherPrep.getNetherChecklist(bot, memory);
    const requiredMissing = checklist.required.filter((item) => !item.ok).map((item) => item.name);
    const recommendedMissing = checklist.recommended.filter((item) => !item.ok).map((item) => item.name);
    const text = checklist.ready
      ? `Nether checklist: ready. Recommended gaps: ${recommendedMissing.join(', ') || 'none'}.`
      : `Nether checklist: not ready. Missing: ${requiredMissing.join(', ') || 'unknown'}.`;
    say(text, true);
    memory.update({ netherChecklistLastResult: checklist, netherReadyLastCheckedAt: Date.now() });
    return checklist;
  }

  async function prepareNetherAction(options = {}) {
    throwIfCancelled();
    const result = await netherPrep.prepareNetherKit(bot, memory, resourceOptions(options));
    say(result.message, true);
    return result;
  }

  async function prepareNetherGearAction() {
    throwIfCancelled();
    const result = await netherPrep.prepareNetherGear(bot, memory);
    say(result.message, true);
    return result;
  }

  async function prepareNetherFoodAction() {
    throwIfCancelled();
    const result = await netherPrep.prepareNetherFood(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function prepareNetherBlocksAction() {
    throwIfCancelled();
    const result = await netherPrep.prepareNetherBlocks(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function prepareNetherPortalSuppliesAction() {
    throwIfCancelled();
    const result = await netherPrep.prepareNetherPortalSupplies(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function equipNetherGearAction() {
    throwIfCancelled();
    const result = await netherGear.equipNetherGear(bot, { forceGold: true });
    say(result.message, true);
    memory.update({ netherGearSnapshot: netherGear.getNetherGearStatus(bot), netherReadyLastCheckedAt: Date.now() });
    return result;
  }

  async function portalStatusAction() {
    const mapMemory = loadMapMemory();
    const status = portalManager.portalStatus(bot, memory, mapMemory);
    say(`Portal: nearby ${status.nearbyPortal ? 'yes' : 'no'}, Overworld known ${status.overworldPortalKnown ? 'yes' : 'no'}, Nether known ${status.netherPortalKnown ? 'yes' : 'no'}, obsidian ${status.obsidianCount}, flint/steel ${status.flintAndSteelCount}.`, true);
    return status;
  }

  async function findPortalAction() {
    const mapMemory = loadMapMemory();
    const found = portalManager.findNearbyPortal(bot, 32);
    if (!found) {
      say('I do not see a nearby Nether portal.', true);
      return { ok: false, message: 'no portal nearby' };
    }
    if (netherSafety.isInNether(bot)) portalManager.rememberNetherPortal(bot, memory, mapMemory, found);
    else portalManager.rememberOverworldPortal(bot, memory, mapMemory, found);
    saveMapMemory(mapMemory);
    say(`I found and remembered a portal at ${posText(found.position)}.`, true);
    return { ok: true, portal: found };
  }

  async function rememberPortalAction() {
    return findPortalAction();
  }

  async function buildPortalAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await portalManager.buildNetherPortalFrame(bot, memory, resourceOptions({ ...options, mapMemory }));
    if (result.ok) saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function lightPortalAction(options = {}) {
    throwIfCancelled();
    if (config.requireConfirmationForPortalLighting && !options.confirmed) {
      setPendingNetherConfirmation('portal_lighting');
      say('Portal lighting needs confirmation. Say "tj confirm portal lighting" to continue.', true);
      return { ok: false, requiresConfirmation: 'portal_lighting', message: 'confirmation required' };
    }
    const mapMemory = loadMapMemory();
    const result = await portalManager.lightNetherPortal(bot, memory, resourceOptions({ ...options, mapMemory, confirmed: true }));
    if (result.ok) saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function enterNetherAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    if (config.requireConfirmationForNetherEntry && !options.confirmed) {
      setPendingNetherConfirmation('nether_entry');
      say('Nether entry needs confirmation. Say "tj confirm nether entry" to continue.', true);
      return { ok: false, requiresConfirmation: 'nether_entry', message: 'confirmation required' };
    }
    const mapMemory = loadMapMemory();
    const result = await portalManager.enterNetherPortal(bot, memory, mapMemory, resourceOptions({ ...options, confirmed: true }));
    saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function safeNetherEntryAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    if (config.requireConfirmationForNetherEntry && !options.confirmed) {
      setPendingNetherConfirmation('nether_entry');
      say('Safe Nether entry needs confirmation. Say "tj confirm nether entry" to continue.', true);
      return { ok: false, requiresConfirmation: 'nether_entry', message: 'confirmation required' };
    }
    const mapMemory = loadMapMemory();
    const result = await netherScout.safeNetherEntry(bot, memory, mapMemory, resourceOptions({ ...options, confirmed: true }));
    saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function scanNetherAction(options = {}) {
    const mapMemory = loadMapMemory();
    if (!netherSafety.isInNether(bot)) {
      const status = portalManager.portalStatus(bot, memory, mapMemory);
      const message = status.nearbyPortal ? 'I am in the Overworld near a portal; enter first before scanning Nether danger.' : 'I am not in the Nether.';
      if (!options.silent) say(message, true);
      return { ok: false, message };
    }
    const result = await netherScout.scanNetherEntryArea(bot, memory, mapMemory, resourceOptions(options));
    saveMapMemory(mapMemory);
    if (!options.silent) say(result.message, true);
    return result;
  }

  async function secureNetherPortalAction(options = {}) {
    throwIfCancelled();
    const mapMemory = loadMapMemory();
    const result = await netherScout.secureNetherPortalArea(bot, memory, mapMemory, resourceOptions(options));
    saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function returnFromNetherAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await netherScout.returnFromNetherScout(bot, memory, mapMemory, resourceOptions(options));
    saveMapMemory(mapMemory);
    say(result.message, true);
    return result;
  }

  async function netherMemoryStatusAction() {
    const mapMemory = loadMapMemory();
    const result = netherMemory.netherMemoryStatus(mapMemory);
    say(result.message, true);
    return result;
  }

  async function stopNetherTaskAction() {
    memory.update({
      netherScoutActive: false,
      pendingNetherConfirmation: null,
      pendingNetherConfirmationExpiresAt: 0,
      lastNetherAbortReason: 'Stopped by owner.'
    });
    return stop();
  }

  async function confirmNetherAction(action) {
    const normalized = String(action || '').trim().toLowerCase().replace(/\s+/g, '_');
    const aliases = {
      nether_prep: 'nether_prep',
      portal_lighting: 'portal_lighting',
      nether_entry: 'nether_entry',
      nether_scout: 'nether_entry',
      nether_exploration: 'nether_exploration',
      nether_mining: 'nether_mining',
      fortress_search: 'nether_fortress_search',
      bastion_search: 'nether_bastion_search',
      nether_override: 'nether_entry_override'
    };
    const requested = aliases[normalized] || normalized;

    if (['nether_exploration', 'nether_mining', 'nether_fortress_search', 'nether_bastion_search'].includes(requested)) {
      say('That part of the Nether is still blocked in this phase. I can prepare, enter safely, scan near the portal, and return.', true);
      clearPendingNetherConfirmation();
      return { ok: false, message: 'unsupported Nether action' };
    }

    const pending = getPendingNetherConfirmation(requested) || (requested === 'nether_entry' ? getPendingNetherConfirmation('nether_scout') : null);
    if (!pending && requested !== 'nether_entry_override') {
      say('No matching Nether confirmation is pending.', true);
      return { ok: false, message: 'no pending confirmation' };
    }
    clearPendingNetherConfirmation();

    if (requested === 'nether_prep') return prepareNetherAction({ confirmed: true });
    if (requested === 'portal_lighting') return lightPortalAction({ confirmed: true });
    if (requested === 'nether_entry' || requested === 'nether_entry_override') return safeNetherEntryAction({ confirmed: true, override: requested === 'nether_entry_override' });
    say('I do not know how to confirm that Nether action yet.', true);
    return { ok: false, message: 'unknown Nether confirmation' };
  }


  return {
    setPendingNetherConfirmation,
    getPendingNetherConfirmation,
    clearPendingNetherConfirmation,
    netherStatusAction,
    netherChecklistAction,
    prepareNetherAction,
    prepareNetherGearAction,
    prepareNetherFoodAction,
    prepareNetherBlocksAction,
    prepareNetherPortalSuppliesAction,
    equipNetherGearAction,
    portalStatusAction,
    findPortalAction,
    rememberPortalAction,
    buildPortalAction,
    lightPortalAction,
    enterNetherAction,
    safeNetherEntryAction,
    scanNetherAction,
    secureNetherPortalAction,
    returnFromNetherAction,
    netherMemoryStatusAction,
    stopNetherTaskAction,
    confirmNetherAction
  };
}
