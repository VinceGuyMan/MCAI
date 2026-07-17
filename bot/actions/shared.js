/**
 * Shared action helpers and evidence maps.
 * Extracted from actions.js for maintainability.
 */
export function normalizeActionCount(value, fallback = 1, { min = 1, max = 64 } = {}) {
  let candidate = value;
  if (candidate && typeof candidate === 'object') {
    candidate = candidate.count ?? candidate.targetCount ?? candidate.amount ?? candidate.quantity ?? fallback;
  }
  const parsed = Number.parseInt(String(candidate), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function pickActionString(args, keys) {
  if (!args || typeof args !== 'object') return '';
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function adaptActionArguments(actionName, args = {}) {
  if (Array.isArray(args?._positional)) return args._positional;
  if (!args || typeof args !== 'object' || !Object.keys(args).length) return null;

  const count = normalizeActionCount(args, 1);
  const itemName = pickActionString(args, ['itemName', 'item', 'name', 'blockName', 'resourceName']);
  const toolType = pickActionString(args, ['toolType', 'tool', 'type']);

  switch (actionName) {
    case 'gatherWood':
    case 'resourceRunWood':
    case 'resourceRunStone':
    case 'resourceRunCoal':
    case 'resourceRunFood':
    case 'mineCoal':
    case 'mineIron':
    case 'mineStone':
    case 'mine_coal':
    case 'mine_iron':
    case 'mine_stone':
      return [normalizeActionCount(args, {
        resourceRunWood: 16,
        resourceRunStone: 32,
        resourceRunCoal: 8,
        resourceRunFood: 6,
        mineStone: 1,
        mine_stone: 1
      }[actionName] || 8)];
    case 'craftItem':
    case 'craft_item':
      return itemName ? [itemName, count, args] : null;
    case 'craftGenericTool':
    case 'craft_generic_tool':
      return [toolType || itemName];
    case 'equipTool':
    case 'equip_tool':
      return [toolType || itemName || args.query || args.text || ''];
    case 'giveOwnerItem':
    case 'bringItemToOwner':
    case 'dropItem':
    case 'withdrawItem':
      return itemName ? [itemName, count] : null;
    case 'collectDropsAction':
      return [itemName || null];
    case 'countInventory':
      return [itemName || toolType || args.category || args.query || ''];
    default:
      return null;
  }
}

export const actionEvidenceMap = {
  status: ['status_reported'],
  inventory_summary: ['inventory_reported'],
  inventory_status: ['inventory_reported'],
  home_status: ['home_status_reported'],
  mining_status: ['mining_status_reported'],
  farming_status: ['farming_status_reported'],
  nether_checklist: ['nether_checklist_reported'],
  skills_status: ['skills_status_reported'],
  food_status: ['food_status_reported'],
  find_food: ['food_count_increased_or_reason_reported'],
  get_food: ['food_count_increased_or_reason_reported'],
  eat_if_hungry: ['food_status_reported'],
  equip_tool: ['tool_equipped'],
  cook_food: ['cooked_food_count_increased_or_reason_reported'],
  hunt_passive_food: ['food_count_increased_or_reason_reported'],
  fish_for_food: ['food_count_increased_or_reason_reported'],
  gather_plant_food: ['food_count_increased_or_reason_reported'],
  armor_status: ['armor_status_reported'],
  storage_status: ['storage_status_reported'],
  map_status: ['map_status_reported'],
  goals_status: ['goals_status_reported'],
  combat_status: ['combat_status_reported'],
  evidence_status: ['evidence_status_reported'],
  skill_audit: ['skill_audit_reported'],
  natural_router_status: ['natural_router_status_reported'],
  natural_test: ['natural_router_status_reported'],
  competent_core_status: ['status_reported'],
  core_macros: ['status_reported'],
  run_core_macro: ['status_reported'],
  core_recover: ['status_reported'],
  core_test: ['status_reported'],
  natural_learning_status: ['natural_learning_reported'],
  competency_status: ['competency_reported'],
  reliable_skills: ['competency_reported'],
  shaky_skills: ['competency_reported'],
  untested_skills: ['competency_reported'],
  session_events: ['session_events_reported'],
  interaction_mode: ['interaction_mode_reported'],
  set_interaction_mode: ['interaction_mode_reported'],
  test_plan: ['test_plan_reported'],
  idle_status: ['idle_status_reported'],
  idle_on: ['idle_status_reported'],
  idle_off: ['idle_status_reported'],
  idle_memory_updated: ['idle_memory_updated'],

  vanilla_advancement_status: ['vanilla_advancement_status_reported'],
  gear_status: ['gear_status_reported'],
  gear_upgrade_status: ['gear_upgrade_status_reported'],
  suggest_gear_upgrades: ['gear_upgrade_status_reported'],
  suggest_next_gear_upgrade: ['gear_upgrade_status_reported'],
  create_gear_upgrade_plan: ['gear_upgrade_plan_created'],
  enchant_status: ['enchant_status_reported'],
  enchant_item: ['enchant_status_reported'],
  enchant_held_item: ['enchant_status_reported'],
  enchant_best_candidate: ['enchant_status_reported'],
  anvil_status: ['anvil_status_reported'],
  repair_item: ['anvil_status_reported'],
  combine_items: ['anvil_status_reported'],
  apply_book_to_item: ['anvil_status_reported'],
  rename_item: ['anvil_status_reported'],
  potion_status: ['potion_status_reported'],
  use_potion: ['potion_status_reported'],
  carry_potion_loadout: ['potion_status_reported'],
  brewing_status: ['brewing_status_reported'],
  brew_potion: ['brewing_status_reported'],
  brew_fire_resistance: ['brewing_status_reported'],
  upgrade_readiness: ['gear_upgrade_status_reported'],
  nether_gear_readiness: ['nether_gear_ready'],
  villager_status: ['villager_seen'],
  scan_villagers: ['villager_seen', 'villager_profession_recorded'],
  village_status: ['village_found'],
  remember_village: ['village_waypoint_created'],
  remember_villager: ['villager_memory_updated'],
  trading_status: ['trade_options_reported'],
  inspect_villager_trades: ['villager_trade_inspected', 'trade_options_reported'],
  list_known_trades: ['trade_options_reported'],
  best_known_trades: ['valuable_trade_found'],
  economy_status: ['emerald_count_reported'],
  suggest_trades: ['valuable_trade_found'],
  execute_approved_trade: ['trade_completed'],
  trade_history: ['trade_options_reported'],
  valuable_villagers: ['villager_memory_updated'],
  protect_villager_status: ['villager_protected_reported'],
  village_protection_status: ['villager_protected_reported'],
  blueprint_status: ['blueprint_status_reported'],
  list_blueprints: ['blueprint_list_reported'],
  blueprint_preview: ['blueprint_preview_created'],
  blueprint_materials: ['blueprint_materials_checked'],
  blueprint_plan: ['blueprint_plan_created'],
  blueprint_build_approved: ['blueprint_build_approved'],
  blueprint_start_build: ['blueprint_build_started'],
  blueprint_continue_build: ['blueprint_build_partial'],
  blueprint_pause_build: ['blueprint_build_partial'],
  blueprint_resume_build: ['blueprint_build_partial'],
  blueprint_cancel_build: ['blueprint_build_cancelled'],
  blueprint_progress: ['blueprint_status_reported'],
  blueprint_history: ['blueprint_status_reported'],
  schematic_status: ['schematic_status_reported'],
  schematic_import_status: ['schematic_status_reported', 'schematic_import_unsupported'],
  server_bridge_status: ['bridge_status_reported'],
  server_status: ['bridge_status_reported'],
  bridge_health: ['bridge_status_reported'],
  bridge_recent_events: ['bridge_event_received'],
  bridge_recent_deaths: ['bridge_player_death_recorded'],
  bridge_recent_advancements: ['bridge_advancement_recorded'],
  bridge_regions: ['bridge_status_reported'],
  bridge_register_region: ['bridge_region_registered'],
  bridge_delete_region: ['bridge_region_deleted'],
  bridge_emergency_stop: ['bridge_emergency_stop_received'],
  mineflayer_plugin_status: ['plugin_status_reported'],
  plugin_wrapper_status: ['plugin_status_reported'],
  plugin_path_to_owner: ['returned_safely'],
  plugin_collect_blocks: ['block_collected'],
  plugin_eat_safely: ['food_status_reported'],
  plugin_follow_owner: ['follow_goal_set'],
  thin_status: ['status_reported'],
  thin_stop: ['stop_requested'],
  thin_come_to_owner: ['returned_safely'],
  thin_follow_owner: ['follow_goal_set'],
  thin_stay: ['path_goal_cleared'],
  collect_resource: ['resource_count_increased_or_reason_reported'],
  thin_collect_resource: ['resource_count_increased_or_reason_reported'],
  thin_eat_if_hungry: ['food_status_reported'],
  thin_equip_tool_for: ['tool_equipped_or_reason_reported'],
  thin_equip_armor: ['armor_equipped_or_reason_reported'],
  thin_craft_item: ['craft_result_reported'],
  thin_store_items: ['items_deposited_or_reason_reported'],
  thin_return_home: ['near_home_or_reason_reported'],
  thin_remember_home: ['home_set'],
  thin_missing_requirements: ['missing_requirements_reported']
};

export const contextAwareActions = new Set([
  'run_core_macro',
  'core_test',
  'core_recover',
  'competent_core_status',
  'core_macros',
  'mineflayer_plugin_status',
  'plugin_wrapper_status',
  'plugin_path_to_owner',
  'plugin_follow_owner',
  'plugin_collect_blocks',
  'plugin_eat_safely',
  'thin_status',
  'thin_stop',
  'thin_come_to_owner',
  'thin_follow_owner',
  'thin_stay',
  'collect_resource',
  'thin_collect_resource',
  'thin_eat_if_hungry',
  'thin_equip_tool_for',
  'thin_equip_armor',
  'thin_craft_item',
  'thin_store_items',
  'thin_return_home',
  'thin_remember_home',
  'thin_missing_requirements'
]);

export const thinResultActions = new Set([
  'thin_status',
  'thin_stop',
  'thin_come_to_owner',
  'thin_follow_owner',
  'thin_stay',
  'collect_resource',
  'thin_collect_resource',
  'thin_eat_if_hungry',
  'thin_equip_tool_for',
  'thin_equip_armor',
  'thin_craft_item',
  'thin_store_items',
  'thin_return_home',
  'thin_remember_home',
  'thin_missing_requirements'
]);

export const logNames = [
  'oak_log',
  'birch_log',
  'spruce_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'mangrove_log',
  'cherry_log'
];

export const foodNames = new Set([
  'apple',
  'baked_potato',
  'beetroot',
  'beetroot_soup',
  'bread',
  'carrot',
  'chicken',
  'cod',
  'cookie',
  'cooked_beef',
  'cooked_chicken',
  'cooked_cod',
  'cooked_mutton',
  'cooked_porkchop',
  'cooked_rabbit',
  'cooked_salmon',
  'dried_kelp',
  'glow_berries',
  'golden_apple',
  'golden_carrot',
  'honey_bottle',
  'melon_slice',
  'mushroom_stew',
  'mutton',
  'porkchop',
  'potato',
  'pumpkin_pie',
  'rabbit',
  'rabbit_stew',
  'salmon',
  'sweet_berries',
  'tropical_fish',
  'beef'
]);

export const toolPreference = {
  logs: ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'],
  stone: ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']
};

export const toolTypeAliases = new Map([
  ['ax', 'axe'],
  ['axe', 'axe'],
  ['axr', 'axe'],
  ['pick', 'pickaxe'],
  ['pick_axe', 'pickaxe'],
  ['pickaxe', 'pickaxe'],
  ['shovel', 'shovel'],
  ['spade', 'shovel'],
  ['hoe', 'hoe'],
  ['sword', 'sword']
]);

export const toolMaterialAliases = new Map([
  ['wood', 'wooden'],
  ['wooden', 'wooden'],
  ['stone', 'stone'],
  ['iron', 'iron'],
  ['gold', 'golden'],
  ['golden', 'golden'],
  ['diamond', 'diamond'],
  ['netherite', 'netherite']
]);

export const toolMaterialRanks = {
  wooden: 1,
  golden: 1.5,
  stone: 2,
  iron: 3,
  diamond: 4,
  netherite: 5
};

export function normalizeToolRequest(request = '') {
  const normalized = String(request || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^equipt?_?/, '')
    .replace(/^equip_?/, '')
    .replace(/^best_?/, '')
    .replace(/^a_/, '')
    .replace(/^an_/, '')
    .replace(/^the_/, '')
    .replace(/_tool$/, '')
    .trim();
  const parts = normalized.split('_').filter(Boolean);
  let material = null;
  let type = null;
  for (const part of parts) {
    if (!material && toolMaterialAliases.has(part)) material = toolMaterialAliases.get(part);
    if (!type && toolTypeAliases.has(part)) type = toolTypeAliases.get(part);
  }
  if (!type && toolTypeAliases.has(normalized)) type = toolTypeAliases.get(normalized);
  return {
    material,
    type,
    exactName: material && type ? `${material}_${type}` : null,
    normalized
  };
}

export function itemDurabilityLeft(item) {
  if (!item || typeof item.durabilityUsed !== 'number' || typeof item.maxDurability !== 'number') return null;
  return item.maxDurability - item.durabilityUsed;
}

export function toolCandidates(bot, toolType, material = null) {
  const items = bot.inventory?.items?.() || [];
  return items
    .filter((item) => item?.name?.endsWith(`_${toolType}`))
    .filter((item) => !material || item.name === `${material}_${toolType}`)
    .sort((a, b) => {
      const materialA = a.name.replace(`_${toolType}`, '');
      const materialB = b.name.replace(`_${toolType}`, '');
      const rankDelta = (toolMaterialRanks[materialB] || 0) - (toolMaterialRanks[materialA] || 0);
      if (rankDelta !== 0) return rankDelta;
      return (itemDurabilityLeft(b) ?? 9999) - (itemDurabilityLeft(a) ?? 9999);
    });
}

export function bestToolItem(bot, toolType, material = null) {
  return toolCandidates(bot, toolType, material)[0] || null;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function posText(pos) {
  if (!pos) return 'unknown';
  return `${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
}

export function distance(bot, entity) {
  if (!bot.entity || !entity) return Infinity;
  return bot.entity.position.distanceTo(entity.position);
}

