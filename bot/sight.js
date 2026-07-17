/**
 * Centralized "what can TJ see" helpers.
 * Improves target selection for digs, ores, and scan/status chat.
 */

// Resource name lists used by thin-core / wrappers
export const RESOURCE_BLOCKS = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'pale_oak_log'],
  stone: ['stone', 'cobblestone', 'deepslate', 'andesite', 'diorite', 'granite', 'cobbled_deepslate', 'tuff'],
  coal: ['coal_ore', 'deepslate_coal_ore'],
  iron: ['iron_ore', 'deepslate_iron_ore'],
  dirt: ['dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'mud'],
  sand: ['sand', 'red_sand'],
  gravel: ['gravel'],
  clay: ['clay']
};

export const SIGHT_RADIUS = {
  dig: 40,
  wood: 48,
  stone: 48,
  ore: 96,
  danger: 16,
  entity: 24,
  scan: 32
};

const DANGER_BLOCKS = ['lava', 'fire', 'soul_fire', 'magma_block', 'cactus', 'powder_snow'];

function originOf(bot, origin) {
  return origin || bot?.entity?.position || null;
}

function isFluidName(name) {
  return name === 'water' || name === 'lava' || name === 'bubble_column'
    || String(name || '').includes('water')
    || String(name || '').includes('lava');
}

function isPassableName(name) {
  return !name
    || name === 'air'
    || name === 'cave_air'
    || name === 'void_air'
    || name === 'short_grass'
    || name === 'tall_grass'
    || name === 'snow'
    || String(name).endsWith('_carpet');
}

export function isWetBlock(bot, block) {
  if (!block?.position || !bot?.blockAt) return false;
  if (typeof bot?.mcaiSafety?.isHazardousFluidDig === 'function') {
    try {
      if (bot.mcaiSafety.isHazardousFluidDig(block)) return true;
    } catch {
      // fall through
    }
  }
  if (isFluidName(block.name)) return true;
  const above = bot.blockAt(block.position.offset(0, 1, 0));
  return Boolean(above && isFluidName(above.name));
}

export function hasDryStandSpot(bot, block) {
  if (!block?.position || !bot?.blockAt) return false;
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2]
  ];
  for (const [dx, dz] of offsets) {
    const floor = bot.blockAt(block.position.offset(dx, -1, dz));
    const feet = bot.blockAt(block.position.offset(dx, 0, dz));
    const head = bot.blockAt(block.position.offset(dx, 1, dz));
    if (!floor || isFluidName(floor.name) || isPassableName(floor.name)) continue;
    if (floor.boundingBox && floor.boundingBox !== 'block') continue;
    if (feet && isFluidName(feet.name)) continue;
    if (head && isFluidName(head.name)) continue;
    if (feet && !isPassableName(feet.name) && feet.boundingBox === 'block') continue;
    return true;
  }
  const top = bot.blockAt(block.position.offset(0, 1, 0));
  const top2 = bot.blockAt(block.position.offset(0, 2, 0));
  if (top && isPassableName(top.name) && !isFluidName(top.name)
    && (!top2 || (isPassableName(top2.name) && !isFluidName(top2.name)))) {
    return true;
  }
  return false;
}

/**
 * Cheap line-of-sight: sample blocks between eyes and target center.
 * Returns true if mostly air/passable (allows leaves for trees).
 */
export function hasLineOfSight(bot, targetPos, options = {}) {
  if (!bot?.entity?.position || !targetPos || !bot.blockAt) return true;
  const allowLeaves = options.allowLeaves !== false;
  const eye = bot.entity.position.offset(0, bot.entity.height ? bot.entity.height * 0.9 : 1.6, 0);
  const dest = {
    x: targetPos.x + 0.5,
    y: targetPos.y + 0.5,
    z: targetPos.z + 0.5
  };
  const dx = dest.x - eye.x;
  const dy = dest.y - eye.y;
  const dz = dest.z - eye.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1.5) return true;
  const steps = Math.min(48, Math.max(4, Math.ceil(dist * 2)));
  let solidHits = 0;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = eye.x + dx * t;
    const y = eye.y + dy * t;
    const z = eye.z + dz * t;
    // Stop before the target cell
    if (Math.floor(x) === Math.floor(dest.x) && Math.floor(y) === Math.floor(dest.y) && Math.floor(z) === Math.floor(dest.z)) break;
    const b = bot.blockAt({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (!b || isPassableName(b.name) || isFluidName(b.name)) continue;
    if (allowLeaves && (b.name.includes('leaves') || b.name.includes('vine') || b.name === 'snow')) continue;
    if (b.boundingBox === 'block') solidHits += 1;
    if (solidHits >= 2) return false;
  }
  return solidHits < 2;
}

