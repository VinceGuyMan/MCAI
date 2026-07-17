import { Vec3 } from 'vec3';
import { getBlueprintBlockCount, getBlueprintDimensions, isDangerousBlueprintBlock, validateBlueprint } from './blueprintRegistry.js';
import { loadConfig } from '../../config.js';

const protectedBlocks = new Set([
  'chest', 'trapped_chest', 'barrel', 'shulker_box', 'ender_chest',
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
  'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed',
  'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'anvil', 'chipped_anvil', 'damaged_anvil',
  'enchanting_table', 'brewing_stand', 'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door',
  'dark_oak_door', 'mangrove_door', 'cherry_door', 'iron_door', 'ladder', 'torch', 'wall_torch', 'lantern',
  'nether_portal', 'end_portal', 'farmland'
]);

const hazardBlocks = new Set(['lava', 'water', 'fire', 'soul_fire', 'magma_block', 'campfire', 'soul_campfire']);
const replaceableBlocks = new Set(['air', 'cave_air', 'void_air', 'grass', 'short_grass', 'fern', 'dead_bush', 'snow']);

function toVec3(position) {
  if (!position) return null;
  return new Vec3(Math.floor(position.x || 0), Math.floor(position.y || 0), Math.floor(position.z || 0));
}

function ownerEntity(bot) {
  const config = loadConfig();
  return bot?.players?.[config.ownerUsername]?.entity || null;
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function nearbyPositions(position, radius = 1) {
  const pos = toVec3(position);
  const positions = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        positions.push(pos.offset(dx, dy, dz));
      }
    }
  }
  return positions;
}

export function validateBuildDimensions(blueprint, config = loadConfig()) {
  const dimensions = getBlueprintDimensions(blueprint);
  const blockers = [];
  if (dimensions.width > Number(config.maxBlueprintWidth || 16)) blockers.push(`width ${dimensions.width} exceeds limit`);
  if (dimensions.length > Number(config.maxBlueprintLength || 16)) blockers.push(`length ${dimensions.length} exceeds limit`);
  if (dimensions.height > Number(config.maxBlueprintHeight || 8)) blockers.push(`height ${dimensions.height} exceeds limit`);
  if (getBlueprintBlockCount(blueprint) > Number(config.maxBlueprintBlocks || 256)) blockers.push(`block count ${getBlueprintBlockCount(blueprint)} exceeds limit`);
  return { ok: blockers.length === 0, blockers };
}

export function validateBlockSafety(blockName) {
  if (isDangerousBlueprintBlock(blockName)) return { ok: false, reason: `${blockName} is blocked for blueprint builds` };
  return { ok: true };
}

export function validateNoDangerousBlocks(blueprint) {
  const blockers = blueprint.blocks
    .map((block) => validateBlockSafety(block.block))
    .filter((result) => !result.ok)
    .map((result) => result.reason);
  return { ok: blockers.length === 0, blockers };
}

export function validateNoProtectedBlocksInArea(bot, plan) {
  if (!bot?.blockAt || !plan?.blocks) return { ok: true, blockers: [] };
  const blockers = [];
  for (const entry of plan.blocks) {
    const block = bot.blockAt(toVec3(entry.position));
    if (!block) continue;
    if (protectedBlocks.has(block.name)) blockers.push(`protected ${block.name} at ${entry.position.x},${entry.position.y},${entry.position.z}`);
    if (!replaceableBlocks.has(block.name) && block.name !== entry.block && !loadConfig().allowReplacingBlocks) blockers.push(`${block.name} is in the way at ${entry.position.x},${entry.position.y},${entry.position.z}`);
  }
  return { ok: blockers.length === 0, blockers };
}

