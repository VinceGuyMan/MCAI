import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { configureLogger, info } from '../logger.js';

test('logger rotates multiple generations without overwriting existing Windows destinations', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-logger-'));
  const logDirectory = path.join(projectRoot, 'logs');
  const logFile = path.join(logDirectory, 'mcai.log');
  fs.mkdirSync(logDirectory, { recursive: true });
  t.after(() => {
    configureLogger({ logToFile: false, projectRoot });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const oversized = `active-${'x'.repeat((1024 * 1024) + 32)}`;
  fs.writeFileSync(logFile, oversized, 'utf8');
  fs.writeFileSync(`${logFile}.1`, 'generation-one', 'utf8');
  fs.writeFileSync(`${logFile}.2`, 'generation-two', 'utf8');
  fs.writeFileSync(`${logFile}.3`, 'generation-three', 'utf8');
  fs.writeFileSync(`${logFile}.7`, 'stale-generation', 'utf8');

  configureLogger({
    logLevel: 'info',
    logToFile: true,
    logFile: 'logs/mcai.log',
    maxLogFileSizeMb: 1,
    maxLogFileGenerations: 3,
    redactSecrets: false,
    projectRoot
  });
  info('after rotation');

  assert.equal(fs.readFileSync(`${logFile}.1`, 'utf8'), oversized);
  assert.equal(fs.readFileSync(`${logFile}.2`, 'utf8'), 'generation-one');
  assert.equal(fs.readFileSync(`${logFile}.3`, 'utf8'), 'generation-two');
  assert.equal(fs.existsSync(`${logFile}.4`), false);
  assert.equal(fs.existsSync(`${logFile}.7`), false);
  assert.match(fs.readFileSync(logFile, 'utf8'), /after rotation/);
});
