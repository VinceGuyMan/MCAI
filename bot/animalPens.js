import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as crafting from './crafting.js';
import * as homeBase from './homeBase.js';
import * as lighting from './lighting.js';
import * as placement from './placement.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function normalizeAnimal(animalType = 'cow') {
  const type = String(animalType || 'cow').trim().toLowerCase().replace(/\s+/g, '_');
  if (type === 'cows') return 'cow';
  if (type === 'sheeps') return 'sheep';
  if (type === 'pigs') return 'pig';
  if (type === 'chickens') return 'chicken';
  if (type === 'rabbits') return 'rabbit';
  return type;
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function penId(animalType) {
  return `${normalizeAnimal(animalType)}_pen_${Date.now().toString(36)}`;
}

function penCenter(memory, animalType, options = {}) {
  const home = homeBase.getHome(memory);
  if (!home) return null;
  const offsets = {
    cow: { x: -8, z: 6 },
    sheep: { x: -8, z: -6 },
    pig: { x: 8, z: 6 },
    chicken: { x: 8, z: -6 },
    rabbit: { x: 0, z: 10 }
  };
  const offset = offsets[normalizeAnimal(animalType)] || offsets.cow;
  return { x: home.x + offset.x, y: home.y, z: home.z + offset.z + (options.extraOffset || 0) };
}

function itemInInventory(bot, itemName) {
  return bot.inventory?.items?.().find((item) => item.name === itemName) || null;
}

async function ensureItem(bot, itemName, options = {}) {
  const resolved = crafting.resolveCraftItemName(bot, itemName, options);
  if (itemInInventory(bot, resolved)) return { ok: true, itemName: resolved };
  const crafted = await crafting.craftItem(bot, resolved, 1, { ...options, direct: true });
  if (!crafted.ok && !itemInInventory(bot, resolved)) return crafted;
  return { ok: true, itemName: resolved };
}

async function placeAt(bot, blockName, position, options = {}) {
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped pen building.' };
  const ensured = await ensureItem(bot, blockName, options);
  if (!ensured.ok) return ensured;
  if (bot.entity?.position?.distanceTo(position) > 3.5 && bot.pathfinder?.goto) {
    await bot.pathfinder.goto(new GoalNear(position.x, position.y, position.z, 3));
  }
  const safe = placement.canPlaceBlockHere(bot, position, {
    ownerUsername: options.config?.ownerUsername,
    blockName: ensured.itemName
  });
  if (!safe.ok) return { ok: false, message: safe.reason };
  const item = itemInInventory(bot, ensured.itemName);
  const reference = bot.blockAt(position.offset(0, -1, 0));
  if (!item || !reference) return { ok: false, message: `I cannot place ${ensured.itemName}.` };
  await bot.equip(item, 'hand');
  await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
  if (bot._placeBlockWithOptions) {
    await bot._placeBlockWithOptions(reference, new Vec3(0, 1, 0), { swingArm: 'right', forceLook: true });
  } else {
    await bot.placeBlock(reference, new Vec3(0, 1, 0));
  }
  return { ok: true, message: `Placed ${ensured.itemName}.`, itemName: ensured.itemName, position: point(position) };
}

export function registerAnimalPen(bot, memory, penArea, animalType = 'cow') {
  const type = normalizeAnimal(animalType || penArea.animalType);
  const pen = {
    id: penArea.id || penId(type),
    animalType: type,
    dimension: bot.game?.dimension || 'unknown',
    center: point(penArea.center),
    size: penArea.size || 7,
    gatePosition: point(penArea.gatePosition),
    createdAt: penArea.createdAt || Date.now()
  };
  const pens = (memory.get().knownAnimalPens || []).filter((entry) => entry.id !== pen.id);
  pens.unshift(pen);
  const patch = { knownAnimalPens: pens.slice(0, 12) };
  const key = `primary${type[0].toUpperCase()}${type.slice(1)}Pen`;
  patch[key] = pen;
  memory.update(patch);
  return { ok: true, message: `Registered ${type} pen.`, pen };
}

export function findAnimalPen(memory, animalType = 'cow') {
  const type = normalizeAnimal(animalType);
  const key = `primary${type[0].toUpperCase()}${type.slice(1)}Pen`;
  return memory.get()[key] || (memory.get().knownAnimalPens || []).find((pen) => pen.animalType === type) || null;
}

export function countAnimalsInPen(bot, pen) {
  if (!pen?.center) return 0;
  const half = Math.floor((pen.size || 7) / 2);
  return Object.values(bot.entities || {}).filter((entity) => {
    if (entity.type !== 'mob' || entity.name !== pen.animalType || !entity.position) return false;
    return Math.abs(entity.position.x - pen.center.x) <= half && Math.abs(entity.position.z - pen.center.z) <= half && Math.abs(entity.position.y - pen.center.y) <= 3;
  }).length;
}

export function animalPenStatus(bot, memory) {
  const pens = memory.get().knownAnimalPens || [];
  return {
    pens: pens.length,
    details: pens.map((pen) => ({ ...pen, animals: countAnimalsInPen(bot, pen) }))
  };
}

export function animalPenStatusText(bot, memory) {
  const status = animalPenStatus(bot, memory);
  if (!status.pens) return 'Animal pens: none registered.';
  return `Animal pens: ${status.details.map((pen) => `${pen.animalType} ${pen.animals}/${pen.size || 7}`).join(', ')}.`;
}

export async function buildSimplePen(bot, memory, animalType = 'cow', options = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'Set a home first before making pens.' };
  const type = normalizeAnimal(animalType);
  const size = Math.min(options.size || options.config?.defaultPenSize || 7, options.config?.defaultPenSize || 7);
  const center = penCenter(memory, type, options);
  if (!center) return { ok: false, message: 'I need a home before choosing a pen spot.' };
  const half = Math.floor(size / 2);
  const fence = crafting.resolveCraftItemName(bot, 'fence');
  const gate = crafting.resolveCraftItemName(bot, 'fence gate');
  const placed = [];

  for (let dx = -half; dx <= half; dx += 1) {
    for (let dz = -half; dz <= half; dz += 1) {
      const edge = Math.abs(dx) === half || Math.abs(dz) === half;
      if (!edge) continue;
      const isGate = dz === -half && dx === 0;
      const name = isGate ? gate : fence;
      const result = await placeAt(bot, name, new Vec3(center.x + dx, center.y, center.z + dz), options);
      if (result.ok) placed.push(result.position);
    }
  }
  await lighting.placeTorchNear(bot, { ownerUsername: options.config?.ownerUsername, survivalMode: true }).catch(() => null);
  const registered = registerAnimalPen(bot, memory, {
    animalType: type,
    center,
    size,
    gatePosition: { x: center.x, y: center.y, z: center.z - half }
  }, type);
  return { ok: placed.length > 0, message: `Built ${type} pen with ${placed.length} fence/gate block(s).`, pen: registered.pen };
}

export async function createAnimalPen(bot, memory, animalType = 'cow', options = {}) {
  return buildSimplePen(bot, memory, animalType, options);
}

export async function openPenGate() {
  return { ok: true, message: 'Gate handling is basic right now.' };
}

export async function closePenGate() {
  return { ok: true, message: 'Gate handling is basic right now.' };
}

export async function maintainAnimalPens(bot, memory) {
  return { ok: true, message: animalPenStatusText(bot, memory) };
}

export { normalizeAnimal };
