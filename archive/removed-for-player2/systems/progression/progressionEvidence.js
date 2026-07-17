import { loadMapMemory, getKnownNetherPortal, getKnownOverworldPortal } from '../../mapMemory.js';
import { getEvidenceDefinition } from '../../progressEvidence.js';
import { summarizeVillagerMemory, listKnownTrades, listKnownVillagers, listKnownVillages } from '../villagers/villagerMemory.js';
import { getBuildHistory, getBlueprintBuildStats } from '../blueprints/blueprintMemory.js';

const FOOD_NAMES = new Set([
  'apple', 'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_cod', 'cooked_salmon', 'baked_potato', 'carrot', 'potato', 'beef', 'porkchop',
  'chicken', 'mutton', 'cod', 'salmon', 'melon_slice', 'pumpkin_pie', 'cookie'
]);

export const PROGRESSION_EVIDENCE_DEFINITIONS = [
  def('bot_connected', 'core', 'Bot has an entity in the world.'),
  def('owner_only_confirmed', 'core', 'Owner-only command model is configured.'),
  def('emergency_stop_available', 'core', 'Emergency stop/cancellation system is present.'),
  def('skill_system_ready', 'core', 'Skill registry is loaded.'),
  def('evidence_system_ready', 'core', 'Evidence tracking is loaded.'),

  def('food_count_at_least_6', 'inventory', 'Inventory contains at least six food items.'),
  def('log_count_at_least_16', 'inventory', 'Inventory contains at least sixteen logs.'),
  def('cobblestone_count_at_least_32', 'inventory', 'Inventory contains at least thirty-two cobblestone or stone blocks.'),
  def('coal_count_at_least_8', 'inventory', 'Inventory contains at least eight coal or charcoal.'),
  def('torch_count_at_least_16', 'inventory', 'Inventory contains at least sixteen torches.'),
  def('iron_ingot_count_at_least_8', 'inventory', 'Inventory contains at least eight iron ingots.'),
  def('has_pickaxe', 'inventory', 'Inventory or equipment contains any pickaxe.'),
  def('has_stone_pickaxe', 'inventory', 'Inventory or equipment contains a stone pickaxe or better early pickaxe.'),
  def('has_iron_pickaxe', 'inventory', 'Inventory or equipment contains an iron pickaxe or better.'),
  def('has_weapon', 'inventory', 'Inventory or equipment contains a sword or axe.'),
  def('has_shield', 'inventory', 'Inventory or offhand contains a shield.'),
  def('has_gold_armor_piece', 'inventory', 'Inventory or equipment contains a gold armor piece.'),
  def('has_flint_and_steel', 'inventory', 'Inventory contains flint and steel.'),
  def('has_obsidian_10', 'inventory', 'Inventory contains at least ten obsidian.'),

  def('armor_equipped', 'equipment', 'At least one armor piece appears equipped.'),
  def('iron_armor_equipped', 'equipment', 'Iron armor appears equipped.'),
  def('shield_equipped', 'equipment', 'Shield appears equipped or available.'),
  def('gold_armor_equipped', 'equipment', 'A gold armor piece appears equipped.'),
  def('weapon_equipped', 'equipment', 'A weapon appears equipped or available.'),

  def('home_set', 'base', 'Home is saved in memory.'),
  def('near_home', 'base', 'Bot is close to home.'),
  def('storage_known', 'base', 'Storage is registered in memory.'),
  def('crafting_table_known', 'base', 'Crafting table is known in memory.'),
  def('furnace_known', 'base', 'Furnace is known in memory.'),
  def('shelter_known', 'base', 'Shelter/camp history exists.'),
  def('home_lit', 'base', 'Home lighting memory exists.'),
  def('bed_known', 'base', 'Bed is known in memory.'),

  def('farm_registered', 'food', 'A farm is registered in memory.'),
  def('wheat_farm_registered', 'food', 'A wheat farm is registered in memory.'),
  def('crops_available', 'food', 'Crops or crop locations are known.'),
  def('cooked_food_available', 'food', 'Cooked food is available in inventory.'),
  def('animal_pen_registered', 'animals', 'An animal pen is registered in memory.'),
  def('animals_in_pen', 'animals', 'Animal pen memory exists.'),

  def('mining_ready', 'mining', 'Mining readiness has enough food, tool, and basic supplies.'),
  def('coal_acquired', 'mining', 'Coal is available in inventory or known memory.'),
  def('raw_iron_acquired', 'mining', 'Raw iron or iron ore is available in inventory.'),
  def('iron_smelted', 'mining', 'Iron ingot is available in inventory.'),
  def('safe_mine_known', 'mining', 'A mine entrance is known.'),
  def('mining_loot_deposited', 'mining', 'Mining history shows loot deposit or storage is known.'),

  def('waypoint_created', 'exploration', 'At least one waypoint is known.'),
  def('home_waypoint_known', 'exploration', 'Home or home-like waypoint is known.'),
  def('danger_zone_marked', 'exploration', 'A danger zone is known.'),
  def('scout_completed', 'exploration', 'Exploration history indicates a scout was completed.'),
  def('returned_from_scout', 'exploration', 'Exploration return target/history indicates return behavior.'),

  def('combat_ready', 'combat', 'Combat readiness has weapon, health, and basic gear.'),
  def('threat_scan_reported', 'combat', 'Threat scan was reported or combat status exists.'),
  def('survived_hostile_encounter', 'combat', 'Combat history indicates survival.'),
  def('protected_owner_reported', 'combat', 'Owner protection has been reported or enabled.'),

  def('nether_supplies_ready', 'nether', 'Nether prep supplies appear ready.'),
  def('portal_known', 'nether', 'An Overworld or Nether portal is known.'),
  def('overworld_portal_remembered', 'nether', 'Overworld portal is remembered.'),
  def('nether_portal_remembered', 'nether', 'Nether portal is remembered.'),
  def('nether_entry_completed', 'nether', 'Memory records at least one Nether entry.'),
  def('returned_from_nether', 'nether', 'Memory records a Nether exit.'),

  def('gear_status_reported', 'gear', 'Gear status was reported.'),
  def('gear_upgrade_status_reported', 'gear', 'Gear upgrade status was reported.'),
  def('enchant_status_reported', 'gear', 'Enchanting status was reported.'),
  def('enchant_options_reported', 'gear', 'Enchanting options were reported.'),
  def('enchanting_table_known', 'gear', 'An enchantment table is nearby, in inventory, or remembered.'),
  def('lapis_available', 'gear', 'Lapis is available in inventory.'),
  def('xp_level_reported', 'gear', 'XP level was reported.'),
  def('lapis_count_reported', 'gear', 'Lapis count was reported.'),
  def('first_enchanted_item', 'gear', 'At least one enchanted item exists in inventory.'),
  def('anvil_status_reported', 'gear', 'Anvil status was reported.'),
  def('anvil_known', 'gear', 'An anvil is nearby, in inventory, or remembered.'),
  def('item_repaired', 'gear', 'A repair was reported by the anvil system.'),
  def('book_applied', 'gear', 'A book application was reported by the anvil system.'),
  def('enchanted_book_inventory_reported', 'gear', 'Enchanted book inventory was reported.'),
  def('potion_status_reported', 'gear', 'Potion status was reported.'),
  def('fire_resistance_available', 'gear', 'Fire resistance potion is available.'),
  def('brewing_status_reported', 'gear', 'Brewing status was reported.'),
  def('nether_gear_ready', 'gear', 'Nether gear readiness was reported or verified.'),
  def('armor_upgraded', 'gear', 'Armor score or quality has improved.'),
  def('mining_pickaxe_upgraded', 'gear', 'A strong pickaxe is available.'),
  def('combat_weapon_upgraded', 'gear', 'A strong weapon is available.'),

  def('village_found', 'villagers', 'A village or possible village is remembered.'),
  def('villager_seen', 'villagers', 'At least one villager has been seen or remembered.'),
  def('villager_profession_recorded', 'villagers', 'At least one villager profession is recorded.'),
  def('villager_trade_inspected', 'villagers', 'At least one villager trade has been inspected.'),
  def('trade_options_reported', 'villagers', 'Trade options have been reported.'),
  def('emerald_count_reported', 'villagers', 'Emerald count/economy status has been reported or emeralds exist.'),
  def('trade_completed', 'villagers', 'At least one owner-confirmed villager trade has completed.'),
  def('emeralds_spent', 'villagers', 'Emerald spending has been recorded.'),
  def('emeralds_earned', 'villagers', 'Emerald earning has been recorded.'),
  def('valuable_trade_found', 'villagers', 'A valuable trade has been found or remembered.'),
  def('librarian_found', 'villagers', 'A librarian villager has been found or remembered.'),
  def('mending_trade_found', 'villagers', 'A possible or verified mending trade has been found.'),
  def('villager_memory_updated', 'villagers', 'Villager economy memory has been updated.'),
  def('village_waypoint_created', 'villagers', 'A village or villager waypoint has been remembered.'),
  def('trading_post_known', 'villagers', 'A useful trading post or village waypoint is known.'),
  def('villager_protected_reported', 'villagers', 'Village protection status has been reported.'),

  def('blueprint_status_reported', 'blueprints', 'Blueprint status was reported.'),
  def('blueprint_list_reported', 'blueprints', 'Built-in blueprints were listed.'),
  def('blueprint_preview_created', 'blueprints', 'A blueprint preview was created.'),
  def('blueprint_materials_checked', 'blueprints', 'Blueprint materials were checked.'),
  def('blueprint_plan_created', 'blueprints', 'A blueprint build plan was created.'),
  def('blueprint_build_approved', 'blueprints', 'A blueprint build was owner-approved.'),
  def('blueprint_build_started', 'blueprints', 'A blueprint build started.'),
  def('blueprint_block_placed', 'blueprints', 'A blueprint block was placed.'),
  def('blueprint_block_verified', 'blueprints', 'A blueprint block was verified.'),
  def('blueprint_build_partial', 'blueprints', 'A blueprint build partially completed.'),
  def('blueprint_build_completed', 'blueprints', 'A blueprint build completed.'),
  def('blueprint_build_failed', 'blueprints', 'A blueprint build failed.'),
  def('blueprint_build_cancelled', 'blueprints', 'A blueprint build was cancelled.'),
  def('blueprint_missing_materials_reported', 'blueprints', 'Missing blueprint materials were reported.'),
  def('schematic_status_reported', 'blueprints', 'Schematic import status was reported.'),
  def('schematic_import_unsupported', 'blueprints', 'Schematic import was reported disabled or unsupported.'),
  futureDef('schematic_imported', 'blueprints', 'Future imported schematic evidence.'),

  def('bridge_status_reported', 'bridge', 'Server plugin bridge status was reported.'),
  def('bridge_connected', 'bridge', 'Server plugin bridge was reachable.'),
  def('bridge_unavailable', 'bridge', 'Server plugin bridge was unavailable gracefully.'),
  def('bridge_event_received', 'bridge', 'A validated bridge event was received.'),
  def('bridge_emergency_stop_received', 'bridge', 'A bridge emergency stop event was received.'),
  def('bridge_region_registered', 'bridge', 'A bridge region was registered.'),
  def('bridge_region_deleted', 'bridge', 'A bridge region was deleted.'),
  def('bridge_player_death_recorded', 'bridge', 'A player death event was recorded by the bridge.'),
  def('bridge_player_respawn_recorded', 'bridge', 'A player respawn event was recorded by the bridge.'),
  def('bridge_advancement_recorded', 'bridge', 'An advancement event was recorded by the bridge.'),
  def('bridge_protected_region_event', 'bridge', 'A protected-region bridge event was recorded.'),
  def('bridge_villager_event_recorded', 'bridge', 'A villager or golem bridge event was recorded.'),
  def('bridge_portal_event_recorded', 'bridge', 'A portal bridge event was recorded.'),
  def('bridge_danger_event_recorded', 'bridge', 'A bridge danger event was recorded.'),

  futureDef('villager_trade_completed', 'future', 'Future villager trading evidence.'),
  futureDef('blaze_rod_acquired', 'future', 'Future Nether progression evidence.'),
  futureDef('fortress_found', 'future', 'Future fortress discovery evidence.'),
  futureDef('ender_pearl_acquired', 'future', 'Future End preparation evidence.'),
  futureDef('stronghold_found', 'future', 'Future stronghold evidence.'),
  futureDef('end_portal_found', 'future', 'Future End portal evidence.'),
  futureDef('dragon_defeated', 'future', 'Future dragon completion evidence.')
];

