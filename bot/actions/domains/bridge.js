/**
 * Server bridge + mineflayer plugin wrapper actions.
 */
import * as pluginBridge from '../../../bridge/pluginBridge.js';
import * as bridgeClient from '../../../bridge/bridgeClient.js';
import * as pluginStatus from '../../pluginStatus.js';
import * as pluginWrappers from '../../pluginWrappers.js';

export function createBridgeHandlers(ctx) {
  const {
    bot, config, memory, say, cancellation
  } = ctx;

  async function sayBridgeResult(result, fallback = 'Bridge action finished.') {
    const message = result?.message || result?.reason || fallback;
    say(message, true);
    return result;
  }

  function bridgeStatusMessage(status, health = null) {
    if (health && !health.ok) return `Server plugin bridge unavailable: ${health.reason || 'not connected'}. tj still works without it.`;
    if (!status.initialized) return 'Server plugin bridge is not initialized.';
    if (!status.available) return `Server plugin bridge unavailable: ${status.lastError || 'not connected'}. tj still works without it.`;
    const server = status.lastStatus?.serverName || 'local-paper';
    const players = status.lastStatus?.onlinePlayers?.length ?? 0;
    return `Server plugin bridge connected to ${server}. Online players: ${players}. Recent events: ${status.recentEvents?.length || 0}.`;
  }

  async function serverBridgeStatusAction() {
    const health = await bridgeClient.bridgeHealthCheck(config);
    const status = pluginBridge.pluginBridgeStatus();
    const evidence = health.ok ? ['bridge_status_reported', 'bridge_connected'] : ['bridge_status_reported', 'bridge_unavailable'];
    return sayBridgeResult({
      ok: true,
      message: bridgeStatusMessage({ ...status, available: health.ok || status.available }, health.ok ? null : health),
      evidence,
      data: { status, health }
    });
  }

  async function serverStatusAction() {
    const response = await bridgeClient.getBridgeStatus(config);
    if (!response.ok) return sayBridgeResult({ ok: false, reason: response.reason, evidence: ['bridge_unavailable'], data: response });
    const players = Array.isArray(response.data?.onlinePlayers) ? response.data.onlinePlayers.join(', ') || 'none' : 'unknown';
    return sayBridgeResult({
      ok: true,
      message: `Server: ${response.data.serverName || 'local-paper'}, MC ${response.data.minecraftVersion || config.minecraftVersion}, players: ${players}.`,
      evidence: ['bridge_status_reported', 'bridge_connected'],
      data: response.data
    });
  }

  async function bridgeHealthAction() {
    const response = await bridgeClient.bridgeHealthCheck(config);
    return sayBridgeResult({
      ok: true,
      message: response.ok ? 'Bridge health check passed.' : `Bridge health unavailable: ${response.reason}`,
      evidence: response.ok ? ['bridge_status_reported', 'bridge_connected'] : ['bridge_status_reported', 'bridge_unavailable'],
      data: response
    });
  }

  async function bridgeRecentEventsAction() {
    const response = await bridgeClient.getRecentBridgeEvents({ config });
    if (!response.ok) return sayBridgeResult({ ok: false, reason: response.reason, evidence: ['bridge_unavailable'], data: response });
    const events = Array.isArray(response.data?.events) ? response.data.events : [];
    const summary = events.slice(0, 5).map((event) => `${event.type}: ${event.message || event.id}`).join('; ') || 'none';
    return sayBridgeResult({
      ok: true,
      message: `Recent server events: ${summary}.`,
      evidence: events.length ? ['bridge_status_reported', 'bridge_event_received'] : ['bridge_status_reported'],
      data: { events }
    });
  }

  async function bridgeRecentDeathsAction() {
    const response = await bridgeClient.getRecentDeaths(config);
    if (!response.ok) return sayBridgeResult({ ok: false, reason: response.reason, evidence: ['bridge_unavailable'], data: response });
    const events = Array.isArray(response.data?.events) ? response.data.events : [];
    const summary = events.slice(0, 5).map((event) => `${event.player || 'player'}: ${event.message || event.id}`).join('; ') || 'none';
    return sayBridgeResult({ ok: true, message: `Recent bridge deaths: ${summary}.`, evidence: events.length ? ['bridge_status_reported', 'bridge_player_death_recorded'] : ['bridge_status_reported'], data: { events } });
  }

  async function bridgeRecentAdvancementsAction() {
    const response = await bridgeClient.getRecentAdvancements(config);
    if (!response.ok) return sayBridgeResult({ ok: false, reason: response.reason, evidence: ['bridge_unavailable'], data: response });
    const events = Array.isArray(response.data?.events) ? response.data.events : [];
    const summary = events.slice(0, 5).map((event) => `${event.player || 'player'} ${event.details?.key || event.message || event.id}`).join('; ') || 'none';
    return sayBridgeResult({ ok: true, message: `Recent bridge advancements: ${summary}.`, evidence: events.length ? ['bridge_status_reported', 'bridge_advancement_recorded'] : ['bridge_status_reported'], data: { events } });
  }

  async function bridgeRegionsAction() {
    const response = await bridgeClient.getRegions(config);
    if (!response.ok) return sayBridgeResult({ ok: false, reason: response.reason, evidence: ['bridge_unavailable'], data: response });
    const regions = Array.isArray(response.data?.regions) ? response.data.regions : [];
    const summary = regions.slice(0, 6).map((region) => `${region.name || region.id} (${region.type || 'custom'})`).join(', ') || 'none';
    return sayBridgeResult({ ok: true, message: `Bridge regions: ${summary}.`, evidence: ['bridge_status_reported'], data: { regions } });
  }

  async function bridgeRegisterRegionAction(input = {}, context = {}) {
    const type = typeof input === 'string' ? input : input.type || input.regionType || 'home';
    if (context.sender && context.sender !== config.ownerUsername) return sayBridgeResult({ ok: false, reason: 'Only ModVinny can register bridge regions.' });
    let result;
    if (/farm/.test(type)) result = await pluginBridge.registerFarmRegionWithBridge(bot, memory, null, config);
    else if (/village/.test(type)) result = await pluginBridge.registerVillageRegionWithBridge(bot, memory, null, config);
    else if (/portal/.test(type)) result = await pluginBridge.registerPortalRegionWithBridge(bot, memory, null, config);
    else result = await pluginBridge.registerHomeRegionWithBridge(bot, memory, config);
    return sayBridgeResult({
      ok: Boolean(result.ok),
      message: result.ok ? `Registered ${type} region with the bridge.` : `Could not register ${type} region: ${result.reason || 'bridge unavailable'}.`,
      evidence: result.ok ? ['bridge_region_registered'] : ['bridge_unavailable'],
      data: result
    });
  }

  async function bridgeDeleteRegionAction(input = {}) {
    const id = typeof input === 'string' ? input : input.id || input.name || '';
    if (!id) return sayBridgeResult({ ok: false, reason: 'Tell me which bridge region to delete.' });
    const response = await bridgeClient.deleteRegion(id, config);
    return sayBridgeResult({
      ok: Boolean(response.ok),
      message: response.ok ? `Bridge region delete requested: ${id}.` : `Could not delete bridge region: ${response.reason}`,
      evidence: response.ok ? ['bridge_region_deleted'] : ['bridge_unavailable'],
      data: response
    });
  }

  async function bridgeEmergencyStopAction(reason = 'owner bridge emergency stop test') {
    const response = await bridgeClient.sendEmergencyStop(typeof reason === 'string' ? reason : 'owner bridge emergency stop test', config);
    if (response.ok) cancellation.cancelAll('server plugin bridge emergency stop');
    return sayBridgeResult({
      ok: Boolean(response.ok),
      message: response.ok ? 'Bridge emergency stop sent and local cancellation triggered.' : `Bridge emergency stop unavailable: ${response.reason}`,
      evidence: response.ok ? ['bridge_emergency_stop_received'] : ['bridge_unavailable'],
      data: response
    });
  }

  async function mineflayerPluginStatusAction() {
    const result = pluginStatus.pluginHealthCheck(bot);
    const status = result.data?.status || {};
    const summary = Object.entries(status)
      .map(([key, entry]) => `${key}:${entry.runtimeAvailable ? 'loaded' : entry.installed ? 'installed' : 'missing'}`)
      .join(', ');
    const message = `${result.message} ${summary}`;
    say(message, true);
    return { ...result, message, data: { ...result.data, summary } };
  }

  async function pluginWrapperStatusAction() {
    const result = pluginWrappers.pluginWrapperStatus(bot);
    say(result.message, true);
    return result;
  }

  async function pluginPathToOwnerAction(args = {}, context = {}) {
    return pluginWrappers.pathToOwnerSafely(bot, {
      ...(typeof args === 'object' ? args : {}),
      config,
      cancellation,
      source: context.source || 'actions'
    });
  }

  async function pluginFollowOwnerAction(args = {}, context = {}) {
    return pluginWrappers.followOwnerSafely(bot, {
      ...(typeof args === 'object' ? args : {}),
      config,
      cancellation,
      source: context.source || 'actions'
    });
  }

  async function pluginCollectBlocksAction(args = {}, context = {}) {
    const options = typeof args === 'object' ? args : { blockName: String(args || '') };
    const blockInput = options.blockNames || options.blockName || options.resourceName || options.resource || options.kind;
    return pluginWrappers.collectBlockSafely(bot, blockInput, {
      ...options,
      config,
      cancellation,
      safety,
      state: perception(),
      requireToolPlugin: options.requireToolPlugin !== false,
      source: context.source || 'actions'
    });
  }

  async function pluginEatSafelyAction(args = {}, context = {}) {
    return pluginWrappers.eatSafely(bot, {
      ...(typeof args === 'object' ? args : {}),
      config,
      cancellation,
      source: context.source || 'actions'
    });
  }


  return {
    sayBridgeResult,
    bridgeStatusMessage,
    serverBridgeStatusAction,
    serverStatusAction,
    bridgeHealthAction,
    bridgeRecentEventsAction,
    bridgeRecentDeathsAction,
    bridgeRecentAdvancementsAction,
    bridgeRegionsAction,
    bridgeRegisterRegionAction,
    bridgeDeleteRegionAction,
    bridgeEmergencyStopAction,
    mineflayerPluginStatusAction,
    pluginWrapperStatusAction,
    pluginPathToOwnerAction,
    pluginFollowOwnerAction,
    pluginCollectBlocksAction,
    pluginEatSafelyAction
  };
}
