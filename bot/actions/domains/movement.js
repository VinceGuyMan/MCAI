/**
 * Core movement / presence handlers: stop, status, come, follow, stay, lookAtOwner.
 */
import * as skillRunner from '../../skillRunner.js';
import * as pluginWrappers from '../../pluginWrappers.js';
import * as waterSurvival from '../../waterRescue.js';
import * as goalsStore from '../../goals.js';
import { wait } from '../shared.js';

/**
 * @param {object} ctx runtime + thin handlers + pathfinder goals + tier2 stubs
 */
export function createMovementHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    taskQueue,
    perception,
    safety,
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
  } = ctx;

  async function stop() {
    state.stopRequested = true;
    skillRunner.cancelActiveSkill('owner stop');
    curriculumExecutor.pauseCurriculum(bot, memory, 'owner stop');
    blueprintSystem.cancelBlueprintBuild(bot, memory, 'owner stop');
    cancellation?.cancelAll?.('owner stop');
    taskQueue.clearTask();
    const activeGoal = goalsStore.getActiveGoal();
    if (activeGoal) goalsStore.pauseGoal(activeGoal.id, 'Stopped by owner.');
    memory.update({
      currentTask: null,
      activeGoalStepId: null,
      thinCoreTaskActive: false,
      activeThinCoreAction: null,
      thinCoreTaskStartedAt: 0,
      plannerPausedReason: activeGoal ? 'Stopped by owner.' : memory.get().plannerPausedReason,
      lastAction: 'stop',
      lastActionAt: Date.now(),
      lastManualStopAt: Date.now(),
      ...clearPendingOwnerDecisions('owner stop'),
      foodTaskActive: false,
      fishingActive: false,
      activeResourceRun: null,
      farmTaskActive: false,
      animalTaskActive: false,
      activeMiningExpedition: null,
      pendingBlueprintBuild: null,
      activeExploration: null,
      explorationMode: null,
      currentRouteRecording: null,
      currentWaypointTarget: null,
      followOwnerActive: false,
      movementMode: null,
      combatMode: 'off',
      activeThreat: null,
      activeThreatId: null,
      activeThreatType: null,
      guardedPosition: null,
      netherScoutActive: false
    });
    stopMotion();
    // Free emergency/water_rescue path claim so come/follow work after stop
    try {
      memory.update({
        moveClaim: null,
        waterRescueAbort: true,
        lastManualStopAt: Date.now()
      });
    } catch {
      // ignore
    }
    say('Stopped.', true);
    return { ok: true, message: 'Stopped.', evidence: ['stop_requested'], data: {} };
  }

  async function status() {
    if (config.thinCoreEnabled) return thinStatusAction({}, { source: 'actions.status' });
    const world = perception();
    const owner = world.ownerDistance === null ? 'not visible' : `${world.ownerDistance} blocks away`;
    const task = world.currentTask?.name || 'none';
    const message = `Status: ${world.health}/20 hp, food ${world.food}/20, armor ${world.armorScore}, pos ${posText(world.position)}, task ${task}, ModVinny ${owner}.`;
    say(message, true);
    return { ok: true, message, evidence: ['status_reported'], data: { task, ownerDistance: world.ownerDistance } };
  }

  async function comeToOwner() {
    if (config.thinCoreEnabled) return thinComeToOwnerAction({}, { source: 'actions.comeToOwner' });
    throwIfCancelled();
    setupMovements();
    const owner = ownerEntity();
    if (!owner) {
      const message = 'I cannot see ModVinny.';
      say(message, true);
      return { ok: false, message, reason: message, evidence: [], data: {} };
    }
    const range = Math.max(1, Number(config.followDistance || 3));
    taskQueue.clearTask();
    stopMotion();
    await wait(100);
    memory.update({ lastAction: 'comeToOwner', lastActionAt: Date.now(), movementMode: 'come_to_owner', followOwnerActive: false });
    if (ownerDistance() <= range) {
      const message = 'I am already close to ModVinny.';
      say(message, true);
      memory.update({ movementMode: null });
      return { ok: true, message, evidence: ['returned_safely'], data: { ownerDistance: ownerDistance() } };
    }
    try {
      bot.pathfinder.setGoal(new GoalFollow(owner, range), true);
      const reached = await waitUntilNearOwner(range + 0.5, Number(config.ownerPathTimeoutMs || 20000));
      bot.pathfinder.setGoal(null);
      if (!reached.ok) {
        say(reached.reason, true);
        return { ok: false, message: reached.reason, reason: reached.reason, evidence: ['path_failed'], data: { ownerDistance: ownerDistance() } };
      }
      const message = 'I am here.';
      say(message, true);
      return { ok: true, message, evidence: ['returned_safely'], data: { ownerDistance: ownerDistance() } };
    } catch (error) {
      bot.pathfinder?.setGoal?.(null);
      if (isExpectedPathInterrupt(error)) {
        const nearEnough = ownerDistance() <= range + 0.5;
        const message = nearEnough ? 'I am here.' : 'My path to ModVinny was interrupted. Try "tj come here" again if you still need me.';
        say(message, true);
        return { ok: nearEnough, message, reason: nearEnough ? '' : 'path interrupted', evidence: nearEnough ? ['returned_safely'] : ['path_interrupted'], data: { ownerDistance: ownerDistance() } };
      }
      throw error;
    } finally {
      if (memory.get().movementMode === 'come_to_owner') memory.update({ movementMode: null });
    }
  }

  async function followOwner() {
    if (config.thinCoreEnabled) return thinFollowOwnerAction({}, { source: 'actions.followOwner' });
    throwIfCancelled();
    setupMovements();
    const owner = ownerEntity();
    if (!owner) {
      const message = 'I cannot see ModVinny.';
      say(message, true);
      return { ok: false, message, reason: message, evidence: [], data: {} };
    }
    const range = Math.max(1, Number(config.followDistance || 3));
    taskQueue.clearTask();
    stopMotion();
    await wait(100);
    memory.update({ lastAction: 'followOwner', lastActionAt: Date.now(), followOwnerActive: true, movementMode: 'follow_owner' });
    const followed = await pluginWrappers.followOwnerSafely(bot, {
      config,
      cancellation,
      distance: range,
      source: 'actions'
    });
    if (!followed.ok) {
      memory.update({ followOwnerActive: false, movementMode: null });
      say(`I cannot follow reliably: ${followed.reason || followed.message}`, true);
      return followed;
    }
    const message = `Following ModVinny within ${range} blocks.`;
    say(message, true);
    return { ok: true, message, evidence: ['follow_goal_set'], data: { ownerDistance: ownerDistance() } };
  }

  async function stay() {
    if (config.thinCoreEnabled) return thinStayAction({}, { source: 'actions.stay' });
    taskQueue.clearTask();
    memory.update({ lastAction: 'stay', lastActionAt: Date.now(), followOwnerActive: false, movementMode: null });
    stopMotion();
    say('Staying here.', true);
    return { ok: true, message: 'Staying here.', evidence: ['path_goal_cleared'], data: {} };
  }

  async function waterRescue() {
    const result = await waterSurvival.rescueFromWater(bot, {
      memory,
      safety,
      ownerUsername: config.ownerUsername,
      timeoutMs: Number(config.waterRescueTimeoutMs || 35000),
      cancellation,
      force: true
    });
    say(result.message || (result.ok ? 'On shore.' : 'Still struggling in the water.'), true);
    return result;
  }

  async function lookAtOwner() {
    const owner = ownerEntity();
    if (!owner) return false;
    await bot.lookAt(owner.position.offset(0, 1.6, 0), true);
    return true;
  }

  return {
    stop,
    status,
    comeToOwner,
    followOwner,
    stay,
    waterRescue,
    lookAtOwner
  };
}
