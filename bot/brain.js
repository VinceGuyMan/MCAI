import * as goalsStore from './goals.js';
import * as plannerState from './plannerState.js';
import * as mapMemoryStore from './mapMemory.js';
import { maybeIdleBanter } from './ambientDialogue.js';
import * as eventDialogue from './eventDialogue.js';
import { idleAutonomyTick, initializeIdleAutonomy, resetIdleTimer } from './idleAutonomy.js';
import {
  companionTick,
  getPlayMode,
  isCompanionMode,
  maybeCompanionAmbient
} from './companionMode.js';

export function summarizeNearbyDanger(state = {}) {
  const groups = new Map();
  for (const threat of Array.isArray(state.nearbyHostiles) ? state.nearbyHostiles : []) {
    const name = String(threat?.name || 'hostile').replace(/_/g, ' ');
    const current = groups.get(name) || { count: 0, distance: Infinity };
    current.count += 1;
    current.distance = Math.min(current.distance, Number(threat?.distance ?? Infinity));
    groups.set(name, current);
  }
  const parts = [...groups.entries()].slice(0, 4).map(([name, info]) => {
    const count = info.count > 1 ? `${info.count} ${name}s` : name;
    return Number.isFinite(info.distance) ? `${count} about ${Math.round(info.distance)} blocks away` : count;
  });
  if (state.dangerFlags?.lavaNearby) parts.push('lava within 8 blocks');
  if (state.dangerFlags?.fireNearby) parts.push('fire within 8 blocks');
  return parts.join(', ');
}

