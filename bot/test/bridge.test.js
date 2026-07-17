import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bridgeEventToEvidence } from '../../bridge/bridgeEvidence.js';
import { redactSecrets, validateBridgeConfig } from '../../bridge/bridgeSecurity.js';
import { normalizeBridgeEvent } from '../../bridge/bridgeEvents.js';
import { validateBridgeEvent, validateBridgeRegion } from '../../bridge/bridgeValidator.js';
import { handleBridgeEmergencyStop, processBridgeEvent } from '../../bridge/pluginBridge.js';
import { getCommands } from '../commandRegistry.js';
import { getSkill } from '../skillRegistry.js';

const localConfig = {
  serverPluginBridgeEnabled: true,
  serverPluginBridgeMode: 'local_http',
  serverPluginHost: '127.0.0.1',
  serverPluginPort: 8791,
  serverPluginLocalOnly: true,
  serverPluginRequireToken: true,
  serverPluginToken: 'change-me-server-bridge-token',
  serverPluginAllowDangerousControl: false,
  serverPluginAllowServerCommands: false,
  serverPluginAllowTeleport: false,
  serverPluginAllowGiveItems: false,
  serverPluginAllowWorldEdit: false,
  serverPluginAllowOperatorActions: false
};

test('bridge config accepts local default token only for local binding', () => {
  const result = validateBridgeConfig(localConfig);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('bridge config rejects public host with default token', () => {
  const result = validateBridgeConfig({
    ...localConfig,
    serverPluginHost: '0.0.0.0',
    serverPluginLocalOnly: false
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /non-default token/i);
});

test('bridge security redacts token and paths', () => {
  const redacted = redactSecrets({
    serverPluginToken: 'secret',
    nested: { token: 'abc' },
    path: 'E:\\Games\\MCAI\\config.json'
  });
  assert.equal(redacted.serverPluginToken, '[redacted]');
  assert.equal(redacted.nested.token, '[redacted]');
  assert.equal(String(redacted.path).includes('E:\\'), false);
});

test('bridge event validator rejects malformed events', () => {
  const result = validateBridgeEvent({ id: '', type: '', timestamp: 0, position: { x: Infinity, y: 64, z: 0 } });
  assert.equal(result.ok, false);
});

test('bridge region validator rejects bad regions', () => {
  const result = validateBridgeRegion({ id: 'bad', min: { x: 0 }, max: { x: 1 } });
  assert.equal(result.ok, false);
});

test('player death maps to bridge evidence', () => {
  const event = normalizeBridgeEvent({
    id: 'evt_1',
    type: 'player_death',
    world: 'world',
    player: 'ModVinny',
    position: { x: 1, y: 64, z: 2 },
    message: 'ModVinny died'
  });
  const evidence = bridgeEventToEvidence(event);
  assert.equal(evidence.includes('bridge_player_death_recorded'), true);
});

test('advancement maps to bridge evidence', () => {
  const evidence = bridgeEventToEvidence(normalizeBridgeEvent({ type: 'player_advancement_done', world: 'world', details: { key: 'minecraft:story/mine_stone' } }));
  assert.equal(evidence.includes('bridge_advancement_recorded'), true);
});

test('protected region event maps to bridge evidence', () => {
  const evidence = bridgeEventToEvidence(normalizeBridgeEvent({ type: 'block_break_in_region', world: 'world', details: { regionId: 'home_base' } }));
  assert.equal(evidence.includes('bridge_protected_region_event'), true);
});

test('bridge emergency stop calls cancellation mock', () => {
  let reason = '';
  const bot = { mcaiCancellation: { cancelAll: (value) => { reason = value; } } };
  const updates = [];
  const memory = { update: (patch) => updates.push(patch) };
  const result = handleBridgeEmergencyStop(bot, memory, normalizeBridgeEvent({ type: 'bridge_emergency_stop', world: 'world' }));
  assert.equal(result.ok, true);
  assert.match(reason, /server plugin bridge emergency stop/);
  assert.equal(updates.length, 1);
});

test('bridge processing dedupes already seen event ids', () => {
  let state = { bridgeProcessedEventIds: [] };
  const memory = {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
    }
  };
  const event = normalizeBridgeEvent({
    id: 'evt_duplicate_test',
    type: 'player_death',
    world: 'world',
    player: 'ModVinny',
    position: { x: 1, y: 64, z: 2 },
    message: 'ModVinny died'
  });

  const first = processBridgeEvent({}, memory, event);
  const second = processBridgeEvent({}, memory, event);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.equal(state.bridgeLastEventId, 'evt_duplicate_test');
  assert.deepEqual(state.bridgeProcessedEventIds, ['evt_duplicate_test']);
  assert.equal(state.recentBridgeEvents.length, 1);
});

test('bridge commands and skills are registered', () => {
  const actions = new Set(getCommands().map((command) => command.action));
  for (const action of ['serverBridgeStatus', 'bridgeRecentEvents', 'bridgeRegions', 'bridgeEmergencyStop']) {
    assert.equal(actions.has(action), true, `${action} command should exist`);
  }
  assert.equal(getSkill('bridge_register_region').requiresConfirmation, true);
  assert.equal(getSkill('bridge_emergency_stop').riskLevel, 'low');
});

test('bridge modules do not expose raw server command controls', () => {
  const source = fs.readFileSync(new URL('../../bridge/bridgeClient.js', import.meta.url), 'utf8') +
    fs.readFileSync(new URL('../../server-plugin/src/main/java/com/mcai/bridge/MCAIBridgePlugin.java', import.meta.url), 'utf8');
  assert.equal(/server-command|raw-command|\/command|\/teleport|\/give/i.test(source), false);
});
