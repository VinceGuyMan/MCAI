/**
 * Extract remaining action domains from createActions.js:
 * gear, villagers, blueprints, bridge/plugins, nether, combat,
 * planning, skills, meta (natural/core/idle), curriculum, progression
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
const domainsDir = path.join(botRoot, 'actions', 'domains');

let src = fs.readFileSync(createPath, 'utf8');
if (src.includes('createCombatHandlers(')) {
  console.log('already extracted remaining domains');
  process.exit(0);
}

function sliceBetween(startMark, endMark, label) {
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`slice failed (${label}): ${startIdx},${endIdx}\nS:${startMark.slice(0, 50)}\nE:${endMark.slice(0, 50)}`);
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

function writeDomain(file, header, body, names) {
  const content = `${header}
${body}
  return {
    ${names.join(',\n    ')}
  };
}
`;
  fs.writeFileSync(path.join(domainsDir, file), content, 'utf8');
  console.log('wrote', file, names.length, 'fns');
  return names;
}

// Capture slices from CURRENT src (before removals) — use one snapshot
const snap = src;

function snapSlice(startMark, endMark, label) {
  const startIdx = snap.indexOf(startMark);
  const endIdx = snap.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`snap slice failed (${label}): ${startIdx},${endIdx}`);
  }
  return snap.slice(startIdx, endIdx);
}

// --- gear ---
const gearBody = snapSlice(
  '  function pendingGearConfirmation(type, args = {}, message = null) {',
  '  function pendingTradeConfirmation(args = {}, message = null) {',
  'gear'
);
const gearNames = listFnNames(gearBody);
writeDomain(
  'gear.js',
  `/**
 * Gear upgrades, enchanting, anvil, potions, brewing handlers.
 */
