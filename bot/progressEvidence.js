const EVIDENCE_DEFINITIONS = [
  def('status_reported', 'status', 'Status action returned a status report.', 'action_result'),
  def('skills_status_reported', 'status', 'Skill registry status was reported.', 'action_result'),
  def('skill_audit_reported', 'status', 'Skill registry audit was reported.', 'action_result'),
  def('evidence_status_reported', 'status', 'Evidence status was reported.', 'action_result'),
  def('natural_router_status_reported', 'status', 'Natural command router status or routing result was reported.', 'action_result'),
  def('natural_examples_reported', 'status', 'Natural speech command examples were reported.', 'action_result'),
  def('natural_learning_reported', 'status', 'Natural command learning mappings were reported or updated.', 'action_result'),
  def('competency_reported', 'status', 'Competency and reliability status was reported.', 'action_result'),
  def('session_events_reported', 'status', 'Recent high-level session events were reported.', 'action_result'),
  def('interaction_mode_reported', 'status', 'Interaction mode or command learning preference was reported.', 'action_result'),
  def('test_plan_reported', 'status', 'Manual competency test plan was reported.', 'action_result'),
  def('idle_status_reported', 'status', 'Idle autonomy status was reported.', 'action_result'),
  def('idle_memory_updated', 'status', 'Idle autonomy memory or suggestion suppression was updated.', 'action_result'),
  def('idle_autonomy_ran', 'status', 'Idle autonomy ran one safe idle behavior.', 'action_result'),
  def('curriculum_status_reported', 'status', 'Curriculum status was reported.', 'action_result'),
  def('curriculum_suggestion_reported', 'status', 'Curriculum suggestions were reported.', 'action_result'),
  def('curriculum_track_reported', 'status', 'Curriculum track was reported.', 'action_result'),
  def('curriculum_history_reported', 'status', 'Curriculum suggestion history was reported.', 'action_result'),
  def('curriculum_execution_status_reported', 'curriculum', 'Curriculum execution status was reported.', 'action_result'),
  def('curriculum_approved', 'curriculum', 'A curriculum session was approved by the owner.', 'curriculum'),
  def('curriculum_track_approved', 'curriculum', 'A curriculum track was approved by the owner.', 'curriculum'),
  def('curriculum_skill_approved', 'curriculum', 'A curriculum skill was approved by the owner.', 'curriculum'),
  def('curriculum_step_started', 'curriculum', 'A curriculum step was started.', 'curriculum'),
  def('curriculum_step_completed', 'curriculum', 'A curriculum step completed successfully.', 'curriculum'),
  def('curriculum_step_failed', 'curriculum', 'A curriculum step failed.', 'curriculum'),
  def('curriculum_step_partial', 'curriculum', 'A curriculum step produced partial evidence.', 'curriculum'),
  def('curriculum_step_cancelled', 'curriculum', 'A curriculum step was cancelled.', 'curriculum'),
  def('curriculum_step_timed_out', 'curriculum', 'A curriculum step timed out.', 'curriculum'),
  def('curriculum_paused', 'curriculum', 'Curriculum execution was paused.', 'curriculum'),
  def('curriculum_resumed', 'curriculum', 'Curriculum execution was resumed.', 'curriculum'),
  def('curriculum_completed', 'curriculum', 'A curriculum session completed.', 'curriculum'),
  def('curriculum_failed', 'curriculum', 'A curriculum session failed.', 'curriculum'),
  def('curriculum_blocked', 'curriculum', 'A curriculum session or step was blocked by safety rules.', 'curriculum'),
  def('curriculum_evidence_recorded', 'curriculum', 'Curriculum execution recorded underlying skill evidence.', 'curriculum'),

  def('progression_status_reported', 'progression', 'Progression status was reported.', 'action_result'),
  def('progression_summary_reported', 'progression', 'Progression summary was reported.', 'action_result'),
  def('progression_check_completed', 'progression', 'Progression check completed.', 'action_result'),
  def('progression_milestones_reported', 'progression', 'Progression milestones were reported.', 'action_result'),
  def('progression_suggestion_reported', 'progression', 'Progression suggestions were reported.', 'action_result'),
  def('progression_path_reported', 'progression', 'Progression path was reported.', 'action_result'),
  def('progression_plan_reported', 'progression', 'Progression plan was reported.', 'action_result'),
  def('progression_history_reported', 'progression', 'Progression history was reported.', 'action_result'),
  def('progression_manual_completion_recorded', 'progression', 'Manual milestone completion was recorded after confirmation.', 'action_result'),
  def('progression_manual_block_recorded', 'progression', 'Manual milestone block was recorded after confirmation.', 'action_result'),
  def('progression_goal_requested', 'progression', 'Progression goal creation was requested.', 'action_result'),
  def('progression_curriculum_requested', 'progression', 'Progression curriculum creation was requested.', 'action_result'),
  def('progression_reset_reported', 'progression', 'Progression reset was requested or completed.', 'action_result'),
  def('vanilla_advancement_status_reported', 'progression', 'Vanilla advancement bridge status was reported.', 'action_result'),
  def('manual_owner_confirmation', 'progression', 'Owner manually confirmed a progression correction.', 'action_result'),

  def('gear_status_reported', 'gear', 'Gear status was reported.', 'action_result'),
  def('gear_upgrade_status_reported', 'gear', 'Gear upgrade status or recommendations were reported.', 'action_result'),
  def('enchant_status_reported', 'gear', 'Enchanting readiness was reported.', 'action_result'),
  def('enchant_options_reported', 'gear', 'Enchanting options were inspected or reported.', 'action_result'),
  def('item_enchanted', 'gear', 'An item was enchanted and evidence was recorded.', 'world_state'),
  def('anvil_status_reported', 'gear', 'Anvil readiness/options were reported.', 'action_result'),
  def('item_repaired', 'gear', 'An item was repaired and evidence was recorded.', 'world_state'),
  def('items_combined', 'gear', 'Items were combined with an anvil.', 'world_state'),
  def('book_applied', 'gear', 'An enchanted book was applied to an item.', 'world_state'),
  def('item_renamed', 'gear', 'An item was renamed with an anvil.', 'world_state'),
  def('potion_status_reported', 'gear', 'Potion inventory/readiness was reported.', 'action_result'),
  def('potion_used', 'gear', 'A potion was used after confirmation.', 'world_state'),
  def('brewing_status_reported', 'gear', 'Brewing readiness/support status was reported.', 'action_result'),
  def('potion_brewed', 'gear', 'A potion was brewed and inventory evidence was recorded.', 'world_state', false),
  def('nether_gear_ready', 'gear', 'Nether gear readiness was verified or reported.', 'action_result'),
  def('gear_upgrade_plan_created', 'gear', 'A draft gear upgrade plan was created.', 'action_result'),
  def('gear_upgrade_step_completed', 'gear', 'A gear upgrade step completed.', 'action_result'),
  def('xp_level_reported', 'gear', 'XP level was reported.', 'action_result'),
  def('lapis_count_reported', 'gear', 'Lapis count was reported.', 'action_result'),
  def('enchanted_book_inventory_reported', 'gear', 'Enchanted book inventory was reported.', 'action_result'),

  def('village_found', 'villagers', 'A possible or confirmed village was found from visible evidence.', 'world_state'),
  def('villager_seen', 'villagers', 'A villager was seen nearby.', 'world_state'),
  def('villager_profession_recorded', 'villagers', 'A villager profession was recorded when visible or inferable.', 'world_state'),
  def('villager_trade_inspected', 'villagers', 'Villager trades were inspected through the trade window.', 'action_result'),
  def('trade_options_reported', 'villagers', 'Trade options were reported without executing a trade.', 'action_result'),
  def('emerald_count_reported', 'villagers', 'Emerald count and trade budget were reported.', 'action_result'),
  def('trade_completed', 'villagers', 'A confirmed villager trade completed with inventory/economy evidence.', 'world_state'),
  def('emeralds_spent', 'villagers', 'Emerald spending was recorded.', 'world_state'),
  def('emeralds_earned', 'villagers', 'Emerald earning was recorded.', 'world_state'),
  def('valuable_trade_found', 'villagers', 'A potentially valuable villager trade was found.', 'action_result'),
  def('librarian_found', 'villagers', 'A librarian villager was found or remembered.', 'world_state'),
  def('mending_trade_found', 'villagers', 'A possible or verified mending trade was found.', 'world_state'),
  def('villager_memory_updated', 'villagers', 'Village, villager, or trade memory was updated.', 'action_result'),
  def('village_waypoint_created', 'villagers', 'A village or villager waypoint was saved.', 'action_result'),
  def('villager_protected_reported', 'villagers', 'Village protection status or warning was reported.', 'action_result'),

  def('blueprint_status_reported', 'blueprints', 'Blueprint system status was reported.', 'action_result'),
  def('blueprint_list_reported', 'blueprints', 'Available built-in blueprints were listed.', 'action_result'),
  def('blueprint_preview_created', 'blueprints', 'A blueprint preview was created without placing blocks.', 'action_result'),
  def('blueprint_materials_checked', 'blueprints', 'Blueprint material requirements were checked.', 'action_result'),
  def('blueprint_plan_created', 'blueprints', 'A deterministic blueprint build plan was created.', 'action_result'),
  def('blueprint_build_approved', 'blueprints', 'A blueprint build was approved by the owner.', 'action_result'),
  def('blueprint_build_started', 'blueprints', 'A blueprint build run started.', 'world_state'),
  def('blueprint_block_placed', 'blueprints', 'A blueprint block was placed.', 'world_state'),
  def('blueprint_block_verified', 'blueprints', 'A placed blueprint block was verified in the world.', 'world_state'),
  def('blueprint_build_partial', 'blueprints', 'A blueprint build partially completed and paused.', 'world_state'),
  def('blueprint_build_completed', 'blueprints', 'A blueprint build completed with block verification evidence.', 'world_state'),
  def('blueprint_build_failed', 'blueprints', 'A blueprint build failed.', 'world_state'),
  def('blueprint_build_cancelled', 'blueprints', 'A blueprint build was cancelled.', 'world_state'),
  def('blueprint_missing_materials_reported', 'blueprints', 'Missing blueprint materials were reported.', 'action_result'),
  def('schematic_status_reported', 'blueprints', 'Schematic import status was reported.', 'action_result'),
  def('schematic_import_unsupported', 'blueprints', 'Schematic import was honestly reported as unsupported or disabled.', 'action_result'),
  def('schematic_imported', 'blueprints', 'An imported schematic was parsed into a safe blueprint.', 'world_state', false),

  def('bridge_status_reported', 'bridge', 'Server plugin bridge status was reported.', 'action_result'),
  def('bridge_connected', 'bridge', 'The local server plugin bridge was reachable.', 'server_bridge'),
  def('bridge_unavailable', 'bridge', 'The local server plugin bridge was unavailable without crashing tj.', 'server_bridge'),
  def('bridge_event_received', 'bridge', 'A validated server plugin bridge event was received.', 'server_bridge'),
  def('bridge_emergency_stop_received', 'bridge', 'An emergency stop event was received from the server plugin bridge.', 'server_bridge'),
  def('bridge_region_registered', 'bridge', 'A protected or watched region was registered with the server plugin bridge.', 'server_bridge'),
  def('bridge_region_deleted', 'bridge', 'A bridge region was deleted.', 'server_bridge'),
  def('bridge_player_death_recorded', 'bridge', 'A player death event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_player_respawn_recorded', 'bridge', 'A player respawn event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_advancement_recorded', 'bridge', 'An advancement event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_protected_region_event', 'bridge', 'A protected-region event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_villager_event_recorded', 'bridge', 'A villager or iron golem event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_portal_event_recorded', 'bridge', 'A portal event was recorded by the server plugin bridge.', 'server_bridge'),
  def('bridge_danger_event_recorded', 'bridge', 'A danger event was recorded by the server plugin bridge.', 'server_bridge'),

  def('inventory_reported', 'inventory', 'Inventory summary was reported.', 'action_result'),
  def('inventory_snapshot_captured', 'inventory', 'Inventory snapshot was captured.', 'snapshot'),
  def('inventory_count_available', 'inventory', 'Inventory item counts were available.', 'snapshot'),

  def('home_status_reported', 'base', 'Home/base status was reported.', 'action_result'),
  def('home_exists', 'base', 'Home exists in memory.', 'snapshot'),
  def('near_home', 'base', 'Bot is near the remembered home.', 'snapshot'),
  def('home_missing', 'base', 'Home is missing from memory.', 'snapshot'),

  def('mining_status_reported', 'mining', 'Mining status was reported.', 'action_result'),
  def('mining_ready_reported', 'mining', 'Mining readiness was reported.', 'action_result'),
  def('mining_not_ready_reported', 'mining', 'Mining not-ready state was reported.', 'action_result'),

  def('farming_status_reported', 'farming', 'Farm status was reported.', 'action_result'),
  def('farm_exists', 'farming', 'At least one farm exists in memory.', 'snapshot'),
  def('farm_missing', 'farming', 'No registered farm exists in memory.', 'snapshot'),
  def('farming_status_available', 'farming', 'Farm status data was available.', 'action_result'),

  def('nether_checklist_reported', 'nether', 'Nether checklist was reported.', 'action_result'),
  def('nether_ready', 'nether', 'Nether checklist reported ready.', 'action_result'),
  def('nether_not_ready', 'nether', 'Nether checklist reported missing supplies.', 'action_result'),
  def('missing_nether_supplies_reported', 'nether', 'Missing Nether supplies were reported.', 'action_result'),

  def('food_status_reported', 'food', 'Food status was reported.', 'action_result'),
  def('food_count_reported', 'food', 'Food count was reported.', 'action_result'),
  def('hunger_status_reported', 'food', 'Hunger status was reported.', 'action_result'),

  def('armor_status_reported', 'armor', 'Armor status was reported.', 'action_result'),
  def('armor_equipped_reported', 'armor', 'Equipped armor was reported.', 'action_result'),

  def('storage_status_reported', 'storage', 'Storage status was reported.', 'action_result'),
  def('storage_exists', 'storage', 'Registered storage exists in memory.', 'snapshot'),
  def('storage_missing', 'storage', 'Registered storage is missing.', 'snapshot'),

  def('map_status_reported', 'exploration', 'Map memory status was reported.', 'action_result'),
  def('known_places_reported', 'exploration', 'Known places were reported.', 'action_result'),

  def('goals_status_reported', 'goals', 'Goal status was reported.', 'action_result'),
  def('active_goal_reported', 'goals', 'An active goal was reported.', 'action_result'),

  def('combat_status_reported', 'combat', 'Combat status was reported.', 'action_result'),
  def('threats_reported', 'combat', 'Threat information was reported.', 'action_result'),

  def('skill_started', 'skill', 'Skill runner started a skill.', 'runner'),
  def('skill_completed', 'skill', 'Skill runner completed a skill.', 'runner'),
  def('skill_failed', 'skill', 'Skill runner failed a skill.', 'runner'),
  def('skill_cancelled', 'skill', 'Skill runner cancelled a skill.', 'runner'),
  def('skill_timed_out', 'skill', 'Skill runner timed out a skill.', 'runner'),
  def('action_result_ok', 'skill', 'The action returned ok=true.', 'action_result'),
  def('action_result_failed', 'skill', 'The action returned ok=false.', 'action_result'),

  futureDef('item_count_increased', 'future_action', 'Future proof for inventory increases.'),
  futureDef('item_count_decreased', 'future_action', 'Future proof for inventory decreases.'),
  futureDef('position_changed', 'future_action', 'Future proof for movement.'),
  futureDef('returned_to_owner', 'future_action', 'Future proof for owner return.'),
  futureDef('returned_home', 'future_action', 'Future proof for home return.'),
  futureDef('block_mined', 'future_action', 'Future proof for block mining.'),
  futureDef('block_placed', 'future_action', 'Future proof for block placement.'),
  futureDef('entity_defeated', 'future_action', 'Future proof for combat results.'),
  futureDef('crop_harvested', 'future_action', 'Future proof for crop harvest.'),
  futureDef('crop_replanted', 'future_action', 'Future proof for crop replant.'),
  futureDef('chest_deposited_items', 'future_action', 'Future proof for storage deposit.'),
  futureDef('portal_remembered', 'future_action', 'Future proof for portal memory.'),
  futureDef('waypoint_created', 'future_action', 'Future proof for waypoint creation.')
];

