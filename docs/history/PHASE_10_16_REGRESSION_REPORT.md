# Phase 10-16 Regression Report

Date: 2026-05-08

Scope: Phase 10 through Phase 16 regression audit for tj, the local-only Mineflayer bot. This pass did not add new gameplay systems or expand autonomy.

## Executive Summary

The Phase 10-16 implementation surface is present and the existing automated audits passed before patching. The bot code is split across two levels:

- Core bot modules, tests, and npm scripts live in `E:\Games\MCAI\bot`.
- Dashboard, bridge, server plugin scaffold, and project documentation live at `E:\Games\MCAI`.

No critical import, registry, evidence, dashboard, or bridge failures were found in the baseline run. The main gap was that Phase 17 itself did not yet have a master regression audit script, dedicated regression test, regression report, or manual test plan. Those artifacts were added in this pass.

## What Phases Appear Implemented

- Phase 10, skills/evidence/curriculum: implemented.
- Phase 11, dashboard/telemetry/control panel: implemented at project root and wired from `bot.js`.
- Phase 12, progression: implemented.
- Phase 13, gear upgrades/enchanting/anvils/potions: implemented, with brewing mutation honestly scaffolded/blocked unless reliable support exists.
- Phase 14, villager trading/economy: implemented, with trade execution confirmation-gated.
- Phase 15, blueprint/schematic building: implemented for small built-in deterministic blueprints; schematic import is disabled/scaffolded by default.
- Phase 16, server plugin bridge: Node bridge and Paper plugin source/scaffold are present; the bridge is optional and unavailable state is handled gracefully.

## Files And Modules Present

Phase 10 core files present under `bot`:

- `skillRegistry.js`
- `skillValidator.js`
- `skillRunner.js`
- `skillMemory.js`
- `progressEvidence.js`
- `curriculumEngine.js`
- `curriculumTemplates.js`
- `curriculumScoring.js`
- `curriculumMemory.js`
- `curriculumExecutor.js`
- `curriculumGuard.js`

Phase 11 dashboard files present under project root:

- `dashboard/server.js`
- `dashboard/dashboardState.js`
- `dashboard/dashboardRoutes.js`
- `dashboard/dashboardControl.js`
- `dashboard/dashboardSecurity.js`
- `dashboard/public/index.html`
- `dashboard/public/app.js`
- `dashboard/public/styles.css`

Phase 12 progression files present under `bot`:

- `progressionRegistry.js`
- `progressionEvidence.js`
- `progressionState.js`
- `progressionTracker.js`
- `progressionAdvisor.js`
- `progressionPlanner.js`
- `vanillaAdvancementBridge.js`
- `progressionPaths.js`

Phase 13 gear files present under `bot`:

- `gearScore.js`
- `enchanting.js`
- `anvilSystem.js`
- `potionSystem.js`
- `brewing.js`
- `gearUpgradeSystem.js`
- `gearMemory.js`
- `gearSafety.js`

Phase 14 villager/economy files present under `bot`:

- `villagerMemory.js`
- `villagerScanner.js`
- `villagerTrading.js`
- `tradeScoring.js`
- `economyManager.js`
- `tradeSafety.js`
- `villageProtection.js`

Phase 15 blueprint files present under `bot`:

- `blueprintRegistry.js`
- `blueprintMemory.js`
- `materialEstimator.js`
- `blueprintPlanner.js`
- `blueprintSafety.js`
- `blueprintBuilder.js`
- `schematicImport.js`
- `blueprintPreview.js`

Phase 16 bridge/plugin files present under project root:

- `bridge/pluginBridge.js`
- `bridge/bridgeClient.js`
- `bridge/bridgeEvents.js`
- `bridge/bridgeValidator.js`
- `bridge/bridgeSecurity.js`
- `bridge/bridgeEvidence.js`
- `bridge/bridgeDashboard.js`
- `server-plugin/build.gradle`
- `server-plugin/settings.gradle`
- `server-plugin/src/main/java/com/mcai/bridge/MCAIBridgePlugin.java`
- `server-plugin/src/main/resources/plugin.yml`
- `server-plugin/src/main/resources/config.yml`
- `server-plugin/README_PLUGIN.md`

## Missing Modules

No Phase 10-16 runtime modules were missing after accounting for the repo layout.

Missing at the start of Phase 17 and fixed in this pass:

- `PHASE_10_16_REGRESSION_REPORT.md`
- `PHASE_10_16_TEST_PLAN.md`
- `bot/scripts/audit-phase10-16.js`
- `bot/test/phase10-16-regression.test.js`
- npm scripts `audit:phase10-16` and `test:phase10-16`

