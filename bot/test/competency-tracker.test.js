import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getCompetencyReport,
  scoreCommandReliability,
  scoreSkillReliability,
  updateCompetencyFromEvidence,
  updateCompetencyFromFailure
} from '../competencyTracker.js';
import { recordSessionEvent, getRecentSessionEvents, redactSessionSecrets } from '../sessionRecorder.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-competency-'));
process.env.MCAI_SESSION_LOG = path.join(tempDir, 'session-log.jsonl');

test('competency score updates from evidence-shaped stats', () => {
  const reliable = scoreSkillReliability('status', { successCount: 5, failureCount: 0, partialCount: 0 });
  assert.equal(reliable.level, 'reliable');
  const shaky = scoreSkillReliability('status', { successCount: 1, failureCount: 3, partialCount: 0 });
  assert.ok(['shaky', 'blocked'].includes(shaky.level));
  const evidence = updateCompetencyFromEvidence('status', ['status_reported']);
  assert.equal(evidence.evidenceSeen, 1);
});

test('command reliability and failure updates return safe summaries', () => {
  const command = scoreCommandReliability('tj get food');
  assert.ok(['untested', 'improving', 'reliable', 'shaky', 'blocked'].includes(command.level));
  const failure = updateCompetencyFromFailure('tj get food', 'missing food nearby');
  assert.equal(failure.command, 'tj get food');
  assert.match(failure.lastFailureReason, /missing/);
});

test('competency report has expected buckets', () => {
  const report = getCompetencyReport();
  assert.ok(report.counts);
  assert.ok(Array.isArray(report.untested));
});

test('session recorder redacts secrets and local paths', () => {
  const redacted = redactSessionSecrets({
    dashboardToken: 'change-me-local-token',
    message: 'path E:\\Games\\MCAI\\config.json bearer abc.def'
  });
  assert.equal(redacted.dashboardToken, '[redacted]');
  assert.doesNotMatch(redacted.message, /E:\\Games/);
  assert.doesNotMatch(redacted.message, /abc\.def/);

  recordSessionEvent('test_event', { secretToken: 'abc', file: 'E:\\Games\\MCAI\\memory.json' }, { sessionRecorderEnabled: true });
  const events = getRecentSessionEvents(1);
  assert.equal(events.at(-1).type, 'test_event');
  assert.equal(events.at(-1).secretToken, '[redacted]');
});