export function createGearHandlers(ctx) {
  const {
    bot, config, memory, say,
    gearUpgradeSystem, enchanting, anvilSystem, potionSystem, brewing, gearMemory
  } = ctx;
`,
  gearBody,
  gearNames
);

// --- villagers ---
const villagerBody = snapSlice(
  '  function pendingTradeConfirmation(args = {}, message = null) {',
  '  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {',
  'villagers'
);
const villagerNames = listFnNames(villagerBody);
writeDomain(
  'villagers.js',
  `/**
 * Villager economy / trading handlers.
 */
export function createVillagerHandlers(ctx) {
  const {
    bot, config, memory, say, villagerEconomy, villagerMemory
  } = ctx;
`,
  villagerBody,
  villagerNames
);

// --- blueprints ---
const blueprintBody = snapSlice(
  '  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {',
  '  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {',
  'blueprints'
);
const blueprintNames = listFnNames(blueprintBody);
writeDomain(
  'blueprints.js',
  `/**
 * Blueprint / schematic handlers.
 */
export function createBlueprintHandlers(ctx) {
  const {
    bot, config, memory, say, blueprintSystem
  } = ctx;
`,
  blueprintBody,
  blueprintNames
);

// --- bridge + plugins ---
const bridgeBody = snapSlice(
  '  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {',
  '  function resourceOptions(extra = {}) {',
  'bridge'
);
const bridgeNames = listFnNames(bridgeBody);
writeDomain(
  'bridge.js',
  `/**
 * Server bridge + mineflayer plugin wrapper actions.
 */
import * as pluginBridge from '../../../bridge/pluginBridge.js';
import * as bridgeClient from '../../../bridge/bridgeClient.js';
import * as pluginStatus from '../../pluginStatus.js';
import * as pluginWrappers from '../../pluginWrappers.js';

export function createBridgeHandlers(ctx) {
  const {
    bot, config, memory, say, cancellation
  } = ctx;
`,
  bridgeBody,
  bridgeNames
);

// --- nether ---
const netherBody = snapSlice(
  '  function setPendingNetherConfirmation(action, extra = {}) {',
  '  async function combatStatusAction() {',
  'nether'
);
const netherNames = listFnNames(netherBody);
writeDomain(
  'nether.js',
  `/**
 * Nether prep / portal / scout handlers.
 */
export function createNetherHandlers(ctx) {
  const {
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, posText,
    resourceOptions, loadMapMemory, saveMapMemory,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory, brewing
  } = ctx;
`,
  netherBody,
  netherNames
);

// --- combat ---
const combatBody = snapSlice(
  '  async function combatStatusAction() {',
  '  function findGoal(name = null) {',
  'combat'
);
const combatNames = listFnNames(combatBody);
writeDomain(
  'combat.js',
  `/**
 * Combat / defense handlers.
 */
export function createCombatHandlers(ctx) {
  const {
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, perception, safety, resourceOptions,
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    eatIfHungry, collectNearbyDrops
  } = ctx;
`,
  combatBody,
  combatNames
);

// --- planning ---
const planningBody = snapSlice(
  '  function findGoal(name = null) {',
  '  async function brainStatus() {',
  'planning'
);
const planningNames = listFnNames(planningBody);
writeDomain(
  'planning.js',
  `/**
 * Goals + strategic planner handlers.
 */
import * as goalsStore from '../../goals.js';
import * as goalTemplates from '../../goalTemplates.js';
import * as goalValidator from '../../goalValidator.js';
import * as goalExecutor from '../../goalExecutor.js';
import * as progressTracker from '../../progressTracker.js';
import * as advisor from '../../advisor.js';
import * as plannerState from '../../plannerState.js';
import * as planReview from '../../planReview.js';
import * as strategicPlanner from '../../strategicPlanner.js';

export function createPlanningHandlers(ctx) {
  const {
    bot, config, memory, say, perception, taskQueue, throwIfCancelled, state
  } = ctx;
`,
  planningBody,
  planningNames
);

// --- skills + evidence ---
const skillsBody = snapSlice(
  '  function categorySkillLine(category, counts) {',
  '  function summarizeNaturalRoute(route) {',
  'skills'
);
const skillsNames = listFnNames(skillsBody);
writeDomain(
  'skills.js',
  `/**
 * Skill registry / runner / evidence handlers.
 */
import {
  generateSkillSummary,
  getSkill,
  getSkills,
  listRiskySkills,
  listSkillsByCategory,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../../skillRegistry.js';
import { getRecentSkillRuns, getSkillEvidenceHistory, getSkillStats, listSkillStats, loadSkillMemory, summarizeSkillEvidence } from '../../skillMemory.js';
import * as skillRunner from '../../skillRunner.js';
import { getEvidenceDefinition, listEvidenceDefinitions } from '../../progressEvidence.js';

export function createSkillsHandlers(ctx) {
  const {
    bot, config, memory, say
  } = ctx;
`,
  skillsBody,
  skillsNames
);

// --- meta: natural, core, learning, idle, test ---
const metaBody = snapSlice(
  '  function summarizeNaturalRoute(route) {',
  '  function formatSuggestionList(suggestions) {',
  'meta'
);
const metaNames = listFnNames(metaBody);
writeDomain(
  'meta.js',
  `/**
 * Natural router, competent core, learning, idle, test-arena handlers.
 */
import {
  clearPendingNaturalIntent,
  getLastNaturalCommandRoute,
  getPendingNaturalIntent,
  listNaturalExamples,
  routeNaturalCommand
} from '../../naturalCommandRouter.js';
import * as commandLearningMemory from '../../commandLearningMemory.js';
import * as selfCorrection from '../../selfCorrection.js';
import * as competencyTracker from '../../competencyTracker.js';
import * as sessionRecorder from '../../sessionRecorder.js';
import * as testArena from '../../testArena.js';
import * as idleAutonomy from '../../idleAutonomy.js';
import * as idleMemory from '../../idleMemory.js';
import * as competentCore from '../../competentCore.js';
import { routeCoreIntent } from '../../coreIntentRouter.js';

export function createMetaHandlers(ctx) {
  const {
    bot, config, memory, say, perception, getApi
  } = ctx;
`,
  metaBody,
  metaNames
);

// --- curriculum ---
const curriculumBody = snapSlice(
  '  function formatSuggestionList(suggestions) {',
  '  function normalizeMilestoneInput(input = \'\') {',
  'curriculum'
);
const curriculumNames = listFnNames(curriculumBody);
writeDomain(
  'curriculum.js',
  `/**
 * Curriculum suggestion + execution handlers.
 */
export function createCurriculumHandlers(ctx) {
  const {
    bot, config, memory, say,
    curriculumEngine, curriculumExecutor, listCurriculumTemplates, normalizeCurriculumTemplateName
  } = ctx;
`,
  curriculumBody,
  curriculumNames
);

// --- progression ---
const progressionBody = snapSlice(
  '  function normalizeMilestoneInput(input = \'\') {',
  '  async function help() {',
  'progression'
);
const progressionNames = listFnNames(progressionBody);
writeDomain(
  'progression.js',
  `/**
 * Progression / milestone handlers.
 */
export function createProgressionHandlers(ctx) {
  const {
    bot, config, memory, say,
    progressionSystem, getProgressionHistory
  } = ctx;
`,
  progressionBody,
  progressionNames
);

// ========== REWRITE createActions ==========

// imports
const importBlock = `import { createDialogueHandlers } from './domains/dialogue.js';
import { createBaseHandlers } from './domains/base.js';
import { createGearHandlers } from './domains/gear.js';
import { createVillagerHandlers } from './domains/villagers.js';
import { createBlueprintHandlers } from './domains/blueprints.js';
import { createBridgeHandlers } from './domains/bridge.js';
import { createNetherHandlers } from './domains/nether.js';
import { createCombatHandlers } from './domains/combat.js';
import { createPlanningHandlers } from './domains/planning.js';
import { createSkillsHandlers } from './domains/skills.js';
import { createMetaHandlers } from './domains/meta.js';
import { createCurriculumHandlers } from './domains/curriculum.js';
import { createProgressionHandlers } from './domains/progression.js';`;

if (!src.includes("from './domains/gear.js'")) {
  src = src.replace(
    "import { createBaseHandlers } from './domains/base.js';",
    importBlock
  );
}

function removeBetween(startMark, endMark, label) {
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`remove failed (${label}): ${startIdx},${endIdx}`);
  }
  src = src.slice(0, startIdx) + src.slice(endIdx);
  console.log('removed', label);
}

// Remove from bottom-ish carefully (order by position in file - later first)
// After dialogue: pendingGear ... pendingTrade
// villagers: pendingTrade ... sayBlueprint
// blueprints: sayBlueprint ... sayBridge
// bridge: sayBridge ... resourceOptions
// nether: setPendingNether ... combatStatus
// combat: combatStatus ... findGoal
// planning: findGoal ... brainStatus
// skills: categorySkillLine ... summarizeNatural
// meta: summarizeNatural ... formatSuggestionList
// curriculum: formatSuggestionList ... normalizeMilestone
// progression: normalizeMilestone ... help

// Remove in reverse file order
removeBetween('  function normalizeMilestoneInput(input = \'\') {', '  async function help() {', 'progression');
removeBetween('  function formatSuggestionList(suggestions) {', '  function normalizeMilestoneInput(input = \'\') {', 'curriculum');
// curriculum remove used normalizeMilestone as end - but that was already removed!
// Need to remove curriculum before progression, with end mark that still exists.

// Oops - I removed progression first which deleted normalizeMilestone. Re-load approach: remove top-down or re-find.

// Reset src removals - re-read file and do properly
src = fs.readFileSync(createPath, 'utf8');
if (!src.includes("from './domains/gear.js'")) {
  src = src.replace(
    "import { createBaseHandlers } from './domains/base.js';",
    importBlock
  );
}

// Top-down removals with end markers that are NEXT section starts still present
const removals = [
  ['  function pendingGearConfirmation(type, args = {}, message = null) {', '  function pendingTradeConfirmation(args = {}, message = null) {', 'gear'],
  ['  function pendingTradeConfirmation(args = {}, message = null) {', '  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {', 'villagers'],
  ['  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {', '  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {', 'blueprints'],
  ['  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {', '  function resourceOptions(extra = {}) {', 'bridge'],
  ['  function setPendingNetherConfirmation(action, extra = {}) {', '  async function combatStatusAction() {', 'nether'],
  ['  async function combatStatusAction() {', '  function findGoal(name = null) {', 'combat'],
  ['  function findGoal(name = null) {', '  async function brainStatus() {', 'planning'],
  ['  function categorySkillLine(category, counts) {', '  function summarizeNaturalRoute(route) {', 'skills'],
  ['  function summarizeNaturalRoute(route) {', '  function formatSuggestionList(suggestions) {', 'meta'],
  ['  function formatSuggestionList(suggestions) {', '  function normalizeMilestoneInput(input = \'\') {', 'curriculum'],
  ['  function normalizeMilestoneInput(input = \'\') {', '  async function help() {', 'progression']
];

for (const [a, b, label] of removals) {
  removeBetween(a, b, label);
}

// Wire domains after baseHandlers assignment
const baseAssign = '  resourceRunAction = baseHandlers.resourceRunAction;';
const baseIdx = src.indexOf(baseAssign);
if (baseIdx < 0) throw new Error('base assign not found');
const insertAt = baseIdx + baseAssign.length;

const wire = `

  // ---- remaining domains ----
  let sayPlanning = (message, options = {}) => {
    if (!options?.silent) say(message, true);
  };

  const gearHandlers = createGearHandlers({
    bot, config, memory, say,
    gearUpgradeSystem, enchanting, anvilSystem, potionSystem, brewing, gearMemory
  });
  const { ${gearNames.join(', ')} } = gearHandlers;

  const villagerHandlers = createVillagerHandlers({
    bot, config, memory, say, villagerEconomy, villagerMemory
  });
  const { ${villagerNames.join(', ')} } = villagerHandlers;

  const blueprintHandlers = createBlueprintHandlers({
    bot, config, memory, say, blueprintSystem
  });
  const { ${blueprintNames.join(', ')} } = blueprintHandlers;

  const bridgeHandlers = createBridgeHandlers({
    bot, config, memory, say, cancellation
  });
  const { ${bridgeNames.join(', ')} } = bridgeHandlers;

  const netherHandlers = createNetherHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, posText,
    resourceOptions, loadMapMemory, saveMapMemory,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory, brewing
  });
  const { ${netherNames.join(', ')} } = netherHandlers;

  const combatHandlers = createCombatHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, perception, safety, resourceOptions,
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    eatIfHungry, collectNearbyDrops
  });
  const { ${combatNames.join(', ')} } = combatHandlers;

  const planningHandlers = createPlanningHandlers({
    bot, config, memory, say, perception, taskQueue, throwIfCancelled, state
  });
  const { ${planningNames.join(', ')} } = planningHandlers;
  if (typeof planningHandlers.sayPlanning === 'function') {
    sayPlanning = planningHandlers.sayPlanning;
  }

  const skillsHandlers = createSkillsHandlers({
    bot, config, memory, say
  });
  const { ${skillsNames.join(', ')} } = skillsHandlers;

  const metaHandlers = createMetaHandlers({
    bot, config, memory, say, perception, getApi: () => api
  });
  const { ${metaNames.join(', ')} } = metaHandlers;

  const curriculumHandlers = createCurriculumHandlers({
    bot, config, memory, say,
    curriculumEngine, curriculumExecutor, listCurriculumTemplates, normalizeCurriculumTemplateName
  });
  const { ${curriculumNames.join(', ')} } = curriculumHandlers;

  const progressionHandlers = createProgressionHandlers({
    bot, config, memory, say,
    progressionSystem, getProgressionHistory
  });
  const { ${progressionNames.join(', ')} } = progressionHandlers;

`;

src = src.slice(0, insertAt) + wire + src.slice(insertAt);

// Mining was created with get sayPlanning - ensure sayPlanning let exists BEFORE mining.
// Currently mining is before base. Move sayPlanning stub earlier before miningHandlers.
if (!src.includes('let sayPlanning = (message, options = {}) => {')) {
  // already in wire after base - mining is before base and uses get sayPlanning from object
  // miningHandlers creation:
}

// Patch mining creation to use late-bound sayPlanning from outer let
// Find miningHandlers and ensure get sayPlanning returns the let
src = src.replace(
  /const miningHandlers = createMiningHandlers\(\{[\s\S]*?\}\);/,
  (block) => {
    if (block.includes('get sayPlanning')) return block;
    return block.replace(
      'thinCollectResourceAction,',
      `thinCollectResourceAction,
    get sayPlanning() { return sayPlanning; },`
    );
  }
);

// Declare sayPlanning early (before mining) if mining needs it
if (!src.includes('let sayPlanning')) {
  // insert after resourceOptions function
  const ro = src.indexOf('  function resourceOptions(extra = {}) {');
  const roEnd = src.indexOf('  const {\n    currentDimension', ro);
  if (roEnd > 0) {
    src = src.slice(0, roEnd) + `  let sayPlanning = (message, options = {}) => {
    if (!options?.silent) say(message, true);
  };

` + src.slice(roEnd);
  }
}

// Remove duplicate sayPlanning in wire if we added early
const firstSay = src.indexOf('let sayPlanning');
const secondSay = src.indexOf('let sayPlanning', firstSay + 1);
if (secondSay > 0) {
  // remove the second declaration block in wire
  src = src.slice(0, secondSay) + src.slice(secondSay).replace(
    `  let sayPlanning = (message, options = {}) => {
    if (!options?.silent) say(message, true);
  };

  const gearHandlers`,
    `  const gearHandlers`
  );
}

// Fix planning: sayPlanning might be named function inside planning handlers - the return includes sayPlanning
// planningNames should include sayPlanning

fs.writeFileSync(createPath, src, 'utf8');
console.log('createActions bytes', src.length);
console.log('done');
