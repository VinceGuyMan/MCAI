/**
 * Extract survival handlers from createActions.js into domains/survival.js
 * and rewire createActions to use createSurvivalHandlers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
const survivalPath = path.join(botRoot, 'actions', 'domains', 'survival.js');

let src = fs.readFileSync(createPath, 'utf8');

const startMark = '  async function findNearestTree(task = null) {';
const endMark = '  function pendingGearConfirmation(type, args = {}, message = null) {';
const startIdx = src.indexOf(startMark);
const endIdx = src.indexOf(endMark);
if (startIdx < 0 || endIdx < 0) {
  throw new Error(`markers not found start=${startIdx} end=${endIdx}`);
}

let body = src.slice(startIdx, endIdx);
// Dedent by 2 spaces for module body inside factory
body = body.replace(/^  /gm, '  '); // keep as-is inside factory with 2-space base

// Fix lastTaskUpdateAt → state.lastTaskUpdateAt
body = body.replace(/\blastTaskUpdateAt\b/g, 'state.lastTaskUpdateAt');

// resourceRunAction → getResourceRunAction()
body = body.replace(/return resourceRunAction\(/g, 'return getResourceRunAction()(');

const survivalModule = `/**
 * Survival domain: wood/stone gather basics, crafting, armor, food, inventory tools.
 */
import { Vec3 } from 'vec3';
import * as crafting from '../../crafting.js';
import * as armor from '../../armor.js';
import * as food from '../../food.js';
import * as inventory from '../../inventory.js';
import * as pluginWrappers from '../../pluginWrappers.js';
import { isCancelledError } from '../../cancellation.js';
import {
  normalizeActionCount,
  logNames,
  toolPreference,
  normalizeToolRequest,
  itemDurabilityLeft,
  toolCandidates,
  wait,
  distance
} from '../shared.js';

/**
 * @param {object} ctx
 */
export function createSurvivalHandlers(ctx) {
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
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    comeToOwner,
    thinCollectResourceAction,
    thinEquipArmorAction,
    GoalNear,
    getResourceRunAction
  } = ctx;

${body}  return {
    findNearestTree,
    equipBestTool,
    equipToolAction,
    digNearestSafeBlock,
    collectNearbyDrops,
    checkWoodGoal,
    gatherWood,
    reportCraftResult,
    craftItemAction,
    craftGenericToolAction,
    craftPlanks,
    craftSticks,
    craftCraftingTable,
    placeCraftingTable,
    craftWoodenPickaxe,
    craftStonePickaxe,
    craftWoodenAxe,
    craftTorches,
    craftLighting,
    craftStorage,
    craftShelterSupplies,
    craftUtilityItems,
    craftTravelItems,
    craftBuildingBlocks,
    craftSurvivalKit,
    craftingStatusAction,
    canCraftItemAction,
    confirmCraftItem,
    craftBasicTools,
    craftStoneTools,
    armorStatus,
    equipBestArmor,
    craftBestAffordableArmor,
    craftIronArmor,
    craftLeatherArmor,
    craftDiamondArmorConfirmed,
    ensureArmoredForSurvival,
    mineStone,
    fleeDanger,
    foodStatus,
    eatIfHungry,
    findFood,
    getFood,
    makeFood,
    cookFood,
    craftFood,
    huntPassiveFood,
    fishForFood,
    gatherPlantFood,
    handleFoodSurvival,
    stayNearFriendlyPlayers,
    surviveTick,
    taskStatusText,
    inventoryStatus,
    countInventory,
    toolStatus
  };
}
`;

fs.writeFileSync(survivalPath, survivalModule, 'utf8');
console.log('wrote', survivalPath);

// Wire imports
if (!src.includes("from './domains/survival.js'")) {
  src = src.replace(
    "import { createMovementHandlers } from './domains/movement.js';",
    "import { createMovementHandlers } from './domains/movement.js';\nimport { createSurvivalHandlers } from './domains/survival.js';"
  );
}

// Remove local lastTaskUpdateAt alias if present
src = src.replace(/\n  \/\/ Local alias kept for existing gatherWood \/ resource tick updates\n  let lastTaskUpdateAt = 0;\n/, '\n');

// Insert survival factory after movement handlers block
const movementEnd = `  } = createMovementHandlers({
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
`;

if (!src.includes(movementEnd)) {
  throw new Error('movement block end not found for insertion');
}

const survivalWire = `${movementEnd}
  // Filled after resourceRunAction is defined (mineStone uses it via getter).
  let resourceRunActionRef = null;

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
    getResourceRunAction: () => resourceRunActionRef
  });
  const {
    findNearestTree,
    equipBestTool,
    equipToolAction,
    digNearestSafeBlock,
    collectNearbyDrops,
    checkWoodGoal,
    gatherWood,
    reportCraftResult,
    craftItemAction,
    craftGenericToolAction,
    craftPlanks,
    craftSticks,
    craftCraftingTable,
    placeCraftingTable,
    craftWoodenPickaxe,
    craftStonePickaxe,
    craftWoodenAxe,
    craftTorches,
    craftLighting,
    craftStorage,
    craftShelterSupplies,
    craftUtilityItems,
    craftTravelItems,
    craftBuildingBlocks,
    craftSurvivalKit,
    craftingStatusAction,
    canCraftItemAction,
    confirmCraftItem,
    craftBasicTools,
    craftStoneTools,
    armorStatus,
    equipBestArmor,
    craftBestAffordableArmor,
    craftIronArmor,
    craftLeatherArmor,
    craftDiamondArmorConfirmed,
    ensureArmoredForSurvival,
    mineStone,
    fleeDanger,
    foodStatus,
    eatIfHungry,
    findFood,
    getFood,
    makeFood,
    cookFood,
    craftFood,
    huntPassiveFood,
    fishForFood,
    gatherPlantFood,
    handleFoodSurvival,
    stayNearFriendlyPlayers,
    surviveTick,
    taskStatusText,
    inventoryStatus,
    countInventory,
    toolStatus
  } = survival;