function def(name, category, description) {
  return { name, category, description, implemented: true };
}

function futureDef(name, category, description) {
  return { name, category, description, implemented: false, verificationMode: 'future' };
}

function now() {
  return Date.now();
}

function readMemory(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function point(position) {
  if (!position) return null;
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
  };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function inventoryItems(bot) {
  try {
    if (typeof bot?.inventory?.items === 'function') return bot.inventory.items();
  } catch {
    return [];
  }
  return [];
}

function inventoryCounts(bot) {
  const counts = {};
  for (const item of inventoryItems(bot)) {
    const name = item?.name;
    if (!name) continue;
    counts[name] = (counts[name] || 0) + (item.count || 1);
  }
  return counts;
}

function slotItems(bot) {
  return Array.isArray(bot?.inventory?.slots) ? bot.inventory.slots.filter(Boolean) : [];
}

function hasItemMatching(snapshot, predicate) {
  return Object.keys(snapshot.inventory.counts).some(predicate) || snapshot.inventory.slotNames.some(predicate);
}

function countMatching(snapshot, predicate) {
  let total = 0;
  for (const [name, count] of Object.entries(snapshot.inventory.counts)) {
    if (predicate(name)) total += count;
  }
  return total;
}

function status(name, passed, details = {}, source = 'world_state') {
  return createProgressionEvidenceRecord(name, passed ? 'verified' : 'unknown', details, source, passed ? 'high' : 'low');
}

function reported(name, details = {}, source = 'memory') {
  return createProgressionEvidenceRecord(name, 'reported', details, source, 'medium');
}

function failed(name, details = {}, source = 'world_state') {
  return createProgressionEvidenceRecord(name, 'failed', details, source, 'medium');
}

function future(name, details = {}) {
  return createProgressionEvidenceRecord(name, 'future', details, 'progressionEvidence', 'low');
}

export function getProgressionEvidenceDefinitions() {
  return PROGRESSION_EVIDENCE_DEFINITIONS.map((item) => ({ ...item }));
}

export function getProgressionEvidenceDefinition(name) {
  return PROGRESSION_EVIDENCE_DEFINITIONS.find((item) => item.name === name) || null;
}

export function collectProgressionSnapshot(bot, memory) {
  const data = readMemory(memory);
  const mapMemory = loadMapMemory();
  const position = point(bot?.entity?.position);
  const home = point(data.homeBasePosition);
  const counts = inventoryCounts(bot);
  const slots = slotItems(bot);
  const dimension = bot?.game?.dimension || data.homeBaseDimension || 'overworld';
  return {
    createdAt: now(),
    botConnected: Boolean(bot?.entity),
    position,
    dimension,
    health: Number(bot?.health ?? 0),
    food: Number(bot?.food ?? 0),
    inventory: {
      counts,
      slotNames: slots.map((item) => item.name).filter(Boolean),
      freeSlots: typeof bot?.inventory?.emptySlotCount === 'function' ? bot.inventory.emptySlotCount() : null
    },
    home: {
      exists: Boolean(home),
      position: home,
      distance: position && home ? distance(position, home) : Infinity
    },
    memory: data,
    mapMemory
  };
}

export function verifyMilestoneEvidence(bot, memory, milestone, context = {}) {
  const evidenceNames = Array.isArray(milestone?.successEvidence) ? milestone.successEvidence : [];
  const snapshot = context.snapshot || collectProgressionSnapshot(bot, memory);
  return evidenceNames.map((evidenceName) => verifyEvidenceForMilestone(bot, memory, evidenceName, { ...context, snapshot }));
}

export function verifyEvidenceForMilestone(bot, memory, evidenceName, context = {}) {
  const snapshot = context.snapshot || collectProgressionSnapshot(bot, memory);
  const data = snapshot.memory || {};
  const mapMemory = snapshot.mapMemory || {};
  const definition = getProgressionEvidenceDefinition(evidenceName);
  if (definition?.verificationMode === 'future') return future(evidenceName);

  const baseDefinition = getEvidenceDefinition(evidenceName);
  if (!definition && baseDefinition) {
    return createProgressionEvidenceRecord(evidenceName, 'unknown', { message: 'Run the matching skill/action to create shared evidence for this item.' }, 'progressEvidence', 'low');
  }

  switch (evidenceName) {
    case 'bot_connected':
      return status(evidenceName, snapshot.botConnected, { connected: snapshot.botConnected });
    case 'owner_only_confirmed':
      return status(evidenceName, true, { ownerOnly: true }, 'config');
    case 'emergency_stop_available':
      return status(evidenceName, Boolean(bot?.mcaiCancellation || data.lastManualStopAt !== undefined), { cancellationKnown: Boolean(bot?.mcaiCancellation) }, 'safety');
    case 'skill_system_ready':
    case 'evidence_system_ready':
      return status(evidenceName, true, {}, 'module');
    case 'food_count_at_least_6':
      return status(evidenceName, countMatching(snapshot, (name) => FOOD_NAMES.has(name)) >= 6, { count: countMatching(snapshot, (name) => FOOD_NAMES.has(name)) });
    case 'log_count_at_least_16':
      return status(evidenceName, countMatching(snapshot, (name) => /_log$|_stem$/.test(name)) >= 16, { count: countMatching(snapshot, (name) => /_log$|_stem$/.test(name)) });
    case 'cobblestone_count_at_least_32':
      return status(evidenceName, countMatching(snapshot, (name) => ['cobblestone', 'stone', 'cobbled_deepslate'].includes(name)) >= 32, { count: countMatching(snapshot, (name) => ['cobblestone', 'stone', 'cobbled_deepslate'].includes(name)) });
    case 'coal_count_at_least_8':
      return status(evidenceName, (snapshot.inventory.counts.coal || 0) + (snapshot.inventory.counts.charcoal || 0) >= 8, { count: (snapshot.inventory.counts.coal || 0) + (snapshot.inventory.counts.charcoal || 0) });
    case 'torch_count_at_least_16':
      return status(evidenceName, (snapshot.inventory.counts.torch || 0) >= 16, { count: snapshot.inventory.counts.torch || 0 });
    case 'iron_ingot_count_at_least_8':
      return status(evidenceName, (snapshot.inventory.counts.iron_ingot || 0) >= 8, { count: snapshot.inventory.counts.iron_ingot || 0 });
    case 'has_pickaxe':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name.endsWith('_pickaxe')));
    case 'has_stone_pickaxe':
      return status(evidenceName, hasItemMatching(snapshot, (name) => ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].includes(name)));
    case 'has_iron_pickaxe':
      return status(evidenceName, hasItemMatching(snapshot, (name) => ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].includes(name)));
    case 'has_weapon':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name.endsWith('_sword') || name.endsWith('_axe')));
    case 'has_shield':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name === 'shield'));
    case 'has_gold_armor_piece':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name.startsWith('golden_') && /helmet|chestplate|leggings|boots/.test(name)));
    case 'has_flint_and_steel':
      return status(evidenceName, (snapshot.inventory.counts.flint_and_steel || 0) > 0);
    case 'has_obsidian_10':
      return status(evidenceName, (snapshot.inventory.counts.obsidian || 0) >= 10, { count: snapshot.inventory.counts.obsidian || 0 });
    case 'armor_equipped':
      return status(evidenceName, snapshot.inventory.slotNames.some((name) => /helmet|chestplate|leggings|boots/.test(name)));
    case 'iron_armor_equipped':
      return status(evidenceName, snapshot.inventory.slotNames.some((name) => name.startsWith('iron_') && /helmet|chestplate|leggings|boots/.test(name)));
    case 'shield_equipped':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name === 'shield'));
    case 'gold_armor_equipped':
      return status(evidenceName, snapshot.inventory.slotNames.some((name) => name.startsWith('golden_') && /helmet|chestplate|leggings|boots/.test(name)));
    case 'weapon_equipped':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name.endsWith('_sword') || name.endsWith('_axe')));
    case 'home_set':
      return status(evidenceName, snapshot.home.exists, { home: snapshot.home.position });
    case 'near_home':
      return status(evidenceName, snapshot.home.exists && snapshot.home.distance <= 16, { distance: snapshot.home.distance });
    case 'storage_known':
      return status(evidenceName, Array.isArray(data.knownStorageChests) && data.knownStorageChests.length > 0, { count: data.knownStorageChests?.length || 0 });
    case 'crafting_table_known':
      return status(evidenceName, Boolean(data.knownCraftingTableLocation || data.knownCraftingTables?.length), { count: data.knownCraftingTables?.length || 0 });
    case 'furnace_known':
      return status(evidenceName, Boolean(data.knownFurnaceLocation || data.knownFurnaces?.length), { count: data.knownFurnaces?.length || 0 });
    case 'shelter_known':
      return status(evidenceName, Array.isArray(data.baseBuildHistory) && data.baseBuildHistory.length > 0);
    case 'home_lit':
      return status(evidenceName, Array.isArray(data.knownTorchPositions) && data.knownTorchPositions.length > 0);
    case 'bed_known':
      return status(evidenceName, Array.isArray(data.knownBeds) && data.knownBeds.length > 0);
    case 'farm_registered':
      return status(evidenceName, Array.isArray(data.knownFarms) && data.knownFarms.length > 0);
    case 'wheat_farm_registered':
      return status(evidenceName, Array.isArray(data.knownFarms) && data.knownFarms.some((farm) => /wheat/i.test(JSON.stringify(farm))));
    case 'crops_available':
      return status(evidenceName, Boolean(data.knownCropLocations?.length || snapshot.inventory.counts.wheat || snapshot.inventory.counts.wheat_seeds));
    case 'cooked_food_available':
      return status(evidenceName, countMatching(snapshot, (name) => name.startsWith('cooked_') || name === 'bread' || name === 'baked_potato') > 0);
    case 'animal_pen_registered':
    case 'animals_in_pen':
      return status(evidenceName, Array.isArray(data.knownAnimalPens) && data.knownAnimalPens.length > 0);
    case 'mining_ready':
      return status(evidenceName, snapshot.health >= 14 && countMatching(snapshot, (name) => FOOD_NAMES.has(name)) >= 6 && hasItemMatching(snapshot, (name) => name.endsWith('_pickaxe')));
    case 'coal_acquired':
      return status(evidenceName, (snapshot.inventory.counts.coal || 0) > 0 || (data.knownCoalLocations?.length || 0) > 0);
    case 'raw_iron_acquired':
      return status(evidenceName, (snapshot.inventory.counts.raw_iron || 0) > 0 || (snapshot.inventory.counts.iron_ore || 0) > 0);
    case 'iron_smelted':
      return status(evidenceName, (snapshot.inventory.counts.iron_ingot || 0) > 0);
    case 'safe_mine_known':
      return status(evidenceName, Array.isArray(data.knownMineEntrances) && data.knownMineEntrances.length > 0);
    case 'mining_loot_deposited':
      return status(evidenceName, Boolean(data.miningHistory?.some((run) => /deposit|stored/i.test(JSON.stringify(run))) || data.knownStorageChests?.length));
    case 'waypoint_created':
      return status(evidenceName, Array.isArray(mapMemory.waypoints) && mapMemory.waypoints.length > 0);
    case 'home_waypoint_known':
      return status(evidenceName, Array.isArray(mapMemory.waypoints) && mapMemory.waypoints.some((wp) => /home|base/i.test(wp.name || wp.type || '')));
    case 'danger_zone_marked':
      return status(evidenceName, Array.isArray(mapMemory.dangerZones) && mapMemory.dangerZones.length > 0);
    case 'scout_completed':
      return status(evidenceName, Boolean(data.lastExplorationReport || data.explorationBreadcrumbs?.length));
    case 'returned_from_scout':
      return status(evidenceName, Boolean(data.lastWaypointVisited || data.explorationReturnTarget || data.lastExplorationReport));
    case 'combat_ready':
      return status(evidenceName, snapshot.health >= 14 && hasItemMatching(snapshot, (name) => name.endsWith('_sword') || name.endsWith('_axe')));
    case 'threat_scan_reported':
      return reported(evidenceName, { lastThreatScanAt: data.lastThreatScanAt || 0 }, data.lastThreatScanAt ? 'memory' : 'progression');
    case 'survived_hostile_encounter':
      return status(evidenceName, Boolean(data.lastCombatEndedAt || data.combatKills > 0));
    case 'protected_owner_reported':
      return reported(evidenceName, { combatMode: data.combatMode || 'off' });
    case 'nether_supplies_ready':
      return status(evidenceName, countMatching(snapshot, (name) => FOOD_NAMES.has(name)) >= 16 && (snapshot.inventory.counts.obsidian || 0) >= 10 && hasItemMatching(snapshot, (name) => name.startsWith('golden_') && /helmet|chestplate|leggings|boots/.test(name)));
    case 'portal_known':
      return status(evidenceName, Boolean(data.overworldPortalPosition || data.netherPortalPosition || getKnownOverworldPortal(mapMemory) || getKnownNetherPortal(mapMemory)));
    case 'overworld_portal_remembered':
      return status(evidenceName, Boolean(data.overworldPortalPosition || getKnownOverworldPortal(mapMemory)));
    case 'nether_portal_remembered':
      return status(evidenceName, Boolean(data.netherPortalPosition || getKnownNetherPortal(mapMemory)));
    case 'nether_entry_completed':
      return status(evidenceName, (data.netherEntryCount || 0) > 0 || Boolean(data.lastNetherEntryAt));
    case 'returned_from_nether':
      return status(evidenceName, Boolean(data.lastNetherExitAt));
    case 'gear_status_reported':
    case 'gear_upgrade_status_reported':
    case 'enchant_status_reported':
    case 'enchant_options_reported':
    case 'anvil_status_reported':
    case 'potion_status_reported':
    case 'brewing_status_reported':
    case 'xp_level_reported':
    case 'lapis_count_reported':
    case 'enchanted_book_inventory_reported':
      return reported(evidenceName, {}, 'action_result');
    case 'enchanting_table_known':
      return status(evidenceName, Boolean(snapshot.inventory.counts.enchanting_table || data.knownEnchantingTableLocation || data.knownEnchantmentTableLocation));
    case 'lapis_available':
      return status(evidenceName, (snapshot.inventory.counts.lapis_lazuli || 0) > 0, { count: snapshot.inventory.counts.lapis_lazuli || 0 });
    case 'first_enchanted_item':
      return status(evidenceName, snapshot.inventory.slotNames.some((name) => name === 'enchanted_book' || name.includes('enchanted')), { note: 'Limited inventory-name based check.' });
    case 'anvil_known':
      return status(evidenceName, Boolean(snapshot.inventory.counts.anvil || data.knownAnvilLocation), { inventoryAnvils: snapshot.inventory.counts.anvil || 0 });
    case 'fire_resistance_available':
      return status(evidenceName, snapshot.inventory.slotNames.some((name) => name.includes('potion')) || Boolean(snapshot.inventory.counts.potion), { note: 'Potion type may require NBT inspection.' }, 'inventory');
    case 'nether_gear_ready':
      return status(evidenceName, hasItemMatching(snapshot, (name) => name.startsWith('golden_') && /(helmet|chestplate|leggings|boots)$/.test(name)) && hasItemMatching(snapshot, (name) => /(iron|diamond|netherite)_(helmet|chestplate|leggings|boots)$/.test(name)), {}, 'inventory');
    case 'mining_pickaxe_upgraded':
      return status(evidenceName, hasItemMatching(snapshot, (name) => ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].includes(name)));
    case 'combat_weapon_upgraded':
      return status(evidenceName, hasItemMatching(snapshot, (name) => ['iron_sword', 'diamond_sword', 'netherite_sword', 'bow', 'crossbow'].includes(name)));
    case 'armor_upgraded':
      return status(evidenceName, hasItemMatching(snapshot, (name) => /(iron|diamond|netherite)_(helmet|chestplate|leggings|boots)$/.test(name)));
    case 'item_repaired':
    case 'book_applied':
      return reported(evidenceName, { message: 'Requires recent anvil action evidence.' }, 'gear_memory');
    case 'village_found': {
      const villages = listKnownVillages();
      return status(evidenceName, villages.length > 0, { count: villages.length }, 'villager_memory');
    }
    case 'villager_seen': {
      const villagers = listKnownVillagers();
      return status(evidenceName, villagers.length > 0, { count: villagers.length }, 'villager_memory');
    }
    case 'villager_profession_recorded': {
      const villagers = listKnownVillagers().filter((villager) => villager.profession && villager.profession !== 'unknown');
      return status(evidenceName, villagers.length > 0, { count: villagers.length }, 'villager_memory');
    }
    case 'villager_trade_inspected': {
      const trades = listKnownTrades();
      return status(evidenceName, trades.length > 0, { count: trades.length }, 'villager_memory');
    }
    case 'trade_options_reported':
      return reported(evidenceName, { trades: summarizeVillagerMemory().trades }, 'villager_memory');
    case 'emerald_count_reported':
      return status(evidenceName, (snapshot.inventory.counts.emerald || 0) > 0, { emeralds: snapshot.inventory.counts.emerald || 0 }, 'inventory');
    case 'trade_completed': {
      const summary = summarizeVillagerMemory();
      return status(evidenceName, summary.economyStats.tradesCompleted > 0, { tradesCompleted: summary.economyStats.tradesCompleted }, 'villager_memory');
    }
    case 'emeralds_spent':
      return status(evidenceName, summarizeVillagerMemory().economyStats.emeraldsSpent > 0, { emeraldsSpent: summarizeVillagerMemory().economyStats.emeraldsSpent }, 'villager_memory');
    case 'emeralds_earned':
      return status(evidenceName, summarizeVillagerMemory().economyStats.emeraldsEarned > 0, { emeraldsEarned: summarizeVillagerMemory().economyStats.emeraldsEarned }, 'villager_memory');
    case 'valuable_trade_found': {
      const trades = listKnownTrades({ valuable: true });
      return status(evidenceName, trades.length > 0, { count: trades.length }, 'villager_memory');
    }
    case 'librarian_found': {
      const librarians = listKnownVillagers({ profession: 'librarian' });
      return status(evidenceName, librarians.length > 0, { count: librarians.length }, 'villager_memory');
    }
    case 'mending_trade_found': {
      const trades = listKnownTrades().filter((trade) => /mending/i.test(`${trade.offered} ${trade.notes} ${trade.priceSummary}`));
      return status(evidenceName, trades.length > 0, { count: trades.length }, 'villager_memory');
    }
    case 'villager_memory_updated':
      return reported(evidenceName, summarizeVillagerMemory(), 'villager_memory');
    case 'village_waypoint_created': {
      const waypoints = Array.isArray(mapMemory.waypoints) ? mapMemory.waypoints : [];
      return status(evidenceName, waypoints.some((wp) => /village|villager|librarian|trading/i.test(`${wp.type} ${wp.name}`)), { count: waypoints.length }, 'map_memory');
    }
    case 'trading_post_known':
      return status(evidenceName, listKnownVillages().length > 0 || listKnownVillagers({ valuable: true }).length > 0, summarizeVillagerMemory(), 'villager_memory');
    case 'villager_protected_reported':
      return reported(evidenceName, { message: 'Village protection is a warning/status system in Phase 14.' }, 'villager_system');
    case 'blueprint_status_reported':
    case 'blueprint_list_reported':
    case 'blueprint_preview_created':
    case 'blueprint_materials_checked':
    case 'blueprint_plan_created':
    case 'blueprint_missing_materials_reported':
    case 'schematic_status_reported':
    case 'schematic_import_unsupported':
      return reported(evidenceName, {}, 'action_result');
    case 'blueprint_build_approved':
    case 'blueprint_build_started':
    case 'blueprint_block_placed':
    case 'blueprint_block_verified':
    case 'blueprint_build_partial':
    case 'blueprint_build_completed':
    case 'blueprint_build_failed':
    case 'blueprint_build_cancelled': {
      const history = getBuildHistory(100);
      const found = history.some((build) => (build.evidence || []).includes(evidenceName)
        || build.status === evidenceName.replace(/^blueprint_build_/, '').replace('partial', 'paused'));
      return status(evidenceName, found, { builds: history.length }, 'blueprint_memory');
    }
    case 'bridge_status_reported':
    case 'bridge_connected':
    case 'bridge_unavailable':
      return reported(evidenceName, { bridge: data?.recentBridgeEvents?.length || 0 }, 'bridge');
    case 'bridge_event_received':
    case 'bridge_emergency_stop_received':
    case 'bridge_region_registered':
    case 'bridge_region_deleted':
    case 'bridge_player_death_recorded':
    case 'bridge_player_respawn_recorded':
    case 'bridge_advancement_recorded':
    case 'bridge_protected_region_event':
    case 'bridge_villager_event_recorded':
    case 'bridge_portal_event_recorded':
    case 'bridge_danger_event_recorded': {
      const recent = Array.isArray(data?.recentBridgeEvents) ? data.recentBridgeEvents : [];
      const found = recent.some((event) => {
        const haystack = `${event.type || ''} ${event.message || ''}`;
        if (evidenceName === 'bridge_event_received') return true;
        if (evidenceName === 'bridge_emergency_stop_received') return /emergency_stop/.test(haystack);
        if (evidenceName === 'bridge_region_registered') return /region_registered/.test(haystack);
        if (evidenceName === 'bridge_region_deleted') return /region_deleted/.test(haystack);
        if (evidenceName === 'bridge_player_death_recorded') return /player_death/.test(haystack);
        if (evidenceName === 'bridge_player_respawn_recorded') return /player_respawn/.test(haystack);
        if (evidenceName === 'bridge_advancement_recorded') return /advancement/.test(haystack);
        if (evidenceName === 'bridge_protected_region_event') return /region/.test(haystack);
        if (evidenceName === 'bridge_villager_event_recorded') return /villager|golem/.test(haystack);
        if (evidenceName === 'bridge_portal_event_recorded') return /portal/.test(haystack);
        if (evidenceName === 'bridge_danger_event_recorded') return /hostile|explosion|ignite|danger/.test(haystack);
        return false;
      });
      return status(evidenceName, found, { recentBridgeEvents: recent.length }, 'bridge');
    }
    default:
      if (definition) return createProgressionEvidenceRecord(evidenceName, 'unknown', { message: 'No verifier implemented yet.' }, 'progressionEvidence', 'low');
      return createProgressionEvidenceRecord(evidenceName, 'unknown', { message: 'Unknown progression evidence.' }, 'progressionEvidence', 'low');
  }
}