export function createBrain(config, deps) {
  const { bot, perception, safety, actions, taskQueue, planner, memory, cancellation } = deps;
  let timer = null;
  let tickPromise = null;
  let lastTaskPosition = null;
  initializeIdleAutonomy(bot, memory, config);
  const ownerOnlyActions = new Set([
    'craft_item',
    'craft_lighting',
    'craft_storage',
    'craft_shelter_supplies',
    'craft_utility_items',
    'craft_travel_items',
    'craft_building_blocks',
    'craft_basic_tools',
    'craft_stone_tools',
    'place_crafting_table',
    'craft_best_affordable_armor',
    'craft_iron_armor',
    'craft_leather_armor',
    'hunt_passive_food',
    'set_home',
    'return_home',
    'build_camp',
    'build_workstation',
    'build_shelter',
    'light_home',
    'store_items',
    'withdraw_item',
    'bring_item_to_owner',
    'resource_run_wood',
    'resource_run_stone',
    'resource_run_coal',
    'resource_run_food',
    'create_farm',
    'create_animal_pen',
    'lure_animal_to_pen',
    'breed_animals',
    'feed_animals',
    'shear_sheep',
    'milk_cow',
    'remember_location',
    'forget_location',
    'go_to_waypoint',
    'scout_direction',
    'explore_around_home',
    'explore_around_owner',
    'record_route',
    'follow_route',
    'start_self_defense',
    'defend_owner',
    'guard_base',
    'guard_position',
    'engage_hostile',
    'equip_combat_gear',
    'create_goal',
    'create_goal_from_template',
    'start_goal',
    'execute_next_goal_step',
    'approve_goal',
    'reject_goal',
    'build_portal',
    'light_portal',
    'enter_nether',
    'safe_nether_entry',
    'return_from_nether'
  ]);

  function isExpectedPathInterrupt(error) {
    const message = String(error?.message || error || '');
    return message.includes('GoalChanged') ||
      message.includes('goal was changed') ||
      message.includes('Path was stopped') ||
      message.includes('cancelled') ||
      message.includes('Canceled');
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  }

  function updateStuckCounter(state) {
    if (!state.currentTask || !state.position) {
      lastTaskPosition = state.position || null;
      if ((memory.get().stuckCounter || 0) !== 0) memory.set('stuckCounter', 0);
      return;
    }

    const moved = distance(state.position, lastTaskPosition);
    const nextCounter = moved < 0.7 ? (memory.get().stuckCounter || 0) + 1 : 0;
    lastTaskPosition = state.position;
    memory.set('stuckCounter', nextCounter);
  }

  function inventoryCount(state, names) {
    const wanted = new Set(Array.isArray(names) ? names : [names]);
    return (state.inventory || [])
      .filter((item) => wanted.has(item.name))
      .reduce((sum, item) => sum + item.count, 0);
  }

  async function maybeSurvivalCraft(state) {
    if (!config.autonomyEnabled || config.autonomyMode !== 'semi') return false;
    if ((config.thinCoreEnabled && config.competentCoreDisableAdvancedAutonomy !== false) || config.advancedAutonomyEnabled === false) return false;
    if (cancellation?.isCancelled?.()) return false;
    if (/nether|end/.test(String(state.dimension || ''))) return false;
    const now = Date.now();
    const mem = memory.get();
    const suggestionReady = now - (mem.lastCraftSuggestionAt || 0) >= 120000;
    const nightApproaching = state.timeOfDay >= 11500 && state.timeOfDay <= 23000;
    const safeToCraft = !state.dangerFlags.hostileNearby &&
      !state.dangerFlags.lavaNearby &&
      !state.dangerFlags.fireNearby &&
      (!state.dangerFlags.tooFarFromOwner || state.hungerEmergency);

    if (!safeToCraft) return false;

    if (nightApproaching && state.canCraftTorches && inventoryCount(state, 'torch') < 8) {
      await actions.craftLighting({ direct: false });
      return true;
    }

    if (config.foodEnabled && state.rawFoodCount > 0 && state.hasCobblestone && !state.nearbyFurnace && state.canCraftFurnace) {
      await actions.craftItem('furnace', 1, { direct: false });
      return true;
    }

    if (suggestionReady && state.canCraftChest && inventoryCount(state, 'chest') < 1) {
      await actions.answerChat('I can craft storage if you want it. Say "tj craft storage".');
      memory.update({ lastCraftSuggestionAt: now });
      return false;
    }

    if (suggestionReady && nightApproaching && state.canCraftBed) {
      await actions.answerChat('I have the materials for a bed. Say "tj craft bed" if you want me to make one.');
      memory.update({ lastCraftSuggestionAt: now });
      return false;
    }

    return false;
  }

  async function applyPlan(plan) {
    if (config.thinCoreEnabled) {
      const actionCount = Array.isArray(plan.actions) ? plan.actions.length : 0;
      if (actionCount) console.log(`[brain] thin core blocked ${actionCount} planner action(s); planner may suggest but not execute broad plans.`);
      return;
    }
    if (plan.speak) await actions.answerChat(plan.speak);
    for (const item of plan.actions || []) {
      if (item.action === 'stop') await actions.stop();
      else if (item.action === 'status') await actions.status();
      else if (item.action === 'come_to_owner') await actions.comeToOwner();
      else if (item.action === 'follow_owner') await actions.followOwner();
      else if (item.action === 'stay') await actions.stay();
      else if (item.action === 'gather_wood' || item.action === 'find_tree') await actions.gatherWood(item.count || 8);
      else if (item.action === 'eat_if_hungry') await actions.eatIfHungry();
      else if (item.action === 'flee_danger') await actions.fleeDanger(perception());
      else if (item.action === 'stay_near_friendly_players') await actions.stayNearFriendlyPlayers();
      else if (item.action === 'armor_status') await actions.armorStatus();
      else if (item.action === 'equip_best_armor') await actions.equipBestArmor();
      else if (item.action === 'ensure_armored_for_survival') await actions.ensureArmoredForSurvival(perception());
      else if (item.action === 'food_status') await actions.foodStatus();
      else if (item.action === 'find_food') await actions.findFood();
      else if (item.action === 'get_food') await actions.getFood();
      else if (item.action === 'make_food') await actions.makeFood();
      else if (item.action === 'cook_food') await actions.cookFood();
      else if (item.action === 'craft_food') await actions.craftFood(item.item || item.target || 'bread');
      else if (item.action === 'gather_plant_food') await actions.gatherPlantFood();
      else if (item.action === 'fish_for_food') await actions.fishForFood();
      else if (item.action === 'craft_survival_kit') await actions.craftSurvivalKit({ direct: false });
      else if (item.action === 'crafting_status') await actions.craftingStatus();
      else if (item.action === 'can_craft_item') await actions.canCraftItem(item.item || item.target || 'chest');
      else if (item.action === 'home_status') await actions.homeStatus();
      else if (item.action === 'storage_status') await actions.storageStatus();
      else if (item.action === 'resource_status') await actions.resourceStatus();
      else if (item.action === 'base_maintenance') await actions.baseMaintenance({ silent: true });
      else if (item.action === 'farming_status') await actions.farmingStatus();
      else if (item.action === 'maintain_farm') await actions.maintainFarm();
      else if (item.action === 'harvest_crops') await actions.harvestCrops();
      else if (item.action === 'replant_crops') await actions.replantCrops();
      else if (item.action === 'plant_crop') await actions.plantCrop(item.target || item.item || 'wheat');
      else if (item.action === 'animal_pen_status') await actions.animalPenStatus();
      else if (item.action === 'collect_eggs') await actions.collectEggs();
      else if (item.action === 'store_farm_items') await actions.storeFarmItems();
      else if (item.action === 'mining_status') await actions.miningStatus();
      else if (item.action === 'exploration_status') await actions.explorationStatus();
      else if (item.action === 'map_status') await actions.mapStatus();
      else if (item.action === 'scan_area') await actions.scanArea();
      else if (item.action === 'list_known_places') await actions.listKnownPlaces();
      else if (item.action === 'known_biomes') await actions.knownBiomes();
      else if (item.action === 'known_resources') await actions.knownResources(item.target || item.item || null);
      else if (item.action === 'known_danger_zones') await actions.knownDangerZones();
      else if (item.action === 'return_from_exploration') await actions.returnFromExploration();
      else if (item.action === 'stop_exploration') await actions.stopExploration();
      else if (item.action === 'combat_status') await actions.combatStatus();
      else if (item.action === 'combat_equipment_status') await actions.combatEquipmentStatus();
      else if (item.action === 'threat_scan') await actions.threatScan();
      else if (item.action === 'flee_threat') await actions.fleeThreat();
      else if (item.action === 'stop_combat') await actions.stopCombat();
      else if (item.action === 'base_defense_status') await actions.baseDefenseStatus();
      else if (item.action === 'owner_defense_status') await actions.ownerDefenseStatus();
      else if (item.action === 'nether_status') await actions.netherStatus();
      else if (item.action === 'nether_checklist') await actions.netherChecklist();
      else if (item.action === 'prepare_nether') await actions.prepareNether({ silent: true });
      else if (item.action === 'prepare_nether_gear') await actions.prepareNetherGear();
      else if (item.action === 'prepare_nether_food') await actions.prepareNetherFood();
      else if (item.action === 'prepare_nether_blocks') await actions.prepareNetherBlocks();
      else if (item.action === 'prepare_nether_portal_supplies') await actions.prepareNetherPortalSupplies();
      else if (item.action === 'equip_nether_gear') await actions.equipNetherGear();
      else if (item.action === 'portal_status') await actions.portalStatus();
      else if (item.action === 'scan_nether') await actions.scanNether({ silent: true });
      else if (item.action === 'nether_memory_status') await actions.netherMemoryStatus();
      else if (item.action === 'stop_nether_task') await actions.stopNetherTask();
      else if (item.action === 'dialogue_status') await actions.dialogueStatus();
      else if (item.action === 'personality_status') await actions.personalityStatus();
      else if (item.action === 'conversation_memory_status') await actions.conversationMemoryStatus();
      else if (item.action === 'answer_dialogue') await actions.answerDialogue(item.reason || item.target || '');
      else if (item.action === 'ask_clarification') await actions.askClarification(item.reason || item.target || '');
      else if (ownerOnlyActions.has(item.action)) console.log(`[brain] ignored autonomous owner-only action: ${item.action}`);
    }
  }

  async function maybeGoalPlanning(state) {
    if (config.thinCoreEnabled) return false;
    if (!config.longTermPlanningEnabled) return false;
    if (cancellation?.isCancelled?.()) return false;
    if (state.dangerFlags?.lowHealth || state.dangerFlags?.hostileNearby || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) return false;
    if (/nether|end/.test(String(state.dimension || ''))) return false;

    const mem = memory.get();
    const now = Date.now();
    if (now - (mem.lastPlannerTickAt || 0) < (config.plannerTickMs || 10000)) return false;
    plannerState.updateLastPlannerTick(memory);

    const activeGoal = goalsStore.getActiveGoal();
    if (activeGoal) {
      if (!config.allowSemiAutonomousGoalProgress) return false;
      if (mem.plannerPausedReason) return false;
      if (config.autoPauseGoalsWhenOwnerFar && state.dangerFlags?.tooFarFromOwner) {
        await actions.pauseGoal(activeGoal.name, 'ModVinny is too far away.');
        return true;
      }
      if (config.autoPauseGoalsAtNight && state.nightUnsafe) {
        await actions.pauseGoal(activeGoal.name, 'Night is unsafe.');
        return true;
      }
      const runtime = now - (mem.currentGoalRunStartedAt || activeGoal.startedAt || now);
      if (runtime > (config.maxGoalRunDurationMs || 600000)) {
        await actions.pauseGoal(activeGoal.name, 'Goal ran too long.');
        return true;
      }
      await actions.executeNextGoalStep({ silent: true });
      return true;
    }

    if (!config.allowPlannerToSuggestGoals || config.allowAutonomousGoalPlanning) return false;
    if (!plannerState.canPlannerMakeDecision(memory, config)) return false;
    if (now - (mem.lastGoalSuggestionAt || 0) < (config.goalSuggestionCooldownMs || 120000)) return false;
    plannerState.updateLastPlannerDecision(memory);
    await actions.plannerSuggestNext({ silent: false });
    return true;
  }

  async function runTick() {
    if (cancellation?.isCancelled?.()) return;
    const state = perception();
    updateStuckCounter(state);

    // Water / drown rescue — skip if owner just stopped or a come/follow claim is active.
    if (bot) {
      try {
        const water = await import('./waterRescue.js');
        const memW = memory.get();
        const o2 = Number(bot.oxygenLevel ?? 20);
        const surfaceThreshold = Number(config.waterSurfaceOxygenThreshold || 14);
        const criticalThreshold = Number(config.waterCriticalOxygenThreshold || 8);
        const criticalOxygen = o2 <= criticalThreshold;
        const ownerBusy = memW.thinCoreTaskActive || memW.followOwnerActive
          || (memW.moveClaim && memW.moveClaim.owner && memW.moveClaim.owner !== 'water_rescue'
            && Number(memW.moveClaim.priority || 0) >= 50
            && memW.moveClaim.expiresAt > Date.now());
        const justStopped = memW.lastManualStopAt && Date.now() - memW.lastManualStopAt < 4000;
        const needs = typeof water.botNeedsWaterRescue === 'function'
          ? water.botNeedsWaterRescue(bot)
          : (water.botIsInFluid(bot) || water.botHeadInFluid(bot));
        const owner = bot.players?.[config.ownerUsername]?.entity;
        const ownerDistance = owner?.position && bot.entity?.position
          ? bot.entity.position.distanceTo(owner.position)
          : Number.POSITIVE_INFINITY;
        const holdNearOwner = Number(memW.waterOwnerHoldUntil || 0) > Date.now()
          && ownerDistance <= 8;
        if (needs && !justStopped && holdNearOwner && !criticalOxygen) {
          if (o2 <= surfaceThreshold || water.botHeadInFluid?.(bot)) {
            await water.surfaceForAir?.(bot, {
              memory,
              toward: owner?.position || null,
              maxMs: 2600,
              cancellation
            });
          }
          memory.update({ lastWaterRescueAt: Date.now() });
          return;
        }
        if (needs && !justStopped && (!ownerBusy || criticalOxygen)) {
          const lastRescue = Number(memW.lastWaterRescueAt || 0);
          const cooldown = criticalOxygen
            ? 1500
            : Number(config.waterRescueCooldownMs || 3500);
          if (Date.now() - lastRescue >= cooldown) {
            memory.update({ lastWaterRescueAt: Date.now() });
            const rescue = await water.rescueFromWater(bot, {
              memory,
              ownerUsername: config.ownerUsername,
              timeoutMs: Number(config.waterRescueTimeoutMs || 30000),
              cancellation,
              force: criticalOxygen
            });
            if (rescue && !rescue.data?.skipped) return;
          }
        }
      } catch (error) {
        console.warn(`[brain] water rescue: ${error.message || error}`);
      }
    }

    if (bot && config.lifelikeDialogueEnabled && config.allowTaskCommentary) {
      const dangerSummary = summarizeNearbyDanger(state);
      if (state.health <= Number(config.lowHealthRecoveryThreshold || 8)) {
        eventDialogue.maybeSayEventComment(bot, memory, eventDialogue.onLowHealth({
          health: state.health,
          food: state.food,
          hasFood: state.hasFood,
          dangerSummary
        }));
      }
      else if (state.food <= 6) eventDialogue.maybeSayEventComment(bot, memory, eventDialogue.onLowFood({ type: 'low_food' }));
      else if (state.primaryThreatDistance !== null && state.primaryThreatDistance <= 8 && state.threatCount > 0) {
        eventDialogue.maybeSayEventComment(bot, memory, eventDialogue.onDangerDetected({
          summary: dangerSummary,
          signature: (state.nearbyHostiles || []).map((threat) => threat.name).sort().join(',')
        }));
      }
    }

    let runtimeState = memory.get();
    const activeSurvivalInterruptibleTask = Boolean(
      runtimeState.thinCoreTaskActive ||
      runtimeState.activeThinCoreAction ||
      runtimeState.foodTaskActive ||
      runtimeState.farmTaskActive ||
      runtimeState.animalTaskActive ||
      runtimeState.fishingActive
    );
    const criticalLowHealth = Number(state.health ?? 20) <= Number(config.lowHealthRecoveryThreshold || 8);
    if (activeSurvivalInterruptibleTask && criticalLowHealth) {
      cancellation?.cancelAll?.('critical low health recovery');
      try { bot.deactivateItem?.(); } catch { /* no active item */ }
      try { bot.pathfinder?.setGoal?.(null); } catch { /* no active path */ }
      memory.update({
        thinCoreTaskActive: false,
        activeThinCoreAction: null,
        foodTaskActive: false,
        farmTaskActive: false,
        animalTaskActive: false,
        fishingActive: false,
        activeResourceRun: null,
        movementMode: null
      });
      cancellation?.resetCancellation?.();
      runtimeState = memory.get();
      await actions.surviveTick(state);
      return;
    }
    if (activeSurvivalInterruptibleTask) return;

    if (state.isInNether) {
      if (state.shouldReturnFromNether || state.netherDangerNearby || state.health < (config.minimumHealthForNether || 18) || state.food < (config.minimumFoodForNether || 16)) {
        if (Date.now() - (memory.get().lastNetherReturnAttemptAt || 0) > 10000) {
          memory.update({ lastNetherReturnAttemptAt: Date.now() });
          await actions.returnFromNether().catch((error) => console.warn(`[brain] Nether return failed: ${error.message}`));
        }
        return;
      }
      await actions.scanNether({ silent: true });
      return;
    }

    if (state.activeExploration) {
      await actions.scanArea({ silent: true });
      if (state.dangerFlags.hostileNearby || state.dangerFlags.lavaNearby || state.dangerFlags.fireNearby || state.dangerFlags.lowFood || state.dangerFlags.lowHealth || (state.dangerFlags.nightTime && !config.allowNightExploration)) {
        await actions.returnFromExploration();
        return;
      }
    }

    if (config.combatEnabled && config.allowDefensiveCombat) {
      const memCombat = memory.get();
      const lastFleeChatAt = Math.max(
        Number(memCombat.lastFleeChatAt || 0),
        Number(memCombat.lastSafetyWarningAt || 0),
        Number(memCombat.lastSafetyMovementChatAt || 0)
      );
      const fleeChatCooldown = Number(config.fleeChatCooldownMs || 60000);
      // Movement mutex: jobs / move claims own pathfinder — only flee if critically hurt.
      let jobHoldsMovement = Boolean(
        memCombat.thinCoreTaskActive
        || memCombat.activeCoreMacro
        || memCombat.activeResourceRun
        || String(memCombat.movementMode || '').startsWith('thin_')
        || String(memCombat.activeThinCoreAction || '').includes('collect')
      );
      try {
        // Lazy import not needed — claim stored on memory
        const claim = memCombat.moveClaim;
        if (claim && Number(claim.priority || 0) >= 60 && (!claim.expiresAt || Date.now() <= claim.expiresAt)) {
          jobHoldsMovement = true;
        }
      } catch {
        // ignore
      }
      const criticalHealth = Number(state.health ?? 20) <= Number(config.criticalHealthForFleeInterrupt || 8);
      // Emergency flee only when hostiles exist (or combat mode is already flee). Low food alone must not spam retreat.
      if (
        config.allowEmergencyFlee
        && state.shouldFleeCombat
        && (state.threatCount > 0 || memCombat.combatMode === 'flee')
        && (!jobHoldsMovement || criticalHealth)
      ) {
        const allowChat = Date.now() - lastFleeChatAt >= fleeChatCooldown;
        const result = await actions.fleeThreat(null, {
          silent: !allowChat,
          reason: 'danger nearby'
        });
        if (allowChat && result?.message) memory.update({ lastFleeChatAt: Date.now() });
        return;
      }
      if (memCombat.combatMode && memCombat.combatMode !== 'off') {
        await actions.combatTick({ silent: true });
        return;
      }
      if (state.threatCount > 0) {
        const immediateThreat = typeof state.primaryThreatDistance === 'number' &&
          state.primaryThreatDistance <= Math.min(6, config.combatEngageRadius || 12);
        if (config.allowSelfDefense && immediateThreat && !state.shouldAvoidFighting) {
          await actions.combatTick({ silent: true });
          return;
        }
      }
    }

    if (config.foodEnabled) {
      const handledFood = await actions.handleFoodSurvival(state);
      if (handledFood && state.hungerEmergency) return;
    }
    const shouldCheckArmor = state.hasBetterArmorInInventory ||
      state.dangerFlags.lowHealth ||
      state.dangerFlags.nightTime ||
      state.dangerFlags.hostileNearby ||
      (state.missingArmorSlots.length > 0 && (state.hasIronForArmor || state.hasLeatherForArmor));
    if (shouldCheckArmor) await actions.ensureArmoredForSurvival(state);
    const safetyState = safety.assess(state);

    if (safetyState.emergency) {
      await actions.surviveTick(state);
      return;
    }

    const movementMode = memory.get().movementMode;
    if (
      memory.get().followOwnerActive ||
      movementMode === 'follow_owner' ||
      movementMode === 'come_to_owner' ||
      String(movementMode || '').startsWith('thin_')
    ) return;

    // Companion presence: soft follow + look-at + light stuck recovery (no Tier-2).
    const playMode = getPlayMode(config, memory);
    if (isCompanionMode(config, memory) || playMode === 'quiet') {
      const companionResult = await companionTick(bot, memory, {
        state,
        config,
        cancellation,
        actions
      }).catch((error) => {
        console.warn(`[brain] companion tick: ${error.message || error}`);
        return null;
      });
      if (companionResult?.ran && companionResult.reason === 'soft_follow') {
        // Soft follow set a goal; skip autonomous busywork this tick.
        return;
      }
    }

    if (state.dangerFlags.tooFarFromOwner) {
      await actions.comeToOwner();
      return;
    }

    if (await maybeSurvivalCraft(state)) return;

    const currentTask = taskQueue.getCurrentTask();
    if (currentTask) {
      if ((memory.get().stuckCounter || 0) >= 4 && Date.now() - (memory.get().lastUnstuckAt || 0) > 15000) {
        await actions.unstuck();
        return;
      }
      await taskQueue.runNextStep({ state, actions, handlers: actions.handlers, cancellation });
      return;
    }

    if (Date.now() - (memory.get().lastManualStopAt || 0) < (config.manualStopPauseMs || 30000)) return;

    // Companion / thin-core: living Player 2 — no free wood runs, no idle planner loops.
    if (isCompanionMode(config, memory) || config.thinCoreEnabled) {
      if ((state.dangerFlags.nightTime || state.dangerFlags.hostileNearby) && !state.dangerFlags.tooFarFromOwner && inventoryCount(state, 'torch') > 0) {
        await actions.placeTorch();
      }
      if (config.lifelikeDialogueEnabled && config.allowAmbientComments) {
        const mapMemory = config.mapMemoryEnabled ? mapMemoryStore.loadMapMemory() : null;
        if (bot && maybeCompanionAmbient(bot, memory, state, mapMemory)) return;
        if (bot && await maybeIdleBanter(bot, memory, mapMemory).catch(() => false)) return;
      }
      return;
    }

    if (await maybeGoalPlanning(state)) return;

    if (!config.autonomyEnabled || config.autonomyMode !== 'semi') return;
    if (/nether|end/.test(String(state.dimension || ''))) return;
    if (config.stayNearFriendlyPlayers) await actions.stayNearFriendlyPlayers();

    if (config.homeBaseEnabled && config.allowAutonomousBaseMaintenance && state.homeExists && state.nearHome) {
      const maintained = await actions.baseMaintenance({ silent: true });
      if (maintained?.ok) return;
    }

    if (config.farmingEnabled && config.allowAutonomousFarming && state.homeExists && state.nearHome && !taskQueue.getCurrentTask()) {
      const farmReady = Date.now() - (memory.get().lastFarmMaintenanceAt || 0) >= (config.farmMaintenanceCooldownMs || 30000);
      if (farmReady && (state.farmNeedsHarvest || state.farmNeedsReplant)) {
        await actions.maintainFarm();
        return;
      }
      if (config.allowAutonomousAnimalCare && state.nearbyEggs?.length) {
        await actions.collectEggs();
        return;
      }
    }

    if (config.mapMemoryEnabled && state.homeExists && state.nearHome && Date.now() - (memory.get().explorationLastScanAt || 0) >= (config.mapSaveIntervalMs || 10000)) {
      await actions.scanArea({ silent: true });
    }

    const ownerClose = typeof state.ownerDistance === 'number' &&
      state.ownerDistance <= config.maxAutonomyDistanceFromOwner;
    const safeToGather = ownerClose &&
      !state.dangerFlags.hostileNearby &&
      !state.dangerFlags.lavaNearby &&
      !state.dangerFlags.fireNearby &&
      (!state.dangerFlags.nightTime || config.allowNightExploration);

    if (safeToGather && state.logCount < 8) {
      await actions.gatherWood(8);
      return;
    }

    if ((state.dangerFlags.nightTime || state.dangerFlags.hostileNearby) && !state.dangerFlags.tooFarFromOwner && inventoryCount(state, 'torch') > 0) {
      await actions.placeTorch();
    }

    const idleResult = await idleAutonomyTick(bot, memory, { state, config, actions, cancellation, taskQueue });
    if (idleResult?.ok && idleResult.data?.ran !== false) return;

    if (config.lifelikeDialogueEnabled && config.allowAmbientComments) {
      const mapMemory = config.mapMemoryEnabled ? mapMemoryStore.loadMapMemory() : null;
      if (bot && maybeCompanionAmbient(bot, memory, state, mapMemory)) return;
      if (bot && await maybeIdleBanter(bot, memory, mapMemory).catch(() => false)) return;
    }

    // Planner only when advanced autonomy is explicitly on (not companion/thin defaults).
    if (config.advancedAutonomyEnabled === true && config.allowPlannerIdleDecisions !== false) {
      const mem = memory.get();
      if (Date.now() - (mem.lastOllamaDecisionAt || 0) >= config.ollamaDecisionCooldownMs) {
        const plan = await planner.planFor('', state);
        await applyPlan(plan);
      }
    }
  }

  function tick() {
    if (tickPromise) return tickPromise;
    tickPromise = runTick().finally(() => {
      tickPromise = null;
    });
    return tickPromise;
  }

  function start() {
    if (timer) return;
    console.log(`[brain] semi-autonomous loop every ${config.brainTickMs}ms`);
    timer = setInterval(() => {
      tick().catch((error) => {
        if (isExpectedPathInterrupt(error)) return;
        console.error(`[brain] ${error.stack || error.message}`);
      });
    }, config.brainTickMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick };
}
