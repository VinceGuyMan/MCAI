const aliases = new Map([
  ['night', 'prepare_for_night'],
  ['prepare night', 'prepare_for_night'],
  ['prepare for night', 'prepare_for_night'],
  ['base', 'improve_base'],
  ['improve base', 'improve_base'],
  ['mining', 'prepare_for_mining'],
  ['prepare mining', 'prepare_for_mining'],
  ['prepare for mining', 'prepare_for_mining'],
  ['iron', 'get_iron_gear'],
  ['iron gear', 'get_iron_gear'],
  ['get iron gear', 'get_iron_gear'],
  ['progress to iron', 'progress_to_iron'],
  ['progress_to_iron', 'progress_to_iron'],
  ['iron age', 'progress_to_iron'],
  ['to iron', 'progress_to_iron'],
  ['food', 'food_security'],
  ['food security', 'food_security'],
  ['build food security', 'food_security'],
  ['stockpile', 'stockpile_resources'],
  ['stockpile resources', 'stockpile_resources'],
  ['secure base', 'secure_base'],
  ['nether', 'prepare_for_nether'],
  ['nether prep', 'prepare_for_nether'],
  ['prepare nether', 'prepare_for_nether'],
  ['prepare for nether', 'prepare_for_nether'],
  ['progression prepare for night', 'prepare_for_night'],
  ['progression_prepare_for_night', 'prepare_for_night'],
  ['progression food security', 'food_security'],
  ['progression_food_security', 'food_security'],
  ['progression mining readiness', 'prepare_for_mining'],
  ['progression_mining_readiness', 'prepare_for_mining'],
  ['progression get iron gear', 'get_iron_gear'],
  ['progression_get_iron_gear', 'get_iron_gear'],
  ['progression base readiness', 'improve_base'],
  ['progression_base_readiness', 'improve_base'],
  ['progression nether prep', 'prepare_for_nether'],
  ['progression_nether_prep', 'prepare_for_nether'],
  ['prepare enchanting', 'prepare_enchanting'],
  ['prepare_enchanting', 'prepare_enchanting'],
  ['mining gear', 'improve_mining_gear'],
  ['improve mining gear', 'improve_mining_gear'],
  ['combat gear', 'improve_combat_gear'],
  ['improve combat gear', 'improve_combat_gear'],
  ['nether gear', 'prepare_nether_gear'],
  ['prepare nether gear', 'prepare_nether_gear'],
  ['fire resistance', 'acquire_fire_resistance'],
  ['acquire fire resistance', 'acquire_fire_resistance'],
  ['repair tools', 'repair_best_tools'],
  ['repair best tools', 'repair_best_tools'],
  ['find village', 'find_village'],
  ['inspect village trades', 'inspect_village_trades'],
  ['start emerald economy', 'start_emerald_economy'],
  ['find librarian', 'find_librarian'],
  ['find mending trade', 'find_mending_trade'],
  ['improve gear with trading', 'improve_gear_with_trading'],
  ['prepare trading supplies', 'prepare_trading_supplies'],
  ['protect village', 'protect_village'],
  ['build starter workstation', 'build_starter_workstation'],
  ['build small shelter', 'build_small_shelter'],
  ['build storage wall', 'build_storage_wall'],
  ['build mine entrance marker', 'build_mine_entrance_marker'],
  ['improve base with blueprints', 'improve_base_with_blueprints']
]);

function step(id, description, action, args = {}, riskLevel = 'low', requiresConfirmation = false) {
  return {
    id,
    description,
    action,
    args,
    status: 'pending',
    riskLevel,
    requiresConfirmation,
    successCriteria: { type: 'world_state', description }
  };
}

