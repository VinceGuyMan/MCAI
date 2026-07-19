import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { countItem, craftItem, findInventoryItem, findNearbyCraftingTable, placeCraftingTable } from './crafting.js';
import { findNearbyFurnace as sharedFindNearbyFurnace, findOrPlaceFurnace as sharedFindOrPlaceFurnace } from './furnacePlacement.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

// All edible foods TJ knows (iron-age companion diet — no chorus fruit needed for survival play).
const safeFoodPriority = [
  'cooked_beef',
  'cooked_porkchop',
  'cooked_mutton',
  'cooked_chicken',
  'cooked_rabbit',
  'cooked_cod',
  'cooked_salmon',
  'bread',
  'baked_potato',
  'golden_carrot',
  'apple',
  'carrot',
  'beetroot',
  'melon_slice',
  'pumpkin_pie',
  'cookie',
  'mushroom_stew',
  'beetroot_soup',
  'rabbit_stew',
  'dried_kelp',
  'honey_bottle'
];

const emergencyFoodPriority = [
  'beef',
  'porkchop',
  'mutton',
  'chicken',
  'rabbit',
  'cod',
  'salmon',
  'tropical_fish',
  'potato',
  'sweet_berries',
  'glow_berries',
  'kelp' // not ideal food; dried_kelp is preferred after smelting
];

const riskyFoodPriority = [
  'rotten_flesh',
  'spider_eye',
  'poisonous_potato',
  'pufferfish',
  'suspicious_stew',
  'chorus_fruit'
];

const goldenAppleNames = new Set(['golden_apple', 'enchanted_golden_apple']);
const safeFoods = new Set(safeFoodPriority);
const emergencyFoods = new Set(emergencyFoodPriority);
const riskyFoods = new Set(riskyFoodPriority);

const cookableConversions = {
  beef: 'cooked_beef',
  porkchop: 'cooked_porkchop',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  rabbit: 'cooked_rabbit',
  cod: 'cooked_cod',
  salmon: 'cooked_salmon',
  potato: 'baked_potato',
  kelp: 'dried_kelp'
};

// Spoken / casual names → canonical Minecraft item id (or 'food' for generic).
const FOOD_ITEM_ALIASES = {
  food: 'food',
  foods: 'food',
  fud: 'food',
  meal: 'food',
  snack: 'food',
  snacks: 'food',
  meat: 'food',
  meats: 'food',
  'something to eat': 'food',
  // cooked meats
  steak: 'cooked_beef',
  steaks: 'cooked_beef',
  'cooked beef': 'cooked_beef',
  cooked_beef: 'cooked_beef',
  'cooked pork': 'cooked_porkchop',
  'cooked porkchop': 'cooked_porkchop',
  cooked_porkchop: 'cooked_porkchop',
  'cooked mutton': 'cooked_mutton',
  cooked_mutton: 'cooked_mutton',
  'cooked chicken': 'cooked_chicken',
  cooked_chicken: 'cooked_chicken',
  'cooked rabbit': 'cooked_rabbit',
  cooked_rabbit: 'cooked_rabbit',
  'cooked cod': 'cooked_cod',
  cooked_cod: 'cooked_cod',
  'cooked salmon': 'cooked_salmon',
  cooked_salmon: 'cooked_salmon',
  'cooked fish': 'cooked_cod',
  // raw meats
  beef: 'beef',
  'raw beef': 'beef',
  raw_beef: 'beef',
  pork: 'porkchop',
  porkchop: 'porkchop',
  'pork chop': 'porkchop',
  'raw pork': 'porkchop',
  mutton: 'mutton',
  'raw mutton': 'mutton',
  lamb: 'mutton',
  chicken: 'chicken',
  'raw chicken': 'chicken',
  rabbit: 'rabbit',
  'raw rabbit': 'rabbit',
  // fish
  cod: 'cod',
  'raw cod': 'cod',
  salmon: 'salmon',
  'raw salmon': 'salmon',
  fish: 'cod',
  'tropical fish': 'tropical_fish',
  tropical_fish: 'tropical_fish',
  pufferfish: 'pufferfish',
  'puffer fish': 'pufferfish',
  // crops / plants
  bread: 'bread',
  loaf: 'bread',
  loaves: 'bread',
  apple: 'apple',
  apples: 'apple',
  carrot: 'carrot',
  carrots: 'carrot',
  potato: 'potato',
  potatoes: 'potato',
  'baked potato': 'baked_potato',
  baked_potato: 'baked_potato',
  'baked potatoes': 'baked_potato',
  beetroot: 'beetroot',
  beet: 'beetroot',
  beets: 'beetroot',
  melon: 'melon_slice',
  melons: 'melon_slice',
  'melon slice': 'melon_slice',
  melon_slice: 'melon_slice',
  berries: 'sweet_berries',
  berry: 'sweet_berries',
  'sweet berries': 'sweet_berries',
  sweet_berries: 'sweet_berries',
  'glow berries': 'glow_berries',
  glow_berries: 'glow_berries',
  cookie: 'cookie',
  cookies: 'cookie',
  pie: 'pumpkin_pie',
  'pumpkin pie': 'pumpkin_pie',
  pumpkin_pie: 'pumpkin_pie',
  stew: 'mushroom_stew',
  'mushroom stew': 'mushroom_stew',
  mushroom_stew: 'mushroom_stew',
  'beetroot soup': 'beetroot_soup',
  beetroot_soup: 'beetroot_soup',
  soup: 'beetroot_soup',
  'rabbit stew': 'rabbit_stew',
  rabbit_stew: 'rabbit_stew',
  'dried kelp': 'dried_kelp',
  dried_kelp: 'dried_kelp',
  kelp: 'kelp',
  honey: 'honey_bottle',
  'honey bottle': 'honey_bottle',
  honey_bottle: 'honey_bottle',
  'golden carrot': 'golden_carrot',
  golden_carrot: 'golden_carrot',
  'golden apple': 'golden_apple',
  golden_apple: 'golden_apple',
  'enchanted golden apple': 'enchanted_golden_apple',
  enchanted_golden_apple: 'enchanted_golden_apple',
  'notch apple': 'enchanted_golden_apple',
  // risky (known but not preferred)
  'rotten flesh': 'rotten_flesh',
  rotten_flesh: 'rotten_flesh',
  'zombie flesh': 'rotten_flesh',
  'spider eye': 'spider_eye',
  spider_eye: 'spider_eye',
  'poisonous potato': 'poisonous_potato',
  poisonous_potato: 'poisonous_potato',
  'suspicious stew': 'suspicious_stew',
  suspicious_stew: 'suspicious_stew',
  'chorus fruit': 'chorus_fruit',
  chorus_fruit: 'chorus_fruit'
};

