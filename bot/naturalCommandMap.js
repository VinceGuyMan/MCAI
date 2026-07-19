export const NATURAL_COMMAND_PATTERNS = [
  {
    intent: 'get_food',
    canonicalCommand: 'tj get food',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner mentioned needing food.',
    naturalExamples: ['we need food', 'get food', 'gather food', 'get fud', 'get bread', 'need steak', 'grab apples'],
    patterns: [
      /\b(we need|need|get|grab|gather).*(food|something to eat|snack|meal)\b/,
      /\b(hungry|starving)\b/,
      /^get food$/,
      /^get fud$/,
      // Specific food items (thin-core usually catches these first; map is a fallback).
      /\b(get|grab|gather|need|find)\s+(?:\d+\s+)?(?:some\s+|more\s+)?(bread|steak|apple|apples|carrot|carrots|potato|potatoes|beef|pork|porkchop|mutton|chicken|rabbit|fish|cod|salmon|berries|cookie|cookies|pie|stew|honey|meat)\b/
    ]
  },
  {
    intent: 'find_food',
    canonicalCommand: 'tj find food',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to locate food sources.',
    naturalExamples: ['find food', 'look for food', 'find something to eat'],
    patterns: [/\b(find|look for|locate|search for).*(food|something to eat|berries|animals|crops)\b/]
  },
  {
    intent: 'cook_food',
    canonicalCommand: 'tj cook food',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to cook or make food.',
    naturalExamples: ['make food', 'cook meat', 'cook food'],
    // Do not match "smelt iron" — ore smelting is separate.
    patterns: [/\b(cook|make).*(food|meat|pork|beef|chicken|mutton)\b/, /\bcook food\b/, /\bcook meat\b/]
  },
  {
    intent: 'food_status',
    canonicalCommand: 'tj food status',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked about hunger or food readiness.',
    naturalExamples: ['are we hungry', 'check food', 'how much food do we have'],
    patterns: [/\b(check|status|how much|are we).*(food|hungry|hunger)\b/]
  },
  {
    intent: 'hunt_passive_food',
    canonicalCommand: 'tj hunt food',
    riskLevel: 'low',
    reason: 'Owner explicitly asked to hunt passive food animals.',
    naturalExamples: ['hunt food animals', 'kill some sheep', 'kill some cows', 'get meat'],
    patterns: [
      /\b(hunt|kill|slaughter).*(food animals|animals|cows?|sheep|pigs?|chickens?|rabbits?)\b/,
      /\bget\s+(meat|mutton|beef|pork|porkchop|chicken|rabbit)\b/
    ]
  },
  {
    intent: 'gather_wood',
    canonicalCommand: 'tj gather wood',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked for wood or logs.',
    naturalExamples: ['get wood', 'get us wood', 'need logs', 'gather logs'],
    patterns: [/\b(get|gather|collect|need|find).*(wood|logs?)\b/]
  },
  {
    intent: 'mine_stone',
    canonicalCommand: 'tj mine stone',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked for stone or cobblestone.',
    naturalExamples: ['get stone', 'need cobblestone', 'gather cobblestone'],
    patterns: [/\b(get|gather|mine|collect|need|find).*(stone|cobblestone)\b/]
  },
  {
    intent: 'mine_coal',
    canonicalCommand: 'tj mine coal',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner asked for coal.',
    naturalExamples: ['find coal', 'get coal', 'mine coal'],
    // charcoal is NOT coal mining — handled by smelt_charcoal
    patterns: [/\b(find|get|mine|need|look for).*(coal)\b/, /\bmine\s+coal\b/]
  },
  {
    intent: 'smelt_charcoal',
    canonicalCommand: 'tj smelt charcoal',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner wants charcoal (smelt logs), not coal ore.',
    naturalExamples: ['make charcoal', 'smelt charcoal', 'get charcoal', 'need charcoal'],
    patterns: [
      /\b(make|smelt|craft|need|get).{0,12}\bcharcoal\b/,
      /^smelt charcoal$/,
      /^make charcoal$/
    ]
  },
  {
    intent: 'smelt_iron',
    canonicalCommand: 'tj smelt iron',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner wants to smelt iron into ingots.',
    naturalExamples: ['smelt iron', 'smelt raw iron', 'smelt the iron', 'make iron ingots'],
    patterns: [
      /\b(smelt|cook).{0,16}\b(iron|raw iron|iron ore)\b/,
      /\b(make|need).{0,12}\biron ingots?\b/,
      /^smelt iron$/
    ]
  },
  {
    intent: 'craft_iron_tools',
    canonicalCommand: 'tj craft iron tools',
    confidence: 0.95,
    riskLevel: 'low',
    reason: 'Owner wants iron tools.',
    naturalExamples: ['craft iron tools', 'make iron tools'],
    patterns: [/\b(craft|make).{0,16}\biron tools\b/]
  },
  {
    intent: 'progress_to_iron',
    canonicalCommand: 'tj run core progress to iron',
    confidence: 0.95,
    riskLevel: 'medium',
    reason: 'Owner wants the full surface path to iron tools.',
    naturalExamples: ['progress to iron', 'iron age', 'get to iron', 'work toward iron'],
    patterns: [
      /\b(progress to iron|iron age|get to iron|path to iron|work toward iron|to iron tools)\b/,
      /^progress to iron$/,
      /^iron age$/
    ]
  },
  {
    intent: 'craft_crafting_table',
    canonicalCommand: 'tj craft table',
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Owner wants a crafting table.',
    naturalExamples: ['make a crafting table', 'craft table', 'need a crafting table'],
    patterns: [/\b(craft|make|need).{0,16}\b(crafting table|craft table|table)\b/]
  },
  {
    intent: 'craft_furnace',
    canonicalCommand: 'tj craft furnace',
    confidence: 0.93,
    riskLevel: 'low',
    reason: 'Owner wants a furnace.',
    naturalExamples: ['make a furnace', 'craft furnace', 'need a furnace'],
    patterns: [/\b(craft|make|need|place).{0,16}\b(furnace|oven)\b/]
  },
  {
    intent: 'craft_torches',
    canonicalCommand: 'tj craft torches',
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Owner wants torches.',
    naturalExamples: ['make torches', 'craft torches', 'need lights'],
    patterns: [/\b(craft|make|need).{0,16}\b(torches?|lights?)\b/]
  },
  {
    intent: 'craft_planks',
    canonicalCommand: 'tj craft planks',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner wants planks.',
    naturalExamples: ['make planks', 'craft planks'],
    patterns: [/\b(craft|make).{0,12}\bplanks\b/]
  },
  {
    intent: 'craft_sticks',
    canonicalCommand: 'tj craft sticks',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner wants sticks.',
    naturalExamples: ['make sticks', 'craft sticks'],
    patterns: [/\b(craft|make).{0,12}\bsticks\b/]
  },
  {
    intent: 'craft_stone_tools',
    canonicalCommand: 'tj craft stone tools',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner wants stone tools.',
    naturalExamples: ['craft stone tools', 'make stone tools'],
    patterns: [/\b(craft|make).{0,16}\bstone tools\b/]
  },
  {
    intent: 'craft_basic_tools',
    canonicalCommand: 'tj craft basic tools',
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Owner wants a wooden tool set.',
    naturalExamples: ['craft basic tools', 'make wooden tools', 'make tools'],
    patterns: [
      /\b(craft|make).{0,16}\b(basic tools|wooden tools|wood tools)\b/,
      // bare "make tools" only if not iron/stone
      /\b(craft|make)\s+tools\b/
    ]
  },
  {
    intent: 'mineflayer_plugin_status',
    canonicalCommand: 'tj plugin status',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked whether Mineflayer plugins or wrappers are loaded.',
    naturalExamples: ['plugin status', 'are plugins loaded', 'check plugin health'],
    patterns: [
      /\b(plugin|plugins|mineflayer plugins?|wrappers?|pathfinder|collectblock|tool plugin).*(status|health|audit|loaded|working|ok)\b/,
      /\b(are|is|check).*(plugins?|mineflayer plugins?|wrappers?).*(loaded|working|ok|healthy)\b/
    ]
  },
  {
    intent: 'follow_me',
    canonicalCommand: 'tj follow me',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked tj to follow them.',
    naturalExamples: ['follow me', 'stay with me', 'follow me around'],
    patterns: [/\b(follow me|stay with me|follow owner|follow me around)\b/]
  },
  {
    intent: 'mine_iron',
    canonicalCommand: 'tj mine iron',
    confidence: 0.9,
    riskLevel: 'medium',
    reason: 'Owner asked for iron.',
    naturalExamples: ['find iron', 'get iron', 'get irn', 'mine iron', 'iron run'],
    patterns: [
      /\b(find|get|mine|need|look for|collect).*(iron)\b/,
      /\biron run\b/,
      /\bresource run iron\b/
    ]
  },
  {
    intent: 'set_home',
    canonicalCommand: 'tj set home',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked to make this place home.',
    naturalExamples: ['make this home', 'set this as home', 'this is home'],
    patterns: [/\b(make|set|mark).*(this|place|here).*(home|base)\b/, /\bthis is (home|base)\b/]
  },
  {
    intent: 'return_home',
    canonicalCommand: 'tj return home',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to go back home.',
    naturalExamples: ['go home', 'find home', 'return to base'],
    patterns: [/\b(go|return|head|get).*(home|base)\b/, /\bfind home\b/]
  },
  {
    intent: 'make_camp',
    canonicalCommand: 'tj make camp',
    confidence: 0.9,
    riskLevel: 'medium',
    reason: 'Owner asked for a small camp.',
    naturalExamples: ['make camp', 'make a little spot here', 'small camp here', 'make a base', 'build base'],
    patterns: [
      /\b(make|build|set up).*(camp|little spot|small spot)\b/,
      /\bsmall camp\b/
    ]
  },
  {
    intent: 'make_base',
    canonicalCommand: 'tj make camp',
    confidence: 0.93,
    riskLevel: 'medium',
    reason: 'Owner asked for a base; map to small safe camp.',
    naturalExamples: ['make a base', 'build base', 'biuld base'],
    patterns: [
      /\b(make|build|set up|biuld).{0,12}\b(a\s+)?base\b/,
      /\b(biuld|build)\s+base\b/
    ]
  },
  {
    intent: 'build_shelter',
    canonicalCommand: 'tj build shelter',
    confidence: 0.88,
    riskLevel: 'medium',
    reason: 'Owner asked for shelter.',
    naturalExamples: ['build shelter', 'make shelter', 'need a shelter'],
    patterns: [/\b(build|make|need).*(shelter|hut|safe house)\b/]
  },
  {
    intent: 'help',
    canonicalCommand: 'tj help',
    confidence: 0.95,
    riskLevel: 'low',
    reason: 'Owner asked for available commands.',
    naturalExamples: ['show commands', 'list commands', 'what can you do', 'help', 'commands'],
    patterns: [
      /\b(show|list|display).*(commands?|help)\b/,
      /\bwhat can you (do|help with)\b/,
      /^(help|commands?|what can you do)$/,
      /\bhelp me\b/
    ]
  },
  {
    intent: 'companion_mode',
    canonicalCommand: 'tj companion mode',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner wants living Player 2 companion behavior.',
    naturalExamples: ['be my companion', 'companion mode', 'stick with me more', 'player 2 mode', 'act like a teammate'],
    patterns: [
      /\bcompanion mode\b/,
      /\bplayer\s*2\b/,
      /\b(be|act like).{0,12}(companion|teammate|player 2)\b/,
      /\bstick with me (more|better|please)?\b/,
      /\bco-?op mode\b/
    ]
  },
  {
    intent: 'helper_mode',
    canonicalCommand: 'tj helper mode',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner wants command-helper style instead of soft follow.',
    naturalExamples: ['helper mode', 'just wait for commands'],
    patterns: [/\bhelper mode\b/, /\bjust (wait|listen) for commands\b/]
  },
  {
    intent: 'light_home',
    canonicalCommand: 'tj light home',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to light the area or base.',
    naturalExamples: ['light this area', 'light this place', 'make it brighter'],
    patterns: [/\b(light|torch|brighten).*(area|place|home|base|here)\b/, /\bmake.*brighter.*(torches|lights)?\b/, /\bmake it brighter\b/]
  },
  {
    intent: 'place_storage_chest',
    canonicalCommand: 'tj place storage chest',
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Owner asked for storage.',
    naturalExamples: ['we need storage', 'make storage', 'put a chest down', 'place a chest down next to you'],
    patterns: [
      /\b(need|make|place|create|put).*(storage|chest)\b/,
      /\bchest\s+(down|here|next to)\b/,
      /\bplace\s+(a\s+)?chest\b/
    ]
  },
  {
    intent: 'store_items',
    canonicalCommand: 'tj store items',
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Owner asked to put items away.',
    naturalExamples: ['put stuff away', 'deposit items', 'store everything', 'deposit inventory', 'store all dirt', 'put away all dirt'],
    patterns: [
      /\b(store|deposit|put away).*(items|stuff|loot|everything|inventory)\b/,
      /\bput.*(stuff|items).*(away)\b/,
      /\b(store|put away|deposit)\s+all(\s+\w+)?\b/,
      /\bput all(\s+\w+)? away\b/,
      /^deposit inventory$/,
      /^store inventory$/
    ]
  },
  {
    intent: 'prepare_for_mining',
    canonicalCommand: 'tj prepare for mining',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked to get ready for mining.',
    naturalExamples: ['lets get ready for mining', 'ready for mining', 'mining prep'],
    patterns: [/\b(lets|let us|we should|can you|please)?.*(ready|prepare|prep).*(mining|mine)\b/, /\bmining readiness\b/]
  },
  {
    intent: 'prepare_for_night',
    canonicalCommand: 'tj prepare for night',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner asked to prepare for night.',
    naturalExamples: ['prepare for night', 'get ready for night', 'night is coming'],
    patterns: [/\b(prepare|prep|get ready).*(night)\b/, /\bnight is coming\b/]
  },
  {
    intent: 'suggest_next_activity',
    canonicalCommand: 'tj help',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked what to do next — point at companion help, not milestone OS.',
    naturalExamples: ['what should we do next', 'make a plan', 'what are we missing'],
    patterns: [/\bwhat should (we|you).*(do|work on).*(next)?\b/, /\bmake a plan\b/, /\bwhat are we missing\b/]
  },
  {
    intent: 'finish_last_job',
    canonicalCommand: 'tj finish last job',
    confidence: 0.96,
    riskLevel: 'low',
    reason: 'Owner wants to resume the last incomplete gather job.',
    naturalExamples: ['finish last job', 'finish current job', 'continue mining', 'resume collection', 'finish job'],
    patterns: [
      /\b(finish|resume|continue).{0,20}\b(last|current|that)?\s*(job|task|collect|mining|gather)\b/,
      /^(finish last job|finish current job|continue mining|resume collection|finish job)$/
    ]
  },
  {
    intent: 'starter_kit',
    canonicalCommand: 'tj kit',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner wants iron-down gear and building blocks.',
    naturalExamples: ['kit', 'restock', 'starter kit', 'gear me up', 'give me iron gear'],
    patterns: [
      /\b(starter\s+)?kit\b/,
      /\brestock\b/,
      /\bgear me up\b/,
      /\bgive(?:\s+(?:me|us))?.{0,12}\b(iron\s+)?(kit|gear|tools|outfit)\b/,
      /\bget(?:\s+(?:me|us))?.{0,12}\b(kit|outfit)\b/
    ]
  },
  {
    intent: 'food_security',
    canonicalCommand: 'tj build food security',
    confidence: 0.86,
    riskLevel: 'low',
    reason: 'Owner asked for food security.',
    naturalExamples: ['food security', 'make sure we have food'],
    patterns: [/\bfood security\b/, /\b(make sure|ensure).*(food|eating)\b/]
  },
  {
    intent: 'equip_wooden_axe',
    canonicalCommand: 'tj equip wooden axe',
    confidence: 0.95,
    riskLevel: 'low',
    reason: 'Owner asked tj to equip an existing wooden axe.',
    naturalExamples: ['equip wood axe', 'equipt wood axr'],
    patterns: [/\b(equip|equipt|hold|use).*(wood|wooden).*(axe|ax|axr)\b/]
  },
  {
    intent: 'equip_axe',
    canonicalCommand: 'tj equip axe',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked tj to equip an existing axe.',
    naturalExamples: ['equip axe', 'equipt axr'],
    patterns: [
      /\b(equip|equipt|hold|use).*(axe|ax|axr)\b/
    ]
  },
  {
    intent: 'equip_pickaxe',
    canonicalCommand: 'tj equip pickaxe',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked tj to equip an existing pickaxe.',
    naturalExamples: ['equip pickaxe', 'equip stone pickaxe'],
    patterns: [/\b(equip|equipt|hold|use).*(pickaxe|pick axe|pick)\b/]
  },
  {
    intent: 'equip_shovel',
    canonicalCommand: 'tj equip shovel',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked tj to equip an existing shovel.',
    naturalExamples: ['equip shovel', 'equip spade'],
    patterns: [/\b(equip|equipt|hold|use).*(shovel|spade)\b/]
  },
  {
    intent: 'equip_sword',
    canonicalCommand: 'tj equip sword',
    confidence: 0.94,
    riskLevel: 'low',
    reason: 'Owner asked tj to equip an existing sword.',
    naturalExamples: ['equip sword', 'hold sword'],
    patterns: [/\b(equip|equipt|hold|use).*(sword)\b/]
  },
  {
    intent: 'get_iron_gear',
    canonicalCommand: 'tj get iron gear',
    confidence: 0.86,
    riskLevel: 'medium',
    reason: 'Owner asked for better iron gear.',
    naturalExamples: ['get iron gear', 'we need iron gear'],
    patterns: [/\b(get|make|need).*(iron gear|iron armor|iron tools)\b/]
  },
  {
    intent: 'suggest_gear_upgrades',
    canonicalCommand: 'tj suggest gear upgrades',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner asked for better gear.',
    naturalExamples: ['get better gear', 'upgrade gear', 'what gear should we upgrade'],
    patterns: [/\b(better|upgrade|improve).*(gear|armor|tools|weapon)\b/, /\b(gear|armor|tools|weapon).*(upgrade|better|improve)\b/, /\bgear upgrades?\b/]
  },
  {
    intent: 'enchant_held_item',
    canonicalCommand: 'tj enchant held item',
    confidence: 0.82,
    riskLevel: 'medium',
    reason: 'Owner asked to enchant the held item.',
    naturalExamples: ['enchant this', 'enchant my pickaxe'],
    patterns: [/\b(enchant).*(this|held|pickaxe|sword|armor|tool)\b/]
  },
  {
    intent: 'repair_item',
    canonicalCommand: 'tj repair item',
    confidence: 0.76,
    riskLevel: 'medium',
    reason: 'Owner asked to repair gear, but the item may be ambiguous.',
    naturalExamples: ['repair this', 'fix my pickaxe'],
    patterns: [/\b(repair|fix).*(this|tool|pickaxe|sword|armor|gear)\b/]
  },
  {
    intent: 'potion_status',
    canonicalCommand: 'tj potion status',
    confidence: 0.87,
    riskLevel: 'low',
    reason: 'Owner asked about potions.',
    naturalExamples: ['what potions do we have', 'potion check'],
    patterns: [/\b(what|which|check|status).*(potions?)\b/, /\bpotion check\b/]
  },
  {
    intent: 'nether_checklist',
    canonicalCommand: 'tj nether checklist',
    confidence: 0.91,
    riskLevel: 'low',
    reason: 'Owner asked if tj is ready for the Nether.',
    naturalExamples: ['ready for nether', 'check if we are ready for the nether'],
    patterns: [/\b(ready|check|checklist).*(nether)\b/]
  },
  {
    intent: 'prepare_nether',
    canonicalCommand: 'tj prepare for nether',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to prepare Nether supplies.',
    naturalExamples: ['prepare nether', 'get ready for the nether'],
    patterns: [/\b(prepare|prep|get ready).*(nether)\b/]
  },
  {
    intent: 'safe_nether_entry',
    canonicalCommand: 'tj safe nether entry',
    confidence: 0.82,
    riskLevel: 'high',
    reason: 'Owner asked to go to the Nether.',
    naturalExamples: ['go nether', 'enter the nether'],
    patterns: [/\b(go|enter|travel).*(nether)\b/]
  },
  {
    intent: 'light_portal',
    canonicalCommand: 'tj light portal',
    confidence: 0.82,
    riskLevel: 'high',
    reason: 'Owner asked to light a Nether portal.',
    naturalExamples: ['light portal', 'turn on the portal'],
    patterns: [/\b(light|ignite|activate|turn on).*(portal)\b/]
  },
  {
    intent: 'scan_villagers',
    canonicalCommand: 'tj scan villagers',
    confidence: 0.9,
    riskLevel: 'low',
    reason: 'Owner asked to find villagers.',
    naturalExamples: ['find villagers', 'scan village', 'look for villagers'],
    patterns: [/\b(find|scan|look for).*(villagers?|village)\b/]
  },
  {
    intent: 'best_trades',
    canonicalCommand: 'tj best trades',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked for useful trades or books.',
    naturalExamples: ['find mending', 'find good books', 'good trades'],
    patterns: [/\b(find|look for|need).*(mending|good books?|enchanted books?)\b/, /\b(best|good|useful).*(trades?)\b/]
  },
  {
    intent: 'inspect_trades',
    canonicalCommand: 'tj inspect trades',
    confidence: 0.84,
    riskLevel: 'low',
    reason: 'Owner asked about nearby trades.',
    naturalExamples: ['what trades are nearby', 'inspect trades'],
    patterns: [/\b(inspect|check|what).*(trades?)\b/]
  },
  {
    intent: 'list_blueprints',
    canonicalCommand: 'tj blueprints',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked what tj can build.',
    naturalExamples: ['what can you build', 'show blueprints'],
    patterns: [/\bwhat can you build\b/, /\b(list|show).*(blueprints|builds)\b/]
  },
  {
    intent: 'build_small_shelter_blueprint',
    canonicalCommand: 'tj build small shelter',
    confidence: 0.95,
    riskLevel: 'medium',
    reason: 'Owner asked for a small shelter build.',
    naturalExamples: ['build a small shelter', 'make a small shelter'],
    patterns: [/\b(build|make).*(small shelter|little shelter)\b/]
  },
  {
    intent: 'build_workstation',
    canonicalCommand: 'tj build workstation',
    confidence: 0.89,
    riskLevel: 'medium',
    reason: 'Owner asked for a workstation.',
    naturalExamples: ['make workstation', 'build workstation'],
    patterns: [/\b(build|make|create).*(workstation|crafting spot|utility spot)\b/]
  },
  {
    intent: 'build_storage_wall',
    canonicalCommand: 'tj build storage wall',
    confidence: 0.92,
    riskLevel: 'medium',
    reason: 'Owner asked for storage construction.',
    naturalExamples: ['build storage', 'make storage wall'],
    patterns: [/\b(build|make).*(storage wall|storage area)\b/, /\bbuild storage\b/]
  },
  {
    intent: 'scan_area',
    canonicalCommand: 'tj scan area',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked tj to look around.',
    naturalExamples: ['look around', 'scan this area', 'what do you see'],
    patterns: [/\b(look around|scan area|scan this|what do you see)\b/]
  },
  {
    intent: 'remember_location',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.7,
    riskLevel: 'low',
    reason: 'Owner asked to remember a location without a name.',
    speak: 'What should I call this place? Try "tj remember this as mine entrance".',
    naturalExamples: ['remember this place'],
    patterns: [/\bremember this( place)?$/]
  },
  {
    intent: 'return_home_exploration',
    canonicalCommand: 'tj return home',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked to find home.',
    naturalExamples: ['find home', 'take us home'],
    patterns: [/\b(find|take us|bring us|get us).*(home|base)\b/]
  },
  {
    intent: 'scout_direction',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.7,
    riskLevel: 'medium',
    reason: 'Owner asked to scout but no direction was clear.',
    alternatives: [
      { canonicalCommand: 'tj scout north', label: 'scout north', reason: 'Controlled scouting north.' },
      { canonicalCommand: 'tj scout south', label: 'scout south', reason: 'Controlled scouting south.' },
      { canonicalCommand: 'tj scan area', label: 'scan here', reason: 'No travel, just local scan.' }
    ],
    speak: 'Which way should I scout: north, south, east, west, or just scan here?',
    naturalExamples: ['go scout', 'scout around'],
    patterns: [/\b(scout|explore).*(around|nearby)?$/]
  },
  {
    intent: 'protect_me',
    canonicalCommand: 'tj protect me',
    confidence: 0.89,
    riskLevel: 'medium',
    reason: 'Owner asked for protection.',
    naturalExamples: ['protect me', 'watch my back'],
    patterns: [/\b(protect|defend|watch).*(me|my back|owner)\b/]
  },
  {
    intent: 'threat_scan',
    canonicalCommand: 'tj threat scan',
    confidence: 0.88,
    riskLevel: 'low',
    reason: 'Owner asked about danger.',
    naturalExamples: ['danger nearby', 'what danger is nearby', 'what danger is there', 'are we safe', 'scan threats'],
    patterns: [/\b(danger|threat|mobs).*(nearby|around|scan)?\b/, /\bare we safe\b/, /\bscan threats?\b/]
  },
  {
    intent: 'make_safe',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.68,
    riskLevel: 'medium',
    reason: 'Safety request could mean lighting, shelter, or defense.',
    alternatives: [
      { canonicalCommand: 'tj light home', label: 'light home', reason: 'Add torches around home.' },
      { canonicalCommand: 'tj build shelter', label: 'build shelter', reason: 'Create a small shelter.' },
      { canonicalCommand: 'tj protect me', label: 'protect me', reason: 'Watch for threats.' }
    ],
    speak: 'I can make us safer a few ways: light home, build shelter, or protect you. Which one?',
    naturalExamples: ['make us safe', 'secure this place', 'make base safer'],
    patterns: [/\b(make|keep|secure).*(us|me|base|place|home).*(safe|safer|secure)\b/, /\bmake us safe\b/]
  },
  {
    intent: 'go_mining',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.68,
    riskLevel: 'medium',
    reason: 'Mining request needs a target.',
    alternatives: [
      { canonicalCommand: 'tj mining status', label: 'mining status', reason: 'Check readiness first.' },
      { canonicalCommand: 'tj mine stone', label: 'mine stone', reason: 'Low-risk stone run.' },
      { canonicalCommand: 'tj mine coal', label: 'mine coal', reason: 'Find useful fuel.' }
    ],
    speak: 'Mining can mean a few things: mining status, mine stone, or mine coal. Which one?',
    naturalExamples: ['go mining', 'lets mine'],
    patterns: [/\b(go|start|lets|let us).*(mining|mine)\b/]
  },
  {
    intent: 'trade_ambiguous',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.64,
    riskLevel: 'medium',
    reason: 'Trade request is ambiguous.',
    alternatives: [
      { canonicalCommand: 'tj inspect trades', label: 'inspect trades', reason: 'Look at nearby trades.' },
      { canonicalCommand: 'tj best trades', label: 'best trades', reason: 'Rank known trades.' },
      { canonicalCommand: 'tj suggest trades', label: 'suggest trades', reason: 'Suggest useful trades.' }
    ],
    speak: 'Trade how? I can inspect trades, show best trades, or suggest trades.',
    naturalExamples: ['trade', 'lets trade'],
    patterns: [/^(trade|lets trade|let us trade)$/]
  },
  {
    intent: 'fight_ambiguous',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.6,
    riskLevel: 'medium',
    reason: 'Fight request needs a safe target.',
    alternatives: [
      { canonicalCommand: 'tj threat scan', label: 'threat scan', reason: 'Identify nearby hostile mobs.' },
      { canonicalCommand: 'tj protect me', label: 'protect me', reason: 'Owner defense mode.' },
      { canonicalCommand: 'tj flee threat', label: 'flee threat', reason: 'Retreat from danger.' }
    ],
    speak: 'I need a safe target before fighting. I can threat scan, protect you, or flee.',
    naturalExamples: ['fight that', 'attack it'],
    patterns: [/\b(fight|attack|kill).*(that|it|them)\b/]
  },
  {
    intent: 'diamond_mining_blocked',
    canonicalCommand: null,
    mode: 'refuse',
    confidence: 0.9,
    riskLevel: 'high',
    reason: 'Diamond mining is not enabled in the current safe command set.',
    speak: 'Diamond mining is still blocked. I can check mining readiness, mine coal, or mine iron instead.',
    alternatives: [
      { canonicalCommand: 'tj prepare for mining', label: 'mining prep', reason: 'Safer readiness path.' },
      { canonicalCommand: 'tj mine coal', label: 'mine coal', reason: 'Lower-risk resource run.' },
      { canonicalCommand: 'tj mine iron', label: 'mine iron', reason: 'Useful gear progression.' }
    ],
    naturalExamples: ['mine diamonds', 'find diamonds'],
    patterns: [/\b(mine|find|get).*(diamonds?|diamond ore)\b/]
  },
  {
    intent: 'giant_build_unsupported',
    canonicalCommand: null,
    mode: 'refuse',
    confidence: 0.9,
    riskLevel: 'high',
    reason: 'Large builds are outside the current blueprint limits.',
    speak: 'I cannot do giant builds yet. I can list small blueprints or build a small shelter.',
    alternatives: [
      { canonicalCommand: 'tj blueprints', label: 'list blueprints', reason: 'Show supported builds.' },
      { canonicalCommand: 'tj build small shelter', label: 'small shelter', reason: 'Supported small build.' }
    ],
    naturalExamples: ['build a giant castle', 'make a huge base'],
    patterns: [/\b(build|make).*(giant|huge|massive|castle|city|mega)\b/]
  },
  {
    intent: 'build_something_ambiguous',
    canonicalCommand: null,
    mode: 'clarify',
    confidence: 0.62,
    riskLevel: 'medium',
    reason: 'Build request did not specify a supported blueprint.',
    alternatives: [
      { canonicalCommand: 'tj make camp', label: 'small camp', reason: 'Quick utility camp.' },
      { canonicalCommand: 'tj build shelter', label: 'small shelter', reason: 'Simple shelter.' },
      { canonicalCommand: 'tj blueprints', label: 'list blueprints', reason: 'Show supported blueprints.' }
    ],
    speak: 'I can build a few small things: make camp, build shelter, or list blueprints. Which one?',
    naturalExamples: ['build something small here', 'make this place nicer'],
    patterns: [/\b(build|make).*(something|place nicer|nicer|small thing)\b/]
  }
];

export function getNaturalCommandPatterns() {
  return NATURAL_COMMAND_PATTERNS.map((entry) => ({
    ...entry,
    patterns: [...entry.patterns],
    alternatives: entry.alternatives ? entry.alternatives.map((item) => ({ ...item })) : []
  }));
}

export function getNaturalExamples() {
  return NATURAL_COMMAND_PATTERNS.flatMap((entry) => (entry.naturalExamples || []).map((example) => ({
    example,
    intent: entry.intent,
    canonicalCommand: entry.canonicalCommand,
    mode: entry.mode || 'execute'
  })));
}
