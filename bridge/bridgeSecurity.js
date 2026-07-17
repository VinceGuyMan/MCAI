export const DEFAULT_BRIDGE_TOKEN = 'change-me-server-bridge-token';

export function isLoopbackHost(host) {
  const value = String(host || '').toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

export function validateBridgeConfig(config = {}) {
  const errors = [];
  const warnings = [];
  const host = String(config.serverPluginHost || '127.0.0.1');
  const port = Number(config.serverPluginPort || 8791);
  const publicBinding = host === '0.0.0.0' || host === '::' || !isLoopbackHost(host);
  const token = String(config.serverPluginToken || '');

  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(`serverPluginPort must be 1-65535, got ${config.serverPluginPort}`);
  if (config.serverPluginLocalOnly !== false && publicBinding) errors.push('serverPluginLocalOnly=true refuses non-loopback serverPluginHost');
  if (publicBinding && token === DEFAULT_BRIDGE_TOKEN) errors.push('public server plugin bridge binding requires a non-default token');
  if (config.serverPluginAllowServerCommands) errors.push('serverPluginAllowServerCommands must stay false');
  if (config.serverPluginAllowTeleport) errors.push('serverPluginAllowTeleport must stay false');
  if (config.serverPluginAllowGiveItems) errors.push('serverPluginAllowGiveItems must stay false');
  if (config.serverPluginAllowWorldEdit) errors.push('serverPluginAllowWorldEdit must stay false');
  if (config.serverPluginAllowOperatorActions) errors.push('serverPluginAllowOperatorActions must stay false');
  if (config.serverPluginAllowDangerousControl) warnings.push('serverPluginAllowDangerousControl should stay false');
  if (!publicBinding && token === DEFAULT_BRIDGE_TOKEN) warnings.push('serverPluginToken is still the default; acceptable only for local-only testing.');
  if (config.serverPluginRequireToken !== false && !token) errors.push('serverPluginToken is required when serverPluginRequireToken=true');
  return { ok: errors.length === 0, errors, warnings };
}

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|key|env|path/i.test(key)) output[key] = '[redacted]';
    else output[key] = redactSecrets(item);
  }
  return output;
}

export function sanitizeBridgeOutput(data) {
  return redactSecrets(data);
}

export function validateControlRequest(req, config = {}) {
  if (config.serverPluginRequireToken === false) return { ok: true };
  const expected = String(config.serverPluginToken || '');
  const supplied = req?.headers?.['x-mcai-bridge-token'] || req?.headers?.['x-dashboard-token'];
  if (!expected || supplied !== expected) return { ok: false, reason: 'Bridge token required.' };
  return { ok: true };
}

export function refusePublicBindingIfUnsafe(config = {}) {
  const validation = validateBridgeConfig(config);
  return validation.ok ? { ok: true, warnings: validation.warnings } : validation;
}