const fuelPriority = ['coal', 'charcoal', 'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks'];
const logFuelNames = fuelPriority.filter((name) => name.endsWith('_log'));
const plantBlockNames = ['sweet_berry_bush', 'cave_vines', 'melon', 'pumpkin'];
const cropBlockNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
const foodAnimalNames = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit']);
const passiveWaterFoodNames = new Set(['cod', 'salmon']);
const forbiddenHuntNames = new Set(['player', 'villager', 'iron_golem', 'wolf', 'cat', 'horse', 'donkey', 'mule', 'llama', 'camel', 'fox', 'bee', 'panda', 'turtle']);
// Countable edible inventory (skip non-food kelp stalks; prefer dried_kelp).
const foodInventoryNames = [
  ...safeFoodPriority,
  ...emergencyFoodPriority.filter((name) => name !== 'kelp'),
  ...goldenAppleNames
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExpectedPathInterrupt(error) {
  const message = String(error?.message || error || '');
  return message.includes('GoalChanged') ||
    message.includes('goal was changed') ||
    message.includes('Path was stopped') ||
    message.includes('cancelled') ||
    message.includes('Canceled');
}

function result(ok, message, extra = {}) {
  return { ok, success: ok, ...extra, message };
}

function entityName(entity) {
  const raw = String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
  return raw.includes('.') ? raw.split('.').pop() : raw;
}

function trackedEntity(bot, entity) {
  if (!entity || entity.id === undefined || entity.id === null || !bot.entities) return entity || null;
  return Object.prototype.hasOwnProperty.call(bot.entities, entity.id) ? bot.entities[entity.id] : null;
}

function point(pos) {
  if (!pos) return null;
  return { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)) };
}

function distance(bot, pos) {
  if (!bot.entity || !pos) return Infinity;
  return bot.entity.position.distanceTo(pos);
}

function ownerEntity(bot, config = {}) {
  return bot.players?.[config.ownerUsername]?.entity || null;
}

function tooFarFromOwner(bot, config = {}, pos = bot.entity?.position) {
  const owner = ownerEntity(bot, config);
  if (!owner || !pos) return false;
  return owner.position.distanceTo(pos) > (config.maxFoodDistanceFromOwner ?? 32);
}