## Broken Imports

No broken Phase 10-16 imports were found in the baseline test/audit run.

One inspection caveat: a quick import probe from `E:\Games\MCAI\bot` initially looked for `bot\dashboard` and `bot\bridge`, but the real dashboard and bridge modules are intentionally one level up and imported as `../dashboard` / `../bridge`.

## Broken Exports

No broken Phase 10-16 exports were found by existing audits. The new Phase 17 regression test now verifies representative exports from each phase.

## Duplicate Modules

No duplicate Phase 10-16 module families were identified. The split between `bot` and project-root dashboard/bridge modules is intentional.

## Dead Code

No high-confidence dead code was removed. This pass avoided broad refactors.

## Inconsistent Function Names

The registry sweep currently passes: `commandRegistry.validateCommandWiring()` resolves implemented command actions against `createActions()`. A later runtime-hardening pass found several direct-chat aliases handled in `chat.js` that were not represented in the registry; representative compatibility aliases were added so the registry remains the auditable command source.

## Commands Documented But Not Wired

The command registry currently contains 328 command entries and 744 aliases. No implemented command is missing an action handler in the current registry check. Literal direct-chat command strings in `chat.js` now have registry compatibility coverage, while parameterized chat forms still parse arguments in `chat.js`.

## Actions Registered But Not Implemented

The action surface currently exposes 738 action entries. Existing audits pass, and the regression tests check representative Phase 10-16 command/action wiring.

## Skills Marked Implemented But Not Executable

The registry currently contains 180 skills, with 167 marked implemented. Existing skill audits pass. The regression test checks that implemented skill action names resolve to action handlers and that referenced evidence names exist.

## Evidence Names Referenced But Missing

No missing evidence definitions were found by `npm run evidence:audit` or the existing phase audits. The baseline evidence surface contained 279 evidence definitions.

## Tests And Scripts

Existing scripts before Phase 17:

- `doctor`
- `smoke`
- `test`
- `skill:audit`
- `skill:runner:test`
- `evidence:audit`
- `curriculum:audit`
- `curriculum:execution:audit`
- `dashboard:test`
- `progression:audit`
- `gear:audit`
- `villager:audit`
- `blueprint:audit`
- `bridge:audit`
- `check`

Added in this pass:

- `audit:phase10-16`
- `test:phase10-16`

## Dashboard Endpoint Issues

No dashboard endpoint failures were found in baseline tests. Dashboard controls are token-gated, local by default, and the dashboard test suite verifies missing-token rejection and secret redaction.

## Plugin Bridge Issues

The Node bridge modules and Paper plugin source are present. The bridge remains optional and does not crash the bot when unavailable. Follow-up hardening now stores the last bridge event id plus a capped processed-id list so polling does not replay the same old event repeatedly.

Known limitation not fixed in this pass:

- The workspace does not currently expose a full JDK/Gradle/Maven toolchain capable of compiling the Paper plugin jar. The plugin source and Gradle files exist, but jar compilation was not verified in this environment.

## Memory File Issues

Memory modules load and shape malformed data safely in tests. Existing atomic-save behavior leaves some root-level temporary files, including `skill-memory.json.tmp-*` and `curriculum-memory.json.tmp-*`.

These temp files are not breaking tests. They were documented rather than deleted because this pass avoided destructive cleanup of local files unless required for stability.

## Config Issues

No hard config validation failures were found. Local default dashboard/bridge tokens are accepted for loopback-only use and warned about by doctor/config validation.

Important local-only assumptions:

- `dashboardHost` is `127.0.0.1`.
- `serverPluginHost` is `127.0.0.1`.
- raw dashboard commands are disabled.
- raw server plugin commands, teleport, give, and WorldEdit-style controls are disabled.

## Safety Issues

No critical safety bypass was found in automated checks.

Confirmed by audits/tests:

- Risky skill/action families require confirmation.
- Dashboard POST controls require a token.
- Dashboard control does not call raw Mineflayer actions.
- Curriculum executor uses `skillRunner`.
- Skill runner goes through `actions.js`.
- Progression does not execute direct actions.
- Gear upgrades require confirmation for valuable resources.
- Villager trades require confirmation.
- Blueprint builds require confirmation and reject dangerous blocks.
- Bridge modules and plugin source do not expose raw command, teleport, or give endpoints.

## Runtime Risks

The following remain integration/runtime caveats, not automated failures:

- Live Minecraft server behavior was not exercised by the pure logic tests.
- Mineflayer APIs for enchantment tables, anvils, villager trading, and brewing are version-sensitive; status/reporting paths are safer than mutation paths.
- Brewing is honestly scaffolded/blocked unless reliable support is available.
- Schematic import is disabled/scaffolded by default.
- The Paper plugin jar was not compiled in this environment.
- Root memory temp files should eventually be cleaned after confirming no process is mid-save.

## Exact Baseline Test Results

Captured under `E:\Games\MCAI\.runtime\phase17-baseline`:

| Script | Exit Code | Seconds | Log |
|---|---:|---:|---|
| `doctor` | 0 | 3.1 | `.runtime/phase17-baseline/doctor.log` |
| `smoke` | 0 | 0.9 | `.runtime/phase17-baseline/smoke.log` |
| `test` | 0 | 5.4 | `.runtime/phase17-baseline/test.log` |
| `skill:audit` | 0 | 0.8 | `.runtime/phase17-baseline/skill_audit.log` |
| `skill:runner:test` | 0 | 0.8 | `.runtime/phase17-baseline/skill_runner_test.log` |
| `evidence:audit` | 0 | 0.4 | `.runtime/phase17-baseline/evidence_audit.log` |
| `curriculum:audit` | 0 | 0.4 | `.runtime/phase17-baseline/curriculum_audit.log` |
| `curriculum:execution:audit` | 0 | 0.4 | `.runtime/phase17-baseline/curriculum_execution_audit.log` |
| `dashboard:test` | 0 | 0.8 | `.runtime/phase17-baseline/dashboard_test.log` |
| `progression:audit` | 0 | 0.4 | `.runtime/phase17-baseline/progression_audit.log` |
| `gear:audit` | 0 | 0.6 | `.runtime/phase17-baseline/gear_audit.log` |
| `villager:audit` | 0 | 0.7 | `.runtime/phase17-baseline/villager_audit.log` |
| `blueprint:audit` | 0 | 0.4 | `.runtime/phase17-baseline/blueprint_audit.log` |
| `bridge:audit` | 0 | 0.4 | `.runtime/phase17-baseline/bridge_audit.log` |
| `check` | 0 | 7.4 | `.runtime/phase17-baseline/check.log` |

## Final Verification After Patch

Final commands run from `E:\Games\MCAI\bot`:

| Command | Result |
|---|---|
| `npm run test:phase10-16` | Pass in Phase 17 baseline |
| `npm run audit:phase10-16` | Pass, 14/14 sub-audits in Phase 17 baseline |
| `npm run check` | Pass in Phase 17 baseline and latest runtime-hardening check |
| `node --test --test-concurrency=1 test/runtime-bugs.test.js test/bridge.test.js test/idle-autonomy.test.js` | Pass, 45/45 tests in latest runtime-hardening check |
| `npm test` | Pass, 190/190 tests in latest full unit run |

## Bugs Fixed

- Added a master Phase 10-16 audit script that runs the existing phase audits and the new regression test.
- Added npm script `audit:phase10-16`.
- Added npm script `test:phase10-16`.
- Added a pure logic Phase 10-16 regression test covering module imports, exports, config validation, command/action wiring, skill/evidence references, progression validation, dashboard token rejection, safety gates, bridge validation, and cancellation surfaces.
- Added this regression report.
- Added a manual Phase 10-16 test plan.
- Added syntax-check coverage for the new Phase 17 script/test in `npm run check`.
- Fixed the new master audit runner on Windows so child `npm run ...` calls execute correctly and do not emit a shell-argument deprecation warning.
- Added command registry coverage for common direct-chat compatibility aliases.
- Hardened bridge event polling against repeated old-event processing.
- Cooldown-limited persistent idle danger warnings.

## Bugs Not Fixed

- Paper plugin jar compilation was not fixed because the local environment does not expose a complete JDK/build toolchain.
- Root-level `*.tmp-*` memory temp files were not deleted. They are safe to review separately as a cleanup task.
- Live server integration was not exercised by automated tests; it remains covered by the manual test plan.

## Recommended Next Steps

1. Run `npm run audit:phase10-16` after future feature work.
2. Run the manual test plan on the local Paper server.
3. Install or expose a full JDK/Gradle toolchain if you want to compile and install the Paper plugin jar.
4. After confirming no bot/test process is running, clean up old root-level `skill-memory.json.tmp-*` and `curriculum-memory.json.tmp-*` files.
5. Keep mutation-heavy features conservative until verified on the live server with `tj stop` tested during each operation.
