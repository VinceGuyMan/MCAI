const commands = [
  { name: 'stop', aliases: ['tj stop', 'tj cancel', 'tj halt', 'tj freeze', 'tj stp', 'tj cnacel', 'stop tj'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'stop', implemented: true, description: 'Immediately cancels movement, tasks, and long-running actions.' },
  { name: 'status', aliases: ['tj status', 'tj stat'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'status', implemented: true, description: "Reports tj's health, food, position, task, and owner distance." },
  { name: 'thin_status', aliases: ['tj thin status'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_status', implemented: true, description: 'Runs the thin-core status action.' },
  { name: 'thin_stop', aliases: ['tj thin stop'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_stop', implemented: true, description: 'Stops thin-core movement and active work through the cancellation gate.' },
  { name: 'thin_come_to_owner', aliases: ['tj thin come', 'tj thin come here'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_come_to_owner', implemented: true, description: 'Moves to ModVinny through the pathfinder wrapper.' },
  { name: 'thin_follow_owner', aliases: ['tj thin follow', 'tj thin follow me'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_follow_owner', implemented: true, description: 'Follows ModVinny through the pathfinder wrapper.' },
  { name: 'thin_stay', aliases: ['tj thin stay'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_stay', implemented: true, description: 'Clears movement goals through thin core.' },
  { name: 'thin_eat_if_hungry', aliases: ['tj thin eat'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_eat_if_hungry', implemented: true, description: 'Uses the safe eating wrapper if hungry.' },
  { name: 'thin_store_items', aliases: ['tj thin store items'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_store_items', implemented: true, description: 'Stores safe excess items through thin core when storage is available.' },
  { name: 'thin_return_home', aliases: ['tj thin return home'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_return_home', implemented: true, description: 'Returns to saved home through the pathfinder wrapper.' },
  { name: 'thin_remember_home', aliases: ['tj thin remember home'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_remember_home', implemented: true, description: 'Stores current position as home through thin core.' },
  { name: 'thin_missing_requirements', aliases: ['tj thin missing requirements'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'thin_missing_requirements', implemented: true, description: 'Reports that a request is outside the thin-core API.' },
  { name: 'help', aliases: ['tj help', 'tj commands', 'tj show commands', 'tj list commands', 'tj what can you do'], category: 'core', ownerOnly: false, requiresConfirmation: false, action: 'help', implemented: true, description: 'Lists command groups and examples.' },
  { name: 'starter_kit', aliases: ['tj kit', 'tj restock', 'tj restock kit', 'tj starter kit', 'tj gear me up'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'applyStarterKit', implemented: true, description: 'Gives iron-and-below tools, armor, and building blocks (local op /give).' },
  { name: 'idle_status', aliases: ['tj idle status', 'tj idle autonomy status', 'tj what were you about to do', 'tj why did you say that'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'idleStatus', implemented: true, description: 'Reports idle autonomy timer, last behavior, and recent suggestions.' },
  { name: 'idle_on', aliases: ['tj idle on'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'idleOn', implemented: true, description: 'Enables safe idle autonomy.' },
  { name: 'idle_off', aliases: ['tj idle off'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'idleOff', implemented: true, description: 'Disables safe idle autonomy.' },
  { name: 'quiet_idle', aliases: ['tj quiet idle'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'quietIdle', implemented: true, description: 'Keeps idle autonomy on but suppresses ambient comments.' },
  { name: 'chatty_idle', aliases: ['tj chatty idle'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'chattyIdle', implemented: true, description: 'Allows idle ambient comments with cooldowns.' },
  { name: 'suppress_idle_suggestion', aliases: ["tj don't suggest that again", 'tj dont suggest that again', 'tj suggest that less'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'suppressIdleSuggestion', implemented: true, description: 'Suppresses the last idle suggestion for a while.' },
  { name: 'reset_idle_memory', aliases: ['tj reset idle memory'], category: 'core', ownerOnly: true, requiresConfirmation: true, action: 'resetIdleMemoryRequest', implemented: true, description: 'Requests a confirmed reset of idle repetition memory.' },
  { name: 'confirm_reset_idle_memory', aliases: ['tj confirm reset idle memory'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'confirmResetIdleMemory', implemented: true, description: 'Confirms resetting idle repetition memory.' },
  { name: 'skills', aliases: ['tj skills', 'tj what skills do you have'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillsStatus', implemented: true, description: 'Lists skill categories and implemented counts.' },
  { name: 'skill_status', aliases: ['tj skill status', 'tj skill status mining'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillStatus', implemented: true, description: 'Reports skill details by category or skill name.' },
  { name: 'skill_audit', aliases: ['tj skill audit'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillAudit', implemented: true, description: 'Validates the skill registry and reports problems.' },
  { name: 'unimplemented_skills', aliases: ['tj unimplemented skills'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'unimplementedSkills', implemented: true, description: 'Lists registered skills that are not wired yet.' },
  { name: 'risky_skills', aliases: ['tj risky skills'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'riskySkills', implemented: true, description: 'Lists high-risk or confirmation-required skills.' },
  { name: 'active_skill', aliases: ['tj active skill'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'activeSkill', implemented: true, description: 'Reports the currently running skill, if any.' },
  { name: 'skill_runner_status', aliases: ['tj skill runner status'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillRunnerStatus', implemented: true, description: 'Reports runner status and runnable starter skills.' },
  { name: 'cancel_skill', aliases: ['tj cancel skill', 'tj stop skill'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'cancelSkill', implemented: true, description: 'Cancels the active skill runner task.' },
  { name: 'skill_stats', aliases: ['tj skill stats', 'tj skill stats status'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillStats', implemented: true, description: 'Reports skill run success/failure stats.' },
  { name: 'recent_skills', aliases: ['tj recent skills', 'tj skill history'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'recentSkills', implemented: true, description: 'Reports recent skill runner history.' },
  { name: 'evidence_status', aliases: ['tj evidence status', 'tj skill evidence', 'tj evidence summary'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'evidenceStatus', implemented: true, description: 'Reports evidence tracking status.' },
  { name: 'skill_evidence', aliases: ['tj skill evidence status', 'tj evidence mining_status'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'skillEvidence', implemented: true, description: 'Reports recent evidence for a skill.' },
  { name: 'recent_evidence', aliases: ['tj recent evidence', 'tj last skill evidence'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'recentEvidence', implemented: true, description: 'Reports recent skill evidence summaries.' },
  { name: 'evidence_definitions', aliases: ['tj evidence definitions', 'tj evidence types'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'evidenceDefinitions', implemented: true, description: 'Reports evidence definition counts.' },
  { name: 'evidence_audit', aliases: ['tj evidence audit'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'evidenceAudit', implemented: true, description: 'Validates skill evidence names and runner evidence.' },
  { name: 'verify_skill', aliases: ['tj verify skill status', 'tj verify skill nether checklist'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'verifySkill', implemented: true, description: 'Runs a safe starter skill through the runner and reports evidence.' },
  { name: 'suggest_next_skill', aliases: ['tj suggest next skill', 'tj what can you practice', 'tj what should you practice'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'suggestNextSkill', implemented: true, description: 'Suggests safe next skills without executing them.' },
  { name: 'debug', aliases: ['tj debug', 'tj brain', 'tj task', 'tj safety', 'tj memory'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'brainStatus', implemented: true, description: 'Reports debug, task, safety, and memory state.' },
  { name: 'come_here', aliases: ['tj come here', 'tj come hear', 'tj com here'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'comeToOwner', implemented: true, description: 'Pathfinds close to ModVinny.' },
  { name: 'follow_me', aliases: ['tj follow me', 'tj folow me', 'tj folo me'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'followOwner', implemented: true, description: 'Follows ModVinny.' },
  { name: 'stay', aliases: ['tj stay', 'tj stay here'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'stay', implemented: true, description: 'Stops following and holds position.' },
  { name: 'thin_collect_resource', aliases: ['tj thin collect resource'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'collect_resource', implemented: true, description: 'Collects wood, stone, coal, or iron through plugin wrappers when arguments are provided by the router.' },
  { name: 'finish_last_job', aliases: ['tj finish last job', 'tj finish current job', 'tj continue mining', 'tj resume collection', 'tj finish job'], category: 'thin_core', ownerOnly: true, requiresConfirmation: false, action: 'resume_last_collect', implemented: true, description: 'Resumes the last incomplete wood/stone/coal/iron collect job.' },
  { name: 'gather_wood', aliases: ['tj gather wood', 'tj gather logs'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'gatherWood', implemented: true, description: 'Gathers a small capped amount of nearby safe wood.' },
  { name: 'survive', aliases: ['tj survive'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'surviveTick', implemented: true, description: 'Runs one semi-autonomous survival tick.' },

  { name: 'food_status', aliases: ['tj food', 'tj food status'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'food_status', implemented: true, description: 'Reports food state.' },
  { name: 'eat', aliases: ['tj eat', 'tj eat food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'eat_if_hungry', implemented: true, description: 'Eats available food if needed.' },
  { name: 'get_food', aliases: ['tj get food', 'tj gather food', 'tj find food', 'tj get fud'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'get_food', implemented: true, description: 'Runs the food helper system.' },
  { name: 'cook_food', aliases: ['tj cook food', 'tj make food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'cook_food', implemented: true, description: 'Uses furnace cooking support when possible.' },

  { name: 'inventory', aliases: ['tj inventory', 'tj inv', 'tj what do you have'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'inventory_status', implemented: true, description: 'Shows a short useful inventory summary.' },
  { name: 'tools', aliases: ['tj tools', 'tj tool status'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'tool_status', implemented: true, description: 'Reports best tools and durability concerns.' },
  { name: 'equip_tool', aliases: ['tj equip tool', 'tj equip axe', 'tj equip ax', 'tj equip axr', 'tj equip pickaxe', 'tj equip pick axe', 'tj equip pick', 'tj equip shovel', 'tj equip spade', 'tj equip hoe', 'tj equip sword', 'tj equip wooden axe', 'tj equip wood axe', 'tj equip stone axe', 'tj equip iron axe', 'tj equip wooden pickaxe', 'tj equip wood pickaxe', 'tj equip stone pickaxe', 'tj equip iron pickaxe', 'tj equipt axe', 'tj equipt wood axe', 'tj equipt pickaxe'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'equip_tool', implemented: true, description: 'Equips a requested tool from inventory without crafting it.' },
  { name: 'armour', aliases: ['tj armour', 'tj armor'], category: 'armour', ownerOnly: true, requiresConfirmation: false, action: 'armor_status', implemented: true, description: 'Reports armour status.' },
  { name: 'equip_armour', aliases: ['tj equip armour', 'tj equip armor'], category: 'armour', ownerOnly: true, requiresConfirmation: false, action: 'equip_best_armor', implemented: true, description: 'Equips best available armour.' },

  { name: 'craft_item', aliases: ['tj craft item', 'tj craft'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_item', implemented: true, description: 'Crafts supported items through Mineflayer recipes.' },
  { name: 'craft_torches', aliases: ['tj craft torches', 'tj craft torch'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_lighting', implemented: true, description: 'Crafts torches or lighting supplies.' },
  { name: 'craft_survival_kit', aliases: ['tj craft survival kit', 'tj survival kit'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_survival_kit', implemented: true, description: 'Crafts a small survival supply set if materials exist.' },
  { name: 'craft_basic_tools', aliases: ['tj craft basic tools', 'tj craft wooden tools', 'tj make wooden tools', 'tj make basic tools'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_basic_tools', implemented: true, description: 'Crafts a full wooden tool set (pick, axe, shovel, hoe, sword).' },
  { name: 'craft_stone_tools', aliases: ['tj craft stone tools', 'tj make stone tools'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_stone_tools', implemented: true, description: 'Crafts a full stone tool set when cobble/sticks exist.' },
  { name: 'craft_iron_tools', aliases: ['tj craft iron tools', 'tj make iron tools'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_iron_tools', implemented: true, description: 'Crafts a full iron tool set when iron ingots exist.' },
  { name: 'smelt_item', aliases: ['tj smelt iron', 'tj smelt raw iron', 'tj smelt charcoal', 'tj make charcoal', 'tj smelt ore'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'smelt_item', implemented: true, description: 'Smelts ore (iron) or logs into charcoal using a furnace.' },
  { name: 'craft_generic_tool', aliases: ['tj make axe', 'tj make pickaxe', 'tj make sword', 'tj make shovel', 'tj make hoe', 'tj craft axe', 'tj craft pickaxe'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftGenericTool', implemented: true, description: 'Asks which material when several tool variants are possible, or crafts the only available option.' },

  { name: 'set_home', aliases: ['tj set home'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'set_home', implemented: true, description: 'Saves current location as home.' },
  { name: 'home_status', aliases: ['tj home', 'tj home status', 'tj base status'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'home_status', implemented: true, description: 'Reports home/base state.' },
  { name: 'return_home', aliases: ['tj return home', 'tj return to base'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'return_home', implemented: true, description: 'Returns to saved home.' },
  { name: 'make_camp', aliases: ['tj make camp', 'tj build camp'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'build_camp', implemented: true, description: 'Builds a small deterministic camp near home.' },
  { name: 'build_workstation', aliases: ['tj build workstation', 'tj make workstation', 'tj place workstation'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'build_workstation', implemented: true, description: 'Places a small workstation area near home.' },
  { name: 'build_shelter', aliases: ['tj build shelter', 'tj make shelter'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'build_shelter', implemented: true, description: 'Builds a small deterministic shelter near home.' },
  { name: 'light_home', aliases: ['tj light home', 'tj base lighting'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'light_home', implemented: true, description: 'Places safe lighting around home when possible.' },

  { name: 'storage_status', aliases: ['tj storage', 'tj storage status'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'storage_status', implemented: true, description: 'Reports base storage state.' },
  { name: 'place_storage_chest', aliases: ['tj place storage chest', 'tj place chest', 'tj make storage'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'place_storage_chest', implemented: true, description: 'Places a storage chest safely near home if materials are available.' },
  { name: 'register_storage_chest', aliases: ['tj register storage chest', 'tj register chest', 'tj use this chest for storage'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'register_storage_chest', implemented: true, description: 'Registers a nearby chest or targeted chest as base storage.' },
  { name: 'store_items', aliases: ['tj store items', 'tj deposit items'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'store_items', implemented: true, description: 'Stores excess items in registered storage.' },
  { name: 'bring_item', aliases: ['tj bring me', 'tj get item'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'bring_item_to_owner', implemented: true, description: 'Withdraws and brings a requested item when storage has it.' },

  { name: 'mining_status', aliases: ['tj mining status', 'tj mine status'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'mining_status', implemented: true, description: 'Reports mining readiness/status.' },
  { name: 'mine_stone', aliases: ['tj mine stone', 'tj gather cobblestone'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'mine_stone', implemented: true, description: 'Mines a capped amount of safe stone/cobblestone.' },
  { name: 'mine_coal', aliases: ['tj mine coal', 'tj find coal', 'tj mine cole'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'mine_coal', implemented: true, description: 'Mines visible/safe coal when ready.' },
  { name: 'mine_iron', aliases: ['tj mine iron', 'tj get iron', 'tj get irn'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'mine_iron', implemented: true, description: 'Mines visible/safe iron with tool checks (surface scout in loaded chunks).' },
  { name: 'resource_run_iron', aliases: ['tj resource run iron', 'tj iron run'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'resourceRunIron', implemented: true, description: 'Runs a capped iron gather (collect + optional surface scout).' },
  { name: 'mine_diamond', aliases: ['tj mine diamond'], category: 'mining', ownerOnly: true, requiresConfirmation: true, action: 'mine_diamond', implemented: false, description: 'Diamond mining remains guarded and not part of 1.0 acceptance.' },

  { name: 'farming_status', aliases: ['tj farming status', 'tj farm status'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'farming_status', implemented: true, description: 'Reports farm state.' },
  { name: 'make_wheat_farm', aliases: ['tj make wheat farm', 'tj make farm'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'create_farm', implemented: true, description: 'Creates a small deterministic farm near home.' },
  { name: 'maintain_farm', aliases: ['tj maintain farm', 'tj harvest farm'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'maintain_farm', implemented: true, description: 'Harvests mature registered crops and replants when possible.' },
  { name: 'animal_status', aliases: ['tj animal status', 'tj animal pen status'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'animal_pen_status', implemented: true, description: 'Reports registered animal pens.' },

  { name: 'map_status', aliases: ['tj map', 'tj map status'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'map_status', implemented: true, description: 'Reports map memory summary.' },
  { name: 'remember_location', aliases: ['tj remember this as', 'tj mark this as'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'remember_location', implemented: true, description: 'Saves current location as a named waypoint.' },
  { name: 'known_places', aliases: ['tj known places', 'tj waypoints'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'list_known_places', implemented: true, description: 'Lists known waypoints.' },
  { name: 'scan_area', aliases: ['tj scan area', 'tj look around'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'scan_area', implemented: true, description: 'Scans visible nearby resources, landmarks, and dangers.' },
  { name: 'scout', aliases: ['tj scout north', 'tj scout south', 'tj scout east', 'tj scout west'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'scout_direction', implemented: true, description: 'Runs controlled scouting and returns.' },

  { name: 'combat_status', aliases: ['tj combat status', 'tj defense status'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'combat_status', implemented: true, description: 'Reports combat readiness and mode.' },
  { name: 'threat_scan', aliases: ['tj threat scan', 'tj scan threats'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'threat_scan', implemented: true, description: 'Reports nearby hostile mobs.' },
  { name: 'protect_me', aliases: ['tj protect me', 'tj defend me'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'defend_owner', implemented: true, description: 'Enables owner-defense mode.' },
  { name: 'attack_player', aliases: ['tj attack player'], category: 'combat', ownerOnly: true, requiresConfirmation: true, action: 'engage_hostile', implemented: false, description: 'PVP is disabled for 1.0.' },

  { name: 'goals', aliases: ['tj goals', 'tj goal status', 'tj plan status', 'tj gols'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'goals_status', implemented: true, description: 'Lists active long-term goals.' },
  { name: 'prepare_for_mining', aliases: ['tj prepare for mining', 'tj prepair for mining'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'create_goal_from_template', implemented: true, description: 'Creates the prepare-for-mining goal template.' },
  { name: 'prepare_for_night', aliases: ['tj prepare for night', 'tj get ready for night'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'create_goal_from_template', implemented: true, description: 'Creates the prepare-for-night goal template.' },
  { name: 'food_security_goal', aliases: ['tj build food security'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'create_goal_from_template', implemented: true, description: 'Creates the food-security goal template.' },
  { name: 'get_iron_gear_goal', aliases: ['tj get iron gear'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'create_goal_from_template', implemented: true, description: 'Creates the get-iron-gear goal template (prep → mine → smelt → iron tools/armor).' },
  { name: 'progress_to_iron', aliases: ['tj progress to iron', 'tj iron age', 'tj run core progress to iron', 'tj to iron'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'run_core_macro', implemented: true, description: 'Runs the full surface progression macro to iron tools (wood → stone → fuel → iron → tools).' },
  { name: 'next_goal_step', aliases: ['tj next step', 'tj why are you doing that'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'next_goal_step', implemented: true, description: 'Explains the current or next goal step.' },
  { name: 'pause_goal', aliases: ['tj pause goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'pause_goal', implemented: true, description: 'Pauses the active goal.' },
  { name: 'resume_goal', aliases: ['tj resume goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'resume_goal', implemented: true, description: 'Resumes a paused goal.' },
  { name: 'cancel_goal', aliases: ['tj cancel goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'cancel_goal', implemented: true, description: 'Cancels the active goal.' },

  { name: 'nether_checklist', aliases: ['tj nether checklist', 'tj are you ready for the nether'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'nether_checklist', implemented: true, description: 'Reports Nether readiness and missing supplies.' },
  { name: 'prepare_nether', aliases: ['tj prepare for nether', 'tj prepair nether'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'prepare_nether', implemented: true, description: 'Prepares safe Nether supplies without entering.' },
  { name: 'portal_status', aliases: ['tj portal status', 'tj where is the portal'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'portal_status', implemented: true, description: 'Reports known/nearby portal state.' },
  { name: 'light_portal', aliases: ['tj light portal'], category: 'nether', ownerOnly: true, requiresConfirmation: true, action: 'light_portal', implemented: true, description: 'Lights a portal only after confirmation.' },
  { name: 'enter_nether', aliases: ['tj enter nether', 'tj safe nether entry'], category: 'nether', ownerOnly: true, requiresConfirmation: true, action: 'safe_nether_entry', implemented: true, description: 'Runs guarded first-entry Nether flow after confirmation.' },


  { name: 'gear_status', aliases: ['tj gear status', 'tj gear', 'tj best gear'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'gearStatus', implemented: true, description: 'Reports current gear score, best items, and upgrade needs.' },
  { name: 'gear_upgrades', aliases: ['tj suggest gear upgrades', 'tj next gear upgrade'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'suggestGearUpgrades', implemented: true, description: 'Suggests safe gear upgrades without spending resources.' },
  { name: 'enchant_status', aliases: ['tj enchanting status', 'tj enchant status'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'enchantStatus', implemented: true, description: 'Reports enchantment table, XP, lapis, and enchantable item readiness.' },
  { name: 'enchant_item', aliases: ['tj enchant held item', 'tj enchant pickaxe', 'tj enchant sword'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'enchantHeldItem', implemented: true, description: 'Requests a confirmed enchantment action through Mineflayer enchantment table APIs.' },
  { name: 'anvil_status', aliases: ['tj anvil status', 'tj repair status'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'anvilStatus', implemented: true, description: 'Reports anvil, repair, combine, and enchanted book readiness.' },
  { name: 'anvil_item', aliases: ['tj repair pickaxe', 'tj apply book to pickaxe', 'tj combine books'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'repairItem', implemented: true, description: 'Requests confirmed anvil repair/combine/book use.' },
  { name: 'potion_status', aliases: ['tj potion status', 'tj potions', 'tj recommend potion'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'potionStatus', implemented: true, description: 'Reports carried potion inventory and safe potion recommendations.' },
  { name: 'use_potion', aliases: ['tj use fire resistance', 'tj use healing potion'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'usePotion', implemented: true, description: 'Requests confirmed potion use.' },
  { name: 'brewing_status', aliases: ['tj brewing status', 'tj can you brew fire resistance'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'brewingStatus', implemented: true, description: 'Reports brewing support and ingredients without faking brewing.' },
  { name: 'brew_potion', aliases: ['tj brew fire resistance', 'tj brew healing'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'brewPotion', implemented: false, description: 'Brewing mutation is scaffolded only until reliable brewing stand support is implemented.' },

  { name: 'villager_status', aliases: ['tj villager status', 'tj nearby villagers'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'villagerStatus', implemented: true, description: 'Reports nearby and remembered villagers.' },
  { name: 'scan_villagers', aliases: ['tj scan villagers'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'scanVillagers', implemented: true, description: 'Scans nearby villagers and records safe memory/waypoints.' },
  { name: 'village_status', aliases: ['tj village status', 'tj known villages'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'villageStatus', implemented: true, description: 'Reports nearby village evidence and known villages.' },
  { name: 'known_villagers', aliases: ['tj known villagers'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'knownVillagers', implemented: true, description: 'Lists remembered villagers.' },
  { name: 'valuable_villagers', aliases: ['tj valuable villagers'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'valuableVillagers', implemented: true, description: 'Lists villagers marked as valuable.' },
  { name: 'remember_village', aliases: ['tj remember village', 'tj remember this village'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'rememberVillage', implemented: true, description: 'Saves the current possible village location when evidence is visible.' },
  { name: 'mark_villager_valuable', aliases: ['tj mark villager valuable'], category: 'villagers', ownerOnly: true, requiresConfirmation: true, action: 'markVillagerValuable', implemented: true, description: 'Marks a known villager as valuable after confirmation.' },
  { name: 'confirm_villager_memory', aliases: ['tj confirm mark villager valuable', 'tj confirm village protection'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'confirmVillagerMemory', implemented: true, description: 'Confirms pending villager memory/protection updates.' },
  { name: 'trading_status', aliases: ['tj trading status', 'tj trade status'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'tradingStatus', implemented: true, description: 'Reports villager trading API readiness and nearby trade context.' },
  { name: 'inspect_villager_trades', aliases: ['tj inspect trades', 'tj inspect villager trades', 'tj what trades are nearby'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'inspectVillagerTrades', implemented: true, description: 'Safely opens the nearest villager trade window and records visible trades if the API works.' },
  { name: 'best_trades', aliases: ['tj best trades', 'tj find mending trade', 'tj find good books'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'bestKnownTrades', implemented: true, description: 'Ranks known villager trades by usefulness and cost.' },
  { name: 'economy_status', aliases: ['tj economy status', 'tj emerald status'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'economyStatus', implemented: true, description: 'Reports emerald count, reserves, and trade history totals.' },
  { name: 'suggest_trades', aliases: ['tj suggest trades', 'tj what should we trade'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'suggestTrades', implemented: true, description: 'Suggests useful known trades without executing them.' },
  { name: 'trade_history', aliases: ['tj trade history'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'tradeHistory', implemented: true, description: 'Reports recent villager trade attempts.' },
  { name: 'execute_trade', aliases: ['tj buy trade 1', 'tj execute trade', 'tj buy best book'], category: 'villagers', ownerOnly: true, requiresConfirmation: true, action: 'executeApprovedTrade', implemented: true, description: 'Executes a confirmed villager trade through Mineflayer trading APIs.' },
  { name: 'confirm_trade', aliases: ['tj confirm trade', 'tj confirm buy book', 'tj confirm spend emeralds'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'confirmTrade', implemented: true, description: 'Confirms the pending villager trade request.' },
  { name: 'village_protection_status', aliases: ['tj protect villagers', 'tj village safety', 'tj warn village danger'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'villageProtectionStatus', implemented: true, description: 'Reports village/villager threat warnings without reckless combat.' },

  { name: 'blueprint_status', aliases: ['tj blueprint status'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintStatus', implemented: true, description: 'Reports blueprint build system status and active build state.' },
  { name: 'schematic_status', aliases: ['tj schematic status', 'tj list schematics'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'schematicStatus', implemented: true, description: 'Reports schematic import status honestly; import is disabled by default.' },
  { name: 'list_blueprints', aliases: ['tj blueprints', 'tj list blueprints'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'listBlueprints', implemented: true, description: 'Lists built-in deterministic blueprints.' },
  { name: 'blueprint_preview', aliases: ['tj preview small shelter', 'tj preview blueprint starter workstation'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintPreview', implemented: true, description: 'Previews blueprint size, risk, and block count without placing anything.' },
  { name: 'blueprint_materials', aliases: ['tj materials for small shelter', 'tj can you build small shelter'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintMaterials', implemented: true, description: 'Checks required and missing materials for a blueprint.' },
  { name: 'blueprint_plan', aliases: ['tj plan build small shelter', 'tj plan blueprint storage wall'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintPlan', implemented: true, description: 'Creates a safe blueprint build plan and preview.' },
  { name: 'blueprint_build', aliases: ['tj build starter workstation', 'tj build small shelter', 'tj build storage wall', 'tj build torch ring'], category: 'blueprints', ownerOnly: true, requiresConfirmation: true, action: 'blueprintBuildApproved', implemented: true, description: 'Creates a confirmed blueprint build request; placement starts only after confirmation.' },
  { name: 'confirm_build', aliases: ['tj confirm build'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintStartBuild', implemented: true, description: 'Starts the pending approved blueprint build in a capped run.' },
  { name: 'continue_build', aliases: ['tj continue build', 'tj resume build'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintContinueBuild', implemented: true, description: 'Continues a paused blueprint build for one capped placement run.' },
  { name: 'cancel_build', aliases: ['tj cancel build', 'tj stop building'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprintCancelBuild', implemented: true, description: 'Cancels the active blueprint build.' },

  { name: 'server_bridge_status', aliases: ['tj server bridge', 'tj bridge status'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'serverBridgeStatus', implemented: true, description: 'Reports whether the optional local Paper plugin bridge is connected.' },
  { name: 'server_status', aliases: ['tj server status'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'serverStatus', implemented: true, description: 'Reports local Paper bridge server telemetry when the plugin is available.' },
  { name: 'bridge_health', aliases: ['tj bridge health'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeHealth', implemented: true, description: 'Checks the local plugin bridge health endpoint.' },
  { name: 'bridge_recent_events', aliases: ['tj recent server events', 'tj bridge events'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeRecentEvents', implemented: true, description: 'Lists recent server-side bridge events without spamming raw JSON.' },
  { name: 'bridge_recent_deaths', aliases: ['tj recent deaths'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeRecentDeaths', implemented: true, description: 'Lists recent death events reported by the local bridge.' },
  { name: 'bridge_recent_advancements', aliases: ['tj recent advancements'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeRecentAdvancements', implemented: true, description: 'Lists recent advancement events reported by the local bridge.' },
  { name: 'bridge_regions', aliases: ['tj bridge regions', 'tj protected regions', 'tj region status'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeRegions', implemented: true, description: 'Lists protected or watched regions from the local bridge.' },
  { name: 'bridge_register_region', aliases: ['tj register home region', 'tj register farm region', 'tj register village region', 'tj register portal region', 'tj register region home'], category: 'bridge', ownerOnly: true, requiresConfirmation: true, action: 'bridgeRegisterRegion', implemented: true, description: 'Registers a home/farm/village/portal region with the local bridge after confirmation.' },
  { name: 'bridge_delete_region', aliases: ['tj delete bridge region home_base'], category: 'bridge', ownerOnly: true, requiresConfirmation: true, action: 'bridgeDeleteRegion', implemented: true, description: 'Deletes a bridge region after confirmation.' },
  { name: 'bridge_emergency_stop', aliases: ['tj bridge emergency stop', 'tj stop from bridge'], category: 'bridge', ownerOnly: true, requiresConfirmation: false, action: 'bridgeEmergencyStop', implemented: true, description: 'Tests bridge emergency stop and triggers local cancellation.' },

  { name: 'mineflayer_plugin_status', aliases: ['tj plugin status', 'tj plugins', 'tj mineflayer plugins', 'tj plugin health', 'tj plugin audit', 'tj wrapper status', 'tj movement plugin status', 'tj collection plugin status', 'tj tool plugin status'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'mineflayerPluginStatus', implemented: true, description: 'Reports installed, loaded, and runtime-available Mineflayer plugins for movement, collection, tools, eating, armor, and viewer.' },

  { name: 'competent_core_status', aliases: ['tj core status', 'tj competent core status', 'tj what can you reliably do'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'competent_core_status', implemented: true, description: 'Reports the small reliable helper runtime and active core macro.', naturalExamples: ['what can you reliably do', 'core status'] },
  { name: 'core_macros', aliases: ['tj core macros', 'tj reliable macros'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'core_macros', implemented: true, description: 'Lists deterministic competent-core helper macros.', naturalExamples: ['what core helper tasks can you do'] },
  { name: 'run_core_macro', aliases: ['tj run core', 'tj run core get food', 'tj run core gather wood', 'tj run core prepare mining', 'tj run core prepare for mining', 'tj run core mine coal', 'tj run core mine iron', 'tj run core craft basic tools'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'run_core_macro', implemented: true, description: 'Runs one owner-approved deterministic competent-core macro.' },
  { name: 'core_recover', aliases: ['tj recover', 'tj fix yourself'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'core_recover', implemented: true, description: 'Stops current work, checks status, and offers recovery options.', naturalExamples: ['recover', 'fix yourself'] },
  { name: 'core_test', aliases: ['tj core test'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'core_test', implemented: true, description: 'Tests how a phrase routes through the competent-core intent router.' },

  { name: 'natural_router_status', aliases: ['tj natural router status', 'tj intent status'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'naturalRouterStatus', implemented: true, description: 'Reports natural language router status and pending intent.' },
  { name: 'explain_last_intent', aliases: ['tj what did you think i meant', 'tj explain last intent', 'tj explain last route'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'explainLastIntent', implemented: true, description: 'Explains the most recent natural language route.' },
  { name: 'clear_pending_intent', aliases: ['tj clear pending intent'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'clearPendingIntent', implemented: true, description: 'Clears a pending natural command confirmation.' },
  { name: 'natural_examples', aliases: ['tj natural examples'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'naturalExamples', implemented: true, description: 'Lists natural speech examples tj understands.' },
  { name: 'natural_test', aliases: ['tj natural test'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'naturalTest', implemented: true, description: 'Tests how a natural phrase would route without executing it.' },
  { name: 'natural_learning_status', aliases: ['tj learned commands', 'tj command learning', 'tj natural learning'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'naturalLearningStatus', implemented: true, description: 'Lists owner-approved natural command mappings tj has learned.' },
  { name: 'forget_learned_mapping', aliases: ['tj forget learned command'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'forgetLearnedMapping', implemented: true, description: 'Forgets one learned natural command phrase.' },
  { name: 'competency', aliases: ['tj competency', 'tj what are you good at', 'tj what needs testing'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'competencyStatus', implemented: true, description: 'Reports skill reliability and shaky/untested areas.' },
  { name: 'shaky_skills', aliases: ['tj shaky skills'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'shakySkills', implemented: true, description: 'Lists skills with weak or failing evidence.' },
  { name: 'reliable_skills', aliases: ['tj reliable skills'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'reliableSkills', implemented: true, description: 'Lists skills with enough successful evidence to trust.' },
  { name: 'untested_skills', aliases: ['tj untested skills', 'tj what needs testing?'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'untestedSkills', implemented: true, description: 'Lists skills that still need evidence.' },
  { name: 'session_events', aliases: ['tj session events', 'tj session log'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'sessionEvents', implemented: true, description: 'Reports recent high-level session events.' },
  { name: 'interaction_mode', aliases: ['tj mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'interactionMode', implemented: true, description: 'Reports interaction mode and command-learning preferences.' },
  { name: 'careful_mode', aliases: ['tj careful mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'carefulMode', implemented: true, description: 'Switches to careful mode.' },
  { name: 'helper_mode', aliases: ['tj helper mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'helperMode', implemented: true, description: 'Switches to helper mode.' },
  { name: 'companion_mode', aliases: ['tj companion mode', 'tj player 2 mode', 'tj coop mode'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'companionMode', implemented: true, description: 'Living Player 2 mode: soft follow, task narration, stuck recovery, grounded ambient chat.' },
  { name: 'quiet_mode', aliases: ['tj quiet mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'quietMode', implemented: true, description: 'Switches to quiet mode.' },
  { name: 'explain_mode', aliases: ['tj explain mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'explainMode', implemented: true, description: 'Switches to explain mode.' },
  { name: 'test_mode', aliases: ['tj test mode'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'testMode', implemented: true, description: 'Switches to test mode.' },
  { name: 'learn_commands_on', aliases: ['tj learn commands on'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'learnCommandsOn', implemented: true, description: 'Turns natural command learning on.' },
  { name: 'learn_commands_off', aliases: ['tj learn commands off'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'learnCommandsOff', implemented: true, description: 'Turns natural command learning off.' },
  { name: 'test_plan', aliases: ['tj test plan', 'tj test natural commands', 'tj test core helper', 'tj test survival basics'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'testPlan', implemented: true, description: 'Shows manual test checklists for competency and routing.' },
  { name: 'test_report', aliases: ['tj test report'], category: 'debug', ownerOnly: true, requiresConfirmation: false, action: 'testReport', implemented: true, description: 'Reports available manual test plans.' },

  { name: 'task_status', aliases: ['tj task status', 'tj current task'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'taskStatus', implemented: true, description: 'Reports the current task queue state.' },
  { name: 'safety_status', aliases: ['tj safety status'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'safetyStatus', implemented: true, description: 'Reports current safety flags.' },
  { name: 'memory_status', aliases: ['tj memory status'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'memoryStatus', implemented: true, description: 'Reports memory summary.' },
  { name: 'skills_status', aliases: ['tj skills status', 'tj skill registry status'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'skills_status', implemented: true, description: 'Reports skill registry category counts and implementation status.' },
  { name: 'unstuck', aliases: ['tj unstuck', 'tj get unstuck'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'unstuck', implemented: true, description: 'Attempts a safe unstuck move.' },
  { name: 'return_to_owner', aliases: ['tj return to owner', 'tj come back'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'returnToOwner', implemented: true, description: 'Returns near ModVinny.' },
  { name: 'lighting_status', aliases: ['tj lighting status'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'lighting_status', implemented: true, description: 'Reports torch and lighting readiness.' },
  { name: 'place_torch', aliases: ['tj place torch', 'tj put torch'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'placeTorch', implemented: true, description: 'Places one safe torch if possible.' },
  { name: 'sleep', aliases: ['tj sleep', 'tj go to sleep'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'sleep', implemented: true, description: 'Sleeps in a nearby bed if safe and available.' },
  { name: 'find_food', aliases: ['tj search food', 'tj search for food', 'tj locate food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'find_food', implemented: true, description: 'Searches nearby safe food sources.' },
  { name: 'fish_for_food', aliases: ['tj fish for food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'fish_for_food', implemented: true, description: 'Attempts fishing when a rod and safe conditions exist.' },
  { name: 'hunt_passive_food', aliases: ['tj hunt food', 'tj hunt animals', 'tj hunt cows', 'tj hunt sheep', 'tj hunt pigs', 'tj hunt chickens', 'tj hunt rabbits', 'tj kill cow', 'tj kill cows', 'tj kill some cows', 'tj kill sheep', 'tj kill some sheep', 'tj kill pig', 'tj kill pigs', 'tj kill chicken', 'tj kill chickens', 'tj kill rabbit', 'tj kill rabbits', 'tj slaughter cows'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'hunt_passive_food', implemented: true, description: 'Hunts nearby safe passive food animals when passive hunting is enabled.' },
  { name: 'craft_planks', aliases: ['tj craft planks'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftPlanks', implemented: true, description: 'Crafts planks from logs.' },
  { name: 'craft_sticks', aliases: ['tj craft sticks'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftSticks', implemented: true, description: 'Crafts sticks.' },
  { name: 'craft_crafting_table', aliases: ['tj craft table', 'tj craft crafting table'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftCraftingTable', implemented: true, description: 'Crafts a crafting table.' },
  { name: 'craft_storage', aliases: ['tj craft storage'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_storage', implemented: true, description: 'Crafts storage supplies.' },
  { name: 'craft_shelter_supplies', aliases: ['tj craft shelter supplies'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craft_shelter_supplies', implemented: true, description: 'Crafts supplies for a small shelter.' },
  { name: 'craft_diamond_armor', aliases: ['tj confirm diamond armor'], category: 'crafting', ownerOnly: true, requiresConfirmation: true, action: 'craft_diamond_armor_confirmed', implemented: true, description: 'Confirms diamond armour crafting after explicit owner approval.' },
  { name: 'inventory_summary', aliases: ['tj inventory summary'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'inventory_summary', implemented: true, description: 'Reports concise inventory summary.' },
  { name: 'count_inventory', aliases: ['tj count inventory'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'countInventory', implemented: true, description: 'Counts inventory items.' },
  { name: 'collect_drops', aliases: ['tj collect drops', 'tj pick up items'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'collectDropsAction', implemented: true, description: 'Collects nearby dropped items.' },
  { name: 'give_item_to_owner', aliases: ['tj give item to owner', 'tj give item to player', 'tj give item to modvinny'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'giveOwnerItem', implemented: true, description: 'Gives an item to ModVinny when specified.' },
  { name: 'drop_item', aliases: ['tj drop item'], category: 'inventory', ownerOnly: true, requiresConfirmation: false, action: 'dropItem', implemented: true, description: 'Drops an item when specified.' },
  { name: 'craft_iron_armor', aliases: ['tj craft iron armor'], category: 'armor', ownerOnly: true, requiresConfirmation: false, action: 'craft_iron_armor', implemented: true, description: 'Crafts iron armour if materials exist.' },
  { name: 'craft_leather_armor', aliases: ['tj craft leather armor'], category: 'armor', ownerOnly: true, requiresConfirmation: false, action: 'craft_leather_armor', implemented: true, description: 'Crafts leather armour if materials exist.' },
  { name: 'base_maintenance', aliases: ['tj maintain base', 'tj base maintenance'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'base_maintenance', implemented: true, description: 'Runs one safe base maintenance pass.' },
  { name: 'withdraw_item', aliases: ['tj withdraw item'], category: 'storage', ownerOnly: true, requiresConfirmation: false, action: 'withdraw_item', implemented: true, description: 'Withdraws an item from registered storage when specified.' },
  { name: 'resource_run_wood', aliases: ['tj get wood', 'tj resource run wood'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'resource_run_wood', implemented: true, description: 'Starts a capped wood resource run.' },
  { name: 'resource_run_stone', aliases: ['tj get stone', 'tj resource run stone'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'resource_run_stone', implemented: true, description: 'Starts a capped stone resource run.' },
  { name: 'resource_run_coal', aliases: ['tj get coal', 'tj resource run coal'], category: 'mining', ownerOnly: true, requiresConfirmation: false, action: 'resource_run_coal', implemented: true, description: 'Starts a capped coal resource run.' },
  { name: 'plant_crop', aliases: ['tj plant crop', 'tj plant wheat'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'plant_crop', implemented: true, description: 'Plants a crop when supplied.' },
  { name: 'harvest_crops', aliases: ['tj harvest crops'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'harvest_crops', implemented: true, description: 'Harvests mature crops.' },
  { name: 'replant_crops', aliases: ['tj replant crops'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'replant_crops', implemented: true, description: 'Replants harvested crops.' },
  { name: 'store_farm_items', aliases: ['tj store farm items'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'store_farm_items', implemented: true, description: 'Stores farm output.' },
  { name: 'create_animal_pen', aliases: ['tj make animal pen'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'create_animal_pen', implemented: true, description: 'Creates a small animal pen.' },
  { name: 'lure_animal_to_pen', aliases: ['tj lure animal to pen'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'lure_animal_to_pen', implemented: true, description: 'Lures a passive animal toward a pen.' },
  { name: 'breed_animals', aliases: ['tj breed animals'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'breed_animals', implemented: true, description: 'Breeds nearby eligible animals.' },
  { name: 'collect_eggs', aliases: ['tj collect eggs'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'collect_eggs', implemented: true, description: 'Collects nearby eggs.' },
  { name: 'shear_sheep', aliases: ['tj shear sheep'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'shear_sheep', implemented: true, description: 'Shears sheep if shears are available.' },
  { name: 'milk_cow', aliases: ['tj milk cow'], category: 'animals', ownerOnly: true, requiresConfirmation: false, action: 'milk_cow', implemented: true, description: 'Milks a cow if a bucket is available.' },
  { name: 'go_to_waypoint', aliases: ['tj go to waypoint'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'go_to_waypoint', implemented: true, description: 'Travels to a named waypoint when specified.' },
  { name: 'explore_around_home', aliases: ['tj explore around home'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'explore_around_home', implemented: true, description: 'Explores around home within safety limits.' },
  { name: 'record_route', aliases: ['tj record route'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'record_route', implemented: true, description: 'Starts route recording.' },
  { name: 'follow_route', aliases: ['tj follow route'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'follow_route', implemented: true, description: 'Follows a remembered route when specified.' },
  { name: 'combat_equipment_status', aliases: ['tj combat equipment status'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'combat_equipment_status', implemented: true, description: 'Reports combat gear readiness.' },
  { name: 'equip_combat_gear', aliases: ['tj equip combat gear'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'equip_combat_gear', implemented: true, description: 'Equips safe combat gear.' },
  { name: 'guard_base', aliases: ['tj guard base'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'guard_base', implemented: true, description: 'Guards base without reckless chasing.' },
  { name: 'flee_threat', aliases: ['tj flee threat', 'tj run away'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'flee_threat', implemented: true, description: 'Flees nearby danger.' },
  { name: 'suggest_goals', aliases: ['tj suggest goals'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'suggest_goals', implemented: true, description: 'Suggests safe goal ideas.' },
  { name: 'start_goal', aliases: ['tj start goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'start_goal', implemented: true, description: 'Starts an approved goal.' },
  { name: 'execute_next_goal_step', aliases: ['tj execute next goal step'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'execute_next_goal_step', implemented: true, description: 'Executes the next safe active goal step.' },
  { name: 'suggest_gear_upgrades', aliases: ['tj gear upgrade suggestions'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'suggest_gear_upgrades', implemented: true, description: 'Suggests safe gear upgrades without spending resources.' },
  { name: 'enchant_options', aliases: ['tj enchant options'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'enchant_options', implemented: true, description: 'Reports possible enchantment options.' },
  { name: 'nether_gear_readiness', aliases: ['tj nether gear readiness'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'nether_gear_readiness', implemented: true, description: 'Reports Nether gear readiness.' },
  { name: 'repair_item', aliases: ['tj repair item'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'repair_item', implemented: true, description: 'Repairs an item only through the confirmation-gated anvil flow.' },
  { name: 'apply_book_to_item', aliases: ['tj apply book to item'], category: 'gear', ownerOnly: true, requiresConfirmation: true, action: 'apply_book_to_item', implemented: true, description: 'Applies an enchanted book after confirmation.' },
  { name: 'confirm_enchant', aliases: ['tj confirm enchant', 'tj confirm high level enchant', 'tj confirm enchant diamond gear'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirm_enchant', implemented: true, description: 'Confirms a pending enchantment request.' },
  { name: 'confirm_anvil', aliases: ['tj confirm anvil', 'tj confirm repair'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirm_anvil', implemented: true, description: 'Confirms a pending anvil request.' },
  { name: 'confirm_use_book', aliases: ['tj confirm use book', 'tj confirm rare book use'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirm_use_book', implemented: true, description: 'Confirms a pending enchanted-book request.' },
  { name: 'confirm_use_potion', aliases: ['tj confirm use potion'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirm_use_potion', implemented: true, description: 'Confirms a pending potion-use request.' },
  { name: 'confirm_brewing', aliases: ['tj confirm brewing'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirm_brewing', implemented: true, description: 'Confirms a pending brewing request if brewing is supported.' },
  { name: 'remember_villager', aliases: ['tj remember villager'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'remember_villager', implemented: true, description: 'Remembers the nearest visible villager.' },
  { name: 'protect_villager', aliases: ['tj protect villager'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'protect_villager_status', implemented: true, description: 'Reports villager protection status.' },
  { name: 'trade_status', aliases: ['tj villager trade status'], category: 'villagers', ownerOnly: true, requiresConfirmation: false, action: 'trading_status', implemented: true, description: 'Reports villager trading readiness.' },
  { name: 'blueprint_build_small', aliases: ['tj build small blueprint'], category: 'blueprints', ownerOnly: true, requiresConfirmation: true, action: 'blueprint_build_approved', implemented: true, description: 'Starts the confirmation-gated small blueprint build flow.' },
  { name: 'blueprint_progress', aliases: ['tj blueprint progress'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprint_progress', implemented: true, description: 'Reports active blueprint build progress.' },
  { name: 'blueprint_continue_build', aliases: ['tj blueprint continue build'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprint_continue_build', implemented: true, description: 'Continues a paused approved blueprint build.' },
  { name: 'blueprint_cancel_build', aliases: ['tj blueprint cancel build'], category: 'blueprints', ownerOnly: true, requiresConfirmation: false, action: 'blueprint_cancel_build', implemented: true, description: 'Cancels the active blueprint build.' },
  { name: 'nether_status', aliases: ['tj nether status'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'nether_status', implemented: true, description: 'Reports Nether system status.' },
  { name: 'equip_nether_gear', aliases: ['tj equip nether gear'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'equip_nether_gear', implemented: true, description: 'Equips safe Nether gear.' },
  { name: 'build_portal', aliases: ['tj build portal'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'build_portal', implemented: true, description: 'Builds portal structure if safely prepared.' },
  { name: 'scan_nether', aliases: ['tj scan nether'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'scan_nether', implemented: true, description: 'Scans nearby Nether context when already there.' },
  { name: 'return_from_nether', aliases: ['tj return from nether'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'return_from_nether', implemented: true, description: 'Returns from the Nether through known safe route.' },
  { name: 'personality_status', aliases: ['tj personality status'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'personality_status', implemented: true, description: 'Reports personality settings.' },
  { name: 'remember_conversation_fact', aliases: ['tj remember conversation fact'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'remember_conversation_fact', implemented: true, description: 'Stores a conversation memory fact.' },
  { name: 'forget_conversation_fact', aliases: ['tj forget conversation fact'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'forget_conversation_fact', implemented: true, description: 'Forgets a conversation memory fact.' },
  { name: 'clear_conversation_memory', aliases: ['tj clear conversation memory confirmed'], category: 'dialogue', ownerOnly: true, requiresConfirmation: true, action: 'clear_conversation_memory_confirmed', implemented: true, description: 'Clears conversation memory after confirmation.' },
  { name: 'answer_dialogue', aliases: ['tj answer dialogue'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'answer_dialogue', implemented: true, description: 'Routes a direct dialogue answer action.' },
  { name: 'ask_clarification', aliases: ['tj ask clarification'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'ask_clarification', implemented: true, description: 'Routes a direct clarification prompt.' },

  { name: 'dialogue_status', aliases: ['tj talk mode', 'tj personality'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'dialogue_status', implemented: true, description: 'Reports dialogue/personality settings.' },
  { name: 'conversation_memory', aliases: ['tj memories', 'tj what do you remember'], category: 'dialogue', ownerOnly: true, requiresConfirmation: false, action: 'conversation_memory_status', implemented: true, description: 'Reports conversation memory summary.' }
];

commands.push(
  { name: 'death_status', aliases: ['tj death', 'tj last death'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'deathStatus', implemented: true, description: 'Reports the last known death position.' },
  { name: 'go_to_death_spot', aliases: ['tj go to death spot'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'goToDeathSpot', implemented: true, description: 'Returns to the last known death position when safe.' },
  { name: 'where_bot', aliases: ['tj where are you?'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'whereBot', implemented: true, description: "Reports tj's current position." },
  { name: 'where_owner', aliases: ['tj where am i?'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'whereOwner', implemented: true, description: "Reports ModVinny's observed position." },
  { name: 'nearby_players', aliases: ['tj who is nearby?'], category: 'core', ownerOnly: true, requiresConfirmation: false, action: 'whoNearby', implemented: true, description: 'Lists nearby visible players.' },
  { name: 'clear_home', aliases: ['tj clear home'], category: 'base', ownerOnly: true, requiresConfirmation: false, action: 'clearHome', implemented: true, description: 'Clears the saved home location.' },
  { name: 'bed_status', aliases: ['tj bed status'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'bedStatus', implemented: true, description: 'Reports nearby bed/sleep readiness.' },
  { name: 'night_status', aliases: ['tj night status'], category: 'survival', ownerOnly: true, requiresConfirmation: false, action: 'nightStatus', implemented: true, description: 'Reports time/night readiness.' },
  { name: 'place_block', aliases: ['tj place crafting table', 'tj place furnace', 'tj place bed'], category: 'building', ownerOnly: true, requiresConfirmation: false, action: 'placeBlock', implemented: true, description: 'Places one supported utility block through safe placement.' },
  { name: 'crafting_status', aliases: ['tj crafting status', 'tj what can you craft?'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftingStatus', implemented: true, description: 'Reports craftable survival items from current inventory.' },
  { name: 'base_defense_status', aliases: ['tj base defense status'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'baseDefenseStatus', implemented: true, description: 'Reports base defense posture.' },
  { name: 'owner_defense_status', aliases: ['tj owner defense status'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'ownerDefenseStatus', implemented: true, description: 'Reports owner defense posture.' }
);

commands.push(
  { name: 'approve_goal', aliases: ['tj approve goal', 'tj approve plan', 'tj confirm goal', 'tj confirm start goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'approveGoal', implemented: true, description: 'Approves the pending safe goal plan.' },
  { name: 'reject_goal', aliases: ['tj reject goal', 'tj reject plan'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'rejectGoal', implemented: true, description: 'Rejects the pending goal plan.' },
  { name: 'confirm_goal_step', aliases: ['tj confirm step', 'tj confirm risky step', 'tj confirm deep mining', 'tj confirm diamond use', 'tj confirm major build'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'confirmStep', implemented: true, description: 'Confirms the currently pending risky goal step.' },
  { name: 'confirm_goal_delete', aliases: ['tj confirm delete goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'confirmDeleteGoal', implemented: true, description: 'Confirms deletion of a pending goal.' },
  { name: 'confirm_exploration', aliases: ['tj confirm long exploration', 'tj confirm night exploration', 'tj confirm cave exploration', 'tj confirm ocean exploration', 'tj confirm leave home radius'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'confirmExploration', implemented: true, description: 'Confirms a pending exploration request.' },
  { name: 'confirm_nether_action', aliases: ['tj confirm nether prep', 'tj confirm portal lighting', 'tj confirm nether entry', 'tj confirm nether scout', 'tj confirm nether exploration', 'tj confirm nether mining', 'tj confirm fortress search', 'tj confirm bastion search', 'tj confirm nether override'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'confirmNether', implemented: true, description: 'Confirms a pending Nether-related request.' },
  { name: 'direct_confirmation_refusal', aliases: ['tj confirm pvp', 'tj confirm dangerous combat', 'tj confirm raid defense', 'tj confirm attack neutral', 'tj confirm attack iron golem', 'tj confirm leave base to fight', 'tj confirm delete map memory', 'tj confirm farm expansion', 'tj confirm harvest this farm', 'tj confirm animal slaughter', 'tj confirm large animal lure'], category: 'safety', ownerOnly: true, requiresConfirmation: false, action: 'answerChat', implemented: true, description: 'Represents direct-chat confirmation refusals handled in chat.js.' },
  { name: 'confirm_large_farm', aliases: ['tj confirm large farm'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'answerChat', implemented: true, description: 'Represents the large-farm confirmation check handled in chat.js.' },
  { name: 'confirm_gear_rename', aliases: ['tj confirm rename', 'tj confirm combine books'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'confirmGearUpgrade', implemented: true, description: 'Confirms a pending gear/anvil operation.' },
  { name: 'goal_explanation', aliases: ['tj current goal', 'tj what is your goal?', 'tj what is your goal', 'tj what are you working on?', 'tj what are you working on', 'tj what are you doing?', 'tj what are you doing', 'tj explain goal', 'tj explain plan', 'tj goal progress'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'explainGoal', implemented: true, description: 'Explains the active goal or current plan.' },
  { name: 'complete_goal', aliases: ['tj complete goal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'completeGoal', implemented: true, description: 'Completes the active goal if its steps are finished.' },
  { name: 'skip_goal_step', aliases: ['tj skip step'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'skipGoalStep', implemented: true, description: 'Skips the active goal step when allowed.' },
  { name: 'retry_goal_step', aliases: ['tj retry step'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'retryGoalStep', implemented: true, description: 'Retries the active goal step.' },
  { name: 'planner_next', aliases: ['tj what should we do next?', 'tj what do we need?', 'tj what do we need', 'tj what is the smartest next move?', 'tj what is the smartest next move', 'tj what should you work on?', 'tj what should you work on', 'tj how can we improve the base?', 'tj how can we improve the base'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'plannerSuggestNext', implemented: true, description: 'Suggests a safe next goal or improvement.' },
  { name: 'custom_goal_shortcuts', aliases: ['tj improve base', 'tj make us food secure', 'tj plan food security', 'tj stockpile resources', 'tj secure base', 'tj plan to prepare for the nether', 'tj plan to prepare for nether', 'tj plan a mining trip', 'tj plan to stockpile coal'], category: 'goals', ownerOnly: true, requiresConfirmation: false, action: 'createGoal', implemented: true, description: 'Represents direct-chat goal shortcuts handled with templates or custom plans.' },
  { name: 'exploration_status', aliases: ['tj exploration status', 'tj scout status'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'explorationStatus', implemented: true, description: 'Reports exploration/scouting state.' },
  { name: 'exploration_results', aliases: ['tj where have you been?', 'tj where have you been', 'tj what have you found?', 'tj what have you found'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'reportExplorationResults', implemented: true, description: 'Summarizes recent exploration findings.' },
  { name: 'known_resources', aliases: ['tj known resources'], category: 'map', ownerOnly: true, requiresConfirmation: false, action: 'knownResources', implemented: true, description: 'Lists known resource observations.' },
  { name: 'known_dangers', aliases: ['tj known dangers'], category: 'map', ownerOnly: true, requiresConfirmation: false, action: 'knownDangerZones', implemented: true, description: 'Lists known danger zones.' },
  { name: 'known_biomes', aliases: ['tj known biomes'], category: 'map', ownerOnly: true, requiresConfirmation: false, action: 'knownBiomes', implemented: true, description: 'Lists known biome observations.' },
  { name: 'return_from_exploration', aliases: ['tj return from exploration'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'returnFromExploration', implemented: true, description: 'Returns from the current exploration task.' },
  { name: 'route_status', aliases: ['tj routes', 'tj route status'], category: 'map', ownerOnly: true, requiresConfirmation: false, action: 'routeStatus', implemented: true, description: 'Reports recorded route state.' },
  { name: 'find_portal', aliases: ['tj find portal'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'findPortal', implemented: true, description: 'Searches remembered/visible portal information.' },
  { name: 'remember_portal', aliases: ['tj remember portal', 'tj mark this portal'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'rememberPortal', implemented: true, description: 'Saves the current portal position.' },
  { name: 'return_through_portal_alias', aliases: ['tj go back through portal'], category: 'nether', ownerOnly: true, requiresConfirmation: false, action: 'returnFromNether', implemented: true, description: 'Returns through the remembered portal when safe.' },
  { name: 'self_defense', aliases: ['tj defend yourself', 'tj self defense on', 'tj self defense off'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'startSelfDefense', implemented: true, description: 'Toggles defensive self-protection through direct chat handlers.' },
  { name: 'guard_here', aliases: ['tj guard here'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'guardPosition', implemented: true, description: 'Guards the current position when safe.' },
  { name: 'fight_hostile', aliases: ['tj fight hostile', 'tj get that mob'], category: 'combat', ownerOnly: true, requiresConfirmation: false, action: 'engageHostile', implemented: true, description: 'Engages an obvious hostile target through combat safety.' },
  { name: 'resource_status', aliases: ['tj resource status'], category: 'resources', ownerOnly: true, requiresConfirmation: false, action: 'resourceStatus', implemented: true, description: 'Reports resource-run state.' },
  { name: 'resource_run_food', aliases: ['tj resource run food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'resource_run_food', implemented: true, description: 'Runs the food resource helper.' },
  { name: 'collect_food_drops', aliases: ['tj collect food'], category: 'food', ownerOnly: true, requiresConfirmation: false, action: 'collectDropsAction', implemented: true, description: 'Collects nearby food drops through direct chat handling.' },
  { name: 'collect_wood_drops', aliases: ['tj collect wood'], category: 'resources', ownerOnly: true, requiresConfirmation: false, action: 'collectDropsAction', implemented: true, description: 'Collects nearby wood drops through direct chat handling.' },
  { name: 'craft_boat', aliases: ['tj make a boat'], category: 'crafting', ownerOnly: true, requiresConfirmation: false, action: 'craftItem', implemented: true, description: 'Crafts a boat through the direct chat crafting shortcut.' },
  { name: 'feed_animals', aliases: ['tj feed animals'], category: 'farming', ownerOnly: true, requiresConfirmation: false, action: 'feedAnimals', implemented: true, description: 'Feeds nearby penned animals when safe.' },
  { name: 'stuck_status', aliases: ['tj stuck'], category: 'movement', ownerOnly: true, requiresConfirmation: false, action: 'stuckStatus', implemented: true, description: 'Reports stuck/unstuck state.' }
);

commands.push(
  { name: 'gear_upgrade_goal_shortcut', aliases: ['tj create gear upgrade goal'], category: 'gear', ownerOnly: true, requiresConfirmation: false, action: 'createGoalFromTemplate', implemented: true, description: 'Creates a draft gear-upgrade goal through the direct chat shortcut.' },
  { name: 'explore_around_owner', aliases: ['tj explore around me'], category: 'exploration', ownerOnly: true, requiresConfirmation: false, action: 'exploreAroundOwner', implemented: true, description: 'Explores in a small radius around ModVinny when safe.' }
);

const naturalExamplesByName = {
  stop: ['stop', 'nevermind', 'cancel everything'],
  status: ['how are you doing', 'check yourself'],
  come_here: ['come to me', 'come over here'],
  follow_me: ['stay with me', 'follow me around'],
  stay: ['stay here', 'wait here'],
  get_food: ['we need food', 'get food', 'gather food'],
  find_food: ['find food', 'look for food', 'find something to eat'],
  gather_wood: ['get us wood', 'need logs'],
  mine_stone: ['need cobblestone', 'get stone'],
  mine_coal: ['find coal', 'need coal'],
  mine_iron: ['find iron', 'need iron'],
  make_camp: ['make a little camp', 'make a small spot here'],
  build_shelter: ['build a shelter', 'make us a shelter'],
  light_home: ['light this area', 'make this place brighter'],
  place_storage_chest: ['we need storage', 'put a chest down'],
  prepare_for_mining: ['lets get ready for mining', 'mining prep'],
  prepare_for_night: ['prepare for night', 'night is coming'],
  competency: ['what are you good at', 'what needs testing'],
  shaky_skills: ['what are you bad at', 'what is failing'],
  reliable_skills: ['what works well', 'reliable skills'],
  interaction_mode: ['what mode are you in'],
  careful_mode: ['be more careful'],
  helper_mode: ['help me automatically'],
  quiet_mode: ['be quieter'],
  explain_mode: ['explain failures'],
  test_plan: ['how should we test you'],
  gear_upgrades: ['get better gear', 'upgrade our gear'],
  nether_checklist: ['are we ready for the nether', 'check nether readiness'],
  prepare_nether: ['prepare for nether', 'get ready for the nether'],
  scan_villagers: ['find villagers', 'look for a village'],
  best_trades: ['find mending', 'find good books'],
  list_blueprints: ['what can you build', 'show blueprints'],
  server_bridge_status: ['is the plugin connected', 'is the bridge working'],
  mineflayer_plugin_status: ['plugin status', 'are plugins loaded', 'check plugin health']
};

for (const command of commands) {
  if (naturalExamplesByName[command.name]) command.naturalExamples = naturalExamplesByName[command.name];
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[?!.,;:\]\)\}]/g, '').replace(/\s+/g, ' ').trim();
}

const commandAliasPatches = {
  help: ['tj what can you do?'],
  dialogue_status: [
    'tj dialogue status',
    'tj talk mode on',
    'tj talk mode off',
    'tj banter on',
    'tj banter off',
    'tj be more quiet',
    'tj be more chatty',
    'tj keep answers short',
    'tj explain more',
    'tj who are you',
    'tj who are you?',
    'tj are you real',
    'tj are you real?',
    'tj are you alive',
    'tj are you alive?'
  ],
  conversation_memory: [
    'tj what do you know about me',
    'tj what do you know about me?',
    'tj forget that'
  ],
  clear_conversation_memory: ['tj clear conversation memory', 'tj confirm clear conversation memory'],
  skill_status: ['tj skill status mining'],
  gear_status: ['tj what gear do you have', 'tj what gear do you have?', 'tj gear score'],
  gear_upgrades: ['tj upgrade status', 'tj what gear should we upgrade', 'tj what gear should we upgrade?', 'tj plan gear upgrades', 'tj plan mining gear', 'tj plan combat gear', 'tj plan nether gear'],
  enchant_status: ['tj what can you enchant?'],
  enchant_item: ['tj enchant armor', 'tj enchant best candidate'],
  anvil_status: ['tj what can you repair', 'tj what can you repair?'],
  anvil_item: ['tj apply book to sword', 'tj apply book to armor', 'tj repair sword', 'tj repair armor'],
  potion_status: ['tj what potions do you have', 'tj what potions do you have?', 'tj carry nether potions'],
  use_potion: ['tj confirm use potion'],
  brew_potion: ['tj brew strength', 'tj brew night vision', 'tj brew slow falling', 'tj confirm brewing'],
  village_status: ['tj light village'],
  trading_status: ['tj villager trade status'],
  inspect_villager_trades: ['tj find librarian', 'tj find farmer'],
  best_trades: ['tj find mending', 'tj find emerald trades', 'tj find food trades', 'tj find gear trades', 'tj list known trades'],
  execute_trade: ['tj trade with villager', 'tj buy mending book', 'tj sell wheat', 'tj sell sticks'],
  confirm_trade: ['tj confirm buy tool', 'tj confirm buy armor', 'tj confirm sell items', 'tj confirm use rare trade input'],
  blueprint_status: ['tj blueprint history'],
  continue_build: ['tj pause build'],
  bridge_register_region: ['tj confirm bridge region', 'tj confirm register region', 'tj confirm delete bridge region'],
  debug: ['tj task', 'tj brain', 'tj safety', 'tj memory'],
  come_here: ['tj come'],
  follow_me: ['tj follow'],
  death_status: ['tj death', 'tj last death'],
  go_to_death_spot: ['tj go to death spot'],
  where_bot: ['tj where are you?'],
  where_owner: ['tj where am i?'],
  nearby_players: ['tj who is nearby?'],
  clear_home: ['tj clear home'],
  light_home: ['tj place torches around home'],
  home_status: ['tj base brain', 'tj what does home need', 'tj what does home need?'],
  place_torch: ['tj light'],
  bed_status: ['tj bed status'],
  night_status: ['tj night status'],
  place_block: ['tj place crafting table', 'tj place furnace', 'tj place bed'],
  crafting_status: ['tj crafting status', 'tj what can you craft?'],
  craft_torches: ['tj craft torch', 'tj make light', 'tj make lights'],
  craft_storage: ['tj make us some storage'],
  craft_shelter_supplies: ['tj make shelter stuff', 'tj prepare supplies for the night'],
  food_status: ['tj hunger'],
  cook_food: ['tj cook meat'],
  fish_for_food: ['tj fish'],
  gather_wood: ['tj find tree'],
  make_wheat_farm: ['tj make small farm'],
  farming_status: ['tj what crops do we have?', 'tj what does the farm need?'],
  animal_status: ['tj pens status', 'tj what animals do we have?'],
  plant_crop: ['tj plant carrots', 'tj plant potatoes', 'tj plant beetroots'],
  harvest_crops: ['tj harvest farm', 'tj harvest wheat'],
  base_maintenance: ['tj farm maintenance'],
  combat_status: ['tj are we safe?', 'tj what mobs are nearby?'],
  combat_equipment_status: ['tj combat gear', 'tj weapon status'],
  equip_combat_gear: ['tj equip weapon'],
  guard_base: ['tj defend base'],
  flee_threat: ['tj flee', 'tj retreat'],
  nether_checklist: ['tj what are we missing for nether', 'tj what are we missing for nether?', 'tj get ready for nether', 'tj get ready for the nether'],
  prepare_nether: ['tj prepare for the nether'],
  enter_nether: ['tj scout nether'],
  nether_status: ['tj nether gear', 'tj nether supplies'],
  known_places: ['tj list places'],
  scan_area: ['tj nearby resources', 'tj nearby dangers', 'tj what do you see', 'tj what do you see?'],
  recent_evidence: ['tj recent skill evidence'],
  explore_around_home: ['tj explore around base'],
  protect_me: ['tj watch my back'],
  natural_router_status: ['tj what did you think i meant?'],
  test_plan: ['tj test core helper', 'tj test survival basics']
};

for (const [name, aliases] of Object.entries(commandAliasPatches)) {
  const command = commands.find((item) => item.name === name);
  if (!command) continue;
  for (const alias of aliases) {
    const key = normalize(alias);
    const alreadyUsed = commands.some((item) => item.aliases.some((existing) => normalize(existing) === key));
    if (!alreadyUsed) command.aliases.push(alias);
  }
}

export function getCommands() {
  return commands.map((command) => ({ ...command, aliases: [...command.aliases] }));
}

export function getCommand(name) {
  const key = normalize(name);
  return getCommands().find((command) => command.name === key || normalize(command.name) === key || normalize(command.action) === key) || null;
}

export function listCommandsByCategory() {
  const groups = {};
  for (const command of getCommands()) {
    if (!groups[command.category]) groups[command.category] = [];
    groups[command.category].push(command);
  }
  return groups;
}

export function findCommandAlias(text) {
  const normalized = normalize(text);
  let bestMatch = null;
  for (const command of commands) {
    for (const alias of command.aliases) {
      const normalizedAlias = normalize(alias);
      if (normalized === normalizedAlias || normalized.startsWith(`${normalizedAlias} `)) {
        if (!bestMatch || normalizedAlias.length > bestMatch.normalizedAlias.length) {
          bestMatch = { command, alias, normalizedAlias };
        }
      }
    }
  }
  if (bestMatch) return { ...bestMatch.command, matchedAlias: bestMatch.alias };
  return null;
}

export function validateCommandWiring(actions = {}) {
  const missing = [];
  for (const command of commands) {
    if (!command.implemented) continue;
    if (!command.action || typeof actions[command.action] !== 'function') missing.push({ name: command.name, action: command.action });
  }
  return { ok: missing.length === 0, missing };
}

export function generateSurvivalHelpText() {
  return [
    'come here / follow me / stop',
    'get wood / craft basic tools / mine stone / craft stone tools',
    'smelt charcoal / mine coal / craft torches',
    'mine iron / smelt iron / craft iron tools / craft iron armor',
    'progress to iron (full path)',
    'get food / dig dirt|sand|gravel|clay / status / help survival'
  ].join(' · ');
}

export function generateHelpText(category = null) {
  if (!category || category === 'survival' || category === 'iron' || category === 'basics') {
    // Companion-first shortlist so iron-age commands are not buried under nether/villagers.
    const short = generateSurvivalHelpText();
    if (category === 'survival' || category === 'iron' || category === 'basics') return short;
    const groups = listCommandsByCategory();
    const parts = [`survival: ${short}`];
    for (const [name, items] of Object.entries(groups)) {
      if (name === 'survival' || name === 'crafting' || name === 'mining' || name === 'core') continue;
      const visible = items.filter((item) => item.implemented).slice(0, 4);
      if (!visible.length) continue;
      parts.push(`${name}: ${visible.map((item) => item.aliases[0].replace(/^tj\s+/, '')).join(', ')}`);
    }
    // Still include a few craft/mining aliases
    const craft = (groups.crafting || []).filter((c) => c.implemented).slice(0, 6);
    if (craft.length) parts.splice(1, 0, `crafting: ${craft.map((c) => c.aliases[0].replace(/^tj\s+/, '')).join(', ')}`);
    return parts.join(' | ');
  }
  const groups = listCommandsByCategory();
  const selected = { [category]: groups[category] || [] };
  const parts = [];
  for (const [name, items] of Object.entries(selected)) {
    const visible = items.filter((item) => item.implemented).slice(0, 12);
    if (!visible.length) continue;
    parts.push(`${name}: ${visible.map((item) => item.aliases[0].replace(/^tj\s+/, '')).join(', ')}`);
  }
  return parts.join(' | ');
}

export function generateCommandDocs() {
  return getCommands()
    .filter((command) => command.implemented)
    .map((command) => `- ${command.aliases[0]} (${command.category}): ${command.description}`)
    .join('\n');
}