async function returnNearOwner(bot, config = {}) {
  if (!config.returnToOwnerAfterFoodTask) return false;
  const owner = ownerEntity(bot, config);
  if (!owner || !bot.pathfinder) return false;
  try {
    await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, config.followDistance ?? 3));
    return true;
  } catch (error) {
    if (isExpectedPathInterrupt(error)) {
      console.warn(`[food] return to owner interrupted: ${error.message}`);
      return false;
    }
    throw error;
  }
}

function countAny(bot, names) {
  return names.reduce((sum, name) => sum + countItem(bot, name), 0);
}

function allFoodNames() {
  return [...safeFoodPriority, ...emergencyFoodPriority, ...riskyFoodPriority, ...goldenAppleNames];
}

function foodCategory(itemName) {
  if (safeFoods.has(itemName)) return 'safe';
  if (emergencyFoods.has(itemName)) return 'emergency';
  if (riskyFoods.has(itemName)) return 'risky';
  if (goldenAppleNames.has(itemName)) return 'golden_apple';
  return null;
}

function inventoryItems(bot) {
  return bot.inventory?.items?.() || [];
}

function itemByName(bot, itemName) {
  return bot.registry?.itemsByName?.[itemName] || null;
}

function usableFuel(bot) {
  const logs = countAny(bot, logFuelNames);
  for (const name of fuelPriority) {
    const count = countItem(bot, name);
    if (count <= 0) continue;
    if (logFuelNames.includes(name) && logs <= 2) continue;
    return { name, item: itemByName(bot, name), count };
  }
  return null;
}

function findBlocksByNames(bot, names, maxDistance = 32, count = 24) {
  if (!bot.registry || !bot.entity) return [];
  const ids = names.map((name) => bot.registry.blocksByName[name]?.id).filter(Boolean);
  if (ids.length === 0) return [];
  return bot.findBlocks({ matching: ids, maxDistance, count })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)
    .map((block) => ({ name: block.name, block, position: point(block.position), distance: Number(distance(bot, block.position).toFixed(1)) }))
    .sort((a, b) => a.distance - b.distance);
}

function isMatureCrop(block) {
  if (!block) return false;
  if (block.name === 'sweet_berry_bush') return (block.getProperties?.().age ?? 0) >= 2;
  if (['wheat', 'carrots', 'potatoes', 'beetroots'].includes(block.name)) return (block.getProperties?.().age ?? 0) >= 7;
  return true;
}

function canAttackFoodAnimal(entity, config = {}) {
  const name = entityName(entity);
  if (!foodAnimalNames.has(name)) return { ok: false, reason: `${name} is not a food animal` };
  if (forbiddenHuntNames.has(name)) return { ok: false, reason: `${name} is protected` };
  if (config.doNotKillNamedMobs && (entity.customName || entity.displayName?.extra?.length)) return { ok: false, reason: 'named mob protected' };
  if (entity.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0)) return { ok: false, reason: 'baby animal protected' };
  return { ok: true, reason: 'safe food animal' };
}

export function countFoodInventory(bot) {
  const wanted = new Set(foodInventoryNames);
  return inventoryItems(bot)
    .filter((item) => wanted.has(item.name))
    .reduce((sum, item) => sum + Number(item.count || 1), 0);
}

export function getFoodItems(bot) {
  return inventoryItems(bot)
    .filter((item) => allFoodNames().includes(item.name))
    .map((item) => ({ item, name: item.name, count: item.count, category: foodCategory(item.name) }));
}

export function getBestFood(bot, options = {}) {
  const food = bot.food ?? 20;
  const critical = food <= (options.criticalFoodLevel ?? 8);
  const allowRisky = Boolean(options.allowRisky || critical);
  const allowGoldenApple = Boolean(options.allowGoldenApple);
  const priorities = [
    ...safeFoodPriority.filter((name) => name !== 'golden_carrot'),
    ...(critical ? emergencyFoodPriority : ['sweet_berries', 'glow_berries']),
    ...(allowRisky ? riskyFoodPriority.filter((name) => options.allowPufferfish || name !== 'pufferfish') : [])
  ];

  if (allowGoldenApple) priorities.unshift('golden_apple', 'enchanted_golden_apple');

  for (const name of priorities) {
    const item = findInventoryItem(bot, name);
    if (item) return item;
  }

  return null;
}

