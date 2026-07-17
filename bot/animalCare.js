import pathfinderPkg from 'mineflayer-pathfinder';
import * as animalPens from './animalPens.js';
import * as inventory from './inventory.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

const animalFood = {
  cow: ['wheat'],
  sheep: ['wheat'],
  pig: ['carrot', 'potato', 'beetroot'],
  chicken: ['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds'],
  rabbit: ['carrot', 'golden_carrot', 'dandelion']
};

function entityName(entity) {
  return String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
}

function itemList(bot) {
  return bot.inventory?.items?.() || [];
}

function isProtectedAnimal(entity, config = {}) {
  if (!entity) return true;
  if (config.doNotKillNamedMobs && (entity.customName || entity.displayName?.extra?.length)) return true;
  if (config.doNotAttackTamedAnimals && entity.metadata?.some?.((entry) => entry?.key === 17 && entry?.value)) return true;
  if (entity.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0)) return true;
  return false;
}

export function getFoodForAnimal(animalType = 'cow') {
  return animalFood[animalPens.normalizeAnimal(animalType)] || [];
}

export function hasAnimalFood(bot, animalType) {
  return getFoodForAnimal(animalType).some((name) => inventory.countItem(bot, name) > 0);
}

export async function equipAnimalFood(bot, animalType) {
  const item = getFoodForAnimal(animalType).map((name) => itemList(bot).find((entry) => entry.name === name)).find(Boolean);
  if (!item) return { ok: false, message: `I need ${getFoodForAnimal(animalType).join(' or ')} for ${animalType}.` };
  await bot.equip(item, 'hand');
  return { ok: true, message: `Equipped ${item.name}.`, item };
}

export function findNearbyPassiveAnimals(bot, animalType = 'cow', radius = 24, options = {}) {
  const type = animalPens.normalizeAnimal(animalType);
  if (!bot.entity) return [];
  return Object.values(bot.entities || {})
    .filter((entity) => entity.type === 'mob' && entityName(entity) === type && entity.position)
    .filter((entity) => bot.entity.position.distanceTo(entity.position) <= radius)
    .filter((entity) => !isProtectedAnimal(entity, options.config))
    .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
}

export async function lureAnimalToPen(bot, memory, animalType = 'cow', options = {}) {
  if (!options.config?.allowAnimalLuring) return { ok: false, message: 'Animal luring is disabled.' };
  const type = animalPens.normalizeAnimal(animalType);
  const pen = animalPens.findAnimalPen(memory, type);
  if (!pen) return { ok: false, message: `I need a ${type} pen first.` };
  const food = await equipAnimalFood(bot, type);
  if (!food.ok) return food;
  const animal = findNearbyPassiveAnimals(bot, type, 24, options)[0];
  if (!animal) return { ok: false, message: `I do not see a safe ${type} nearby.` };
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped luring animal.' };
  await bot.pathfinder.goto(new GoalNear(animal.position.x, animal.position.y, animal.position.z, 3));
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped luring animal.' };
  await bot.pathfinder.goto(new GoalNear(pen.center.x, pen.center.y, pen.center.z, 2));
  memory.update({
    animalTaskActive: false,
    knownAnimalLocations: [{ animalType: type, position: { x: animal.position.x, y: animal.position.y, z: animal.position.z }, at: Date.now() }, ...(memory.get().knownAnimalLocations || [])].slice(0, 20)
  });
  return { ok: true, message: `Tried to lure one ${type} to its pen.` };
}

