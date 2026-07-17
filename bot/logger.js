import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let currentConfig = {
  logLevel: 'info',
  logToFile: true,
  logFile: 'logs/mcai.log',
  maxLogFileSizeMb: 10,
  redactSecrets: true,
  projectRoot: defaultProjectRoot
};
const recentLogs = [];
const MAX_RECENT_LOGS = 1000;

function redact(value) {
  let text = String(value ?? '');
  if (!currentConfig.redactSecrets) return text;
  text = text.replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^'"\s]+/gi, '$1=[redacted]');
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, '[local path]');
  return text;
}

function shouldLog(level) {
  return levels[level] >= levels[currentConfig.logLevel || 'info'];
}

function rotateIfNeeded(file) {
  try {
    const maxBytes = Math.max(1, currentConfig.maxLogFileSizeMb || 10) * 1024 * 1024;
    if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    // Logging should never crash the bot.
  }
}

function write(level, scope, args) {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const message = args.map(redact).join(' ');
  recentLogs.push({ timestamp, level, category: scope, message });
  if (recentLogs.length > MAX_RECENT_LOGS) recentLogs.splice(0, recentLogs.length - MAX_RECENT_LOGS);

  const line = `[${timestamp}] [${level}] [${scope}] ${message}\n`;
  if (level === 'error') console.error(line.trimEnd());
  else if (level === 'warn') console.warn(line.trimEnd());
  else console.log(line.trimEnd());

  if (!currentConfig.logToFile) return;
  try {
    const file = path.isAbsolute(currentConfig.logFile)
      ? currentConfig.logFile
      : path.join(currentConfig.projectRoot || process.cwd(), currentConfig.logFile || 'logs/mcai.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    fs.appendFileSync(file, line);
  } catch {
    // Logging should never crash the bot.
  }
}

export function configureLogger(config = {}) {
  currentConfig = { ...currentConfig, ...config };
}

export function debug(...args) { write('debug', 'debug', args); }
export function info(...args) { write('info', 'info', args); }
export function warn(...args) { write('warn', 'warn', args); }
export function error(...args) { write('error', 'error', args); }
export function event(...args) { write('info', 'event', args); }
export function action(...args) { write('info', 'action', args); }
export function safety(...args) { write('warn', 'safety', args); }
export function llm(...args) { write('warn', 'llm', args.map((arg) => String(arg).slice(0, 500))); }
export function task(...args) { write('info', 'task', args); }

export function getRecentLogs(limit = 200) {
  const count = Math.max(0, Math.min(Number(limit) || 200, MAX_RECENT_LOGS));
  return recentLogs.slice(-count).map((entry) => ({ ...entry }));
}
