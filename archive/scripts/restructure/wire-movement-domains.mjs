import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const createPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../actions/createActions.js');
let src = fs.readFileSync(createPath, 'utf8');

const importNeedle = "import { attachLazyTier2 } from './lazyTier2.js';";
const domainImports = `import { attachLazyTier2 } from './lazyTier2.js';
import { createRuntimeContext } from './domains/runtimeContext.js';
import { createThinHandlers } from './domains/thin.js';
import { createMovementHandlers } from './domains/movement.js';`;

if (!src.includes("from './domains/runtimeContext.js'")) {
  if (!src.includes(importNeedle)) throw new Error('lazyTier2 import not found');
  src = src.replace(importNeedle, domainImports);
}

const startMarker = `  const { memory, taskQueue, safety, perception, cancellation } = deps;
  bot.mcaiConfig = config;
  bot.mcaiMemory = memory;
  let movements = null;`;

const endMarker = `  async function lookAtOwner() {
    const owner = ownerEntity();
    if (!owner) return false;
    await bot.lookAt(owner.position.offset(0, 1.6, 0), true);
    return true;
  }

  async function answerChat(text) {`;

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);
if (startIdx < 0) throw new Error('start marker not found');
if (endIdx < 0) throw new Error('end marker not found');

const replacement = `  const { memory, taskQueue, safety, perception, cancellation } = deps;
  bot.mcaiConfig = config;
  bot.mcaiMemory = memory;

  // Shared runtime (movement, chat, cancel) + thin + movement domains
  let api = null;
  const runtime = createRuntimeContext({ bot, config, memory, safety, cancellation, Movements });
  const {
    state,
    setupMovements,
    say,
    ownerPlayer,
    ownerEntity,
    shouldSuppressOwnerFacingChat,
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    isExpectedPathInterrupt,
    ownerDistance,
    waitUntilNearOwner,
    resetCancellation,
    clearPendingOwnerDecisions,
    stopMotion
  } = runtime;
  // Local alias kept for existing gatherWood / resource tick updates
  let lastTaskUpdateAt = 0;

  const thinHandlers = createThinHandlers({
    bot,
    config,
    memory,
    say,
    perception,
    cancellation,
    taskQueue,
    safety,
    getApi: () => api
  });
  const {
    thinActionContext,
    runThinAction,
    thinStatusAction,
    thinStopAction,
    thinComeToOwnerAction,
    thinFollowOwnerAction,
    thinStayAction,
    thinCollectResourceAction,
    thinEatIfHungryAction,
    thinEquipToolForAction,
    thinEquipArmorAction,
    thinCraftItemAction,
    thinStoreItemsAction,
    thinReturnHomeAction,
    thinRememberHomeAction,
    thinMissingRequirementsAction
  } = thinHandlers;

  const {
    stop,
    status,
    comeToOwner,
    followOwner,
    stay,
    lookAtOwner
  } = createMovementHandlers({
    bot,
    config,
    memory,
    taskQueue,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    ownerDistance,
    waitUntilNearOwner,
    throwIfCancelled,
    isExpectedPathInterrupt,
    stopMotion,
    clearPendingOwnerDecisions,
    posText,
    GoalFollow,
    curriculumExecutor,
    blueprintSystem,
    thinStatusAction,
    thinComeToOwnerAction,
    thinFollowOwnerAction,
    thinStayAction
  });

  async function answerChat(text) {`;

src = src.slice(0, startIdx) + replacement + src.slice(endIdx + endMarker.length - '  async function answerChat(text) {'.length);

// Remove duplicate thin handler implementations
const thinStart = src.indexOf('  function thinActionContext(context = {}) {');
const thinEndMarker = `  async function thinMissingRequirementsAction(args = {}, context = {}) {
    return runThinAction('report_missing_requirements', args, context);
  }

`;
const thinEnd = src.indexOf(thinEndMarker);
if (thinStart < 0 || thinEnd < 0) {
  console.warn('thin block not found for removal', { thinStart, thinEnd });
} else {
  src = src.slice(0, thinStart) + src.slice(thinEnd + thinEndMarker.length);
  console.log('removed inline thin handlers');
}

// const api = { → api = {
src = src.replace(/\n  const api = \{/, '\n  api = {');

// Remove clearAllConfirmations import if unused - check later

fs.writeFileSync(createPath, src);
console.log('wired', createPath, 'bytes', src.length);
