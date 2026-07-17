import { Vec3 } from 'vec3';
import { getBlueprint, getBlueprintBlockCount, getBlueprintDimensions, getBlueprintMaterialList } from './blueprintRegistry.js';
import { loadConfig } from '../../config.js';

function normalizeRotation(rotation = 0) {
  const value = Number(rotation) || 0;
  const normalized = ((value % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) return 0;
  return normalized;
}

function asVec3(position) {
  if (!position) return null;
  if (typeof position.floored === 'function') return position.floored();
  return new Vec3(Math.floor(position.x || 0), Math.floor(position.y || 0), Math.floor(position.z || 0));
}

function ownerPosition(bot) {
  const config = loadConfig();
  return bot?.players?.[config.ownerUsername]?.entity?.position || null;
}

function defaultOrigin(bot) {
  const owner = ownerPosition(bot);
  const base = asVec3(owner || bot?.entity?.position);
  if (!base) return null;
  return base.offset(3, 0, 3);
}

function rotatePoint(x, z, rotation) {
  if (rotation === 90) return { x: -z, z: x };
  if (rotation === 180) return { x: -x, z: -z };
  if (rotation === 270) return { x: z, z: -x };
  return { x, z };
}

function blockPriority(entry) {
  const name = entry.block;
  if (entry.y <= 0 && !name.includes('torch')) return 0;
  if (name.endsWith('_door')) return 60;
  if (['crafting_table', 'furnace', 'chest', 'barrel', 'composter'].includes(name)) return 35;
  if (name.includes('torch') || name.includes('lantern')) return 90;
  if (entry.y >= 2) return 70;
  return 20;
}

export function rotateBlueprint(blueprint, rotation = 0) {
  const safeRotation = normalizeRotation(rotation);
  return {
    ...blueprint,
    rotation: safeRotation,
    blocks: blueprint.blocks.map((block) => {
      const rotated = rotatePoint(block.x, block.z, safeRotation);
      return { ...block, x: rotated.x, z: rotated.z };
    })
  };
}

export function transformBlueprintBlocks(blueprint, origin, rotation = 0) {
  const safeOrigin = asVec3(origin);
  if (!safeOrigin) return [];
  const rotated = rotateBlueprint(blueprint, rotation);
  return rotated.blocks.map((block, index) => ({
    index,
    blueprintId: blueprint.id,
    block: block.block,
    local: { x: block.x, y: block.y, z: block.z },
    position: {
      x: safeOrigin.x + block.x,
      y: safeOrigin.y + block.y,
      z: safeOrigin.z + block.z
    }
  }));
}

export function sortBlocksForPlacement(blocks = []) {
  return [...blocks].sort((a, b) => {
    const pa = blockPriority({ ...a.local, block: a.block });
    const pb = blockPriority({ ...b.local, block: b.block });
    if (pa !== pb) return pa - pb;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.position.z - b.position.z;
  });
}

export function planPlacementOrder(blueprint, origin, rotation = 0) {
  return sortBlocksForPlacement(transformBlueprintBlocks(blueprint, origin, rotation));
}

export function detectSupportRequirements(blocks = []) {
  const positions = new Set(blocks.map((entry) => `${entry.position.x},${entry.position.y},${entry.position.z}`));
  return blocks
    .filter((entry) => !entry.block.includes('torch'))
    .map((entry) => {
      const below = `${entry.position.x},${entry.position.y - 1},${entry.position.z}`;
      return { ...entry, supportInPlan: positions.has(below), needsWorldSupport: !positions.has(below) };
    });
}

export function detectBlocksNeedingAdjacentSupport(blocks = []) {
  const needsAdjacent = new Set(['torch', 'wall_torch', 'ladder', 'lever', 'button']);
  return blocks.filter((entry) => {
    const name = String(entry.block || '');
    return needsAdjacent.has(name) || name.endsWith('_wall_torch') || name.endsWith('_button');
  });
}

export function createBuildPreview(blueprint, origin, rotation = 0) {
  const dimensions = getBlueprintDimensions(blueprint);
  return {
    blueprintId: blueprint.id,
    name: blueprint.name,
    category: blueprint.category,
    dimensions,
    blockCount: getBlueprintBlockCount(blueprint),
    materialList: getBlueprintMaterialList(blueprint),
    origin: origin ? { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) } : null,
    rotation: normalizeRotation(rotation)
  };
}

export function chooseBuildOriginNearOwner(bot, memory, blueprint, options = {}) {
  const owner = ownerPosition(bot);
  if (!owner) return null;
  const base = asVec3(owner).offset(Number(options.offsetX ?? 3), 0, Number(options.offsetZ ?? 3));
  return base;
}

export function chooseBuildOriginNearHome(bot, memory, blueprint, options = {}) {
  const home = memory?.get?.()?.home || memory?.home || null;
  if (!home?.position && !home?.x) return null;
  const source = home.position || home;
  return asVec3(source).offset(Number(options.offsetX ?? 3), 0, Number(options.offsetZ ?? 3));
}

export function validateBuildPlan(plan) {
  const problems = [];
  if (!plan || typeof plan !== 'object') problems.push('missing plan');
  if (!plan?.blueprint?.id) problems.push('missing blueprint');
  if (!plan?.origin) problems.push('missing origin');
  if (!Array.isArray(plan?.blocks) || plan.blocks.length === 0) problems.push('no blocks to place');
  if (plan?.blocks?.some((entry) => !entry.block || !entry.position)) problems.push('invalid block entry');
  return { ok: problems.length === 0, problems };
}

export function explainBuildPlan(plan) {
  if (!plan) return 'No build plan.';
  const dimensions = plan.preview?.dimensions || getBlueprintDimensions(plan.blueprint);
  const materials = Object.entries(plan.materials?.required || getBlueprintMaterialList(plan.blueprint))
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
  return `${plan.blueprint.name}: ${plan.blocks.length} blocks, ${dimensions.width}x${dimensions.length}x${dimensions.height}, origin ${plan.origin.x},${plan.origin.y},${plan.origin.z}. Materials: ${materials || 'none'}.`;
}

export function createBuildPlan(bot, memory, blueprintId, options = {}) {
  const config = loadConfig();
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) return { ok: false, reason: `Unknown blueprint: ${blueprintId}` };

  const origin = asVec3(options.origin)
    || (options.nearHome ? chooseBuildOriginNearHome(bot, memory, blueprint, options) : null)
    || chooseBuildOriginNearOwner(bot, memory, blueprint, options)
    || defaultOrigin(bot);
  if (!origin) return { ok: false, reason: 'No safe origin could be selected because tj is not spawned and ModVinny is not visible.' };

  const rotation = normalizeRotation(options.rotation);
  const blocks = planPlacementOrder(blueprint, origin, rotation);
  const preview = createBuildPreview(blueprint, origin, rotation);
  const plan = {
    id: `plan_${Date.now()}`,
    blueprint,
    blueprintId: blueprint.id,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    rotation,
    blocks,
    remainingBlocks: [...blocks],
    materials: { required: preview.materialList },
    preview,
    maxBlocksPerRun: Number(options.maxBlocksPerRun || config.maxBlocksPlacedPerRun || 64),
    createdAt: Date.now(),
    options: {
      nearHome: Boolean(options.nearHome),
      requestedBy: options.requestedBy || null
    }
  };

  const validation = validateBuildPlan(plan);
  if (!validation.ok) return { ok: false, reason: validation.problems.join('; '), plan };
  return { ok: true, plan, message: explainBuildPlan(plan) };
}

