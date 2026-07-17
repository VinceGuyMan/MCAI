import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as crafting from './crafting.js';
import * as homeBase from './homeBase.js';
import * as placement from './placement.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function relativeHome(memory, relative) {
  const home = homeBase.getHome(memory);
  if (!home) return null;
  return new Vec3(home.x + relative.x, home.y + relative.y, home.z + relative.z);
}

function itemInInventory(bot, itemName) {
  const name = normalize(itemName);
  return bot.inventory?.items?.().find((item) => item.name === name) || null;
}

function recordKnownBlock(memory, blockName, position) {
  const pos = point(position);
  if (!pos) return;
  const patch = {};
  const push = (key) => {
    const current = memory.get()[key] || [];
    const next = current.filter((entry) => !(entry.x === pos.x && entry.y === pos.y && entry.z === pos.z));
    next.unshift({ ...pos, at: Date.now() });
    patch[key] = next.slice(0, 24);
  };

  if (blockName === 'chest') push('knownStorageChests');
  else if (blockName === 'crafting_table') push('knownCraftingTables');
  else if (blockName === 'furnace') push('knownFurnaces');
  else if (blockName.endsWith('_bed')) push('knownBeds');
  else if (blockName === 'torch') push('knownTorchPositions');
  else push('knownCampBlocks');

  memory.update(patch);
}

async function ensurePlaceableItem(bot, blockName, options = {}) {
  let name = normalize(blockName);
  if (name === 'bed') {
    name = bot.inventory?.items?.().find((item) => item.name.endsWith('_bed'))?.name || crafting.resolveCraftItemName(bot, 'bed');
  } else if (['door', 'trapdoor', 'fence', 'fence_gate', 'sign', 'slab', 'stairs', 'boat'].includes(name)) {
    name = crafting.resolveCraftItemName(bot, name);
  }

  if (itemInInventory(bot, name)) return { ok: true, itemName: name };

  const craftable = ['crafting_table', 'furnace', 'chest', 'torch', 'bed', 'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door', 'mangrove_door', 'cherry_door'];
  if (craftable.includes(name) || blockName === 'door') {
    const crafted = await crafting.craftItem(bot, name, 1, { ...options, direct: true });
    if (!crafted.ok && !itemInInventory(bot, name)) return crafted;
  }

  return itemInInventory(bot, name)
    ? { ok: true, itemName: name }
    : { ok: false, message: `I do not have ${name} to place.` };
}

async function placeBlockAt(bot, memory, blockName, position, options = {}) {
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped building.' };
  const ensured = await ensurePlaceableItem(bot, blockName, options);
  if (!ensured.ok) return ensured;

  if (bot.entity?.position && bot.entity.position.distanceTo(position) > 3.5 && bot.pathfinder?.goto) {
    await bot.pathfinder.goto(new GoalNear(position.x, position.y, position.z, 3));
  }

  const safe = placement.canPlaceBlockHere(bot, position, {
    ownerUsername: options.ownerUsername,
    blockName: ensured.itemName
  });
  if (!safe.ok) return { ok: false, message: `Could not place ${ensured.itemName}: ${safe.reason}.` };

  const item = itemInInventory(bot, ensured.itemName);
  const reference = bot.blockAt(position.offset(0, -1, 0));
  if (!item || !reference) return { ok: false, message: `I could not place ${ensured.itemName}.` };

  try {
    console.log(`[builder] placing ${ensured.itemName} at ${position.x},${position.y},${position.z}`);
    await bot.equip(item, 'hand');
    await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
    if (bot._placeBlockWithOptions) {
      await bot._placeBlockWithOptions(reference, new Vec3(0, 1, 0), { swingArm: 'right', forceLook: true });
    } else {
      await bot.placeBlock(reference, new Vec3(0, 1, 0));
    }
    await wait(500);
    recordKnownBlock(memory, ensured.itemName, position);
    return { ok: true, message: `Placed ${ensured.itemName}.`, position: point(position) };
  } catch (error) {
    console.warn(`[builder] place ${ensured.itemName} failed: ${error.message}`);
    return { ok: false, message: `I could not place ${ensured.itemName}: ${error.message}` };
  }
}

export function canBuildAt(bot, position, options = {}) {
  return placement.canPlaceBlockHere(bot, position, {
    ownerUsername: options.ownerUsername,
    blockName: options.blockName || 'dirt'
  });
}

export async function placeKnownBlock(bot, memory, blockName, relativePosition, options = {}) {
  const pos = relativeHome(memory, relativePosition);
  if (!pos) return { ok: false, message: 'I do not have a home set.' };
  return placeBlockAt(bot, memory, blockName, pos, options);
}

export function getAvailableBuildingMaterial(bot) {
  const preferred = [
    'cobblestone',
    'dirt',
    'oak_planks',
    'spruce_planks',
    'birch_planks',
    'jungle_planks',
    'acacia_planks',
    'dark_oak_planks',
    'mangrove_planks',
    'cherry_planks'
  ];
  return preferred.find((name) => crafting.countItem(bot, name) > 0) || null;
}

