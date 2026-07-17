import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from './commandRegistry.js';
import { validateActionRequest, actionRequiresConfirmation } from './actionGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getCoreInvariants() {
  return [
    'Only ModVinny can trigger actions.',
    'Non-owner messages may receive harmless chat only.',
    'tj stop/cancel/halt wins before LLM or normal command routing.',
    'LLM output cannot execute raw actions.',
    'LLM output cannot invent action names.',
    'All actions must be registered before execution.',
    'Risky actions must require confirmation.',
    'Every long-running task must check cancellation.',
    'Dashboard and plugin bridge cannot bypass safety.',
    'Memory writes must not corrupt files.',
    'Unsupported features must fail honestly.'
  ];
}

function pass(details = {}) {
  return { ok: true, ...details };
}

function fail(reason, details = {}) {
  return { ok: false, reason, ...details };
}

export function assertOwnerOnly(context = {}) {
  const owner = context.ownerUsername || context.config?.ownerUsername || 'ModVinny';
  if (context.isOwner === true || context.sender === owner || context.username === owner) return pass();
  throw new Error('Owner-only invariant failed.');
}

export function assertNoRawLlmActions(context = {}) {
  if (context.source === 'llm' && (context.actionName || context.rawAction)) throw new Error('LLM attempted to provide a raw action.');
  return pass();
}

export function assertActionHasKnownHandler(actionName, actionApi = {}) {
  const result = validateActionRequest(actionName, {}, { actionApi, sender: 'ModVinny' });
  if (!result.ok && /Unknown action/.test(result.reason || '')) throw new Error(result.reason);
  return pass(result);
}

export function assertRiskyActionConfirmed(action, context = {}) {
  const actionName = typeof action === 'string' ? action : action?.action || action?.name;
  if (actionRequiresConfirmation(actionName) && context.confirmed !== true && context.approved !== true) {
    throw new Error(`${actionName} requires confirmation.`);
  }
  return pass();
}

export function assertCancellationRespected(context = {}) {
  if (context.longRunning === true && context.checksCancellation !== true) throw new Error('Long-running task does not declare cancellation checks.');
  return pass();
}

export function assertNoDirectMineflayerFromUnsafeLayer(moduleName) {
  const filePath = path.isAbsolute(moduleName) ? moduleName : path.join(__dirname, moduleName);
  if (!fs.existsSync(filePath)) return pass({ skipped: true });
  const source = fs.readFileSync(filePath, 'utf8');
  if (/bot\.(dig|placeBlock|attack|chat|setControlState|equip|consume)\s*\(/.test(source)) {
    throw new Error(`${moduleName} appears to call Mineflayer actions directly.`);
  }
  return pass();
}

export function assertDashboardCannotBypassSafety() {
  const routesPath = path.join(__dirname, '..', 'dashboard', 'dashboardRoutes.js');
  if (!fs.existsSync(routesPath)) return pass({ skipped: true });
  const source = fs.readFileSync(routesPath, 'utf8');
  if (/actions\?\.(blueprint|bridge)[A-Z]\w+\s*\(/.test(source)) throw new Error('Dashboard route calls blueprint/bridge action methods directly.');
  return pass();
}

export function assertPluginCannotBypassSafety() {
  const bridgeClientPath = path.join(__dirname, '..', 'bridge', 'bridgeClient.js');
  if (!fs.existsSync(bridgeClientPath)) return pass({ skipped: true });
  const source = fs.readFileSync(bridgeClientPath, 'utf8');
  if (/\/commands?|teleport|give-items?|worldedit/i.test(source)) throw new Error('Plugin bridge exposes forbidden control surface.');
  return pass();
}

export function runCoreInvariantChecks(actionApi = {}) {
  const findings = [];
  try {
    assertDashboardCannotBypassSafety();
  } catch (error) {
    findings.push(error.message);
  }
  try {
    assertPluginCannotBypassSafety();
  } catch (error) {
    findings.push(error.message);
  }
  for (const command of getCommands()) {
    if (!command.action) continue;
    if (command.implemented !== false && actionApi && Object.keys(actionApi).length && typeof actionApi[command.action] !== 'function') {
      findings.push(`Command ${command.name} references missing action ${command.action}.`);
    }
    if (command.requiresConfirmation && !command.ownerOnly) findings.push(`Risky command ${command.name} is not owner-only.`);
  }
  return findings.length ? fail('Core invariant check failed.', { findings }) : pass({ checked: true });
}
