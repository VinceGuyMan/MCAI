import * as bridgeClient from './bridgeClient.js';
import { pluginBridgeStatus } from './pluginBridge.js';
import { sanitizeBridgeOutput } from './bridgeSecurity.js';

export async function getBridgeDashboardStatus(config = null) {
  const status = pluginBridgeStatus();
  const health = status.lastHealth || { ok: false, reason: status.lastError || 'Bridge has not been checked yet.' };
  return sanitizeBridgeOutput({
    status,
    health,
    connected: Boolean(health.ok),
    message: health.ok ? 'Server plugin bridge is reachable.' : health.reason || 'Server plugin bridge unavailable.'
  });
}

export async function getBridgeDashboardEvents(config = null) {
  const response = await bridgeClient.getRecentBridgeEvents({ config });
  return sanitizeBridgeOutput(response);
}

export async function getBridgeDashboardRegions(config = null) {
  const response = await bridgeClient.getRegions(config);
  return sanitizeBridgeOutput(response);
}

export async function getBridgeDashboardPlayers(config = null) {
  const response = await bridgeClient.getPlayers(config);
  return sanitizeBridgeOutput(response);
}

export async function getBridgeDashboardHealth(config = null) {
  return sanitizeBridgeOutput(await bridgeClient.bridgeHealthCheck(config));
}