export function foodStatus(bot, config = {}) {
  const food = bot.food ?? 20;
  const foodItems = getFoodItems(bot);
  const rawFoodCount = countAny(bot, Object.keys(cookableConversions));
  const cookableFoodCount = rawFoodCount;
  const bestFood = getBestFood(bot, config)?.name || null;

  return {
    food,
    saturation: bot.foodSaturation ?? null,
    safeFoodCount: foodItems.filter((entry) => entry.category === 'safe').reduce((sum, entry) => sum + entry.count, 0),
    riskyFoodCount: foodItems.filter((entry) => entry.category === 'risky').reduce((sum, entry) => sum + entry.count, 0),
    rawFoodCount,
    cookableFoodCount,
    bestFood,
    hasFood: Boolean(bestFood),
    lowFood: food < (config.minFoodBeforeEating ?? 18),
    criticalFood: food <= (config.criticalFoodLevel ?? 8)
  };
}

export function foodStatusText(bot, config = {}) {
  const status = foodStatus(bot, config);
  const cooked = status.safeFoodCount;
  return `Hunger: ${status.food}/20. Best food: ${status.bestFood || 'none'}. Cooked/safe food: ${cooked}. Raw food: ${status.rawFoodCount}. Can cook: ${canCookFood(bot)}.`;
}

export async function eatIfHungry(bot, options = {}) {
  const config = options.config || options;
  const direct = Boolean(options.direct);
  const minFood = options.recovery ? 20 : (config.minFoodBeforeEating ?? 18);
  const criticalFood = config.criticalFoodLevel ?? 8;

  if ((bot.food ?? 20) >= minFood) {
    return result(false, direct ? "I'm not hungry right now." : 'Not hungry.');
  }

  const bestFood = getBestFood(bot, {
    criticalFoodLevel: criticalFood,
    allowRisky: (bot.food ?? 20) <= criticalFood,
    allowPufferfish: Boolean(options.allowPufferfish),
    allowGoldenApple: Boolean(options.allowGoldenApple)
  });

  if (!bestFood) return result(false, 'I do not have safe food to eat.');
  if (goldenAppleNames.has(bestFood.name) && !options.allowGoldenApple) return result(false, 'I will not eat golden apples unless you directly command it.');
  if (riskyFoods.has(bestFood.name) && (bot.food ?? 20) > criticalFood) return result(false, 'I will not eat risky food unless hunger is critical.');

  try {
    console.log(`[food] eating ${bestFood.name}, hunger=${bot.food}`);
    await bot.equip(bestFood, 'hand');
    await bot.consume();
    return result(true, `Ate ${bestFood.name}.`, { itemName: bestFood.name });
  } catch (error) {
    console.warn(`[food] eat failed: ${error.message}`);
    return result(false, `I could not eat ${bestFood.name}: ${error.message}`);
  }
}

export function findNearbyFoodSources(bot, options = {}) {
  const config = options.config || options;
  const maxDistance = config.maxFoodSearchDistance ?? 32;
  const animals = Object.values(bot.entities || {})
    .filter((entity) => entity !== bot.entity)
    .map((entity) => ({ entity, name: entityName(entity), position: point(entity.position), distance: Number(distance(bot, entity.position).toFixed(1)) }))
    .filter((entry) => entry.distance <= maxDistance && (foodAnimalNames.has(entry.name) || passiveWaterFoodNames.has(entry.name)))
    .sort((a, b) => a.distance - b.distance);

  const crops = config.allowCropHarvesting ? findBlocksByNames(bot, cropBlockNames, maxDistance, 24).filter((entry) => isMatureCrop(entry.block)) : [];
  const plants = findBlocksByNames(bot, plantBlockNames, maxDistance, 24)
    .filter((entry) => !['melon', 'pumpkin'].includes(entry.name) || config.allowCropHarvesting)
    .filter((entry) => ['sweet_berry_bush', 'cave_vines'].includes(entry.name) ? isMatureCrop(entry.block) : true);
  const all = [...plants.map((entry) => ({ ...entry, kind: 'plant' })), ...crops.map((entry) => ({ ...entry, kind: 'crop' })), ...animals.map((entry) => ({ ...entry, kind: 'animal' }))];

  return {
    animals,
    crops,
    plants,
    nearestFoodSource: all.sort((a, b) => a.distance - b.distance)[0] || null
  };
}

