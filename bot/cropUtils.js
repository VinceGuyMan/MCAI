import { Vec3 } from 'vec3';

const cropDefs = {
  wheat: { block: 'wheat', seed: 'wheat_seeds', plant: 'wheat_seeds', drops: ['wheat', 'wheat_seeds'], maxAge: 7 },
  carrots: { block: 'carrots', seed: 'carrot', plant: 'carrot', drops: ['carrot'], maxAge: 7 },
  potatoes: { block: 'potatoes', seed: 'potato', plant: 'potato', drops: ['potato', 'poisonous_potato'], maxAge: 7 },
  beetroots: { block: 'beetroots', seed: 'beetroot_seeds', plant: 'beetroot_seeds', drops: ['beetroot', 'beetroot_seeds'], maxAge: 3 },
  melon: { block: 'melon_stem', seed: 'melon_seeds', plant: 'melon_seeds', drops: ['melon_slice'], maxAge: 7 },
  pumpkin: { block: 'pumpkin_stem', seed: 'pumpkin_seeds', plant: 'pumpkin_seeds', drops: ['pumpkin'], maxAge: 7 },
  sugar_cane: { block: 'sugar_cane', seed: 'sugar_cane', plant: 'sugar_cane', drops: ['sugar_cane'], maxAge: 0 },
  sweet_berries: { block: 'sweet_berry_bush', seed: 'sweet_berries', plant: 'sweet_berries', drops: ['sweet_berries'], maxAge: 3 }
};

function normalize(name) {
  const text = String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (text === 'wheat_seeds') return 'wheat';
  if (text === 'carrot') return 'carrots';
  if (text === 'potato') return 'potatoes';
  if (text === 'beetroot' || text === 'beetroot_seeds') return 'beetroots';
  if (text === 'berry' || text === 'berries' || text === 'sweet_berry') return 'sweet_berries';
  return text;
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function areaBounds(area) {
  if (!area?.center) return null;
  const width = Math.max(1, Number(area.width) || 5);
  const length = Math.max(1, Number(area.length) || 5);
  const minX = Math.floor(area.center.x - Math.floor(width / 2));
  const maxX = minX + width - 1;
  const minZ = Math.floor(area.center.z - Math.floor(length / 2));
  const maxZ = minZ + length - 1;
  return { minX, maxX, minZ, maxZ, y: Math.floor(area.center.y) };
}

function blockAge(block) {
  if (!block) return null;
  try {
    const props = block.getProperties?.();
    if (props && props.age !== undefined) return Number(props.age);
  } catch {
    // Fall through to metadata.
  }
  if (typeof block.metadata === 'number' && block.metadata >= 0) return block.metadata;
  return null;
}

function blocksInArea(bot, area, yOffsets = [0, 1]) {
  const bounds = areaBounds(area);
  if (!bounds) return [];
  const blocks = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      for (const dy of yOffsets) {
        const block = bot.blockAt(new Vec3(x, bounds.y + dy, z));
        if (block) blocks.push(block);
      }
    }
  }
  return blocks;
}

export function isCropBlock(block) {
  if (!block) return false;
  return Object.values(cropDefs).some((def) => def.block === block.name);
}

export function getCropTypeFromBlock(block) {
  if (!block) return null;
  return Object.entries(cropDefs).find(([, def]) => def.block === block.name)?.[0] || null;
}

export function isMatureCrop(block) {
  const cropType = getCropTypeFromBlock(block);
  if (!cropType) return false;
  if (cropType === 'sugar_cane') return true;
  const age = blockAge(block);
  if (age === null) return false;
  return age >= cropDefs[cropType].maxAge;
}

export function getSeedItemForCrop(cropType) {
  return cropDefs[normalize(cropType)]?.seed || null;
}

export function getHarvestDropNames(cropType) {
  return cropDefs[normalize(cropType)]?.drops || [];
}

export function getPlantableItemForCrop(cropType) {
  return cropDefs[normalize(cropType)]?.plant || null;
}

export function getCropBlockName(cropType) {
  return cropDefs[normalize(cropType)]?.block || null;
}

export function getAvailableSeedsAndCrops(bot) {
  const items = bot.inventory?.items?.() || [];
  const counts = {};
  for (const [cropType, def] of Object.entries(cropDefs)) {
    counts[cropType] = items.filter((item) => item.name === def.plant || item.name === def.seed).reduce((sum, item) => sum + item.count, 0);
  }
  return counts;
}

export function getPreferredCrop(bot) {
  const available = getAvailableSeedsAndCrops(bot);
  return ['wheat', 'carrots', 'potatoes', 'beetroots'].find((crop) => available[crop] > 0) || 'wheat';
}

export function findMatureCrops(bot, area) {
  return blocksInArea(bot, area, [0, 1]).filter((block) => isCropBlock(block) && isMatureCrop(block));
}

export function findPlantableFarmland(bot, area) {
  return blocksInArea(bot, area, [0]).filter((block) => {
    if (block.name !== 'farmland') return false;
    const above = bot.blockAt(block.position.offset(0, 1, 0));
    return ['air', 'cave_air', 'void_air'].includes(above?.name);
  });
}

export function findFarmableDirt(bot, area) {
  return blocksInArea(bot, area, [0]).filter((block) => {
    if (!['dirt', 'grass_block'].includes(block.name)) return false;
    const above = bot.blockAt(block.position.offset(0, 1, 0));
    return ['air', 'cave_air', 'void_air'].includes(above?.name);
  });
}

export function scanAreaCrops(bot, area) {
  return blocksInArea(bot, area, [0, 1]).filter(isCropBlock).map((block) => ({
    cropType: getCropTypeFromBlock(block),
    mature: isMatureCrop(block),
    position: point(block.position)
  }));
}

export { cropDefs, normalize as normalizeCropType, areaBounds };
