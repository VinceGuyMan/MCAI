# Module Map

Companion to `ARCHITECTURE.md` and `bot/domains.json`.

**Analysis notes:** almost all top-level `bot/*.js` files are *reachable* from `bot.js` because `actions.js` statically imports most domains. “Parked” means **should not execute** under thin-core defaults, not “unreachable from the bundler.”

Regenerate a rough graph (when Node is on PATH):

```powershell
Set-Location .\bot
node scripts/analyze-modules.js
```

## God files (treat carefully)

| File | ~Size | Role | Plan |
|------|-------|------|------|
| `actions.js` | ~258 KB / 5.5k lines | Façade for nearly all actions | Split by domain handlers |
| `commandRegistry.js` | ~99 KB | Command surface | Keep; maybe generate docs from it |
| `chat.js` | ~81 KB | Chat routing | Thin-core branches first; later extract routers |
| `skillRegistry.js` | ~43 KB | Skill definitions | Tier 1 meta |
| `crafting.js` | ~40 KB | Recipes / craft | Tier 0–1 |

## Tier 0 — Core (stabilize first)

| File | Notes |
|------|--------|
| `bot.js` | Process entry |
| `config.js`, `configSchema.js` | Config + validation |
| `logger.js` | Logging |
| `memory.js`, `memorySafeWrite.js` | Main memory |
| `cancellation.js`, `taskQueue.js` | Stop / queue |
| `perception.js`, `safety.js` | World view + rules |
| `actionGate.js`, `confirmationManager.js` | Risk gate |
| `pluginLoader.js`, `pluginStatus.js`, `pluginWrappers.js` | Mineflayer plugins |
| `thinCore.js` | Minimal action API |
| `coreIntentRouter.js`, `coreMacros.js`, `coreObservation.js`, `coreRecovery.js` | Competent-core helpers |
| `competentCore.js` | Safe macro runner |
| `actions.js` | **Debt:** should shrink |
| `brain.js` | Tick loop (limited in thin mode) |
| `chat.js`, `commandParser.js`, `commandRegistry.js`, `typoNormalizer.js` | Commands |
| `naturalCommandMap.js`, `naturalCommandRouter.js`, `naturalIntentClassifier.js` | Natural language route |
| `ollama.js`, `llmRateLimit.js`, `planner.js` | Local LLM |
| `inventory.js`, `homeBase.js`, `crafting.js`, `armor.js`, `food.js`, `storage.js` | Survival basics |
| `sessionRecorder.js` | Session events |

## Tier 1 — Support systems

| Domain | Files | Flag / notes |
|--------|-------|----------------|
| Placement / base | `placement.js`, `lighting.js`, `builder.js`, `baseMaintenance.js`, `resourceRuns.js` | base / resource config |
| Mining | `mining.js`, `miningSafety.js`, `miningTools.js`, `mineLayout.js`, `oreScanner.js` | mining flags; thin uses collect for coal/iron |
| Farming | `cropUtils.js`, `hoeTools.js`, `farming.js`, `animalPens.js`, `animalCare.js`, `farmStorage.js` | farm flags |
| Exploration | `mapMemory.js`, `worldScanner.js`, `biomeMemory.js`, `waypointNavigator.js`, `routeMemory.js`, `exploration.js` | map enabled |
| Dialogue | `dialogue*.js`, `responseGenerator.js`, `personality.js`, `conversationMemory.js`, `intentClassifier.js`, `socialRules.js`, `eventDialogue.js`, `ambientDialogue.js` | dialogue only — no raw dig/attack |
| Planning / skills | `goals*.js`, `goal*.js`, `progressTracker.js`, `advisor.js`, `plannerState.js`, `planReview.js`, `strategicPlanner.js`, `skill*.js`, `progressEvidence.js`, `capabilities.js` | status OK; execution gated |
| Learning / idle | `commandLearningMemory.js`, `selfCorrection.js`, `competencyTracker.js`, `idle*.js`, `testArena.js` | keep off for reliability unless testing |
| Smelting | `smelting.js` | useful mid-game |

## Tier 2 — Parked (default flags false)

| Domain | Files | Config flag |
|--------|-------|-------------|
| Curriculum | retired compatibility stubs at the old module paths | removed; execution flag stays false |
| Progression | retired compatibility stubs at the old module paths | removed; execution flag stays false |
| Nether | `netherPrep.js`, `netherGear.js`, `netherMemory.js`, `netherSafety.js`, `netherScout.js`, `portalManager.js` | `netherSystemEnabled` |
| Gear / magic | `gearScore.js`, `gearMemory.js`, `gearSafety.js`, `gearUpgradeSystem.js`, `enchanting.js`, `anvilSystem.js`, `potionSystem.js`, `brewing.js` | gear / brew config |
| Villagers | `villagerMemory.js`, `villagerScanner.js`, `villagerTrading.js`, `tradeScoring.js`, `economyManager.js`, `tradeSafety.js`, `villageProtection.js`, `villagerEconomy.js` | `villagerSystemEnabled` |
| Blueprints | `blueprintRegistry.js`, `blueprintMemory.js`, `materialEstimator.js`, `blueprintPlanner.js`, `blueprintSafety.js`, `blueprintBuilder.js`, `blueprintPreview.js`, `schematicImport.js`, `blueprintSystem.js` | `blueprintSystemEnabled` |
| Combat | `combat.js`, `combatEquipment.js`, `combatMovement.js`, `threatAssessment.js`, `baseDefense.js`, `ownerDefense.js` | `experimentalCombatEnabled` / `allowCombat` |

## Removed (Player-2 cleanup)

Moved under `archive/removed-for-player2/`:

- **Curriculum OS** + **Progression/milestone OS** (full implementations)
- Orphans: `moodState`, `playerDialogueProfile` (full modules)
- `testArena` (replaced by short smoke plans in meta actions)

Live tree keeps **tiny retired stubs** for curriculum/progression so the dashboard and old chat commands do not crash; they only report “removed.”

**Still parked (may return as co-op skills):** combat, nether, villagers, blueprints, gear.

## Outside `bot/`

| Path | Role |
|------|------|
| `dashboard/` | Local web UI |
| `bridge/` | Plugin bridge client |
| `server-plugin/` | Paper plugin source |
| `scripts/` | Java/Paper/server helpers |
| `docs/` | Guides + historical reports |
| `world*`, Paper jars, `libraries/` | Server runtime — not bot source |