export async function buildTorchRing(bot, memory, options = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first.' };
  if (/nether|end/.test(String(bot.game?.dimension || ''))) return { ok: false, message: 'I should not place home torches in this dimension.' };
  const ring = [
    { x: 4, y: 0, z: 0 },
    { x: -4, y: 0, z: 0 },
    { x: 0, y: 0, z: 4 },
    { x: 0, y: 0, z: -4 },
    { x: 3, y: 0, z: 3 },
    { x: -3, y: 0, z: 3 },
    { x: 3, y: 0, z: -3 },
    { x: -3, y: 0, z: -3 }
  ];
  const placed = [];
  const failed = [];
  for (const rel of ring) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped lighting home.' };
    if (crafting.countItem(bot, 'torch') <= 0) break;
    const result = await placeKnownBlock(bot, memory, 'torch', rel, options);
    if (result.ok) placed.push(result.position);
    else failed.push(result.message);
  }
  return {
    ok: placed.length > 0,
    message: placed.length ? `Placed ${placed.length} home torch(es).` : `I could not place home torches: ${failed[0] || 'no torches or safe spots'}.`,
    placed
  };
}

export async function buildWorkstationArea(bot, memory, options = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first.' };
  const steps = [
    ['crafting_table', { x: 2, y: 0, z: 0 }],
    ['furnace', { x: 2, y: 0, z: 1 }],
    ['chest', { x: 2, y: 0, z: -1 }],
    ['bed', { x: -2, y: 0, z: 0 }]
  ];
  const notes = [];
  for (const [name, rel] of steps) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped building workstation.' };
    if (name === 'bed' && /nether|end/.test(String(bot.game?.dimension || ''))) {
      notes.push('Skipped bed in this dimension.');
      continue;
    }
    const result = await placeKnownBlock(bot, memory, name, rel, options);
    notes.push(result.message);
  }
  return { ok: true, message: `Workstation area: ${notes.join(' ')}` };
}

export async function buildCamp(bot, memory, options = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first.' };
  const workstation = await buildWorkstationArea(bot, memory, options);
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped building camp.' };
  const torches = await buildTorchRing(bot, memory, options);
  memory.update({
    baseBuildHistory: [
      { type: 'camp', at: Date.now(), workstation: workstation.ok, torches: torches.ok },
      ...(memory.get().baseBuildHistory || [])
    ].slice(0, 20)
  });
  return { ok: workstation.ok || torches.ok, message: `Camp: ${workstation.message} ${torches.message}` };
}

export async function buildSimpleFloor(bot, memory, material = null, options = {}) {
  const chosen = normalize(material || getAvailableBuildingMaterial(bot));
  if (!chosen) return { ok: false, message: 'I need blocks for a small floor.' };
  const placed = [];
  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) {
      if (options.shouldStop?.()) return { ok: false, message: 'Stopped floor building.' };
      const pos = relativeHome(memory, { x, y: -1, z });
      if (!pos) return { ok: false, message: 'I do not have a home set.' };
      const block = bot.blockAt(pos);
      if (block && block.boundingBox === 'block') continue;
      const result = await placeBlockAt(bot, memory, chosen, pos, options);
      if (result.ok) placed.push(result.position);
      if (crafting.countItem(bot, chosen) <= 0) break;
    }
  }
  return { ok: placed.length > 0, message: placed.length ? `Placed ${placed.length} floor blocks.` : 'The floor area already looks solid or I lack blocks.', placed };
}

export async function buildBasicShelter(bot, memory, options = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first.' };
  const material = getAvailableBuildingMaterial(bot);
  if (!material) return { ok: false, message: 'I need cobblestone, dirt, or planks to build a small shelter.' };
  const placed = [];
  await buildSimpleFloor(bot, memory, material, options);

  const positions = [];
  for (let y = 0; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      positions.push({ x, y, z: -2 });
      positions.push({ x, y, z: 2 });
    }
    for (let z = -1; z <= 1; z += 1) {
      positions.push({ x: -2, y, z });
      positions.push({ x: 2, y, z });
    }
  }
  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) positions.push({ x, y: 3, z });
  }

  for (const rel of positions) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped shelter building.' };
    if (rel.x === 0 && rel.z === -2 && rel.y <= 1) continue;
    if (crafting.countItem(bot, material) <= 0) break;
    const result = await placeKnownBlock(bot, memory, material, rel, options);
    if (result.ok) placed.push(result.position);
  }

  const doorName = crafting.resolveCraftItemName(bot, 'door');
  if (crafting.countItem(bot, doorName) > 0 || crafting.countItem(bot, material) > 2) {
    await placeKnownBlock(bot, memory, 'door', { x: 0, y: 0, z: -2 }, options);
  }
  await buildTorchRing(bot, memory, options);
  memory.update({
    baseBuildHistory: [
      { type: 'basicShelter', at: Date.now(), blocksPlaced: placed.length, material },
      ...(memory.get().baseBuildHistory || [])
    ].slice(0, 20)
  });
  return { ok: placed.length > 0, message: `Shelter: placed ${placed.length} ${material} block(s).` };
}

export function clearSmallBuildArea(_bot, _area, options = {}) {
  if (!options.confirmed) return { ok: false, message: 'I will not clear blocks without confirmation.' };
  return { ok: false, message: 'Clearing build areas is intentionally not implemented yet.' };
}
