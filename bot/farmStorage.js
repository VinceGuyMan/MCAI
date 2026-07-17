import * as inventory from './inventory.js';
import * as storage from './storage.js';

const farmItems = new Set([
  'wheat',
  'wheat_seeds',
  'carrot',
  'potato',
  'poisonous_potato',
  'beetroot',
  'beetroot_seeds',
  'melon_slice',
  'pumpkin',
  'sugar_cane',
  'sweet_berries',
  'egg',
  'feather',
  'leather',
  'white_wool',
  'orange_wool',
  'magenta_wool',
  'light_blue_wool',
  'yellow_wool',
  'lime_wool',
  'pink_wool',
  'gray_wool',
  'light_gray_wool',
  'cyan_wool',
  'purple_wool',
  'blue_wool',
  'brown_wool',
  'green_wool',
  'red_wool',
  'black_wool',
  'milk_bucket',
  'bucket',
  'shears',
  'bone_meal'
]);

export function getFarmInventorySummary(bot) {
  const summary = {};
  for (const item of bot.inventory?.items?.() || []) {
    if (!farmItems.has(item.name) && !item.name.endsWith('_wool')) continue;
    summary[item.name] = (summary[item.name] || 0) + item.count;
  }
  return summary;
}

export function shouldStoreFarmItem(itemName) {
  return farmItems.has(itemName) || String(itemName || '').endsWith('_wool');
}

export function keepMinimumFarmSupplies(bot, config = {}) {
  return {
    wheat_seeds: Math.min(inventory.countItem(bot, 'wheat_seeds'), config.minWheatSeedsToKeep || 4),
    wheat: Math.min(inventory.countItem(bot, 'wheat'), config.minWheatToKeep || 6),
    carrot: Math.min(inventory.countItem(bot, 'carrot'), config.minCarrotsToKeep || 6),
    potato: Math.min(inventory.countItem(bot, 'potato'), config.minPotatoesToKeep || 6),
    beetroot: Math.min(inventory.countItem(bot, 'beetroot'), config.minBeetrootsToKeep || 6),
    beetroot_seeds: Math.min(inventory.countItem(bot, 'beetroot_seeds'), config.minWheatSeedsToKeep || 4)
  };
}

export async function storeFarmItems(bot, memory, options = {}) {
  if (!storage.findOwnedStorageChest(bot, memory)) return { ok: false, message: 'No registered storage chest for farm output.' };
  const result = await storage.depositItems(bot, memory, {
    ...options,
    config: options.config,
    shouldStop: options.shouldStop
  });
  return result.ok
    ? { ...result, message: `Farm storage: ${result.message}` }
    : result;
}

export async function withdrawFarmSupplies(bot, memory, options = {}) {
  const cropType = options.cropType || 'wheat';
  const itemName = cropType === 'wheat' ? 'wheat_seeds' : cropType === 'beetroots' ? 'beetroot_seeds' : cropType.replace(/s$/, '');
  return storage.withdrawItem(bot, memory, itemName, options.count || 4, options);
}

export { farmItems };
