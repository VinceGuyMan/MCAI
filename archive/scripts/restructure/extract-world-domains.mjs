/**
 * Extract map helpers + farming + mining + exploration from createActions.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
const domainsDir = path.join(botRoot, 'actions', 'domains');

let src = fs.readFileSync(createPath, 'utf8');

function sliceBetween(source, startMark, endMark) {
  const startIdx = source.indexOf(startMark);
  const endIdx = source.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`slice failed: start=${startIdx} end=${endIdx}\nstart=${startMark.slice(0, 60)}\nend=${endMark.slice(0, 60)}`);
  }
  return { startIdx, endIdx, body: source.slice(startIdx, endIdx) };
}

function listFnNames(body) {
  const names = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(body))) names.push(m[1]);
  return names;
}

// --- map helpers ---
const mapSlice = sliceBetween(
  src,
  '  function currentDimension() {',
  '  function setPendingNetherConfirmation(action, extra = {}) {'
);
const mapBody = mapSlice.body;
const mapNames = listFnNames(mapBody);

const mapModule = `/**
 * Map memory helpers shared by exploration, base, and nether handlers.
 */
import * as mapMemoryStore from '../../mapMemory.js';

export function createMapHelpers({ bot, config }) {
${mapBody}
  return {
    ${mapNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'mapHelpers.js'), mapModule, 'utf8');
console.log('wrote mapHelpers.js', mapNames);

// --- farming ---
const farmSlice = sliceBetween(
  src,
  '  async function farmingStatusAction() {',
  '  async function miningStatusAction() {'
);
const farmBody = farmSlice.body;
const farmNames = listFnNames(farmBody);

const farmModule = `/**
 * Farming + animal pen handlers.
 */
import * as farming from '../../farming.js';
import * as animalPens from '../../animalPens.js';
import * as animalCare from '../../animalCare.js';
import * as farmStorage from '../../farmStorage.js';

export function createFarmingHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    stop
  } = ctx;

${farmBody}
  return {
    ${farmNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'farming.js'), farmModule, 'utf8');
console.log('wrote farming.js', farmNames);

// --- mining (status + smelt + coal + iron) ---
const miningStatusSlice = sliceBetween(
  src,
  '  async function miningStatusAction() {',
  '  async function combatStatusAction() {'
);
const smeltSlice = sliceBetween(
  src,
  '  async function smeltItemAction(itemName = \'raw_iron\', count = 1, options = {}) {',
  '  async function brainStatus() {'
);
// smelt through mineIron (before brainStatus)
const miningBody = `${miningStatusSlice.body}${smeltSlice.body}`;
const miningNames = listFnNames(miningBody);

const miningModule = `/**
 * Mining / smelting action handlers.
 */
import * as mining from '../../mining.js';
import * as smelting from '../../smelting.js';
import { normalizeActionCount } from '../shared.js';

export function createMiningHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    sayPlanning
  } = ctx;

${miningBody}
  return {
    ${miningNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'mining.js'), miningModule, 'utf8');
console.log('wrote mining.js', miningNames);

// --- exploration ---
const exploreSlice = sliceBetween(
  src,
  '  async function mapStatusAction() {',
  '  function findGoal(name = null) {'
);
const exploreBody = exploreSlice.body;
const exploreNames = listFnNames(exploreBody);

const exploreModule = `/**
 * Exploration, waypoints, routes, and map reports.
 */
import * as mapMemoryStore from '../../mapMemory.js';
import * as worldScanner from '../../worldScanner.js';
import * as waypointNavigator from '../../waypointNavigator.js';
import * as routeMemory from '../../routeMemory.js';
import * as exploration from '../../exploration.js';
import * as biomeMemory from '../../biomeMemory.js';

export function createExplorationHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint,
    perception,
    safety,
    stop
  } = ctx;

${exploreBody}
  return {
    ${exploreNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'exploration.js'), exploreModule, 'utf8');
console.log('wrote exploration.js', exploreNames);

// --- rewrite createActions: remove extracted bodies and wire factories ---

// 1) imports
if (!src.includes("from './domains/mapHelpers.js'")) {
  src = src.replace(
    "import { createSurvivalHandlers } from './domains/survival.js';",
    `import { createSurvivalHandlers } from './domains/survival.js';
import { createMapHelpers } from './domains/mapHelpers.js';
import { createFarmingHandlers } from './domains/farming.js';
import { createMiningHandlers } from './domains/mining.js';
import { createExplorationHandlers } from './domains/exploration.js';`
  );
}

// 2) After survival destructuring, we need resourceOptions first (stays), then map helpers, then later domains.
// Remove map helper bodies
src = src.slice(0, mapSlice.startIdx) + src.slice(mapSlice.endIdx);

// Re-find farming after map removal (indices shifted)
{
  const s = sliceBetween(src, '  async function farmingStatusAction() {', '  async function miningStatusAction() {');
  src = src.slice(0, s.startIdx) + src.slice(s.endIdx);
}
{
  const s = sliceBetween(src, '  async function miningStatusAction() {', '  async function combatStatusAction() {');
  src = src.slice(0, s.startIdx) + src.slice(s.endIdx);
}
{
  const s = sliceBetween(src, '  async function mapStatusAction() {', '  function findGoal(name = null) {');
  src = src.slice(0, s.startIdx) + src.slice(s.endIdx);
}
{
  const s = sliceBetween(src, '  async function smeltItemAction(itemName = \'raw_iron\', count = 1, options = {}) {', '  async function brainStatus() {');
  src = src.slice(0, s.startIdx) + src.slice(s.endIdx);
}

// Fix resourceRunAction lastTaskUpdateAt if present
src = src.replace(/\blastTaskUpdateAt\s*=\s*Date\.now\(\)/g, 'state.lastTaskUpdateAt = Date.now()');

// Insert map helpers right after resourceOptions function ends (after the closing of resourceOptions)
const resourceOptionsEnd = `  function resourceOptions(extra = {}) {
    return {
      config,
      actions: api,
      perception,
      shouldStop: isCancelled,
      throwIfCancelled,
      ownerUsername: config.ownerUsername,
      ...extra
    };
  }
