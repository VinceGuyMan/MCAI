# MCAI 1.0 Audit Report

Date: 2026-05-08

Version target: `1.0.0-local`

## Project Overview

MCAI is a local-only Minecraft companion bot. It runs a physical Mineflayer player named `tj` on a local offline-mode Paper server and uses local Ollama role models for interpretation and dialogue. Current routing uses `qwen3:14b` for command routing/planning, `mistral-nemo:12b` for dialogue, `qwen2.5-coder:14b` for structured/code helper work, and `phi4-mini:latest` as fallback. The owner is `ModVinny`. The project explicitly does not require OpenAI, cloud APIs, paid APIs, or external services beyond local Ollama and the local Minecraft server.

1.0 is a stabilization release, not a promise that every advanced Minecraft behavior is perfect.

## Current File Tree

Important root files:

```text
config.json
memory.json
map-memory.json
goals.json
conversation-memory.json
README.md
VERSION.md
AUDIT_1_0.md
TEST_PLAN_1_0.md
QUICKSTART_1_0.md
RELEASE_NOTES_1_0.md
BACKLOG.md
Start-MCAI.cmd
Stop-MCAI.cmd
server.properties
paper-1.21.11-69.jar
```

Important bot modules:

```text
bot/bot.js
bot/chat.js
bot/commandParser.js
bot/commandRegistry.js
bot/actions.js
bot/brain.js
bot/taskQueue.js
bot/cancellation.js
bot/safety.js
bot/safetyAudit.js
bot/config.js
bot/configSchema.js
bot/logger.js
bot/llmRateLimit.js
bot/ollama.js
bot/planner.js
bot/capabilities.js
bot/goals.js
bot/goalTemplates.js
bot/goalValidator.js
bot/goalExecutor.js
bot/progressTracker.js
bot/advisor.js
bot/strategicPlanner.js
bot/memory.js
bot/mapMemory.js
bot/conversationMemory.js
bot/crafting.js
bot/smelting.js
bot/food.js
bot/inventory.js
bot/armor.js
bot/homeBase.js
bot/storage.js
bot/builder.js
bot/resourceRuns.js
bot/baseMaintenance.js
bot/mining.js
bot/farming.js
bot/animalPens.js
bot/exploration.js
bot/combat.js
bot/netherPrep.js
bot/portalManager.js
bot/netherScout.js
bot/dialogue.js
bot/responseGenerator.js
```

Important scripts:

```text
bot/scripts/doctor.js
bot/scripts/smoke-test.js
bot/scripts/safety-audit.js
bot/scripts/ollama-test.js
bot/scripts/backup-memory.js
bot/scripts/reset-memory.js
```

## Runtime Requirements

- Node.js with npm.
- Mineflayer dependencies installed through `bot/package.json`.
- Local Paper server reachable at `127.0.0.1:25565`.
- `server.properties` must have `online-mode=false`.
- Minecraft Java client version `1.21.11`.
- Ollama running locally at `http://127.0.0.1:11434`.
- Ollama models `qwen3:14b`, `mistral-nemo:12b`, `qwen2.5-coder:14b`, and fallback `phi4-mini:latest`.

Doctor currently reports Java is not on PATH on this machine. That is acceptable if the Paper server is launched externally or by an already-working launcher, and the server reachability check passes.

## Confirmed Implemented Features

- Mineflayer physical bot entry point in `bot/bot.js`.
- Owner-only command gate in `chat.js` / `socialRules.js`.
- Emergency cancellation module with stop/cancel/halt/freeze aliases.
- Status, help, debug, brain, task, safety, memory, where, and nearby commands.
- Come/follow/stay movement commands.
- Inventory summary and item counting helpers.
- Food status, eating, food finding, and cooking hooks.
- Armour status and best-armour equip.
- General crafting through Mineflayer recipe data for supported items.
- Crafting safety confirmation for valuable/risky/technical items.
- Home base memory and return home.
- Small camp/workstation/shelter builder functions.
- Registered storage/chest use safeguards.
- Resource runs with caps.
- Mining status, safe stone/coal/iron pathways, ore scanner/tool checks.
- Basic farm and animal pen modules.
- Map memory, waypoint memory, scanning, and route scaffolding.
- Defensive combat mode, threat scan, equipment preparation, flee/defense hooks.
- Long-term goals, goal templates, goal validation, and one-step execution.
- Nether preparation checklist, portal status, portal lighting/entry confirmations, guarded first-entry flow.
- Lifelike dialogue layer, typo normalizer, prompt-injection defenses, conversation memory.
- Command registry for 1.0 commands.
- Capability registry with unimplemented schema actions blocked from goal execution.
- Config validation.
- Structured logger with optional file logging.
- Ollama call rate guard.
- Atomic writes and malformed-file backups for core memory files.
- Safety audit, smoke test, Ollama test, and unit tests.

## Partially Implemented Features

- Smart mining: basic safe stone/coal/iron flows are present; deep mining, caving, diamond mining, and huge branch mining remain guarded or incomplete.
- Builder: deterministic small structures are present; area clearing and large builds are deliberately limited.
- Farming and animal pens: basic commands and deterministic modules exist; animal luring/breeding can be fragile because entity/pathfinding behavior is hard to guarantee.
- Exploration: waypoint memory and controlled scouting exist; it is not a full world mapper.
- Combat: defensive logic exists; it is not a perfect combat AI and should retreat rather than chase risky fights.
- Nether: prep and safe entry are implemented; Nether exploration/mining/fortress/bastion search are explicitly out of scope.
- Dialogue: direct replies and typo tolerance are present; dialogue is not allowed to execute raw actions.
- Long-term planning: useful templates and safe execution exist; it should be treated as a controlled helper, not autonomous game completion.