`;

src = src.replace(movementEnd, survivalWire);

// Remove extracted body from createActions (between findNearestTree and pendingGearConfirmation)
const newStartIdx = src.indexOf(startMark);
const newEndIdx = src.indexOf(endMark);
if (newStartIdx < 0 || newEndIdx < 0) throw new Error('could not re-find body markers after wire');
src = src.slice(0, newStartIdx) + src.slice(newEndIdx);

// After resourceRunAction is defined as a function, assign the ref.
// Find: async function resourceRunAction(
// After the function ends is hard; instead assign at first use time via getter already.
// Better: patch the function declaration to also set ref:
// async function resourceRunAction(...) {
// → async function resourceRunAction(...) { resourceRunActionRef = resourceRunAction; 
// Actually assign after full definition:
// Look for "async function resourceRunAction" and after the function we need assignment.
// Simplest approach: change getter and define:
//   function resourceRunAction(...) 
// and at end of createActions before api:
// resourceRunActionRef = resourceRunAction - but function must exist.
// Use:
//   async function resourceRunAction(...args) { ... }
//   resourceRunActionRef = resourceRunAction;
// Search for the function and inject assignment right after its closing is hard.
// Alternative: replace getResourceRunAction body usage with deferred:
//   getResourceRunAction: () => resourceRunAction
// and use temporal: declare `async function resourceRunAction` later - getter called at runtime only when mineStone runs, so function must be hoisted!
// Function declarations are hoisted within createActions scope. So we can use:
//   getResourceRunAction: () => resourceRunAction
// WITHOUT a ref, if resourceRunAction is a function declaration later in the same scope.

// Switch to that: fix survival.js and wire to not need ref
// Re-write survival to call resourceRunAction from ctx directly as function ref that will be set...

// Actually function declarations are hoisted to the top of the function body in JS!
// So inside createActions, `async function resourceRunAction` is hoisted and available when createSurvivalHandlers is *called*? 
// NO - createSurvivalHandlers is *called* during createActions execution. Hoisting applies within createActions, so when createSurvivalHandlers runs, has resourceRunAction been initialized?
// Function declarations are hoisted fully - so `async function resourceRunAction` exists for entire createActions body before any line runs.
// YES! So getResourceRunAction: () => resourceRunAction works if resourceRunAction is declared later as function declaration in createActions.

// Fix survival wire to use:
// getResourceRunAction: () => resourceRunAction
// And remove resourceRunActionRef

src = src.replace(
  `  // Filled after resourceRunAction is defined (mineStone uses it via getter).
  let resourceRunActionRef = null;

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
    getResourceRunAction: () => resourceRunActionRef
  });
`,
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
`
);

// Fix survival.js getResourceRunAction call - already returns resourceRunAction()(
// getResourceRunAction()( should be getResourceRunAction()(
// Wait body has: return getResourceRunAction()('stone', target);
// If getResourceRunAction returns the function, that's correct.

fs.writeFileSync(createPath, src, 'utf8');
console.log('updated createActions.js bytes', src.length);
