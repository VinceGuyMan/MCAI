import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = path.join(__dirname, 'package.json');

export const MINEFLAYER_PLUGIN_DEFINITIONS = [
  {
    key: 'pathfinder',
    packageName: 'mineflayer-pathfinder',
    field: 'pathfinder',
    expectedMethod: 'goto',
    critical: true,
    recommended: true,
    notes: 'Critical for useful movement, following, and returning.'
  },
  {
    key: 'collectBlock',
    packageName: 'mineflayer-collectblock',
    field: 'collectBlock',
    expectedMethod: 'collect',
    critical: true,
    recommended: true,
    notes: 'Critical for reliable gather/mine macros.'
  },
  {
    key: 'tool',
    packageName: 'mineflayer-tool',
    field: 'tool',
    expectedMethod: 'equipForBlock',
    critical: true,
    recommended: true,
    notes: 'Critical for correct mining tool selection.'
  },
  {
    key: 'autoEat',
    packageName: 'mineflayer-auto-eat',
    field: 'autoEat',
    expectedMethod: 'eat',
    critical: false,
    recommended: true,
    notes: 'Recommended for safer food handling.'
  },
  {
    key: 'armorManager',
    packageName: 'mineflayer-armor-manager',
    field: 'armorManager',
    expectedMethod: 'equipAll',
    critical: false,
    recommended: true,
    notes: 'Recommended for safer armor handling.'
  },
  {
    key: 'viewer',
    packageName: 'prismarine-viewer',
    field: 'viewer',
    expectedMethod: null,
    critical: false,
    recommended: false,
    notes: 'Optional visual debugging aid.'
  }
];

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function declaredDependencyVersion(packageName) {
  const pkg = readJsonSafe(PACKAGE_JSON) || {};
  return pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName] || null;
}

function installedPackageVersion(packageName) {
  try {
    const packagePath = require.resolve(`${packageName}/package.json`);
    const pkg = readJsonSafe(packagePath);
    return pkg?.version || null;
  } catch {
    const fallbackPath = path.join(__dirname, 'node_modules', packageName, 'package.json');
    const pkg = readJsonSafe(fallbackPath);
    return pkg?.version || null;
  }
}

function pluginDef(keyOrPackage) {
  return MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === keyOrPackage || definition.packageName === keyOrPackage);
}

export function getPluginInstallStatus() {
  const status = {};
  for (const definition of MINEFLAYER_PLUGIN_DEFINITIONS) {
    const declaredVersion = declaredDependencyVersion(definition.packageName);
    const installedVersion = installedPackageVersion(definition.packageName);
    status[definition.key] = {
      packageName: definition.packageName,
      installed: Boolean(installedVersion),
      declared: Boolean(declaredVersion),
      version: installedVersion || declaredVersion || null,
      critical: definition.critical,
      recommended: definition.recommended,
      notes: definition.notes
    };
  }
  return status;
}

export function getPluginLoadStatus(bot) {
  const loadStatus = {};
  const recorded = bot?.mcaiPluginLoadStatus || {};
  for (const definition of MINEFLAYER_PLUGIN_DEFINITIONS) {
    const entry = recorded[definition.key] || {};
    loadStatus[definition.key] = {
      loaded: Boolean(entry.loaded),
      skipped: Boolean(entry.skipped),
      error: entry.error || '',
      reason: entry.reason || '',
      loadedAt: entry.loadedAt || null
    };
  }
  return loadStatus;
}

function runtimeAvailable(bot, definition) {
  const runtime = bot?.[definition.field];
  if (!runtime) return false;
  if (!definition.expectedMethod) return true;
  return typeof runtime[definition.expectedMethod] === 'function';
}

function spawned(bot) {
  return Boolean(bot?.mcaiPluginsSpawned || bot?.entity || bot?._client?.state === 'play');
}

function injected(bot) {
  return Boolean(bot?.mcaiPluginsInjected);
}

