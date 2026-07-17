import { getSkill } from '../../skillRegistry.js';
import { getProgressionEvidenceDefinition, validateProgressionEvidenceNames } from './progressionEvidence.js';
import { getEvidenceDefinition } from '../../progressEvidence.js';

export const PROGRESSION_CATEGORIES = [
  'tutorial',
  'survival',
  'tools',
  'base',
  'storage',
  'food',
  'farming',
  'animals',
  'mining',
  'gear',
  'exploration',
  'combat',
  'nether',
  'enchanting',
  'villagers',
  'end',
  'automation',
  'custom'
];

export const PROGRESSION_TIERS = ['tutorial', 'early', 'mid', 'advanced', 'nether', 'endgame', 'postgame'];

const milestones = [
  milestone('connect_bot', 'Bot Connected', 'tutorial', 'tutorial', 'tj is connected as a Mineflayer player.', 'low', false, [], ['status'], [], ['bot_connected'], ['obey_owner_only']),
  milestone('obey_owner_only', 'Owner Only Commands', 'tutorial', 'tutorial', 'Only ModVinny can command actions.', 'low', false, ['connect_bot'], ['safety_status'], [], ['owner_only_confirmed'], ['emergency_stop_ready']),
  milestone('emergency_stop_ready', 'Emergency Stop Ready', 'tutorial', 'tutorial', 'tj stop can cancel long-running work.', 'low', false, ['connect_bot'], ['stop'], [], ['emergency_stop_available'], ['status_check_ready']),
  milestone('status_check_ready', 'Status Check Ready', 'tutorial', 'tutorial', 'tj can report core status.', 'low', false, ['connect_bot'], ['status'], [], ['status_reported'], ['skill_system_ready']),
  milestone('skill_system_ready', 'Skill System Ready', 'tutorial', 'tutorial', 'Skill registry and runner are available.', 'low', false, ['status_check_ready'], ['skills_status'], [], ['skill_system_ready'], ['evidence_system_ready']),
  milestone('evidence_system_ready', 'Evidence System Ready', 'tutorial', 'tutorial', 'Evidence tracking is available.', 'low', false, ['skill_system_ready'], ['evidence_status'], [], ['evidence_system_ready'], ['get_food']),
  milestone('server_bridge_status_known', 'Server Bridge Status Known', 'tutorial', 'early', 'tj can report whether the optional local Paper plugin bridge is reachable.', 'low', false, ['evidence_system_ready'], ['server_bridge_status'], [], ['bridge_status_reported'], ['plugin_bridge_connected']),
  milestone('plugin_bridge_connected', 'Plugin Bridge Connected', 'tutorial', 'early', 'The optional local Paper plugin bridge has been reached at least once.', 'low', false, ['server_bridge_status_known'], ['bridge_health'], [], ['bridge_connected'], ['first_bridge_event_recorded']),
  milestone('first_bridge_event_recorded', 'First Bridge Event Recorded', 'tutorial', 'early', 'A validated server-side bridge event has been recorded.', 'low', false, ['plugin_bridge_connected'], ['bridge_recent_events'], [], ['bridge_event_received'], ['protected_region_known']),
  milestone('home_region_registered', 'Home Region Registered', 'base', 'early', 'The home region has been registered with the optional local plugin bridge.', 'medium', true, ['set_home', 'server_bridge_status_known'], ['bridge_register_region'], [], ['bridge_region_registered'], ['protected_region_known']),
  milestone('protected_region_known', 'Protected Region Known', 'base', 'early', 'The bridge has reported at least one protected or watched region.', 'low', false, ['server_bridge_status_known'], ['bridge_regions'], [], ['bridge_protected_region_event'], []),
  milestone('advancement_bridge_available', 'Advancement Bridge Available', 'tutorial', 'mid', 'The bridge can report vanilla advancement events when Paper exposes them.', 'low', false, ['plugin_bridge_connected'], ['bridge_recent_advancements'], [], ['bridge_advancement_recorded'], []),
  milestone('death_event_bridge_available', 'Death Event Bridge Available', 'tutorial', 'mid', 'The bridge can report death/respawn events for debugging and recovery.', 'low', false, ['plugin_bridge_connected'], ['bridge_recent_deaths'], [], ['bridge_player_death_recorded', 'bridge_player_respawn_recorded'], []),

  milestone('get_food', 'Get Reliable Food', 'survival', 'early', 'Have enough food to survive basic tasks.', 'low', false, ['evidence_system_ready'], ['food_status', 'get_food'], ['food_security'], ['food_count_at_least_6'], ['prepare_for_night', 'mining_readiness']),
  milestone('equip_armor', 'Equip Armor', 'gear', 'early', 'Wear at least one armor piece when available.', 'low', false, ['get_food'], ['armor_status', 'equip_best_armor'], ['get_iron_gear'], ['armor_equipped'], ['combat_readiness']),
  milestone('craft_basic_tools', 'Craft Basic Tools', 'tools', 'early', 'Have basic tools for early survival.', 'low', false, ['get_food'], ['craft_basic_tools'], ['prepare_for_mining'], ['has_pickaxe'], ['gather_stone']),
  milestone('gather_wood', 'Gather Wood', 'survival', 'early', 'Carry enough logs for basic crafting and building.', 'low', false, ['get_food'], ['resource_run_wood'], ['stockpile_resources'], ['log_count_at_least_16'], ['craft_basic_tools', 'make_torches']),
  milestone('gather_stone', 'Gather Stone', 'tools', 'early', 'Carry enough stone/cobblestone for tools and safety blocks.', 'medium', false, ['craft_basic_tools'], ['resource_run_stone'], ['stockpile_resources'], ['cobblestone_count_at_least_32'], ['make_torches']),
  milestone('make_torches', 'Make Torches', 'survival', 'early', 'Carry enough torches for base and mining safety.', 'low', false, ['gather_wood'], ['craft_lighting'], ['prepare_for_mining'], ['torch_count_at_least_16'], ['prepare_for_night']),
  milestone('prepare_for_night', 'Prepare For Night', 'survival', 'early', 'Have food, torches, and a known home/base.', 'low', false, ['get_food', 'make_torches'], ['food_status', 'lighting_status', 'home_status'], ['prepare_for_night'], ['food_count_at_least_6', 'torch_count_at_least_16', 'home_set'], ['set_home', 'light_home']),

  milestone('set_home', 'Set Home', 'base', 'early', 'Save a safe home/base position.', 'low', false, ['connect_bot'], ['set_home', 'home_status'], ['improve_base'], ['home_set'], ['make_camp', 'place_storage']),
  milestone('make_camp', 'Make Camp', 'base', 'early', 'Have a simple remembered camp or base history.', 'medium', false, ['set_home'], ['build_camp'], ['improve_base'], ['shelter_known'], ['build_workstation']),
  milestone('place_storage', 'Place Storage', 'storage', 'early', 'Have registered storage for useful items.', 'medium', false, ['set_home'], ['storage_status', 'place_storage_chest'], ['improve_base'], ['storage_known'], ['mining_loot_deposited']),
  milestone('light_home', 'Light Home', 'base', 'early', 'Have lighting recorded around home.', 'low', false, ['set_home', 'make_torches'], ['light_home'], ['secure_base'], ['home_lit'], ['base_readiness']),
  milestone('build_workstation', 'Build Workstation', 'base', 'early', 'Know crafting and furnace support near base.', 'medium', false, ['set_home', 'gather_wood'], ['build_workstation'], ['improve_base'], ['crafting_table_known', 'furnace_known'], ['base_readiness']),
  milestone('build_small_shelter', 'Build Small Shelter', 'base', 'early', 'Have a remembered shelter/camp structure.', 'medium', false, ['make_camp'], ['build_shelter'], ['secure_base'], ['shelter_known'], ['base_readiness']),
  milestone('base_readiness', 'Base Readiness', 'base', 'early', 'Home, storage, workstation, and lighting are in reasonable shape.', 'low', false, ['set_home'], ['home_status', 'storage_status', 'skills_status'], ['progression_base_readiness'], ['home_set', 'storage_known'], ['mining_readiness']),

  milestone('blueprint_system_ready', 'Blueprint System Ready', 'base', 'early', 'Built-in deterministic blueprints can be listed and checked.', 'low', false, ['skill_system_ready'], ['blueprint_status', 'list_blueprints'], [], ['blueprint_status_reported', 'blueprint_list_reported'], ['first_blueprint_previewed']),
  milestone('first_blueprint_previewed', 'First Blueprint Previewed', 'base', 'early', 'A safe blueprint preview has been created.', 'low', false, ['blueprint_system_ready'], ['blueprint_preview'], [], ['blueprint_preview_created'], ['first_material_estimate']),
  milestone('first_material_estimate', 'First Material Estimate', 'base', 'early', 'Blueprint materials have been estimated.', 'low', false, ['first_blueprint_previewed'], ['blueprint_materials'], [], ['blueprint_materials_checked'], ['first_approved_blueprint_build']),
  milestone('first_approved_blueprint_build', 'First Approved Blueprint Build', 'base', 'mid', 'A blueprint build has been explicitly approved by ModVinny.', 'medium', true, ['first_material_estimate'], ['blueprint_build_small'], [], ['blueprint_build_approved'], ['starter_workstation_built', 'storage_wall_built', 'small_shelter_built']),
  milestone('starter_workstation_built', 'Starter Workstation Built', 'base', 'mid', 'A small workstation blueprint build completed.', 'medium', true, ['first_approved_blueprint_build'], ['blueprint_build_small'], [], ['blueprint_build_completed'], ['base_readiness']),
  milestone('storage_wall_built', 'Storage Wall Built', 'storage', 'mid', 'A small storage wall blueprint build completed.', 'medium', true, ['first_approved_blueprint_build'], ['blueprint_build_small'], [], ['blueprint_build_completed'], ['base_readiness']),
  milestone('small_shelter_built', 'Small Shelter Built', 'base', 'mid', 'A small deterministic shelter blueprint build completed.', 'medium', true, ['first_approved_blueprint_build'], ['blueprint_build_small'], [], ['blueprint_build_completed'], ['base_readiness']),
  milestone('mine_entrance_marker_built', 'Mine Entrance Marker Built', 'mining', 'mid', 'A mine entrance marker blueprint build completed.', 'medium', true, ['mining_readiness', 'first_approved_blueprint_build'], ['blueprint_build_small'], [], ['blueprint_build_completed'], ['safe_branch_mine']),
  milestone('portal_safety_frame_built', 'Portal Safety Frame Built', 'nether', 'nether', 'A safe marker/frame around a portal was built without lighting or entry.', 'medium', true, ['nether_checklist', 'first_approved_blueprint_build'], ['blueprint_build_small'], [], ['blueprint_build_completed'], ['nether_checklist']),

  milestone('create_wheat_farm', 'Create Wheat Farm', 'farming', 'mid', 'Have a registered wheat or crop farm.', 'medium', false, ['set_home', 'get_food'], ['create_farm', 'farming_status'], ['food_security'], ['wheat_farm_registered'], ['maintain_farm']),
  milestone('maintain_farm', 'Maintain Farm', 'farming', 'mid', 'Farm maintenance can run or report status.', 'low', false, ['create_wheat_farm'], ['maintain_farm'], ['food_security'], ['farm_registered'], ['food_security']),
  milestone('cook_food', 'Cook Food', 'food', 'early', 'Have cooked food available or cooking support.', 'low', false, ['get_food'], ['cook_food'], ['food_security'], ['cooked_food_available'], ['food_security']),
  milestone('food_security', 'Food Security', 'food', 'mid', 'Food, farm, or storage support is stable enough for longer plans.', 'low', false, ['get_food'], ['food_status', 'farming_status'], ['food_security'], ['food_count_at_least_6', 'farm_registered'], ['create_animal_pen']),
  milestone('create_animal_pen', 'Create Animal Pen', 'animals', 'mid', 'Have an animal pen registered near base.', 'medium', false, ['base_readiness'], ['create_animal_pen', 'animal_pen_status'], ['food_security'], ['animal_pen_registered'], ['breed_animals']),
  milestone('breed_animals', 'Breed Animals', 'animals', 'mid', 'Animal breeding support is available but owner-controlled.', 'medium', false, ['create_animal_pen'], ['breed_animals'], ['food_security'], ['animals_in_pen'], []),

  milestone('mining_readiness', 'Mining Readiness', 'mining', 'early', 'Have food, tools, and safe readiness for mining.', 'low', false, ['get_food', 'craft_basic_tools'], ['mining_status', 'inventory_summary', 'food_status'], ['prepare_for_mining'], ['mining_ready'], ['gather_coal']),
  milestone('gather_coal', 'Gather Coal', 'mining', 'early', 'Have coal for torches and smelting.', 'medium', false, ['mining_readiness'], ['mine_coal', 'mining_status'], ['stockpile_resources'], ['coal_acquired'], ['gather_iron']),
  milestone('gather_iron', 'Gather Iron', 'mining', 'mid', 'Have raw iron or iron ore available.', 'medium', false, ['gather_coal'], ['mine_iron'], ['get_iron_gear'], ['raw_iron_acquired'], ['smelt_iron']),
  milestone('smelt_iron', 'Smelt Iron', 'mining', 'mid', 'Have iron ingots from smelting or inventory.', 'low', false, ['gather_iron'], ['craft_item'], ['get_iron_gear'], ['iron_smelted'], ['craft_iron_tools', 'craft_shield']),
  milestone('craft_iron_tools', 'Craft Iron Tools', 'tools', 'mid', 'Have iron tool readiness.', 'medium', false, ['smelt_iron'], ['craft_item'], ['get_iron_gear'], ['has_iron_pickaxe'], ['craft_shield']),
  milestone('craft_shield', 'Craft Shield', 'gear', 'mid', 'Have a shield for safer combat and Nether prep.', 'low', false, ['smelt_iron'], ['craft_item'], ['get_iron_gear'], ['has_shield'], ['combat_readiness']),
  milestone('craft_iron_armor', 'Craft Iron Armor', 'gear', 'mid', 'Have stronger armor for mining and defense.', 'medium', false, ['smelt_iron'], ['craft_iron_armor'], ['get_iron_gear'], ['iron_armor_equipped'], ['nether_checklist']),
  milestone('safe_branch_mine', 'Safe Branch Mine', 'mining', 'advanced', 'Know a safe mine entrance and branch mining readiness.', 'medium', false, ['mining_readiness'], ['mining_status'], ['prepare_for_mining'], ['safe_mine_known'], []),

  milestone('remember_waypoint', 'Remember Waypoint', 'exploration', 'early', 'At least one waypoint is remembered.', 'low', false, ['set_home'], ['remember_location', 'map_status'], [], ['waypoint_created'], ['scan_area']),
  milestone('scan_area', 'Scan Area', 'exploration', 'early', 'Area scanning can report useful nearby information.', 'low', false, ['connect_bot'], ['scan_area'], [], ['map_status_reported'], ['scout_and_return']),
  milestone('scout_and_return', 'Scout And Return', 'exploration', 'mid', 'Scout behavior has completed or reported a safe return.', 'medium', false, ['remember_waypoint'], ['scout_direction'], [], ['scout_completed', 'returned_from_scout'], ['map_home_area']),
  milestone('map_home_area', 'Map Home Area', 'exploration', 'mid', 'Home area has waypoints or map memory.', 'low', false, ['remember_waypoint'], ['map_status'], [], ['home_waypoint_known'], ['mark_danger_zone']),
  milestone('mark_danger_zone', 'Mark Danger Zone', 'exploration', 'mid', 'A danger zone is marked in map memory.', 'low', false, ['scan_area'], ['scan_area'], [], ['danger_zone_marked'], []),

  milestone('combat_readiness', 'combat readiness', 'combat', 'early', 'Weapon, health, and basic combat status are ready.', 'low', false, ['get_food'], ['combat_status', 'armor_status'], [], ['combat_ready'], ['equip_weapon']),
  milestone('equip_weapon', 'Equip Weapon', 'combat', 'early', 'Have a weapon ready.', 'low', false, ['craft_basic_tools'], ['equip_combat_gear'], [], ['weapon_equipped'], ['protect_owner']),
  milestone('protect_owner', 'Protect Owner', 'combat', 'mid', 'Owner-defense can be enabled or reported.', 'medium', false, ['combat_readiness'], ['defend_owner'], [], ['protected_owner_reported'], ['guard_base']),
  milestone('guard_base', 'Guard Base', 'combat', 'mid', 'Base guard behavior can be enabled or reported.', 'medium', false, ['base_readiness'], ['guard_base'], ['secure_base'], ['threat_scan_reported'], []),
  milestone('survive_hostile_encounter', 'Survive Hostile Encounter', 'combat', 'mid', 'Survive a hostile encounter without treating combat as conquest.', 'medium', false, ['combat_readiness'], ['combat_status'], [], ['survived_hostile_encounter'], []),

  milestone('nether_checklist', 'Nether Checklist', 'nether', 'nether', 'Nether readiness can be checked safely.', 'low', false, ['base_readiness', 'combat_readiness'], ['nether_checklist'], ['prepare_for_nether'], ['nether_checklist_reported'], ['equip_gold_armor_piece']),
  milestone('equip_gold_armor_piece', 'Equip Gold Armor Piece', 'nether', 'nether', 'Have gold armor for piglin safety.', 'medium', false, ['nether_checklist'], ['equip_nether_gear'], ['prepare_for_nether'], ['has_gold_armor_piece'], ['prepare_nether_supplies']),
  milestone('prepare_nether_supplies', 'Prepare Nether Supplies', 'nether', 'nether', 'Food, blocks, portal supplies, and gear are ready enough for a controlled entry.', 'medium', true, ['nether_checklist'], ['prepare_nether', 'nether_checklist'], ['prepare_for_nether'], ['nether_supplies_ready'], ['build_portal']),
  milestone('build_portal', 'Build Portal', 'nether', 'nether', 'Portal frame can be built or known near home.', 'medium', true, ['prepare_nether_supplies'], ['build_portal', 'portal_status'], ['prepare_for_nether'], ['portal_known'], ['light_portal_confirmed']),
  milestone('light_portal_confirmed', 'Light Portal Confirmed', 'nether', 'nether', 'Portal lighting is confirmation-gated.', 'high', true, ['build_portal'], ['light_portal'], ['prepare_for_nether'], ['overworld_portal_remembered'], ['safe_nether_entry_confirmed']),
  milestone('safe_nether_entry_confirmed', 'Safe Nether Entry Confirmed', 'nether', 'nether', 'Nether entry is explicitly confirmed, portal remembered, and return behavior remains safe.', 'high', true, ['prepare_nether_supplies', 'build_portal'], ['safe_nether_entry'], ['prepare_for_nether'], ['nether_entry_completed'], ['remember_nether_portal']),
  milestone('remember_nether_portal', 'Remember Nether Portal', 'nether', 'nether', 'Nether-side return portal is remembered.', 'medium', true, ['safe_nether_entry_confirmed'], ['safe_nether_entry'], ['prepare_for_nether'], ['nether_portal_remembered'], ['return_from_nether']),
  milestone('return_from_nether', 'Return From Nether', 'nether', 'nether', 'Return from Nether is recorded.', 'medium', true, ['safe_nether_entry_confirmed'], ['return_from_nether'], ['prepare_for_nether'], ['returned_from_nether'], []),

  milestone('enchanting_status_known', 'Enchanting Status Known', 'enchanting', 'advanced', 'tj can report enchantment table, XP, lapis, and enchantable item readiness.', 'low', false, ['craft_iron_tools'], ['enchant_status'], ['prepare_enchanting'], ['enchant_status_reported'], ['lapis_available']),
  milestone('enchantment_table_known', 'Enchantment Table Known', 'enchanting', 'advanced', 'An enchantment table is nearby, carried, or remembered.', 'medium', false, ['enchanting_status_known'], ['enchant_status'], ['prepare_enchanting'], ['enchanting_table_known'], ['first_enchanted_item']),
  milestone('lapis_available', 'Lapis Available', 'enchanting', 'advanced', 'Lapis exists for safe low-level enchanting.', 'low', false, ['enchanting_status_known'], ['enchant_status'], ['prepare_enchanting'], ['lapis_available'], ['first_enchanted_item']),
  milestone('first_enchanted_item', 'First Enchanted Item', 'enchanting', 'advanced', 'A confirmed enchantment has been completed or an enchanted item is available.', 'medium', true, ['enchantment_table_known', 'lapis_available'], ['enchant_item'], ['prepare_enchanting'], ['first_enchanted_item'], ['anvil_known']),
  milestone('anvil_known', 'Anvil Known', 'gear', 'advanced', 'An anvil is nearby or available for repair/combine planning.', 'low', false, ['craft_iron_tools'], ['anvil_status'], ['repair_best_tools'], ['anvil_known'], ['first_repaired_item']),
  milestone('first_repaired_item', 'First Repaired Item', 'gear', 'advanced', 'A confirmed anvil repair has completed.', 'medium', true, ['anvil_known'], ['repair_item'], ['repair_best_tools'], ['item_repaired'], ['first_book_applied']),
  milestone('first_book_applied', 'First Book Applied', 'enchanting', 'advanced', 'A confirmed enchanted book application has completed.', 'medium', true, ['anvil_known'], ['apply_book_to_item'], ['improve_combat_gear'], ['book_applied'], []),
  milestone('potion_inventory_known', 'Potion Inventory Known', 'gear', 'advanced', 'tj can report carried potions and safe potion recommendations.', 'low', false, ['nether_checklist'], ['potion_status'], ['prepare_nether_gear'], ['potion_status_reported'], ['fire_resistance_available']),
  milestone('fire_resistance_available', 'Fire Resistance Available', 'gear', 'nether', 'Fire resistance is carried or otherwise available for Nether safety.', 'medium', false, ['potion_inventory_known'], ['potion_status'], ['acquire_fire_resistance'], ['fire_resistance_available'], ['nether_gear_ready']),
  milestone('brewing_status_known', 'Brewing Status Known', 'enchanting', 'advanced', 'tj can honestly report brewing support and supplies.', 'low', false, ['potion_inventory_known'], ['brewing_status'], ['acquire_fire_resistance'], ['brewing_status_reported'], []),
  milestone('nether_gear_ready', 'Nether Gear Ready', 'gear', 'nether', 'Gold armor awareness, armor readiness, and potion awareness are checked for Nether prep.', 'medium', false, ['nether_checklist', 'potion_inventory_known'], ['nether_gear_readiness'], ['prepare_nether_gear'], ['nether_gear_ready'], []),
  milestone('mining_pickaxe_upgraded', 'Mining Pickaxe Upgraded', 'gear', 'advanced', 'A strong pickaxe is available for safer mining progression.', 'medium', false, ['craft_iron_tools'], ['gear_status'], ['improve_mining_gear'], ['mining_pickaxe_upgraded'], []),
  milestone('combat_weapon_upgraded', 'Combat Weapon Upgraded', 'gear', 'advanced', 'A stronger weapon is available for defensive combat readiness.', 'medium', false, ['combat_readiness'], ['gear_status'], ['improve_combat_gear'], ['combat_weapon_upgraded'], []),
  milestone('armor_upgraded', 'Armor Upgraded', 'gear', 'advanced', 'Iron or better armor is available or equipped.', 'medium', false, ['craft_iron_armor'], ['gear_status'], ['improve_combat_gear'], ['armor_upgraded'], []),

  milestone('village_found', 'Village Found', 'villagers', 'mid', 'A possible or confirmed village has been discovered and remembered.', 'low', false, [], ['villager_status', 'scan_villagers'], ['find_village'], ['village_found'], ['villager_professions_known']),
  milestone('villager_professions_known', 'Villager Professions Known', 'villagers', 'mid', 'Nearby or remembered villager professions are known.', 'low', false, ['village_found'], ['scan_villagers'], ['inspect_village_trades'], ['villager_profession_recorded'], ['first_trade_inspected']),
  milestone('first_trade_inspected', 'First Trade Inspected', 'villagers', 'mid', 'At least one villager trade window was inspected safely.', 'medium', false, ['villager_professions_known'], ['inspect_villager_trades'], ['inspect_village_trades'], ['villager_trade_inspected'], ['emeralds_acquired']),
  milestone('emeralds_acquired', 'Emeralds Acquired', 'villagers', 'mid', 'Emeralds are available or the economy can report an emerald count.', 'low', false, [], ['economy_status'], ['start_emerald_economy'], ['emerald_count_reported'], ['trading_economy_started']),
  milestone('first_trade_completed', 'First Trade Completed', 'villagers', 'mid', 'A confirmed owner-approved villager trade completed.', 'medium', true, ['first_trade_inspected'], ['execute_trade'], ['start_emerald_economy'], ['trade_completed'], ['trading_economy_started']),
  milestone('librarian_found', 'Librarian Found', 'villagers', 'mid', 'A librarian villager has been seen or remembered.', 'low', false, ['village_found'], ['scan_villagers'], ['find_librarian'], ['librarian_found'], ['valuable_book_trade_found']),
  milestone('valuable_book_trade_found', 'Valuable Book Trade Found', 'villagers', 'advanced', 'A potentially valuable enchanted book trade was found.', 'medium', false, ['first_trade_inspected'], ['suggest_trades'], ['find_mending_trade'], ['valuable_trade_found'], ['mending_trade_found']),
  milestone('mending_trade_found', 'Mending Trade Found', 'villagers', 'advanced', 'A possible or verified mending trade was found.', 'medium', false, ['librarian_found'], ['suggest_trades'], ['find_mending_trade'], ['mending_trade_found'], []),
  milestone('farmer_trade_found', 'Farmer Trade Found', 'villagers', 'mid', 'A farmer or food/emerald trade was found.', 'low', false, ['village_found'], ['suggest_trades'], ['start_emerald_economy'], ['valuable_trade_found'], ['trading_economy_started']),
  milestone('trading_economy_started', 'Trading Economy Started', 'villagers', 'mid', 'tj can report economy state and useful trades.', 'low', false, ['emeralds_acquired'], ['economy_status', 'suggest_trades'], ['start_emerald_economy'], ['emerald_count_reported', 'trade_options_reported'], ['first_trade_completed']),
  milestone('villager_protected', 'Villager Protected', 'villagers', 'mid', 'Village protection status or safety warning was reported.', 'medium', false, ['village_found'], ['protect_villager'], ['protect_village'], ['villager_protected_reported'], []),
  milestone('trading_post_known', 'Trading Post Known', 'villagers', 'mid', 'A village or valuable villager waypoint is remembered for trading.', 'low', false, ['village_found'], ['remember_village'], ['inspect_village_trades'], ['village_waypoint_created'], []),
  futureMilestone('villager_breeding', 'Villager Breeding', 'villagers', 'postgame', 'Future villager breeding support.', ['villager_seen']),
  futureMilestone('villager_transport', 'Villager Transport', 'villagers', 'postgame', 'Future villager transport support.', ['villager_seen']),
  futureMilestone('villager_trading_hall', 'Villager Trading Hall', 'villagers', 'postgame', 'Future trading hall support.', ['trading_post_known']),
  futureMilestone('raid_farm', 'Raid Farm', 'automation', 'postgame', 'Future raid farm support.', ['villager_protected_reported']),
  futureMilestone('cured_villager_discounts', 'Cured Villager Discounts', 'villagers', 'postgame', 'Future cured villager discount support.', ['villager_seen']),
  futureMilestone('full_enchanting_setup', 'Full Enchanting Setup', 'enchanting', 'advanced', 'Future full bookshelf enchanting setup.', ['enchanting_table_known']),
  futureMilestone('mending_book_acquired', 'Mending Book Acquired', 'enchanting', 'advanced', 'Future reliable mending book acquisition.', ['enchanted_book_inventory_reported']),
  futureMilestone('netherite_upgrade', 'Netherite Upgrade', 'gear', 'postgame', 'Future netherite upgrade support.', ['gear_status_reported']),
  futureMilestone('potion_brewing_mastery', 'Potion Brewing Mastery', 'nether', 'advanced', 'Future reliable brewing support.', ['potion_brewed']),
  futureMilestone('villager_enchanted_book_economy', 'Villager Enchanted Book Economy', 'villagers', 'postgame', 'Future large-scale enchanted book economy.', ['valuable_trade_found']),
  futureMilestone('imported_schematic_built', 'Imported Schematic Built', 'base', 'postgame', 'Future imported schematic build support.', ['schematic_imported']),
  futureMilestone('large_build_completed', 'Large Build Completed', 'base', 'postgame', 'Future large blueprint build support.', ['blueprint_build_completed']),
  futureMilestone('redstone_blueprint_built', 'Redstone Blueprint Built', 'automation', 'postgame', 'Future redstone blueprint support.', ['blueprint_build_completed']),
  futureMilestone('decorative_base_blueprints', 'Decorative Base Blueprints', 'base', 'postgame', 'Future decorative blueprint set.', ['blueprint_preview_created']),
  futureMilestone('multi_bot_construction', 'Multi Bot Construction', 'automation', 'postgame', 'Future multi-bot construction support.', ['blueprint_build_completed']),
  futureMilestone('server_plugin_inventory_bridge', 'Server Plugin Inventory Bridge', 'automation', 'postgame', 'Future read-only inventory bridge if it can be kept non-cheaty.', ['bridge_event_received']),
  futureMilestone('server_plugin_villager_trade_bridge', 'Server Plugin Villager Trade Bridge', 'villagers', 'postgame', 'Future server-side villager trade telemetry.', ['bridge_villager_event_recorded']),
  futureMilestone('server_plugin_region_editor', 'Server Plugin Region Editor', 'automation', 'postgame', 'Future stronger region editor with confirmations.', ['bridge_region_registered']),
  futureMilestone('server_plugin_multibot_coordinator', 'Server Plugin Multi-Bot Coordinator', 'automation', 'postgame', 'Future multi-bot server-side coordination telemetry.', ['bridge_status_reported']),
  futureMilestone('potion_brewing', 'Potion Brewing', 'nether', 'advanced', 'Future brewing support.', ['blaze_rod_acquired']),
  futureMilestone('blaze_rod_acquired', 'Blaze Rod Acquired', 'nether', 'nether', 'Future fortress combat progression.', ['blaze_rod_acquired']),
  futureMilestone('fortress_found', 'Fortress Found', 'nether', 'nether', 'Future fortress search progression.', ['fortress_found']),
  futureMilestone('ender_pearl_collection', 'Ender Pearl Collection', 'end', 'endgame', 'Future End preparation.', ['ender_pearl_acquired']),
  futureMilestone('stronghold_found', 'Stronghold Found', 'end', 'endgame', 'Future stronghold search.', ['stronghold_found']),
  futureMilestone('enter_end', 'Enter The End', 'end', 'endgame', 'Future End entry.', ['end_portal_found']),
  futureMilestone('defeat_dragon', 'Defeat Dragon', 'end', 'endgame', 'Future dragon fight.', ['dragon_defeated'])
];