export async function gatherPlantFood(bot, options = {}) {
  const config = options.config || options;
  if (options.shouldStop?.()) return result(false, 'Stopped gathering food.');
  const sources = findNearbyFoodSources(bot, config);
  const candidates = [...sources.plants, ...(config.allowCropHarvesting ? sources.crops : [])]
    .filter((entry) => !tooFarFromOwner(bot, config, entry.block.position));

  if (candidates.length === 0) return result(false, 'I could not find safe plant food nearby.');

  const target = candidates[0];
  console.log(`[food] gathering plant food ${target.name} at ${target.position.x},${target.position.y},${target.position.z}`);

  try {
    if (options.shouldStop?.()) return result(false, 'Stopped gathering food.');
    await bot.pathfinder.goto(new GoalNear(target.block.position.x, target.block.position.y, target.block.position.z, 1));
    if (options.shouldStop?.()) return result(false, 'Stopped gathering food.');
    if (target.name === 'sweet_berry_bush') {
      await bot.activateBlock(target.block);
    } else if (target.name === 'cave_vines') {
      await bot.activateBlock(target.block);
    } else {
      await bot.dig(target.block);
    }
    if (options.shouldStop?.()) return result(false, 'Stopped gathering food.');
    await wait(700);
    if (config.returnToOwnerAfterFoodTask) await returnNearOwner(bot, config);
    return result(true, `Gathered ${target.name}.`);
  } catch (error) {
    console.warn(`[food] gatherPlantFood failed: ${error.message}`);
    return result(false, `I could not gather ${target.name}: ${error.message}`);
  }
}

export async function huntPassiveFoodAnimal(bot, options = {}) {
  const config = options.config || options;
  if (!config.allowPassiveHunting) return result(false, 'Passive hunting is disabled.');
  if (options.shouldStop?.()) return result(false, 'Stopped hunting.');

  let kills = 0;
  let unconfirmed = 0;
  const maxKills = Math.max(1, Math.min(8, Number(options.maxKills || options.targetKills || config.maxPassiveHuntKills || 2)));
  const maxSwings = Math.max(3, Number(options.maxSwings || config.maxPassiveHuntSwings || 24));
  const swingDelayMs = Math.max(0, Number(options.swingDelayMs ?? 650));
  const confirmDelayMs = Math.max(0, Number(options.confirmDelayMs ?? 250));
  const confirmChecks = Math.max(1, Number(options.confirmChecks ?? 6));
  const wantedAnimals = Array.isArray(options.animalTypes) && options.animalTypes.length
    ? new Set(options.animalTypes.map((name) => entityName({ name })))
    : null;
  let stoppedOnUnconfirmed = false;
  let lastMissingReason = 'I could not find a safe passive food animal nearby.';

  while (kills < maxKills) {
    if (options.shouldStop?.()) return result(false, 'Stopped hunting.');
    const sources = findNearbyFoodSources(bot, config);
    const target = sources.animals
      .filter((entry) => foodAnimalNames.has(entry.name))
      .filter((entry) => !wantedAnimals || wantedAnimals.has(entry.name))
      .filter((entry) => canAttackFoodAnimal(entry.entity, config).ok)
      .filter((entry) => !tooFarFromOwner(bot, config, entry.entity.position))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!target) {
      if (wantedAnimals) lastMissingReason = `I could not find a safe ${[...wantedAnimals].join('/')} nearby.`;
      break;
    }

    console.log(`[food] hunting ${target.name} at ${target.position.x},${target.position.y},${target.position.z}`);
    try {
      await bot.pathfinder.goto(new GoalNear(target.entity.position.x, target.entity.position.y, target.entity.position.z, 2));
      let swings = 0;
      let confirmedDead = false;
      while (swings < maxSwings) {
        if (options.shouldStop?.()) return result(false, 'Stopped hunting.');
        const liveEntity = trackedEntity(bot, target.entity);
        const hasHealth = typeof liveEntity?.health === 'number';
        const dead = !liveEntity || liveEntity.isValid === false || (hasHealth && liveEntity.health <= 0);
        if (dead) {
          confirmedDead = true;
          break;
        }
        if (liveEntity.position && distance(bot, liveEntity.position) > 3) {
          await bot.pathfinder.goto(new GoalNear(liveEntity.position.x, liveEntity.position.y, liveEntity.position.z, 2));
        }
        bot.attack(liveEntity);
        swings += 1;
        await wait(swingDelayMs);
      }

      for (let i = 0; i < confirmChecks && !confirmedDead; i += 1) {
        const liveEntity = trackedEntity(bot, target.entity);
        const hasHealth = typeof liveEntity?.health === 'number';
        confirmedDead = !liveEntity || liveEntity.isValid === false || (hasHealth && liveEntity.health <= 0);
        if (!confirmedDead) await wait(confirmDelayMs);
      }

      if (confirmedDead) {
        kills += 1;
        await collectNearbyDrops(bot);
      } else {
        unconfirmed += 1;
        stoppedOnUnconfirmed = true;
        console.warn(`[food] hunt could not confirm ${target.name} kill after ${swings} swings`);
        break;
      }
    } catch (error) {
      console.warn(`[food] hunt failed: ${error.message}`);
      lastMissingReason = `I could not hunt ${target.name}: ${error.message}`;
      break;
    }
  }

  if (config.returnToOwnerAfterFoodTask) await returnNearOwner(bot, config);
  if (kills > 0) {
    const extra = unconfirmed > 0 ? ` I stopped after one unconfirmed target instead of switching animals.` : '';
    return result(true, `Hunted ${kills} passive food animal(s).${extra}`, { kills, unconfirmed, stoppedOnUnconfirmed });
  }
  if (unconfirmed > 0) return result(false, 'I attacked a passive food animal but could not confirm the kill, so I stopped instead of moving to another animal.', { kills, unconfirmed, stoppedOnUnconfirmed });
  return result(false, lastMissingReason || 'I could not hunt food safely.', { kills, unconfirmed, stoppedOnUnconfirmed });
}