function blockAtPos(bot, position) {
  if (!position) return null;
  return bot.blockAt?.(position) || null;
}

/**
 * Find blocks by name list with ranking.
 */
export function findNamedBlocks(bot, names, options = {}) {
  if (!bot?.findBlocks || !bot?.entity?.position) return [];
  const nameList = (Array.isArray(names) ? names : [names]).filter(Boolean);
  if (!nameList.length) return [];
  const nameSet = new Set(nameList);
  const maxDistance = Math.max(4, Number(options.maxDistance || SIGHT_RADIUS.dig));
  const count = Math.max(8, Number(options.count || 64));
  const origin = originOf(bot, options.origin);
  const strictDry = options.strictDry === true;
  const softDry = options.preferDry !== false && !strictDry;
  const requireLos = options.requireLos === true;

  let positions = [];
  try {
    const ids = nameList
      .map((n) => bot.registry?.blocksByName?.[n]?.id)
      .filter((id) => id !== undefined && id !== null);
    positions = bot.findBlocks({
      matching: ids.length ? ids : (block) => nameSet.has(block?.name),
      maxDistance,
      count
    }) || [];
  } catch {
    return [];
  }

  let blocks = positions
    .map((p) => blockAtPos(bot, p))
    .filter((b) => b && nameSet.has(b.name));

  if (strictDry) {
    blocks = blocks.filter((b) => !isWetBlock(bot, b) && hasDryStandSpot(bot, b));
  } else if (softDry) {
    blocks = blocks.filter((b) => !isWetBlock(bot, b));
  }

  if (requireLos) {
    blocks = blocks.filter((b) => hasLineOfSight(bot, b.position, { allowLeaves: options.allowLeaves !== false }));
  }

  return rankBlocks(bot, blocks, {
    origin,
    preferY: options.preferY,
    clusterFirst: options.clusterFirst !== false
  });
}

/**
 * Rank targets: nearer first, then same-Y band, then cluster around nearest seed.
 */
export function rankBlocks(bot, blocks, options = {}) {
  if (!blocks?.length) return [];
  const origin = originOf(bot, options.origin);
  if (!origin) return [...blocks];

  const preferY = options.preferY ?? origin.y;
  const scored = blocks.map((block) => {
    const dist = origin.distanceTo(block.position);
    const dy = Math.abs((block.position.y ?? preferY) - preferY);
    const los = options.skipLosScore ? 0 : (hasLineOfSight(bot, block.position) ? 0 : 8);
    const score = dist + dy * 0.35 + los;
    return { block, dist, dy, score };
  });
  scored.sort((a, b) => a.score - b.score);

  if (!options.clusterFirst || scored.length < 2) {
    return scored.map((s) => s.block);
  }

  // After nearest seed, pull its cluster forward (vein / tree)
  const seed = scored[0].block;
  const rest = scored.slice(1).sort((a, b) => {
    const da = seed.position.distanceTo(a.block.position);
    const db = seed.position.distanceTo(b.block.position);
    if (Math.abs(da - db) > 0.01) return da - db;
    return a.score - b.score;
  });
  return [seed, ...rest.map((s) => s.block)];
}

/**
 * Resolve resource key → ranked dig targets.
 */
export function findResourceTargets(bot, resourceKey, options = {}) {
  const key = String(resourceKey || '').toLowerCase();
  const names = RESOURCE_BLOCKS[key] || [key];
  const shovel = ['dirt', 'sand', 'gravel', 'clay'].includes(key);
  const isOre = key === 'coal' || key === 'iron';
  const defaultRadius = isOre
    ? SIGHT_RADIUS.ore
    : key === 'wood'
      ? SIGHT_RADIUS.wood
      : key === 'stone'
        ? SIGHT_RADIUS.stone
        : SIGHT_RADIUS.dig;

  return findNamedBlocks(bot, names, {
    maxDistance: options.maxDistance || defaultRadius,
    count: options.count || (isOre ? 48 : 64),
    preferDry: options.preferDry !== false,
    strictDry: options.strictDry === true || (shovel && options.strictDry !== false && options.preferDry !== false),
    requireLos: options.requireLos === true,
    allowLeaves: key === 'wood',
    preferY: options.preferY,
    clusterFirst: options.clusterFirst !== false,
    origin: options.origin
  });
}

/**
 * Expand wood/ore into a connected set using flood from seed.
 */
