import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as cropUtils from './cropUtils.js';
import * as farmStorage from './farmStorage.js';
import * as hoeTools from './hoeTools.js';
import * as homeBase from './homeBase.js';
import * as lighting from './lighting.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function areaId() {
  return `farm_${Date.now().toString(36)}`;
}

function farmCenter(bot, memory, options = {}) {
  const home = homeBase.getHome(memory);
  if (home) return { x: home.x + 7, y: home.y, z: home.z + 2 };
  return point(options.ownerPosition || bot.entity?.position);
}

function getFarm(memory, cropType = null) {
  const farms = memory.get().knownFarms || [];
  if (cropType) {
    const normalized = cropUtils.normalizeCropType(cropType);
    return farms.find((farm) => farm.cropType === normalized) || null;
  }
  return memory.get().primaryFarmArea || farms[0] || null;
}

function appendHistory(memory, entry) {
  memory.update({
    farmHistory: [entry, ...(memory.get().farmHistory || [])].slice(0, 20)
  });
}

async function gotoBlock(bot, block) {
  if (!block || !bot.pathfinder?.goto) return;
  if (bot.entity?.position?.distanceTo(block.position) <= 3) return;
  await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 2));
}

function inventoryItem(bot, itemName) {
  return bot.inventory?.items?.().find((item) => item.name === itemName) || null;
}

export function registerFarmArea(bot, memory, area) {
  const farm = {
    id: area.id || areaId(),
    cropType: cropUtils.normalizeCropType(area.cropType || 'wheat'),
    dimension: bot.game?.dimension || 'unknown',
    center: point(area.center),
    width: area.width || 5,
    length: area.length || 5,
    createdAt: area.createdAt || Date.now()
  };
  const farms = (memory.get().knownFarms || []).filter((entry) => entry.id !== farm.id);
  farms.unshift(farm);
  const cropTypes = [...new Set([farm.cropType, ...(memory.get().farmCropTypes || [])])];
  memory.update({ knownFarms: farms.slice(0, 12), primaryFarmArea: farm, farmCropTypes: cropTypes });
  return { ok: true, message: `Registered ${farm.cropType} farm at ${farm.center.x}, ${farm.center.y}, ${farm.center.z}.`, farm };
}

export function farmingStatus(bot, memory) {
  const farms = memory.get().knownFarms || [];
  const primary = getFarm(memory);
  const mature = farms.flatMap((farm) => cropUtils.findMatureCrops(bot, farm));
  const plantable = primary ? cropUtils.findPlantableFarmland(bot, primary) : [];
  return {
    farms: farms.length,
    primaryFarm: primary,
    cropTypes: memory.get().farmCropTypes || [],
    matureCrops: mature.length,
    plantableFarmland: plantable.length,
    supplies: cropUtils.getAvailableSeedsAndCrops(bot),
    farmInventory: farmStorage.getFarmInventorySummary(bot)
  };
}

export function farmingStatusText(bot, memory) {
  const status = farmingStatus(bot, memory);
  const crops = status.cropTypes.length ? status.cropTypes.join(', ') : 'none';
  return `Farming: farms ${status.farms}, crops ${crops}, mature ${status.matureCrops}, plantable ${status.plantableFarmland}, seeds wheat ${status.supplies.wheat}, carrots ${status.supplies.carrots}, potatoes ${status.supplies.potatoes}, beetroots ${status.supplies.beetroots}.`;
}

export async function findOrCreateFarm(bot, memory, options = {}) {
  const cropType = cropUtils.normalizeCropType(options.cropType || cropUtils.getPreferredCrop(bot));
  const existing = getFarm(memory, cropType) || getFarm(memory);
  if (existing) return { ok: true, message: 'Using registered farm.', farm: existing };
  return createSmallFarm(bot, memory, { ...options, cropType });
}