## Missing Or Stubbed Features

- Fire resistance brewing is not implemented. `brewing.js` reports unsupported rather than faking success.
- Advanced build-area clearing is intentionally not implemented.
- Nether portal platform securing has scaffolded safety behavior and should be tested carefully.
- Diamond mining is not accepted as a 1.0 implemented capability.
- PVP is disabled.
- Villager trading, enchanting, potion automation, schematic building, multi-bot behavior, dashboard, and full advancement progression are not implemented.

## Duplicate Logic And Drift Findings

- Commands were historically spread across `chat.js`, README examples, Ollama schemas, and capabilities. `commandRegistry.js` now provides a 1.0 audit surface, but `chat.js` still contains the actual hardcoded router for most commands.
- Planner action names were broader than implemented capabilities. `capabilities.js` now imports the planner action schema and marks unknown schema actions as `implemented: false`.
- Help text now comes from the command registry, but older README sections still include long scenario flows that should be treated as manual test examples, not a formal guarantee.
- Some task queue handlers are thin glue wrappers around modules. They are not dead code, but they need future integration tests before being treated as complete behavior.

## Known Bugs

- Some task queue handlers are glue wrappers that return `{ done: true }` after delegating to a module; this is acceptable for smoke wiring but should receive deeper integration tests later.
- Several advanced systems depend on Mineflayer pathfinding and world block state, so behavior may vary with terrain, server lag, unloaded chunks, and bot position.
- Java is not on PATH on the current machine, even though the server is reachable. If the project launcher needs Java directly, install Java or update PATH.
- README historically grew faster than implementation. 1.0 docs now include caveats, but future command additions should be checked against `commandRegistry.js`.

## Dead Code Review

No obviously removable module was deleted during this pass. Several advanced modules are partially scaffolded but still wired into actions, planners, tests, or future commands. Removing them would risk breaking existing owner commands, so the 1.0 choice is to mark unsupported capabilities as unimplemented instead of deleting files.

## Known Caveats

- The bot is local and experimental. It should not be exposed to public servers.
- The LLM can speak and interpret, but execution must go through deterministic modules.
- The bot should be supervised during mining, combat, Nether entry, building, and animal luring.
- “Day time all the time” is recommended for controlled testing.
- Memory files can be reset or backed up, but resetting removes learned locations/goals/conversation memory.

## Safety Risks

- Long-running pathfinding/digging/placing loops can still miss cancellation if a third-party Mineflayer call blocks internally.
- Combat can misjudge creeper or ranged mob risk.
- Nether entry is inherently risky even with guardrails.
- Chest/storage logic must keep using registered chests only.
- Any future LLM planner change must not bypass `goalValidator.js`, `capabilities.js`, or `actions.js`.

## Performance Risks

- World scans can be expensive if radii are increased.
- Dialogue, strategic planning, and intent fallback can overuse Ollama if cooldowns are reduced.
- Memory writes can become frequent if future code writes on every tick.
- Pathfinding retries can cause CPU spikes if terrain is impossible.

## Ollama/LLM Risks

- Local Ollama models may return invalid JSON. The code uses schema requests, JSON extraction, think-block stripping, fallbacks, and tests.
- Ollama failures should not crash the bot.
- Dialogue output is stripped of action fields and should never execute actions directly.
- Rate limiting is in-memory and per bot process.

## Minecraft Version Risks

- Mineflayer protocol support may lag behind new Minecraft/Paper releases.
- This release targets `1.21.11`; changing versions requires doctor/smoke retesting.
- Paper build behavior can differ from vanilla in minor ways.

## Memory/Persistence Risks

- `memory.json`, `map-memory.json`, `goals.json`, and `conversation-memory.json` are now shape-checked and atomically saved.
- Malformed files are backed up before replacement.
- Map and conversation memory still need pruning discipline as play time grows.
- Backups can accumulate in `backups/`.

## Pathfinding Risks

- Mineflayer cannot guarantee safe pathing through every terrain shape.
- Stuck recovery exists but is not magic.
- Water, lava, ravines, fences, doors, portals, and mobs can interrupt tasks.

## Recommended 1.0 Scope

Required:

- Connect reliably as `tj`.
- Owner-only command execution.
- Emergency stop.
- Status/help.
- Movement basics.
- Survival basics.
- Crafting basics.
- Home/storage basics.
- Advanced modules do not crash under basic commands.
- Risky actions require confirmation.
- Doctor/smoke/unit/safety/Ollama tests run.

Not required:

- Full Minecraft completion.
- Full Nether progression.
- Perfect combat/mining/farming/exploration.
- Villagers, enchanting, potions, schematics, multi-bot work, dashboard.

## 1.0 Acceptance Criteria

1. Bot joins as `tj`.
2. Only `ModVinny` can command actions.
3. `tj stop` cancels all long-running actions as far as Mineflayer permits.
4. No paid/cloud API required.
5. Ollama failure does not crash bot.
6. Memory file corruption does not permanently break bot.
7. README commands match implemented commands or are clearly caveated.
8. Risky actions require confirmation.
9. Bot does not autonomously enter Nether.
10. Bot does not autonomously attack players.
11. Bot does not autonomously use diamonds.
12. Bot does not spam chat.
13. Bot can report status/help.
14. `npm run doctor` works.
15. `npm run smoke` works.
16. `npm test` passes for pure logic tests.
17. Known caveats are documented.

## Verification Performed

- `npm run check`: passed.
- `npm test`: passed.
- `npm run audit:safety`: passed.
- `npm run smoke`: passed, including server reachability and Ollama role model availability.
- `npm run doctor`: passed, with Java-on-PATH warning.
- `npm run test:ollama`: passed.

## Post-1.0 Feature Backlog

See `BACKLOG.md`.