function milestone(id, name, category, tier, description, riskLevel, requiresConfirmation, prerequisites, requiredSkills, recommendedGoals, successEvidence, unlocks, implemented = true) {
  return {
    id,
    name,
    category,
    tier,
    description,
    riskLevel,
    requiresConfirmation,
    prerequisites,
    requiredSkills,
    recommendedGoals,
    successEvidence,
    blockedBy: [],
    unlocks,
    implemented
  };
}

function futureMilestone(id, name, category, tier, description, successEvidence) {
  return {
    ...milestone(id, name, category, tier, description, 'high', true, [], [], [], successEvidence, [], false),
    blockedBy: ['future system']
  };
}

function clone(item) {
  return {
    ...item,
    prerequisites: [...item.prerequisites],
    requiredSkills: [...item.requiredSkills],
    recommendedGoals: [...item.recommendedGoals],
    successEvidence: [...item.successEvidence],
    blockedBy: [...item.blockedBy],
    unlocks: [...item.unlocks]
  };
}

function stateData(state = {}) {
  return state && typeof state === 'object' ? state : {};
}

function completedIds(state = {}) {
  return new Set(Object.keys(stateData(state).completedMilestones || {}));
}

export function getProgressionMilestones() {
  return milestones.map(clone);
}

export function getMilestone(id) {
  const key = String(id || '').trim().toLowerCase().replace(/\s+/g, '_');
  const found = milestones.find((item) => item.id === key || item.name.toLowerCase().replace(/\s+/g, '_') === key);
  return found ? clone(found) : null;
}

