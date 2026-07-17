/**
 * Iron-and-below starter kit for local offline Paper.
 * Uses /give (bot must be op). Safe for companion play: no diamond/netherite.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns {{ item: string, count: number, label?: string }[]} */
export function getIronDownKitSpec(config = {}) {
  const custom = Array.isArray(config.starterKitItems) ? config.starterKitItems : null;
  if (custom?.length) return custom.map((entry) => ({
    item: String(entry.item || entry.name || '').trim(),
    count: Math.max(1, Math.min(64, Number(entry.count) || 1)),
    label: entry.label
  })).filter((entry) => entry.item);

  // Iron-tier gear + building blocks + early survival stack.
  return [
    // Tools (iron primary)
    { item: 'iron_pickaxe', count: 1 },
    { item: 'iron_axe', count: 1 },
    { item: 'iron_shovel', count: 1 },
    { item: 'iron_hoe', count: 1 },
    { item: 'iron_sword', count: 1 },
    { item: 'shield', count: 1 },
    { item: 'shears', count: 1 },
    { item: 'flint_and_steel', count: 1 },
    { item: 'fishing_rod', count: 1 },
    { item: 'bucket', count: 2 },
    { item: 'water_bucket', count: 1 },
    // Stone backup tools
    { item: 'stone_pickaxe', count: 1 },
    { item: 'stone_axe', count: 1 },
    { item: 'stone_shovel', count: 1 },
    // Armor (iron)
    { item: 'iron_helmet', count: 1 },
    { item: 'iron_chestplate', count: 1 },
    { item: 'iron_leggings', count: 1 },
    { item: 'iron_boots', count: 1 },
    // Materials / building (wood → iron era)
    { item: 'oak_log', count: 64 },
    { item: 'oak_planks', count: 64 },
    { item: 'cobblestone', count: 64 },
    { item: 'stone', count: 32 },
    { item: 'stone_bricks', count: 32 },
    { item: 'dirt', count: 64 },
    { item: 'glass', count: 32 },
    { item: 'sand', count: 32 },
    { item: 'gravel', count: 16 },
    { item: 'torch', count: 64 },
    { item: 'crafting_table', count: 2 },
    { item: 'furnace', count: 2 },
    { item: 'chest', count: 4 },
    { item: 'oak_door', count: 4 },
    { item: 'oak_fence', count: 16 },
    { item: 'oak_fence_gate', count: 4 },
    { item: 'ladder', count: 16 },
    { item: 'oak_sign', count: 8 },
    { item: 'white_bed', count: 1 },
    { item: 'white_wool', count: 16 },
    // Smelt / craft stock
    { item: 'coal', count: 32 },
    { item: 'charcoal', count: 16 },
    { item: 'iron_ingot', count: 32 },
    { item: 'iron_nugget', count: 18 },
    { item: 'stick', count: 32 },
    { item: 'string', count: 8 },
    // Food
    { item: 'bread', count: 16 },
    { item: 'cooked_beef', count: 16 },
    { item: 'cooked_porkchop', count: 8 },
    { item: 'apple', count: 8 },
    // Light farm start
    { item: 'wheat_seeds', count: 16 },
    { item: 'bone_meal', count: 8 }
  ];
}

export function formatGiveCommand(username, item, count) {
  const name = String(item || '').includes(':') ? String(item) : `minecraft:${item}`;
  return `/give ${username} ${name} ${Math.max(1, Math.min(64, Number(count) || 1))}`;
}

/**
 * Equip armor pieces if present in inventory (best-effort).
 */
export async function equipIronKitArmor(bot) {
  const pieces = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'];
  for (const piece of pieces) {
    const item = bot.inventory?.items?.().find((entry) => entry.name === piece);
    if (!item) continue;
    try {
      await bot.equip(item, piece.includes('helmet') ? 'head'
        : piece.includes('chestplate') ? 'torso'
          : piece.includes('leggings') ? 'legs'
            : 'feet');
    } catch {
      // Best effort — slots may already be filled.
    }
  }
  const sword = bot.inventory?.items?.().find((entry) => entry.name === 'iron_sword');
  if (sword) {
    try {
      await bot.equip(sword, 'hand');
    } catch {
      // ignore
    }
  }
  const shield = bot.inventory?.items?.().find((entry) => entry.name === 'shield');
  if (shield) {
    try {
      await bot.equip(shield, 'off-hand');
    } catch {
      // ignore
    }
  }
}

/**
 * Give kit via /give. Requires bot op on the Paper server.
 */
export async function applyStarterKit(bot, memory, config = {}, options = {}) {
  const enabled = config.starterKitEnabled !== false;
  if (!enabled && !options.force) {
    return { ok: false, reason: 'starter kit disabled', message: 'Starter kit is disabled in config.' };
  }

  const once = config.starterKitOncePerSession !== false;
  const mem = memory?.get?.() || {};
  if (once && mem.starterKitAppliedThisSession && !options.force) {
    return { ok: true, skipped: true, message: 'Starter kit already applied this session.' };
  }

  const username = bot.username || config.botUsername || 'tj';
  const kit = getIronDownKitSpec(config);
  if (!kit.length) return { ok: false, reason: 'empty kit', message: 'Starter kit list is empty.' };

  const delayMs = Math.max(50, Number(config.starterKitGiveDelayMs || 120));
  let given = 0;
  const failures = [];

  for (const entry of kit) {
    try {
      bot.chat(formatGiveCommand(username, entry.item, entry.count));
      given += 1;
      await sleep(delayMs);
    } catch (error) {
      failures.push(`${entry.item}: ${error.message || error}`);
    }
  }

  // Small pause so items register, then equip armor/tools.
  await sleep(400);
  try {
    await equipIronKitArmor(bot);
  } catch {
    // ignore equip failures
  }

  memory?.update?.({
    starterKitAppliedThisSession: true,
    starterKitLastAppliedAt: Date.now(),
    lastAction: 'starter kit',
    lastActionAt: Date.now()
  });

  const message = failures.length
    ? `Starter kit partial (${given}/${kit.length}). If items missing, op ${username} on the server.`
    : `Iron-down kit ready (${given} stacks): iron tools/armor, building blocks, food, torches.`;

  return {
    ok: failures.length === 0,
    message,
    evidence: ['starter_kit_applied'],
    data: { given, total: kit.length, failures }
  };
}

export function shouldAutoApplyStarterKit(config = {}, memory = null) {
  if (config.starterKitEnabled === false) return false;
  if (config.starterKitOnSpawn === false) return false;
  const mem = typeof memory?.get === 'function' ? memory.get() : memory || {};
  if (config.starterKitOncePerSession !== false && mem.starterKitAppliedThisSession) return false;
  return true;
}