export async function collectNearbyDrops(bot) {
  const item = bot.nearestEntity((entity) => entity.name === 'item' && distance(bot, entity.position) < 8);
  if (!item) return result(true, 'No nearby drops.');
  try {
    await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
  } catch (error) {
    if (isExpectedPathInterrupt(error)) {
      console.warn(`[food] drop collection interrupted: ${error.message}`);
      return result(false, 'Drop collection was interrupted.', { interrupted: true });
    }
    throw error;
  }
  await wait(600);
  return result(true, 'Collected nearby drops.');
}

export function findNearbyFurnace(bot, maxDistance = 12) {
  return sharedFindNearbyFurnace(bot, maxDistance);
}

async function placeFurnace(bot, config = {}) {
  return sharedFindOrPlaceFurnace(bot, {
    config,
    source: 'food',
    maxDistance: 12,
    shouldStop: config.shouldStop
  });
}

export function canCookFood(bot) {
  return countAny(bot, Object.keys(cookableConversions)) > 0 && Boolean(usableFuel(bot) || findNearbyFurnace(bot));
}

export async function cookFood(bot, options = {}) {
  const config = options.config || options;
  if (options.shouldStop?.()) return result(false, 'Stopped cooking.');
  if (!config.cookFoodEnabled && config.cookFoodEnabled !== undefined) return result(false, 'Cooking food is disabled.');
  const rawName = Object.keys(cookableConversions).find((name) => countItem(bot, name) > 0);
  if (!rawName) return result(false, 'I do not have raw food to cook.');

  const fuel = usableFuel(bot);
  if (!fuel?.item) return result(false, 'I need safe fuel to cook food.');
  const outputName = cookableConversions[rawName];
  const rawBefore = countItem(bot, rawName);
  const cookedBefore = countItem(bot, outputName);

  const furnaceResult = await placeFurnace(bot, config);
  if (!furnaceResult.ok) return furnaceResult;

  try {
    console.log(`[food] cooking ${rawName} with ${fuel.name}`);
    const furnace = await bot.openFurnace(furnaceResult.block);
    if (options.shouldStop?.()) {
      bot.closeWindow(furnace);
      return result(false, 'Stopped cooking.');
    }
    const rawItem = itemByName(bot, rawName);
    await furnace.putInput(rawItem.id, null, 1);
    if (options.shouldStop?.()) {
      bot.closeWindow(furnace);
      return result(false, 'Stopped cooking.');
    }
    await furnace.putFuel(fuel.item.id, null, 1);

    const start = Date.now();
    while (!furnace.outputItem() && Date.now() - start < (options.timeoutMs || 45000)) {
      if (options.shouldStop?.()) {
        bot.closeWindow(furnace);
        return result(false, 'Stopped cooking.');
      }
      await wait(500);
    }

    if (!furnace.outputItem()) {
      bot.closeWindow(furnace);
      const rawAfter = countItem(bot, rawName);
      const cookedAfter = countItem(bot, outputName);
      if (cookedAfter > cookedBefore) {
        return result(true, `Cooked ${rawName} into ${outputName}.`, {
          output: outputName,
          partial: false,
          rawBefore,
          rawAfter,
          cookedBefore,
          cookedAfter,
          furnaceBlock: furnaceResult.block
        });
      }
      if (rawAfter < rawBefore) {
        return result(true, `Started cooking ${rawName}; it is still finishing in the furnace.`, {
          output: outputName,
          partial: true,
          rawBefore,
          rawAfter,
          cookedBefore,
          cookedAfter,
          furnaceBlock: furnaceResult.block
        });
      }
      return result(false, 'Cooking timed out before food finished.');
    }

    const output = await furnace.takeOutput();
    bot.closeWindow(furnace);
    return result(true, `Cooked ${rawName} into ${output?.name || outputName}.`, { output: output?.name || outputName, furnaceBlock: furnaceResult.block });
  } catch (error) {
    console.warn(`[food] cookFood failed: ${error.message}`);
    return result(false, `I could not cook food: ${error.message}`);
  }
}

