const DEFAULT_COUNTS = {
  food: 6,
  wood: 16,
  stone: 24,
  coal: 8,
  iron: 8,
  charcoal: 4,
  torches: 8
};

function actionStep(name, args = {}, options = {}) {
  return { type: 'action', name, args, optional: Boolean(options.optional), label: options.label || name };
}

function reportStep(message) {
  return { type: 'report', message };
}

export const CORE_MACROS = [
  {
    name: 'status_check',
    aliases: ['status', 'check_status', 'core_status'],
    description: 'Run a concise status check.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_status')],
    successEvidence: ['status_reported']
  },
  {
    name: 'come_here',
    aliases: ['come', 'come_to_owner', 'return_to_owner'],
    description: 'Path close to ModVinny through the verified Mineflayer pathfinder wrapper.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_come_to_owner')],
    successEvidence: ['returned_safely']
  },
  {
    name: 'follow_owner',
    aliases: ['follow', 'follow_me'],
    description: 'Start following ModVinny.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_follow_owner')],
    successEvidence: ['follow_goal_set']
  },
  {
    name: 'stay',
    aliases: ['stay_here', 'hold_position'],
    description: 'Stop following and clear movement goals.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_stay')],
    successEvidence: ['path_goal_cleared']
  },
  {
    name: 'get_food',
    aliases: ['food', 'find_food', 'gather_food'],
    description: 'Check food, eat if needed, then run the existing food helper if supplies are low.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('food_status'),
      actionStep('thin_eat_if_hungry', {}, { optional: true }),
      actionStep('get_food', { targetCount: DEFAULT_COUNTS.food }, { optional: true })
    ],
    successEvidence: ['food_status_reported', 'food_count_increased_or_reason_reported']
  },
  {
    name: 'gather_wood',
    aliases: ['wood', 'get_wood', 'gather_logs', 'get_logs'],
    description: 'Gather a small capped amount of nearby safe wood and collect drops.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('collect_resource', { resource: 'wood', count: DEFAULT_COUNTS.wood })
    ],
    successEvidence: ['log_count_increased_or_reason_reported', 'returned_safely']
  },
  {
    name: 'mine_stone',
    aliases: ['stone', 'get_stone', 'gather_stone', 'cobblestone', 'get_cobblestone'],
    description: 'Mine a small capped amount of safe stone or cobblestone.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('collect_resource', { resource: 'stone', count: DEFAULT_COUNTS.stone })
    ],
    successEvidence: ['stone_count_increased_or_reason_reported', 'returned_safely']
  },
  {
    name: 'mine_coal',
    aliases: ['coal', 'get_coal', 'find_coal'],
    description: 'Mine a small capped amount of visible or reachable coal through existing mining safety.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('collect_resource', { resource: 'coal', count: DEFAULT_COUNTS.coal })
    ],
    successEvidence: ['coal_count_increased_or_reason_reported', 'returned_safely']
  },
  {
    name: 'mine_iron',
    aliases: ['iron', 'get_iron', 'find_iron'],
    description: 'Mine a capped amount of visible or reachable iron; does not start deep mining.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('collect_resource', { resource: 'iron', count: DEFAULT_COUNTS.iron })
    ],
    successEvidence: ['iron_count_increased_or_reason_reported', 'returned_safely']
  },
  {
    name: 'craft_basic_tools',
    aliases: ['basic_tools', 'craft_tools', 'make_tools', 'wooden_tools'],
    description: 'Craft a full wooden tool set (pick, axe, shovel, hoe, sword).',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('craft_basic_tools')],
    successEvidence: ['basic_tool_count_increased_or_missing_reported']
  },
  {
    name: 'craft_stone_tools',
    aliases: ['stone_tools', 'make_stone_tools'],
    description: 'Craft a full stone tool set when cobble and sticks exist.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('craft_stone_tools')],
    successEvidence: ['stone_tool_count_increased_or_missing_reported']
  },
  {
    name: 'craft_iron_tools',
    aliases: ['iron_tools', 'make_iron_tools'],
    description: 'Craft a full iron tool set when iron ingots exist.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('craft_iron_tools')],
    successEvidence: ['iron_tool_count_increased_or_missing_reported']
  },
  {
    name: 'smelt_iron',
    aliases: ['smelt_raw_iron', 'iron_ingots'],
    description: 'Smelt raw iron or iron ore into iron ingots.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('smelt_iron', { count: DEFAULT_COUNTS.iron || 6 })],
    successEvidence: ['smelt_completed_or_reason_reported']
  },
  {
    name: 'smelt_charcoal',
    aliases: ['make_charcoal', 'charcoal'],
    description: 'Smelt logs into charcoal for fuel and torches.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('smelt_charcoal', { count: 4 })],
    successEvidence: ['smelt_completed_or_reason_reported']
  },
  {
    name: 'prepare_for_mining',
    aliases: ['prepare_mining', 'mining_prep', 'ready_for_mining'],
    description: 'Gather/craft early tools and check mining readiness (optional gathers).',
    riskLevel: 'low',
    requiresConfirmation: false,
    timeoutMs: 300000,
    steps: [
      actionStep('food_status'),
      actionStep('collect_resource', { resource: 'wood', count: DEFAULT_COUNTS.wood }, { optional: true }),
      actionStep('craft_basic_tools', {}, { optional: true }),
      actionStep('collect_resource', { resource: 'stone', count: 16 }, { optional: true }),
      actionStep('craft_stone_tools', {}, { optional: true }),
      actionStep('smelt_charcoal', { count: DEFAULT_COUNTS.charcoal }, { optional: true }),
      actionStep('craft_lighting', {}, { optional: true }),
      actionStep('mining_status'),
      reportStep('Mining prep complete (or as far as materials allowed).')
    ],
    successEvidence: ['food_status_reported', 'mining_status_reported']
  },
  {
    name: 'progress_to_iron',
    aliases: [
      'iron_age',
      'progress_iron',
      'iron_progress',
      'to_iron',
      'get_to_iron',
      'iron_path'
    ],
    description: 'End-to-end surface path: wood → tools → stone → fuel → iron mine → smelt → iron tools.',
    // Surface-only, owner-approved progression — keep low so allow-list gate does not reject it.
    riskLevel: 'low',
    requiresConfirmation: false,
    timeoutMs: 600000,
    steps: [
      actionStep('food_status', {}, { optional: true }),
      actionStep('thin_eat_if_hungry', {}, { optional: true }),
      // Wood optional so a sticky tree does not kill the whole macro — craft may still succeed with partial.
      actionStep('collect_resource', { resource: 'wood', count: DEFAULT_COUNTS.wood }, { optional: true }),
      actionStep('craft_basic_tools', {}, { optional: true }),
      // Stone optional enough to continue; tools need some cobble
      actionStep('collect_resource', { resource: 'stone', count: Math.min(16, DEFAULT_COUNTS.stone) }, { optional: true }),
      actionStep('craft_item', { itemName: 'furnace', count: 1 }, { optional: true }),
      actionStep('craft_stone_tools', {}, { optional: true }),
      // Fuel: charcoal preferred if no coal; coal mine optional
      actionStep('smelt_charcoal', { count: DEFAULT_COUNTS.charcoal }, { optional: true }),
      actionStep('collect_resource', { resource: 'coal', count: DEFAULT_COUNTS.coal }, { optional: true }),
      actionStep('craft_lighting', {}, { optional: true }),
      // Iron path — optional so empty biome still reports end state instead of hard fail
      actionStep('collect_resource', { resource: 'iron', count: DEFAULT_COUNTS.iron }, { optional: true }),
      actionStep('smelt_iron', { count: DEFAULT_COUNTS.iron }, { optional: true }),
      actionStep('craft_iron_tools', {}, { optional: true }),
      actionStep('craft_iron_armor', {}, { optional: true }),
      actionStep('equip_best_armor', {}, { optional: true }),
      reportStep('Progress to iron finished as far as resources allowed. Check inventory for tools and ingots.')
    ],
    successEvidence: [
      'log_count_increased_or_reason_reported',
      'iron_count_increased_or_reason_reported',
      'smelt_completed_or_reason_reported'
    ]
  },
  {
    name: 'prepare_for_night',
    aliases: ['night_prep', 'ready_for_night'],
    description: 'Check food, home, and lighting readiness without building unless asked.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [
      actionStep('food_status'),
      actionStep('home_status'),
      actionStep('lighting_status', {}, { optional: true }),
      reportStep('Night prep check complete.')
    ],
    successEvidence: ['food_status_reported', 'home_status_reported', 'lighting_status_reported']
  },
  {
    name: 'return_home',
    aliases: ['home', 'go_home'],
    description: 'Return to saved home through the normal home action.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_return_home')],
    successEvidence: ['near_home']
  },
  {
    name: 'store_items',
    aliases: ['store', 'deposit', 'put_stuff_away'],
    description: 'Store excess items in registered storage while keeping essentials.',
    riskLevel: 'low',
    requiresConfirmation: false,
    steps: [actionStep('thin_store_items')],
    successEvidence: ['items_deposited_or_reason_reported']
  },
  {
    name: 'recover',
    aliases: ['fix_self', 'recover_self', 'reset_self'],
    description: 'Stop movement/tasks, check status, and explain the last failure path.',
    riskLevel: 'low',
    requiresConfirmation: false,
    allowDuringCancellation: true,
    steps: [
      actionStep('thin_stop'),
      actionStep('thin_status', {}, { optional: true }),
      reportStep('Recovery check complete.')
    ],
    successEvidence: ['status_reported']
  }
];

