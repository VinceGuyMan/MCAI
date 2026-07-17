/**
 * Exploration, waypoints, routes, and map reports.
 */
import * as mapMemoryStore from '../../mapMemory.js';
import * as worldScanner from '../../worldScanner.js';
import * as waypointNavigator from '../../waypointNavigator.js';
import * as routeMemory from '../../routeMemory.js';
import * as exploration from '../../exploration.js';
import * as biomeMemory from '../../biomeMemory.js';

export function createExplorationHandlers(ctx) {
  const {
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
  } = ctx;

  async function mapStatusAction() {
    const mapMemory = loadMapMemory();
    const summary = mapMemoryStore.summarizeMapMemory(mapMemory);
    say(`Map: ${summary.waypoints} places, ${summary.resources} resources, ${summary.dangerZones} dangers, ${summary.routes} routes, ${summary.visitedChunks} chunks visited.`, true);
    return summary;
  }

  async function explorationStatusAction() {
    const mapMemory = loadMapMemory();
    const status = exploration.explorationStatus(bot, memory, mapMemory);
    say(`Exploration: ${status.active ? status.mode : 'idle'}, breadcrumbs ${status.breadcrumbs}, target ${status.currentWaypointTarget || 'none'}. Map has ${status.map.waypoints} places and ${status.map.resources} resources.`, true);
    return status;
  }

  async function scanAreaAction(options = {}) {
    throwIfCancelled();
    const mapMemory = loadMapMemory();
    const scan = exploration.scanAndRememberSurroundings(bot, memory, mapMemory, resourceOptions({ radius: options.radius || 24 }));
    const text = worldScanner.reportScan(bot, scan);
    if (!options.silent) say(text, true);
    return scan;
  }

  async function rememberLocationAction(name, type = 'custom', notes = '') {
    const clean = String(name || '').trim();
    if (!clean) {
      say('Tell me what to call this place.', true);
      return { ok: false, message: 'missing waypoint name' };
    }
    const mapMemory = loadMapMemory();
    const waypoint = waypointNavigator.rememberCurrentLocation(bot, mapMemory, clean, type, notes, config.ownerUsername);
    say(`Remembered ${waypoint.name} at ${mapMemoryStore.formatPoint(waypoint.position)}.`, true);
    return { ok: true, waypoint };
  }

  async function forgetLocationAction(name, options = {}) {
    const clean = String(name || '').trim();
    if (!clean) {
      say('Tell me which place to forget.', true);
      return { ok: false, message: 'missing waypoint name' };
    }
    if (!options.confirmed) {
      memory.update({ pendingExplorationConfirmation: { action: 'forget_waypoint', name: clean, expiresAt: Date.now() + 60000 } });
      say(`Forgetting places is permanent. Say "tj confirm forget ${clean}" to continue.`, true);
      return { ok: false, requiresConfirmation: 'forget_waypoint' };
    }
    const mapMemory = loadMapMemory();
    const removed = waypointNavigator.forgetLocation(mapMemory, clean);
    say(removed ? `Forgot ${clean}.` : `I do not know a place named ${clean}.`, true);
    return { ok: removed };
  }

  async function confirmForgetWaypointAction(name) {
    const pending = memory.get().pendingExplorationConfirmation;
    const clean = String(name || pending?.name || '').trim();
    if (pending?.action !== 'forget_waypoint' || Date.now() > (pending.expiresAt || 0) || pending.name.toLowerCase() !== clean.toLowerCase()) {
      memory.update({ pendingExplorationConfirmation: null });
      say('No active forget confirmation.', true);
      return { ok: false };
    }
    memory.update({ pendingExplorationConfirmation: null });
    return forgetLocationAction(clean, { confirmed: true });
  }

  async function listKnownPlacesAction() {
    const mapMemory = loadMapMemory();
    const places = waypointNavigator.listKnownPlaces(mapMemory).slice(0, 8);
    say(places.length ? `Known places: ${places.map((place) => `${place.name} (${place.type})`).join(', ')}.` : 'I do not know any places yet.', true);
    return places;
  }

  async function waypointStatusAction(name) {
    const mapMemory = loadMapMemory();
    const result = waypointNavigator.waypointStatus(bot, mapMemory, name);
    say(result.message, true);
    return result;
  }

  async function goToWaypointAction(name) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const safe = safety.safeWaypointTravel?.(perception(), mapMemory, { waypointName: name }) || { ok: true };
    if (!safe.ok) {
      say(safe.reason || safe.message, true);
      return safe;
    }
    const result = await waypointNavigator.goToWaypoint(bot, memory, mapMemory, name, resourceOptions({ range: config.waypointArrivalDistance || 3 }));
    say(result.message, true);
    return result;
  }

  async function returnToOwnerAction() {
    throwIfCancelled();
    setupMovements();
    const result = await waypointNavigator.returnToOwner(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function scoutDirectionAction(direction, distanceBlocks = null, options = {}) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await exploration.scoutDirection(bot, memory, mapMemory, direction, distanceBlocks, resourceOptions(options));
    if (result.requiresConfirmation) {
      memory.update({ pendingExplorationConfirmation: { action: result.requiresConfirmation, mode: 'scout_direction', direction, distance: distanceBlocks, expiresAt: Date.now() + 60000 } });
    }
    say(result.message, true);
    return result;
  }

  async function exploreAroundHomeAction(radius = null, options = {}) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await exploration.exploreAroundHome(bot, memory, mapMemory, radius, resourceOptions(options));
    if (result.requiresConfirmation) memory.update({ pendingExplorationConfirmation: { action: result.requiresConfirmation, mode: 'circle_home', radius, expiresAt: Date.now() + 60000 } });
    say(result.message, true);
    return result;
  }

  async function exploreAroundOwnerAction(radius = null, options = {}) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await exploration.exploreAroundOwner(bot, memory, mapMemory, radius, resourceOptions(options));
    if (result.requiresConfirmation) memory.update({ pendingExplorationConfirmation: { action: result.requiresConfirmation, mode: 'circle_owner', radius, expiresAt: Date.now() + 60000 } });
    say(result.message, true);
    return result;
  }

  async function returnFromExplorationAction() {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await exploration.returnFromExploration(bot, memory, mapMemory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function stopExplorationAction() {
    const mapMemory = loadMapMemory();
    exploration.stopExploration(bot, memory, 'stopped by owner');
    routeMemory.recordRoutePoint(bot, memory, mapMemory);
    return stop();
  }

  async function reportExplorationResultsAction() {
    const mapMemory = loadMapMemory();
    const result = exploration.reportExplorationResults(bot, memory, mapMemory);
    say(result.message, true);
    return result;
  }

  async function recordRouteAction(name) {
    const mapMemory = loadMapMemory();
    const result = routeMemory.startRouteRecording(bot, memory, mapMemory, name);
    say(result.message, true);
    return result;
  }

  async function stopRouteRecordingAction() {
    const mapMemory = loadMapMemory();
    const result = routeMemory.stopRouteRecording(bot, memory, mapMemory);
    say(result.message, true);
    return result;
  }

  async function followRouteAction(name) {
    throwIfCancelled();
    setupMovements();
    const mapMemory = loadMapMemory();
    const result = await routeMemory.followKnownRoute(bot, memory, mapMemory, name, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function routeStatusAction() {
    const mapMemory = loadMapMemory();
    const result = routeMemory.routeStatus(bot, memory, mapMemory);
    say(result.message, true);
    return result;
  }

  async function knownBiomesAction() {
    const mapMemory = loadMapMemory();
    const status = biomeMemory.biomeStatus(bot, mapMemory);
    const names = status.known.map((item) => item.biome).slice(0, 8);
    say(names.length ? `Known biomes: ${names.join(', ')}.` : (status.available ? `Current biome: ${status.current}.` : 'Biome detection is unavailable here.'), true);
    return status;
  }

  async function knownResourcesAction(resourceType = null) {
    const mapMemory = loadMapMemory();
    const resources = mapMemoryStore.getKnownResources(mapMemory, resourceType).slice(-8);
    say(resources.length ? `Known resources: ${resources.map((item) => `${item.name} at ${mapMemoryStore.formatPoint(item.position)}`).join('; ')}.` : 'I do not know any resource spots yet.', true);
    return resources;
  }

  async function knownDangerZonesAction() {
    const mapMemory = loadMapMemory();
    const dangers = mapMemoryStore.getKnownDangerZones(mapMemory).slice(-8);
    say(dangers.length ? `Known dangers: ${dangers.map((item) => `${item.dangerType} at ${mapMemoryStore.formatPoint(item.position)}`).join('; ')}.` : 'I do not know any danger zones yet.', true);
    return dangers;
  }

  async function confirmExplorationAction(action) {
    const pending = memory.get().pendingExplorationConfirmation;
    const requested = String(action || '').trim();
    if (!pending || Date.now() > (pending.expiresAt || 0) || pending.action !== requested) {
      memory.update({ pendingExplorationConfirmation: null });
      say('No active exploration confirmation.', true);
      return { ok: false };
    }
    memory.update({ pendingExplorationConfirmation: null });
    const confirmed = {
      confirmedLong: requested === 'long_exploration' || requested === 'leave_home_radius',
      confirmedNight: requested === 'night_exploration',
      confirmedCave: requested === 'cave_exploration'
    };
    if (pending.mode === 'scout_direction') return scoutDirectionAction(pending.direction, pending.distance, confirmed);
    if (pending.mode === 'circle_home') return exploreAroundHomeAction(pending.radius, confirmed);
    if (pending.mode === 'circle_owner') return exploreAroundOwnerAction(pending.radius, confirmed);
    say(`Confirmed ${requested.replace(/_/g, ' ')}.`, true);
    return { ok: true, action: requested };
  }


  return {
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
  };
}
