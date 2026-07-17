const DEFAULT_TOKEN = 'change-me-local-token';
const SECRET_KEY_PATTERN = /(api[_-]?key|token|password|secret|credential|authorization|cookie|env)/i;
const LOCAL_PATH_PATTERN = /[A-Za-z]:\\[^\s"',}]+/g;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isLoopbackAddress(address = '') {
  const value = String(address || '').replace(/^::ffff:/, '');
  return value === '127.0.0.1' || value === '::1' || value === 'localhost' || value === '';
}

export function validateDashboardConfig(config = {}) {
  const errors = [];
  const warnings = [];
  const host = String(config.dashboardHost || '127.0.0.1');
  const port = Number(config.dashboardPort || 8787);
  const localOnly = config.dashboardLocalOnly !== false;
  const requireToken = config.dashboardRequireOwnerToken !== false;
  const token = String(config.dashboardToken || '');
  const publicBinding = host === '0.0.0.0' || host === '::' || (!isLoopbackAddress(host) && host !== '127.0.0.1');

  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(`dashboardPort must be 1-65535, got ${config.dashboardPort}`);
  if (localOnly && publicBinding) errors.push('dashboardLocalOnly=true refuses non-loopback dashboardHost');
  if (publicBinding) warnings.push('dashboardHost is not loopback; keep this dashboard private.');
  if (requireToken && !token) errors.push('dashboardToken is required when dashboardRequireOwnerToken=true');
  if (publicBinding && (!token || token === DEFAULT_TOKEN)) errors.push('public dashboard binding requires a non-default dashboardToken');
  if (!publicBinding && token === DEFAULT_TOKEN) warnings.push('dashboardToken is still the default; this is acceptable only for local-only testing.');

  return { ok: errors.length === 0, errors, warnings, host, port, publicBinding };
}

export function refusePublicBindingIfUnsafe(config = {}) {
  const validation = validateDashboardConfig(config);
  if (!validation.ok) {
    const error = new Error(validation.errors.join('; '));
    error.validation = validation;
    throw error;
  }
  return validation;
}

export function getDashboardTokenFromRequest(req) {
  const headerToken = req.headers?.['x-dashboard-token'];
  if (headerToken) return String(headerToken);
  const auth = String(req.headers?.authorization || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function assertLocalRequest(req) {
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return isLoopbackAddress(remote);
}

export function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

export function requireDashboardToken(req, res, config = {}) {
  if (config.dashboardRequireOwnerToken === false) return true;
  const expected = String(config.dashboardToken || '');
  const actual = getDashboardTokenFromRequest(req);
  if (expected && actual === expected) return true;
  writeJson(res, 401, { ok: false, reason: 'Dashboard token required.' });
  return false;
}

export function validateControlRequest(req, res, config = {}) {
  if (config.dashboardLocalOnly !== false && !assertLocalRequest(req)) {
    writeJson(res, 403, { ok: false, reason: 'Dashboard is local-only.' });
    return false;
  }
  return requireDashboardToken(req, res, config);
}

export function validateApiRequest(req, res, config = {}) {
  if (config.dashboardLocalOnly !== false && !assertLocalRequest(req)) {
    writeJson(res, 403, { ok: false, reason: 'Dashboard is local-only.' });
    return false;
  }
  return requireDashboardToken(req, res, config);
}

export function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^'"\s]+/gi, '$1=[redacted]')
      .replace(LOCAL_PATH_PATTERN, '[local path]');
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactSecrets(item, seen));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]';
    } else if (/path|file|directory/i.test(key) && typeof item === 'string') {
      output[key] = item.replace(LOCAL_PATH_PATTERN, '[local path]');
    } else if (isPlainObject(item) || Array.isArray(item)) {
      output[key] = redactSecrets(item, seen);
    } else {
      output[key] = redactSecrets(item, seen);
    }
  }
  return output;
}

export function sanitizeDashboardOutput(data) {
  return redactSecrets(data);
}
