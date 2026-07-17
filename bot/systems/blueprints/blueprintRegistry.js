import { loadConfig } from '../../config.js';

const config = loadConfig();

const SAFE_BLOCKS = new Set([
  'air',
  'oak_planks',
  'spruce_planks',
  'birch_planks',
  'jungle_planks',
  'acacia_planks',
  'dark_oak_planks',
  'mangrove_planks',
  'cherry_planks',
  'cobblestone',
  'stone',
  'cobbled_deepslate',
  'dirt',
  'glass',
  'oak_door',
  'spruce_door',
  'birch_door',
  'jungle_door',
  'acacia_door',
  'dark_oak_door',
  'mangrove_door',
  'cherry_door',
  'torch',
  'crafting_table',
  'furnace',
  'chest',
  'barrel',
  'composter',
  'ladder'
]);

const DANGEROUS_BLOCKS = new Set([
  'tnt',
  'lava',
  'lava_bucket',
  'fire',
  'soul_fire',
  'campfire',
  'soul_campfire',
  'magma_block',
  'cactus',
  'wither_rose',
  'command_block',
  'chain_command_block',
  'repeating_command_block',
  'structure_block',
  'jigsaw',
  'spawner',
  'bedrock',
  'end_crystal'
]);

function block(x, y, z, name) {
  return { x, y, z, block: name };
}

function torchRing() {
  return [
    block(4, 0, 0, 'torch'),
    block(-4, 0, 0, 'torch'),
    block(0, 0, 4, 'torch'),
    block(0, 0, -4, 'torch'),
    block(3, 0, 3, 'torch'),
    block(-3, 0, 3, 'torch'),
    block(3, 0, -3, 'torch'),
    block(-3, 0, -3, 'torch')
  ];
}

function storageWall() {
  return [
    block(-1, 0, 0, 'chest'),
    block(0, 0, 0, 'chest'),
    block(1, 0, 0, 'chest'),
    block(2, 0, 0, 'chest'),
    block(-1, 0, 1, 'torch'),
    block(2, 0, 1, 'torch')
  ];
}

function shelter5x5() {
  const blocks = [];
  for (let y = 0; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      if (!(x === 0 && y <= 1)) blocks.push(block(x, y, -2, 'oak_planks'));
      blocks.push(block(x, y, 2, 'oak_planks'));
    }
    for (let z = -1; z <= 1; z += 1) {
      blocks.push(block(-2, y, z, 'oak_planks'));
      blocks.push(block(2, y, z, 'oak_planks'));
    }
  }
  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) blocks.push(block(x, 3, z, 'oak_planks'));
  }
  blocks.push(block(0, 0, -2, 'oak_door'));
  blocks.push(block(-1, 0, 0, 'torch'));
  blocks.push(block(1, 0, 0, 'torch'));
  return blocks;
}

function cobbleFrame(radius = 2) {
  const blocks = [];
  for (let x = -radius; x <= radius; x += 1) {
    blocks.push(block(x, 0, -radius, 'cobblestone'));
    blocks.push(block(x, 0, radius, 'cobblestone'));
  }
  for (let z = -radius + 1; z <= radius - 1; z += 1) {
    blocks.push(block(-radius, 0, z, 'cobblestone'));
    blocks.push(block(radius, 0, z, 'cobblestone'));
  }
  return blocks;
}

