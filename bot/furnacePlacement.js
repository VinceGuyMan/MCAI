/**
 * Shared furnace find/place for food cooking and ore/charcoal smelting.
 */
import { Vec3 } from 'vec3';
import { craftItem, findInventoryItem, findNearbyCraftingTable, placeCraftingTable } from './crafting.js';
import { countItem } from './inventory.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

export function findNearbyFurnace(bot, maxDistance = 12) {
  const ids = ['furnace', 'blast_furnace', 'smoker']
    .map((name) => bot.registry?.blocksByName?.[name]?.id)
    .filter(Boolean);
  if (!ids.length || !bot.entity) return null;
  return bot.findBlock?.({ matching: ids, maxDistance }) || null;
}

function safePlacementTarget(bot, destBlock, referenceBlock) {
  if (!destBlock || !referenceBlock) return false;
  if (!['air', 'cave_air', 'void_air'].includes(destBlock.name)) return false;
  if (['lava', 'water', 'fire', 'soul_fire'].includes(referenceBlock.name)) return false;
  if (referenceBlock.boundingBox !== 'block') return false;
  const botFeet = bot.entity?.position?.floored?.() || bot.entity?.position;
  if (botFeet) {
    const feet = botFeet.floored ? botFeet.floored() : botFeet;
    if (destBlock.position.equals(feet) || destBlock.position.equals(feet.offset(0, 1, 0))) return false;
  }
  return true;
}

/**
 * Find a nearby furnace or craft+place one if materials exist.
 * @param {object} bot
 * @param {object} options - { maxDistance, preferCraft, source }
 */
export async function findOrPlaceFurnace(bot, options = {}) {
  const maxDistance = Number(options.maxDistance || 12);
  const nearby = findNearbyFurnace(bot, maxDistance);
  if (nearby) return result(true, 'Found nearby furnace.', { block: nearby, placed: false });

  if (countItem(bot, 'furnace') < 1) {
    if (countItem(bot, 'cobblestone') < 8) {
      return result(false, 'I need a furnace nearby or 8 cobblestone to craft one.');
    }
    if (!findNearbyCraftingTable(bot)) {
      const table = await placeCraftingTable(bot);
      if (!table.ok) return result(false, 'I need a crafting table nearby to craft a furnace.');
    }
    const crafted = await craftItem(bot, 'furnace', 1, { direct: true, shouldStop: options.shouldStop });
    if (!crafted.ok) return result(false, `I could not craft a furnace: ${crafted.message}`);
  }

  const furnaceItem = findInventoryItem(bot, 'furnace');
  if (!furnaceItem || !bot.entity) return result(false, 'I do not have a furnace to place.');
  await bot.equip(furnaceItem, 'hand');
  await wait(250);

  const base = bot.entity.position.floored();
  const offsets = [];
  for (const dy of [0, 1, -1]) {
    for (let radius = 1; radius <= 4; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          offsets.push([dx, dy, dz]);
        }
      }
    }
  }

  const source = options.source || 'furnace';
  for (const [dx, dy, dz] of offsets) {
    const dest = base.offset(dx, dy, dz);
    const destBlock = bot.blockAt(dest);
    const referenceBlock = bot.blockAt(dest.offset(0, -1, 0));
    if (!safePlacementTarget(bot, destBlock, referenceBlock)) continue;
    try {
      console.log(`[${source}] placing furnace at ${dest.x},${dest.y},${dest.z}`);
      if (bot._placeBlockWithOptions) {
        await bot._placeBlockWithOptions(referenceBlock, new Vec3(0, 1, 0), { swingArm: 'right', forceLook: true });
      } else {
        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      }
      await wait(500);
      const placed = bot.blockAt(dest);
      if (placed?.name === 'furnace') {
        return result(true, 'Placed a furnace nearby.', { block: placed, placed: true });
      }
    } catch (error) {
      console.warn(`[${source}] furnace placement failed: ${error.message}`);
    }
  }

  return result(false, 'I could not find a safe place to put a furnace.');
}