export function expandCluster(bot, seed, names, options = {}) {
  if (!seed?.position || !bot?.blockAt) return seed ? [seed] : [];
  const nameSet = new Set(names);
  const maxBlocks = Math.max(4, Number(options.maxBlocks || 40));
  const maxDist = Math.max(4, Number(options.maxDistance || 16));
  const isWood = [...nameSet].some((n) => String(n).includes('log'));

  // BFS in 6/18 directions
  const dirs = isWood
    ? [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
      [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]
    ]
    : [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
    ];

  const keyOf = (p) => `${p.x},${p.y},${p.z}`;
  const seen = new Set([keyOf(seed.position)]);
  const out = [seed];
  const queue = [seed.position.clone ? seed.position.clone() : { ...seed.position }];

  while (queue.length && out.length < maxBlocks) {
    const cur = queue.shift();
    for (const [dx, dy, dz] of dirs) {
      const nx = Math.floor(cur.x + dx);
      const ny = Math.floor(cur.y + dy);
      const nz = Math.floor(cur.z + dz);
      const k = `${nx},${ny},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(nx - seed.position.x) > maxDist) continue;
      if (Math.abs(ny - seed.position.y) > maxDist) continue;
      if (Math.abs(nz - seed.position.z) > maxDist) continue;
      const block = bot.blockAt({ x: nx, y: ny, z: nz });
      if (!block || !nameSet.has(block.name)) continue;
      out.push(block);
      queue.push(block.position);
    }
  }

  if (isWood) {
    out.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x) || (a.position.z - b.position.z));
  } else {
    out.sort((a, b) => seed.position.distanceTo(a.position) - seed.position.distanceTo(b.position));
  }
  return out;
}

/**
 * Snapshot of nearby interesting things for chat / status.
 */
export function scanVisible(bot, options = {}) {
  const radius = Math.max(8, Number(options.radius || SIGHT_RADIUS.scan));
  const origin = originOf(bot, options.origin);
  const resources = {};
  for (const key of Object.keys(RESOURCE_BLOCKS)) {
    const hits = findResourceTargets(bot, key, {
      maxDistance: radius,
      count: 12,
      preferDry: true,
      strictDry: ['dirt', 'sand', 'gravel', 'clay'].includes(key),
      clusterFirst: true
    });
    if (hits.length) {
      resources[key] = {
        count: hits.length,
        nearest: hits[0]
          ? {
            name: hits[0].name,
            distance: origin ? Number(origin.distanceTo(hits[0].position).toFixed(1)) : null,
            y: hits[0].position.y
          }
          : null
      };
    }
  }

  const dangers = findNamedBlocks(bot, DANGER_BLOCKS, {
    maxDistance: Math.min(radius, SIGHT_RADIUS.danger),
    count: 24,
    preferDry: false,
    clusterFirst: false
  }).slice(0, 8).map((b) => ({
    name: b.name,
    distance: origin ? Number(origin.distanceTo(b.position).toFixed(1)) : null
  }));

  const entities = Object.values(bot.entities || {})
    .filter((e) => e?.position && origin && origin.distanceTo(e.position) <= (options.entityRadius || SIGHT_RADIUS.entity))
    .map((e) => ({
      name: e.name || e.username || e.displayName || e.type || 'unknown',
      username: e.username || null,
      distance: origin ? Number(origin.distanceTo(e.position).toFixed(1)) : null
    }))
    .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
    .slice(0, 12);

  return { radius, resources, dangers, entities };
}

/**
 * Short chat line for "what do you see".
 */
export function describeSight(bot, options = {}) {
  const snap = scanVisible(bot, options);
  const resParts = Object.entries(snap.resources)
    .map(([k, v]) => `${k}×${v.count}${v.nearest ? ` (${v.nearest.distance}m)` : ''}`);
  const dangerParts = snap.dangers.slice(0, 3).map((d) => `${d.name} ${d.distance}m`);
  const mobParts = snap.entities
    .filter((e) => e.name && e.name !== 'player' && !e.username)
    .slice(0, 4)
    .map((e) => `${e.name} ${e.distance}m`);

  const bits = [];
  if (resParts.length) bits.push(`resources: ${resParts.join(', ')}`);
  else bits.push('no iron-age resources in view');
  if (dangerParts.length) bits.push(`danger: ${dangerParts.join(', ')}`);
  if (mobParts.length) bits.push(`mobs: ${mobParts.join(', ')}`);
  return `Within ~${snap.radius}m — ${bits.join(' · ')}.`;
}

export default {
  RESOURCE_BLOCKS,
  SIGHT_RADIUS,
  isWetBlock,
  hasDryStandSpot,
  hasLineOfSight,
  findNamedBlocks,
  rankBlocks,
  findResourceTargets,
  expandCluster,
  scanVisible,
  describeSight
};