const BLUEPRINTS = [
  {
    id: 'starter_workstation',
    name: 'Starter Workstation',
    category: 'base',
    description: 'Small utility area with crafting table, furnace, chest, and torches.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 5,
    length: 5,
    height: 2,
    origin: 'center_floor',
    blocks: [
      block(0, 0, 0, 'crafting_table'),
      block(1, 0, 0, 'furnace'),
      block(-1, 0, 0, 'chest'),
      block(0, 0, 2, 'torch'),
      block(0, 0, -2, 'torch')
    ],
    requiredMaterials: {},
    tags: ['base', 'utility', 'early_game'],
    implemented: true
  },
  {
    id: 'torch_ring',
    name: 'Torch Ring',
    category: 'lighting',
    description: 'Simple torches around an area.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 9,
    length: 9,
    height: 1,
    origin: 'center_floor',
    blocks: torchRing(),
    requiredMaterials: {},
    tags: ['base', 'lighting'],
    implemented: true
  },
  {
    id: 'storage_wall',
    name: 'Storage Wall',
    category: 'storage',
    description: 'Small four-chest storage wall with two torches.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 4,
    length: 2,
    height: 2,
    origin: 'center_floor',
    blocks: storageWall(),
    requiredMaterials: {},
    tags: ['base', 'storage'],
    implemented: true
  },
  {
    id: 'small_shelter_5x5',
    name: 'Small Shelter 5x5',
    category: 'base',
    description: 'Simple 5x5 shelter with plank walls, roof, door, and torches.',
    riskLevel: 'medium',
    requiresConfirmation: true,
    width: 5,
    length: 5,
    height: 4,
    origin: 'center_floor',
    blocks: shelter5x5(),
    requiredMaterials: {},
    tags: ['base', 'shelter'],
    implemented: true
  },
  {
    id: 'farm_corner',
    name: 'Farm Corner',
    category: 'farming',
    description: 'Small farm utility corner with composter, chest, and torch.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 3,
    length: 3,
    height: 2,
    origin: 'center_floor',
    blocks: [
      block(0, 0, 0, 'composter'),
      block(1, 0, 0, 'chest'),
      block(0, 0, 1, 'torch')
    ],
    requiredMaterials: {},
    tags: ['farm', 'utility'],
    implemented: true
  },
  {
    id: 'mine_entrance_marker',
    name: 'Mine Entrance Marker',
    category: 'mining',
    description: 'Cobblestone and torch marker for a mine entrance.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 3,
    length: 3,
    height: 2,
    origin: 'center_floor',
    blocks: [
      block(-1, 0, 0, 'cobblestone'),
      block(0, 0, 0, 'cobblestone'),
      block(1, 0, 0, 'cobblestone'),
      block(0, 1, 0, 'torch')
    ],
    requiredMaterials: {},
    tags: ['mining', 'marker'],
    implemented: true
  },
  {
    id: 'nether_portal_safety_frame',
    name: 'Nether Portal Safety Frame',
    category: 'nether',
    description: 'Cobblestone safety marker around a portal area. It does not light or enter a portal.',
    riskLevel: 'medium',
    requiresConfirmation: true,
    width: 5,
    length: 5,
    height: 2,
    origin: 'center_floor',
    blocks: [...cobbleFrame(2), block(-1, 1, -2, 'torch'), block(1, 1, -2, 'torch')],
    requiredMaterials: {},
    tags: ['nether', 'portal', 'safety'],
    implemented: true
  }
];

function clone(blueprint) {
  return {
    ...blueprint,
    blocks: blueprint.blocks.map((entry) => ({ ...entry })),
    requiredMaterials: { ...(blueprint.requiredMaterials || {}) },
    tags: [...(blueprint.tags || [])]
  };
}