export async function feedAnimalsInPen(bot, memory, animalType = 'cow', options = {}) {
  const type = animalPens.normalizeAnimal(animalType);
  const pen = animalPens.findAnimalPen(memory, type);
  if (!pen) return { ok: false, message: `No ${type} pen registered.` };
  const food = await equipAnimalFood(bot, type);
  if (!food.ok) return food;
  if (bot.entity?.position && bot.pathfinder?.goto && bot.entity.position.distanceTo(pen.center) > (pen.size || 7)) {
    await bot.pathfinder.goto(new GoalNear(pen.center.x, pen.center.y, pen.center.z, Math.max(2, Math.floor((pen.size || 7) / 2))));
  }
  const animals = findNearbyPassiveAnimals(bot, type, pen.size || 8, options)
    .filter((entity) => Math.abs(entity.position.x - pen.center.x) <= Math.floor((pen.size || 7) / 2) && Math.abs(entity.position.z - pen.center.z) <= Math.floor((pen.size || 7) / 2));
  let fed = 0;
  for (const animal of animals.slice(0, options.limit || 2)) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped feeding animals.', fed };
    await bot.activateEntity(animal);
    fed += 1;
  }
  return { ok: fed > 0, message: fed > 0 ? `Fed ${fed} ${type}(s).` : `No ${type}s in the pen to feed.`, fed };
}

export async function breedAnimalsInPen(bot, memory, animalType = 'cow', options = {}) {
  if (!options.config?.allowAnimalBreeding) return { ok: false, message: 'Animal breeding is disabled.' };
  const type = animalPens.normalizeAnimal(animalType);
  const pen = animalPens.findAnimalPen(memory, type);
  if (!pen) return { ok: false, message: `No ${type} pen registered.` };
  const count = animalPens.countAnimalsInPen(bot, pen);
  if (count >= (options.config?.maxAnimalsPerPen || 8)) return { ok: false, message: `${type} pen is at the animal cap.` };
  const now = Date.now();
  if (!options.direct && now - (memory.get().lastBreedingAt || 0) < (options.config?.breedingCooldownMs || 300000)) {
    return { ok: false, message: 'Breeding cooldown is still active.' };
  }
  const fed = await feedAnimalsInPen(bot, memory, type, { ...options, limit: 2 });
  if (fed.ok) memory.update({ lastBreedingAt: now });
  return fed.ok ? { ...fed, message: `Breeding attempt: ${fed.message}` } : fed;
}

export async function collectEggs(bot, memory, options = {}) {
  if (!options.config?.allowEggCollection) return { ok: false, message: 'Egg collection is disabled.' };
  const collected = await inventory.collectSpecificDrop(bot, 'egg', 16, options);
  return collected;
}

export async function shearSheep(bot, memory, options = {}) {
  if (!options.config?.allowShearing) return { ok: false, message: 'Shearing is disabled.' };
  let shears = itemList(bot).find((item) => item.name === 'shears');
  if (!shears) return { ok: false, message: 'I need shears to shear sheep.' };
  await bot.equip(shears, 'hand');
  const sheep = findNearbyPassiveAnimals(bot, 'sheep', 12, options)[0];
  if (!sheep) return { ok: false, message: 'I do not see a safe sheep nearby.' };
  await bot.activateEntity(sheep);
  memory.update({ lastAnimalCareAt: Date.now() });
  return { ok: true, message: 'Sheared one sheep.' };
}

export async function milkCow(bot, memory, options = {}) {
  if (!options.config?.allowMilking) return { ok: false, message: 'Milking is disabled.' };
  const bucket = itemList(bot).find((item) => item.name === 'bucket');
  if (!bucket) return { ok: false, message: 'I need an empty bucket to milk a cow.' };
  const cow = findNearbyPassiveAnimals(bot, 'cow', 12, options)[0];
  if (!cow) return { ok: false, message: 'I do not see a safe cow nearby.' };
  await bot.equip(bucket, 'hand');
  await bot.activateEntity(cow);
  memory.update({ lastAnimalCareAt: Date.now() });
  return { ok: true, message: 'Milked one cow.' };
}

export function animalCareStatus(bot, memory) {
  const pens = animalPens.animalPenStatus(bot, memory);
  return {
    pens,
    animalFood: {
      cow: hasAnimalFood(bot, 'cow'),
      sheep: hasAnimalFood(bot, 'sheep'),
      pig: hasAnimalFood(bot, 'pig'),
      chicken: hasAnimalFood(bot, 'chicken'),
      rabbit: hasAnimalFood(bot, 'rabbit')
    }
  };
}
