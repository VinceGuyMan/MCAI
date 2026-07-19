import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInstallConfig, validateConfig } from '../configSchema.js';
import {
  eulaIsAccepted,
  initializeConfigIfMissing,
  processMatchesRole,
  syncBridgePluginConfig,
  upgradeLegacyConfigSecrets
} from '../../launcher/aio-node.mjs';

test('first-run config accepts generic identities and generates private tokens', () => {
  const first = createInstallConfig({ ownerUsername: 'Alex', botUsername: 'helper_bot', firstRunComplete: true });
  const second = createInstallConfig({ ownerUsername: 'Steve', firstRunComplete: true });
  const result = validateConfig(first);

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(first.friendlyPlayers[0], 'Alex');
  assert.notEqual(first.dashboardToken, second.dashboardToken);
  assert.notEqual(first.serverPluginToken, second.serverPluginToken);
  assert.ok(first.dashboardToken.length >= 20);
  assert.ok(first.serverPluginToken.length >= 20);
});

test('offline Minecraft binding is loopback-only without explicit expert override', () => {
  const unsafe = createInstallConfig({
    ownerUsername: 'Alex',
    host: '0.0.0.0',
    dashboardToken: 'this-is-a-private-dashboard-token',
    serverPluginToken: 'this-is-a-private-server-bridge-token',
    firstRunComplete: true
  });
  const rejected = validateConfig(unsafe);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(' '), /offline Minecraft hosting must use a loopback host/);

  const expert = validateConfig({ ...unsafe, allowLanServerBinding: true });
  assert.equal(expert.ok, true, expert.errors.join('\n'));
  assert.match(expert.warnings.join(' '), /trusted network/);
});

test('launcher initializes a missing config without overwriting an existing one', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-launcher-config-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const filePath = path.join(tempDir, 'config.json');

  assert.equal(initializeConfigIfMissing(filePath, { ownerUsername: 'Player' }), true);
  const created = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(created.firstRunComplete, false);
  assert.equal(created.ownerUsername, 'Player');
  assert.notEqual(created.dashboardToken, 'change-me-local-token');
  assert.equal(initializeConfigIfMissing(filePath, { ownerUsername: 'OverwriteAttempt' }), false);
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).ownerUsername, 'Player');
});

test('launcher upgrades legacy placeholder secrets without changing identities', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-launcher-upgrade-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const filePath = path.join(tempDir, 'config.json');
  const legacy = createInstallConfig({
    ownerUsername: 'Alex',
    botUsername: 'helper_bot',
    dashboardToken: 'change-me-local-token',
    serverPluginToken: 'change-me-server-bridge-token',
    firstRunComplete: true
  });
  delete legacy.allowLanServerBinding;
  delete legacy.firstRunComplete;
  fs.writeFileSync(filePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');

  const updated = upgradeLegacyConfigSecrets(filePath);
  const migrated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(updated.sort(), ['allowLanServerBinding', 'dashboardToken', 'firstRunComplete', 'serverPluginToken']);
  assert.equal(migrated.ownerUsername, 'Alex');
  assert.equal(migrated.botUsername, 'helper_bot');
  assert.equal(migrated.allowLanServerBinding, false);
  assert.equal(migrated.firstRunComplete, true);
  assert.notEqual(migrated.dashboardToken, legacy.dashboardToken);
  assert.notEqual(migrated.serverPluginToken, legacy.serverPluginToken);
  assert.deepEqual(upgradeLegacyConfigSecrets(filePath), []);
});

test('launcher process matching is scoped to this MCAI root', () => {
  const root = path.resolve(os.tmpdir(), 'MCAI-process-scope');
  const botEntry = path.join(root, 'bot', 'bot.js');
  const dashboardEntry = path.join(root, 'dashboard', 'server.js');
  assert.equal(processMatchesRole({ name: 'node.exe', commandLine: `node "${botEntry}"` }, 'bot', root), true);
  assert.equal(processMatchesRole({ name: 'node.exe', commandLine: `node ${path.resolve(os.tmpdir(), 'OtherProject', 'bot.js')}` }, 'bot', root), false);
  assert.equal(processMatchesRole({ name: 'node.exe', commandLine: `node "${dashboardEntry}"` }, 'dashboard', root), true);
  assert.equal(processMatchesRole({ name: 'java.exe', commandLine: `"${path.join(root, '.runtime', 'java', 'bin', 'java.exe')}" -jar paper-1.21.11.jar` }, 'server', root), true);
});

test('EULA detection requires an explicit eula=true entry', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-eula-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const filePath = path.join(tempDir, 'eula.txt');
  assert.equal(eulaIsAccepted(filePath), false);
  fs.writeFileSync(filePath, '# https://aka.ms/MinecraftEULA\neula=false\n', 'utf8');
  assert.equal(eulaIsAccepted(filePath), false);
  fs.writeFileSync(filePath, '# https://aka.ms/MinecraftEULA\neula=true\n', 'utf8');
  assert.equal(eulaIsAccepted(filePath), true);
});

test('launcher synchronizes an installed bridge with private local security settings', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-bridge-config-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const pluginsDir = path.join(tempDir, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, 'MCAIBridge-0.2.0.jar'), '', 'utf8');

  const cfg = createInstallConfig({
    ownerUsername: 'Alex',
    firstRunComplete: true,
    serverPluginToken: 'private-bridge-token-for-test'
  });
  const result = syncBridgePluginConfig(cfg, tempDir);
  const pluginConfig = fs.readFileSync(path.join(pluginsDir, 'MCAIBridge', 'config.yml'), 'utf8');

  assert.equal(result.managed, true);
  assert.equal(result.changed, true);
  assert.match(pluginConfig, /host: "127\.0\.0\.1"/);
  assert.match(pluginConfig, /require-token: true/);
  assert.match(pluginConfig, /token: "private-bridge-token-for-test"/);
  assert.match(pluginConfig, /allow-public-bind: false/);
  assert.match(pluginConfig, /allow-dangerous-control: false/);
  assert.equal(syncBridgePluginConfig(cfg, tempDir).changed, false);
});

test('managed Paper child accepts an authenticated graceful stop command', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-managed-server-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const statePath = path.join(tempDir, 'managed-server.json');
  const managedEntry = fileURLToPath(new URL('../../launcher/managed-child.mjs', import.meta.url));
  const nonce = 'test-managed-server-nonce';
  const childCode = [
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (data) => { if (data.includes('stop')) process.exit(0) })",
    'setInterval(() => {}, 1000)'
  ].join(';');
  const supervisor = spawn(process.execPath, [
    managedEntry,
    '--role', 'server',
    '--state', statePath,
    '--cwd', tempDir,
    '--nonce', nonce,
    '--', process.execPath,
    '-e', childCode
  ], { stdio: 'ignore', windowsHide: true });
  t.after(() => { try { supervisor.kill('SIGKILL'); } catch { /* already exited */ } });

  const deadline = Date.now() + 5000;
  while (!fs.existsSync(statePath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(fs.existsSync(statePath), true, 'managed state was not created');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  const status = await new Promise((resolve) => {
    const body = JSON.stringify({ action: 'stop' });
    const request = http.request({
      hostname: '127.0.0.1',
      port: state.controlPort,
      path: '/control',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-mcai-nonce': nonce
      }
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', () => resolve(0));
    request.end(body);
  });
  assert.equal(status, 202);

  const exitDeadline = Date.now() + 5000;
  while (fs.existsSync(statePath) && Date.now() < exitDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(fs.existsSync(statePath), false, 'managed state should be removed after graceful exit');
});
