/**
 * Wire farming/mining/exploration/mapHelpers into createActions.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
let src = fs.readFileSync(createPath, 'utf8');

function removeBetween(startMark, endMark, label) {
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`removeBetween failed (${label}): start=${startIdx} end=${endIdx}`);
  }
  src = src.slice(0, startIdx) + src.slice(endIdx);
  console.log('removed', label, 'bytes', endIdx - startIdx);
}

if (src.includes('createFarmingHandlers(')) {
  console.log('already wired; abort');
  process.exit(0);
}

if (!src.includes("from './domains/farming.js'")) {
  src = src.replace(
    "import { createSurvivalHandlers } from './domains/survival.js';",
    `import { createSurvivalHandlers } from './domains/survival.js';
import { createMapHelpers } from './domains/mapHelpers.js';
import { createFarmingHandlers } from './domains/farming.js';
import { createMiningHandlers } from './domains/mining.js';
import { createExplorationHandlers } from './domains/exploration.js';`
  );
}

// Remove in order that keeps end markers valid
removeBetween(
  '  async function farmingStatusAction() {',
  '  async function miningStatusAction() {',
  'farming'
);
removeBetween(
  '  async function miningStatusAction() {',
  '  async function combatStatusAction() {',
  'miningStatus'
);
removeBetween(
  '  async function mapStatusAction() {',
  '  function findGoal(name = null) {',
  'exploration'
);
removeBetween(
  '  async function smeltItemAction(itemName = \'raw_iron\', count = 1, options = {}) {',
  '  async function brainStatus() {',
  'smelt/coal/iron'
);
removeBetween(
  '  function currentDimension() {',
  '  function setPendingNetherConfirmation(action, extra = {}) {',
  'mapHelpers'
);

src = src.replace(/\blastTaskUpdateAt\s*=\s*Date\.now\(\)/g, 'state.lastTaskUpdateAt = Date.now()');

const farmNames = [
  'farmingStatusAction', 'createFarmAction', 'maintainFarmAction', 'harvestCropsAction',
  'replantCropsAction', 'plantCropAction', 'animalPenStatusAction', 'createAnimalPenAction',
  'lureAnimalToPenAction', 'breedAnimalsAction', 'feedAnimalsAction', 'collectEggsAction',
  'shearSheepAction', 'milkCowAction', 'farmStorageStatusAction', 'storeFarmItemsAction',
  'stopFarmingAction', 'stopAnimalTaskAction'
];
const miningNames = ['miningStatusAction', 'smeltItemAction', 'mineCoalAction', 'mineIronAction'];
const exploreNames = [
  'mapStatusAction', 'explorationStatusAction', 'scanAreaAction', 'rememberLocationAction',
  'forgetLocationAction', 'confirmForgetWaypointAction', 'listKnownPlacesAction', 'waypointStatusAction',
  'goToWaypointAction', 'returnToOwnerAction', 'scoutDirectionAction', 'exploreAroundHomeAction',
  'exploreAroundOwnerAction', 'returnFromExplorationAction', 'stopExplorationAction',
  'reportExplorationResultsAction', 'recordRouteAction', 'stopRouteRecordingAction', 'followRouteAction',
  'routeStatusAction', 'knownBiomesAction', 'knownResourcesAction', 'knownDangerZonesAction',
  'confirmExplorationAction'
];

const roMark = '  function resourceOptions(extra = {}) {';
const roStart = src.indexOf(roMark);
if (roStart < 0) throw new Error('resourceOptions not found');
const roRest = src.slice(roStart);
const roEndMatch = roRest.match(/^  function resourceOptions\(extra = \{\}\) \{\r?\n(?:.*\r?\n)*?  \}\r?\n/);
if (!roEndMatch) throw new Error('resourceOptions block not matched');
const insertAt = roStart + roEndMatch[0].length;

const wire = `
  const {
    currentDimension,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint
  } = createMapHelpers({ bot, config });

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

  const miningHandlers = createMiningHandlers({
    bot,
    config,
    memory,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    thinCollectResourceAction,
    get sayPlanning() {
      return sayPlanning;
    }
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

src = src.slice(0, insertAt) + wire + src.slice(insertAt);

fs.writeFileSync(createPath, src, 'utf8');
console.log('wired createActions.js', src.length);
