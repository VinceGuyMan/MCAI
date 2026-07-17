/**
 * Action runtime (createActions).
 * Tier-0/1 systems are statically imported.
 * Tier-2 systems are resolved via attachLazyTier2 (systems/* only when enabled).
 */
import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as crafting from '../crafting.js';
import * as armor from '../armor.js';
import * as food from '../food.js';
import * as inventory from '../inventory.js';
import * as placement from '../placement.js';
import * as lighting from '../lighting.js';
import * as homeBase from '../homeBase.js';
import * as storage from '../storage.js';
import * as builder from '../builder.js';
import * as resourceRuns from '../resourceRuns.js';
import * as baseMaintenance from '../baseMaintenance.js';
import * as animalCare from '../animalCare.js';
import * as animalPens from '../animalPens.js';
import * as farmStorage from '../farmStorage.js';
import * as farming from '../farming.js';
import * as mining from '../mining.js';
import * as mapMemoryStore from '../mapMemory.js';
import * as worldScanner from '../worldScanner.js';
import * as waypointNavigator from '../waypointNavigator.js';
import * as routeMemory from '../routeMemory.js';
import * as exploration from '../exploration.js';
import * as biomeMemory from '../biomeMemory.js';
import * as goalsStore from '../goals.js';
import * as goalTemplates from '../goalTemplates.js';
import * as goalValidator from '../goalValidator.js';
import * as goalExecutor from '../goalExecutor.js';
import * as progressTracker from '../progressTracker.js';
import * as advisor from '../advisor.js';
import * as plannerState from '../plannerState.js';
import * as planReview from '../planReview.js';
import * as strategicPlanner from '../strategicPlanner.js';
import * as smelting from '../smelting.js';
import * as pluginBridge from '../../bridge/pluginBridge.js';
import * as bridgeClient from '../../bridge/bridgeClient.js';
import * as pluginStatus from '../pluginStatus.js';
import * as pluginWrappers from '../pluginWrappers.js';
import * as conversationMemory from '../conversationMemory.js';
import * as personality from '../personality.js';
import {
  generateSkillSummary,
  getSkill,
  getSkills,
  listRiskySkills,
  listSkillsByCategory,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../skillRegistry.js';
import { getRecentSkillRuns, getSkillEvidenceHistory, getSkillStats, listSkillStats, loadSkillMemory, summarizeSkillEvidence } from '../skillMemory.js';
import * as skillRunner from '../skillRunner.js';
import { getEvidenceDefinition, listEvidenceDefinitions } from '../progressEvidence.js';
import { isCancelledError } from '../cancellation.js';
import { rejectAction, validateActionRequest } from '../actionGate.js';
import { clearAllConfirmations } from '../confirmationManager.js';
import { generateHelpText } from '../commandRegistry.js';
import {
  clearPendingNaturalIntent,
  getLastNaturalCommandRoute,
  getPendingNaturalIntent,
  listNaturalExamples,
  routeNaturalCommand
} from '../naturalCommandRouter.js';
import * as commandLearningMemory from '../commandLearningMemory.js';
import * as selfCorrection from '../selfCorrection.js';
import * as competencyTracker from '../competencyTracker.js';
import * as sessionRecorder from '../sessionRecorder.js';
import * as idleAutonomy from '../idleAutonomy.js';
import * as idleMemory from '../idleMemory.js';
import * as competentCore from '../competentCore.js';
import * as thinCore from '../thinCore.js';
import { routeCoreIntent } from '../coreIntentRouter.js';
import {
  normalizeActionCount,
  adaptActionArguments,
  actionEvidenceMap,
  contextAwareActions,
  thinResultActions,
  logNames,
  foodNames,
  toolPreference,
  toolTypeAliases,
  toolMaterialAliases,
  toolMaterialRanks,
  normalizeToolRequest,
  itemDurabilityLeft,
  toolCandidates,
  bestToolItem,
  wait,
  posText,
  distance
} from './shared.js';
import { attachLazyTier2 } from './lazyTier2.js';
import { createRuntimeContext } from './domains/runtimeContext.js';
import { createThinHandlers } from './domains/thin.js';
import { createMovementHandlers } from './domains/movement.js';
import { createSurvivalHandlers } from './domains/survival.js';
import { createMapHelpers } from './domains/mapHelpers.js';
import { createFarmingHandlers } from './domains/farming.js';
import { createMiningHandlers } from './domains/mining.js';
import { createExplorationHandlers } from './domains/exploration.js';
import { createDialogueHandlers } from './domains/dialogue.js';
import { createBaseHandlers } from './domains/base.js';
import { createGearHandlers } from './domains/gear.js';
import { createVillagerHandlers } from './domains/villagers.js';
import { createBlueprintHandlers } from './domains/blueprints.js';
import { createBridgeHandlers } from './domains/bridge.js';
import { createNetherHandlers } from './domains/nether.js';
import { createCombatHandlers } from './domains/combat.js';
import { createPlanningHandlers } from './domains/planning.js';
import { createSkillsHandlers } from './domains/skills.js';
import { createMetaHandlers } from './domains/meta.js';
import { applyStarterKit as applyStarterKitCore } from '../starterKit.js';

const { goals, Movements } = pathfinderPkg;
const { GoalNear, GoalFollow } = goals;

export async function createActions(bot, config, deps) {
  // Lazy Tier-2: only import systems/* when the matching config flag is true (gear loads on demand).
  const tier2 = await attachLazyTier2(config);
  const {
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory,
    brewing, gearScore, enchanting, anvilSystem, potionSystem, gearUpgradeSystem, gearMemory,
    villagerEconomy, villagerMemory, blueprintSystem,
    curriculumExecutor
  } = tier2;

  const { memory, taskQueue, safety, perception, cancellation } = deps;
  bot.mcaiConfig = config;
  bot.mcaiMemory = memory;

  // Shared runtime (movement, chat, cancel) + thin + movement domains
  let api = null;
  const runtime = createRuntimeContext({ bot, config, memory, safety, cancellation, Movements });
  const {
    state,
    setupMovements,
    say,
    ownerPlayer,
    ownerEntity,
    shouldSuppressOwnerFacingChat,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    isExpectedPathInterrupt,
    ownerDistance,
    waitUntilNearOwner,
    resetCancellation,
    clearPendingOwnerDecisions,
    stopMotion
  } = runtime;

  const thinHandlers = createThinHandlers({
    bot,
    config,
    memory,
    say,
    perception,
    cancellation,
    taskQueue,
    safety,
    getApi: () => api
  });
  const {
    thinActionContext,
    runThinAction,
    thinStatusAction,
    thinStopAction,
    thinComeToOwnerAction,
    thinFollowOwnerAction,
    thinStayAction,
    thinCollectResourceAction,
    thinResumeLastCollectAction,
    thinEatIfHungryAction,
    thinEquipToolForAction,
    thinEquipArmorAction,
    thinCraftItemAction,
    thinStoreItemsAction,
    thinReturnHomeAction,
    thinRememberHomeAction,
    thinMissingRequirementsAction
  } = thinHandlers;

  const {
    stop,
    status,
    comeToOwner,
    followOwner,
    stay,
    lookAtOwner
  } = createMovementHandlers({
    bot,
    config,
    memory,
    taskQueue,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    ownerDistance,
    waitUntilNearOwner,
    throwIfCancelled,
    isExpectedPathInterrupt,
    stopMotion,
    clearPendingOwnerDecisions,
    posText,
    GoalFollow,
    curriculumExecutor,
    blueprintSystem,
    thinStatusAction,
    thinComeToOwnerAction,
    thinFollowOwnerAction,
    thinStayAction
  });

  // Assigned when base domain is created (resource runs live there).
  let resourceRunAction = async () => ({ ok: false, message: 'resource run not ready' });

  const survival = createSurvivalHandlers({
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    comeToOwner,
    thinCollectResourceAction,
    thinEquipArmorAction,
    GoalNear,
    getResourceRunAction: () => resourceRunAction
  });
  const {
    findNearestTree,
    equipBestTool,
    equipToolAction,
    digNearestSafeBlock,
    collectNearbyDrops,
    checkWoodGoal,
    gatherWood,
    reportCraftResult,
    craftItemAction,
    craftGenericToolAction,
    craftPlanks,
    craftSticks,
    craftCraftingTable,
    placeCraftingTable,
    craftWoodenPickaxe,
    craftStonePickaxe,
    craftWoodenAxe,
    craftTorches,
    craftLighting,
    craftStorage,
    craftShelterSupplies,
    craftUtilityItems,
    craftTravelItems,
    craftBuildingBlocks,
    craftSurvivalKit,
    craftingStatusAction,
    canCraftItemAction,
    confirmCraftItem,
    craftBasicTools,
    craftStoneTools,
    craftIronTools,
    armorStatus,
    equipBestArmor,
    craftBestAffordableArmor,
    craftIronArmor,
    craftLeatherArmor,
    craftDiamondArmorConfirmed,
    ensureArmoredForSurvival,
    mineStone,
    fleeDanger,
    foodStatus,
    eatIfHungry,
    findFood,
    getFood,
    makeFood,
    cookFood,
    craftFood,
    huntPassiveFood,
    fishForFood,
    gatherPlantFood,
    handleFoodSurvival,
    stayNearFriendlyPlayers,
    surviveTick,
    taskStatusText,
    inventoryStatus,
    countInventory,
    toolStatus
  } = survival;

  const dialogueHandlers = createDialogueHandlers({
    bot,
    config,
    memory,
    say
  });
  const {
    answerChat,
    dialogueStatus,
    setTalkMode,
    setBanterMode,
    personalityStatus,
    conversationMemoryStatus,
    rememberConversationFactAction,
    forgetConversationFactAction,
    clearConversationMemoryConfirmed,
    answerDialogue,
    askClarification
  } = dialogueHandlers;

  function resourceOptions(extra = {}) {
    return {
      config,
      actions: api,
      perception,
      shouldStop: isCancelled,
      throwIfCancelled,
      ownerUsername: config.ownerUsername,
      ...extra
    };
  }

  let sayPlanning = (message, options = {}) => {
    if (!options?.silent) say(message, true);
  };

  const {
    currentDimension,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint
  } = createMapHelpers({ bot, config });

  const farmingHandlers = createFarmingHandlers({
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    stop
  });
  const {
    farmingStatusAction,
    createFarmAction,
    maintainFarmAction,
    harvestCropsAction,
    replantCropsAction,
    plantCropAction,
    animalPenStatusAction,
    createAnimalPenAction,
    lureAnimalToPenAction,
    breedAnimalsAction,
    feedAnimalsAction,
    collectEggsAction,
    shearSheepAction,
    milkCowAction,
    farmStorageStatusAction,
    storeFarmItemsAction,
    stopFarmingAction,
    stopAnimalTaskAction
  } = farmingHandlers;

  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    get sayPlanning() {
      return sayPlanning;
    }
  });
  const {
    miningStatusAction,
    smeltItemAction,
    smeltIronAction,
    smeltCharcoalAction,
    mineCoalAction,
    mineIronAction
  } = miningHandlers;

  const explorationHandlers = createExplorationHandlers({
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint,
    perception,
    safety,
    stop
  });
  const {
    mapStatusAction,
    explorationStatusAction,
    scanAreaAction,
    rememberLocationAction,
    forgetLocationAction,
    confirmForgetWaypointAction,
    listKnownPlacesAction,
    waypointStatusAction,
    goToWaypointAction,
    returnToOwnerAction,
    scoutDirectionAction,
    exploreAroundHomeAction,
    exploreAroundOwnerAction,
    returnFromExplorationAction,
    stopExplorationAction,
    reportExplorationResultsAction,
    recordRouteAction,
    stopRouteRecordingAction,
    followRouteAction,
    routeStatusAction,
    knownBiomesAction,
    knownResourcesAction,
    knownDangerZonesAction,
    confirmExplorationAction
  } = explorationHandlers;

  const baseHandlers = createBaseHandlers({
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    throwIfCancelled,
    isCancelled,
    stopMotion,
    resourceOptions,
    syncWaypoint,
    thinRememberHomeAction,
    thinReturnHomeAction,
    thinCollectResourceAction,
    thinStoreItemsAction,
    GoalNear
  });
  const {
    collectDropsAction,
    dropItemAction,
    giveOwnerItem,
    stuckStatus,
    unstuck,
    deathStatus,
    goToDeathSpot,
    placeBlockAction,
    placeTorch,
    lightingStatusAction,
    findNearbyBed,
    bedStatus,
    nightStatus,
    sleepAction,
    setHomeAction,
    clearHomeAction,
    homeStatusAction,
    returnHomeAction,
    baseStatusAction,
    ensureHomeNearOwnerForCamp,
    buildCampAction,
    buildWorkstationAction,
    buildShelterAction,
    lightHomeAction,
    storageStatusAction,
    placeStorageChestAction,
    registerStorageChestAction,
    storeItemsAction,
    withdrawItemAction,
    bringItemToOwner,
    resourceStatusAction,
    baseMaintenanceAction,
    whatHomeNeeds
  } = baseHandlers;
  resourceRunAction = baseHandlers.resourceRunAction;

  const gearHandlers = createGearHandlers({
    bot, config, memory, say,
    gearUpgradeSystem, enchanting, anvilSystem, potionSystem, brewing, gearMemory
  });
  const { pendingGearConfirmation, sayGearResult, gearStatusAction, gearUpgradeStatusAction, suggestGearUpgradesAction, suggestNextGearUpgradeAction, createGearUpgradePlanAction, enchantStatusAction, enchantOptionsAction, enchantItemAction, enchantHeldItemAction, enchantBestCandidateAction, anvilStatusAction, repairItemAction, combineItemsAction, applyBookToItemAction, renameItemAction, potionStatusAction, usePotionAction, carryPotionLoadoutAction, brewingStatusAction, brewPotionAction, brewFireResistanceAction, upgradeReadinessAction, netherGearReadinessAction, confirmGearUpgradeAction } = gearHandlers;

  const villagerHandlers = createVillagerHandlers({
    bot, config, memory, say, villagerEconomy, villagerMemory
  });
  const { pendingTradeConfirmation, sayVillagerResult, villagerStatusAction, scanVillagersAction, villageStatusAction, knownVillagesAction, knownVillagersAction, rememberVillageAction, rememberVillagerAction, tradingStatusAction, inspectVillagerTradesAction, listKnownTradesAction, bestKnownTradesAction, economyStatusAction, suggestTradesAction, executeApprovedTradeAction, confirmTradeAction, tradeHistoryAction, valuableVillagersAction, markVillagerValuableAction, confirmVillagerMemoryAction, protectVillagerStatusAction, villageProtectionStatusAction } = villagerHandlers;

  const blueprintHandlers = createBlueprintHandlers({
    bot, config, memory, say, blueprintSystem
  });
  const { sayBlueprintResult, normalizeBlueprintQuery, blueprintStatusAction, listBlueprintsAction, blueprintPreviewAction, blueprintMaterialsAction, blueprintPlanAction, blueprintBuildApprovedAction, blueprintStartBuildAction, blueprintContinueBuildAction, blueprintPauseBuildAction, blueprintResumeBuildAction, blueprintCancelBuildAction, blueprintProgressAction, blueprintHistoryAction, schematicStatusAction, schematicImportStatusAction } = blueprintHandlers;

  const bridgeHandlers = createBridgeHandlers({
    bot, config, memory, say, cancellation
  });
  const { sayBridgeResult, bridgeStatusMessage, serverBridgeStatusAction, serverStatusAction, bridgeHealthAction, bridgeRecentEventsAction, bridgeRecentDeathsAction, bridgeRecentAdvancementsAction, bridgeRegionsAction, bridgeRegisterRegionAction, bridgeDeleteRegionAction, bridgeEmergencyStopAction, mineflayerPluginStatusAction, pluginWrapperStatusAction, pluginPathToOwnerAction, pluginFollowOwnerAction, pluginCollectBlocksAction, pluginEatSafelyAction } = bridgeHandlers;

  const netherHandlers = createNetherHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, posText,
    resourceOptions, loadMapMemory, saveMapMemory,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory, brewing
  });
  const { setPendingNetherConfirmation, getPendingNetherConfirmation, clearPendingNetherConfirmation, netherStatusAction, netherChecklistAction, prepareNetherAction, prepareNetherGearAction, prepareNetherFoodAction, prepareNetherBlocksAction, prepareNetherPortalSuppliesAction, equipNetherGearAction, portalStatusAction, findPortalAction, rememberPortalAction, buildPortalAction, lightPortalAction, enterNetherAction, safeNetherEntryAction, scanNetherAction, secureNetherPortalAction, returnFromNetherAction, netherMemoryStatusAction, stopNetherTaskAction, confirmNetherAction } = netherHandlers;

  const combatHandlers = createCombatHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, perception, safety, resourceOptions,
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    eatIfHungry, collectNearbyDrops
  });
  const { combatStatusAction, combatEquipmentStatusAction, threatScanAction, equipCombatGearAction, startSelfDefenseAction, defendOwnerAction, guardBaseAction, guardPositionAction, stopCombatAction, fleeThreatAction, engageHostileAction, combatRecoverAction, baseDefenseStatusAction, ownerDefenseStatusAction, combatTickAction } = combatHandlers;

  const planningHandlers = createPlanningHandlers({
    bot, config, memory, say, perception, taskQueue, throwIfCancelled, state
  });
  const {
    findGoal,
    goalListText,
    goalsStatusAction,
    explainGoalAction,
    nextGoalStepAction,
    saveValidatedGoal,
    createGoalFromTemplateAction,
    createGoalAction,
    startGoalAction,
    approveGoalAction,
    rejectGoalAction,
    pauseGoalAction,
    resumeGoalAction,
    cancelGoalAction,
    completeGoalAction,
    failGoalAction,
    archiveGoalAction,
    deleteGoalAction,
    confirmDeleteGoalAction,
    setGoalPriorityAction,
    executeNextGoalStepAction,
    confirmStepAction,
    skipStepAction,
    retryStepAction,
    suggestGoalsAction,
    plannerSuggestNextAction,
    plannerStatusAction,
    plannerPauseAction,
    plannerResumeAction
  } = planningHandlers;
  if (typeof planningHandlers.sayPlanning === 'function') {
    sayPlanning = planningHandlers.sayPlanning;
  }

  const skillsHandlers = createSkillsHandlers({
    bot, config, memory, say
  });
  const { categorySkillLine, skillsStatusAction, skillStatusAction, unimplementedSkillsAction, riskySkillsAction, skillAuditAction, normalizeSkillRunnerName, runSkillAction, activeSkillAction, skillRunnerStatusAction, cancelSkillAction, skillStatsAction, recentSkillsAction, evidenceStatusAction, skillEvidenceAction, recentEvidenceAction, evidenceDefinitionsAction, evidenceAuditAction, verifySkillAction } = skillsHandlers;

  const metaHandlers = createMetaHandlers({
    bot, config, memory, say, perception, getApi: () => api, cancellation
  });
  const { summarizeNaturalRoute, naturalRouterStatusAction, explainLastIntentAction, clearPendingIntentAction, naturalExamplesAction, naturalTestAction, competentCoreStatusAction, coreMacrosAction, runCoreMacroAction, coreRecoverAction, coreTestAction, naturalLearningStatusAction, forgetLearnedMappingAction, competencyStatusAction, reliableSkillsAction, shakySkillsAction, untestedSkillsAction, sessionEventsAction, interactionModeAction, setInteractionModeAction, learnCommandsAction, idleStatusAction, idleOnAction, idleOffAction, quietIdleAction, chattyIdleAction, suppressIdleSuggestionAction, resetIdleMemoryRequestAction, confirmResetIdleMemoryAction, testPlanAction, testReportAction } = metaHandlers;

  async function brainStatus() {
    const mem = memory.get();
    const cancel = cancellation?.getState?.() || {};
    const activeGoal = goalsStore.getActiveGoal();
    say(`Brain: ${config.autonomyMode}, auto ${config.autonomyEnabled ? 'on' : 'off'}, task ${taskQueue.getCurrentTask()?.name || 'none'}, goal ${activeGoal?.name || 'none'}, planner ${mem.plannerPausedReason ? `paused ${mem.plannerPausedReason}` : 'ready'}, cancelled ${cancel.cancelled ? cancel.reason : 'no'}, Ollama cooldown ${Math.max(0, config.ollamaDecisionCooldownMs - (Date.now() - (mem.lastOllamaDecisionAt || 0)))}ms.`, true);
  }

  async function taskStatus() {
    say(taskStatusText(), true);
  }

  async function safetyStatus() {
    const state = perception();
    const flags = Object.entries(state.dangerFlags).filter(([, value]) => value).map(([key]) => key);
    say(`Safety: ${flags.length ? flags.join(', ') : 'clear'}.`, true);
  }

  async function memoryStatus() {
    const mem = memory.get();
    const home = mem.homeBasePosition ? `${mem.homeBasePosition.x},${mem.homeBasePosition.y},${mem.homeBasePosition.z}` : 'none';
    say(`Memory: home ${home}, storage ${mem.knownStorageChests?.length || 0}, wood ${mem.knownWoodLocations?.length || 0}, food ${mem.knownFoodLocations?.length || 0}, deaths ${mem.deathCount || 0}, last action ${mem.lastAction || 'none'}, failures ${mem.recentFailures?.length || 0}.`, true);
  }

  async function whereBot() {
    say(`I am at ${posText(perception().position)}.`, true);
  }

  async function whereOwner() {
    const owner = ownerEntity();
    say(owner ? `You are at ${posText(owner.position)}.` : 'I cannot see you right now.', true);
  }

  async function whoNearby() {
    const state = perception();
    const players = state.nearbyPlayers.map((player) => `${player.username} ${player.distance}b`).join(', ') || 'no players visible';
    const hostiles = state.nearbyHostileMobs.slice(0, 4).map((mob) => `${mob.name} ${mob.distance}b`).join(', ') || 'no hostiles nearby';
    say(`Nearby: ${players}. Hostiles: ${hostiles}.`, true);
  }

  async function help() {
    say(`Commands: ${generateHelpText()}`, true);
  }

  async function applyStarterKitAction(args = {}) {
    const force = args === true || args?.force === true;
    const result = await applyStarterKitCore(bot, memory, config, { force });
    if (result?.message) say(result.message, true);
    return result;
  }

  async function returnHomeAndDepositHandler() {
    throwIfCancelled();
    const result = await resourceRuns.returnAndDeposit(bot, memory, resourceOptions());
    const history = memory.get().resourceRunHistory || [];
    memory.update({
      activeResourceRun: null,
      resourceRunHistory: [
        { resourceType: 'wood', ok: true, message: result.message, at: Date.now() },
        ...history
      ].slice(0, 20)
    });
    say('Wood run finished. I returned and stored extras if storage was available.', true);
    return { done: true };
  }

  const handlers = {
    findNearestTree,
    digNearestSafeBlock,
    collectNearbyDrops,
    checkWoodGoal,
    returnNearOwner: comeToOwner,
    checkHunger: async () => ({ done: true }),
    checkInventoryFood: async () => ({ done: true }),
    eatIfHungryAndFoodExists: async () => {
      await eatIfHungry();
      return { done: true };
    },
    cookRawFoodIfPossible: async () => {
      const status = food.foodStatus(bot, config);
      if (status.rawFoodCount > 0) await food.cookFood(bot, { config, shouldStop: isCancelled });
      return { done: true };
    },
    findNearbyFoodSource: async () => {
      const sources = food.findNearbyFoodSources(bot, config);
      if (sources.nearestFoodSource?.position) memory.rememberLocation('knownFoodLocations', sources.nearestFoodSource.position);
      return { done: true };
    },
    gatherPlantFoodIfSafe: async () => {
      throwIfCancelled();
      const gathered = await food.gatherPlantFood(bot, { config, shouldStop: isCancelled });
      if (gathered.ok) {
        memory.update({ lastFoodSearchAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
      }
      return { done: true };
    },
    huntPassiveAnimalIfNeeded: async () => {
      const status = food.foodStatus(bot, config);
      const target = config.minimumFoodCount || 6;
      if (food.countFoodInventory(bot) < target && (config.allowPassiveHunting || status.criticalFood)) {
        const hunted = await food.huntPassiveFoodAnimal(bot, { config, shouldStop: isCancelled, maxKills: status.criticalFood ? 4 : 3 });
        if (hunted.ok) memory.update({ lastFoodSearchAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
      }
      return { done: true };
    },
    collectDrops: async () => {
      throwIfCancelled();
      await food.collectNearbyDrops(bot);
      return { done: true };
    },
    reportFoodResult: async () => {
      const status = food.foodStatus(bot, config);
      memory.update({ foodTaskActive: false, lastFoodStatus: status });
      if (status.hasFood || status.rawFoodCount > 0) {
        say(`Food task done. Hunger ${status.food}/20. Best food: ${status.bestFood || 'none'}.`, true);
        return { done: true };
      }
      say(`I could not find safe food nearby. Hunger ${status.food}/20. Try moving near animals, crops, berries, water with fish, or stored food, then say "tj gather food" again.`, true);
      return { failed: true, reason: 'no safe food found nearby' };
    },
    returnHomeAndDeposit: returnHomeAndDepositHandler,
    findOrPlaceFurnace: async () => ({ done: true }),
    findFuel: async () => ({ done: true }),
    putRawFoodInFurnace: async () => ({ done: true }),
    putFuelInFurnace: async () => ({ done: true }),
    waitForFoodOutput: async () => {
      await food.cookFood(bot, { config, shouldStop: isCancelled });
      return { done: true };
    },
    takeCookedFood: async () => ({ done: true }),
    chooseFarmSpot: async () => ({ done: true }),
    tillFarmSoil: async (task) => {
      const found = await farming.findOrCreateFarm(bot, memory, resourceOptions({ cropType: task.meta?.cropType || 'wheat' }));
      if (!found.ok) return { failed: true, reason: found.message };
      await farming.tillFarmSoil(bot, memory, found.farm, resourceOptions());
      return { done: true };
    },
    plantFarmCrop: async (task) => {
      await plantCropAction(task.meta?.cropType || 'wheat');
      return { done: true };
    },
    placeFarmTorches: async () => {
      await lighting.placeTorchNear(bot, { ownerUsername: config.ownerUsername, survivalMode: true }).catch(() => null);
      return { done: true };
    },
    registerFarm: async () => ({ done: true }),
    scanRegisteredFarm: async () => ({ done: true }),
    harvestMatureCrops: async () => {
      await harvestCropsAction();
      return { done: true };
    },
    replantFarmCrops: async () => {
      await replantCropsAction();
      return { done: true };
    },
    storeFarmOutput: async () => {
      await storeFarmItemsAction().catch(() => null);
      return { done: true };
    },
    reportFarmResult: async () => {
      say(farming.farmingStatusText(bot, memory), true);
      return { done: true };
    },
    choosePenSpot: async () => ({ done: true }),
    craftPenSupplies: async () => {
      await crafting.craftItem(bot, 'fence', 1, { direct: true, shouldStop: isCancelled }).catch(() => null);
      await crafting.craftItem(bot, 'fence gate', 1, { direct: true, shouldStop: isCancelled }).catch(() => null);
      return { done: true };
    },
    buildAnimalPen: async (task) => {
      await createAnimalPenAction(task.meta?.animalType || 'cow');
      return { done: true };
    },
    registerAnimalPen: async () => ({ done: true }),
    findAnimal: async () => ({ done: true }),
    equipAnimalFood: async (task) => {
      const equipped = await animalCare.equipAnimalFood(bot, task.meta?.animalType || 'cow');
      if (!equipped.ok) return { failed: true, reason: equipped.message };
      return { done: true };
    },
    openPenGate: async () => ({ done: true }),
    lureAnimalIntoPen: async (task) => {
      await lureAnimalToPenAction(task.meta?.animalType || 'cow');
      return { done: true };
    },
    closePenGate: async () => ({ done: true }),
    checkAnimalCount: async () => ({ done: true }),
    checkAnimalFood: async () => ({ done: true }),
    feedTwoAnimals: async (task) => {
      await breedAnimalsAction(task.meta?.animalType || 'cow');
      return { done: true };
    },
    reportAnimalResult: async () => {
      say(animalPens.animalPenStatusText(bot, memory), true);
      return { done: true };
    },
    prepareForCombat: async () => {
      await equipCombatGearAction();
      return { done: true };
    },
    defendSelf: async () => {
      await combat.combatTick(bot, memory, resourceOptions({ mode: 'self_defense' }));
      return { done: true };
    },
    defendOwner: async () => {
      await combat.combatTick(bot, memory, resourceOptions({ mode: 'defend_owner' }));
      return { done: true };
    },
    guardBase: async () => {
      await combat.combatTick(bot, memory, resourceOptions({ mode: 'guard_base' }));
      return { done: true };
    },
    engageThreat: async (task) => {
      await engageHostileAction(task.meta?.target || 'hostile', { emergency: task.meta?.emergency });
      return { done: true };
    },
    fleeThreat: async () => {
      await fleeThreatAction();
      return { done: true };
    },
    returnAfterCombat: async () => {
      await combatRecoverAction();
      return { done: true };
    },
    combatRecovery: async () => {
      await combatRecoverAction();
      return { done: true };
    }
  };

  function normalizeActionResult(actionName, output) {
    const defaultEvidence = actionEvidenceMap[actionName] || [`${actionName}_completed`];
    if (output && typeof output === 'object' && 'ok' in output) {
      if (thinResultActions.has(actionName)) {
        return {
          ok: Boolean(output.ok),
          message: output.message || output.reason || `${actionName} finished.`,
          reason: output.reason || undefined,
          evidence: output.evidence ?? {},
          data: output.data ?? {},
          error: output.error
        };
      }
      return {
        ok: Boolean(output.ok),
        message: output.message || output.reason || `${actionName} finished.`,
        reason: output.reason || '',
        evidence: Array.isArray(output.evidence) && output.evidence.length ? output.evidence : defaultEvidence,
        data: output.data ?? output.result ?? null
      };
    }
    if (typeof output === 'string') {
      return { ok: true, message: output, evidence: defaultEvidence, data: {} };
    }
    return {
      ok: true,
      message: `${actionName} completed.`,
      evidence: defaultEvidence,
      data: output ?? null
    };
  }

  async function executeAction(actionName, args = {}, context = {}) {
    const handler = api[actionName];
    if (typeof handler !== 'function') {
      return { ok: false, reason: `Unknown action: ${actionName}`, evidence: ['action_missing'] };
    }
    const validation = validateActionRequest(actionName, args, {
      ...context,
      actionApi: api,
      actions: api,
      bot,
      memory,
      config,
      cancellation
    });
    if (!validation.ok) return rejectAction(validation.reason || `Action ${actionName} was rejected.`, { evidence: validation.evidence || [] });
    try {
      let output;
      const positionalArgs = adaptActionArguments(actionName, args);
      if (positionalArgs) output = await handler(...positionalArgs);
      else if (contextAwareActions.has(actionName)) output = await handler(args || {}, context);
      else if (args && Object.keys(args).length) output = await handler(args, context);
      else output = await handler();
      return normalizeActionResult(actionName, output);
    } catch (error) {
      if (isCancelledError(error)) return { ok: false, reason: 'cancelled', evidence: ['action_cancelled'] };
      console.warn(`[actions] ${actionName} failed: ${error.message}`);
      return { ok: false, reason: error.message || `${actionName} failed`, evidence: ['action_failed'] };
    }
  }

  function hasAction(actionName) {
    return typeof api[actionName] === 'function';
  }

  function listActions() {
    return Object.keys(api).filter((key) => typeof api[key] === 'function').sort();
  }

  api = {
    setupMovements,
    resetCancellation,
    cancelAll: stop,
    isCancelled,
    throwIfCancelled,
    executeAction,
    hasAction,
    listActions,
    stop,
    status,
    comeToOwner,
    followOwner,
    stay,
    lookAtOwner,
    gatherWood,
    mineStone,
    inventoryStatus,
    countInventory,
    toolStatus,
    equipTool: equipToolAction,
    collectDropsAction,
    dropItem: dropItemAction,
    giveOwnerItem,
    stuckStatus,
    unstuck,
    deathStatus,
    goToDeathSpot,
    placeBlock: placeBlockAction,
    placeTorch,
    lightingStatus: lightingStatusAction,
    bedStatus,
    nightStatus,
    sleep: sleepAction,
    setHome: setHomeAction,
    clearHome: clearHomeAction,
    homeStatus: homeStatusAction,
    returnHome: returnHomeAction,
    baseStatus: baseStatusAction,
    buildCamp: buildCampAction,
    buildWorkstation: buildWorkstationAction,
    buildShelter: buildShelterAction,
    lightHome: lightHomeAction,
    storageStatus: storageStatusAction,
    placeStorageChest: placeStorageChestAction,
    registerStorageChest: registerStorageChestAction,
    storeItems: storeItemsAction,
    withdrawItem: withdrawItemAction,
    bringItemToOwner,
    resourceStatus: resourceStatusAction,
    resourceRunWood: (count = 16) => resourceRunAction('wood', count),
    resourceRunStone: (count = 32) => resourceRunAction('stone', count),
    resourceRunCoal: (count = 8) => resourceRunAction('coal', count),
    resourceRunIron: (count = 8) => resourceRunAction('iron', count),
    resourceRunFood: (count = 6) => resourceRunAction('food', count),
    baseMaintenance: baseMaintenanceAction,
    whatHomeNeeds,
    farmingStatus: farmingStatusAction,
    createFarm: createFarmAction,
    maintainFarm: maintainFarmAction,
    harvestCrops: harvestCropsAction,
    replantCrops: replantCropsAction,
    plantCrop: plantCropAction,
    animalPenStatus: animalPenStatusAction,
    createAnimalPen: createAnimalPenAction,
    lureAnimalToPen: lureAnimalToPenAction,
    breedAnimals: breedAnimalsAction,
    feedAnimals: feedAnimalsAction,
    collectEggs: collectEggsAction,
    shearSheep: shearSheepAction,
    milkCow: milkCowAction,
    farmStorageStatus: farmStorageStatusAction,
    storeFarmItems: storeFarmItemsAction,
    stopFarming: stopFarmingAction,
    stopAnimalTask: stopAnimalTaskAction,
    miningStatus: miningStatusAction,
    explorationStatus: explorationStatusAction,
    mapStatus: mapStatusAction,
    scanArea: scanAreaAction,
    rememberLocation: rememberLocationAction,
    forgetLocation: forgetLocationAction,
    confirmForgetWaypoint: confirmForgetWaypointAction,
    listKnownPlaces: listKnownPlacesAction,
    listWaypoints: listKnownPlacesAction,
    waypointStatus: waypointStatusAction,
    goToWaypoint: goToWaypointAction,
    returnToOwner: returnToOwnerAction,
    returnFromExploration: returnFromExplorationAction,
    scoutDirection: scoutDirectionAction,
    scoutNorth: (distance = null, options = {}) => scoutDirectionAction('north', distance, options),
    scoutSouth: (distance = null, options = {}) => scoutDirectionAction('south', distance, options),
    scoutEast: (distance = null, options = {}) => scoutDirectionAction('east', distance, options),
    scoutWest: (distance = null, options = {}) => scoutDirectionAction('west', distance, options),
    exploreAroundHome: exploreAroundHomeAction,
    exploreAroundOwner: exploreAroundOwnerAction,
    reportExplorationResults: reportExplorationResultsAction,
    recordRoute: recordRouteAction,
    stopRouteRecording: stopRouteRecordingAction,
    followRoute: followRouteAction,
    routeStatus: routeStatusAction,
    knownBiomes: knownBiomesAction,
    knownResources: knownResourcesAction,
    knownDangerZones: knownDangerZonesAction,
    stopExploration: stopExplorationAction,
    confirmExploration: confirmExplorationAction,
    combatStatus: combatStatusAction,
    combatEquipmentStatus: combatEquipmentStatusAction,
    threatScan: threatScanAction,
    startSelfDefense: startSelfDefenseAction,
    defendOwner: defendOwnerAction,
    guardBase: guardBaseAction,
    guardPosition: guardPositionAction,
    stopCombat: stopCombatAction,
    fleeThreat: fleeThreatAction,
    engageHostile: engageHostileAction,
    engageThreat: (target, options = {}) => combat.engageTarget(bot, memory, target, resourceOptions(options)),
    equipCombatGear: equipCombatGearAction,
    combatRecover: combatRecoverAction,
    combatTick: combatTickAction,
    baseDefenseStatus: baseDefenseStatusAction,
    ownerDefenseStatus: ownerDefenseStatusAction,
    goalsStatus: goalsStatusAction,
    listGoals: goalsStatusAction,
    createGoal: createGoalAction,
    createGoalFromTemplate: createGoalFromTemplateAction,
    suggestGoals: suggestGoalsAction,
    explainGoal: explainGoalAction,
    startGoal: startGoalAction,
    pauseGoal: pauseGoalAction,
    resumeGoal: resumeGoalAction,
    cancelGoal: cancelGoalAction,
    completeGoal: completeGoalAction,
    failGoal: failGoalAction,
    archiveGoal: archiveGoalAction,
    deleteGoal: deleteGoalAction,
    confirmDeleteGoal: confirmDeleteGoalAction,
    setGoalPriority: setGoalPriorityAction,
    nextGoalStep: nextGoalStepAction,
    executeNextGoalStep: executeNextGoalStepAction,
    plannerStatus: plannerStatusAction,
    plannerPause: plannerPauseAction,
    plannerResume: plannerResumeAction,
    plannerSuggestNext: plannerSuggestNextAction,
    approveGoal: approveGoalAction,
    rejectGoal: rejectGoalAction,
    confirmStep: confirmStepAction,
    skipGoalStep: skipStepAction,
    retryGoalStep: retryStepAction,
    smeltItem: smeltItemAction,
    smeltIron: smeltIronAction,
    smeltCharcoal: smeltCharcoalAction,
    netherStatus: netherStatusAction,
    netherChecklist: netherChecklistAction,
    prepareNether: prepareNetherAction,
    prepareNetherGear: prepareNetherGearAction,
    prepareNetherFood: prepareNetherFoodAction,
    prepareNetherBlocks: prepareNetherBlocksAction,
    prepareNetherPortalSupplies: prepareNetherPortalSuppliesAction,
    equipNetherGear: equipNetherGearAction,
    portalStatus: portalStatusAction,
    findPortal: findPortalAction,
    buildPortal: buildPortalAction,
    lightPortal: lightPortalAction,
    rememberPortal: rememberPortalAction,
    enterNether: enterNetherAction,
    safeNetherEntry: safeNetherEntryAction,
    scanNether: scanNetherAction,
    secureNetherPortal: secureNetherPortalAction,
    returnFromNether: returnFromNetherAction,
    netherMemoryStatus: netherMemoryStatusAction,
    stopNetherTask: stopNetherTaskAction,
    confirmNether: confirmNetherAction,
    mineCoal: mineCoalAction,
    mineIron: mineIronAction,
    brainStatus,
    taskStatus,
    safetyStatus,
    memoryStatus,
    skillsStatus: skillsStatusAction,
    listSkills: skillsStatusAction,
    skillStatus: skillStatusAction,
    skillAudit: skillAuditAction,
    unimplementedSkills: unimplementedSkillsAction,
    riskySkills: riskySkillsAction,
    runSkill: runSkillAction,
    activeSkill: activeSkillAction,
    skillRunnerStatus: skillRunnerStatusAction,
    cancelSkill: cancelSkillAction,
    skillStats: skillStatsAction,
    recentSkills: recentSkillsAction,
    evidenceStatus: evidenceStatusAction,
    skillEvidence: skillEvidenceAction,
    recentEvidence: recentEvidenceAction,
    evidenceDefinitions: evidenceDefinitionsAction,
    evidenceAudit: evidenceAuditAction,
    verifySkill: verifySkillAction,
    gearStatus: gearStatusAction,
    gearUpgradeStatus: gearUpgradeStatusAction,
    suggestGearUpgrades: suggestGearUpgradesAction,
    suggestNextGearUpgrade: suggestNextGearUpgradeAction,
    createGearUpgradePlan: createGearUpgradePlanAction,
    enchantStatus: enchantStatusAction,
    enchantOptions: enchantOptionsAction,
    enchantItem: enchantItemAction,
    enchantHeldItem: enchantHeldItemAction,
    enchantBestCandidate: enchantBestCandidateAction,
    anvilStatus: anvilStatusAction,
    repairItem: repairItemAction,
    combineItems: combineItemsAction,
    applyBookToItem: applyBookToItemAction,
    renameItem: renameItemAction,
    potionStatus: potionStatusAction,
    usePotion: usePotionAction,
    carryPotionLoadout: carryPotionLoadoutAction,
    brewingStatus: brewingStatusAction,
    brewPotion: brewPotionAction,
    brewFireResistance: brewFireResistanceAction,
    upgradeReadiness: upgradeReadinessAction,
    netherGearReadiness: netherGearReadinessAction,
    confirmGearUpgrade: confirmGearUpgradeAction,
    villagerStatus: villagerStatusAction,
    scanVillagers: scanVillagersAction,
    villageStatus: villageStatusAction,
    knownVillages: knownVillagesAction,
    knownVillagers: knownVillagersAction,
    rememberVillage: rememberVillageAction,
    rememberVillager: rememberVillagerAction,
    tradingStatus: tradingStatusAction,
    inspectVillagerTrades: inspectVillagerTradesAction,
    listKnownTrades: listKnownTradesAction,
    bestKnownTrades: bestKnownTradesAction,
    economyStatus: economyStatusAction,
    suggestTrades: suggestTradesAction,
    executeApprovedTrade: executeApprovedTradeAction,
    confirmTrade: confirmTradeAction,
    tradeHistory: tradeHistoryAction,
    valuableVillagers: valuableVillagersAction,
    markVillagerValuable: markVillagerValuableAction,
    confirmVillagerMemory: confirmVillagerMemoryAction,
    protectVillagerStatus: protectVillagerStatusAction,
    villageProtectionStatus: villageProtectionStatusAction,
    blueprintStatus: blueprintStatusAction,
    listBlueprints: listBlueprintsAction,
    blueprintPreview: blueprintPreviewAction,
    blueprintMaterials: blueprintMaterialsAction,
    blueprintPlan: blueprintPlanAction,
    blueprintBuildApproved: blueprintBuildApprovedAction,
    blueprintStartBuild: blueprintStartBuildAction,
    blueprintContinueBuild: blueprintContinueBuildAction,
    blueprintPauseBuild: blueprintPauseBuildAction,
    blueprintResumeBuild: blueprintResumeBuildAction,
    blueprintCancelBuild: blueprintCancelBuildAction,
    blueprintProgress: blueprintProgressAction,
    blueprintHistory: blueprintHistoryAction,
    schematicStatus: schematicStatusAction,
    schematicImportStatus: schematicImportStatusAction,
    serverBridgeStatus: serverBridgeStatusAction,
    serverStatus: serverStatusAction,
    bridgeHealth: bridgeHealthAction,
    bridgeRecentEvents: bridgeRecentEventsAction,
    bridgeRecentDeaths: bridgeRecentDeathsAction,
    bridgeRecentAdvancements: bridgeRecentAdvancementsAction,
    bridgeRegions: bridgeRegionsAction,
    bridgeRegisterRegion: bridgeRegisterRegionAction,
    bridgeDeleteRegion: bridgeDeleteRegionAction,
    bridgeEmergencyStop: bridgeEmergencyStopAction,
    mineflayerPluginStatus: mineflayerPluginStatusAction,
    pluginWrapperStatus: pluginWrapperStatusAction,
    pluginPathToOwner: pluginPathToOwnerAction,
    pluginFollowOwner: pluginFollowOwnerAction,
    pluginCollectBlocks: pluginCollectBlocksAction,
    pluginEatSafely: pluginEatSafelyAction,
    applyStarterKit: applyStarterKitAction,
    restockKit: () => applyStarterKitAction({ force: true }),
    thinStatus: thinStatusAction,
    thinStop: thinStopAction,
    thinComeToOwner: thinComeToOwnerAction,
    thinFollowOwner: thinFollowOwnerAction,
    thinStay: thinStayAction,
    collectResource: thinCollectResourceAction,
    thinCollectResource: thinCollectResourceAction,
    thinEatIfHungry: thinEatIfHungryAction,
    thinEquipToolFor: thinEquipToolForAction,
    thinEquipArmor: thinEquipArmorAction,
    thinCraftItem: thinCraftItemAction,
    thinStoreItems: thinStoreItemsAction,
    thinReturnHome: thinReturnHomeAction,
    thinRememberHome: thinRememberHomeAction,
    thinMissingRequirements: thinMissingRequirementsAction,
    naturalRouterStatus: naturalRouterStatusAction,
    explainLastIntent: explainLastIntentAction,
    clearPendingIntent: clearPendingIntentAction,
    naturalExamples: naturalExamplesAction,
    naturalTest: naturalTestAction,
    competentCoreStatus: competentCoreStatusAction,
    coreMacros: coreMacrosAction,
    runCoreMacro: runCoreMacroAction,
    coreRecover: coreRecoverAction,
    coreTest: coreTestAction,
    naturalLearningStatus: naturalLearningStatusAction,
    forgetLearnedMapping: forgetLearnedMappingAction,
    competencyStatus: competencyStatusAction,
    reliableSkills: reliableSkillsAction,
    shakySkills: shakySkillsAction,
    untestedSkills: untestedSkillsAction,
    sessionEvents: sessionEventsAction,
    interactionMode: interactionModeAction,
    setInteractionMode: setInteractionModeAction,
    carefulMode: () => setInteractionModeAction('careful'),
    helperMode: () => setInteractionModeAction('helper'),
    companionMode: () => setInteractionModeAction('companion'),
    quietMode: () => setInteractionModeAction('quiet'),
    explainMode: () => setInteractionModeAction('explain'),
    testMode: () => setInteractionModeAction('test'),
    learnCommands: learnCommandsAction,
    learnCommandsOn: () => learnCommandsAction(true),
    learnCommandsOff: () => learnCommandsAction(false),
    idleStatus: idleStatusAction,
    idleOn: idleOnAction,
    idleOff: idleOffAction,
    quietIdle: quietIdleAction,
    chattyIdle: chattyIdleAction,
    suppressIdleSuggestion: suppressIdleSuggestionAction,
    resetIdleMemoryRequest: resetIdleMemoryRequestAction,
    confirmResetIdleMemory: confirmResetIdleMemoryAction,
    testPlan: testPlanAction,
    testReport: testReportAction,
    dialogueStatus,
    setTalkMode,
    setBanterMode,
    personalityStatus,
    conversationMemoryStatus,
    rememberConversationFact: rememberConversationFactAction,
    forgetConversationFact: forgetConversationFactAction,
    clearConversationMemoryConfirmed,
    answerDialogue,
    askClarification,
    whereBot,
    whereOwner,
    whoNearby,
    help,
    findNearestTree,
    digNearestSafeBlock,
    collectNearbyDrops,
    equipBestTool,
    eatIfHungry,
    foodStatus,
    findFood,
    getFood,
    makeFood,
    cookFood,
    craftFood,
    huntPassiveFood,
    fishForFood,
    gatherPlantFood,
    handleFoodSurvival,
    food_status: foodStatus,
    eat_if_hungry: config.thinCoreEnabled ? thinEatIfHungryAction : eatIfHungry,
    find_food: findFood,
    get_food: getFood,
    make_food: makeFood,
    cook_food: cookFood,
    craft_food: craftFood,
    hunt_passive_food: huntPassiveFood,
    fish_for_food: fishForFood,
    gather_plant_food: gatherPlantFood,
    fleeDanger,
    stayNearFriendlyPlayers,
    answerChat,
    dialogue_status: dialogueStatus,
    skills_status: skillsStatusAction,
    list_skills: skillsStatusAction,
    skill_status: skillStatusAction,
    skill_audit: skillAuditAction,
    unimplemented_skills: unimplementedSkillsAction,
    risky_skills: riskySkillsAction,
    run_skill: runSkillAction,
    active_skill: activeSkillAction,
    skill_runner_status: skillRunnerStatusAction,
    cancel_skill: cancelSkillAction,
    skill_stats: skillStatsAction,
    recent_skills: recentSkillsAction,
    evidence_status: evidenceStatusAction,
    skill_evidence: skillEvidenceAction,
    recent_evidence: recentEvidenceAction,
    evidence_definitions: evidenceDefinitionsAction,
    evidence_audit: evidenceAuditAction,
    verify_skill: verifySkillAction,
    natural_router_status: naturalRouterStatusAction,
    explain_last_intent: explainLastIntentAction,
    clear_pending_intent: clearPendingIntentAction,
    natural_examples: naturalExamplesAction,
    natural_test: naturalTestAction,
    competent_core_status: competentCoreStatusAction,
    core_macros: coreMacrosAction,
    run_core_macro: runCoreMacroAction,
    core_recover: coreRecoverAction,
    core_test: coreTestAction,
    natural_learning_status: naturalLearningStatusAction,
    forget_learned_mapping: forgetLearnedMappingAction,
    competency_status: competencyStatusAction,
    reliable_skills: reliableSkillsAction,
    shaky_skills: shakySkillsAction,
    untested_skills: untestedSkillsAction,
    session_events: sessionEventsAction,
    interaction_mode: interactionModeAction,
    set_interaction_mode: setInteractionModeAction,
    careful_mode: () => setInteractionModeAction('careful'),
    helper_mode: () => setInteractionModeAction('helper'),
    companion_mode: () => setInteractionModeAction('companion'),
    quiet_mode: () => setInteractionModeAction('quiet'),
    explain_mode: () => setInteractionModeAction('explain'),
    test_mode: () => setInteractionModeAction('test'),
    learn_commands: learnCommandsAction,
    learn_commands_on: () => learnCommandsAction(true),
    learn_commands_off: () => learnCommandsAction(false),
    idle_status: idleStatusAction,
    idle_on: idleOnAction,
    idle_off: idleOffAction,
    quiet_idle: quietIdleAction,
    chatty_idle: chattyIdleAction,
    suppress_idle_suggestion: suppressIdleSuggestionAction,
    reset_idle_memory_request: resetIdleMemoryRequestAction,
    confirm_reset_idle_memory: confirmResetIdleMemoryAction,
    test_plan: testPlanAction,
    test_report: testReportAction,
    gear_status: gearStatusAction,
    gear_upgrade_status: gearUpgradeStatusAction,
    suggest_gear_upgrades: suggestGearUpgradesAction,
    suggest_next_gear_upgrade: suggestNextGearUpgradeAction,
    create_gear_upgrade_plan: createGearUpgradePlanAction,
    enchant_status: enchantStatusAction,
    enchant_options: enchantOptionsAction,
    enchant_item: enchantItemAction,
    enchant_held_item: enchantHeldItemAction,
    enchant_best_candidate: enchantBestCandidateAction,
    anvil_status: anvilStatusAction,
    repair_item: repairItemAction,
    combine_items: combineItemsAction,
    apply_book_to_item: applyBookToItemAction,
    rename_item: renameItemAction,
    potion_status: potionStatusAction,
    use_potion: usePotionAction,
    carry_potion_loadout: carryPotionLoadoutAction,
    brewing_status: brewingStatusAction,
    brew_potion: brewPotionAction,
    brew_fire_resistance: brewFireResistanceAction,
    upgrade_readiness: upgradeReadinessAction,
    nether_gear_readiness: netherGearReadinessAction,
    confirm_gear_upgrade: confirmGearUpgradeAction,
    confirm_enchant: () => confirmGearUpgradeAction('enchant'),
    confirm_anvil: () => confirmGearUpgradeAction('anvil'),
    confirm_use_book: () => confirmGearUpgradeAction('book'),
    confirm_repair: () => confirmGearUpgradeAction('repair'),
    confirm_use_potion: () => confirmGearUpgradeAction('potion'),
    confirm_brewing: () => confirmGearUpgradeAction('brew'),
    villager_status: villagerStatusAction,
    scan_villagers: scanVillagersAction,
    village_status: villageStatusAction,
    known_villages: knownVillagesAction,
    known_villagers: knownVillagersAction,
    remember_village: rememberVillageAction,
    remember_villager: rememberVillagerAction,
    trading_status: tradingStatusAction,
    inspect_villager_trades: inspectVillagerTradesAction,
    list_known_trades: listKnownTradesAction,
    best_known_trades: bestKnownTradesAction,
    economy_status: economyStatusAction,
    emerald_status: economyStatusAction,
    suggest_trades: suggestTradesAction,
    execute_approved_trade: executeApprovedTradeAction,
    confirm_trade: confirmTradeAction,
    trade_history: tradeHistoryAction,
    valuable_villagers: valuableVillagersAction,
    mark_villager_valuable: markVillagerValuableAction,
    confirm_villager_memory: confirmVillagerMemoryAction,
    protect_villager_status: protectVillagerStatusAction,
    village_protection_status: villageProtectionStatusAction,
    blueprint_status: blueprintStatusAction,
    list_blueprints: listBlueprintsAction,
    blueprint_preview: blueprintPreviewAction,
    blueprint_materials: blueprintMaterialsAction,
    blueprint_plan: blueprintPlanAction,
    blueprint_build_approved: blueprintBuildApprovedAction,
    blueprint_start_build: blueprintStartBuildAction,
    blueprint_continue_build: blueprintContinueBuildAction,
    blueprint_pause_build: blueprintPauseBuildAction,
    blueprint_resume_build: blueprintResumeBuildAction,
    blueprint_cancel_build: blueprintCancelBuildAction,
    blueprint_progress: blueprintProgressAction,
    blueprint_history: blueprintHistoryAction,
    schematic_status: schematicStatusAction,
    schematic_import_status: schematicImportStatusAction,
    server_bridge_status: serverBridgeStatusAction,
    server_status: serverStatusAction,
    bridge_health: bridgeHealthAction,
    bridge_recent_events: bridgeRecentEventsAction,
    bridge_recent_deaths: bridgeRecentDeathsAction,
    bridge_recent_advancements: bridgeRecentAdvancementsAction,
    bridge_regions: bridgeRegionsAction,
    bridge_register_region: bridgeRegisterRegionAction,
    bridge_delete_region: bridgeDeleteRegionAction,
    bridge_emergency_stop: bridgeEmergencyStopAction,
    mineflayer_plugin_status: mineflayerPluginStatusAction,
    plugin_wrapper_status: pluginWrapperStatusAction,
    plugin_path_to_owner: pluginPathToOwnerAction,
    plugin_follow_owner: pluginFollowOwnerAction,
    plugin_collect_blocks: pluginCollectBlocksAction,
    plugin_eat_safely: pluginEatSafelyAction,
    apply_starter_kit: applyStarterKitAction,
    restock_kit: () => applyStarterKitAction({ force: true }),
    thin_status: thinStatusAction,
    thin_stop: thinStopAction,
    thin_come_to_owner: thinComeToOwnerAction,
    thin_follow_owner: thinFollowOwnerAction,
    thin_stay: thinStayAction,
    collect_resource: thinCollectResourceAction,
    thin_collect_resource: thinCollectResourceAction,
    resume_last_collect: thinResumeLastCollectAction,
    thin_resume_last_collect: thinResumeLastCollectAction,
    thin_eat_if_hungry: thinEatIfHungryAction,
    thin_equip_tool_for: thinEquipToolForAction,
    thin_equip_armor: thinEquipArmorAction,
    thin_craft_item: thinCraftItemAction,
    thin_store_items: thinStoreItemsAction,
    thin_return_home: thinReturnHomeAction,
    thin_remember_home: thinRememberHomeAction,
    thin_missing_requirements: thinMissingRequirementsAction,
    set_talk_mode: setTalkMode,
    set_banter_mode: setBanterMode,
    personality_status: personalityStatus,
    conversation_memory_status: conversationMemoryStatus,
    remember_conversation_fact: rememberConversationFactAction,
    forget_conversation_fact: forgetConversationFactAction,
    clear_conversation_memory_confirmed: clearConversationMemoryConfirmed,
    answer_dialogue: answerDialogue,
    ask_clarification: askClarification,
    surviveTick,
    inventory_status: inventoryStatus,
    inventory_summary: inventoryStatus,
    tool_status: toolStatus,
    equip_tool: equipToolAction,
    lighting_status: lightingStatusAction,
    set_home: setHomeAction,
    clear_home: clearHomeAction,
    home_status: homeStatusAction,
    return_home: returnHomeAction,
    build_camp: buildCampAction,
    build_workstation: buildWorkstationAction,
    build_shelter: buildShelterAction,
    light_home: lightHomeAction,
    storage_status: storageStatusAction,
    place_storage_chest: placeStorageChestAction,
    register_storage_chest: registerStorageChestAction,
    store_items: storeItemsAction,
    withdraw_item: withdrawItemAction,
    bring_item_to_owner: bringItemToOwner,
    resource_status: resourceStatusAction,
    resource_run_wood: (count = 16) => resourceRunAction('wood', count),
    resource_run_stone: (count = 32) => resourceRunAction('stone', count),
    resource_run_coal: (count = 8) => resourceRunAction('coal', count),
    resource_run_iron: (count = 8) => resourceRunAction('iron', count),
    resource_run_food: (count = 6) => resourceRunAction('food', count),
    base_maintenance: baseMaintenanceAction,
    farming_status: farmingStatusAction,
    create_farm: createFarmAction,
    maintain_farm: maintainFarmAction,
    harvest_crops: harvestCropsAction,
    replant_crops: replantCropsAction,
    plant_crop: plantCropAction,
    animal_pen_status: animalPenStatusAction,
    create_animal_pen: createAnimalPenAction,
    lure_animal_to_pen: lureAnimalToPenAction,
    breed_animals: breedAnimalsAction,
    feed_animals: feedAnimalsAction,
    collect_eggs: collectEggsAction,
    shear_sheep: shearSheepAction,
    milk_cow: milkCowAction,
    farm_storage_status: farmStorageStatusAction,
    store_farm_items: storeFarmItemsAction,
    stop_farming: stopFarmingAction,
    stop_animal_task: stopAnimalTaskAction,
    mining_status: miningStatusAction,
    exploration_status: explorationStatusAction,
    map_status: mapStatusAction,
    scan_area: scanAreaAction,
    remember_location: rememberLocationAction,
    forget_location: forgetLocationAction,
    list_known_places: listKnownPlacesAction,
    list_waypoints: listKnownPlacesAction,
    go_to_waypoint: goToWaypointAction,
    return_from_exploration: returnFromExplorationAction,
    scout_north: (distance = null, options = {}) => scoutDirectionAction('north', distance, options),
    scout_south: (distance = null, options = {}) => scoutDirectionAction('south', distance, options),
    scout_east: (distance = null, options = {}) => scoutDirectionAction('east', distance, options),
    scout_west: (distance = null, options = {}) => scoutDirectionAction('west', distance, options),
    scout_direction: scoutDirectionAction,
    explore_around_home: exploreAroundHomeAction,
    explore_around_owner: exploreAroundOwnerAction,
    record_route: recordRouteAction,
    stop_route_recording: stopRouteRecordingAction,
    follow_route: followRouteAction,
    route_status: routeStatusAction,
    known_biomes: knownBiomesAction,
    known_resources: knownResourcesAction,
    known_danger_zones: knownDangerZonesAction,
    stop_exploration: stopExplorationAction,
    combat_status: combatStatusAction,
    combat_equipment_status: combatEquipmentStatusAction,
    threat_scan: threatScanAction,
    start_self_defense: startSelfDefenseAction,
    defend_owner: defendOwnerAction,
    guard_base: guardBaseAction,
    guard_position: guardPositionAction,
    stop_combat: stopCombatAction,
    flee_threat: fleeThreatAction,
    engage_hostile: engageHostileAction,
    equip_combat_gear: equipCombatGearAction,
    combat_recover: combatRecoverAction,
    base_defense_status: baseDefenseStatusAction,
    owner_defense_status: ownerDefenseStatusAction,
    goals_status: goalsStatusAction,
    list_goals: goalsStatusAction,
    create_goal: createGoalAction,
    create_goal_from_template: createGoalFromTemplateAction,
    suggest_goals: suggestGoalsAction,
    explain_goal: explainGoalAction,
    start_goal: startGoalAction,
    pause_goal: pauseGoalAction,
    resume_goal: resumeGoalAction,
    cancel_goal: cancelGoalAction,
    complete_goal: completeGoalAction,
    fail_goal: failGoalAction,
    archive_goal: archiveGoalAction,
    set_goal_priority: setGoalPriorityAction,
    next_goal_step: nextGoalStepAction,
    execute_next_goal_step: executeNextGoalStepAction,
    planner_status: plannerStatusAction,
    planner_pause: plannerPauseAction,
    planner_resume: plannerResumeAction,
    planner_suggest_next: plannerSuggestNextAction,
    approve_goal: approveGoalAction,
    reject_goal: rejectGoalAction,
    smelt_item: smeltItemAction,
    smelt_iron: smeltIronAction,
    smelt_charcoal: smeltCharcoalAction,
    nether_status: netherStatusAction,
    nether_checklist: netherChecklistAction,
    prepare_nether: prepareNetherAction,
    prepare_nether_gear: prepareNetherGearAction,
    prepare_nether_food: prepareNetherFoodAction,
    prepare_nether_blocks: prepareNetherBlocksAction,
    prepare_nether_portal_supplies: prepareNetherPortalSuppliesAction,
    equip_nether_gear: equipNetherGearAction,
    portal_status: portalStatusAction,
    find_portal: findPortalAction,
    build_portal: buildPortalAction,
    light_portal: lightPortalAction,
    enter_nether: enterNetherAction,
    safe_nether_entry: safeNetherEntryAction,
    scan_nether: scanNetherAction,
    secure_nether_portal: secureNetherPortalAction,
    return_from_nether: returnFromNetherAction,
    nether_memory_status: netherMemoryStatusAction,
    stop_nether_task: stopNetherTaskAction,
    mine_stone: mineStone,
    mine_coal: mineCoalAction,
    mine_iron: mineIronAction,
    armorStatus,
    equipBestArmor,
    craftBestAffordableArmor,
    craftIronArmor,
    craftLeatherArmor,
    craftDiamondArmorConfirmed,
    ensureArmoredForSurvival,
    craftItem: craftItemAction,
    craftGenericTool: craftGenericToolAction,
    craftPlanks,
    craftSticks,
    craftCraftingTable,
    craftWoodenPickaxe,
    craftStonePickaxe,
    craftWoodenAxe,
    craftTorches,
    craftLighting,
    craftStorage,
    craftShelterSupplies,
    craftUtilityItems,
    craftTravelItems,
    craftBuildingBlocks,
    craftSurvivalKit,
    craftingStatus: craftingStatusAction,
    canCraftItem: canCraftItemAction,
    confirmCraftItem,
    craftBasicTools,
    craftStoneTools,
    craftIronTools,
    placeCraftingTable,
    craft_item: craftItemAction,
    craft_generic_tool: craftGenericToolAction,
    craft_lighting: craftLighting,
    craft_storage: craftStorage,
    craft_shelter_supplies: craftShelterSupplies,
    craft_utility_items: craftUtilityItems,
    craft_travel_items: craftTravelItems,
    craft_building_blocks: craftBuildingBlocks,
    craft_survival_kit: craftSurvivalKit,
    crafting_status: craftingStatusAction,
    can_craft_item: canCraftItemAction,
    craft_basic_tools: craftBasicTools,
    craft_stone_tools: craftStoneTools,
    craft_iron_tools: craftIronTools,
    place_crafting_table: placeCraftingTable,
    armor_status: armorStatus,
    equip_best_armor: equipBestArmor,
    craft_best_affordable_armor: craftBestAffordableArmor,
    craft_iron_armor: craftIronArmor,
    craft_leather_armor: craftLeatherArmor,
    craft_diamond_armor_confirmed: craftDiamondArmorConfirmed,
    ensure_armored_for_survival: ensureArmoredForSurvival,
    handlers
  };

  bot.mcaiActions = api;
  bot.mcaiCancellation = cancellation;
  return api;
}

