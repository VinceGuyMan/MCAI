import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

let failures = 0;

function file(relPath) {
  return path.join(botDir, relPath);
}

function read(relPath) {
  return fs.existsSync(file(relPath)) ? fs.readFileSync(file(relPath), 'utf8') : '';
}

function pass(name, detail = '') {
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failures += 1;
  console.error(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
}

function exists(relPath) {
  fs.existsSync(file(relPath)) ? pass(`${relPath} exists`) : fail(`${relPath} exists`);
}

exists('pluginStatus.js');
exists('pluginLoader.js');
exists('pluginWrappers.js');
exists('scripts/plugins-check.js');
exists('test/plugin-wrappers.test.js');
exists('test/plugins-status.test.js');

const wrappers = read('pluginWrappers.js');
if (/digOneBlockDirect/.test(wrappers) && /collectBlock\?\.collect/.test(wrappers) && /mineflayer-pathfinder/.test(wrappers)) {
  pass('collection wrapper has a safe direct-dig path and explicit collectBlock fallback');
} else {
  fail('collection wrapper has a safe direct-dig path and explicit collectBlock fallback');
}
if (/mineflayer-tool/.test(wrappers) && /is not loaded/.test(wrappers)) pass('tool wrapper fails honestly when missing');
else fail('tool wrapper fails honestly when missing');
if (/allowFallbackWithoutPlugin/.test(wrappers)) pass('fallback is explicit and config-gated');
else fail('fallback is explicit and config-gated');

const macros = read('coreMacros.js');
if (/plugin_path_to_owner|thin_come_to_owner/.test(macros)) pass('come_here uses plugin/thin path wrapper action');
else fail('come_here uses plugin/thin path wrapper action');
const directCollectWrapperCount = (macros.match(/plugin_collect_blocks/g) || []).length;
const thinCollectWrapperCount = (macros.match(/collect_resource/g) || []).length;
if (directCollectWrapperCount >= 4 || thinCollectWrapperCount >= 4) pass('gather/mine core macros use collection wrapper action');
else fail('gather/mine core macros use collection wrapper action');
if (!/actionStep\('resource_run_|actionStep\('mine_(stone|coal|iron)'/.test(macros)) pass('core gather/mine macros do not silently use old weak action path');
else fail('core gather/mine macros still reference old gather/mine action path');

const actions = `${read('actions.js')}\n${read('actions/createActions.js')}`;
for (const action of ['mineflayer_plugin_status', 'plugin_wrapper_status', 'plugin_path_to_owner', 'plugin_collect_blocks']) {
  if (actions.includes(action)) pass(`action registered: ${action}`);
  else fail(`action registered: ${action}`);
}

const commands = read('commandRegistry.js');
if (/mineflayer_plugin_status/.test(commands) && /tj plugin status/.test(commands)) pass('plugin status command registered');
else fail('plugin status command registered');

const bot = read('bot.js');
if (/loadMineflayerPlugins/.test(bot)) pass('bot startup uses central plugin loader');
else fail('bot startup uses central plugin loader');

const loader = read('pluginLoader.js');
if (!/teleport|give|command endpoint|server command/i.test(loader)) pass('plugin loader has no dangerous server control');
else fail('plugin loader includes suspicious dangerous-control wording');

if (failures) {
  console.error(`Plugin audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('Plugin audit passed.');
