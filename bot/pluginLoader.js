import { MINEFLAYER_PLUGIN_DEFINITIONS, getPluginRuntimeStatus } from './pluginStatus.js';

const loadErrors = [];

function attachRuntimeVerification(bot) {
  if (!bot || bot.mcaiPluginRuntimeVerificationAttached) return;
  bot.mcaiPluginRuntimeVerificationAttached = true;
  bot.once?.('inject_allowed', () => {
    bot.mcaiPluginsInjected = true;
    setTimeout(() => verifyLoadedPlugins(bot, { phase: 'inject_allowed' }), 0);
  });
  bot.once?.('spawn', () => {
    bot.mcaiPluginsSpawned = true;
    setTimeout(() => verifyLoadedPlugins(bot, { phase: 'spawn' }), 0);
  });
}

function setStatus(bot, key, patch) {
  if (!bot.mcaiPluginLoadStatus) bot.mcaiPluginLoadStatus = {};
  bot.mcaiPluginLoadStatus[key] = {
    ...(bot.mcaiPluginLoadStatus[key] || {}),
    ...patch
  };
}

function pluginExport(module, definition) {
  const candidates = [
    module?.[definition.key],
    module?.plugin,
    module?.loader,
    module?.pathfinder,
    module?.default?.[definition.key],
    module?.default?.plugin,
    module?.default?.loader,
    module?.default?.pathfinder,
    module?.default
  ];
  return candidates.find((candidate) => typeof candidate === 'function') || null;
}

async function loadPluginPackage(bot, definition, options = {}) {
  if (!bot?.loadPlugin) {
    setStatus(bot, definition.key, { loaded: false, error: 'bot.loadPlugin unavailable' });
    return false;
  }
  if (bot.mcaiPluginLoadStatus?.[definition.key]?.loaded) return true;
  try {
    const module = await import(definition.packageName);
    const plugin = pluginExport(module, definition);
    if (!plugin) {
      const error = `${definition.packageName} did not expose a Mineflayer plugin function`;
      setStatus(bot, definition.key, { loaded: false, error });
      loadErrors.push({ key: definition.key, packageName: definition.packageName, error });
      console.warn(`[plugins] ${error}`);
      return false;
    }
    bot.loadPlugin(plugin);
    setStatus(bot, definition.key, {
      loaded: true,
      skipped: false,
      error: '',
      reason: '',
      loadedAt: Date.now()
    });
    console.log(`[plugins] Loaded ${definition.packageName}`);
    return true;
  } catch (error) {
    const message = /Cannot find package|ERR_MODULE_NOT_FOUND/i.test(error.message || '')
      ? `${definition.packageName} not installed`
      : error.message || String(error);
    setStatus(bot, definition.key, { loaded: false, error: message });
    loadErrors.push({ key: definition.key, packageName: definition.packageName, error: message });
    if (definition.critical || options.warnOptional) console.warn(`[plugins] ${message}`);
    return false;
  }
}

export async function loadPathfinder(bot) {
  return loadPluginPackage(bot, MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === 'pathfinder'));
}

export async function loadCollectBlock(bot) {
  return loadPluginPackage(bot, MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === 'collectBlock'), { warnOptional: true });
}

export async function loadTool(bot) {
  return loadPluginPackage(bot, MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === 'tool'), { warnOptional: true });
}

export async function loadAutoEat(bot) {
  return loadPluginPackage(bot, MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === 'autoEat'));
}

export async function loadArmorManager(bot) {
  return loadPluginPackage(bot, MINEFLAYER_PLUGIN_DEFINITIONS.find((definition) => definition.key === 'armorManager'));
}

export async function loadViewer(bot) {
  const definition = MINEFLAYER_PLUGIN_DEFINITIONS.find((item) => item.key === 'viewer');
  setStatus(bot, definition.key, { loaded: false, skipped: true, reason: 'viewer is disabled unless explicitly wired' });
  return false;
}

export async function loadMineflayerPlugins(bot, config = {}) {
  if (!bot) return {};
  attachRuntimeVerification(bot);
  bot.mcaiConfig = { ...(bot.mcaiConfig || {}), ...(config || {}) };
  await loadPathfinder(bot);
  if (config.loadOptionalMineflayerPlugins === false) {
    for (const definition of MINEFLAYER_PLUGIN_DEFINITIONS.filter((item) => item.key !== 'pathfinder')) {
      setStatus(bot, definition.key, { loaded: false, skipped: true, reason: 'optional plugin loading disabled' });
    }
  } else {
    await loadTool(bot);
    await loadCollectBlock(bot);
    await loadAutoEat(bot);
    await loadArmorManager(bot);
    await loadViewer(bot);
  }
  verifyLoadedPlugins(bot, { phase: 'registered' });
  return bot.mcaiPluginLoadStatus || {};
}

export function verifyLoadedPlugins(bot, options = {}) {
  const status = getPluginRuntimeStatus(bot);
  const phase = options.phase || 'runtime';
  const awaitingInjection = !bot?.mcaiPluginsInjected && phase === 'registered';
  console.log(`[plugins] Mineflayer plugin status (${phase}):`);
  for (const [key, entry] of Object.entries(status)) {
    const awaitingSpawn = entry.fieldAvailable && !entry.spawned;
    let state = 'missing';
    if (entry.runtimeReady) state = 'loaded';
    else if (awaitingInjection && entry.loaded) state = 'registered; waiting for Mineflayer inject';
    else if (awaitingSpawn) state = 'runtime loaded; waiting for spawn';
    else if (entry.skipped) state = `skipped${entry.reason ? ` (${entry.reason})` : ''}`;
    else if (entry.installed) state = 'installed but runtime unavailable';
    console.log(`[plugins] - ${key}: ${state}`);
    if (entry.critical && !entry.runtimeReady && !awaitingInjection && !awaitingSpawn) {
      console.warn(`[plugins] WARNING: tj will not be field-competent until ${entry.packageName} is installed and loaded.`);
    }
  }
  return status;
}

export function getPluginLoadErrors() {
  return [...loadErrors];
}