export async function createSmallFarm(bot, memory, options = {}) {
  if (!bot.entity) return { ok: false, message: 'I need to spawn before making a farm.' };
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first before making a farm.' };
  const cropType = cropUtils.normalizeCropType(options.cropType || cropUtils.getPreferredCrop(bot));
  const width = Math.min(options.width || options.config?.defaultFarmWidth || 5, options.config?.defaultFarmWidth || 5);
  const length = Math.min(options.length || options.config?.defaultFarmLength || 5, options.config?.defaultFarmLength || 5);
  if (width * length > (options.config?.maxFarmSize || 36) && !options.confirmed) {
    return { ok: false, message: 'That farm is bigger than my safety limit. Say "tj confirm large farm" to continue.', requiresConfirmation: true };
  }
  const center = farmCenter(bot, memory, options);
  if (!center) return { ok: false, message: 'I could not find a safe farm center.' };
  const farm = { cropType, center, width, length };
  const till = await tillFarmSoil(bot, memory, farm, options);
  if (!till.ok || (till.tilled || 0) <= 0) {
    return {
      ok: false,
      message: `I could not make a ${cropType} farm: ${till.message || 'no soil was tilled'}`,
      farm,
      till,
      planted: 0
    };
  }
  const plant = await plantCrop(bot, memory, cropType, { ...options, farm });
  if (!plant.ok || (plant.planted || 0) <= 0) {
    return {
      ok: false,
      message: `I tilled ${till.tilled} block(s), but I could not finish a ${cropType} farm: ${plant.message || 'nothing was planted'}`,
      farm,
      till,
      plant,
      planted: plant.planted || 0
    };
  }
  const registered = registerFarmArea(bot, memory, farm).farm;
  await lighting.placeTorchNear(bot, { ownerUsername: options.config?.ownerUsername, survivalMode: true }).catch(() => null);
  appendHistory(memory, { type: 'createFarm', cropType, tilled: till.tilled || 0, planted: plant.planted || 0, at: Date.now() });
  return {
    ok: true,
    message: `Created a small ${cropType} farm: tilled ${till.tilled} block(s), planted ${plant.planted} crop(s). It may grow slowly if no water is nearby.`,
    farm: registered,
    till,
    plant,
    planted: plant.planted || 0
  };
}

export async function tillFarmSoil(bot, memory, farm = null, options = {}) {
  const area = farm || getFarm(memory);
  if (!area) return { ok: false, message: 'No farm registered.' };
  const dirt = cropUtils.findFarmableDirt(bot, area).slice(0, options.maxBlocks || area.width * area.length);
  let tilled = 0;
  for (const block of dirt) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped tilling soil.', tilled };
    await gotoBlock(bot, block);
    const result = await hoeTools.tillBlock(bot, block, { ...options, throwIfCancelled: options.throwIfCancelled });
    const after = bot.blockAt(block.position);
    if (result.ok && after?.name === 'farmland') tilled += 1;
  }
  return { ok: true, message: `Tilled ${tilled} block(s).`, tilled };
}

export async function plantCrop(bot, memory, cropType = 'wheat', options = {}) {
  const crop = cropUtils.normalizeCropType(cropType);
  const farm = options.farm || getFarm(memory, crop) || getFarm(memory);
  if (!farm) return { ok: false, message: 'No farm registered.' };
  const itemName = cropUtils.getPlantableItemForCrop(crop);
  const item = inventoryItem(bot, itemName);
  if (!item) return { ok: false, message: `I need ${itemName} to plant ${crop}.` };
  const farmland = cropUtils.findPlantableFarmland(bot, farm);
  let planted = 0;
  for (const block of farmland) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped planting.', planted };
    const nextItem = inventoryItem(bot, itemName);
    if (!nextItem) break;
    await gotoBlock(bot, block);
    try {
      await bot.equip(nextItem, 'hand');
      await bot.placeBlock(block, new Vec3(0, 1, 0));
      const above = bot.blockAt(block.position.offset(0, 1, 0));
      if (cropUtils.getCropTypeFromBlock(above) === crop) planted += 1;
    } catch (error) {
      console.warn(`[farm] planting ${crop} failed at ${block.position.x},${block.position.y},${block.position.z}: ${error.message}`);
    }
  }
  if (planted > 0) memory.update({ lastPlantingAt: Date.now(), lastReplantAt: Date.now() });
  return { ok: planted > 0, message: planted > 0 ? `Planted ${planted} ${crop} crop(s).` : `No empty farmland ready for ${crop}.`, planted };
}

