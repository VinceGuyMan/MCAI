import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG_PATH = path.resolve(__dirname, '..', 'session-log.jsonl');
const MAX_LINES = 1000;
const SECRET_PATTERNS = [
  /[A-Za-z0-9_-]*token[A-Za-z0-9_-]*/gi,
  /[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*/gi,
  /bearer\s+[A-Za-z0-9._-]+/gi
];
let lastEventSignature = null;
let lastEventAt = 0;

function logPath(filePath = null) {
  return filePath || process.env.MCAI_SESSION_LOG || DEFAULT_LOG_PATH;
}

function enabled(config = {}) {
  return config.sessionRecorderEnabled !== false;
}

export function redactSessionSecrets(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let output = value.replace(/[A-Z]:\\[^\s"']+/g, '[local-path]');
    for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, '[redacted]');
    return output.slice(0, 1000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(redactSessionSecrets);
  if (typeof value === 'object') {
    const safe = {};
    for (const [key, entry] of Object.entries(value).slice(0, 30)) {
      if (/token|secret|api[_-]?key|password/i.test(key)) safe[key] = '[redacted]';
      else safe[key] = redactSessionSecrets(entry);
    }
    return safe;
  }
  return value;
}

function rotateIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= MAX_LINES) return;
  fs.writeFileSync(filePath, `${lines.slice(-MAX_LINES).join('\n')}\n`);
}

export function recordSessionEvent(type, details = {}, config = {}) {
  if (!enabled(config)) return { ok: true, skipped: true, reason: 'session recorder disabled' };
  const signature = JSON.stringify({
    type,
    ownerText: details.ownerText || '',
    canonicalCommand: details.canonicalCommand || '',
    result: details.result || '',
    source: details.source || ''
  });
  const now = Date.now();
  if (signature === lastEventSignature && now - lastEventAt < (config.sessionDuplicateSuppressMs || 1000)) {
    return { ok: true, skipped: true, reason: 'duplicate session event' };
  }
  lastEventSignature = signature;
  lastEventAt = now;
  const event = redactSessionSecrets({
    timestamp: now,
    type: String(type || 'event').slice(0, 80),
    ...details
  });
  const filePath = logPath(config.sessionLogFile);
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
  rotateIfNeeded(filePath);
  return { ok: true, event };
}

export function getRecentSessionEvents(limit = 50, filePath = null) {
  const target = logPath(filePath);
  if (!fs.existsSync(target)) return [];
  return fs.readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-Math.max(1, Number(limit) || 50))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { timestamp: 0, type: 'malformed_session_log_line' };
      }
    });
}

export function clearSessionLog(confirm = false, filePath = null) {
  if (confirm !== true) return { ok: false, reason: 'Confirmation required.' };
  fs.writeFileSync(logPath(filePath), '');
  return { ok: true };
}