export function listMilestones(filters = {}) {
  return getProgressionMilestones().filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.tier && item.tier !== filters.tier) return false;
    if (filters.implemented !== undefined && item.implemented !== filters.implemented) return false;
    if (filters.riskLevel && item.riskLevel !== filters.riskLevel) return false;
    return true;
  });
}

export function listMilestonesByCategory(category) {
  return listMilestones({ category });
}

export function listMilestonesByTier(tier) {
  return listMilestones({ tier });
}

export function listCompletedMilestones(state) {
  const complete = completedIds(state);
  return getProgressionMilestones().filter((item) => complete.has(item.id));
}

export function listIncompleteMilestones(state) {
  const complete = completedIds(state);
  return getProgressionMilestones().filter((item) => !complete.has(item.id));
}

export function listAvailableMilestones(state) {
  const complete = completedIds(state);
  return getProgressionMilestones().filter((item) => (
    item.implemented &&
    !complete.has(item.id) &&
    item.prerequisites.every((id) => complete.has(id))
  ));
}

export function listBlockedMilestones(state) {
  const complete = completedIds(state);
  const explicit = new Set(Object.keys(stateData(state).blockedMilestones || {}));
  return getProgressionMilestones().filter((item) => (
    explicit.has(item.id) ||
    !item.implemented ||
    item.prerequisites.some((id) => !complete.has(id))
  ));
}