export function validatePlayerSafety(bot, plan) {
  const blockers = [];
  const entities = Object.values(bot?.entities || {}).filter((entity) => entity?.position && (entity.type === 'player' || entity.username));
  for (const entry of plan?.blocks || []) {
    const pos = toVec3(entry.position).offset(0.5, 0.5, 0.5);
    for (const entity of entities) {
      if (distance(entity.position, pos) < 1.6) blockers.push(`player too close to ${entry.position.x},${entry.position.y},${entry.position.z}`);
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function validateMobSafety(bot, plan) {
  const blockers = [];
  for (const entity of Object.values(bot?.entities || {})) {
    if (!entity?.position || entity.type === 'player') continue;
    const name = String(entity.name || entity.mobType || '');
    if (/zombie|skeleton|creeper|spider|witch|enderman|pillager|vindicator|ravager|drowned|husk|stray/i.test(name)) {
      const near = (plan?.blocks || []).some((entry) => distance(entity.position, entry.position) < 8);
      if (near) blockers.push(`hostile nearby: ${name || 'unknown'}`);
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function validateDistanceLimits(bot, memory, plan) {
  const config = loadConfig();
  const blockers = [];
  const origin = plan?.origin;
  const owner = ownerEntity(bot);
  if (owner && distance(owner.position, origin) > Number(config.maxBuildDistanceFromOwner || 64)) blockers.push('build origin is too far from ModVinny');
  const home = memory?.get?.()?.home?.position || memory?.get?.()?.home || null;
  if (home && distance(home, origin) > Number(config.maxBuildDistanceFromHome || 96)) blockers.push('build origin is too far from home');
  return { ok: blockers.length === 0, blockers };
}

export function validateDimensionRules(bot, plan) {
  const dimension = String(bot?.game?.dimension || 'overworld');
  const blockers = [];
  if (/nether|end/.test(dimension)) {
    for (const entry of plan?.blocks || []) {
      if (String(entry.block).endsWith('_bed')) blockers.push('beds are blocked outside the overworld');
    }
  }
  return { ok: blockers.length === 0, blockers };
}

export function validateAreaClearance(bot, plan) {
  const config = loadConfig();
  if (!bot?.blockAt || !plan?.blocks) return { ok: true, blockers: [] };
  const blockers = [];
  for (const entry of plan.blocks) {
    const block = bot.blockAt(toVec3(entry.position));
    if (!block) continue;
    if (!replaceableBlocks.has(block.name) && block.name !== entry.block && !config.allowAreaClearing && !config.allowReplacingBlocks) {
      blockers.push(`area is not clear at ${entry.position.x},${entry.position.y},${entry.position.z}`);
    }
    for (const pos of nearbyPositions(entry.position, 1)) {
      const near = bot.blockAt(pos);
      if (near && hazardBlocks.has(near.name)) blockers.push(`hazard ${near.name} near ${entry.position.x},${entry.position.y},${entry.position.z}`);
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function validateBlueprintSafety(bot, memory, blueprint, options = {}) {
  const config = loadConfig();
  const blockers = [];
  const registryValidation = validateBlueprint(blueprint);
  if (!registryValidation.ok) blockers.push(...(registryValidation.errors || registryValidation.problems || []));
  blockers.push(...validateBuildDimensions(blueprint, config).blockers);
  blockers.push(...validateNoDangerousBlocks(blueprint).blockers);
  if (options.context?.sender && options.context.sender !== config.ownerUsername) blockers.push('only ModVinny can approve blueprint builds');
  if (options.requireConfirmation && !options.context?.confirmed) blockers.push('build confirmation is required');
  if (bot?.mcaiCancellation?.isCancelled?.()) blockers.push('cancellation is active');
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function validateBuildArea(bot, memory, plan) {
  const blockers = [];
  if (!plan) blockers.push('missing build plan');
  if (plan) {
    blockers.push(...validateNoProtectedBlocksInArea(bot, plan).blockers);
    blockers.push(...validatePlayerSafety(bot, plan).blockers);
    blockers.push(...validateMobSafety(bot, plan).blockers);
    blockers.push(...validateDistanceLimits(bot, memory, plan).blockers);
    blockers.push(...validateDimensionRules(bot, plan).blockers);
    blockers.push(...validateAreaClearance(bot, plan).blockers);
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function explainBuildBlockers(bot, memory, plan) {
  const blockers = [];
  if (plan?.blueprint) blockers.push(...validateBlueprintSafety(bot, memory, plan.blueprint).blockers);
  blockers.push(...validateBuildArea(bot, memory, plan).blockers);
  return [...new Set(blockers)];
}