const EXTRA_FUTURE_EVIDENCE_NAMES = [
  'all_tasks_cancelled',
  'animal_lured_or_reason_reported',
  'animal_pen_registered_or_reason_reported',
  'animal_pen_status_reported',
  'animal_slaughter_completed',
  'animals_bred_or_reason_reported',
  'armor_score_increased_or_best_equipped',
  'arrived_at_waypoint_or_reason_reported',
  'base_guard_enabled_or_reason_reported',
  'base_maintenance_timestamp_updated',
  'basic_tool_count_increased_or_missing_reported',
  'bastion_search_completed',
  'brain_status_reported',
  'breadcrumbs_recorded',
  'camp_blocks_registered_or_reason_reported',
  'cave_exploration_completed',
  'cave_run_completed',
  'clarification_sent',
  'coal_count_increased',
  'coal_count_increased_or_reason_reported',
  'combat_gear_equipped_or_reason_reported',
  'combat_gear_status_reported',
  'conversation_fact_removed_or_not_found',
  'conversation_fact_saved',
  'conversation_memory_cleared',
  'conversation_memory_reported',
  'cooked_food_count_increased_or_reason_reported',
  'crafting_table_count_increased',
  'crop_count_increased_or_no_mature_crops',
  'crop_planted_or_reason_reported',
  'danger_scan_completed',
  'deep_mine_completed',
  'dialogue_reply_sent',
  'dialogue_status_reported',
  'diamond_armor_count_increased',
  'diamond_count_increased',
  'discoveries_recorded',
  'drops_collected_or_none_found',
  'eggs_collected_or_none_found',
  'empty_farmland_replanted_or_reason_reported',
  'farm_items_stored_or_reason_reported',
  'farm_maintenance_completed_or_reason_reported',
  'farm_registered_or_reason_reported',
  'fire_resistance_potion_brewed',
  'fish_attempted_or_reason_reported',
  'follow_goal_set',
  'food_count_increased_or_reason_reported',
  'food_level_improved_or_not_needed',
  'food_source_found_or_reason_reported',
  'fortress_search_completed',
  'goal_cancelled',
  'goal_created_or_pending_approval',
  'goal_paused',
  'goal_resumed_or_reason_reported',
  'goal_started_or_reason_reported',
  'goal_suggestions_reported',
  'help_reported',
  'home_position_saved',
  'home_torch_positions_recorded_or_reason_reported',
  'hostile_defeated_or_disengaged',
  'inventory_status_reported',
  'iron_armor_count_increased_or_missing_reported',
  'iron_count_increased_or_reason_reported',
  'item_count_increased_or_missing_reported',
  'item_count_reported',
  'item_dropped_or_refused',
  'item_transferred_or_reason_reported',
  'item_withdrawn_or_reason_reported',
  'items_deposited_or_reason_reported',
  'leather_armor_count_increased_or_missing_reported',
  'lighting_status_reported',
  'log_count_increased_or_reason_reported',
  'memory_status_reported',
  'milk_bucket_count_increased_or_reason_reported',
  'near_owner',
  'nether_danger_scan_reported',
  'nether_exploration_completed',
  'nether_gear_equipped_or_reason_reported',
  'nether_mining_completed',
  'nether_portal_remembered',
  'nether_status_reported',
  'nether_supplies_improved_or_missing_reported',
  'next_step_reported',
  'owner_defense_enabled_or_reason_reported',
  'path_goal_cleared',
  'personality_status_reported',
  'plank_count_increased',
  'portal_frame_built_or_reason_reported',
  'portal_lit_or_reason_reported',
  'portal_status_reported',
  'position_changed_or_failure_reported',
  'protected_attack_completed',
  'pvp_attack_completed',
  'retreat_attempted_or_reason_reported',
  'returned_if_unsafe',
  'returned_safely',
  'returned_to_overworld_or_reason_reported',
  'route_followed_or_reason_reported',
  'route_recording_started_or_saved',
  'safety_status_reported',
  'scan_reported',
  'shelter_history_recorded_or_reason_reported',
  'shelter_supply_count_increased_or_missing_reported',
  'sleep_attempted_or_reason_reported',
  'step_completed_failed_or_blocked',
  'stick_count_increased',
  'stone_count_increased_or_reason_reported',
  'stone_tool_count_increased_or_missing_reported',
  'storage_chest_registered',
  'storage_chest_registered_or_reason_reported',
  'storage_item_count_increased_or_missing_reported',
  'survival_supplies_count_increased_or_missing_reported',
  'survival_tick_completed',
  'task_status_reported',
  'threat_scan_reported',
  'tool_status_reported',
  'torch_count_increased_or_missing_reported',
  'torch_placed_or_reason_reported',
  'waypoint_saved',
  'waypoints_reported',
  'wool_count_increased_or_reason_reported',
  'workstation_blocks_registered_or_reason_reported'
];