export function normalizeBlueprintId(name) {
  const key = String(name || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const aliases = getBlueprintAliases();
  return aliases[key] || key.replace(/\s+/g, '_');
}

export function getBlueprintAliases() {
  return {
    'starter workstation': 'starter_workstation',
    workstation: 'starter_workstation',
    'torch ring': 'torch_ring',
    torches: 'torch_ring',
    'storage wall': 'storage_wall',
    storage: 'storage_wall',
    'small shelter': 'small_shelter_5x5',
    shelter: 'small_shelter_5x5',
    'small shelter 5x5': 'small_shelter_5x5',
    'farm corner': 'farm_corner',
    'mine entrance marker': 'mine_entrance_marker',
    'mine marker': 'mine_entrance_marker',
    'nether portal safety frame': 'nether_portal_safety_frame',
    'portal safety frame': 'nether_portal_safety_frame'
  };
}

export function getBlueprints() {
  return BLUEPRINTS.map(clone);
}

export function getBlueprint(id) {
  const key = normalizeBlueprintId(id);
  const found = BLUEPRINTS.find((blueprint) => blueprint.id === key);
  return found ? clone(found) : null;
}

export function listBlueprints(filters = {}) {
  return getBlueprints().filter((blueprint) => {
    if (filters.category && blueprint.category !== filters.category) return false;
    if (filters.implemented !== undefined && blueprint.implemented !== filters.implemented) return false;
    return true;
  });
}

export function listBlueprintsByCategory(category) {
  return listBlueprints({ category });
}

export function getBlueprintDimensions(blueprint) {
  if (!blueprint?.blocks?.length) return { width: 0, length: 0, height: 0 };
  const xs = blueprint.blocks.map((entry) => entry.x);
  const ys = blueprint.blocks.map((entry) => entry.y);
  const zs = blueprint.blocks.map((entry) => entry.z);
  return {
    width: Math.max(Number(blueprint.width || 0), Math.max(...xs) - Math.min(...xs) + 1),
    length: Math.max(Number(blueprint.length || 0), Math.max(...zs) - Math.min(...zs) + 1),
    height: Math.max(Number(blueprint.height || 0), Math.max(...ys) - Math.min(...ys) + 1)
  };
}

export function getBlueprintBlockCount(blueprint) {
  return Array.isArray(blueprint?.blocks) ? blueprint.blocks.length : 0;
}

export function getBlueprintMaterialList(blueprint) {
  const materials = {};
  for (const entry of blueprint?.blocks || []) {
    if (!entry.block || entry.block === 'air') continue;
    materials[entry.block] = (materials[entry.block] || 0) + 1;
  }
  return { ...materials, ...(blueprint?.requiredMaterials || {}) };
}

export function validateBlueprint(blueprint) {
  const errors = [];
  if (!blueprint || typeof blueprint !== 'object') return { ok: false, errors: ['blueprint must be an object'] };
  for (const field of ['id', 'name', 'category', 'description', 'riskLevel', 'blocks']) {
    if (blueprint[field] == null) errors.push(`missing ${field}`);
  }
  if (!Array.isArray(blueprint.blocks) || blueprint.blocks.length === 0) errors.push('blocks must be a non-empty array');
  if (getBlueprintBlockCount(blueprint) > Number(config.maxBlueprintBlocks || 256)) errors.push('blueprint has too many blocks');
  const dimensions = getBlueprintDimensions(blueprint);
  if (dimensions.width > Number(config.maxBlueprintWidth || 16)) errors.push('blueprint is too wide');
  if (dimensions.length > Number(config.maxBlueprintLength || 16)) errors.push('blueprint is too long');
  if (dimensions.height > Number(config.maxBlueprintHeight || 8)) errors.push('blueprint is too tall');
  const seen = new Set();
  for (const entry of blueprint.blocks || []) {
    for (const field of ['x', 'y', 'z', 'block']) {
      if (entry[field] == null) errors.push(`block entry missing ${field}`);
    }
    const key = `${entry.x},${entry.y},${entry.z}`;
    if (seen.has(key)) errors.push(`duplicate block coordinate ${key}`);
    seen.add(key);
    const name = String(entry.block || '');
    if (DANGEROUS_BLOCKS.has(name)) errors.push(`dangerous block ${name}`);
    if (!SAFE_BLOCKS.has(name)) errors.push(`unsupported block ${name}`);
  }
  return { ok: errors.length === 0, errors, dimensions };
}

export function validateAllBlueprints() {
  const errors = [];
  const ids = new Set();
  for (const blueprint of BLUEPRINTS) {
    if (ids.has(blueprint.id)) errors.push(`duplicate blueprint id ${blueprint.id}`);
    ids.add(blueprint.id);
    const validation = validateBlueprint(blueprint);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `${blueprint.id}: ${error}`));
  }
  return { ok: errors.length === 0, errors, count: BLUEPRINTS.length };
}

export function isDangerousBlueprintBlock(blockName) {
  return DANGEROUS_BLOCKS.has(String(blockName || '').toLowerCase());
}

export function isSupportedBlueprintBlock(blockName) {
  return SAFE_BLOCKS.has(String(blockName || '').toLowerCase());
}

export default {
  getBlueprints,
  getBlueprint,
  listBlueprints,
  listBlueprintsByCategory,
  validateBlueprint,
  validateAllBlueprints,
  normalizeBlueprintId,
  getBlueprintAliases,
  getBlueprintDimensions,
  getBlueprintBlockCount,
  getBlueprintMaterialList
};
