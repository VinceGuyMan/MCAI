import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedPath = path.join(botRoot, 'actions', 'shared.js');
const createPath = path.join(botRoot, 'actions', 'createActions.js');

// Export helpers from shared.js
let shared = fs.readFileSync(sharedPath, 'utf8');
const exportNames = [
  'thinResultActions',
  'foodNames',
  'toolPreference',
  'toolTypeAliases',
  'toolMaterialAliases',
  'toolMaterialRanks',
  'normalizeToolRequest',
  'itemDurabilityLeft',
  'toolCandidates',
  'bestToolItem',
  'wait',
  'posText',
  'distance',
  'pickActionString'
];
for (const name of exportNames) {
  shared = shared.replace(new RegExp(`^const ${name}\\b`, 'm'), `export const ${name}`);
  shared = shared.replace(new RegExp(`^function ${name}\\b`, 'm'), `export function ${name}`);
}
fs.writeFileSync(sharedPath, shared, 'utf8');

// Rebuild createActions header
let body = fs.readFileSync(createPath, 'utf8');
const marker = 'export async function createActions';
const idx = body.indexOf(marker);
if (idx < 0) throw new Error('export async function createActions not found');
const createFn = body.slice(idx);

const header = `/**
 * Action runtime (createActions).
 * Tier-0/1 systems are statically imported.
 * Tier-2 systems are resolved via attachLazyTier2 (systems/* only when enabled).
 */
import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as crafting from '../crafting.js';
import * as armor from '../armor.js';
import * as food from '../food.js';
import * as inventory from '../inventory.js';
import * as placement from '../placement.js';
import * as lighting from '../lighting.js';
import * as homeBase from '../homeBase.js';
import * as storage from '../storage.js';
import * as builder from '../builder.js';
import * as resourceRuns from '../resourceRuns.js';
import * as baseMaintenance from '../baseMaintenance.js';
import * as animalCare from '../animalCare.js';
import * as animalPens from '../animalPens.js';
import * as farmStorage from '../farmStorage.js';
import * as farming from '../farming.js';
import * as mining from '../mining.js';
import * as mapMemoryStore from '../mapMemory.js';
import * as worldScanner from '../worldScanner.js';
import * as waypointNavigator from '../waypointNavigator.js';
import * as routeMemory from '../routeMemory.js';
import * as exploration from '../exploration.js';
import * as biomeMemory from '../biomeMemory.js';
import * as goalsStore from '../goals.js';
import * as goalTemplates from '../goalTemplates.js';
import * as goalValidator from '../goalValidator.js';
import * as goalExecutor from '../goalExecutor.js';
import * as progressTracker from '../progressTracker.js';
import * as advisor from '../advisor.js';
import * as plannerState from '../plannerState.js';
import * as planReview from '../planReview.js';
import * as strategicPlanner from '../strategicPlanner.js';
import * as smelting from '../smelting.js';
import * as pluginBridge from '../../bridge/pluginBridge.js';
import * as bridgeClient from '../../bridge/bridgeClient.js';
import * as pluginStatus from '../pluginStatus.js';
import * as pluginWrappers from '../pluginWrappers.js';
import * as conversationMemory from '../conversationMemory.js';
import * as personality from '../personality.js';
import {
  generateSkillSummary,
  getSkill,
  getSkills,
  listRiskySkills,
  listSkillsByCategory,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../skillRegistry.js';
import { getRecentSkillRuns, getSkillEvidenceHistory, getSkillStats, listSkillStats, loadSkillMemory, summarizeSkillEvidence } from '../skillMemory.js';
import * as skillRunner from '../skillRunner.js';
import { getEvidenceDefinition, listEvidenceDefinitions } from '../progressEvidence.js';
import { isCancelledError } from '../cancellation.js';
import { rejectAction, validateActionRequest } from '../actionGate.js';
import { clearAllConfirmations } from '../confirmationManager.js';
import { generateHelpText } from '../commandRegistry.js';
import {
  clearPendingNaturalIntent,
  getLastNaturalCommandRoute,
  getPendingNaturalIntent,
  listNaturalExamples,
  routeNaturalCommand
} from '../naturalCommandRouter.js';
import * as commandLearningMemory from '../commandLearningMemory.js';
import * as selfCorrection from '../selfCorrection.js';
import * as competencyTracker from '../competencyTracker.js';
import * as sessionRecorder from '../sessionRecorder.js';
import * as testArena from '../testArena.js';
import * as idleAutonomy from '../idleAutonomy.js';
import * as idleMemory from '../idleMemory.js';
import * as competentCore from '../competentCore.js';
import * as thinCore from '../thinCore.js';
import { routeCoreIntent } from '../coreIntentRouter.js';
import {
  normalizeActionCount,
  adaptActionArguments,
  actionEvidenceMap,
  contextAwareActions,
  thinResultActions,
  logNames,
  foodNames,
  toolPreference,
  toolTypeAliases,
  toolMaterialAliases,
  toolMaterialRanks,
  normalizeToolRequest,
  itemDurabilityLeft,
  toolCandidates,
  bestToolItem,
  wait,
  posText,
  distance
} from './shared.js';
import { attachLazyTier2 } from './lazyTier2.js';

const { goals, Movements } = pathfinderPkg;
const { GoalNear, GoalFollow } = goals;

`;

fs.writeFileSync(createPath, header + createFn, 'utf8');
console.log('Wrote', createPath);

// Sanity: no static tier2 imports
const text = fs.readFileSync(createPath, 'utf8');
const banned = [
  "from '../combat.js'",
  "from '../netherPrep.js'",
  "from '../curriculumEngine.js'",
  "from '../blueprintSystem.js'",
  "from '../gearUpgradeSystem.js'",
  "from '../villagerEconomy.js'",
  "from '../progressionSystem.js'",
  "from '../brewing.js'"
];
for (const b of banned) {
  console.log(b, text.includes(b) ? 'STILL PRESENT' : 'gone');
}
