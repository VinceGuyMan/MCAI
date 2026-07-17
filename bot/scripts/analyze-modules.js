/**
 * Classify bot/*.js modules by reachability from bot.js and by domain tier.
 * Usage: node scripts/analyze-modules.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter((f) => f.endsWith('.js'));
const importRe = /from\s+['"](\.[^'"]+)['"]/g;
const dynRe = /import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;

function resolve(fromFile, spec) {
  let p = path.normalize(path.join(path.dirname(path.join(root, fromFile)), spec));
  if (!p.endsWith('.js')) p += '.js';
  return path.basename(p);
}

const graph = new Map();
const dynGraph = new Map();
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  const deps = new Set();
  let m;
  while ((m = importRe.exec(text))) {
    if (m[1].startsWith('../')) continue;
    deps.add(resolve(f, m[1]));
  }
  graph.set(f, deps);
  const dyn = new Set();
  while ((m = dynRe.exec(text))) {
    dyn.add(path.basename(m[1].endsWith('.js') ? m[1] : `${m[1]}.js`));
  }
  dynGraph.set(f, dyn);
}

function expand(start) {
  const reachable = new Set();
  const queue = [...start];
  while (queue.length) {
    const cur = queue.shift();
    if (reachable.has(cur) || !graph.has(cur)) continue;
    reachable.add(cur);
    for (const d of graph.get(cur) || []) {
      if (!reachable.has(d)) queue.push(d);
    }
    for (const d of dynGraph.get(cur) || []) {
      if (!reachable.has(d) && graph.has(d)) queue.push(d);
    }
  }
  return reachable;
}

const fromBot = expand(['bot.js']);
const all = new Set(files);
const notFromBot = [...all].filter((f) => !fromBot.has(f)).sort();

// Domain tags by filename prefix / known groups
const TIERS = {
  core: [
    'bot.js', 'config.js', 'configSchema.js', 'logger.js', 'memory.js', 'memorySafeWrite.js',
    'cancellation.js', 'taskQueue.js', 'perception.js', 'safety.js', 'safetyAudit.js',
    'actionGate.js', 'confirmationManager.js', 'pluginLoader.js', 'pluginStatus.js', 'pluginWrappers.js',
    'thinCore.js', 'coreIntentRouter.js', 'coreInvariants.js', 'coreMacros.js', 'coreObservation.js',
    'coreRecovery.js', 'competentCore.js', 'actions.js', 'brain.js', 'chat.js', 'planner.js',
    'ollama.js', 'llmRateLimit.js', 'commandParser.js', 'commandRegistry.js', 'typoNormalizer.js',
    'naturalCommandMap.js', 'naturalCommandRouter.js', 'naturalIntentClassifier.js',
    'inventory.js', 'homeBase.js', 'crafting.js', 'armor.js', 'food.js', 'storage.js',
    'sessionRecorder.js'
  ],
  chat_dialogue: [
    'dialogue.js', 'dialogueContext.js', 'dialogueSafety.js', 'responseGenerator.js',
    'personality.js', 'conversationMemory.js', 'intentClassifier.js', 'socialRules.js',
    'eventDialogue.js', 'ambientDialogue.js', 'moodState.js', 'playerDialogueProfile.js'
  ],
  survival: [
    'placement.js', 'lighting.js', 'builder.js', 'resourceRuns.js', 'baseMaintenance.js',
    'mining.js', 'miningSafety.js', 'miningTools.js', 'mineLayout.js', 'oreScanner.js',
    'smelting.js', 'cropUtils.js', 'hoeTools.js', 'farming.js', 'animalPens.js', 'animalCare.js',
    'farmStorage.js'
  ],
  exploration: [
    'mapMemory.js', 'worldScanner.js', 'biomeMemory.js', 'waypointNavigator.js',
    'routeMemory.js', 'exploration.js'
  ],
  combat: [
    'combat.js', 'combatEquipment.js', 'combatMovement.js', 'threatAssessment.js',
    'baseDefense.js', 'ownerDefense.js'
  ],
  planning: [
    'goals.js', 'goalTemplates.js', 'goalValidator.js', 'goalExecutor.js', 'progressTracker.js',
    'advisor.js', 'plannerState.js', 'planReview.js', 'strategicPlanner.js',
    'skillRegistry.js', 'skillValidator.js', 'skillMemory.js', 'skillRunner.js',
    'progressEvidence.js', 'capabilities.js'
  ],
  curriculum_progression: [
    'curriculumEngine.js', 'curriculumExecutor.js', 'curriculumGuard.js', 'curriculumMemory.js',
    'curriculumScoring.js', 'curriculumTemplates.js', 'progressionAdvisor.js', 'progressionEvidence.js',
    'progressionPaths.js', 'progressionPlanner.js', 'progressionRegistry.js', 'progressionState.js',
    'progressionSystem.js', 'progressionTracker.js', 'vanillaAdvancementBridge.js'
  ],
  nether: [
    'netherPrep.js', 'netherGear.js', 'netherMemory.js', 'netherSafety.js', 'netherScout.js',
    'portalManager.js'
  ],
  gear: [
    'gearScore.js', 'gearMemory.js', 'gearSafety.js', 'gearUpgradeSystem.js',
    'enchanting.js', 'anvilSystem.js', 'potionSystem.js', 'brewing.js'
  ],
  villagers: [
    'villagerMemory.js', 'villagerScanner.js', 'villagerTrading.js', 'tradeScoring.js',
    'economyManager.js', 'tradeSafety.js', 'villageProtection.js', 'villagerEconomy.js'
  ],
  blueprints: [
    'blueprintRegistry.js', 'blueprintMemory.js', 'materialEstimator.js', 'blueprintPlanner.js',
    'blueprintSafety.js', 'blueprintBuilder.js', 'blueprintPreview.js', 'schematicImport.js',
    'blueprintSystem.js'
  ],
  learning_idle: [
    'commandLearningMemory.js', 'selfCorrection.js', 'competencyTracker.js',
    'idleAutonomy.js', 'idleDecision.js', 'idleMemory.js', 'idleSpeech.js', 'testArena.js'
  ]
};

const classified = new Map();
for (const [tier, list] of Object.entries(TIERS)) {
  for (const name of list) classified.set(name, tier);
}

const byTier = {};
const unknown = [];
for (const f of [...all].sort()) {
  const tier = classified.get(f) || 'unknown';
  if (!byTier[tier]) byTier[tier] = [];
  byTier[tier].push({
    file: f,
    reachableFromBot: fromBot.has(f),
    sizeKb: Math.round(fs.statSync(path.join(root, f)).size / 1024)
  });
  if (tier === 'unknown') unknown.push(f);
}

const report = {
  totalTopLevelJs: files.length,
  reachableFromBot: fromBot.size,
  notReachableFromBot: notFromBot.length,
  notReachableList: notFromBot,
  byTier,
  unknown
};

console.log(JSON.stringify(report, null, 2));

// Also write markdown summary next to this script output path
const mdLines = [
  '# Module Analysis (generated)',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `- Top-level bot JS files: **${files.length}**`,
  `- Reachable from \`bot.js\` (static + dynamic imports): **${fromBot.size}**`,
  `- Not in bot.js import graph: **${notFromBot.length}**`,
  '',
  '## By tier',
  ''
];

for (const [tier, items] of Object.entries(byTier).sort()) {
  const totalKb = items.reduce((s, i) => s + i.sizeKb, 0);
  mdLines.push(`### ${tier} (${items.length} files, ~${totalKb} KB)`);
  mdLines.push('');
  mdLines.push('| File | From bot.js | KB |');
  mdLines.push('|------|-------------|-----|');
  for (const item of items.sort((a, b) => a.file.localeCompare(b.file))) {
    mdLines.push(`| \`${item.file}\` | ${item.reachableFromBot ? 'yes' : 'no'} | ${item.sizeKb} |`);
  }
  mdLines.push('');
}

if (notFromBot.length) {
  mdLines.push('## Not reachable from bot.js');
  mdLines.push('');
  mdLines.push('These may only be used by tests/scripts, or are truly orphaned:');
  mdLines.push('');
  for (const f of notFromBot) mdLines.push(`- \`${f}\``);
  mdLines.push('');
}

fs.writeFileSync(path.join(root, '..', 'MODULE_MAP.md'), mdLines.join('\n'), 'utf8');
console.error('Wrote F:\\Games\\MCAI\\MODULE_MAP.md');