const templates = {
  prepare_for_night: {
    name: 'Prepare for Night',
    type: 'survival',
    priority: 'high',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Get tj and the base ready for night.',
    reason: 'Food, armour, torches, and a safe home reduce surprise deaths.',
    steps: [
      step('step_1', 'Check food supplies', 'food_status'),
      step('step_2', 'Check armour', 'armor_status'),
      step('step_3', 'Check torches and lighting supplies', 'craft_lighting'),
      step('step_4', 'Check shelter and home status', 'home_status'),
      step('step_5', 'Return home', 'return_home'),
      step('step_6', 'Light home if needed', 'light_home'),
      step('step_7', 'Stay safe near home or ModVinny', 'status')
    ]
  },
  improve_base: {
    name: 'Improve Base',
    type: 'base',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Make the home base more useful and orderly.',
    reason: 'A workstation, storage, and lighting make later work safer.',
    steps: [
      step('step_1', 'Check home status', 'home_status'),
      step('step_2', 'Check storage', 'storage_status'),
      step('step_3', 'Build workstation if missing', 'build_workstation', {}, 'medium'),
      step('step_4', 'Craft or place storage if missing', 'craft_storage'),
      step('step_5', 'Light home', 'light_home'),
      step('step_6', 'Store excess items', 'store_items'),
      step('step_7', 'Report base needs', 'base_maintenance')
    ]
  },
  prepare_for_mining: {
    name: 'Prepare for Mining',
    type: 'mining',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Prepare supplies for safe, capped mining.',
    reason: 'Mining goes badly without food, torches, and a usable pickaxe.',
    steps: [
      step('step_1', 'Check food supplies', 'food_status'),
      step('step_2', 'Gather wood if needed', 'collect_resource', { resource: 'wood', count: 16 }),
      step('step_3', 'Craft wooden tools', 'craft_basic_tools'),
      step('step_4', 'Gather stone', 'collect_resource', { resource: 'stone', count: 24 }),
      step('step_5', 'Craft stone tools', 'craft_stone_tools'),
      step('step_6', 'Make charcoal for fuel if possible', 'smelt_charcoal', { count: 4 }),
      step('step_7', 'Craft torches', 'craft_lighting'),
      step('step_8', 'Verify mining readiness', 'mining_status')
    ]
  },
  progress_to_iron: {
    name: 'Progress to Iron',
    type: 'mining',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Surface path from wood through iron tools and basic iron armor.',
    reason: 'A single ordered path is more reliable than one-off commands.',
    steps: [
      step('step_1', 'Check food', 'food_status'),
      step('step_2', 'Gather wood', 'collect_resource', { resource: 'wood', count: 16 }),
      step('step_3', 'Craft wooden tools', 'craft_basic_tools'),
      step('step_4', 'Gather stone', 'collect_resource', { resource: 'stone', count: 24 }),
      step('step_5', 'Craft furnace', 'craft_item', { itemName: 'furnace', count: 1 }),
      step('step_6', 'Craft stone tools', 'craft_stone_tools'),
      step('step_7', 'Make charcoal', 'smelt_charcoal', { count: 4 }),
      step('step_8', 'Mine coal if available', 'mine_coal', { count: 8 }),
      step('step_9', 'Craft torches', 'craft_lighting'),
      step('step_10', 'Mine visible iron', 'mine_iron', { count: 8 }, 'medium'),
      step('step_11', 'Smelt iron ingots', 'smelt_iron', { count: 8 }, 'medium'),
      step('step_12', 'Craft iron tools', 'craft_iron_tools'),
      step('step_13', 'Craft iron armor', 'craft_iron_armor', {}, 'medium'),
      step('step_14', 'Equip best armor', 'equip_best_armor'),
      step('step_15', 'Report combat/gear status', 'combat_status')
    ]
  },
  get_iron_gear: {
    name: 'Get Iron Gear',
    type: 'mining',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Prep tools, mine and smelt iron, then craft iron tools and armor.',
    reason: 'Iron gear improves mining and combat survival.',
    steps: [
      step('step_1', 'Check food', 'food_status'),
      step('step_2', 'Check current gear', 'combat_status'),
      step('step_3', 'Gather wood if needed', 'collect_resource', { resource: 'wood', count: 12 }),
      step('step_4', 'Craft wooden tools', 'craft_basic_tools'),
      step('step_5', 'Gather stone', 'collect_resource', { resource: 'stone', count: 24 }),
      step('step_6', 'Craft stone tools', 'craft_stone_tools'),
      step('step_7', 'Make charcoal for fuel', 'smelt_charcoal', { count: 4 }),
      step('step_8', 'Craft torches', 'craft_lighting'),
      step('step_9', 'Mine safe visible iron', 'mine_iron', { count: 12 }, 'medium'),
      step('step_10', 'Smelt iron into ingots (batch)', 'smelt_iron', { count: 12 }, 'medium'),
      step('step_11', 'Craft iron tools', 'craft_iron_tools'),
      step('step_12', 'Craft shield if possible', 'craft_item', { itemName: 'shield', count: 1 }),
      step('step_13', 'Craft iron armor set', 'craft_iron_armor', {}, 'medium'),
      step('step_14', 'Equip combat gear', 'equip_combat_gear'),
      step('step_15', 'Report gear status', 'combat_status')
    ]
  },
  food_security: {
    name: 'Build Food Security',
    type: 'food',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Make food less fragile by using farms, cooking, and storage.',
    reason: 'A stable food source prevents hunger emergencies.',
    steps: [
      step('step_1', 'Check food status', 'food_status'),
      step('step_2', 'Check farm status', 'farming_status'),
      step('step_3', 'Create a small wheat farm if missing and approved', 'create_farm', { cropType: 'wheat' }, 'medium', true),
      step('step_4', 'Maintain farm', 'maintain_farm'),
      step('step_5', 'Cook food if raw food exists', 'cook_food'),
      step('step_6', 'Store extra food', 'store_items'),
      step('step_7', 'Report food security status', 'food_status')
    ]
  },
  stockpile_resources: {
    name: 'Stockpile Resources',
    type: 'base',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Gather and store core supplies.',
    reason: 'Wood, stone, and coal unlock most safe base work.',
    steps: [
      step('step_1', 'Check storage', 'storage_status'),
      step('step_2', 'Gather wood', 'resource_run_wood', { count: 16 }),
      step('step_3', 'Gather stone', 'resource_run_stone', { count: 32 }, 'medium', true),
      step('step_4', 'Gather coal', 'resource_run_coal', { count: 8 }, 'medium', true),
      step('step_5', 'Store excess items', 'store_items'),
      step('step_6', 'Report totals', 'storage_status')
    ]
  },
  secure_base: {
    name: 'Secure Base',
    type: 'combat',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Reduce base danger with scans, lighting, and defensive readiness.',
    reason: 'A lit base is safer than fighting surprise mobs.',
    steps: [
      step('step_1', 'Scan threats', 'threat_scan'),
      step('step_2', 'Check lighting', 'home_status'),
      step('step_3', 'Light home', 'light_home'),
      step('step_4', 'Equip combat gear', 'equip_combat_gear'),
      step('step_5', 'Guard base only if commanded', 'guard_base', {}, 'medium', true),
      step('step_6', 'Report danger zones', 'combat_status')
    ]
  },
  prepare_for_nether: {
    name: 'Prepare for Nether',
    type: 'nether_prep',
    priority: 'normal',
    riskLevel: 'high',
    requiresConfirmation: true,
    description: 'Prepare supplies, portal handling, and one controlled safe Nether entry.',
    reason: 'Nether entry is dangerous, so tj needs food, gear, blocks, a portal, and explicit confirmation.',
    steps: [
      step('step_1', 'Check Nether readiness', 'nether_checklist'),
      step('step_2', 'Prepare Nether food', 'prepare_nether_food'),
      step('step_3', 'Prepare Nether blocks', 'prepare_nether_blocks'),
      step('step_4', 'Prepare Nether gear', 'prepare_nether_gear'),
      step('step_5', 'Prepare portal supplies', 'prepare_nether_portal_supplies'),
      step('step_6', 'Equip Nether gear', 'equip_nether_gear'),
      step('step_7', 'Check portal status', 'portal_status'),
      step('step_8', 'Build portal if missing and approved', 'build_portal', {}, 'medium'),
      step('step_9', 'Light portal only after confirmation', 'light_portal', {}, 'high', true),
      step('step_10', 'Perform safe Nether entry only after confirmation', 'safe_nether_entry', {}, 'high', true),
      step('step_11', 'Return from Nether', 'return_from_nether', {}, 'high'),
      step('step_12', 'Report Nether status', 'nether_status')
    ]
  },
  prepare_enchanting: {
    name: 'Prepare Enchanting',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Check XP, lapis, enchantment table readiness, and safe enchant candidates.',
    reason: 'Enchanting can improve gear, but it spends XP and lapis.',
    steps: [
      step('step_1', 'Check gear status', 'gear_status'),
      step('step_2', 'Check enchanting readiness', 'enchant_status'),
      step('step_3', 'Inspect options if supplies exist', 'enchant_options'),
      step('step_4', 'Suggest upgrades without spending resources', 'suggest_gear_upgrades')
    ]
  },
  improve_mining_gear: {
    name: 'Improve Mining Gear',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Plan better tools for mining without spending rare resources automatically.',
    reason: 'A good pickaxe and repair plan make mining safer.',
    steps: [
      step('step_1', 'Check mining readiness', 'mining_status'),
      step('step_2', 'Check gear status', 'gear_status'),
      step('step_3', 'Check enchanting readiness', 'enchant_status'),
      step('step_4', 'Check anvil repair options', 'anvil_status')
    ]
  },
  improve_combat_gear: {
    name: 'Improve Combat Gear',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Plan safer weapon and armor upgrades.',
    reason: 'Better armor and weapons help defensive combat without making tj reckless.',
    steps: [
      step('step_1', 'Check combat status', 'combat_status'),
      step('step_2', 'Check gear status', 'gear_status'),
      step('step_3', 'Check armor status', 'armor_status'),
      step('step_4', 'Suggest gear upgrades', 'suggest_gear_upgrades')
    ]
  },
  prepare_nether_gear: {
    name: 'Prepare Nether Gear',
    type: 'gear',
    priority: 'high',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Check gold armor, armor score, food, blocks, and potion readiness for Nether prep.',
    reason: 'Nether gear readiness is a checklist, not permission to enter the Nether.',
    steps: [
      step('step_1', 'Check Nether checklist', 'nether_checklist'),
      step('step_2', 'Check Nether gear readiness', 'nether_gear_readiness'),
      step('step_3', 'Check potions', 'potion_status'),
      step('step_4', 'Check brewing support honestly', 'brewing_status')
    ]
  },
  acquire_fire_resistance: {
    name: 'Acquire Fire Resistance',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Check whether fire resistance is carried and whether brewing is supported.',
    reason: 'Fire resistance is useful for Nether safety, but brewing is not claimed unless supported.',
    steps: [
      step('step_1', 'Check potion inventory', 'potion_status'),
      step('step_2', 'Check brewing support and supplies', 'brewing_status'),
      step('step_3', 'Recommend potion loadout', 'carry_potion_loadout')
    ]
  },
  repair_best_tools: {
    name: 'Repair Best Tools',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Check repair candidates without using the anvil automatically.',
    reason: 'Repairing good tools can save resources, but anvil actions spend XP/items.',
    steps: [
      step('step_1', 'Check anvil status', 'anvil_status'),
      step('step_2', 'Check gear status', 'gear_status'),
      step('step_3', 'Suggest upgrades', 'suggest_gear_upgrades')
    ]
  },
  find_village: {
    name: 'Find Village',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Use existing exploration/map memory to look for or remember villages safely.',
    reason: 'Villages unlock trading and gear progression, but travel remains owner-controlled.',
    steps: [
      step('step_1', 'Check known villages', 'village_status'),
      step('step_2', 'Scan nearby villagers', 'scan_villagers'),
      step('step_3', 'Remember visible village if present', 'remember_village')
    ]
  },
  inspect_village_trades: {
    name: 'Inspect Village Trades',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Inspect nearby villager trades without buying anything.',
    reason: 'Trade inspection helps identify useful books and gear without spending emeralds.',
    steps: [
      step('step_1', 'Check trading status', 'trading_status'),
      step('step_2', 'Inspect nearby villager trades', 'inspect_villager_trades'),
      step('step_3', 'Rank best known trades', 'best_known_trades')
    ]
  },
  start_emerald_economy: {
    name: 'Start Emerald Economy',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Check emeralds and useful trades without executing trades automatically.',
    reason: 'Emerald reserves prevent tj from spending the whole wallet.',
    steps: [
      step('step_1', 'Check economy status', 'economy_status'),
      step('step_2', 'Suggest useful trades', 'suggest_trades'),
      step('step_3', 'Report trade history', 'trade_history')
    ]
  },
  find_librarian: {
    name: 'Find Librarian',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Look for librarian villagers and book trades through visible/known data.',
    reason: 'Librarians can unlock excellent enchanted books, but book buying needs confirmation.',
    steps: [
      step('step_1', 'Check known villagers', 'villager_status'),
      step('step_2', 'Scan nearby villagers', 'scan_villagers'),
      step('step_3', 'Suggest book trades', 'suggest_trades')
    ]
  },
  find_mending_trade: {
    name: 'Find Mending Trade',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Search remembered trades for mending or other valuable book leads.',
    reason: 'Mending is valuable enough that tj should track it but not auto-buy it.',
    steps: [
      step('step_1', 'Check valuable villagers', 'valuable_villagers'),
      step('step_2', 'Rank best known trades', 'best_known_trades'),
      step('step_3', 'Check economy status', 'economy_status')
    ]
  },
  improve_gear_with_trading: {
    name: 'Improve Gear With Trading',
    type: 'gear',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Use villager trade recommendations to support gear upgrades.',
    reason: 'Good books and gear can help progression, but purchases and anvil use require confirmation.',
    steps: [
      step('step_1', 'Check gear status', 'gear_status'),
      step('step_2', 'Suggest trades', 'suggest_trades'),
      step('step_3', 'Check economy status', 'economy_status')
    ]
  },
  prepare_trading_supplies: {
    name: 'Prepare Trading Supplies',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Report common trade inputs and economy readiness.',
    reason: 'Paper, wheat, sticks, coal, and emeralds often decide whether trades are useful.',
    steps: [
      step('step_1', 'Check inventory', 'inventory_status'),
      step('step_2', 'Check economy status', 'economy_status'),
      step('step_3', 'Suggest trades', 'suggest_trades')
    ]
  },
  protect_village: {
    name: 'Protect Village',
    type: 'villagers',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Report villager safety warnings without attacking golems or starting raids.',
    reason: 'Valuable villagers are worth protecting, but tj should not become reckless.',
    steps: [
      step('step_1', 'Check village safety', 'village_protection_status'),
      step('step_2', 'Check combat status', 'combat_status'),
      step('step_3', 'Report valuable villagers', 'valuable_villagers')
    ]
  },
  build_starter_workstation: {
    name: 'Build Starter Workstation',
    type: 'blueprints',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Plan and build the starter workstation blueprint after owner confirmation.',
    reason: 'A deterministic workstation is useful for early base setup without custom LLM building.',
    steps: [
      step('step_1', 'Preview starter workstation', 'blueprint_preview', { blueprintId: 'starter_workstation' }),
      step('step_2', 'Check materials', 'blueprint_materials', { blueprintId: 'starter_workstation' }),
      step('step_3', 'Plan build', 'blueprint_plan', { blueprintId: 'starter_workstation' }),
      step('step_4', 'Build only after confirmation', 'blueprint_build_approved', { blueprintId: 'starter_workstation' }, 'medium', true)
    ]
  },
  build_small_shelter: {
    name: 'Build Small Shelter',
    type: 'blueprints',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Plan and build the small shelter blueprint after owner confirmation.',
    reason: 'The shelter blueprint is small, deterministic, and cancellable.',
    steps: [
      step('step_1', 'Preview small shelter', 'blueprint_preview', { blueprintId: 'small_shelter_5x5' }),
      step('step_2', 'Check materials', 'blueprint_materials', { blueprintId: 'small_shelter_5x5' }),
      step('step_3', 'Plan build', 'blueprint_plan', { blueprintId: 'small_shelter_5x5' }),
      step('step_4', 'Build only after confirmation', 'blueprint_build_approved', { blueprintId: 'small_shelter_5x5' }, 'medium', true)
    ]
  },
  build_storage_wall: {
    name: 'Build Storage Wall',
    type: 'blueprints',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Plan and build a small storage wall after owner confirmation.',
    reason: 'A small storage wall helps organization without large construction.',
    steps: [
      step('step_1', 'Preview storage wall', 'blueprint_preview', { blueprintId: 'storage_wall' }),
      step('step_2', 'Check materials', 'blueprint_materials', { blueprintId: 'storage_wall' }),
      step('step_3', 'Plan build', 'blueprint_plan', { blueprintId: 'storage_wall' }),
      step('step_4', 'Build only after confirmation', 'blueprint_build_approved', { blueprintId: 'storage_wall' }, 'medium', true)
    ]
  },
  build_mine_entrance_marker: {
    name: 'Build Mine Entrance Marker',
    type: 'blueprints',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Plan and build the mine entrance marker after owner confirmation.',
    reason: 'A visible marker helps find the mine without enabling autonomous mining.',
    steps: [
      step('step_1', 'Preview marker', 'blueprint_preview', { blueprintId: 'mine_entrance_marker' }),
      step('step_2', 'Check materials', 'blueprint_materials', { blueprintId: 'mine_entrance_marker' }),
      step('step_3', 'Plan build', 'blueprint_plan', { blueprintId: 'mine_entrance_marker' }),
      step('step_4', 'Build only after confirmation', 'blueprint_build_approved', { blueprintId: 'mine_entrance_marker' }, 'medium', true)
    ]
  },
  improve_base_with_blueprints: {
    name: 'Improve Base With Blueprints',
    type: 'blueprints',
    priority: 'normal',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Use preview/material checks to choose a small base blueprint.',
    reason: 'Blueprints make base upgrades deterministic and reviewable before placement.',
    steps: [
      step('step_1', 'List blueprints', 'list_blueprints'),
      step('step_2', 'Check blueprint status', 'blueprint_status'),
      step('step_3', 'Check inventory', 'inventory_status'),
      step('step_4', 'Plan a starter workstation if useful', 'blueprint_plan', { blueprintId: 'starter_workstation' })
    ]
  }
};

export function normalizeTemplateName(name) {
  const key = String(name || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return aliases.get(key) || key.replace(/\s+/g, '_');
}

export function getTemplateAliases() {
  return Object.fromEntries(aliases);
}

export function getGoalTemplate(name) {
  const normalized = normalizeTemplateName(name);
  const template = templates[normalized];
  return template ? JSON.parse(JSON.stringify(template)) : null;
}

export function listGoalTemplates() {
  return Object.entries(templates).map(([name, template]) => ({ name, ...JSON.parse(JSON.stringify(template)) }));
}

export function createTemplateGoal(templateName, context = {}) {
  const template = getGoalTemplate(templateName);
  if (!template) throw new Error(`unknown goal template: ${templateName}`);
  return {
    ...template,
    id: context.id,
    status: context.status || 'draft',
    createdBy: context.createdBy || 'ModVinny',
    approvedByOwner: Boolean(context.approvedByOwner),
    notes: template.type === 'nether_prep'
      ? ['Portal lighting and Nether entry require confirmation. Nether exploration and mining remain blocked.']
      : []
  };
}
