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
  maxLogFileGenerations: 5,
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

function archivePath(file, generation) {
  return `${file}.${generation}`;
}

function removeFileIfPresent(file) {
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function pruneOldArchives(file, maxGenerations) {
  const directory = path.dirname(file);
  const baseName = path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const archivePattern = new RegExp(`^${baseName}\\.([1-9]\\d*)$`);
  for (const entry of fs.readdirSync(directory)) {
    const match = entry.match(archivePattern);
    if (match && Number(match[1]) >= maxGenerations) {
      removeFileIfPresent(path.join(directory, entry));
    }
  }
}

function rotateLogFile(file, maxGenerations) {
  // Delete destinations before rename: Node/Windows does not reliably replace an
  // existing file with renameSync, unlike POSIX platforms.
  pruneOldArchives(file, maxGenerations);
  for (let generation = maxGenerations - 1; generation >= 1; generation -= 1) {
    const source = archivePath(file, generation);
    if (!fs.existsSync(source)) continue;
    const destination = archivePath(file, generation + 1);
    removeFileIfPresent(destination);
    fs.renameSync(source, destination);
  }
  const firstArchive = archivePath(file, 1);
  removeFileIfPresent(firstArchive);
  fs.renameSync(file, firstArchive);
}

function rotateIfNeeded(file) {
  try {
    const configuredMb = Number(currentConfig.maxLogFileSizeMb);
    const maxBytes = Math.max(1, Number.isFinite(configuredMb) ? configuredMb : 10) * 1024 * 1024;
    const configuredGenerations = Number(currentConfig.maxLogFileGenerations);
    const maxGenerations = Math.max(
      1,
      Math.min(100, Number.isFinite(configuredGenerations) ? Math.trunc(configuredGenerations) : 5)
    );
    if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) {
      rotateLogFile(file, maxGenerations);
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