const ALL_EVIDENCE_DEFINITIONS = [
  ...EVIDENCE_DEFINITIONS,
  ...EXTRA_FUTURE_EVIDENCE_NAMES
    .filter((name) => !EVIDENCE_DEFINITIONS.some((item) => item.name === name))
    .map((name) => futureDef(name, 'registry', 'Registered skill evidence scaffolded for future physical verification.'))
];

const definitionMap = new Map(ALL_EVIDENCE_DEFINITIONS.map((item) => [item.name, item]));

function def(name, category, description, verificationMode, implemented = true) {
  return { name, category, description, verificationMode, implemented };
}

function futureDef(name, category, description) {
  return def(name, category, description, 'future', false);
}

function now() {
  return Date.now();
}

function stateFromMemory(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function roundPosition(position) {
  if (!position) return null;
  return {
    x: Math.round(Number(position.x) || 0),
    y: Math.round(Number(position.y) || 0),
    z: Math.round(Number(position.z) || 0)
  };
}

function distance(a, b) {
  if (!a || !b) return null;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
  const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function inventoryCounts(bot) {
  const counts = {};
  for (const item of inventoryItems(bot)) {
    counts[item.name] = (counts[item.name] || 0) + (item.count || 0);
  }
  return counts;
}

function freeSlots(bot) {
  try {
    const items = inventoryItems(bot);
    return Math.max(0, 36 - items.length);
  } catch {
    return 0;
  }
}

export function captureInventorySnapshot(bot) {
  return {
    counts: inventoryCounts(bot),
    freeSlots: freeSlots(bot)
  };
}

export function capturePositionSnapshot(bot) {
  return roundPosition(bot?.entity?.position);
}

export function captureHealthSnapshot(bot) {
  return {
    health: Number(bot?.health) || 0,
    food: Number(bot?.food) || 0
  };
}

export function captureHomeSnapshot(botOrMemory, maybeMemory = null) {
  const memory = maybeMemory || botOrMemory;
  const state = stateFromMemory(memory);
  const home = state.homeBasePosition || state.home || null;
  const position = maybeMemory ? capturePositionSnapshot(botOrMemory) : null;
  return {
    exists: Boolean(home),
    position: home ? roundPosition(home) : null,
    distance: home && position ? distance(position, home) : null
  };
}

export function captureBasicSnapshot(bot, memory) {
  const state = stateFromMemory(memory);
  return {
    createdAt: now(),
    position: capturePositionSnapshot(bot),
    dimension: String(bot?.game?.dimension || 'overworld'),
    ...captureHealthSnapshot(bot),
    inventory: captureInventorySnapshot(bot),
    home: captureHomeSnapshot(bot, memory),
    task: {
      currentTask: state.currentTask?.name || state.currentTask || 'none'
    },
    farms: {
      count: Array.isArray(state.knownFarms) ? state.knownFarms.length : state.primaryFarmArea ? 1 : 0
    },
    storage: {
      count: Array.isArray(state.knownStorageChests) ? state.knownStorageChests.length : 0
    },
    goals: {
      activeGoalId: state.activeGoalId || null
    }
  };
}

export function captureSkillRelevantSnapshot(bot, memory, skill) {
  const snapshot = captureBasicSnapshot(bot, memory);
  snapshot.skillName = skill?.name || '';
  return snapshot;
}

export function captureBeforeSnapshot(bot, memory, skill, args = {}) {
  return { ...captureSkillRelevantSnapshot(bot, memory, skill), phase: 'before', args: sanitizeArgs(args) };
}

export function captureAfterSnapshot(bot, memory, skill, args = {}) {
  return { ...captureSkillRelevantSnapshot(bot, memory, skill), phase: 'after', args: sanitizeArgs(args) };
}

function sanitizeArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  return Object.fromEntries(Object.entries(args).slice(0, 12).map(([key, value]) => [key, typeof value === 'object' ? '[object]' : value]));
}

export function createEvidenceRecord(name, status, details = {}) {
  const definition = getEvidenceDefinition(name) || { category: 'unknown' };
  return {
    name,
    status,
    category: definition.category || 'unknown',
    source: details.source || 'unknown',
    confidence: details.confidence || 'low',
    details: details.details || {},
    createdAt: details.createdAt || now()
  };
}

export function getEvidenceDefinition(evidenceName) {
  return definitionMap.get(String(evidenceName || '').trim()) || null;
}

export function listEvidenceDefinitions() {
  return ALL_EVIDENCE_DEFINITIONS.map((item) => ({ ...item }));
}

export function listEvidenceByCategory(category) {
  const key = String(category || '').trim();
  return listEvidenceDefinitions().filter((item) => item.category === key);
}

export function normalizeEvidence(evidence) {
  if (!evidence) return [];
  const list = Array.isArray(evidence) ? evidence : [evidence];
  return list.map((item) => {
    if (typeof item === 'string') return createEvidenceRecord(item, 'reported', { source: 'normalized', confidence: 'low' });
    if (item && typeof item === 'object' && item.name) {
      return createEvidenceRecord(item.name, item.status || 'reported', {
        source: item.source || 'normalized',
        confidence: item.confidence || 'low',
        details: item.details || {},
        createdAt: item.createdAt
      });
    }
    return createEvidenceRecord('unknown', 'unknown', { source: 'normalized' });
  });
}

export function mergeEvidence(...evidenceLists) {
  const byName = new Map();
  for (const record of evidenceLists.flatMap((list) => normalizeEvidence(list))) {
    const previous = byName.get(record.name);
    if (!previous || statusRank(record.status) >= statusRank(previous.status)) byName.set(record.name, record);
  }
  return [...byName.values()];
}

function statusRank(status) {
  return {
    failed: 5,
    verified: 4,
    partial: 3,
    reported: 2,
    unknown: 1,
    skipped: 0
  }[status] ?? 0;
}

export function summarizeEvidence(evidenceList) {
  const records = normalizeEvidence(evidenceList);
  if (!records.length) return 'No evidence recorded.';
  const groups = records.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const verified = records.filter((item) => item.status === 'verified').map((item) => item.name).slice(0, 4);
  const failed = records.filter((item) => item.status === 'failed').map((item) => item.name).slice(0, 4);
  const parts = Object.entries(groups).map(([status, count]) => `${status}:${count}`);
  if (verified.length) parts.push(`verified ${verified.join(', ')}`);
  if (failed.length) parts.push(`failed ${failed.join(', ')}`);
  return parts.join('; ');
}

export function evidencePassed(evidenceList) {
  const records = normalizeEvidence(evidenceList);
  return records.some((item) => ['verified', 'reported', 'partial'].includes(item.status)) && !evidenceFailed(records);
}

export function evidenceFailed(evidenceList) {
  return normalizeEvidence(evidenceList).some((item) => item.status === 'failed');
}

export function evidenceUnknown(evidenceList) {
  const records = normalizeEvidence(evidenceList);
  return records.length === 0 || records.every((item) => ['unknown', 'skipped'].includes(item.status));
}

export function verifyEvidenceItem(bot, memory, evidenceName, context = {}) {
  const definition = getEvidenceDefinition(evidenceName);
  if (!definition) {
    return createEvidenceRecord(evidenceName, 'failed', {
      source: 'evidence_registry',
      confidence: 'high',
      details: { reason: 'unknown evidence definition' }
    });
  }
  if (!definition.implemented || definition.verificationMode === 'future') {
    return createEvidenceRecord(evidenceName, 'skipped', {
      source: 'evidence_registry',
      confidence: 'medium',
      details: { reason: 'future evidence definition' }
    });
  }

  const actionEvidence = new Set((context.actionResult?.evidence || []).map(String));
  const actionOk = context.actionResult?.ok === true;
  const actionFailed = context.actionResult?.ok === false;
  const after = context.afterSnapshot || {};

  if (['skill_started', 'skill_completed', 'skill_failed', 'skill_cancelled', 'skill_timed_out'].includes(evidenceName)) {
    return createEvidenceRecord(evidenceName, actionEvidence.has(evidenceName) || context.runnerEvidence?.includes(evidenceName) ? 'verified' : 'reported', {
      source: 'skillRunner',
      confidence: 'high'
    });
  }

  if (evidenceName === 'action_result_ok') {
    return createEvidenceRecord(evidenceName, actionOk ? 'verified' : 'failed', {
      source: 'action_result',
      confidence: 'high',
      details: { ok: context.actionResult?.ok }
    });
  }
  if (evidenceName === 'action_result_failed') {
    return createEvidenceRecord(evidenceName, actionFailed ? 'verified' : 'skipped', {
      source: 'action_result',
      confidence: 'high',
      details: { ok: context.actionResult?.ok }
    });
  }

  if (actionEvidence.has(evidenceName)) {
    return createEvidenceRecord(evidenceName, 'verified', {
      source: 'action_result',
      confidence: 'high',
      details: { message: context.actionResult?.message || '' }
    });
  }

  if (evidenceName === 'inventory_snapshot_captured') {
    return createEvidenceRecord(evidenceName, after.inventory ? 'verified' : 'failed', {
      source: 'snapshot',
      confidence: 'high'
    });
  }
  if (evidenceName === 'inventory_count_available') {
    return createEvidenceRecord(evidenceName, after.inventory?.counts ? 'verified' : 'failed', {
      source: 'snapshot',
      confidence: 'high'
    });
  }
  if (evidenceName === 'home_exists' || evidenceName === 'home_missing') {
    const exists = Boolean(after.home?.exists);
    return createEvidenceRecord(evidenceName, evidenceName === 'home_exists' ? exists ? 'verified' : 'failed' : exists ? 'failed' : 'verified', {
      source: 'snapshot',
      confidence: 'high',
      details: { homeExists: exists }
    });
  }
  if (evidenceName === 'near_home') {
    const near = typeof after.home?.distance === 'number' && after.home.distance <= 6;
    return createEvidenceRecord(evidenceName, near ? 'verified' : 'failed', {
      source: 'snapshot',
      confidence: 'medium',
      details: { distance: after.home?.distance ?? null }
    });
  }
  if (evidenceName === 'farm_exists' || evidenceName === 'farm_missing') {
    const exists = (after.farms?.count || 0) > 0;
    return createEvidenceRecord(evidenceName, evidenceName === 'farm_exists' ? exists ? 'verified' : 'failed' : exists ? 'failed' : 'verified', {
      source: 'snapshot',
      confidence: 'medium',
      details: { farmCount: after.farms?.count || 0 }
    });
  }
  if (evidenceName === 'storage_exists' || evidenceName === 'storage_missing') {
    const exists = (after.storage?.count || 0) > 0;
    return createEvidenceRecord(evidenceName, evidenceName === 'storage_exists' ? exists ? 'verified' : 'failed' : exists ? 'failed' : 'verified', {
      source: 'snapshot',
      confidence: 'medium',
      details: { storageCount: after.storage?.count || 0 }
    });
  }

  if (actionOk && definition.verificationMode === 'action_result') {
    return createEvidenceRecord(evidenceName, 'reported', {
      source: 'action_result',
      confidence: 'medium',
      details: { message: context.actionResult?.message || 'Action succeeded but did not provide named evidence.' }
    });
  }

  return createEvidenceRecord(evidenceName, 'unknown', {
    source: 'verifier',
    confidence: 'low',
    details: { reason: 'no verifier matched' }
  });
}

export function verifySkillEvidence(bot, memory, skill, args, beforeSnapshot, afterSnapshot, actionResult) {
  const runnerEvidence = actionResult?.ok ? ['skill_started', 'action_result_ok', 'skill_completed'] : ['skill_started', 'action_result_failed', 'skill_failed'];
  const evidenceNames = mergeEvidence(
    runnerEvidence,
    skill?.successEvidence || [],
    actionResult?.evidence || []
  ).map((record) => record.name);

  const evidence = evidenceNames.map((name) => verifyEvidenceItem(bot, memory, name, {
    skill,
    args,
    beforeSnapshot,
    afterSnapshot,
    actionResult,
    runnerEvidence
  }));

  return createEvidenceReport(skill?.name || '', evidence);
}

export function createEvidenceReport(skillName, evidenceList) {
  const evidence = normalizeEvidence(evidenceList);
  return {
    skillName,
    ok: evidencePassed(evidence),
    status: evidenceFailed(evidence) ? 'failed' : evidenceUnknown(evidence) ? 'unknown' : evidence.some((item) => item.status === 'partial') ? 'partial' : 'success',
    evidence,
    summary: summarizeEvidence(evidence),
    failed: evidence.filter((item) => item.status === 'failed'),
    unknown: evidence.filter((item) => item.status === 'unknown'),
    createdAt: now()
  };
}

export function explainEvidenceFailure(evidenceList) {
  const failed = normalizeEvidence(evidenceList).filter((item) => item.status === 'failed');
  if (!failed.length) return '';
  return failed.map((item) => `${item.name}: ${item.details?.reason || 'verification failed'}`).join('; ');
}

function skillMemoryEntry(skillName, skillMemory) {
  if (!skillName || !skillMemory?.skills) return null;
  return skillMemory.skills[String(skillName)];
}

export function getLastEvidenceForSkill(skillName, skillMemory) {
  const entry = skillMemoryEntry(skillName, skillMemory);
  if (Array.isArray(entry?.lastEvidence) && entry.lastEvidence.length) return normalizeEvidence(entry.lastEvidence);
  const recent = (skillMemory?.recentRuns || []).find((run) => run.skillName === skillName && Array.isArray(run.evidence));
  return recent ? normalizeEvidence(recent.evidence) : [];
}

export function getEvidenceSummaryForSkill(skillName, skillMemory) {
  const entry = skillMemoryEntry(skillName, skillMemory);
  if (entry?.lastEvidenceSummary) return entry.lastEvidenceSummary;
  const evidence = getLastEvidenceForSkill(skillName, skillMemory);
  return summarizeEvidence(evidence);
}

export function hasRecentVerifiedEvidence(skillName, skillMemory) {
  return getLastEvidenceForSkill(skillName, skillMemory).some((item) => item.status === 'verified');
}

export function hasRecentFailedEvidence(skillName, skillMemory) {
  return getLastEvidenceForSkill(skillName, skillMemory).some((item) => item.status === 'failed');
}

export function getEvidenceConfidenceForSkill(skillName, skillMemory) {
  const evidence = getLastEvidenceForSkill(skillName, skillMemory);
  if (evidence.some((item) => item.confidence === 'high' && item.status === 'verified')) return 'high';
  if (evidence.some((item) => ['verified', 'reported', 'partial'].includes(item.status))) return 'medium';
  if (evidence.length) return 'low';
  return 'unknown';
}

export function summarizeEvidenceForCurriculum(skillName, skillMemory) {
  const evidence = getLastEvidenceForSkill(skillName, skillMemory);
  if (!evidence.length) return 'No recent evidence.';
  const verified = evidence.filter((item) => item.status === 'verified').map((item) => item.name).slice(0, 3);
  const reported = evidence.filter((item) => item.status === 'reported').map((item) => item.name).slice(0, 3);
  const failed = evidence.filter((item) => item.status === 'failed').map((item) => item.name).slice(0, 3);
  if (failed.length) return `Recent failure evidence: ${failed.join(', ')}.`;
  if (verified.length) return `Last run verified: ${verified.join(', ')}.`;
  if (reported.length) return `Last run reported: ${reported.join(', ')}.`;
  return summarizeEvidence(evidence);
}

export function getEvidenceSummaryForMilestone(milestoneId) {
  return `Milestone ${milestoneId} uses progression evidence plus skill evidence where available.`;
}

export function getEvidenceFromSkillRuns(skillNames, skillMemory = {}) {
  return (Array.isArray(skillNames) ? skillNames : [skillNames])
    .filter(Boolean)
    .flatMap((skillName) => getLastEvidenceForSkill(skillName, skillMemory).map((item) => ({
      ...item,
      source: item.source || 'skillMemory',
      details: { ...(item.details || {}), skillName }
    })));
}

export function getEvidenceFromInventory(requiredItems = {}, inventoryCounts = {}) {
  return Object.entries(requiredItems || {}).map(([itemName, count]) => {
    const current = Number(inventoryCounts[itemName] || 0);
    return createEvidenceRecord(`inventory_${itemName}_at_least_${count}`, current >= Number(count) ? 'verified' : 'failed', {
      source: 'inventory',
      confidence: 'high',
      details: { itemName, required: Number(count), current }
    });
  });
}

export function getEvidenceFromMemory(keys = [], memory = {}) {
  const data = stateFromMemory(memory);
  return (Array.isArray(keys) ? keys : [keys]).map((key) => createEvidenceRecord(`memory_${key}_present`, data[key] ? 'verified' : 'unknown', {
    source: 'memory',
    confidence: data[key] ? 'medium' : 'low'
  }));
}

export function getEvidenceFromMapMemory(types = [], mapMemory = {}) {
  const keys = Array.isArray(types) ? types : [types];
  return keys.map((key) => {
    const value = mapMemory?.[key];
    const count = Array.isArray(value) ? value.length : value ? 1 : 0;
    return createEvidenceRecord(`map_${key}_present`, count > 0 ? 'verified' : 'unknown', {
      source: 'mapMemory',
      confidence: count > 0 ? 'medium' : 'low',
      details: { count }
    });
  });
}

export function getEvidenceFromGoals(goalNames = [], goals = []) {
  const names = Array.isArray(goalNames) ? goalNames : [goalNames];
  return names.map((name) => {
    const found = goals.some((goal) => goal?.name === name || goal?.templateName === name);
    return createEvidenceRecord(`goal_${name}_present`, found ? 'verified' : 'unknown', {
      source: 'goals',
      confidence: found ? 'medium' : 'low'
    });
  });
}

export function getEvidenceFromCurriculum(trackNames = [], curriculumMemory = {}) {
  const names = Array.isArray(trackNames) ? trackNames : [trackNames];
  const sessions = curriculumMemory?.curriculumSessions || [];
  return names.map((name) => {
    const found = sessions.some((session) => session?.name === name || session?.trackName === name || session?.id === name);
    return createEvidenceRecord(`curriculum_${name}_present`, found ? 'verified' : 'unknown', {
      source: 'curriculumMemory',
      confidence: found ? 'medium' : 'low'
    });
  });
}