`;

if (!src.includes(resourceOptionsEnd)) {
  // try looser match
  const ro = src.indexOf('  function resourceOptions(extra = {}) {');
  if (ro < 0) throw new Error('resourceOptions not found');
  const afterRo = src.indexOf('\n  function ', ro + 10);
  // insert before next function after resourceOptions
  const insertAt = src.indexOf('\n\n', ro);
}

// Find resourceOptions block end more carefully
const roStart = src.indexOf('  function resourceOptions(extra = {}) {');
if (roStart < 0) throw new Error('resourceOptions missing');
// next top-level function after resourceOptions - may already be setPendingNether after map removed
const afterRo = src.slice(roStart);
const roCloseMatch = afterRo.match(/^  function resourceOptions\(extra = \{\}\) \{[\s\S]*?\n  \}\n/);
if (!roCloseMatch) throw new Error('could not match resourceOptions block');
const roBlock = roCloseMatch[0];
const roInsertPoint = roStart + roBlock.length;

const wireMapAndLater = `
  const {
    currentDimension,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint
  } = createMapHelpers({ bot, config });

  // Farming / mining / exploration domains (resourceOptions + map helpers available)
  const farmingHandlers = createFarmingHandlers({
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    stop
  });
  const {
    ${farmNames.join(',\n    ')}
  } = farmingHandlers;

  // sayPlanning may be defined later — provide a late-bound wrapper for mining
  function sayPlanningProxy(message, options = {}) {
    if (typeof sayPlanning === 'function') return sayPlanning(message, options);
    if (!options.silent) say(message, true);
  }

  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    sayPlanning: sayPlanningProxy
  });
  const {
    ${miningNames.join(',\n    ')}
  } = miningHandlers;

  const explorationHandlers = createExplorationHandlers({
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint,
    perception,
    safety,
    stop
  });
  const {
    ${exploreNames.join(',\n    ')}
  } = explorationHandlers;

`;

src = src.slice(0, roInsertPoint) + wireMapAndLater + src.slice(roInsertPoint);

// sayPlanning is function declaration later - hoisted. Prefer using it directly for mining:
src = src.replace(
  `  // sayPlanning may be defined later — provide a late-bound wrapper for mining
  function sayPlanningProxy(message, options = {}) {
    if (typeof sayPlanning === 'function') return sayPlanning(message, options);
    if (!options.silent) say(message, true);
  }

  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    sayPlanning: sayPlanningProxy
  });
`,
  `  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    // sayPlanning is a function declaration later in createActions (hoisted).
    get sayPlanning() { return sayPlanning; }
  });
`
);

// mining.js uses sayPlanning as function - getter on ctx object: sayPlanning from ctx will invoke getter when accessed as ctx.sayPlanning. Destructuring breaks getters!
// Fix: don't destructure sayPlanning in mining.js - use ctx.sayPlanning or pass getSayPlanning

// Fix mining module to use getSayPlanning
let miningSrc = fs.readFileSync(path.join(domainsDir, 'mining.js'), 'utf8');
miningSrc = miningSrc.replace(
  `    thinCollectResourceAction,
    sayPlanning
  } = ctx;`,
  `    thinCollectResourceAction,
    getSayPlanning
  } = ctx;
  const sayPlanning = (...args) => (getSayPlanning ? getSayPlanning()(...args) : say(...args));`
);
// actually simpler:
miningSrc = miningSrc.replace(
  `    thinCollectResourceAction,
    getSayPlanning
  } = ctx;
  const sayPlanning = (...args) => (getSayPlanning ? getSayPlanning()(...args) : say(...args));`,
  `    thinCollectResourceAction
  } = ctx;
  const sayPlanning = (message, options = {}) => {
    if (typeof ctx.sayPlanning === 'function') return ctx.sayPlanning(message, options);
    if (!options.silent) say(message, true);
  };`
);
// Wait I made a mess - rewrite mining factory header cleanly
miningSrc = `/**
 * Mining / smelting action handlers.
 */
import * as mining from '../../mining.js';
import * as smelting from '../../smelting.js';
import { normalizeActionCount } from '../shared.js';

export function createMiningHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction
  } = ctx;

  function sayPlanning(message, options = {}) {
    if (typeof ctx.sayPlanning === 'function') return ctx.sayPlanning(message, options);
    if (!options.silent) say(message, true);
  }

${miningBody}
  return {
    ${miningNames.join(',\n    ')}
  };
}
`;
fs.writeFileSync(path.join(domainsDir, 'mining.js'), miningSrc, 'utf8');

// Fix createActions miningHandlers to pass sayPlanning as property that resolves at call time
src = src.replace(
  `  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    // sayPlanning is a function declaration later in createActions (hoisted).
    get sayPlanning() { return sayPlanning; }
  });
`,
  `  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    get sayPlanning() {
      // Function declaration later in this scope is hoisted.
      return sayPlanning;
    }
  });
`
);

fs.writeFileSync(createPath, src, 'utf8');
console.log('updated createActions.js', src.length);
