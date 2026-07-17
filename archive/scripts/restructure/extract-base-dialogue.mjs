/**
 * Extract dialogue + base domains from createActions.js and wire them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
const domainsDir = path.join(botRoot, 'actions', 'domains');

let src = fs.readFileSync(createPath, 'utf8');

function sliceBetween(startMark, endMark, label) {
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`slice failed (${label}): ${startIdx},${endIdx}`);
  }
  return { startIdx, endIdx, body: src.slice(startIdx, endIdx) };
}

function listFnNames(body) {
  const names = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(body))) names.push(m[1]);
  return names;
}

function removeBetween(startMark, endMark, label) {
  const { startIdx, endIdx } = sliceBetween(startMark, endMark, label);
  src = src.slice(0, startIdx) + src.slice(endIdx);
  console.log('removed', label);
}

// --- dialogue ---
const dialogueSlice = sliceBetween(
  '  async function answerChat(text) {',
  '  function pendingGearConfirmation(type, args = {}, message = null) {',
  'dialogue'
);
const dialogueNames = listFnNames(dialogueSlice.body);

const dialogueModule = `/**
 * Dialogue / personality / conversation memory handlers.
 */
import * as conversationMemory from '../../conversationMemory.js';
import * as personality from '../../personality.js';

export function createDialogueHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say
  } = ctx;

${dialogueSlice.body}
  return {
    ${dialogueNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'dialogue.js'), dialogueModule, 'utf8');
console.log('wrote dialogue.js', dialogueNames);

// --- base: camp utility + home/storage/build/resource ---
const utilSlice = sliceBetween(
  '  async function collectDropsAction(itemName = null) {',
  '  function resourceOptions(extra = {}) {',
  'base-util'
);
const homeSlice = sliceBetween(
  '  async function setHomeAction() {',
  '  async function combatStatusAction() {',
  'base-home'
);
const baseBody = `${utilSlice.body}${homeSlice.body}`;
const baseNames = listFnNames(baseBody);

const baseModule = `/**
 * Base camp: items, home, storage, building, resource runs, sleep/light.
 */
import { Vec3 } from 'vec3';
import * as inventory from '../../inventory.js';
import * as placement from '../../placement.js';
import * as lighting from '../../lighting.js';
import * as homeBase from '../../homeBase.js';
import * as storage from '../../storage.js';
import * as builder from '../../builder.js';
import * as resourceRuns from '../../resourceRuns.js';
import * as baseMaintenance from '../../baseMaintenance.js';
import { normalizeActionCount, wait, posText } from '../shared.js';

export function createBaseHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    throwIfCancelled,
    isCancelled,
    stopMotion,
    resourceOptions,
    syncWaypoint,
    thinRememberHomeAction,
    thinReturnHomeAction,
    thinCollectResourceAction,
    thinStoreItemsAction,
    GoalNear
  } = ctx;

${baseBody}
  return {
    ${baseNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'base.js'), baseModule, 'utf8');
console.log('wrote base.js', baseNames);

// --- wire createActions ---
if (!src.includes("from './domains/dialogue.js'")) {
  src = src.replace(
    "import { createExplorationHandlers } from './domains/exploration.js';",
    `import { createExplorationHandlers } from './domains/exploration.js';
import { createDialogueHandlers } from './domains/dialogue.js';
import { createBaseHandlers } from './domains/base.js';`
  );
}

// Change survival getResourceRunAction to use let holder
if (!src.includes('let resourceRunAction')) {
  src = src.replace(
    `  const survival = createSurvivalHandlers({
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    comeToOwner,
    thinCollectResourceAction,
    thinEquipArmorAction,
    GoalNear,
    // Function declaration below is hoisted within createActions.
    getResourceRunAction: () => resourceRunAction
  });
`,
    `  // Assigned when base domain is created (resource runs live there).
  let resourceRunAction = async () => ({ ok: false, message: 'resource run not ready' });

  const survival = createSurvivalHandlers({
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    comeToOwner,
    thinCollectResourceAction,
    thinEquipArmorAction,
    GoalNear,
    getResourceRunAction: () => resourceRunAction
  });
`
  );
}

// Insert dialogue right after survival destructuring ends (before pending gear or after toolStatus })
const survivalEnd = `    toolStatus
  } = survival;

`;
if (!src.includes('createDialogueHandlers(')) {
  if (!src.includes(survivalEnd)) throw new Error('survival end marker not found');
  const dialogueWire = `${survivalEnd}
  const dialogueHandlers = createDialogueHandlers({
    bot,
    config,
    memory,
    say
  });
  const {
    ${dialogueNames.join(',\n    ')}
  } = dialogueHandlers;

`;
  src = src.replace(survivalEnd, dialogueWire);
}

// Remove dialogue body (now after wire - markers still work if wire is before body)
// After insert, answerChat still exists later until we remove it
removeBetween(
  '  async function answerChat(text) {',
  '  function pendingGearConfirmation(type, args = {}, message = null) {',
  'dialogue body'
);

// Remove base util before resourceOptions
removeBetween(
  '  async function collectDropsAction(itemName = null) {',
  '  function resourceOptions(extra = {}) {',
  'base util body'
);

// Remove base home after nether confirm through combat
removeBetween(
  '  async function setHomeAction() {',
  '  async function combatStatusAction() {',
  'base home body'
);

// Insert base domain after exploration handlers (has resourceOptions, map helpers, thin actions)
const exploreEnd = `  } = explorationHandlers;

`;
if (!src.includes('createBaseHandlers(')) {
  // find explorationHandlers destructuring end
  const marker = '  } = explorationHandlers;';
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('explorationHandlers end not found');
  const insertAt = idx + marker.length;
  const baseWire = `

  const baseHandlers = createBaseHandlers({
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    throwIfCancelled,
    isCancelled,
    stopMotion,
    resourceOptions,
    syncWaypoint,
    thinRememberHomeAction,
    thinReturnHomeAction,
    thinCollectResourceAction,
    thinStoreItemsAction,
    GoalNear
  });
  const {
    ${baseNames.join(',\n    ')}
  } = baseHandlers;
  resourceRunAction = baseHandlers.resourceRunAction;

`;
  src = src.slice(0, insertAt) + baseWire + src.slice(insertAt);
  console.log('inserted base handlers');
}

// Fix storeItems if thin path exists - check original for thinStoreItems in storeItemsAction
// Original storeItemsAction didn't use thinStoreItems in the slice - ok

fs.writeFileSync(createPath, src, 'utf8');
console.log('wrote createActions', src.length);
