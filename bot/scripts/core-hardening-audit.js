import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkills } from '../skillRegistry.js';
import { runCoreInvariantChecks } from '../coreInvariants.js';
import * as cancellation from '../cancellation.js';
import * as confirmationManager from '../confirmationManager.js';
import * as actionGate from '../actionGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(botDir, '..');

const findings = [];

function check(condition, message) {
  if (!condition) findings.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const requiredCancellationExports = [
  'cancelAll',
  'resetCancellation',
  'isCancelled',
  'throwIfCancelled',
  'getCancellationReason',
  'createCancellationToken',
  'registerCancelableTask',
  'unregisterCancelableTask',
  'cancelTask',
  'listActiveCancelableTasks',
  'onCancel',
  'removeCancelHandler'
];

for (const name of requiredCancellationExports) {
  check(typeof cancellation[name] === 'function', `cancellation.js missing export ${name}`);
}

for (const name of ['requestConfirmation', 'confirm', 'rejectConfirmation', 'requiresConfirmation', 'validateConfirmationForAction']) {
  check(typeof confirmationManager[name] === 'function', `confirmationManager.js missing export ${name}`);
}

for (const name of ['executeGatedAction', 'validateActionRequest', 'normalizeActionResult', 'rejectAction']) {
  check(typeof actionGate[name] === 'function', `actionGate.js missing export ${name}`);
}

check(fs.existsSync(path.join(botDir, 'memorySafeWrite.js')), 'memorySafeWrite.js is missing.');
check(fs.existsSync(path.join(botDir, 'test', 'core-hardening.test.js')), 'core-hardening test is missing.');
check(fs.existsSync(path.join(rootDir, 'docs', 'guides', 'CORE_HARDENING.md')), 'docs/guides/CORE_HARDENING.md is missing.');

const dashboardRoutes = read('dashboard/dashboardRoutes.js');
check(!/actions\?\.(blueprint|bridge)[A-Z]\w+\s*\(/.test(dashboardRoutes), 'dashboardRoutes.js still calls blueprint/bridge action methods directly.');
check(/executeAction\(/.test(dashboardRoutes), 'dashboardRoutes.js does not route dashboard actions through executeAction.');

const bridgeClient = read('bridge/bridgeClient.js');
check(!/\/commands?|teleport|give-items?|worldedit/i.test(bridgeClient), 'bridgeClient.js appears to expose forbidden server control.');

const naturalRouter = read('bot/naturalCommandRouter.js');
check(!/actions\.[A-Za-z0-9_]+\s*\(/.test(naturalRouter), 'naturalCommandRouter.js appears to call actions directly.');

const dialogue = read('bot/dialogue.js');
check(!/executeAction\s*\(/.test(dialogue), 'dialogue.js appears to execute actions directly.');

for (const command of getCommands()) {
  if (command.requiresConfirmation) check(command.ownerOnly !== false, `Risky command ${command.name} is not owner-only.`);
  check(command.action, `Command ${command.name} has no action.`);
}

for (const skill of getSkills()) {
  if (skill.requiresConfirmation || skill.riskLevel === 'high') {
    check(skill.safeForAutonomy === false || skill.requiresConfirmation === true, `Risky skill ${skill.name} does not clearly require confirmation or autonomy block.`);
  }
}

const invariantResult = runCoreInvariantChecks();
if (!invariantResult.ok) findings.push(...(invariantResult.findings || [invariantResult.reason]));

if (findings.length) {
  console.error('Core hardening audit failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Core hardening audit passed.');
