import { loadConfig } from '../bot/config.js';
import { sanitizeBridgeOutput } from './bridgeSecurity.js';

function cfg(config = null) {
  return config || loadConfig();
}

function bridgeBaseUrl(config = null) {
  const active = cfg(config);
  const host = active.serverPluginHost || '127.0.0.1';
  const port = Number(active.serverPluginPort || 8791);
  return `http://${host}:${port}`;
}

async function bridgeRequest(path, options = {}) {
  const config = cfg(options.config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.serverPluginTimeoutMs || 5000));
  const method = options.method || 'GET';
  const headers = { accept: 'application/json' };
  if (method !== 'GET' && config.serverPluginRequireToken !== false) headers['X-MCAI-Bridge-Token'] = String(config.serverPluginToken || '');
  if (options.body) headers['content-type'] = 'application/json';

  try {
    const response = await fetch(`${bridgeBaseUrl(config)}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 2048) };
    }
    return sanitizeBridgeOutput({ ok: response.ok, status: response.status, available: response.ok, data, reason: response.ok ? '' : data.reason || response.statusText });
  } catch (error) {
    return { ok: false, available: false, reason: error.name === 'AbortError' ? 'Bridge request timed out.' : `Bridge unavailable: ${error.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBridgeStatus(config = null) {
  return bridgeRequest('/status', { config });
}

export async function getRecentBridgeEvents(options = {}) {
  const query = options.since ? `?since=${encodeURIComponent(options.since)}` : '';
  return bridgeRequest(`/events${query}`, options);
}

export async function getPlayers(config = null) {
  return bridgeRequest('/players', { config });
}

export async function getPlayer(name, config = null) {
  return bridgeRequest(`/players/${encodeURIComponent(name)}`, { config });
}

export async function getRegions(config = null) {
  return bridgeRequest('/regions', { config });
}

export async function getRegionsNear(position = {}, radius = 32, config = null) {
  const world = encodeURIComponent(position.world || 'world');
  const x = Number(position.x || 0);
  const y = Number(position.y || 64);
  const z = Number(position.z || 0);
  return bridgeRequest(`/regions/near?world=${world}&x=${x}&y=${y}&z=${z}&radius=${Number(radius || 32)}`, { config });
}

export async function registerRegion(region, config = null) {
  return bridgeRequest('/regions/register', { method: 'POST', body: region, config });
}

export async function deleteRegion(id, config = null) {
  return bridgeRequest('/regions/delete', { method: 'POST', body: { id }, config });
}

export async function getRecentDeaths(config = null) {
  return bridgeRequest('/deaths/recent', { config });
}

export async function getRecentAdvancements(config = null) {
  return bridgeRequest('/advancements/recent', { config });
}

export async function sendEmergencyStop(reason = 'tj bridge emergency stop', config = null) {
  return bridgeRequest('/control/emergency-stop', { method: 'POST', body: { reason }, config });
}

export async function bridgeHealthCheck(config = null) {
  return bridgeRequest('/health', { config });
}

export { bridgeRequest, bridgeBaseUrl };