export function compareProgressionEvidence(before, after, milestone) {
  return {
    milestoneId: milestone?.id || 'unknown',
    beforeAt: before?.createdAt || 0,
    afterAt: after?.createdAt || 0,
    changedInventoryItems: Object.keys(after?.inventory?.counts || {}).filter((name) => (after.inventory.counts[name] || 0) !== (before?.inventory?.counts?.[name] || 0))
  };
}

export function createProgressionEvidenceRecord(name, statusValue, details = {}, source = 'progressionEvidence', confidence = 'medium') {
  const allowed = new Set(['verified', 'reported', 'partial', 'failed', 'unknown', 'blocked', 'future']);
  return {
    name,
    status: allowed.has(statusValue) ? statusValue : 'unknown',
    category: getProgressionEvidenceDefinition(name)?.category || getEvidenceDefinition(name)?.category || 'progression',
    source,
    confidence,
    details,
    createdAt: now()
  };
}

export function summarizeMilestoneEvidence(milestone, evidenceRecords) {
  const records = Array.isArray(evidenceRecords) ? evidenceRecords : [];
  const verified = records.filter((item) => item.status === 'verified').map((item) => item.name);
  const reported = records.filter((item) => item.status === 'reported').map((item) => item.name);
  const missing = records.filter((item) => ['unknown', 'failed', 'blocked', 'future'].includes(item.status)).map((item) => item.name);
  if (!records.length) return `${milestone?.name || milestone?.id || 'Milestone'} has no evidence records yet.`;
  const parts = [];
  if (verified.length) parts.push(`verified: ${verified.join(', ')}`);
  if (reported.length) parts.push(`reported: ${reported.join(', ')}`);
  if (missing.length) parts.push(`missing/blocked: ${missing.join(', ')}`);
  return parts.join('; ');
}

export function validateProgressionEvidenceNames(registryOrMilestones) {
  const milestones = Array.isArray(registryOrMilestones) ? registryOrMilestones : [];
  const errors = [];
  for (const milestone of milestones) {
    for (const evidenceName of milestone.successEvidence || []) {
      if (!getProgressionEvidenceDefinition(evidenceName) && !getEvidenceDefinition(evidenceName)) {
        errors.push(`${milestone.id} references unknown evidence ${evidenceName}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function evidenceIsSatisfied(record) {
  return ['verified', 'reported'].includes(record?.status);
}