export function getMilestonePrerequisites(id) {
  return getMilestone(id)?.prerequisites || [];
}

export function getMilestoneRequiredSkills(id) {
  return getMilestone(id)?.requiredSkills || [];
}

export function getMilestoneEvidence(id) {
  return getMilestone(id)?.successEvidence || [];
}

function detectCycles() {
  const byId = new Map(milestones.map((item) => [item.id, item]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id, path = []) {
    if (visiting.has(id)) {
      cycles.push([...path, id].join(' -> '));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const item = byId.get(id);
    for (const prereq of item?.prerequisites || []) visit(prereq, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const item of milestones) visit(item.id);
  return cycles;
}

export function validateMilestoneDefinitions() {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const categories = new Set(PROGRESSION_CATEGORIES);
  const tiers = new Set(PROGRESSION_TIERS);
  const riskLevels = new Set(['low', 'medium', 'high']);

  for (const item of milestones) {
    if (!item.id || !/^[a-z0-9_]+$/.test(item.id)) errors.push(`${item.id || 'unknown'} has invalid id`);
    if (ids.has(item.id)) errors.push(`duplicate milestone id ${item.id}`);
    ids.add(item.id);
    if (!categories.has(item.category)) errors.push(`${item.id} has invalid category ${item.category}`);
    if (!tiers.has(item.tier)) errors.push(`${item.id} has invalid tier ${item.tier}`);
    if (!riskLevels.has(item.riskLevel)) errors.push(`${item.id} has invalid risk level ${item.riskLevel}`);
    if (!Array.isArray(item.successEvidence) || item.successEvidence.length === 0) errors.push(`${item.id} needs successEvidence`);
    for (const prereq of item.prerequisites || []) {
      if (!ids.has(prereq) && !milestones.some((candidate) => candidate.id === prereq)) errors.push(`${item.id} has unknown prerequisite ${prereq}`);
    }
    for (const skillName of item.requiredSkills || []) {
      if (!getSkill(skillName)) errors.push(`${item.id} references unknown skill ${skillName}`);
    }
    for (const evidenceName of item.successEvidence || []) {
      if (!getProgressionEvidenceDefinition(evidenceName) && !getEvidenceDefinition(evidenceName)) errors.push(`${item.id} references unknown evidence ${evidenceName}`);
    }
    if (!item.implemented && item.unlocked) warnings.push(`${item.id} is future but appears unlocked`);
  }

  const evidenceValidation = validateProgressionEvidenceNames(milestones);
  errors.push(...evidenceValidation.errors);
  for (const cycle of detectCycles()) errors.push(`circular prerequisite chain: ${cycle}`);

  return { ok: errors.length === 0, errors, warnings, count: milestones.length };
}

export function generateProgressionSummary(state = {}) {
  const complete = completedIds(state);
  const total = milestones.length;
  const completed = milestones.filter((item) => complete.has(item.id)).length;
  const implemented = milestones.filter((item) => item.implemented).length;
  const byCategory = {};
  const byTier = {};
  for (const item of milestones) {
    byCategory[item.category] ||= { total: 0, completed: 0, implemented: 0 };
    byTier[item.tier] ||= { total: 0, completed: 0, implemented: 0 };
    byCategory[item.category].total += 1;
    byTier[item.tier].total += 1;
    if (item.implemented) {
      byCategory[item.category].implemented += 1;
      byTier[item.tier].implemented += 1;
    }
    if (complete.has(item.id)) {
      byCategory[item.category].completed += 1;
      byTier[item.tier].completed += 1;
    }
  }
  return {
    total,
    implemented,
    completed,
    incomplete: total - completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    byCategory,
    byTier
  };
}
