import {
  getArmorStatus,
  hasBetterArmorInInventory,
  hasDiamondsForArmor,
  hasIronForArmor,
  hasLeatherForArmor
} from './armor.js';
import {
  canCookFood,
  findNearbyFoodSources,
  findNearbyFurnace,
  foodStatus as collectFoodStatus
} from './food.js';
import {
  canCraft,
  craftingStatus,
  getAvailableLogTypes,
  getAvailablePlankTypes,
  getAvailableWoolColors
} from './crafting.js';
import {
  getBrewingIngredientSummary,
  getEnchantedBooks,
  getGearInventory,
  findBestTool,
  findBestWeapon,
  getFarmSupplySummary,
  getLapisCount,
  getNetherSupplySummary,
  getPotionInventory,
  getUpgradeSupplySummary,
  getXpStatus,
  lowDurabilityTools
} from './inventory.js';
import * as homeBase from './homeBase.js';
import * as resourceRuns from './resourceRuns.js';
import * as animalCare from './animalCare.js';
import * as animalPens from './animalPens.js';
import * as cropUtils from './cropUtils.js';
import * as farming from './farming.js';
import * as hoeTools from './hoeTools.js';
import * as oreScanner from './oreScanner.js';
import * as miningTools from './miningTools.js';
import * as mapMemoryStore from './mapMemory.js';
import * as worldScanner from './worldScanner.js';
import * as threatAssessment from './threatAssessment.js';
import * as combatEquipment from './combatEquipment.js';
import * as goalsStore from './goals.js';
import * as plannerState from './plannerState.js';
import * as netherPrep from './netherPrep.js';
import * as netherSafety from './netherSafety.js';
import * as portalManager from './portalManager.js';
import * as conversationMemory from './conversationMemory.js';
import * as gearScore from './gearScore.js';
import * as brewing from './brewing.js';

const usefulBlockNames = [
  'oak_log',
  'birch_log',
  'spruce_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'mangrove_log',
  'cherry_log',
  'stone',
  'coal_ore',
  'iron_ore',
  'crafting_table'
];

const bedBlockNames = [
  'white_bed',
  'orange_bed',
  'magenta_bed',
  'light_blue_bed',
  'yellow_bed',
  'lime_bed',
  'pink_bed',
  'gray_bed',
  'light_gray_bed',
  'cyan_bed',
  'purple_bed',
  'blue_bed',
  'brown_bed',
  'green_bed',
  'red_bed',
  'black_bed'
];

const passiveMobNames = new Set([
  'allay',
  'armadillo',
  'axolotl',
  'bat',
  'camel',
  'cat',
  'chicken',
  'cow',
  'donkey',
  'fox',
  'frog',
  'horse',
  'llama',
  'mooshroom',
  'ocelot',
  'parrot',
  'pig',
  'rabbit',
  'sheep',
  'sniffer',
  'squid',
  'turtle',
  'villager',
  'wolf'
]);

const hostileMobNames = new Set([
  'blaze',
  'bogged',
  'breeze',
  'cave_spider',
  'creeper',
  'drowned',
  'elder_guardian',
  'endermite',
  'evoker',
  'ghast',
  'guardian',
  'hoglin',
  'husk',
  'magma_cube',
  'phantom',
  'piglin_brute',
  'pillager',
  'ravager',
  'shulker',
  'silverfish',
  'skeleton',
  'slime',
  'spider',
  'stray',
  'vex',
  'vindicator',
  'warden',
  'witch',
  'wither_skeleton',
  'zoglin',
  'zombie',
  'zombie_villager',
  'zombified_piglin'
]);

function entityName(entity) {
  return String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
}

function point(pos) {
  if (!pos) return null;
  return { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)) };
}

function inventorySummary(bot) {
  const items = bot.inventory?.items?.() || [];
  return items.map((item) => ({ name: item.name, count: item.count }));
}

