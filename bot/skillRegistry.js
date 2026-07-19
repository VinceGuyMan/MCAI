import { getEvidenceDefinition } from './progressEvidence.js';

export const SKILL_CATEGORIES = [
  'core',
  'movement',
  'survival',
  'food',
  'crafting',
  'inventory',
  'armor',
  'base',
  'storage',
  'mining',
  'farming',
  'animals',
  'exploration',
  'combat',
  'goals',
  'progression',
  'gear',
  'villagers',
  'blueprints',
  'bridge',
  'nether',
  'dialogue'
];

const REQUIRED_FIELDS = [
  'name',
  'category',
  'description',
  'implemented',
  'riskLevel',
  'requiresConfirmation',
  'preconditions',
  'inputs',
  'successEvidence',
  'cooldownMs',
  'maxRuntimeMs',
  'action'
];

const skills = [
  skill('status', 'core', 'Report health, food, armor, position, current task, and owner distance.', true, 'low', false, [], {}, ['status_reported'], 1000, 10000, 'status'),
  skill('help', 'core', 'List available command groups and examples.', true, 'low', false, [], {}, ['help_reported'], 1000, 10000, 'help'),
  skill('stop', 'core', 'Immediately cancel movement, queues, and long-running work.', true, 'low', false, [], {}, ['all_tasks_cancelled'], 0, 5000, 'stop'),
  skill('brain_status', 'core', 'Report autonomy, current goal, and planner/task state.', true, 'low', false, [], {}, ['brain_status_reported'], 1000, 10000, 'brainStatus'),
  skill('task_status', 'core', 'Report the current task queue state.', true, 'low', false, [], {}, ['task_status_reported'], 1000, 10000, 'taskStatus'),
  skill('safety_status', 'core', 'Report danger flags and safety state.', true, 'low', false, [], {}, ['safety_status_reported'], 1000, 10000, 'safetyStatus'),
  skill('memory_status', 'core', 'Report a short memory summary.', true, 'low', false, [], {}, ['memory_status_reported'], 1000, 10000, 'memoryStatus'),
  skill('skills_status', 'core', 'Report skill registry category counts and implementation status.', true, 'low', false, [], {}, ['skills_status_reported'], 1000, 10000, 'skills_status'),
  skill('skill_audit', 'core', 'Validate the skill registry and report wiring problems.', true, 'low', false, [], {}, ['skill_audit_reported'], 1000, 10000, 'skill_audit'),
  skill('evidence_status', 'core', 'Report evidence tracking definition and run counts.', true, 'low', false, [], {}, ['evidence_status_reported'], 1000, 10000, 'evidence_status'),
  skill('progression_status', 'progression', 'Report custom progression status and safe next-milestone context.', false, 'low', false, [], {}, ['progression_status_reported'], 1000, 10000, 'progression_status'),

  skill('come_here', 'movement', 'Pathfind close to ModVinny.', true, 'low', false, ['owner_visible'], {}, ['near_owner'], 3000, 60000, 'comeToOwner'),
  skill('follow_owner', 'movement', 'Follow ModVinny at the configured follow distance.', true, 'low', false, ['owner_visible'], {}, ['follow_goal_set'], 3000, 30000, 'followOwner'),
  skill('stay', 'movement', 'Stop following and hold position.', true, 'low', false, [], {}, ['path_goal_cleared'], 1000, 10000, 'stay'),
  skill('unstuck', 'movement', 'Run manual stuck recovery.', true, 'medium', false, [], {}, ['position_changed_or_failure_reported'], 10000, 60000, 'unstuck'),
  skill('return_to_owner', 'movement', 'Return to ModVinny when visible.', true, 'low', false, ['owner_visible'], {}, ['near_owner'], 5000, 60000, 'returnToOwner'),

  skill('survive_tick', 'survival', 'Run one guarded semi-autonomous survival tick.', true, 'medium', false, [], {}, ['survival_tick_completed'], 5000, 30000, 'surviveTick'),
  skill('lighting_status', 'survival', 'Report torch and local lighting state.', true, 'low', false, [], {}, ['lighting_status_reported'], 1000, 10000, 'lighting_status'),
  skill('place_torch', 'survival', 'Place one torch safely nearby if possible.', true, 'low', false, ['has_torches'], {}, ['torch_placed_or_reason_reported'], 5000, 30000, 'placeTorch'),
  skill('sleep', 'survival', 'Try safe Overworld sleep behavior near a bed.', true, 'medium', false, ['overworld'], {}, ['sleep_attempted_or_reason_reported'], 10000, 60000, 'sleep'),

  skill('food_status', 'food', 'Report hunger and useful food inventory.', true, 'low', false, [], {}, ['food_status_reported'], 1000, 10000, 'food_status'),
  skill('eat_if_hungry', 'food', 'Eat safe available food when hungry.', true, 'low', false, ['has_food'], {}, ['food_level_improved_or_not_needed'], 3000, 30000, 'eat_if_hungry'),
  skill('get_food', 'food', 'Run the safe food acquisition pipeline.', true, 'medium', false, [], { targetCount: 'number' }, ['food_count_increased_or_reason_reported'], 30000, 180000, 'get_food'),
  skill('find_food', 'food', 'Look for safe food sources nearby.', true, 'medium', false, [], {}, ['food_source_found_or_reason_reported'], 15000, 120000, 'find_food'),
  skill('cook_food', 'food', 'Cook raw food with furnace logic when supplies exist.', true, 'low', false, ['has_raw_food', 'has_fuel'], {}, ['cooked_food_count_increased_or_reason_reported'], 15000, 180000, 'cook_food'),
  skill('fish_for_food', 'food', 'Fish for food if the existing food system can do so safely.', true, 'medium', false, [], {}, ['fish_attempted_or_reason_reported'], 30000, 180000, 'fish_for_food'),

  skill('craft_item', 'crafting', 'Craft a requested item through Mineflayer recipe data.', true, 'medium', false, ['has_materials'], { itemName: 'string', count: 'number' }, ['item_count_increased_or_missing_reported'], 3000, 180000, 'craft_item'),
  skill('craft_planks', 'crafting', 'Craft planks from available logs.', true, 'low', false, ['has_logs'], {}, ['plank_count_increased'], 1000, 60000, 'craftPlanks'),
  skill('craft_sticks', 'crafting', 'Craft sticks from available planks.', true, 'low', false, ['has_planks'], {}, ['stick_count_increased'], 1000, 60000, 'craftSticks'),
  skill('craft_crafting_table', 'crafting', 'Craft a crafting table from planks.', true, 'low', false, ['has_planks'], {}, ['crafting_table_count_increased'], 1000, 60000, 'craftCraftingTable'),
  skill('craft_lighting', 'crafting', 'Craft torches or other simple lighting supplies.', true, 'low', false, ['has_coal_or_charcoal', 'has_sticks'], {}, ['torch_count_increased_or_missing_reported'], 3000, 120000, 'craft_lighting'),
  skill('craft_storage', 'crafting', 'Craft storage supplies such as chests.', true, 'low', false, ['has_planks'], {}, ['storage_item_count_increased_or_missing_reported'], 3000, 120000, 'craft_storage'),
  skill('craft_basic_tools', 'crafting', 'Craft a full wooden tool set (pick, axe, shovel, hoe, sword).', true, 'low', false, ['has_logs_or_planks'], {}, ['basic_tool_count_increased_or_missing_reported'], 5000, 180000, 'craft_basic_tools'),
  skill('craft_stone_tools', 'crafting', 'Craft a full stone tool set.', true, 'low', false, ['has_cobblestone', 'has_sticks'], {}, ['stone_tool_count_increased_or_missing_reported'], 5000, 180000, 'craft_stone_tools'),
  skill('craft_iron_tools', 'crafting', 'Craft a full iron tool set when iron ingots exist.', true, 'medium', false, ['has_iron'], {}, ['iron_tool_count_increased_or_missing_reported'], 5000, 180000, 'craft_iron_tools'),
  skill('smelt_item', 'crafting', 'Smelt ore into ingots or logs into charcoal.', true, 'medium', false, [], { itemName: 'string', count: 'number' }, ['smelt_completed_or_reason_reported'], 5000, 300000, 'smelt_item'),
  skill('smelt_iron', 'crafting', 'Smelt raw iron / iron ore into iron ingots.', true, 'medium', false, [], { count: 'number' }, ['smelt_completed_or_reason_reported'], 5000, 300000, 'smelt_iron'),
  skill('smelt_charcoal', 'crafting', 'Smelt logs into charcoal for fuel and torches.', true, 'low', false, ['has_logs'], { count: 'number' }, ['smelt_completed_or_reason_reported'], 5000, 300000, 'smelt_charcoal'),
  skill('craft_shelter_supplies', 'crafting', 'Craft small shelter supplies such as doors, ladders, or beds when materials exist.', true, 'medium', false, ['has_materials'], {}, ['shelter_supply_count_increased_or_missing_reported'], 10000, 180000, 'craft_shelter_supplies'),
  skill('craft_survival_kit', 'crafting', 'Craft a small survival kit using existing crafting helpers.', true, 'medium', false, ['has_materials'], {}, ['survival_supplies_count_increased_or_missing_reported'], 10000, 180000, 'craft_survival_kit'),
  skill('craft_diamond_armor', 'crafting', 'Craft diamond armor only after explicit confirmation.', true, 'high', true, ['has_diamonds'], {}, ['diamond_armor_count_increased'], 60000, 180000, 'craft_diamond_armor_confirmed'),

  skill('inventory_status', 'inventory', 'Show a short useful inventory summary.', true, 'low', false, [], {}, ['inventory_status_reported'], 1000, 10000, 'inventory_status'),
  skill('inventory_summary', 'inventory', 'Show a short useful inventory summary through the skill runner.', true, 'low', false, [], {}, ['inventory_reported'], 1000, 10000, 'inventory_summary'),
  skill('count_inventory', 'inventory', 'Count matching inventory items.', true, 'low', false, [], { itemName: 'string' }, ['item_count_reported'], 1000, 10000, 'countInventory'),
  skill('tool_status', 'inventory', 'Report best tools and damaged tools.', true, 'low', false, [], {}, ['tool_status_reported'], 1000, 10000, 'tool_status'),
  skill('collect_drops', 'inventory', 'Collect safe nearby dropped items.', true, 'low', false, [], { radius: 'number' }, ['drops_collected_or_none_found'], 5000, 60000, 'collectDropsAction'),
  skill('give_item_to_owner', 'inventory', 'Bring and toss a requested item to ModVinny.', true, 'medium', false, ['owner_visible', 'has_item'], { itemName: 'string', count: 'number' }, ['item_transferred_or_reason_reported'], 5000, 120000, 'giveOwnerItem'),
  skill('drop_item', 'inventory', 'Drop a directly requested item with existing safety checks.', true, 'medium', false, ['has_item'], { itemName: 'string', count: 'number' }, ['item_dropped_or_refused'], 5000, 60000, 'dropItem'),

  skill('armor_status', 'armor', 'Report equipped and available armor.', true, 'low', false, [], {}, ['armor_status_reported'], 1000, 10000, 'armor_status'),
  skill('equip_best_armor', 'armor', 'Equip the best available armor safely.', true, 'low', false, ['has_armor'], {}, ['armor_score_increased_or_best_equipped'], 3000, 60000, 'equip_best_armor'),
  skill('craft_iron_armor', 'armor', 'Craft iron armor if enough iron exists.', true, 'medium', false, ['has_iron'], {}, ['iron_armor_count_increased_or_missing_reported'], 10000, 180000, 'craft_iron_armor'),
  skill('craft_leather_armor', 'armor', 'Craft leather armor if materials exist.', true, 'low', false, ['has_leather'], {}, ['leather_armor_count_increased_or_missing_reported'], 10000, 180000, 'craft_leather_armor'),

  skill('set_home', 'base', 'Save current position as home.', true, 'low', false, [], {}, ['home_position_saved'], 1000, 10000, 'set_home'),
  skill('home_status', 'base', 'Report home and base status.', true, 'low', false, [], {}, ['home_status_reported'], 1000, 10000, 'home_status'),
  skill('return_home', 'base', 'Pathfind back to saved home.', true, 'low', false, ['has_home'], {}, ['near_home'], 5000, 120000, 'return_home'),
  skill('build_camp', 'base', 'Build a small deterministic camp near home or owner.', true, 'medium', false, ['has_home_or_owner_nearby'], {}, ['camp_blocks_registered_or_reason_reported'], 30000, 180000, 'build_camp'),
  skill('build_workstation', 'base', 'Build or place small workstation blocks near home.', true, 'medium', false, ['has_home', 'has_materials'], {}, ['workstation_blocks_registered_or_reason_reported'], 30000, 180000, 'build_workstation'),
  skill('build_shelter', 'base', 'Build a small deterministic shelter within safety limits.', true, 'medium', false, ['has_home', 'has_building_blocks'], {}, ['shelter_history_recorded_or_reason_reported'], 60000, 300000, 'build_shelter'),
  skill('light_home', 'base', 'Place safe torches around home.', true, 'low', false, ['has_home', 'has_torches'], {}, ['home_torch_positions_recorded_or_reason_reported'], 10000, 120000, 'light_home'),
  skill('base_maintenance', 'base', 'Run safe base maintenance when idle.', true, 'low', false, ['has_home'], {}, ['base_maintenance_timestamp_updated'], 30000, 120000, 'base_maintenance'),

  skill('storage_status', 'storage', 'Report owned/registered storage state.', true, 'low', false, [], {}, ['storage_status_reported'], 1000, 10000, 'storage_status'),
  skill('place_storage_chest', 'storage', 'Place a storage chest safely near base.', true, 'medium', false, ['has_home', 'has_chest_or_planks'], {}, ['storage_chest_registered_or_reason_reported'], 10000, 120000, 'place_storage_chest'),
  skill('register_storage_chest', 'storage', 'Register a nearby chest as owned base storage.', true, 'medium', false, ['nearby_chest'], {}, ['storage_chest_registered'], 5000, 60000, 'register_storage_chest'),
  skill('store_items', 'storage', 'Deposit excess items while keeping survival essentials.', true, 'medium', false, ['has_registered_storage'], {}, ['items_deposited_or_reason_reported'], 10000, 180000, 'store_items'),
  skill('withdraw_item', 'storage', 'Withdraw a requested item from registered storage.', true, 'medium', false, ['has_registered_storage'], { itemName: 'string', count: 'number' }, ['item_withdrawn_or_reason_reported'], 5000, 120000, 'withdraw_item'),
  skill('bring_item_to_owner', 'storage', 'Withdraw a requested item and bring it to ModVinny.', true, 'medium', false, ['has_registered_storage', 'owner_visible'], { itemName: 'string', count: 'number' }, ['item_transferred_or_reason_reported'], 5000, 180000, 'bring_item_to_owner'),

  skill('mining_status', 'mining', 'Report mining readiness and active mining state.', true, 'low', false, [], {}, ['mining_status_reported'], 1000, 10000, 'mining_status'),
  skill('mine_stone', 'mining', 'Mine a capped safe amount of stone or cobblestone.', true, 'medium', false, ['has_pickaxe', 'has_food'], { targetCount: 'number' }, ['stone_count_increased_or_reason_reported', 'returned_safely'], 30000, 180000, 'mine_stone'),
  skill('mine_coal', 'mining', 'Mine a small safe amount of visible or reachable coal.', true, 'medium', false, ['has_pickaxe', 'has_food', 'has_torches'], { targetCount: 'number' }, ['coal_count_increased', 'returned_safely'], 30000, 180000, 'mine_coal'),
  skill('mine_iron', 'mining', 'Mine a capped safe amount of visible or reachable iron.', true, 'medium', false, ['has_stone_pickaxe_or_better', 'has_food', 'has_torches'], { targetCount: 'number' }, ['iron_count_increased_or_reason_reported', 'returned_safely'], 30000, 180000, 'mine_iron'),
  skill('resource_run_wood', 'mining', 'Gather a capped amount of safe nearby wood through the resource run system.', true, 'low', false, [], { targetCount: 'number' }, ['log_count_increased_or_reason_reported', 'returned_safely'], 30000, 180000, 'resource_run_wood'),
  skill('resource_run_stone', 'mining', 'Gather a capped amount of stone through the resource run system.', true, 'medium', false, ['has_pickaxe'], { targetCount: 'number' }, ['stone_count_increased_or_reason_reported', 'returned_safely'], 30000, 180000, 'resource_run_stone'),
  skill('resource_run_coal', 'mining', 'Gather a capped amount of coal through the resource run system.', true, 'medium', false, ['has_pickaxe'], { targetCount: 'number' }, ['coal_count_increased_or_reason_reported', 'returned_safely'], 30000, 180000, 'resource_run_coal'),
  skill('mine_diamond', 'mining', 'Diamond mining is documented but not a 1.0 implemented skill.', false, 'high', true, ['has_iron_pickaxe_or_better', 'confirmed_diamond_mining'], { targetCount: 'number' }, ['diamond_count_increased', 'returned_safely'], 60000, 300000, 'mine_diamond'),
  skill('deep_mining', 'mining', 'Deep mining remains blocked unless a later phase hardens it.', false, 'high', true, ['confirmed_deep_mining'], {}, ['deep_mine_completed'], 60000, 300000, 'deep_mining'),
  skill('cave_mining', 'mining', 'Caving remains blocked unless a later phase hardens it.', false, 'high', true, ['confirmed_caving'], {}, ['cave_run_completed'], 60000, 300000, 'cave_mining'),

  skill('farming_status', 'farming', 'Report farm state.', true, 'low', false, [], {}, ['farming_status_reported'], 1000, 10000, 'farming_status'),
  skill('create_farm', 'farming', 'Create a small registered crop farm near home.', true, 'medium', false, ['has_home', 'has_seeds_or_crop'], { cropType: 'string' }, ['farm_registered_or_reason_reported'], 30000, 180000, 'create_farm'),
  skill('plant_crop', 'farming', 'Plant supported crops on registered farmland.', true, 'low', false, ['has_registered_farm', 'has_seeds_or_crop'], { cropType: 'string' }, ['crop_planted_or_reason_reported'], 10000, 120000, 'plant_crop'),
  skill('harvest_crops', 'farming', 'Harvest mature registered crops only.', true, 'low', false, ['has_registered_farm'], {}, ['crop_count_increased_or_no_mature_crops'], 15000, 120000, 'harvest_crops'),
  skill('replant_crops', 'farming', 'Replant supported crops when seeds/items exist.', true, 'low', false, ['has_registered_farm', 'has_seeds_or_crop'], {}, ['empty_farmland_replanted_or_reason_reported'], 15000, 120000, 'replant_crops'),
  skill('maintain_farm', 'farming', 'Harvest mature crops, replant, and store output when possible.', true, 'low', false, ['has_registered_farm'], {}, ['farm_maintenance_completed_or_reason_reported'], 30000, 180000, 'maintain_farm'),
  skill('store_farm_items', 'farming', 'Store excess farm output through registered storage.', true, 'low', false, ['has_registered_storage'], {}, ['farm_items_stored_or_reason_reported'], 10000, 120000, 'store_farm_items'),

  skill('animal_pen_status', 'animals', 'Report known animal pens and counts when available.', true, 'low', false, [], {}, ['animal_pen_status_reported'], 1000, 10000, 'animal_pen_status'),
  skill('create_animal_pen', 'animals', 'Create a small fenced animal pen near home.', true, 'medium', false, ['has_home', 'has_fences_or_wood'], { animalType: 'string' }, ['animal_pen_registered_or_reason_reported'], 30000, 180000, 'create_animal_pen'),
  skill('lure_animal_to_pen', 'animals', 'Lure one supported passive animal to its pen.', true, 'medium', false, ['has_animal_pen', 'has_animal_food'], { animalType: 'string' }, ['animal_lured_or_reason_reported'], 30000, 180000, 'lure_animal_to_pen'),
  skill('breed_animals', 'animals', 'Breed supported pen animals only if under cap and food remains.', true, 'medium', false, ['has_animal_pen', 'has_animal_food'], { animalType: 'string' }, ['animals_bred_or_reason_reported'], 30000, 120000, 'breed_animals'),
  skill('collect_eggs', 'animals', 'Collect nearby eggs if safe.', true, 'low', false, [], {}, ['eggs_collected_or_none_found'], 15000, 60000, 'collect_eggs'),
  skill('shear_sheep', 'animals', 'Shear sheep if shears exist and rules allow it.', true, 'low', false, ['has_shears'], {}, ['wool_count_increased_or_reason_reported'], 30000, 120000, 'shear_sheep'),
  skill('milk_cow', 'animals', 'Milk one cow if a bucket exists and rules allow it.', true, 'low', false, ['has_bucket'], {}, ['milk_bucket_count_increased_or_reason_reported'], 30000, 120000, 'milk_cow'),
  skill('animal_slaughter', 'animals', 'Animal slaughter is intentionally not implemented for this local companion build.', false, 'high', true, ['confirmed_animal_slaughter'], { animalType: 'string' }, ['animal_slaughter_completed'], 60000, 120000, 'animal_slaughter'),

  skill('map_status', 'exploration', 'Report map memory summary.', true, 'low', false, [], {}, ['map_status_reported'], 1000, 10000, 'map_status'),
  skill('scan_area', 'exploration', 'Scan visible nearby resources, structures, entities, and dangers.', true, 'low', false, [], {}, ['scan_reported', 'discoveries_recorded'], 5000, 60000, 'scan_area'),
  skill('remember_location', 'exploration', 'Remember the current location as a named waypoint.', true, 'low', false, [], { name: 'string' }, ['waypoint_saved'], 1000, 10000, 'remember_location'),
  skill('list_known_places', 'exploration', 'List known waypoints.', true, 'low', false, [], {}, ['waypoints_reported'], 1000, 10000, 'list_known_places'),
  skill('go_to_waypoint', 'exploration', 'Travel to a known waypoint safely.', true, 'medium', false, ['has_waypoint'], { waypointName: 'string' }, ['arrived_at_waypoint_or_reason_reported'], 5000, 180000, 'go_to_waypoint'),
  skill('scout_direction', 'exploration', 'Scout a capped distance in one direction and return.', true, 'medium', false, ['has_return_target', 'has_food'], { direction: 'string', distance: 'number' }, ['breadcrumbs_recorded', 'returned_safely'], 30000, 300000, 'scout_direction'),
  skill('explore_around_home', 'exploration', 'Explore around home within configured radius.', true, 'medium', false, ['has_home', 'has_food'], { radius: 'number' }, ['discoveries_recorded', 'returned_safely'], 30000, 300000, 'explore_around_home'),
  skill('record_route', 'exploration', 'Record a breadcrumb route for later use.', true, 'medium', false, [], { routeName: 'string' }, ['route_recording_started_or_saved'], 10000, 300000, 'record_route'),
  skill('follow_route', 'exploration', 'Follow a remembered route if safe.', true, 'medium', false, ['has_route'], { routeName: 'string' }, ['route_followed_or_reason_reported'], 10000, 180000, 'follow_route'),
  skill('cave_exploration', 'exploration', 'Cave exploration remains confirmation-gated and not implemented as a safe 1.0 skill.', false, 'high', true, ['confirmed_cave_exploration'], {}, ['cave_exploration_completed'], 60000, 300000, 'cave_exploration'),

  skill('combat_status', 'combat', 'Report combat mode, threats, gear, health, and food.', true, 'low', false, [], {}, ['combat_status_reported'], 1000, 10000, 'combat_status'),
  skill('combat_equipment_status', 'combat', 'Report combat gear and readiness.', true, 'low', false, [], {}, ['combat_gear_status_reported'], 1000, 10000, 'combat_equipment_status'),
  skill('threat_scan', 'combat', 'Scan nearby threats without attacking.', true, 'low', false, [], {}, ['threat_scan_reported'], 3000, 30000, 'threat_scan'),
  skill('equip_combat_gear', 'combat', 'Equip safe available combat gear.', true, 'low', false, ['has_weapon_or_armor'], {}, ['combat_gear_equipped_or_reason_reported'], 3000, 60000, 'equip_combat_gear'),
  skill('defend_owner', 'combat', 'Enable owner-defense behavior against clear nearby hostiles.', true, 'medium', false, ['owner_visible'], {}, ['owner_defense_enabled_or_reason_reported'], 5000, 60000, 'defend_owner'),
  skill('guard_base', 'combat', 'Guard known base area against clear nearby hostiles.', true, 'medium', false, ['has_home'], {}, ['base_guard_enabled_or_reason_reported'], 5000, 60000, 'guard_base'),
  skill('flee_threat', 'combat', 'Retreat from nearby threats.', true, 'low', false, [], {}, ['retreat_attempted_or_reason_reported'], 3000, 60000, 'flee_threat'),
  skill('engage_hostile', 'combat', 'Engage one clear nearby hostile only if combat safety allows it.', true, 'high', true, ['has_weapon', 'clear_hostile_target'], { targetName: 'string' }, ['hostile_defeated_or_disengaged'], 10000, 120000, 'engage_hostile'),
  skill('pvp_attack', 'combat', 'PVP is disabled and not implemented for tj 1.0.', false, 'high', true, ['confirmed_pvp'], { playerName: 'string' }, ['pvp_attack_completed'], 60000, 120000, 'pvp_attack'),
  skill('attack_protected_entity', 'combat', 'Attacking protected entities is blocked by design.', false, 'high', true, ['confirmed_protected_attack'], { targetName: 'string' }, ['protected_attack_completed'], 60000, 120000, 'attack_protected_entity'),

  skill('goals_status', 'goals', 'Report long-term goal status.', true, 'low', false, [], {}, ['goals_status_reported'], 1000, 10000, 'goals_status'),
  skill('create_goal_from_template', 'goals', 'Create a safe long-term goal from a template.', true, 'low', false, [], { templateName: 'string' }, ['goal_created_or_pending_approval'], 5000, 30000, 'create_goal_from_template'),
  skill('suggest_goals', 'goals', 'Suggest practical next goals without executing them.', true, 'low', false, [], {}, ['goal_suggestions_reported'], 30000, 60000, 'suggest_goals'),
  skill('start_goal', 'goals', 'Start an approved goal.', true, 'medium', false, ['has_goal'], { goalName: 'string' }, ['goal_started_or_reason_reported'], 5000, 30000, 'start_goal'),
  skill('pause_goal', 'goals', 'Pause the active or named goal.', true, 'low', false, ['has_goal'], {}, ['goal_paused'], 1000, 10000, 'pause_goal'),
  skill('resume_goal', 'goals', 'Resume a paused goal.', true, 'medium', false, ['has_goal'], {}, ['goal_resumed_or_reason_reported'], 5000, 30000, 'resume_goal'),
  skill('cancel_goal', 'goals', 'Cancel the active or named goal.', true, 'low', false, ['has_goal'], {}, ['goal_cancelled'], 1000, 10000, 'cancel_goal'),
  skill('next_goal_step', 'goals', 'Explain the next planned goal step.', true, 'low', false, ['has_goal'], {}, ['next_step_reported'], 1000, 10000, 'next_goal_step'),
  skill('execute_next_goal_step', 'goals', 'Execute one validated goal step through actions.js.', true, 'medium', false, ['approved_goal'], {}, ['step_completed_failed_or_blocked'], 10000, 180000, 'execute_next_goal_step'),

  skill('gear_status', 'gear', 'Report current gear score, best gear, XP, and upgrade needs.', true, 'low', false, [], {}, ['gear_status_reported'], 1000, 10000, 'gear_status'),
  skill('suggest_gear_upgrades', 'gear', 'Suggest safe gear upgrades without spending resources.', true, 'low', false, [], {}, ['gear_upgrade_status_reported'], 30000, 10000, 'suggest_gear_upgrades'),
  skill('enchant_status', 'gear', 'Report enchantment table, XP, lapis, and enchantable item readiness.', true, 'low', false, [], {}, ['enchant_status_reported', 'xp_level_reported', 'lapis_count_reported'], 1000, 10000, 'enchant_status'),
  skill('enchant_options', 'gear', 'Inspect enchantment options if an enchantment table and supplies are available.', true, 'low', false, ['has_lapis'], {}, ['enchant_options_reported'], 5000, 30000, 'enchant_options'),
  skill('anvil_status', 'gear', 'Report anvil, repair, combine, and enchanted book readiness.', true, 'low', false, [], {}, ['anvil_status_reported', 'enchanted_book_inventory_reported'], 1000, 10000, 'anvil_status'),
  skill('potion_status', 'gear', 'Report carried potion inventory and safe potion recommendations.', true, 'low', false, [], {}, ['potion_status_reported'], 1000, 10000, 'potion_status'),
  skill('brewing_status', 'gear', 'Report brewing support and ingredient readiness without claiming brewing works.', true, 'low', false, [], {}, ['brewing_status_reported'], 1000, 10000, 'brewing_status'),
  skill('nether_gear_readiness', 'gear', 'Report Nether gear readiness including gold armor and potion awareness.', true, 'low', false, [], {}, ['gear_status_reported', 'nether_gear_ready'], 1000, 10000, 'nether_gear_readiness'),
  skill('enchant_item', 'gear', 'Enchant an approved item through the enchantment table API.', true, 'medium', true, ['has_enchanting_table', 'has_lapis', 'has_xp', 'confirmed_enchanting'], { itemName: 'string' }, ['item_enchanted'], 60000, 120000, 'enchant_item'),
  skill('repair_item', 'gear', 'Repair an approved item through an anvil.', true, 'medium', true, ['has_anvil', 'confirmed_anvil'], { itemName: 'string' }, ['item_repaired'], 60000, 120000, 'repair_item'),
  skill('apply_book_to_item', 'gear', 'Apply an approved enchanted book to an approved item.', true, 'medium', true, ['has_anvil', 'has_enchanted_book', 'confirmed_book_use'], { itemName: 'string' }, ['book_applied'], 60000, 120000, 'apply_book_to_item'),
  skill('use_potion', 'gear', 'Use an approved potion from inventory.', true, 'medium', true, ['has_potion', 'confirmed_potion_use'], { potionName: 'string' }, ['potion_used'], 60000, 30000, 'use_potion'),
  skill('brew_potion', 'gear', 'Brewing mutation is scaffolded only; reliable brewing stand support is not implemented.', false, 'medium', true, ['brewing_supported', 'confirmed_brewing'], { potionType: 'string' }, ['potion_brewed'], 60000, 180000, 'brew_potion'),

  skill('villager_status', 'villagers', 'Report nearby villagers and remembered villager economy state.', true, 'low', false, [], {}, ['villager_seen'], 1000, 10000, 'villager_status'),
  skill('scan_villagers', 'villagers', 'Scan nearby villagers, professions, and possible village evidence.', true, 'low', false, [], {}, ['villager_seen', 'villager_profession_recorded'], 5000, 30000, 'scan_villagers'),
  skill('village_status', 'villagers', 'Report nearby village evidence and remembered villages.', true, 'low', false, [], {}, ['village_found'], 1000, 10000, 'village_status'),
  skill('trade_status', 'villagers', 'Report villager trading API readiness and known trades.', true, 'low', false, [], {}, ['trade_options_reported'], 1000, 10000, 'trading_status'),
  skill('economy_status', 'villagers', 'Report emerald count, trade budget, reserves, and economy history.', true, 'low', false, [], {}, ['emerald_count_reported'], 1000, 10000, 'economy_status'),
  skill('suggest_trades', 'villagers', 'Suggest useful known trades without executing anything.', true, 'low', false, [], {}, ['valuable_trade_found'], 10000, 30000, 'suggest_trades'),
  skill('inspect_villager_trades', 'villagers', 'Inspect nearby villager trades if Mineflayer trading APIs are available.', true, 'medium', false, ['villager_nearby'], {}, ['villager_trade_inspected', 'trade_options_reported'], 10000, 60000, 'inspect_villager_trades'),
  skill('remember_village', 'villagers', 'Remember a visible possible village location.', true, 'low', false, [], {}, ['village_waypoint_created'], 5000, 30000, 'remember_village'),
  skill('remember_villager', 'villagers', 'Remember a visible villager and profession.', true, 'low', false, [], {}, ['villager_memory_updated'], 5000, 30000, 'remember_villager'),
  skill('protect_villager', 'villagers', 'Report village protection warnings without reckless combat.', true, 'medium', false, [], {}, ['villager_protected_reported'], 5000, 30000, 'protect_villager_status'),
  skill('execute_trade', 'villagers', 'Execute one owner-confirmed villager trade through deterministic Mineflayer APIs.', true, 'medium', true, ['villager_nearby', 'confirmed_trade'], { tradeIndex: 'number', times: 'number' }, ['trade_completed'], 60000, 120000, 'execute_approved_trade'),

  skill('blueprint_status', 'blueprints', 'Report blueprint system status and active build state.', true, 'low', false, [], {}, ['blueprint_status_reported'], 1000, 10000, 'blueprint_status'),
  skill('list_blueprints', 'blueprints', 'List built-in deterministic blueprints.', true, 'low', false, [], {}, ['blueprint_list_reported'], 1000, 10000, 'list_blueprints'),
  skill('blueprint_preview', 'blueprints', 'Preview blueprint size, risk, and block count without placing anything.', true, 'low', false, [], { blueprintId: 'string' }, ['blueprint_preview_created'], 1000, 10000, 'blueprint_preview'),
  skill('blueprint_materials', 'blueprints', 'Check required and missing materials for a blueprint.', true, 'low', false, [], { blueprintId: 'string' }, ['blueprint_materials_checked'], 1000, 10000, 'blueprint_materials'),
  skill('blueprint_plan', 'blueprints', 'Create a deterministic blueprint build plan without placing blocks.', true, 'low', false, [], { blueprintId: 'string' }, ['blueprint_plan_created'], 3000, 30000, 'blueprint_plan'),
  skill('blueprint_build_small', 'blueprints', 'Build one approved small deterministic blueprint in capped cancellable runs.', true, 'medium', true, ['confirmed_blueprint_build', 'has_materials'], { blueprintId: 'string' }, ['blueprint_build_started', 'blueprint_block_verified', 'blueprint_build_partial'], 60000, 300000, 'blueprint_build_approved'),
  skill('blueprint_continue_build', 'blueprints', 'Continue an approved active blueprint build for one capped placement run.', true, 'medium', false, ['active_blueprint_build'], {}, ['blueprint_build_partial'], 3000, 180000, 'blueprint_continue_build'),
  skill('blueprint_cancel_build', 'blueprints', 'Cancel the active blueprint build.', true, 'low', false, ['active_blueprint_build'], {}, ['blueprint_build_cancelled'], 1000, 10000, 'blueprint_cancel_build'),
  skill('schematic_status', 'blueprints', 'Report schematic import status honestly.', true, 'low', false, [], {}, ['schematic_status_reported', 'schematic_import_unsupported'], 1000, 10000, 'schematic_status'),

  skill('server_bridge_status', 'bridge', 'Report optional local Paper plugin bridge status.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'server_bridge_status'),
  skill('bridge_health', 'bridge', 'Check the local Paper plugin bridge health endpoint.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'bridge_health'),
  skill('bridge_recent_events', 'bridge', 'Report recent validated server-side bridge events.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'bridge_recent_events'),
  skill('bridge_recent_deaths', 'bridge', 'Report recent death events from the local bridge.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'bridge_recent_deaths'),
  skill('bridge_recent_advancements', 'bridge', 'Report recent advancement events from the local bridge.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'bridge_recent_advancements'),
  skill('bridge_regions', 'bridge', 'List protected or watched regions from the local bridge.', true, 'low', false, [], {}, ['bridge_status_reported'], 1000, 10000, 'bridge_regions'),
  skill('bridge_register_region', 'bridge', 'Register a home/farm/village/portal region with the local bridge.', true, 'medium', true, ['confirmed_bridge_region'], { regionType: 'string' }, ['bridge_region_registered'], 60000, 30000, 'bridge_register_region'),
  skill('bridge_emergency_stop', 'bridge', 'Send or process a local bridge emergency stop signal.', true, 'low', false, [], {}, ['bridge_emergency_stop_received'], 1000, 10000, 'bridge_emergency_stop'),

  skill('nether_status', 'nether', 'Report Nether readiness, portal memory, and danger state.', true, 'low', false, [], {}, ['nether_status_reported'], 1000, 10000, 'nether_status'),
  skill('nether_checklist', 'nether', 'Check Nether readiness and missing supplies.', true, 'low', false, [], {}, ['nether_checklist_reported'], 1000, 10000, 'nether_checklist'),
  skill('prepare_nether', 'nether', 'Prepare safe Nether supplies without entering.', true, 'medium', false, ['has_home'], {}, ['nether_supplies_improved_or_missing_reported'], 30000, 300000, 'prepare_nether'),
  skill('equip_nether_gear', 'nether', 'Equip appropriate Nether gear and gold armor if available.', true, 'low', false, ['has_armor'], {}, ['nether_gear_equipped_or_reason_reported'], 5000, 60000, 'equip_nether_gear'),
  skill('portal_status', 'nether', 'Report nearby and remembered portal state.', true, 'low', false, [], {}, ['portal_status_reported'], 1000, 10000, 'portal_status'),
  skill('build_portal', 'nether', 'Build a portal frame near home if safe and materials exist.', true, 'medium', false, ['has_home', 'has_obsidian'], {}, ['portal_frame_built_or_reason_reported'], 60000, 300000, 'build_portal'),
  skill('light_portal', 'nether', 'Light a Nether portal only after explicit confirmation.', true, 'high', true, ['has_portal', 'has_flint_and_steel', 'confirmed_portal_lighting'], {}, ['portal_lit_or_reason_reported'], 60000, 120000, 'light_portal'),
  skill('safe_nether_entry', 'nether', 'Enter the Nether after confirmation, remember portal, scan danger, and return if unsafe.', true, 'high', true, ['nether_ready', 'has_portal', 'confirmed_nether_entry'], {}, ['nether_portal_remembered', 'danger_scan_completed', 'returned_if_unsafe'], 60000, 300000, 'safe_nether_entry'),
  skill('scan_nether', 'nether', 'Scan Nether-side danger near portal.', true, 'medium', false, ['in_nether'], {}, ['nether_danger_scan_reported'], 10000, 60000, 'scan_nether'),
  skill('return_from_nether', 'nether', 'Return through the remembered Nether portal.', true, 'medium', false, ['in_nether', 'nether_portal_known'], {}, ['returned_to_overworld_or_reason_reported'], 30000, 180000, 'return_from_nether'),
  skill('nether_exploration', 'nether', 'Nether exploration beyond portal radius is not implemented for this milestone.', false, 'high', true, ['confirmed_nether_exploration'], {}, ['nether_exploration_completed'], 60000, 300000, 'nether_exploration'),
  skill('nether_mining', 'nether', 'Nether mining is not implemented for this milestone.', false, 'high', true, ['confirmed_nether_mining'], {}, ['nether_mining_completed'], 60000, 300000, 'nether_mining'),
  skill('fortress_search', 'nether', 'Fortress search is not implemented for this milestone.', false, 'high', true, ['confirmed_fortress_search'], {}, ['fortress_search_completed'], 60000, 300000, 'fortress_search'),
  skill('bastion_search', 'nether', 'Bastion search is not implemented for this milestone.', false, 'high', true, ['confirmed_bastion_search'], {}, ['bastion_search_completed'], 60000, 300000, 'bastion_search'),
  skill('brew_fire_resistance', 'nether', 'Fire resistance brewing is scaffolded only and not claimed as working.', false, 'medium', false, ['brewing_supported'], {}, ['fire_resistance_potion_brewed'], 60000, 300000, 'brew_fire_resistance'),

  skill('dialogue_status', 'dialogue', 'Report dialogue mode, banter state, mood, and memory count.', true, 'low', false, [], {}, ['dialogue_status_reported'], 1000, 10000, 'dialogue_status'),
  skill('personality_status', 'dialogue', 'Explain tj personality and honesty boundaries.', true, 'low', false, [], {}, ['personality_status_reported'], 1000, 10000, 'personality_status'),
  skill('conversation_memory_status', 'dialogue', 'Report saved conversation memory facts.', true, 'low', false, [], {}, ['conversation_memory_reported'], 1000, 10000, 'conversation_memory_status'),
  skill('remember_conversation_fact', 'dialogue', 'Save a meaningful owner-approved conversation fact.', true, 'low', false, [], { text: 'string' }, ['conversation_fact_saved'], 1000, 10000, 'remember_conversation_fact'),
  skill('forget_conversation_fact', 'dialogue', 'Forget a matching conversation memory fact.', true, 'medium', false, [], { query: 'string' }, ['conversation_fact_removed_or_not_found'], 1000, 10000, 'forget_conversation_fact'),
  skill('clear_conversation_memory', 'dialogue', 'Clear conversation memory only after confirmation.', true, 'high', true, ['confirmed_clear_conversation_memory'], {}, ['conversation_memory_cleared'], 60000, 30000, 'clear_conversation_memory_confirmed'),
  skill('answer_dialogue', 'dialogue', 'Answer casual dialogue without executing actions.', true, 'low', false, [], { text: 'string' }, ['dialogue_reply_sent'], 1000, 10000, 'answer_dialogue'),
  skill('ask_clarification', 'dialogue', 'Ask for clarification without executing actions.', true, 'low', false, [], { text: 'string' }, ['clarification_sent'], 1000, 10000, 'ask_clarification')
];

function skill(name, category, description, implemented, riskLevel, requiresConfirmation, preconditions, inputs, successEvidence, cooldownMs, maxRuntimeMs, action) {
  return {
    name,
    category,
    description,
    implemented,
    riskLevel,
    requiresConfirmation,
    preconditions,
    inputs,
    successEvidence,
    cooldownMs,
    maxRuntimeMs,
    action,
    progressionCategories: [category],
    helpsMilestones: [],
    progressionValue: ['survival', 'food', 'base', 'mining', 'gear', 'nether'].includes(category) ? 'high' : 'normal'
  };
}

function cloneSkill(item) {
  return {
    ...item,
    preconditions: [...item.preconditions],
    inputs: { ...item.inputs },
    successEvidence: [...item.successEvidence],
    progressionCategories: [...(item.progressionCategories || [])],
    helpsMilestones: [...(item.helpsMilestones || [])]
  };
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function getSkills() {
  return skills.map(cloneSkill);
}

export function getSkill(name) {
  const key = normalizeName(name);
  const found = skills.find((item) => item.name === key || item.action === key);
  return found ? cloneSkill(found) : null;
}

export function listSkillsByCategory(category) {
  const key = normalizeName(category);
  return getSkills().filter((item) => item.category === key);
}

export function listImplementedSkills() {
  return getSkills().filter((item) => item.implemented);
}

export function listUnimplementedSkills() {
  return getSkills().filter((item) => !item.implemented);
}

export function listRiskySkills() {
  return getSkills().filter((item) => item.requiresConfirmation || item.riskLevel === 'high' || item.riskLevel === 'medium');
}

export function hasSkill(name) {
  return Boolean(getSkill(name));
}

export function validateSkillDefinitions(actions = null) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const categories = new Set(SKILL_CATEGORIES);
  const riskLevels = new Set(['low', 'medium', 'high']);

  for (const item of skills) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in item)) errors.push(`${item.name || 'unnamed'} is missing ${field}`);
    }

    if (!item.name || !/^[a-z0-9_]+$/.test(item.name)) errors.push(`${item.name || 'unnamed'} has an invalid skill name`);
    if (seen.has(item.name)) errors.push(`duplicate skill name: ${item.name}`);
    seen.add(item.name);

    if (!categories.has(item.category)) errors.push(`${item.name} has invalid category ${item.category}`);
    if (!riskLevels.has(item.riskLevel)) errors.push(`${item.name} has invalid risk level ${item.riskLevel}`);
    if (typeof item.description !== 'string' || item.description.length < 8) errors.push(`${item.name} needs a useful description`);
    if (typeof item.implemented !== 'boolean') errors.push(`${item.name} implemented must be boolean`);
    if (typeof item.requiresConfirmation !== 'boolean') errors.push(`${item.name} requiresConfirmation must be boolean`);
    if (!Array.isArray(item.preconditions)) errors.push(`${item.name} preconditions must be an array`);
    if (!item.inputs || typeof item.inputs !== 'object' || Array.isArray(item.inputs)) errors.push(`${item.name} inputs must be an object`);
    if (!Array.isArray(item.successEvidence)) errors.push(`${item.name} successEvidence must be an array`);
    if (Array.isArray(item.successEvidence) && item.successEvidence.length === 0) errors.push(`${item.name} needs at least one successEvidence item`);
    if (Array.isArray(item.successEvidence)) {
      for (const evidenceName of item.successEvidence) {
        if (!getEvidenceDefinition(evidenceName)) errors.push(`${item.name} references unknown evidence ${evidenceName}`);
      }
    }
    if (!Number.isFinite(item.cooldownMs) || item.cooldownMs < 0) errors.push(`${item.name} cooldownMs must be a non-negative number`);
    if (!Number.isFinite(item.maxRuntimeMs) || item.maxRuntimeMs <= 0) errors.push(`${item.name} maxRuntimeMs must be positive`);
    if (!item.action || typeof item.action !== 'string') errors.push(`${item.name} needs an action name`);

    if (item.implemented && !item.action) errors.push(`${item.name} is implemented but has no action`);
    if (item.riskLevel === 'high' && !item.requiresConfirmation) {
      warnings.push(`${item.name} is high risk without confirmation`);
    }
    if (item.category === 'dialogue' && /pathfinder|dig|attack|place|open_chest|portal|mine/i.test(item.action)) {
      errors.push(`${item.name} is a dialogue skill with a raw or gameplay action`);
    }
    if (actions && item.implemented && typeof actions[item.action] !== 'function') {
      errors.push(`${item.name} is implemented but action ${item.action} is not wired`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, count: skills.length };
}

export function generateSkillSummary() {
  const groups = {};
  for (const category of SKILL_CATEGORIES) {
    const items = skills.filter((item) => item.category === category);
    if (!items.length) continue;
    const implemented = items.filter((item) => item.implemented).length;
    groups[category] = {
      total: items.length,
      implemented,
      unimplemented: items.length - implemented,
      risky: items.filter((item) => item.requiresConfirmation || item.riskLevel !== 'low').length
    };
  }
  return groups;
}

export function generateSkillDocs() {
  const lines = ['# Skill Registry', ''];
  for (const category of SKILL_CATEGORIES) {
    const items = skills.filter((item) => item.category === category);
    if (!items.length) continue;
    lines.push(`## ${category}`);
    lines.push('');
    for (const item of items) {
      const status = item.implemented ? 'implemented' : 'not implemented';
      const confirmation = item.requiresConfirmation ? ', confirmation required' : '';
      lines.push(`- \`${item.name}\` (${status}, ${item.riskLevel}${confirmation}) -> \`${item.action}\`: ${item.description}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
