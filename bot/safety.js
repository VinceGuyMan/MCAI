import { getArmorSlot, isArmorItemName } from './armor.js';

const foodAnimalNames = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit']);
const forbiddenAttackNames = new Set(['player', 'villager', 'iron_golem', 'wolf', 'cat', 'horse', 'donkey', 'mule', 'llama', 'camel', 'fox', 'bee', 'panda', 'turtle']);
const riskyFoodNames = new Set(['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'suspicious_stew']);
const goldenAppleNames = new Set(['golden_apple', 'enchanted_golden_apple']);
const logFuelNames = new Set(['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log']);
const valuableCraftNames = new Set(['enchanting_table', 'jukebox']);
const dangerousCraftNames = new Set(['tnt', 'fire_charge', 'flint_and_steel', 'golden_apple', 'enchanted_golden_apple']);
const technicalCraftNames = new Set(['dispenser', 'observer', 'piston', 'sticky_piston', 'hopper', 'dropper']);
const farmCropNames = new Set(['wheat', 'carrots', 'potatoes', 'beetroots', 'melon_stem', 'pumpkin_stem', 'sweet_berry_bush']);

const protectedBlocks = new Set([
  'barrel',
  'bed',
  'black_bed',
  'blue_bed',
  'brown_bed',
  'chest',
  'crafting_table',
  'door',
  'furnace',
  'ladder',
  'lantern',
  'sign',
  'shulker_box',
  'torch',
  'trapped_chest',
  'wall_sign'
]);

function sameBlock(a, b) {
  if (!a || !b) return false;
  return Math.floor(a.x) === Math.floor(b.x) &&
    Math.floor(a.y) === Math.floor(b.y) &&
    Math.floor(a.z) === Math.floor(b.z);
}

function isProtectedBlockName(name) {
  if (!name) return true;
  if (protectedBlocks.has(name)) return true;
  if (name.endsWith('_bed') || name.endsWith('_door') || name.endsWith('_sign') || name.endsWith('_torch') || name.endsWith('_shulker_box')) return true;
  return false;
}

function entityName(entity) {
  const raw = String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
  return raw.includes('.') ? raw.split('.').pop() : raw;
}

function normalizeCraftName(itemName) {
  return String(itemName || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

export function createSafety(bot, config, memory) {
  function protectedBridgeRegionAt(position) {
    const pos = point(position);
    if (!pos) return null;
    const dimension = /nether/.test(String(bot.game?.dimension || '')) ? 'nether' : /end/.test(String(bot.game?.dimension || '')) ? 'end' : 'overworld';
    const regions = memory.get().bridgeRegions || [];
    return regions.find((region) => {
      if (!region?.protected) return false;
      if (region.dimension && region.dimension !== dimension) return false;
      const min = region.min || {};
      const max = region.max || {};
      return pos.x >= Math.floor(Number(min.x ?? -Infinity)) &&
        pos.x <= Math.floor(Number(max.x ?? Infinity)) &&
        pos.y >= Math.floor(Number(min.y ?? -Infinity)) &&
        pos.y <= Math.floor(Number(max.y ?? Infinity)) &&
        pos.z >= Math.floor(Number(min.z ?? -Infinity)) &&
        pos.z <= Math.floor(Number(max.z ?? Infinity));
    }) || null;
  }

  function safeToEquipArmor(item, destination) {
    if (!item || !isArmorItemName(item.name)) return { ok: false, reason: 'not an armour item' };
    const expectedSlot = getArmorSlot(item.name);
    if (expectedSlot !== destination) return { ok: false, reason: `${item.name} belongs in ${expectedSlot}, not ${destination}` };
    return { ok: true, reason: 'safe' };
  }

  function canUseDiamondsForArmor(confirmed = false) {
    if (confirmed) return { ok: true, reason: 'confirmed' };
    const pending = memory.get().pendingConfirmation;
    if (pending === 'diamond_armor' && Date.now() < (memory.get().pendingConfirmationExpiresAt || 0)) {
      return { ok: true, reason: 'pending confirmation active' };
    }
    return { ok: false, reason: 'diamond armour requires explicit confirmation' };
  }

  function safeToAttackFoodAnimal(entity) {
    if (!entity) return { ok: false, reason: 'no target' };
    const name = entityName(entity);
    if (forbiddenAttackNames.has(name) || entity.type === 'player') return { ok: false, reason: `${name} is protected` };
    if (!foodAnimalNames.has(name)) return { ok: false, reason: `${name} is not a passive food animal` };
    if (config.doNotKillNamedMobs && (entity.customName || entity.displayName?.extra?.length)) return { ok: false, reason: 'named mob protected' };
    if (config.doNotAttackTamedAnimals && entity.metadata?.some?.((entry) => entry?.key === 17 && entry?.value)) {
      return { ok: false, reason: 'tamed animal protected' };
    }
    if (entity.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0)) return { ok: false, reason: 'baby animal protected' };
    return { ok: true, reason: 'safe food animal' };
  }

  function safeToHarvestCrop(block) {
    if (!block) return { ok: false, reason: 'no crop' };
    if (!config.allowCropHarvesting && ['wheat', 'carrots', 'potatoes', 'beetroots'].includes(block.name)) {
      return { ok: false, reason: 'crop harvesting disabled' };
    }
    return { ok: true, reason: 'safe crop rule' };
  }

  function safeToEatFood(itemName, state = {}) {
    if (goldenAppleNames.has(itemName)) return { ok: false, reason: 'golden apples require a direct command' };
    if (riskyFoodNames.has(itemName) && !state.criticalFood) return { ok: false, reason: 'risky food only allowed when hunger is critical' };
    if (itemName === 'pufferfish') return { ok: false, reason: 'pufferfish is not safe food' };
    return { ok: true, reason: 'safe food' };
  }

  function safeToUseFuel(itemName, count = 1) {
    if (logFuelNames.has(itemName) && count <= 2) return { ok: false, reason: 'keep at least 2 logs' };
    return { ok: true, reason: 'safe fuel' };
  }

  function safeToCraftItem(itemName, options = {}) {
    const name = normalizeCraftName(itemName);
    const valuableAllowed = Boolean(options.confirmed || options.allowValuable);
    const riskyAllowed = Boolean(options.confirmed || options.allowRisky);
    const technicalAllowed = Boolean(options.confirmed || options.allowTechnical);
    const count = Math.max(1, Number(options.count) || 1);

    if (count > 64 && !options.confirmed) {
      return { ok: false, reason: 'crafting more than 64 items needs confirmation', requiresConfirmation: true };
    }

    if ((valuableCraftNames.has(name) || name.startsWith('diamond_')) && !valuableAllowed) {
      return { ok: false, reason: `${name} uses valuable materials and needs confirmation`, requiresConfirmation: true };
    }

    if (dangerousCraftNames.has(name) && !riskyAllowed) {
      return { ok: false, reason: `${name} is risky and needs confirmation`, requiresConfirmation: true };
    }

    if (technicalCraftNames.has(name) && !technicalAllowed) {
      return { ok: false, reason: `${name} is a technical redstone item and needs confirmation`, requiresConfirmation: true };
    }

    if (name.endsWith('_boat') && (bot.entity?.position?.y ?? 100) < 50 && !options.direct && !options.confirmed) {
      return { ok: false, reason: 'do not craft boats while underground unless directly requested' };
    }

    if (name.endsWith('_bed') && /nether|end/.test(String(bot.game?.dimension || '')) && !options.direct && !options.confirmed) {
      return { ok: false, reason: 'do not craft beds in the Nether or End unless directly requested' };
    }

    return { ok: true, reason: 'safe craft' };
  }

  function safeToUseChest(block, options = {}) {
    if (!block || !['chest', 'trapped_chest', 'barrel'].includes(block.name)) return { ok: false, reason: 'not a chest' };
    if (config.allowUsingOwnerChests || options.confirmed) return { ok: true, reason: 'allowed by config or confirmation' };
    const pos = point(block.position);
    const registered = memory.get().knownStorageChests || [];
    const isRegistered = registered.some((entry) => sameBlock(entry, pos));
    return isRegistered
      ? { ok: true, reason: 'registered base storage' }
      : { ok: false, reason: 'random chests are protected unless registered' };
  }

  function safeToBuildNear(position, options = {}) {
    if (!position) return { ok: false, reason: 'no build position' };
    if (options.confirmed) return { ok: true, reason: 'confirmed' };
    const home = memory.get().homeBasePosition;
    const owner = bot.players?.[config.ownerUsername]?.entity?.position;
    const radius = config.maxBaseBuildRadius || 12;
    const nearHome = home && distance(point(position), home) <= radius;
    const nearOwner = owner && distance(point(position), point(owner)) <= radius;
    if (!nearHome && !nearOwner) return { ok: false, reason: `build position is outside the ${radius} block base radius` };
    return { ok: true, reason: 'inside build radius' };
  }

  function safeResourceRun(resourceType, targetCount = 1, options = {}) {
    const target = Math.max(1, Number(targetCount) || 1);
    if (target > 64 && !options.confirmed) return { ok: false, reason: 'large resource runs need confirmation', requiresConfirmation: true };
    if (['stone', 'coal'].includes(resourceType) && !options.direct && !config.allowAutonomousMining) {
      return { ok: false, reason: 'autonomous mining is disabled' };
    }
    if (options.distance && options.distance > (config.maxResourceRunDistance || 48)) {
      return { ok: false, reason: 'resource run would go too far from base or owner' };
    }
    return { ok: true, reason: 'safe resource run' };
  }

  function safeBaseMaintenance(state = {}) {
    if (state.dangerFlags?.hostileNearby || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) {
      return { ok: false, reason: 'skip base maintenance while danger is nearby' };
    }
    return { ok: true, reason: 'safe base maintenance' };
  }

  function safeFarmArea(area, options = {}) {
    if (!area?.center) return { ok: false, reason: 'no farm area' };
    if (options.confirmed) return { ok: true, reason: 'confirmed' };
    const home = memory.get().homeBasePosition;
    if (!home) return { ok: false, reason: 'set home before farming' };
    if (distance(area.center, home) > (config.maxFarmRadiusFromHome || 16)) return { ok: false, reason: 'farm is too far from home' };
    if ((area.width || 5) * (area.length || 5) > (config.maxFarmSize || 36)) return { ok: false, reason: 'farm is larger than the safety limit', requiresConfirmation: true };
    return { ok: true, reason: 'safe farm area' };
  }

  function safeToHarvestFarm(block, options = {}) {
    if (!block || !farmCropNames.has(block.name)) return { ok: false, reason: 'not a supported crop' };
    if (!options.registered && !options.direct && !config.allowCropHarvesting) return { ok: false, reason: 'unregistered farm harvesting needs a direct command' };
    return { ok: true, reason: 'safe harvest target' };
  }

  function safeAnimalPenArea(area, options = {}) {
    if (!area?.center) return { ok: false, reason: 'no pen area' };
    if (options.confirmed) return { ok: true, reason: 'confirmed' };
    const home = memory.get().homeBasePosition;
    if (!home) return { ok: false, reason: 'set home before making animal pens' };
    if (distance(area.center, home) > (config.maxAnimalPenRadiusFromHome || 20)) return { ok: false, reason: 'animal pen is too far from home' };
    return { ok: true, reason: 'safe animal pen area' };
  }

  function safeAnimalCare(entity, options = {}) {
    if (!entity) return { ok: false, reason: 'no animal target' };
    const name = entityName(entity);
    if (!['cow', 'sheep', 'pig', 'chicken', 'rabbit'].includes(name)) return { ok: false, reason: `${name} is not a supported pen animal` };
    if (options.slaughter && !config.allowAnimalSlaughter) return { ok: false, reason: 'animal slaughter is disabled' };
    if (config.doNotKillNamedMobs && (entity.customName || entity.displayName?.extra?.length)) return { ok: false, reason: 'named animal protected' };
    if (entity.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0)) return { ok: false, reason: 'baby animal protected' };
    return { ok: true, reason: 'safe animal care target' };
  }

  function safeToExplore(state = {}, options = {}) {
    if (!config.explorationEnabled) return { ok: false, reason: 'exploration is disabled' };
    if (!options.hasReturnTarget && !state.hasReturnTarget) return { ok: false, reason: 'exploration needs a return target' };
    if ((state.health ?? 20) < (config.minimumHealthForExploration || 16)) return { ok: false, reason: 'health is too low to explore' };
    if ((state.food ?? 20) < (config.minimumFoodForExploration || 14)) return { ok: false, reason: 'food is too low to explore' };
    if (state.nearbyHostileMobs?.length && !config.allowCombat) return { ok: false, reason: 'hostile mobs are nearby' };
    if (state.nearbyLava || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) return { ok: false, reason: 'lava or fire is nearby' };
    if (state.dangerFlags?.nightTime && !config.allowNightExploration && !options.confirmedNight) {
      return { ok: false, reason: 'night exploration needs confirmation', requiresConfirmation: 'night_exploration' };
    }
    if (options.distanceFromHome && options.distanceFromHome > (config.maxExploreRadiusFromHome || 128) && !options.confirmedLong) {
      return { ok: false, reason: 'exploration would leave the home safety radius', requiresConfirmation: 'leave_home_radius' };
    }
    if (options.cave && !config.allowCaveExploration && !options.confirmedCave) {
      return { ok: false, reason: 'cave exploration needs confirmation', requiresConfirmation: 'cave_exploration' };
    }
    return { ok: true, reason: 'safe exploration' };
  }

  function safeWaypointTravel(state = {}, mapMemory = {}, options = {}) {
    if (state.dangerFlags?.hostileNearby || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) {
      return { ok: false, reason: 'travel is unsafe while danger is nearby' };
    }
    if (!options.confirmed && config.avoidKnownDangerZones && state.currentPosition) {
      const danger = (mapMemory.dangerZones || []).find((entry) => distance(entry.position, state.currentPosition) <= (entry.radius || 8));
      if (danger) return { ok: false, reason: `known danger nearby: ${danger.dangerType}` };
    }
    return { ok: true, reason: 'safe waypoint travel' };
  }

  function safeCombatTarget(entity, state = {}, options = {}) {
    if (!config.combatEnabled || !config.allowCombat) return { ok: false, reason: 'combat is disabled' };
    if (!entity) return { ok: false, reason: 'no combat target' };
    const name = entityName(entity);
    if (entity.username === config.ownerUsername || name === String(config.ownerUsername).toLowerCase()) return { ok: false, reason: 'never attack ModVinny' };
    if ((entity.type === 'player' || entity.username) && (!config.allowPvp || !options.confirmedPvp)) return { ok: false, reason: 'PVP requires explicit confirmation and is disabled by default', requiresConfirmation: 'pvp_attack' };
    if (name === 'villager' && !config.allowAttackingVillagers) return { ok: false, reason: 'villagers are protected' };
    if (name === 'iron_golem' && !options.confirmedIronGolem) return { ok: false, reason: 'iron golems are protected', requiresConfirmation: 'attack_iron_golem' };
    if (config.allowAttackingNamedMobs !== true && (entity.customName || entity.displayName?.extra?.length)) return { ok: false, reason: 'named mobs are protected', requiresConfirmation: 'attack_named_mob' };
    if (config.allowAttackingTamedMobs !== true && entity.metadata?.some?.((entry) => entry?.key === 17 && entry?.value)) return { ok: false, reason: 'tamed mobs are protected' };
    if (config.allowAttackingBabyMobs !== true && entity.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0)) return { ok: false, reason: 'baby mobs are protected' };
    if (foodAnimalNames.has(name) && !config.allowAttackingPassiveAnimals) return { ok: false, reason: 'passive animals are protected' };
    if (name === 'warden') return { ok: false, reason: 'do not fight the Warden; flee instead' };
    if (state.health !== undefined && state.health < (config.criticalHealthToFlee || 8)) return { ok: false, reason: 'health is too low to fight' };
    if (state.food !== undefined && state.food < (config.minFoodToFight || 10)) return { ok: false, reason: 'food is too low to fight' };
    if ((state.threatCount || 0) > (config.maxHostilesBeforeFlee || 3) && !options.confirmedDangerousCombat) return { ok: false, reason: 'too many hostiles; retreat first', requiresConfirmation: 'dangerous_combat' };
    if (state.nearbyLava || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby || state.nearbyFallRisk) return { ok: false, reason: 'combat area has hazards' };
    return { ok: true, reason: 'safe combat target' };
  }

  function safeCombatState(state = {}, options = {}) {
    if (!config.combatEnabled || !config.allowCombat) return { ok: false, reason: 'combat is disabled' };
    if (state.wardenNearby) return { ok: false, reason: 'Warden nearby; flee' };
    if (state.health < (config.criticalHealthToFlee || 8)) return { ok: false, reason: 'critical health' };
    if (state.food < (config.minFoodToFight || 10)) return { ok: false, reason: 'food too low' };
    if ((state.threatCount || 0) > (config.maxHostilesBeforeFlee || 3) && !options.confirmedDangerousCombat) return { ok: false, reason: 'outnumbered' };
    return { ok: true, reason: 'safe combat state' };
  }

  function safePlannerGoal(goal = {}) {
    if (!config.longTermPlanningEnabled) return { ok: false, reason: 'long-term planning is disabled' };
    const text = `${goal.name || ''} ${goal.description || ''} ${goal.reason || ''}`;
    if (/enter nether|use portal|light portal/i.test(text) && !config.netherTravelImplemented) {
      return { ok: false, reason: 'Nether travel is blocked until Advanced Phase 7' };
    }
    if (/nether exploration|fortress|bastion|nether mining/i.test(text) && !goal.confirmed) {
      return { ok: false, reason: 'Nether exploration, fortress search, bastion search, and mining are blocked in this phase', requiresConfirmation: true };
    }
    if (/pvp|attack player/i.test(text)) return { ok: false, reason: 'PVP goals are blocked' };
    if ((goal.steps || []).length > (config.maxGoalSteps || 12)) return { ok: false, reason: 'goal has too many steps' };
    return { ok: true, reason: 'planner goal passes safety guardrails' };
  }

  function safePlannerStep(step = {}, state = {}) {
    const text = `${step.action || ''} ${step.description || ''} ${JSON.stringify(step.args || {})}`;
    if (/bot\.|pathfinder|raw movement|raw dig|raw attack|raw place/i.test(text)) return { ok: false, reason: 'raw bot control is blocked' };
    if (/nether travel|enter nether|use portal|light portal/i.test(text) && !config.netherTravelImplemented) {
      return { ok: false, reason: 'Nether travel is blocked until Advanced Phase 7' };
    }
    if (/light_portal|light portal|safe_nether_entry|enter_nether|enter nether|use portal/i.test(text) && !step.confirmed && (config.requireConfirmationForNetherEntry || config.requireConfirmationForPortalLighting)) {
      return { ok: false, reason: 'portal lighting and Nether entry need confirmation', requiresConfirmation: true };
    }
    if (/nether_exploration|nether mining|fortress|bastion/i.test(text)) {
      return { ok: false, reason: 'Nether exploration/mining/structure search is blocked in this phase', requiresConfirmation: true };
    }
    if (/diamond/i.test(text) && !config.allowPlannerToUseDiamonds && !step.confirmed) return { ok: false, reason: 'diamond use needs explicit confirmation', requiresConfirmation: true };
    if (/deep|caving|cave/i.test(text) && (!config.allowPlannerToStartDeepMining || !config.allowPlannerToStartCaving) && !step.confirmed) {
      return { ok: false, reason: 'deep mining/caving needs confirmation', requiresConfirmation: true };
    }
    if (/pvp/i.test(text) || state.pvpTarget) return { ok: false, reason: 'planner cannot start PVP' };
    if (state.dangerFlags?.lowHealth || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) return { ok: false, reason: 'emergency safety blocks goal progress' };
    if (state.dangerFlags?.tooFarFromOwner && config.autoPauseGoalsWhenOwnerFar) return { ok: false, reason: 'owner is too far away for goal progress' };
    return { ok: true, reason: 'planner step passes safety guardrails' };
  }

  function safeNetherEntry(state = {}, options = {}) {
    if (!config.netherPrepEnabled || !config.allowNetherEntry) return { ok: false, reason: 'Nether entry is disabled' };
    if (!options.confirmed && config.requireConfirmationForNetherEntry) return { ok: false, reason: 'Nether entry needs confirmation', requiresConfirmation: 'nether_entry' };
    if (!state.overworldPortalKnown && !state.nearbyPortal && !options.override) return { ok: false, reason: 'remember the Overworld portal before entering' };
    if (!state.netherReady && !options.override) return { ok: false, reason: 'Nether checklist is not ready' };
    if (state.health < (config.minimumHealthForNether || 18) && !options.override) return { ok: false, reason: 'health is too low for Nether entry' };
    if (state.food < (config.minimumFoodForNether || 16) && !options.override) return { ok: false, reason: 'food is too low for Nether entry' };
    return { ok: true, reason: 'Nether entry passes safety guardrails' };
  }

  function safeProgressionRequest(request = {}) {
    const text = `${request.type || ''} ${request.milestoneId || ''} ${request.description || ''}`;
    if (/raw|bot\.|pathfinder|dig\(|attack\(|place\(/i.test(text)) return { ok: false, reason: 'progression cannot use raw Mineflayer actions' };
    if (/pvp|attack player/i.test(text)) return { ok: false, reason: 'progression cannot suggest PVP' };
    if (/enter_end|dragon|boss/i.test(text) && !config.allowProgressionEndEntry) return { ok: false, reason: 'End/boss progression is future-blocked' };
    if (/nether_entry|safe_nether_entry|light_portal/i.test(text) && !request.confirmed) return { ok: false, reason: 'Nether progression steps require explicit confirmation', requiresConfirmation: true };
    if (/diamond|gold|rare/i.test(text) && !request.confirmed) return { ok: false, reason: 'rare resource progression needs confirmation', requiresConfirmation: true };
    return { ok: true, reason: 'progression request passes safety guardrails' };
  }

  function safeGearUpgradeRequest(request = {}) {
    const text = `${request.type || ''} ${request.itemName || ''} ${request.description || ''}`;
    if (/raw|bot\.|pathfinder|dig\(|attack\(|place\(|openWindow|clickWindow/i.test(text)) {
      return { ok: false, reason: 'gear upgrades cannot use raw Mineflayer/window actions' };
    }
    if (request.sender && request.sender !== config.ownerUsername) return { ok: false, reason: 'only ModVinny can request gear upgrades' };
    if (/diamond/i.test(text) && !request.confirmed) return { ok: false, reason: 'diamond gear usage needs explicit confirmation', requiresConfirmation: true };
    if (/netherite/i.test(text) && (!config.allowNetheriteUpgrade || !request.confirmed)) return { ok: false, reason: 'netherite gear upgrades are blocked or need confirmation', requiresConfirmation: true };
    if (/book|enchanted_book/i.test(text) && config.protectValuableBooks && !request.confirmed) return { ok: false, reason: 'enchanted book use needs confirmation', requiresConfirmation: true };
    if (/brew|brewing/i.test(text) && !config.brewingEnabled) return { ok: false, reason: 'brewing mutation is not enabled because API support is scaffolded' };
    if (/potion/i.test(text) && !request.confirmed && config.requireConfirmationForPotionUse) return { ok: false, reason: 'potion use needs confirmation', requiresConfirmation: true };
    if (memory.get().cancelled || memory.get().emergencyStop) return { ok: false, reason: 'gear upgrades blocked during cancellation' };
    return { ok: true, reason: 'gear upgrade request passes safety guardrails' };
  }

  function isFluidName(name) {
    return name === 'water' || name === 'lava' || name === 'bubble_column'
      || String(name || '').includes('water')
      || String(name || '').includes('lava');
  }

  function isPassableName(name) {
    return !name
      || name === 'air'
      || name === 'cave_air'
      || name === 'void_air'
      || name === 'short_grass'
      || name === 'tall_grass'
      || name === 'snow'
      || String(name).endsWith('_carpet');
  }

  /** True if standing in / digging this block would put the bot underwater or into lava. */
  function isHazardousFluidDig(block) {
    if (!block?.position || !bot.blockAt) return false;
    const here = bot.blockAt(block.position);
    if (here && isFluidName(here.name)) return true;
    // Head/feet would be submerged if water sits on top of the dig target (classic river sand).
    const above = bot.blockAt(block.position.offset(0, 1, 0));
    if (above && isFluidName(above.name)) return true;
    // Fully water-logged sides (both feet and head water) = swim dig.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const side = bot.blockAt(block.position.offset(dx, 0, dz));
      const sideUp = bot.blockAt(block.position.offset(dx, 1, dz));
      if (side && isFluidName(side.name) && sideUp && isFluidName(sideUp.name)) return true;
    }
    // No dry stand spot around the block → pathfinder will often swim to it.
    let dryStand = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const floor = bot.blockAt(block.position.offset(dx, -1, dz));
      const feet = bot.blockAt(block.position.offset(dx, 0, dz));
      const head = bot.blockAt(block.position.offset(dx, 1, dz));
      if (!floor || isFluidName(floor.name) || isPassableName(floor.name)) continue;
      if (feet && isFluidName(feet.name)) continue;
      if (head && isFluidName(head.name)) continue;
      if (feet && !isPassableName(feet.name) && feet.boundingBox === 'block') continue;
      dryStand = true;
      break;
    }
    if (!dryStand) {
      const top = bot.blockAt(block.position.offset(0, 1, 0));
      const top2 = bot.blockAt(block.position.offset(0, 2, 0));
      if (top && isPassableName(top.name) && !isFluidName(top.name)
        && (!top2 || (isPassableName(top2.name) && !isFluidName(top2.name)))) {
        dryStand = true;
      }
    }
    if (!dryStand) return true;
    return false;
  }

  function isSurfaceShovelBlock(name) {
    return /^(dirt|grass_block|coarse_dirt|rooted_dirt|mud|sand|red_sand|gravel|clay)$/.test(String(name || ''));
  }

  function safeToDig(block, state = null) {
    if (!block || !bot.entity) return { ok: false, reason: 'no block' };
    if (!block.diggable) return { ok: false, reason: `${block.name} is not diggable` };
    if (isProtectedBlockName(block.name)) return { ok: false, reason: `protected block: ${block.name}` };
    if (block.name === 'chest' && !config.allowChestBreaking) return { ok: false, reason: 'chest breaking disabled' };
    const bridgeRegion = protectedBridgeRegionAt(block.position);
    if (bridgeRegion) return { ok: false, reason: `protected bridge region: ${bridgeRegion.name || bridgeRegion.id}` };

    const botBelow = bot.entity.position.offset(0, -1, 0);
    if (sameBlock(block.position, botBelow)) return { ok: false, reason: 'would dig under self' };

    const ownerPosition = state?.ownerPosition || memory.get().lastOwnerPosition;
    if (ownerPosition && sameBlock(block.position, { x: ownerPosition.x, y: ownerPosition.y - 1, z: ownerPosition.z })) {
      return { ok: false, reason: 'would dig under owner' };
    }

    if (/nether/.test(String(bot.game?.dimension || '')) && ['nether_gold_ore', 'gilded_blackstone'].includes(block.name)) {
      return { ok: false, reason: 'do not mine Nether gold near piglins in this phase' };
    }

    // Prefer dry land for sand/gravel/clay/dirt so we do not drown collecting surface blocks.
    if (isSurfaceShovelBlock(block.name) && isHazardousFluidDig(block)) {
      if (config.allowUnderwaterDigging === true) {
        const oxygen = Number(bot.oxygenLevel ?? 20);
        const minO2 = Number(config.minOxygenToDig ?? 12);
        if (Number.isFinite(oxygen) && oxygen < minO2) {
          return { ok: false, reason: 'low air — skipping underwater dig' };
        }
      } else {
        return { ok: false, reason: 'underwater surface block (stay dry)' };
      }
    }

    return { ok: true, reason: 'safe' };
  }

  function assess(state) {
    const emergency = [];
    if (state.dangerFlags.lowHealth) emergency.push('lowHealth');
    if (state.dangerFlags.lavaNearby || state.dangerFlags.fireNearby) emergency.push('lavaOrFireNearby');
    if (!config.allowCombat && state.dangerFlags.hostileNearby) emergency.push('hostileNearby');
    if (!config.allowNightExploration && state.dangerFlags.nightTime) emergency.push('nightTime');
    if (state.dangerFlags.tooFarFromOwner) emergency.push('tooFarFromOwner');
    return {
      emergency: emergency.length > 0,
      reasons: emergency
    };
  }

  return {
    safeToDig,
    isHazardousFluidDig,
    isSurfaceShovelBlock,
    assess,
    isProtectedBlockName,
    safeToEquipArmor,
    canUseDiamondsForArmor,
    safeToAttackFoodAnimal,
    safeToHarvestCrop,
    safeToEatFood,
    safeToUseFuel,
    safeToCraftItem,
    safeToUseChest,
    safeToBuildNear,
    safeResourceRun,
    safeBaseMaintenance,
    safeFarmArea,
    safeToHarvestFarm,
    safeAnimalPenArea,
    safeAnimalCare,
    safeToExplore,
    safeWaypointTravel,
    safeCombatTarget,
    safeCombatState,
    safeNetherEntry,
    safePlannerGoal,
    safePlannerStep,
    safeProgressionRequest,
    safeGearUpgradeRequest,
    protectedBridgeRegionAt
  };
}
