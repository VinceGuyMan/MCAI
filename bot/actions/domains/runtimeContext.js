/**
 * Shared mutable runtime helpers used across action domains.
 * Holds stop/pathfinder state and owner-facing utilities.
 */
import { clearAllConfirmations } from '../../confirmationManager.js';
import { logNames, wait, posText } from '../shared.js';
import { applyProfile, buildMovements } from '../../movementController.js';

/**
 * @param {object} opts
 * @param {import('mineflayer').Bot} opts.bot
 * @param {object} opts.config
 * @param {object} opts.memory
 * @param {object} [opts.safety]
 * @param {object} [opts.cancellation]
 * @param {typeof import('mineflayer-pathfinder').default.Movements} opts.Movements
 */
export function createRuntimeContext({ bot, config, memory, safety, cancellation, Movements }) {
  const state = {
    movements: null,
    lastChatAt: 0,
    lastTaskUpdateAt: 0,
    stopRequested: false
  };

  function setupMovements() {
    if (state.movements || !bot.registry) return;
    // Shared movement profiles: fluid-avoiding default for all pathing.
    const built = buildMovements(bot, 'default', config);
    state.movements = built || new Movements(bot);
    if (!built) {
      state.movements.canDig = true;
      state.movements.liquidCost = Math.max(120, Number(config.defaultLiquidCost || 120));
    }
    applyProfile(bot, 'default', config);
    bot.pathfinder.setMovements(state.movements);
  }

  function ownerPlayer() {
    return bot.players[config.ownerUsername] || null;
  }

  function ownerEntity() {
    return ownerPlayer()?.entity || null;
  }

  function shouldSuppressOwnerFacingChat() {
    if (config.suppressChatWhenOwnerOffline === false) return false;
    const mem = memory.get();
    const ownerWasSeen = Boolean(mem.lastOwnerActivityAt || mem.lastOwnerPosition || mem.lastOwnerSeenAt);
    return ownerWasSeen && !ownerPlayer();
  }

  function say(message, force = false) {
    const now = Date.now();
    if (!force && now - state.lastChatAt < config.chatCooldownMs) return;
    if (shouldSuppressOwnerFacingChat()) {
      console.log(`[chat] suppressed owner-facing message while ${config.ownerUsername} is offline: ${String(message).slice(0, 80)}`);
      return;
    }
    state.lastChatAt = now;
    bot.chat(String(message).slice(0, 220));
  }

  function logCount() {
    const wanted = new Set(logNames);
    return bot.inventory.items()
      .filter((item) => wanted.has(item.name))
      .reduce((sum, item) => sum + item.count, 0);
  }

  function safeToDigBlock(block, stateArg = null) {
    if (typeof safety?.safeToDig === 'function') return safety.safeToDig(block, stateArg);
    if (!block) return { ok: false, reason: 'no block' };
    if (block.diggable === false) return { ok: false, reason: `${block.name} is not diggable` };
    return { ok: true, reason: 'safe' };
  }

  function findNearestBlockByNames(names, maxDistance = 32, count = 24) {
    if (!bot.findBlocks || !bot.blockAt) return null;
    const wanted = new Set(names);
    const ids = names
      .map((name) => bot.registry?.blocksByName?.[name]?.id)
      .filter((id) => id !== undefined && id !== null);
    const matching = ids.length ? ids : (block) => wanted.has(block?.name);
    let positions = [];
    try {
      positions = bot.findBlocks({ matching, maxDistance, count }) || [];
    } catch {
      return null;
    }
    return positions
      .map((position) => bot.blockAt(position))
      .filter((block) => block && wanted.has(block.name))
      .sort((a, b) => {
        if (!bot.entity?.position) return 0;
        return bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position);
      })[0] || null;
  }

  function isCancelled() {
    return state.stopRequested || cancellation?.isCancelled?.();
  }

  function throwIfCancelled() {
    if (state.stopRequested) {
      const error = new Error('Stopped.');
      error.cancelled = true;
      throw error;
    }
    cancellation?.throwIfCancelled?.();
  }

  function isExpectedPathInterrupt(error) {
    const message = String(error?.message || error || '');
    return message.includes('GoalChanged') ||
      message.includes('goal was changed') ||
      message.includes('Path was stopped') ||
      message.includes('cancelled') ||
      message.includes('Canceled');
  }

  function ownerDistance() {
    const owner = ownerEntity();
    if (!owner || !bot.entity) return Infinity;
    return bot.entity.position.distanceTo(owner.position);
  }

  async function waitUntilNearOwner(range, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      throwIfCancelled();
      const owner = ownerEntity();
      if (!owner) return { ok: false, reason: 'Owner is not visible.' };
      if (ownerDistance() <= range) return { ok: true };
      await wait(250);
    }
    return { ok: false, reason: `Could not reach ModVinny within ${Math.round(timeoutMs / 1000)} seconds.` };
  }

  function resetCancellation() {
    state.stopRequested = false;
    cancellation?.resetCancellation?.();
  }

  function clearPendingOwnerDecisions(reason = 'owner stop') {
    clearAllConfirmations(reason);
    return {
      pendingConfirmation: null,
      pendingConfirmationExpiresAt: 0,
      pendingCraftConfirmation: null,
      pendingCraftScavengeConfirmation: null,
      pendingBuildConfirmation: null,
      pendingMiningConfirmation: null,
      pendingFarmConfirmation: null,
      pendingAnimalConfirmation: null,
      pendingExplorationConfirmation: null,
      pendingCombatConfirmation: null,
      pendingGoalConfirmation: null,
      pendingGoalConfirmationExpiresAt: 0,
      pendingNetherConfirmation: null,
      pendingNetherConfirmationExpiresAt: 0,
      pendingDialogueClarification: null,
      pendingMemoryConfirmation: null,
      pendingClearConversationMemoryConfirmation: null,
      pendingProgressionConfirmation: null,
      pendingProgressionConfirmationExpiresAt: 0,
      pendingNaturalCommandIntent: null,
      pendingGearUpgradeConfirmation: null,
      pendingTradeConfirmation: null,
      pendingVillagerMemoryConfirmation: null,
      pendingBridgeRegionConfirmation: null,
      pendingIdleMemoryResetConfirmation: null,
      pendingBlueprintBuild: null
    };
  }

  function stopMotion() {
    bot.pathfinder?.setGoal?.(null);
    bot.clearControlStates?.();
    try {
      bot.stopDigging?.();
    } catch {
      // stopDigging may throw when no dig is active; stop should stay idempotent.
    }
    try {
      bot.deactivateItem?.();
    } catch {
      // Same idea: emergency stop should never fail because item use already ended.
    }
  }

  return {
    state,
    setupMovements,
    say,
    ownerPlayer,
    ownerEntity,
    shouldSuppressOwnerFacingChat,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    isExpectedPathInterrupt,
    ownerDistance,
    waitUntilNearOwner,
    resetCancellation,
    clearPendingOwnerDecisions,
    stopMotion,
    wait,
    posText
  };
}
