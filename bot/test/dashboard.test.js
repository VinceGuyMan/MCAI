import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';
import { createDashboardRequestHandler } from '../../dashboard/dashboardRoutes.js';
import { buildDashboardState, getMemorySummary } from '../../dashboard/dashboardState.js';
import { dashboardRunSkill, dashboardStopAll } from '../../dashboard/dashboardControl.js';
import { redactSecrets, validateDashboardConfig } from '../../dashboard/dashboardSecurity.js';
import { createCancellation } from '../cancellation.js';

const config = {
  ownerUsername: 'ModVinny',
  botUsername: 'tj',
  host: '127.0.0.1',
  port: 25565,
  minecraftVersion: '1.21.11',
  ollamaModel: 'phi4-mini:latest',
  dashboardEnabled: true,
  dashboardHost: '127.0.0.1',
  dashboardPort: 8787,
  dashboardLocalOnly: true,
  dashboardAllowControl: true,
  dashboardAllowDangerousControl: false,
  dashboardRequireOwnerToken: true,
  dashboardToken: 'test-token',
  dashboardAllowSkillRun: true,
  dashboardAllowCurriculumControl: true,
  dashboardAllowGoalControl: true,
  dashboardAllowRawCommand: false
};

function mockBot(extra = {}) {
  return {
    mcaiConfig: config,
    username: 'tj',
    entity: { position: { x: 1, y: 64, z: 2 } },
    players: {},
    entities: {},
    inventory: { items: () => [{ name: 'cooked_beef', count: 3 }], slots: [null, null] },
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    mcaiCancellation: createCancellation(),
    pathfinder: { setGoal: () => {} },
    clearControlStates: () => {},
    ...extra
  };
}

function mockMemory() {
  return {
    get: () => ({ currentTask: null, lastAction: 'test', lastActionAt: 1 })
  };
}

test('dashboardState builds with a mock bot', async () => {
  const state = await buildDashboardState(mockBot(), mockMemory(), { config });
  assert.equal(state.bot.username, 'tj');
  assert.equal(state.bot.connected, true);
  assert.equal(state.inventory.topItems[0].name, 'cooked_beef');
});

test('secrets and local paths are redacted', () => {
  const redacted = redactSecrets({
    dashboardToken: 'test-token',
    nested: { apiKey: 'secret-key' },
    filePath: 'E:\\Games\\MCAI\\config.json'
  });
  assert.equal(redacted.dashboardToken, '[redacted]');
  assert.equal(redacted.nested.apiKey, '[redacted]');
  assert.equal(redacted.filePath.includes('E:\\'), false);
});

test('local dashboard config validates', () => {
  const result = validateDashboardConfig(config);
  assert.equal(result.ok, true);
});

test('public host with default token fails validation', () => {
  const result = validateDashboardConfig({
    ...config,
    dashboardHost: '0.0.0.0',
    dashboardLocalOnly: false,
    dashboardToken: 'change-me-local-token'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /non-default dashboardToken/);
});

test('POST control without token is rejected', async () => {
  const server = http.createServer(createDashboardRequestHandler({ bot: mockBot(), memory: mockMemory(), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/control/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET API without token is rejected', async () => {
  const server = http.createServer(createDashboardRequestHandler({ bot: mockBot(), memory: mockMemory(), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET API with token is accepted', async () => {
  const server = http.createServer(createDashboardRequestHandler({ bot: mockBot(), memory: mockMemory(), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`, {
      headers: { 'x-dashboard-token': 'test-token' }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('dashboardAllowControl=false blocks POST controls even with token', async () => {
  const cancellation = createCancellation();
  const bot = mockBot({ mcaiCancellation: cancellation });
  const server = http.createServer(createDashboardRequestHandler({
    bot,
    memory: mockMemory(),
    config: { ...config, dashboardAllowControl: false }
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/control/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-token': 'test-token' },
      body: '{}'
    });
    assert.equal(response.status, 403);
    assert.equal(cancellation.isCancelled(), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('stop control calls the cancellation adapter', () => {
  const cancellation = createCancellation();
  const bot = mockBot({ mcaiCancellation: cancellation });
  const result = dashboardStopAll(bot, mockMemory(), { reason: 'test stop' });
  assert.equal(result.ok, true);
  assert.equal(cancellation.isCancelled(), true);
});

test('run-skill control rejects risky skills', async () => {
  const result = await dashboardRunSkill(mockBot(), mockMemory(), 'light_portal', {}, { config });
  assert.equal(result.ok, false);
  assert.match(result.reason, /blocked|risky/i);
});

test('dashboard control does not call actions.executeAction directly', () => {
  const source = fs.readFileSync(new URL('../../dashboard/dashboardControl.js', import.meta.url), 'utf8');
  assert.equal(source.includes('executeAction('), false);
});

test('dashboard polling waits for the current refresh before scheduling another', () => {
  const source = fs.readFileSync(new URL('../../dashboard/public/app.js', import.meta.url), 'utf8');
  assert.match(source, /if \(refreshInFlight\) return refreshInFlight;/);
  assert.match(source, /await refresh\(\);[\s\S]*window\.setTimeout\(pollDashboard, state\.intervalMs\);/);
  assert.equal(/setInterval\s*\(\s*refresh/.test(source), false);
});

test('dashboard output does not include dashboard token', async () => {
  const state = await buildDashboardState(mockBot(), mockMemory(), { config });
  assert.equal(JSON.stringify(state).includes('test-token'), false);
});

test('memory summaries are not raw memory dumps', () => {
  const summary = getMemorySummary();
  assert.equal(Array.isArray(summary.conversation.recentTurns), false);
  assert.equal(typeof summary.conversation.memoryFacts, 'number');
});
