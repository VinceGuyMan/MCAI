/**
 * Mining / smelting action handlers.
 */
import * as mining from '../../mining.js';
import * as smelting from '../../smelting.js';
import { normalizeActionCount } from '../shared.js';

export function createMiningHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction
  } = ctx;

  function sayPlanning(message, options = {}) {
    if (typeof ctx.sayPlanning === 'function') return ctx.sayPlanning(message, options);
    if (!options.silent) say(message, true);
  }

  async function miningStatusAction() {
    const status = mining.miningStatus(bot, memory);
    if (memory.get().primaryMineEntrance) syncWaypoint('mine entrance', 'mine', memory.get().primaryMineEntrance, 'Known mine entrance.', ['mine']);
    const oreText = Object.entries(status.visibleOres || {}).filter(([, ores]) => ores.length).map(([name, ores]) => `${name} ${ores.length}`).join(', ') || 'none';
    say(`Mining: active ${status.activeMiningExpedition?.resourceType || 'none'}, pickaxe ${status.tools.bestPickaxe || 'none'}, torches ${status.torchCount}, free slots ${status.freeSlots}, visible ores ${oreText}.`, true);
    return status;
  }

  async function smeltItemAction(itemNameOrArgs = 'raw_iron', count = 1, options = {}) {
    throwIfCancelled();
    // Accept object args from natural router / executeAction.
    let itemName = itemNameOrArgs;
    let amount = count;
    let opts = options;
    if (itemNameOrArgs && typeof itemNameOrArgs === 'object') {
      itemName = itemNameOrArgs.itemName || itemNameOrArgs.item || itemNameOrArgs.resource || itemNameOrArgs.target || 'raw_iron';
      amount = itemNameOrArgs.count ?? itemNameOrArgs.targetCount ?? count;
      opts = { ...options, ...itemNameOrArgs };
    }
    const result = await smelting.smeltItem(bot, itemName, normalizeActionCount(amount, 1), resourceOptions(opts));
    sayPlanning(result.message, opts);
    return result;
  }

  async function smeltIronAction(count = 8, options = {}) {
    throwIfCancelled();
    const amount = typeof count === 'object' ? (count.count ?? count.targetCount ?? 8) : count;
    const result = await smelting.smeltIron(bot, normalizeActionCount(amount, 8), resourceOptions(typeof count === 'object' ? count : options));
    sayPlanning(result.message, typeof count === 'object' ? count : options);
    return result;
  }

  async function smeltCharcoalAction(count = 4, options = {}) {
    throwIfCancelled();
    const amount = typeof count === 'object' ? (count.count ?? count.targetCount ?? 4) : count;
    const result = await smelting.smeltCharcoal(bot, normalizeActionCount(amount, 4), resourceOptions(typeof count === 'object' ? count : options));
    sayPlanning(result.message, typeof count === 'object' ? count : options);
    return result;
  }

  async function mineCoalAction(count = 8, options = {}) {
    throwIfCancelled();
    // Surface coal: skip torch requirement so first fuel trip is not deadlocked.
    if (config.thinCoreEnabled) {
      return thinCollectResourceAction(
        { resource: 'coal', count: normalizeActionCount(count, 8) },
        { ...options, source: 'actions.mineCoalAction', skipTorchRequirement: true }
      );
    }
    const result = await mining.mineCoal(bot, memory, count, resourceOptions({ ...options, skipTorchRequirement: true }));
    sayPlanning(result.message, options);
    return result;
  }

  async function mineIronAction(count = 8, options = {}) {
    throwIfCancelled();
    if (config.thinCoreEnabled) return thinCollectResourceAction({ resource: 'iron', count: normalizeActionCount(count, 8) }, { ...options, source: 'actions.mineIronAction' });
    const result = await mining.mineIron(bot, memory, count, resourceOptions(options));
    sayPlanning(result.message, options);
    return result;
  }

  return {
    miningStatusAction,
    smeltItemAction,
    smeltIronAction,
    smeltCharcoalAction,
    mineCoalAction,
    mineIronAction
  };
}