export function getPluginRuntimeStatus(bot) {
  const install = getPluginInstallStatus();
  const load = getPluginLoadStatus(bot);
  const status = {};
  const botInjected = injected(bot);
  const botSpawned = spawned(bot);
  for (const definition of MINEFLAYER_PLUGIN_DEFINITIONS) {
    const fieldAvailable = runtimeAvailable(bot, definition);
    const runtimeOk = fieldAvailable && botSpawned;
    status[definition.key] = {
      ...install[definition.key],
      ...load[definition.key],
      runtimeAvailable: runtimeOk,
      runtimeReady: runtimeOk,
      fieldAvailable,
      injected: botInjected,
      spawned: botSpawned,
      field: `bot.${definition.field}`,
      expectedMethod: definition.expectedMethod,
      notes: load[definition.key]?.error || load[definition.key]?.reason || definition.notes
    };
  }
  return status;
}

export function getPluginCapabilityStatus(bot) {
  const runtime = getPluginRuntimeStatus(bot);
  return {
    movement: Boolean(runtime.pathfinder?.runtimeReady),
    collection: Boolean(runtime.collectBlock?.runtimeReady),
    toolSelection: Boolean(runtime.tool?.runtimeReady),
    autoEat: Boolean(runtime.autoEat?.runtimeReady),
    armor: Boolean(runtime.armorManager?.runtimeReady),
    viewer: Boolean(runtime.viewer?.runtimeReady)
  };
}

export function listMissingRecommendedPlugins() {
  return Object.values(getPluginInstallStatus()).filter((entry) => entry.recommended && !entry.installed);
}

export function listLoadedPlugins(bot) {
  return Object.entries(getPluginRuntimeStatus(bot))
    .filter(([, entry]) => entry.loaded || entry.runtimeAvailable)
    .map(([key, entry]) => ({ key, ...entry }));
}

export function listUnavailablePluginFeatures(bot) {
  return Object.entries(getPluginRuntimeStatus(bot))
    .filter(([, entry]) => entry.recommended && !entry.runtimeReady)
    .map(([key, entry]) => ({ key, ...entry }));
}

export function explainPluginStatus(bot = null) {
  const status = bot ? getPluginRuntimeStatus(bot) : getPluginInstallStatus();
  return Object.entries(status)
    .map(([key, entry]) => {
      const installed = entry.installed ? `installed ${entry.version || ''}`.trim() : 'missing';
      const runtime = bot
        ? `, ${entry.runtimeAvailable ? 'runtime ready' : entry.fieldAvailable ? 'runtime waiting for spawn' : 'runtime unavailable'}`
        : '';
      return `${key}: ${installed}${runtime}`;
    })
    .join('; ');
}

export function pluginHealthCheck(bot = null) {
  const status = bot ? getPluginRuntimeStatus(bot) : getPluginInstallStatus();
  const criticalMissing = Object.entries(status).filter(([, entry]) => entry.critical && !entry.installed);
  const criticalUnavailable = bot
    ? Object.entries(status).filter(([, entry]) => entry.critical && entry.installed && !entry.runtimeReady)
    : [];
  const ok = criticalMissing.length === 0 && criticalUnavailable.length === 0;
  const notReadyNames = [
    ...criticalMissing.map(([, entry]) => entry.packageName),
    ...criticalUnavailable.map(([, entry]) => (
      entry.fieldAvailable && !entry.spawned
        ? `${entry.packageName} (waiting for spawn)`
        : entry.packageName
    ))
  ];
  return {
    ok,
    message: ok
      ? 'Mineflayer critical plugins are installed and ready.'
      : `Mineflayer critical plugins are not field-ready: ${notReadyNames.join(', ')}.`,
    reason: ok ? '' : `Missing, unavailable, or not spawned critical plugins: ${notReadyNames.join(', ')}`,
    evidence: ['plugin_status_reported'],
    data: {
      status,
      capabilities: bot ? getPluginCapabilityStatus(bot) : null,
      missingCritical: criticalMissing.map(([key, entry]) => ({ key, ...entry })),
      unavailableCritical: criticalUnavailable.map(([key, entry]) => ({ key, ...entry })),
      installCommand: 'cd E:\\Games\\MCAI\\bot && npm install mineflayer-collectblock mineflayer-tool'
    }
  };
}

export function getPluginDefinition(keyOrPackage) {
  return pluginDef(keyOrPackage) || null;
}
