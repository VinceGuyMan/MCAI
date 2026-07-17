import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPluginCapabilityStatus,
  getPluginInstallStatus,
  getPluginRuntimeStatus,
  pluginHealthCheck
} from '../pluginStatus.js';
import { loadMineflayerPlugins } from '../pluginLoader.js';

test('plugin install status reports known Mineflayer plugins', () => {
  const status = getPluginInstallStatus();
  for (const key of ['pathfinder', 'collectBlock', 'tool', 'autoEat', 'armorManager', 'viewer']) {
    assert.ok(status[key], `${key} status should exist`);
    assert.equal(typeof status[key].installed, 'boolean');
  }
});

test('plugin runtime status handles a bot with no plugins loaded', () => {
  const status = getPluginRuntimeStatus({});
  assert.equal(status.pathfinder.runtimeAvailable, false);
  assert.equal(status.collectBlock.runtimeAvailable, false);
  assert.equal(status.pathfinder.fieldAvailable, false);
  assert.equal(getPluginCapabilityStatus({}).movement, false);
});

test('plugin runtime status waits for spawn before reporting field competence', () => {
  const bot = {
    mcaiPluginsInjected: true,
    mcaiPluginLoadStatus: {
      pathfinder: { loaded: true },
      collectBlock: { loaded: true },
      tool: { loaded: true }
    },
    pathfinder: { goto: async () => true },
    collectBlock: { collect: async () => true },
    tool: { equipForBlock: async () => true }
  };
  const status = getPluginRuntimeStatus(bot);
  assert.equal(status.pathfinder.fieldAvailable, true);
  assert.equal(status.pathfinder.runtimeAvailable, false);
  assert.equal(status.pathfinder.spawned, false);
  assert.equal(getPluginCapabilityStatus(bot).movement, false);
  assert.equal(pluginHealthCheck(bot).ok, false);
});

test('plugin health reports critical plugins ready after spawn', () => {
  const bot = {
    mcaiPluginsInjected: true,
    mcaiPluginsSpawned: true,
    mcaiPluginLoadStatus: {
      pathfinder: { loaded: true },
      collectBlock: { loaded: true },
      tool: { loaded: true }
    },
    pathfinder: { goto: async () => true },
    collectBlock: { collect: async () => true },
    tool: { equipForBlock: async () => true }
  };
  const status = getPluginRuntimeStatus(bot);
  assert.equal(status.pathfinder.runtimeAvailable, true);
  assert.equal(status.collectBlock.runtimeAvailable, true);
  assert.equal(status.tool.runtimeAvailable, true);
  assert.equal(getPluginCapabilityStatus(bot).toolSelection, true);
  assert.equal(pluginHealthCheck(bot).ok, true);
});

test('plugin health reports critical unavailable plugins honestly', () => {
  const result = pluginHealthCheck({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /critical/i);
});

test('plugin loader does not double-load pathfinder', async () => {
  const loaded = [];
  const bot = {
    loadPlugin(plugin) {
      loaded.push(plugin);
      this.pathfinder = { goto: async () => true };
    }
  };
  await loadMineflayerPlugins(bot, { loadOptionalMineflayerPlugins: false });
  await loadMineflayerPlugins(bot, { loadOptionalMineflayerPlugins: false });
  assert.equal(loaded.length, 1);
  assert.equal(bot.mcaiPluginLoadStatus.pathfinder.loaded, true);
});