export async function craftFood(bot, foodName) {
  const requested = String(foodName || 'bread').trim().toLowerCase().replace(/\s+/g, '_');
  const supported = new Set(['bread', 'mushroom_stew', 'beetroot_soup', 'pumpkin_pie']);
  if (!supported.has(requested)) return result(false, `I cannot craft ${requested} yet.`);
  console.log(`[food] craftFood attempt ${requested}`);
  const item = itemByName(bot, requested);
  const needsTable = item && bot.recipesFor(item.id, null, 1, true).length > 0 && bot.recipesFor(item.id, null, 1, null).length === 0;
  if (needsTable && !findNearbyCraftingTable(bot)) {
    const table = await placeCraftingTable(bot);
    if (!table.ok) return result(false, `I need a crafting table nearby to craft ${requested}.`);
  }
  const crafted = await craftItem(bot, requested, 1);
  if (!crafted.ok) return result(false, `I could not craft ${requested}: ${crafted.message}`);
  return result(true, `Crafted ${requested}.`);
}

export function findNearbyFishingWater(bot, maxDistance = 8) {
  if (!bot?.entity?.position || typeof bot.findBlocks !== 'function' || typeof bot.blockAt !== 'function') return null;
  const waterId = bot.registry?.blocksByName?.water?.id;
  const matching = waterId === undefined ? (block) => block?.name === 'water' : waterId;
  let positions = [];
  try {
    positions = bot.findBlocks({ matching, maxDistance, count: 64 }) || [];
  } catch {
    return null;
  }
  const passableAbove = new Set(['air', 'cave_air', 'void_air', 'short_grass', 'tall_grass']);
  return positions
    .map((position) => bot.blockAt(position))
    .filter((block) => block?.name === 'water')
    .filter((block) => {
      const above = bot.blockAt(block.position.offset(0, 1, 0));
      return !above || passableAbove.has(above.name);
    })
    .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0] || null;
}

export async function fishForFood(bot, options = {}) {
  const config = options.config || options;
  if (!config.allowFishing) return result(false, 'Fishing is disabled.');
  const rod = findInventoryItem(bot, 'fishing_rod');
  if (!rod) return result(false, 'I need a fishing rod to fish.');
  if (typeof bot.fish !== 'function') return result(false, 'Fishing is unavailable in this bot runtime.');
  const water = findNearbyFishingWater(bot, Number(config.fishingWaterSearchRadius || 8));
  if (!water) return result(false, 'I need to stand beside open water before I can fish safely.');

  let stopPoll = null;
  let timeout = null;
  try {
    console.log('[food] fishing for food');
    if (options.shouldStop?.()) return result(false, 'Stopped fishing.');
    await bot.equip(rod, 'hand');
    if (typeof bot.lookAt === 'function') {
      const aim = water.position.offset(0.5, 1, 0.5);
      await bot.lookAt(aim, true);
    }
    const stopPromise = new Promise((resolve, reject) => {
      stopPoll = setInterval(() => {
        if (!options.shouldStop?.()) return;
        try { bot.deactivateItem?.(); } catch { /* no active cast */ }
        reject(new Error('Stopped fishing.'));
      }, 200);
    });
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        try { bot.deactivateItem?.(); } catch { /* no active cast */ }
        reject(new Error('fishing timed out'));
      }, Number(options.timeoutMs || config.fishingCastTimeoutMs || 45000));
    });
    const races = [
      bot.fish(),
      timeoutPromise
    ];
    if (options.shouldStop) races.push(stopPromise);
    await Promise.race(races);
    const returnToOwner = options.returnToOwner ?? config.returnToOwnerAfterFoodTask;
    if (returnToOwner) await returnNearOwner(bot, config);
    return result(true, 'Caught something while fishing.', { waterPosition: point(water.position) });
  } catch (error) {
    try { bot.deactivateItem?.(); } catch { /* no active cast */ }
    const expectedStop = /stopped fishing|fishing cancel(?:l)?ed/i.test(error.message || '');
    if (!expectedStop) console.warn(`[food] fish failed: ${error.message}`);
    return result(false, `I could not fish: ${error.message}`);
  } finally {
    if (stopPoll) clearInterval(stopPoll);
    if (timeout) clearTimeout(timeout);
  }
}