export async function harvestMatureCrops(bot, memory, options = {}) {
  const farms = options.farm ? [options.farm] : (memory.get().knownFarms || []);
  if (!farms.length) return { ok: false, message: 'No registered farm to harvest.' };
  let harvested = 0;
  for (const farm of farms) {
    const mature = cropUtils.findMatureCrops(bot, farm);
    for (const block of mature) {
      if (options.shouldStop?.()) return { ok: false, message: 'Stopped harvesting.', harvested };
      await gotoBlock(bot, block);
      console.log(`[farm] harvesting ${block.name} at ${block.position.x},${block.position.y},${block.position.z}`);
      await bot.dig(block);
      harvested += 1;
    }
  }
  memory.update({ lastHarvestAt: Date.now() });
  return { ok: harvested > 0, message: harvested > 0 ? `Harvested ${harvested} mature crop(s).` : 'No mature crops ready.', harvested };
}

export async function replantCrops(bot, memory, options = {}) {
  const farms = memory.get().knownFarms || [];
  let planted = 0;
  for (const farm of farms) {
    const result = await plantCrop(bot, memory, farm.cropType, { ...options, farm });
    if (result.ok) planted += result.planted || 0;
  }
  memory.update({ lastReplantAt: Date.now() });
  return { ok: planted > 0, message: planted > 0 ? `Replanted ${planted} crop(s).` : 'No crops replanted.', planted };
}

export async function maintainFarm(bot, memory, options = {}) {
  if (!options.config?.farmingEnabled) return { ok: false, message: 'Farming is disabled.' };
  memory.update({ farmTaskActive: true, lastFarmMaintenanceAt: Date.now() });
  const harvest = await harvestMatureCrops(bot, memory, options);
  const replant = options.config?.allowAutonomousReplanting !== false
    ? await replantCrops(bot, memory, options)
    : { ok: false, message: 'Replanting disabled.' };
  const store = options.config?.storeFarmOutputAfterTask
    ? await storeFarmOutput(bot, memory, options).catch((error) => ({ ok: false, message: error.message }))
    : { ok: false, message: 'Farm storage skipped.' };
  memory.update({ farmTaskActive: false });
  appendHistory(memory, { type: 'maintainFarm', harvest: harvest.harvested || 0, replant: replant.planted || 0, at: Date.now() });
  return { ok: harvest.ok || replant.ok || store.ok, message: `Farm maintenance: ${harvest.message} ${replant.message} ${store.message}` };
}

export async function waterFarmIfPossible() {
  return { ok: false, message: 'Water placement for farms is not automated yet.' };
}

export async function storeFarmOutput(bot, memory, options = {}) {
  return farmStorage.storeFarmItems(bot, memory, options);
}

export function scanNearbyCrops(bot, memory, radius = 16) {
  const farms = memory.get().knownFarms || [];
  return farms.flatMap((farm) => cropUtils.scanAreaCrops(bot, farm)).filter((entry) => {
    if (!bot.entity || !entry.position) return true;
    return bot.entity.position.distanceTo(new Vec3(entry.position.x, entry.position.y, entry.position.z)) <= radius;
  });
}

export function clearFarmTask(bot, memory) {
  memory.update({ farmTaskActive: false });
  return { ok: true, message: 'Farm task cleared.' };
}