function itemCount(bot, names) {
  const wanted = new Set(names);
  return (bot.inventory?.items?.() || [])
    .filter((item) => wanted.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

function nearbyEntities(bot, predicate, maxDistance = 24) {
  if (!bot.entity) return [];
  return Object.values(bot.entities)
    .filter((entity) => entity !== bot.entity && predicate(entity))
    .map((entity) => ({
      id: entity.id,
      name: entityName(entity),
      type: entity.type,
      position: point(entity.position),
      distance: Number(bot.entity.position.distanceTo(entity.position).toFixed(1)),
      entity
    }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
}

function nearbyPlayers(bot, config) {
  if (!bot.entity) return [];
  return Object.values(bot.players)
    .filter((player) => player.username !== bot.username && player.entity)
    .map((player) => ({
      username: player.username,
      friendly: config.friendlyPlayers.includes(player.username),
      position: point(player.entity.position),
      distance: Number(bot.entity.position.distanceTo(player.entity.position).toFixed(1)),
      entity: player.entity
    }))
    .sort((a, b) => a.distance - b.distance);
}

function findBlocksByNames(bot, names, maxDistance = 24, count = 24) {
  if (!bot.registry || !bot.entity) return [];
  const ids = names.map((name) => bot.registry.blocksByName[name]?.id).filter(Boolean);
  if (ids.length === 0) return [];

  return bot.findBlocks({ matching: ids, maxDistance, count })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)
    .map((block) => ({
      name: block.name,
      position: point(block.position),
      distance: Number(bot.entity.position.distanceTo(block.position).toFixed(1)),
      block
    }))
    .sort((a, b) => a.distance - b.distance);
}

function isNight(bot) {
  const timeOfDay = bot.time?.timeOfDay ?? 0;
  return timeOfDay >= 13000 && timeOfDay <= 23000;
}

function nearestDangerZone(mapMemory, position) {
  if (!position) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const danger of mapMemory.dangerZones || []) {
    const dx = danger.position.x - position.x;
    const dy = danger.position.y - position.y;
    const dz = danger.position.z - position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < bestDistance) {
      best = danger;
      bestDistance = dist;
    }
  }
  return best ? { ...best, distance: Number(bestDistance.toFixed(1)) } : null;
}

export function collectPerception(bot, config, memory, taskQueue) {
  const players = nearbyPlayers(bot, config);
  const friendlyPlayers = players.filter((player) => player.friendly);
  const owner = players.find((player) => player.username === config.ownerUsername) || null;
  const hostileMobs = nearbyEntities(bot, (entity) => entity.type === 'mob' && hostileMobNames.has(entityName(entity)), 24);
  const passiveMobs = nearbyEntities(bot, (entity) => entity.type === 'mob' && passiveMobNames.has(entityName(entity)), 24);
  const usefulBlocks = findBlocksByNames(bot, usefulBlockNames, 32, 40);
  const lavaNearby = findBlocksByNames(bot, ['lava'], 8, 1).length > 0;
  const fireNearby = findBlocksByNames(bot, ['fire'], 8, 1).length > 0;
  const health = bot.health ?? 20;
  const food = bot.food ?? 20;
  const ownerDistance = owner?.distance ?? null;
  const nightTime = isNight(bot);
  const armorStatus = getArmorStatus(bot);
  const foodInfo = collectFoodStatus(bot, config);
  const foodSources = findNearbyFoodSources(bot, config);
  const nearbyFurnace = findNearbyFurnace(bot);
  const craftInfo = craftingStatus(bot);
  const nearbyChests = findBlocksByNames(bot, ['chest', 'trapped_chest', 'barrel'], 16, 16);
  const nearbyCraftingTables = findBlocksByNames(bot, ['crafting_table'], 16, 8);
  const nearbyFurnaces = findBlocksByNames(bot, ['furnace'], 16, 8);
  const nearbyBeds = findBlocksByNames(bot, bedBlockNames, 16, 8);
  const nearbyTorches = findBlocksByNames(bot, ['torch', 'wall_torch'], 16, 24);
  const currentBlock = bot.entity?.position ? bot.blockAt(bot.entity.position.floored()) : null;
  const homeStatus = homeBase.homeStatus(bot, memory);
  const nearHome = homeBase.isNearHome(bot, memory, config.maxBaseBuildRadius || 12);
  const baseResourceCounts = resourceRuns.inventoryResourceCounts(bot);
  const farmStatus = farming.farmingStatus(bot, memory);
  const penStatus = animalPens.animalPenStatus(bot, memory);
  const farmSupplies = getFarmSupplySummary(bot);
  const nearbyEggs = nearbyEntities(bot, (entity) => {
    if (!['item', 'Item', 'item_stack'].includes(entity.name)) return false;
    const dropped = entity.getDroppedItem?.();
    return dropped?.name === 'egg';
  }, 16);
  const visibleOres = oreScanner.scanMiningArea(bot, 32);
  const miningToolInfo = miningTools.miningToolStatus(bot);
  const currentPosition = point(bot.entity?.position);
  const currentDimension = bot.game?.dimension || bot.game?.dimensionName || 'overworld';
  const currentChunk = currentPosition ? { x: Math.floor(currentPosition.x / 16), z: Math.floor(currentPosition.z / 16) } : null;
  const mapMemory = config.mapMemoryEnabled ? mapMemoryStore.loadMapMemory() : mapMemoryStore.ensureMapMemoryShape({});
  const scan = config.mapMemoryEnabled ? worldScanner.scanAndClassify(bot, 16) : { resources: [], structures: [], dangers: [] };
  const nearestWaypointResult = currentPosition ? mapMemoryStore.findNearestWaypoint(mapMemory, currentPosition, { dimension: currentDimension }) : null;
  const nearestDanger = nearestDangerZone(mapMemory, currentPosition);
  const combatThreats = threatAssessment.scanThreats(bot, memory, config.hostileDetectionRadius || 24);
  const primaryThreat = threatAssessment.choosePrimaryThreat(bot, combatThreats);
  const combatGear = combatEquipment.combatEquipmentStatus(bot);
  const goalData = config.longTermPlanningEnabled ? goalsStore.loadGoals() : { activeGoals: [], completedGoals: [], failedGoals: [] };
  const activeGoal = goalData.activeGoals.find((goal) => goal.status === 'active') ||
    goalData.activeGoals.find((goal) => ['blocked', 'paused', 'pending_approval'].includes(goal.status)) ||
    null;
  const nextGoalStep = activeGoal ? goalsStore.getNextGoalStep(activeGoal) : null;
  const plannerRuntime = plannerState.getPlannerState(memory);
  const activeGoalRuntimeMs = activeGoal?.startedAt ? Date.now() - activeGoal.startedAt : 0;
  const netherSupply = getNetherSupplySummary(bot);
  const netherStatusInfo = config.netherPrepEnabled ? netherPrep.netherStatus(bot, memory, mapMemory) : null;
  const netherDangerStatus = netherSafety.netherSafetyStatus(bot, memory, mapMemory, { config });
  const portalInfo = portalManager.portalStatus(bot, memory, mapMemory);
  const knownPortal = netherSafety.isInNether(bot)
    ? (memory.get().netherPortalPosition || mapMemoryStore.getKnownNetherPortal(mapMemory)?.position)
    : (memory.get().overworldPortalPosition || mapMemoryStore.getKnownOverworldPortal(mapMemory)?.position);
  const distanceFromKnownPortal = knownPortal && bot.entity?.position
    ? Number(bot.entity.position.distanceTo(knownPortal).toFixed(1))
    : null;
  const neutralThreats = Object.values(bot.entities || {})
    .filter((entity) => entity !== bot.entity && entity.position && threatAssessment.isNeutralMob(entity))
    .map((entity) => ({
      id: entity.id,
      name: threatAssessment.entityName(entity),
      type: entity.type,
      position: point(entity.position),
      distance: Number(bot.entity.position.distanceTo(entity.position).toFixed(1))
    }))
    .filter((entry) => entry.distance <= (config.hostileDetectionRadius || 24))
    .sort((a, b) => a.distance - b.distance);
  const xpStatus = getXpStatus(bot);
  const lapisCount = getLapisCount(bot);
  const enchantedBooks = getEnchantedBooks(bot);
  const potionInventory = getPotionInventory(bot);
  const brewingSupplies = getBrewingIngredientSummary(bot);
  const upgradeSupplies = getUpgradeSupplySummary(bot);
  const gearSummary = gearScore.getGearSummary(bot);
  const gearUpgradeNeeds = gearScore.getGearUpgradeNeeds(bot);
  const nearbyEnchantmentTables = findBlocksByNames(bot, ['enchanting_table'], 12, 4);
  const nearbyAnvilsForGear = findBlocksByNames(bot, ['anvil', 'chipped_anvil', 'damaged_anvil'], 12, 4);
  const nearbyBrewingStands = findBlocksByNames(bot, ['brewing_stand'], 12, 4);
  const bookshelfCountNearby = findBlocksByNames(bot, ['bookshelf'], 6, 24).length;
  const enchantableItems = getGearInventory(bot)
    .filter((item) => /(_sword|_axe|_pickaxe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|bow|crossbow|trident)$/.test(item.name))
    .map((item) => ({ name: item.name, count: item.count, score: gearScore.scoreGearItem(item) }));
  const netherBest = gearScore.getBestGearBySlot(bot);
  const netherArmorScore = ['head', 'torso', 'legs', 'feet'].reduce((sum, slot) => sum + gearScore.scoreArmorPiece(netherBest[slot], { nether: true }), 0);
  const hasAnyGoldArmor = getGearInventory(bot).some((item) => item.name.startsWith('golden_') && /_(helmet|chestplate|leggings|boots)$/.test(item.name));
  const potionReady = potionInventory.length > 0;
  const brewingReadyStatus = brewing.brewingStatus(bot, memory);

  if (owner?.position) memory.update({ lastOwnerPosition: owner.position });
  if (bot.entity?.position) memory.update({ lastKnownPosition: point(bot.entity.position) });

  for (const block of usefulBlocks) {
    if (block.name.endsWith('_log')) memory.rememberLocation('knownWoodLocations', block.position);
    if (block.name === 'coal_ore') memory.rememberLocation('knownCoalLocations', block.position);
  }

  const dialogueMemory = config.conversationMemoryEnabled ? conversationMemory.loadConversationMemory() : { memoryFacts: [] };
  const currentTaskSummary = memory.get().currentTask?.name || memory.get().currentTask?.type || memory.get().currentTask || null;
  const currentGoalSummary = activeGoal ? `${activeGoal.name}: ${activeGoal.status}` : null;
  const currentDangerSummary = hostileMobs.length > 0
    ? `${hostileMobs.length} hostile nearby`
    : lavaNearby
      ? 'lava nearby'
      : fireNearby
        ? 'fire nearby'
        : null;

  const state = {
    botUsername: bot.username,
    lifelikeDialogueEnabled: Boolean(config.lifelikeDialogueEnabled),
    talkModeEnabled: memory.get().talkModeEnabled !== false,
    banterEnabled: memory.get().banterEnabled !== false,
    currentMood: memory.get().currentMood || 'calm',
    currentTaskSummary,
    currentGoalSummary,
    currentDangerSummary,
    ownerNearby: typeof ownerDistance === 'number' && ownerDistance <= (config.maxAutonomyDistanceFromOwner || 32),
    safeToChat: hostileMobs.length === 0 && !lavaNearby && !fireNearby && health > 8,
    busyWithDangerTask: Boolean(memory.get().activeMiningExpedition || memory.get().activeExploration || memory.get().netherScoutActive || (memory.get().combatMode || 'off') !== 'off'),
    recentDialogueTopic: memory.get().lastDialogueTopic || null,
    pendingClarification: memory.get().pendingDialogueClarification || null,
    conversationMemoryCount: dialogueMemory.memoryFacts?.length || 0,
    lastSpokeAt: memory.get().lastDialogueAt || 0,
    chatCooldownActive: Date.now() - (memory.get().lastDialogueAt || 0) < (config.dialogueCooldownMs || 1800),
    xpLevel: xpStatus.level,
    xpPoints: xpStatus.points,
    lapisCount,
    enchantmentTableNearby: nearbyEnchantmentTables.length > 0,
    anvilNearby: nearbyAnvilsForGear.length > 0,
    brewingStandNearby: nearbyBrewingStands.length > 0,
    bookshelfCountNearby,
    enchantableItems,
    enchantedBooks: enchantedBooks.map((item) => ({ name: item.name, count: item.count, enchantments: gearScore.getEnchantments(item) })),
    potionInventory,
    brewingSupplies,
    gearUpgradeNeeds,
    bestWeaponScore: gearSummary.best.weapon?.score || 0,
    bestArmorScore: gearSummary.armorScore || 0,
    bestPickaxeScore: gearSummary.best.hand?.score || 0,
    netherGearReady: Boolean(hasAnyGoldArmor && netherArmorScore >= 80),
    enchantingReady: Boolean(nearbyEnchantmentTables.length > 0 && lapisCount > 0 && xpStatus.level >= (config.minimumXpLevelsForEnchanting || 3)),
    anvilReady: Boolean(nearbyAnvilsForGear.length > 0 && xpStatus.level > 0),
    potionReady,
    brewingReady: Boolean(brewingReadyStatus?.data?.apiAvailable && brewingReadyStatus?.data?.standNearby),
    upgradeSupplySummary: upgradeSupplies,
    position: currentPosition,
    health,
    food,
    oxygen: bot.oxygenLevel ?? 20,
    timeOfDay: bot.time?.timeOfDay ?? 0,
    dimension: bot.game?.dimension || 'unknown',
    weather: bot.isRaining ? 'rain' : 'clear',
    activeExploration: memory.get().activeExploration || null,
    currentDimension,
    currentPosition,
    currentChunk,
    nearbyKnownWaypoint: nearestWaypointResult && nearestWaypointResult.distance <= 24 ? {
      name: nearestWaypointResult.waypoint.name,
      type: nearestWaypointResult.waypoint.type,
      distance: Number(nearestWaypointResult.distance.toFixed(1)),
      position: nearestWaypointResult.waypoint.position
    } : null,
    nearestDangerZone: nearestDanger,
    visibleResources: (scan.resources || []).slice(0, 16),
    visibleLandmarks: (scan.structures || []).slice(0, 8),
    visibleStructures: (scan.structures || []).slice(0, 8),
    nearbyFallRisk: (scan.dangers || []).some((danger) => danger.dangerType === 'fall'),
    explorationReady: config.explorationEnabled && health >= (config.minimumHealthForExploration || 16) && food >= (config.minimumFoodForExploration || 14),
    safeToExplore: config.explorationEnabled && hostileMobs.length === 0 && !lavaNearby && !fireNearby && health >= (config.minimumHealthForExploration || 16) && food >= (config.minimumFoodForExploration || 14),
    hasReturnTarget: Boolean(memory.get().explorationReturnTarget || memory.get().homeBasePosition || owner),
    breadcrumbCount: (memory.get().explorationBreadcrumbs || []).length,
    knownPlacesNearby: mapMemoryStore.listWaypoints(mapMemory, { dimension: currentDimension })
      .map((waypoint) => ({
        name: waypoint.name,
        type: waypoint.type,
        position: waypoint.position,
        distance: currentPosition ? Number(Math.hypot(waypoint.position.x - currentPosition.x, waypoint.position.y - currentPosition.y, waypoint.position.z - currentPosition.z).toFixed(1)) : null
      }))
      .filter((waypoint) => waypoint.distance !== null && waypoint.distance <= 48)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8),
    heldItem: bot.heldItem?.name || null,
    combatMode: memory.get().combatMode || 'off',
    nearbyHostiles: combatThreats.filter((threat) => threat.kind === 'hostile').map(({ entity, ...rest }) => rest),
    nearbyNeutralThreats: neutralThreats,
    nearbyPassiveEntities: passiveMobs.map(({ entity, ...rest }) => rest),
    threatCount: combatThreats.filter((threat) => threat.kind === 'hostile').length,
    primaryThreat: primaryThreat ? { id: primaryThreat.id, name: primaryThreat.name, position: primaryThreat.position, distance: primaryThreat.distance, score: primaryThreat.score } : null,
    primaryThreatType: primaryThreat?.name || null,
    primaryThreatDistance: primaryThreat?.distance ?? null,
    threatsNearOwner: combatThreats.filter((threat) => threat.ownerThreat).map(({ entity, ...rest }) => rest),
    threatsNearHome: combatThreats.filter((threat) => threat.baseThreat).map(({ entity, ...rest }) => rest),
    threatsNearFarm: combatThreats.filter((threat) => threat.baseThreat && (memory.get().knownFarms || []).length).map(({ entity, ...rest }) => rest),
    threatsNearPens: combatThreats.filter((threat) => threat.baseThreat && (memory.get().knownAnimalPens || []).length).map(({ entity, ...rest }) => rest),
    creeperNearby: combatThreats.some((threat) => threat.name === 'creeper'),
    skeletonNearby: combatThreats.some((threat) => threat.name === 'skeleton' || threat.name === 'stray'),
    witchNearby: combatThreats.some((threat) => threat.name === 'witch'),
    wardenNearby: combatThreats.some((threat) => threat.name === 'warden'),
    isInCombat: (memory.get().combatMode || 'off') !== 'off',
    combatReady: Boolean(combatGear.bestWeapon) && health >= (config.minHealthToFight || 14) && food >= (config.minFoodToFight || 10),
    hasShield: combatGear.hasShield,
    hasBow: combatGear.hasBow,
    hasArrows: combatGear.hasArrows,
    netherPrepEnabled: Boolean(config.netherPrepEnabled),
    isInNether: netherSafety.isInNether(bot),
    isInOverworld: netherSafety.isInOverworld(bot),
    netherReady: Boolean(netherStatusInfo?.ready),
    netherChecklist: netherStatusInfo?.checklist || null,
    missingNetherSupplies: netherStatusInfo?.missing || [],
    hasGoldArmor: Boolean(netherStatusInfo?.gear?.hasGoldArmor || netherSupply.goldArmorCount > 0),
    goldArmorEquipped: Boolean(netherStatusInfo?.gear?.goldArmorEquipped),
    arrowCount: netherSupply.arrowCount,
    obsidianCount: netherSupply.obsidianCount,
    flintAndSteelCount: netherSupply.flintAndSteelCount,
    netherBlockCount: netherSupply.blockCount,
    netherFoodCount: netherSupply.foodCount,
    fireResistancePotionCount: netherSupply.fireResistancePotionCount,
    overworldPortalKnown: Boolean(portalInfo.overworldPortalKnown),
    netherPortalKnown: Boolean(portalInfo.netherPortalKnown),
    nearbyPortal: portalInfo.nearbyPortal ? { name: portalInfo.nearbyPortal.name, position: point(portalInfo.nearbyPortal.position) } : null,
    distanceFromKnownPortal,
    netherDangerNearby: Boolean(netherDangerStatus.dangerNearby),
    netherDangerSummary: netherDangerStatus.summary || [],
    ghastNearby: Boolean(netherDangerStatus.dangers?.ghastNearby),
    piglinNearby: Boolean(netherDangerStatus.dangers?.piglinNearby),
    hoglinNearby: Boolean(netherDangerStatus.dangers?.hoglinNearby),
    blazeNearby: Boolean(netherDangerStatus.dangers?.blazeNearby),
    witherSkeletonNearby: Boolean(netherDangerStatus.dangers?.witherSkeletonNearby),
    cliffNearby: Boolean(netherDangerStatus.dangers?.fallRisk),
    fortressPossibleNearby: Boolean(netherDangerStatus.dangers?.fortressPossibleNearby),
    bastionPossibleNearby: Boolean(netherDangerStatus.dangers?.bastionPossibleNearby),
    shouldReturnFromNether: Boolean(netherDangerStatus.shouldReturn?.shouldReturn),
    // Flee only for real combat danger — low food is handled by food survival, not retreat spam.
    shouldFleeCombat:
      combatThreats.some((threat) => threat.name === 'warden')
      || combatThreats.filter((threat) => threat.kind === 'hostile').length > (config.maxHostilesBeforeFlee || 3)
      || (combatThreats.filter((threat) => threat.kind === 'hostile').length > 0
        && health <= (config.criticalHealthToFlee || 8)),
    shouldAvoidFighting: food < (config.minFoodToFight || 10) || health <= (config.criticalHealthToFlee || 8),
    longTermPlanningEnabled: Boolean(config.longTermPlanningEnabled),
    activeGoalId: activeGoal?.id || null,
    activeGoalName: activeGoal?.name || null,
    activeGoalType: activeGoal?.type || null,
    activeGoalPriority: activeGoal?.priority || null,
    activeGoalStatus: activeGoal?.status || null,
    activeGoalProgressPercent: activeGoal ? goalsStore.getGoalProgress(activeGoal) : 0,
    activeGoalCurrentStep: activeGoal?.currentStepId || null,
    activeGoalNextStep: nextGoalStep ? { id: nextGoalStep.id, description: nextGoalStep.description, action: nextGoalStep.action, riskLevel: nextGoalStep.riskLevel } : null,
    activeGoalBlocked: activeGoal?.status === 'blocked' || (activeGoal?.blockers || []).length > 0,
    activeGoalBlockReason: activeGoal?.blockers?.[0]?.reason || null,
    activeGoalRequiresConfirmation: Boolean(activeGoal?.requiresConfirmation || nextGoalStep?.requiresConfirmation),
    activeGoalRiskLevel: activeGoal?.riskLevel || null,
    activeGoalRuntimeMs,
    activeGoalTooLong: activeGoalRuntimeMs > (config.maxGoalRunDurationMs || 600000),
    plannerReady: Boolean(config.longTermPlanningEnabled && !plannerRuntime.plannerPausedReason),
    plannerCooldownActive: Date.now() - (plannerRuntime.lastPlannerDecisionAt || 0) < (config.plannerDecisionCooldownMs || 45000),
    plannerPaused: Boolean(plannerRuntime.plannerPausedReason),
    plannerPausedReason: plannerRuntime.plannerPausedReason,
    currentGoalCount: goalData.activeGoals.length,
    activeGoalCount: goalData.activeGoals.filter((goal) => ['active', 'paused', 'blocked', 'pending_approval'].includes(goal.status)).length,
    completedGoalCount: goalData.completedGoals.length,
    failedGoalCount: goalData.failedGoals.length,
    equippedHelmet: armorStatus.head,
    equippedChestplate: armorStatus.torso,
    equippedLeggings: armorStatus.legs,
    equippedBoots: armorStatus.feet,
    armorScore: armorStatus.armorScore,
    missingArmorSlots: armorStatus.missing,
    hasBetterArmorInInventory: hasBetterArmorInInventory(bot),
    hasIronForArmor: hasIronForArmor(bot),
    hasLeatherForArmor: hasLeatherForArmor(bot),
    hasDiamondsForArmor: hasDiamondsForArmor(bot),
    saturation: foodInfo.saturation,
    lowFood: foodInfo.lowFood,
    criticalFood: foodInfo.criticalFood,
    hasFood: foodInfo.hasFood,
    bestFood: foodInfo.bestFood,
    rawFoodCount: foodInfo.rawFoodCount,
    cookedFoodCount: foodInfo.safeFoodCount,
    nearbyFoodAnimals: foodSources.animals.map(({ entity, ...rest }) => rest),
    nearbyPlantFood: foodSources.plants.map(({ block, ...rest }) => rest),
    nearbyCrops: foodSources.crops.map(({ block, ...rest }) => rest),
    nearbyFurnace: nearbyFurnace ? { name: nearbyFurnace.name, position: point(nearbyFurnace.position), distance: Number(bot.entity?.position.distanceTo(nearbyFurnace.position).toFixed(1) || 0) } : null,
    canCookFood: canCookFood(bot),
    canCraftBread: itemCount(bot, ['wheat']) >= 3,
    canFish: itemCount(bot, ['fishing_rod']) > 0,
    hungerEmergency: foodInfo.criticalFood,
    distanceFromHome: homeBase.distanceFromHome(bot, memory),
    nearHome,
    homeExists: homeStatus.exists,
    nearbyChests: nearbyChests.map(({ block, ...rest }) => rest),
    nearbyCraftingTables: nearbyCraftingTables.map(({ block, ...rest }) => rest),
    nearbyFurnaces: nearbyFurnaces.map(({ block, ...rest }) => rest),
    nearbyBeds: nearbyBeds.map(({ block, ...rest }) => rest),
    nearbyTorches: nearbyTorches.map(({ block, ...rest }) => rest),
    lightLevelIfAvailable: currentBlock?.light ?? currentBlock?.skyLight ?? null,
    homeDangerFlags: {
      hostileNearbyAtHome: nearHome && hostileMobs.length > 0,
      lavaNearbyAtHome: nearHome && lavaNearby,
      fireNearbyAtHome: nearHome && fireNearby,
      nightAtHome: nearHome && nightTime
    },
    homeNeedsTorches: homeStatus.exists && config.homeLightingEnabled && nearbyTorches.length < 4,
    homeHasStorage: (memory.get().knownStorageChests || []).length > 0,
    homeHasCraftingTable: (memory.get().knownCraftingTables || []).length > 0 || nearbyCraftingTables.length > 0,
    homeHasFurnace: (memory.get().knownFurnaces || []).length > 0 || nearbyFurnaces.length > 0,
    homeHasBed: (memory.get().knownBeds || []).length > 0 || nearbyBeds.length > 0,
    baseResourceCounts,
    activeMiningExpedition: memory.get().activeMiningExpedition || null,
    currentYLevel: bot.entity?.position ? Math.floor(bot.entity.position.y) : null,
    nearbyVisibleOres: visibleOres,
    nearbyLava: lavaNearby,
    nearbyWater: findBlocksByNames(bot, ['water'], 8, 4).length > 0,
    nearbyGravel: findBlocksByNames(bot, ['gravel'], 8, 8).length > 0,
    nearbySand: findBlocksByNames(bot, ['sand', 'red_sand'], 8, 8).length > 0,
    nearbyHostilesForMining: hostileMobs.map(({ entity, ...rest }) => rest),
    mineEntranceNearby: memory.get().primaryMineEntrance ? true : false,
    distanceFromMineEntrance: memory.get().primaryMineEntrance && bot.entity?.position
      ? Number(bot.entity.position.distanceTo({ x: memory.get().primaryMineEntrance.x, y: memory.get().primaryMineEntrance.y, z: memory.get().primaryMineEntrance.z }).toFixed(1))
      : null,
    inventoryFreeSlots: bot.inventory?.slots?.slice(9, 45).filter((slot) => !slot).length ?? null,
    hasPickaxe: Boolean(miningToolInfo.bestPickaxe),
    bestPickaxe: miningToolInfo.bestPickaxe,
    pickaxeDurability: miningToolInfo.bestPickaxeDurability,
    torchCount: itemCount(bot, ['torch']),
    miningReady: Boolean(miningToolInfo.bestPickaxe) && itemCount(bot, ['torch']) >= config.minTorchCountForMining && health >= config.minHealthForMining && food >= config.minFoodForMining,
    miningDangerFlags: {
      lavaNearby,
      waterNearby: findBlocksByNames(bot, ['water'], 8, 4).length > 0,
      hostileNearby: hostileMobs.length > 0,
      lowHealth: health < config.minHealthForMining,
      lowFood: food < config.minFoodForMining
    },
    nearbyFarms: memory.get().knownFarms || [],
    nearbyMatureCrops: (memory.get().knownFarms || []).flatMap((farm) => cropUtils.findMatureCrops(bot, farm).map((block) => ({ name: block.name, position: point(block.position) }))),
    nearbyPlantableFarmland: (memory.get().knownFarms || []).flatMap((farm) => cropUtils.findPlantableFarmland(bot, farm).map((block) => ({ name: block.name, position: point(block.position) }))),
    nearbyPassiveAnimals: passiveMobs.map(({ entity, ...rest }) => rest),
    nearbyAnimalPens: penStatus.details,
    nearbyEggs: nearbyEggs.map(({ entity, ...rest }) => rest),
    hasHoe: hoeTools.hasHoe(bot),
    bestHoe: hoeTools.getBestHoe(bot, { allowExpensive: true })?.name || null,
    hasSeeds: farmSupplies.seeds > 0,
    hasWheatSeeds: farmSupplies.wheatSeeds > 0,
    hasCarrots: farmSupplies.carrots > 0,
    hasPotatoes: farmSupplies.potatoes > 0,
    hasBeetrootSeeds: farmSupplies.beetrootSeeds > 0,
    hasAnimalFood: farmSupplies.animalFood > 0,
    hasFences: farmSupplies.fences > 0,
    hasFenceGate: farmSupplies.fenceGates > 0,
    canCraftFences: craftInfo.canCraftChest || craftInfo.availablePlanks?.length > 0,
    canCraftFenceGate: craftInfo.canCraftChest || craftInfo.availablePlanks?.length > 0,
    canCreateFarm: config.farmingEnabled && homeStatus.exists && farmSupplies.seeds + farmSupplies.crops > 0,
    canCreateAnimalPen: config.animalPensEnabled && homeStatus.exists && (farmSupplies.fences > 0 || craftInfo.canCraftChest),
    farmNeedsHarvest: farmStatus.matureCrops > 0,
    farmNeedsReplant: farmStatus.plantableFarmland > 0,
    animalPensNeedCare: penStatus.pens > 0 && (nearbyEggs.length > 0 || config.allowAutonomousAnimalCare),
    animalsCanBreed: penStatus.details.some((pen) => pen.animals >= 2 && pen.animals < (config.maxAnimalsPerPen || 8) && animalCare.hasAnimalFood(bot, pen.animalType)),
    tooManyAnimalsInPen: penStatus.details.some((pen) => pen.animals > (config.maxAnimalsPerPen || 8)),
    availableLogs: getAvailableLogTypes(bot),
    availablePlanks: getAvailablePlankTypes(bot),
    availableWoolColors: getAvailableWoolColors(bot),
    hasCoal: itemCount(bot, ['coal']) > 0,
    hasCharcoal: itemCount(bot, ['charcoal']) > 0,
    hasCobblestone: itemCount(bot, ['cobblestone']) > 0,
    hasIronIngot: itemCount(bot, ['iron_ingot']) > 0,
    hasSticks: itemCount(bot, ['stick']) > 0,
    canCraftTorches: craftInfo.canCraftTorches,
    canCraftChest: craftInfo.canCraftChest,
    canCraftFurnace: craftInfo.canCraftFurnace || canCraft(bot, 'furnace'),
    canCraftBed: craftInfo.canCraftBed,
    canCraftBoat: craftInfo.canCraftBoat,
    canCraftShield: craftInfo.canCraftShield,
    canCraftSurvivalKit: craftInfo.canCraftSurvivalKit,
    hasHome: homeStatus.exists,
    hasStorage: (memory.get().knownStorageChests || []).length > 0,
    hasFarm: (memory.get().knownFarms || []).length > 0,
    hasAnimalPens: (memory.get().knownAnimalPens || []).length > 0,
    hasMine: (memory.get().knownMineEntrances || []).length > 0 || Boolean(memory.get().primaryMineEntrance),
    hasFoodSource: (memory.get().knownFarms || []).length > 0 || foodInfo.safeFoodCount >= (config.minimumFoodCount || 6),
    hasBed: (memory.get().knownBeds || []).length > 0 || nearbyBeds.length > 0 || bot.inventory.items().some((item) => item.name.endsWith('_bed')),
    hasShelter: (memory.get().baseBuildHistory || []).some((entry) => /shelter/i.test(entry.type || entry.message || '')),
    hasTorches: itemCount(bot, ['torch']) > 0,
    hasIronGear: armorStatus.armorScore >= 4 && Boolean(combatGear.bestWeapon),
    hasBasicTools: Boolean(findBestTool(bot, 'stone') || findBestTool(bot, 'oak_log')),
    hasMiningSupplies: Boolean(miningToolInfo.bestPickaxe) && itemCount(bot, ['torch']) >= 2 && food >= 12,
    hasExplorationSupplies: food >= (config.minimumFoodForExploration || 14) && health >= (config.minimumHealthForExploration || 16),
    hasCombatGear: Boolean(combatGear.bestWeapon) || armorStatus.armorScore > 0,
    hasNetherPrepStarted: goalData.activeGoals.concat(goalData.completedGoals, goalData.failedGoals).some((goal) => goal.type === 'nether_prep'),
    hasMapMemory: Boolean(config.mapMemoryEnabled),
    needsFood: food < 14 || foodInfo.safeFoodCount < (config.minimumFoodCount || 6),
    needsWood: baseResourceCounts.logs < (config.minimumLogCount || 16),
    needsStone: baseResourceCounts.cobblestone < (config.minimumCobblestoneCount || 32),
    needsCoal: baseResourceCounts.coal < (config.minimumCoalCount || 8),
    needsTorches: itemCount(bot, ['torch']) < (config.minimumTorchCount || 8),
    needsTools: !miningToolInfo.bestPickaxe || !findBestTool(bot, 'oak_log'),
    needsArmor: armorStatus.missing.length > 0 && armorStatus.armorScore < 4,
    needsShield: !combatGear.hasShield,
    needsStorage: (memory.get().knownStorageChests || []).length === 0,
    needsShelter: !(memory.get().baseBuildHistory || []).some((entry) => /shelter/i.test(entry.type || entry.message || '')),
    needsFarm: (memory.get().knownFarms || []).length === 0,
    needsMiningSupplies: !miningToolInfo.bestPickaxe || itemCount(bot, ['torch']) < (config.minTorchCountForMining || 8) || food < (config.minFoodForMining || 14),
    needsBaseLighting: homeStatus.exists && config.homeLightingEnabled && nearbyTorches.length < 4,
    needsSafety: hostileMobs.length > 0 || lavaNearby || fireNearby || (nightTime && !config.allowNightExploration),
    needsOwnerApproval: Boolean(activeGoal?.requiresConfirmation || nextGoalStep?.requiresConfirmation),
    lowHealth: health <= 8,
    criticalHealth: health <= 4,
    hostileNearby: hostileMobs.length > 0,
    lavaNearby,
    fireNearby,
    fallRisk: (scan.dangers || []).some((danger) => danger.dangerType === 'fall'),
    tooFarFromHome: typeof homeBase.distanceFromHome(bot, memory) === 'number' && homeBase.distanceFromHome(bot, memory) > (config.maxGoalDistanceFromHome || 128),
    inventoryFull: (bot.inventory?.slots?.slice(9, 45).filter((slot) => !slot).length ?? 36) <= 2,
    toolDurabilityLow: lowDurabilityTools(bot).length > 0,
    nightUnsafe: nightTime && !config.allowNightExploration,
    currentTaskUnsafe: Boolean(hostileMobs.length > 0 || lavaNearby || fireNearby),
    bestPickaxe: findBestTool(bot, 'stone')?.name || null,
    bestAxe: findBestTool(bot, 'oak_log')?.name || null,
    bestWeapon: findBestWeapon(bot)?.name || null,
    lowDurabilityTools: lowDurabilityTools(bot),
    inventory: inventorySummary(bot),
    logCount: itemCount(bot, usefulBlockNames.filter((name) => name.endsWith('_log'))),
    nearbyPlayers: players.map(({ entity, ...rest }) => rest),
    nearbyFriendlyPlayers: friendlyPlayers.map(({ entity, ...rest }) => rest),
    ownerPosition: owner?.position ?? null,
    ownerDistance,
    nearbyHostileMobs: hostileMobs.map(({ entity, ...rest }) => rest),
    nearbyPassiveMobs: passiveMobs.map(({ entity, ...rest }) => rest),
    nearbyUsefulBlocks: usefulBlocks.map(({ block, ...rest }) => rest),
    raw: { ownerEntity: owner?.entity || null, hostileMobs, usefulBlocks },
    currentTask: taskQueue.getCurrentTask(),
    memory: memory.get()
  };

  state.dangerFlags = {
    lowHealth: health <= 8,
    lowFood: food <= 8,
    nightTime,
    hostileNearby: hostileMobs.length > 0,
    lavaNearby,
    fireNearby,
    tooFarFromOwner: typeof ownerDistance === 'number' && ownerDistance > config.maxAutonomyDistanceFromOwner,
    stuckLikely: memory.get().stuckCounter >= 3
  };

  return state;
}

export { hostileMobNames, usefulBlockNames };