export async function findFood(bot, options = {}) {
  const config = options.config || options;
  const status = foodStatus(bot, config);
  const targetCount = Math.max(1, Number(options.targetCount || config.minimumFoodCount || 6));
  const currentCount = countFoodInventory(bot);
  if (currentCount >= targetCount && !status.lowFood) return result(true, `I already have enough food (${currentCount}/${targetCount}). Say "tj eat" if you want me to eat it.`, { count: currentCount, target: targetCount });

  if (status.rawFoodCount > 0 && config.cookFoodEnabled) {
    const cooked = await cookFood(bot, { config, shouldStop: options.shouldStop });
    if (cooked.ok) return cooked;
  }

  const plants = await gatherPlantFood(bot, { config, shouldStop: options.shouldStop });
  if (plants.ok) return plants;

  if (config.allowPassiveHunting || status.criticalFood) {
    const needed = Math.max(1, targetCount - currentCount);
    const hunted = await huntPassiveFoodAnimal(bot, {
      config,
      shouldStop: options.shouldStop,
      maxKills: Math.min(status.criticalFood ? 4 : 3, needed)
    });
    if (hunted.ok) return hunted;
  }

  if (config.allowFishing) {
    const fished = await fishForFood(bot, { config, shouldStop: options.shouldStop });
    if (fished.ok) return fished;
  }

  return result(false, "I couldn't find food nearby.");
}

export async function makeFood(bot, options = {}) {
  const config = options.config || options;
  if (countItem(bot, 'wheat') >= 3) return craftFood(bot, 'bread');
  for (const candidate of ['pumpkin_pie', 'mushroom_stew', 'beetroot_soup']) {
    const crafted = await craftFood(bot, candidate);
    if (crafted.ok) return crafted;
  }
  if (countAny(bot, Object.keys(cookableConversions)) > 0) return cookFood(bot, { config });
  return result(false, 'I do not have ingredients to make food.');
}

function cleanFoodToken(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\b(your|my|our|the|some|a|an|of|please|more)\b/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Canonical item id, or 'food' for generic, or null if unknown. */
export function normalizeFoodName(raw) {
  const cleaned = cleanFoodToken(raw);
  if (!cleaned) return null;
  if (FOOD_ITEM_ALIASES[cleaned]) return FOOD_ITEM_ALIASES[cleaned];
  const underscored = cleaned.replace(/\s+/g, '_');
  if (FOOD_ITEM_ALIASES[underscored]) return FOOD_ITEM_ALIASES[underscored];
  if (allFoodNames().includes(underscored)) return underscored;
  if (allFoodNames().includes(cleaned)) return cleaned;
  return null;
}

/** True if this is a known edible (including generic "food"). */
export function isKnownFood(raw) {
  return Boolean(normalizeFoodName(raw));
}

/** Specific item ids TJ knows (no generic "food"). */
export function listKnownFoodItems() {
  return [...new Set([...safeFoodPriority, ...emergencyFoodPriority, ...riskyFoodPriority, ...goldenAppleNames])]
    .filter((name) => name !== 'kelp')
    .sort();
}

/** Short human-readable food knowledge summary for chat. */
export function listKnownFoods() {
  return [
    'any food / meat / snack',
    'cooked: steak, porkchop, mutton, chicken, rabbit, cod, salmon',
    'raw: beef, pork, mutton, chicken, rabbit, fish',
    'crops: bread, apple, carrot, potato, baked potato, beetroot, melon, berries',
    'crafted: cookie, pumpkin pie, mushroom stew, beetroot soup, rabbit stew, dried kelp, honey',
    'special: golden carrot, golden apple (won\'t auto-eat goldens)'
  ];
}

export function foodCategoryForName(itemName) {
  return foodCategory(itemName);
}

export function countSpecificFood(bot, itemName) {
  const normalized = normalizeFoodName(itemName);
  if (!normalized || normalized === 'food') return countFoodInventory(bot);
  // Count preferred item plus its cooked form when applicable.
  let total = countItem(bot, normalized);
  if (cookableConversions[normalized]) total += countItem(bot, cookableConversions[normalized]);
  return total;
}

export {
  cookableConversions,
  safeFoodPriority,
  emergencyFoodPriority,
  riskyFoodPriority,
  FOOD_ITEM_ALIASES
};