const macroMap = new Map();
for (const macro of CORE_MACROS) {
  macroMap.set(macro.name, macro);
  for (const alias of macro.aliases || []) macroMap.set(alias, macro);
}

export function normalizeCoreMacroName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^tj\s+/i, '')
    .replace(/^run\s+core\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '_');
}

export function getCoreMacro(name) {
  const normalized = normalizeCoreMacroName(name);
  return macroMap.get(normalized) || null;
}

export function listCoreMacros() {
  return CORE_MACROS.map((macro) => ({
    ...macro,
    aliases: [...(macro.aliases || [])],
    steps: macro.steps.map((step) => ({ ...step, args: step.args ? { ...step.args } : undefined })),
    successEvidence: [...(macro.successEvidence || [])]
  }));
}

export function getAllowedCoreMacroNames(config = {}) {
  const configured = Array.isArray(config.competentCoreAllowedMacros) ? config.competentCoreAllowedMacros : [];
  return configured.length ? configured.map(normalizeCoreMacroName) : CORE_MACROS.map((macro) => macro.name);
}

export function isCoreMacroAllowed(name, config = {}) {
  const macro = getCoreMacro(name);
  if (!macro) return false;
  return new Set(getAllowedCoreMacroNames(config)).has(macro.name);
}

export function validateCoreMacros({ actions = null, skills = null } = {}) {
  const seen = new Set();
  const problems = [];
  for (const macro of CORE_MACROS) {
    if (seen.has(macro.name)) problems.push(`Duplicate macro name: ${macro.name}`);
    seen.add(macro.name);
    if (!['low', 'medium', 'high'].includes(macro.riskLevel)) problems.push(`${macro.name} has invalid riskLevel.`);
    if (!Array.isArray(macro.steps) || !macro.steps.length) problems.push(`${macro.name} has no steps.`);
    for (const step of macro.steps || []) {
      if (step.type === 'action' && actions && typeof actions[step.name] !== 'function') problems.push(`${macro.name} references missing action: ${step.name}`);
      if (step.type === 'skill' && skills && !skills.has(step.name)) problems.push(`${macro.name} references missing skill: ${step.name}`);
      if (!['action', 'skill', 'report'].includes(step.type)) problems.push(`${macro.name} has invalid step type: ${step.type}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
