import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPluginInstallStatus, MINEFLAYER_PLUGIN_DEFINITIONS } from '../pluginStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

function print(line = '') {
  console.log(line);
}

function sourceIncludes(pattern) {
  const files = ['bot.js', 'pluginLoader.js', 'pluginWrappers.js', 'competentCore.js', 'coreMacros.js', 'actions.js'];
  return files.some((file) => {
    const filePath = path.join(botDir, file);
    return fs.existsSync(filePath) && pattern.test(fs.readFileSync(filePath, 'utf8'));
  });
}

print('Mineflayer plugin install check');
print('');

try {
  const packages = MINEFLAYER_PLUGIN_DEFINITIONS.map((definition) => definition.packageName);
  const output = execFileSync('npm', ['ls', ...packages], { cwd: botDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  print(output.trim());
} catch (error) {
  const output = `${error.stdout || ''}${error.stderr || ''}`.trim();
  if (output) print(output);
}

const status = getPluginInstallStatus();
const criticalMissing = [];

print('');
print('| plugin | installed | version | used by code | recommendation |');
print('| --- | --- | --- | --- | --- |');
for (const definition of MINEFLAYER_PLUGIN_DEFINITIONS) {
  const entry = status[definition.key];
  const used = sourceIncludes(new RegExp(`${definition.key}|${definition.packageName}|${definition.field}`, 'i'));
  if (definition.critical && !entry.installed) criticalMissing.push(definition.packageName);
  const recommendation = entry.installed
    ? 'ok'
    : definition.critical
      ? `install: npm install ${definition.packageName}`
      : definition.recommended
        ? `recommended: npm install ${definition.packageName}`
        : 'optional';
  print(`| ${definition.packageName} | ${entry.installed ? 'yes' : 'no'} | ${entry.version || '-'} | ${used ? 'yes' : 'no'} | ${recommendation} |`);
}

if (criticalMissing.length) {
  print('');
  print(`Critical plugins missing: ${criticalMissing.join(', ')}`);
  print('Install critical plugins with:');
  print('  cd E:\\Games\\MCAI\\bot');
  print('  npm install mineflayer-collectblock mineflayer-tool');
  process.exitCode = 1;
} else {
  print('');
  print('Critical Mineflayer plugins are installed.');
}
