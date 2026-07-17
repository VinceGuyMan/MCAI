import { findInventoryItem, logNames, plankNames } from './crafting.js';
import { countItem } from './inventory.js';
import { findOrPlaceFurnace as sharedFindOrPlaceFurnace, findNearbyFurnace } from './furnacePlacement.js';

// Ore / special inputs → furnace outputs.
const oreConversions = {
  raw_iron: 'iron_ingot',
  iron_ore: 'iron_ingot',
  deepslate_iron_ore: 'iron_ingot',
  raw_gold: 'gold_ingot',
  gold_ore: 'gold_ingot',
  deepslate_gold_ore: 'gold_ingot',
  raw_copper: 'copper_ingot',
  copper_ore: 'copper_ingot',
  deepslate_copper_ore: 'copper_ingot'
};

// Any of these log/block names smelt to charcoal.
const charcoalInputs = new Set([
  ...logNames,
  'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log', 'stripped_jungle_log',
  'stripped_acacia_log', 'stripped_dark_oak_log', 'stripped_mangrove_log', 'stripped_cherry_log',
  'crimson_stem', 'warped_stem', 'stripped_crimson_stem', 'stripped_warped_stem'
]);

const fuelNames = [
  'coal',
  'charcoal',
  ...logNames,
  ...plankNames
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

function cleanName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\b(the|a|an|some|my|your|please|of)\b/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve spoken/canonical name → concrete inventory item to put in furnace. */
export function normalizeSmeltInput(bot, itemName = 'raw_iron') {
  const cleaned = cleanName(itemName);
  const underscored = cleaned.replace(/\s+/g, '_');

  // Charcoal production: pick a log we actually have.
  if (cleaned === 'charcoal' || cleaned === 'make charcoal' || cleaned === 'coal charcoal') {
    for (const log of charcoalInputs) {
      if (countItem(bot, log) > 0) return { input: log, output: 'charcoal', kind: 'charcoal' };
    }
    return { input: null, output: 'charcoal', kind: 'charcoal', missing: 'logs' };
  }

  // Iron shorthand: prefer raw_iron, then ore blocks.
  if (cleaned === 'iron' || cleaned === 'iron ore' || cleaned === 'raw iron' || underscored === 'iron_ingot') {
    if (countItem(bot, 'raw_iron') > 0) return { input: 'raw_iron', output: 'iron_ingot', kind: 'ore' };
    if (countItem(bot, 'iron_ore') > 0) return { input: 'iron_ore', output: 'iron_ingot', kind: 'ore' };
    if (countItem(bot, 'deepslate_iron_ore') > 0) return { input: 'deepslate_iron_ore', output: 'iron_ingot', kind: 'ore' };
    return { input: 'raw_iron', output: 'iron_ingot', kind: 'ore', missing: 'raw_iron' };
  }

  if (oreConversions[underscored]) {
    return { input: underscored, output: oreConversions[underscored], kind: 'ore' };
  }
  if (charcoalInputs.has(underscored)) {
    return { input: underscored, output: 'charcoal', kind: 'charcoal' };
  }
  // "oak log" style
  const asLog = `${underscored}_log`;
  if (charcoalInputs.has(asLog)) {
    return { input: asLog, output: 'charcoal', kind: 'charcoal' };
  }
  return { input: null, output: null, kind: null, missing: underscored || 'item' };
}

export function listSmeltable() {
  return [
    'raw_iron / iron_ore → iron_ingot',
    'logs → charcoal',
    'raw_gold / gold_ore → gold_ingot',
    'raw_copper / copper_ore → copper_ingot'
  ];
}

function totalLogs(bot) {
  return logNames.reduce((sum, name) => sum + countItem(bot, name), 0);
}

function totalPlanks(bot) {
  return plankNames.reduce((sum, name) => sum + countItem(bot, name), 0);
}

/**
 * Fuel policy for iron-age play:
 * - Prefer coal/charcoal first
 * - Never burn logs/planks below craft reserves (default 4 logs, 4 planks)
 * - Never burn the exact item currently being smelted as the only remaining stack
 */
function fuelItem(bot, options = {}) {
  const avoidAsFuel = new Set(options.avoidFuelNames || []);
  const reserveLogs = Math.max(0, Number(options.reserveLogs ?? bot?.mcaiConfig?.smeltReserveLogs ?? 4));
  const reservePlanks = Math.max(0, Number(options.reservePlanks ?? bot?.mcaiConfig?.smeltReservePlanks ?? 4));
  const order = [
    'coal',
    'charcoal',
    ...plankNames,
    ...logNames
  ];
  for (const name of order) {
    if (avoidAsFuel.has(name)) continue;
    const item = findInventoryItem(bot, name);
    if (!item) continue;
    if (name.endsWith('_log')) {
      if (totalLogs(bot) <= reserveLogs) continue;
      if (countItem(bot, name) <= 1 && totalLogs(bot) <= reserveLogs + 1) continue;
    }
    if (name.endsWith('_planks')) {
      if (totalPlanks(bot) <= reservePlanks) continue;
      if (countItem(bot, name) <= 1 && totalPlanks(bot) <= reservePlanks + 1) continue;
    }
    // Don't burn the stack we are putting in as smelt input if it would leave us empty.
    if (options.inputName === name && countItem(bot, name) <= 1) continue;
    return item;
  }
  // Last resort: allow coal/charcoal only (never burn reserved craft wood)
  for (const name of ['coal', 'charcoal']) {
    const item = findInventoryItem(bot, name);
    if (item) return item;
  }
  return null;
}

async function findOrPlaceFurnace(bot, options = {}) {
  return sharedFindOrPlaceFurnace(bot, { ...options, source: 'smelting', maxDistance: 12 });
}

export async function smeltItem(bot, itemName = 'raw_iron', count = 1, options = {}) {
  if (options.shouldStop?.()) return result(false, 'Stopped smelting.');

  const resolved = normalizeSmeltInput(bot, itemName);
  if (!resolved.input) {
    if (resolved.kind === 'charcoal') {
      return result(false, 'I need logs to make charcoal. Gather wood first.');
    }
    if (resolved.kind === 'ore' || /iron/.test(String(itemName || ''))) {
      return result(false, 'I need raw iron (or iron ore) to smelt. Mine iron first.');
    }
    return result(false, `I can smelt: ${listSmeltable().join('; ')}. Not sure about "${itemName}".`);
  }

  const inputName = resolved.input;
  const outputName = resolved.output;
  const input = findInventoryItem(bot, inputName);
  if (!input) return result(false, `I need ${inputName} to smelt.`);

  // Charcoal: burn planks/coal, not the only log we are smelting.
  const fuel = fuelItem(bot, {
    inputName,
    avoidFuelNames: resolved.kind === 'charcoal' ? [] : []
  });
  if (!fuel) {
    return result(false, resolved.kind === 'charcoal'
      ? 'I need fuel for charcoal (extra planks/logs or coal). Keep at least 2 logs for crafting.'
      : 'I need safe fuel to smelt (coal, charcoal, or spare planks/logs).');
  }

  const furnaceResult = await findOrPlaceFurnace(bot, options);
  if (!furnaceResult.ok) return furnaceResult;

  let produced = 0;
  const target = Math.max(1, Math.min(64, Number(count) || 1));
  try {
    const furnace = await bot.openFurnace(furnaceResult.block);
    while (produced < target) {
      if (options.shouldStop?.()) {
        bot.closeWindow(furnace);
        return result(false, 'Stopped smelting.', { count: produced, output: outputName });
      }
      const nextInput = findInventoryItem(bot, inputName);
      const nextFuel = fuelItem(bot, { inputName });
      if (!nextInput || !nextFuel) break;
      // Keep one log if this is charcoal and we only have 1 left for other crafts after this item
      if (resolved.kind === 'charcoal' && countItem(bot, inputName) <= 1 && produced > 0) break;

      // mineflayer putInput/putFuel want item TYPE (numeric), not stack id.
      const inputType = nextInput.type ?? nextInput.id;
      const fuelType = nextFuel.type ?? nextFuel.id;
      if (inputType == null || inputType === undefined) {
        bot.closeWindow(furnace);
        return result(false, `I could not smelt ${inputName}: invalid input item type.`);
      }
      if (fuelType == null || fuelType === undefined) {
        bot.closeWindow(furnace);
        return result(false, 'I could not load furnace fuel (invalid fuel item type).');
      }
      await furnace.putInput(inputType, nextInput.metadata ?? null, 1);
      await furnace.putFuel(fuelType, nextFuel.metadata ?? null, 1);
      const start = Date.now();
      while (!furnace.outputItem() && Date.now() - start < (options.timeoutMs || 45000)) {
        if (options.shouldStop?.()) {
          bot.closeWindow(furnace);
          return result(false, 'Stopped smelting.', { count: produced, output: outputName });
        }
        await wait(500);
      }
      if (!furnace.outputItem()) break;
      await furnace.takeOutput();
      produced += 1;
    }
    bot.closeWindow(furnace);
    return produced > 0
      ? result(true, `Smelted ${produced} ${inputName} into ${outputName}.`, { output: outputName, count: produced, input: inputName })
      : result(false, `Smelting ${inputName} did not finish before timeout.`);
  } catch (error) {
    console.warn(`[smelting] smeltItem failed: ${error.message}`);
    return result(false, `I could not smelt ${inputName}: ${error.message}`);
  }
}

export async function smeltCharcoal(bot, count = 4, options = {}) {
  return smeltItem(bot, 'charcoal', count, options);
}

export async function smeltIron(bot, count = 8, options = {}) {
  return smeltItem(bot, 'iron', count, options);
}

export { oreConversions, charcoalInputs, findNearbyFurnace };
