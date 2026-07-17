# Skill Registry

Phase 10, Milestone 1 adds an audit layer for tj's existing abilities. It does not add autonomous curriculum execution, multi-bot behavior, new gameplay systems, or LLM-generated code.

The registry lives in `bot/skillRegistry.js`. It describes what tj can do, whether the skill is actually wired, what risk level it has, what preconditions it expects, and what evidence would prove it worked.

## What A Skill Is

A skill is a declarative record like:

```json
{
  "name": "mine_coal",
  "category": "mining",
  "description": "Mine a small safe amount of visible or reachable coal.",
  "implemented": true,
  "riskLevel": "medium",
  "requiresConfirmation": false,
  "preconditions": ["has_pickaxe", "has_food", "has_torches"],
  "inputs": {
    "targetCount": "number"
  },
  "successEvidence": ["coal_count_increased", "returned_safely"],
  "cooldownMs": 30000,
  "maxRuntimeMs": 180000,
  "action": "mine_coal"
}
```

The registry does not call Mineflayer directly. Running a skill in a future milestone must go through:

```text
chat.js / commandParser.js
-> skill registry / skill validator
-> actions.js
-> deterministic Mineflayer modules
```

## Categories

Current categories:

- core
- movement
- survival
- food
- crafting
- inventory
- armor
- base
- storage
- mining
- farming
- animals
- exploration
- combat
- goals
- nether
- dialogue

## Implemented Skills

Implemented skills are registry entries whose `action` is currently wired to `actions.js` or an existing module through `actions.js`.

Examples:

- `status`
- `stop`
- `come_here`
- `follow_owner`
- `food_status`
- `eat_if_hungry`
- `craft_item`
- `inventory_status`
- `armor_status`
- `set_home`
- `storage_status`
- `mine_stone`
- `mine_coal`
- `mine_iron`
- `farming_status`
- `create_farm`
- `animal_pen_status`
- `map_status`
- `scan_area`
- `combat_status`
- `threat_scan`
- `goals_status`
- `nether_checklist`
- `prepare_nether`
- `light_portal`
- `safe_nether_entry`
- `dialogue_status`

Use `npm run skill:audit` or `tj skills` for the current counts.

## Unimplemented Skills

Unimplemented skills are intentionally visible so docs and future plans do not pretend they work. They cannot run through the validator.

Current examples include:

- `mine_diamond`
- `deep_mining`
- `cave_mining`
- `animal_slaughter`
- `cave_exploration`
- `pvp_attack`
- `attack_protected_entity`
- `nether_exploration`
- `nether_mining`
- `fortress_search`
- `bastion_search`
- `brew_fire_resistance`

These may be documented as future or guarded ideas, but they are not advertised as working skills.

## Risky Skills

Risk levels are:

- `low`: safe status, reporting, or simple low-risk actions.
- `medium`: movement, gathering, crafting, storage, mining, farming, or other actions that can fail or consume resources.
- `high`: dangerous actions, valuable resources, Nether entry, combat engagement, PVP, or irreversible memory clearing.

High-risk or explicitly confirmation-required skills include:

- `craft_diamond_armor`
- `engage_hostile`
- `light_portal`
- `safe_nether_entry`
- `clear_conversation_memory`
- blocked future skills such as `pvp_attack`, `mine_diamond`, `nether_exploration`, and `nether_mining`

The validator blocks unimplemented skills and requires confirmation for confirmation-gated skills.

## Skill Validation

`bot/skillValidator.js` provides:

- `validateSkill(skill)`
- `validateSkillCanRun(bot, memory, skill, args)`
- `validateSkillPreconditions(bot, memory, skill)`
- `validateSkillRisk(bot, memory, skill)`
- `validateSkillConfirmation(bot, memory, skill)`
- `explainSkillBlockers(bot, memory, skill, args)`
- `isSkillSafeForAutonomy(skill)`
- `isSkillOwnerOnly(skill)`

Current rules:

- Unknown skills cannot run.
- Unimplemented skills cannot run.
- Risky skills require confirmation.
- Nether entry and portal lighting require confirmation.
- PVP remains disabled.
- Deep mining, caving, and diamond mining remain blocked unless a later phase implements them safely.
- Dialogue skills cannot execute raw gameplay actions.
- The registry cannot bypass `tj stop`.
- Skills must eventually run through `actions.js`.

## Skill Memory

`bot/skillMemory.js` creates and maintains `skill-memory.json`.

Default shape:

```json
{
  "version": 1,
  "createdAt": 0,
  "updatedAt": 0,
  "skills": {},
  "recentRuns": [],
  "evidenceStats": {}
}
```

Each skill can track:

- success count
- failure count
- last run time
- last success/failure
- last failure reason
- average duration
- cooldown timestamp
- last evidence

This is only telemetry for now. It does not start tasks and does not choose goals.

Milestone 3 adds evidence records to skill memory. Recent runs now include result status, evidence records, evidence summaries, and action names. Skill entries track partial counts, common failure reasons, and the last evidence summary.

## Commands

Owner-only commands added for this milestone:

- `tj skills`
- `tj skill status`
- `tj skill status mining`
- `tj what skills do you have?`
- `tj skill audit`
- `tj unimplemented skills`
- `tj risky skills`

Expected behavior:

- `tj skills` lists categories and implemented counts.
- `tj skill status mining` lists mining skills and whether they are implemented.
- `tj unimplemented skills` lists registry entries that are not wired.
- `tj risky skills` lists high-risk or confirmation-required skills.
- `tj skill audit` validates registry definitions and action wiring.

## Milestone 2: Skill Runner

`bot/skillRunner.js` is the first execution layer for registered skills. It does not add curriculum execution or autonomy. It only lets ModVinny run a small safe starter set through:

```text
chat.js / commandRegistry.js
-> skillRunner.js
-> skillValidator.js
-> actions.js
-> deterministic modules
```

The runner never calls Mineflayer directly and never asks Ollama to execute a skill.

Runnable starter skills:

- `status`
- `inventory_summary`
- `home_status`
- `mining_status`
- `farming_status`
- `nether_checklist`
- `skills_status`

Optional low-risk status skills may also pass validation when wired, such as `food_status`, `armor_status`, `storage_status`, `map_status`, `goals_status`, and `combat_status`.

Intentionally not runnable through the Milestone 2 runner:

- mining execution such as `mine_coal`
- combat execution such as `engage_hostile`
- Nether entry and portal lighting
- farm creation
- animal luring or breeding
- building and placement skills
- storage deposit/withdrawal
- exploration travel

If a registered skill is not enabled for this runner yet, tj reports that it is registered but not enabled for Milestone 2.

Runner validation checks:

- unknown skills are rejected
- unimplemented skills are rejected
- non-owner skill runs are rejected
- risky skills still require confirmation
- cooldowns and max runtimes are respected
- dialogue skills cannot execute raw actions
- `tj stop` and `tj cancel skill` clear the active skill state

Skill memory now records actual runner starts, successes, failures, duration, and evidence in `skill-memory.json`. Recent runs are capped so this file does not grow endlessly.

Runner commands:

- `tj run skill status`
- `tj run skill inventory`
- `tj run skill home status`
- `tj run skill mining status`
- `tj run skill farming status`
- `tj run skill nether checklist`
- `tj active skill`
- `tj skill runner status`
- `tj skill stats`
- `tj skill stats status`
- `tj recent skills`
- `tj cancel skill`

## NPM Scripts

From `bot/`:

```powershell
npm run skill:audit
npm run skill:runner:test
npm run test:skills
```

`npm run skill:audit` validates the registry and creates `skill-memory.json` if missing.

## Milestone 3: Evidence Tracking

`bot/progressEvidence.js` adds deterministic proof for skill runs. tj no longer records only "success/failure"; he records what proof exists.

Ollama cannot mark a skill successful. Dialogue can talk about evidence, but evidence must come from the runner, action result, or a lightweight world snapshot.

Evidence statuses:

- `verified`: confirmed from action result or snapshot.
- `reported`: action succeeded, but only a report exists.
- `partial`: some criteria passed.
- `failed`: required proof is missing or contradicted.
- `unknown`: cannot verify.
- `skipped`: future or not applicable.

Confidence levels:

- `high`
- `medium`
- `low`

Starter evidence definitions include:

- `status_reported`
- `inventory_reported`
- `inventory_snapshot_captured`
- `home_status_reported`
- `mining_status_reported`
- `farming_status_reported`
- `nether_checklist_reported`
- `skills_status_reported`

The runner captures a before snapshot and an after snapshot for every enabled starter skill. Snapshots are lightweight and include position, dimension, health, food, inventory counts, free slots, home state, task name, farm/storage counts, and active goal id.

Not implemented yet:

- strong proof for mining output
- block placement proof
- combat kill proof
- crop harvest/replant proof
- chest deposit/withdrawal proof
- portal entry proof
- waypoint travel proof

Evidence commands:

- `tj evidence status`
- `tj evidence audit`
- `tj recent evidence`
- `tj skill evidence status`
- `tj verify skill status`
- `tj verify skill nether checklist`

Additional checks:

```powershell
npm run evidence:audit
npm run test:evidence
```

See `EVIDENCE.md` for the full evidence model.

`npm run test:skills` runs pure node tests for registry shape, validation, risky skills, unimplemented skills, dialogue separation, and skill memory shape.

## Milestone 4: Curriculum Suggestions

`bot/curriculumEngine.js` now suggests useful next skills without executing them. This is recommendation, not action.

The curriculum layer uses:

- `skillRegistry.js` for known skills
- `skillValidator.js` for blocked/risky/unimplemented checks
- `skillMemory.js` for recent success and failure history
- `progressEvidence.js` for evidence summaries
- `curriculumTemplates.js` for reusable readiness tracks
- `curriculumScoring.js` for deterministic ranking

tj ranks skills higher when they are safe, implemented, useful to ModVinny, enabled in the Milestone 2 runner, and backed by recent evidence. Skills are deprioritized or blocked when they recently failed, are on cooldown, require confirmation, are high risk, or are not runner-enabled yet.

Curriculum tracks:

- `survival_basics`
- `base_readiness`
- `mining_readiness`
- `food_security`
- `exploration_readiness`
- `combat_readiness`
- `nether_readiness`
- `skill_system_health`

Commands:

- `tj curriculum status`
- `tj suggest next skill`
- `tj what can you practice?`
- `tj curriculum tracks`
- `tj suggest mining readiness`
- `tj suggest nether readiness`
- `tj curriculum history`
- `tj accept suggestion`
- `tj dismiss suggestion`

Important limits:

- suggestions never call `skillRunner.runSkill`
- accepted suggestions are only recorded
- risky skills are blocked or marked as requiring confirmation
- unimplemented skills are never advertised as runnable
- no autonomous curriculum practice exists yet

Checks:

```powershell
npm run curriculum:audit
npm run test:curriculum
```

See `CURRICULUM.md` for the dedicated curriculum design notes.

## Milestone 5: Approved Curriculum Execution

`bot/curriculumExecutor.js` adds owner-approved curriculum execution. This is still not autonomous training: tj only runs one approved low-risk readiness/status skill, records evidence, then pauses.

Execution path:

```text
chat.js / commandRegistry.js
-> curriculumExecutor.js
-> curriculumGuard.js / skillValidator.js
-> skillRunner.js
-> actions.js
-> deterministic modules
-> progressEvidence.js / skillMemory.js / curriculumMemory.js
```

Allowed curriculum execution skills:

- `status`
- `inventory_summary`
- `home_status`
- `food_status`
- `armor_status`
- `storage_status`
- `mining_status`
- `farming_status`
- `map_status`
- `goals_status`
- `combat_status`
- `nether_checklist`
- `skills_status`
- `gear_status`
- `suggest_gear_upgrades`
- `enchant_status`
- `anvil_status`
- `potion_status`
- `brewing_status`
- `nether_gear_readiness`
- `villager_status`
- `village_status`
- `trade_status`
- `economy_status`
- `suggest_trades`

Blocked in Milestone 5:

- mining execution such as `mine_coal`
- building and farm creation
- storage deposit/withdrawal
- combat engagement
- portal lighting and Nether entry
- exploration travel
- any medium/high-risk or unimplemented skill

Commands:

- `tj approve curriculum food_status`
- `tj approve survival basics`
- `tj run approved curriculum step`
- `tj continue curriculum`
- `tj curriculum progress`
- `tj explain next curriculum step`
- `tj cancel curriculum`

After each step, tj records underlying skill evidence in `skill-memory.json`, stores curriculum session history in `curriculum-memory.json`, and pauses before the next step. `tj stop` cancels the active skill run and pauses the curriculum path.

Checks:

```powershell
npm run curriculum:execution:audit
npm run test:curriculum-execution
```

## Phase 13: Gear Upgrade Skills

Phase 13 adds low-risk status/readiness skills for gear upgrades and confirmation-gated mutating skills.

Runnable status/readiness skills:

- `gear_status`
- `suggest_gear_upgrades`
- `enchant_status`
- `enchant_options`
- `anvil_status`
- `potion_status`
- `brewing_status`
- `nether_gear_readiness`

Mutating skills are registered as risky and confirmation-gated:

- `enchant_item`
- `repair_item`
- `apply_book_to_item`
- `use_potion`
- `brew_potion`

`brew_potion` is registered but not implemented as a working mutation because reliable brewing stand API support was not confirmed. It remains blocked and honest.

Checks:

```powershell
npm run gear:audit
npm run test:gear
```

## Phase 14: Villager Economy Skills

Phase 14 adds village, villager, trade-inspection, and emerald economy skills. Status/readiness skills are low risk; actual trade execution is medium risk and always confirmation-gated.

Low-risk skills:

- `villager_status`
- `scan_villagers`
- `village_status`
- `trade_status`
- `economy_status`
- `suggest_trades`

Confirmation-gated skills:

- `inspect_villager_trades`
- `remember_village`
- `remember_villager`
- `protect_villager`
- `execute_trade`

Trade execution is never enabled for curriculum autonomy. It must go through deterministic Mineflayer villager APIs, `tradeSafety.js`, and owner confirmation.

Checks:

```powershell
npm run villager:audit
npm run test:villagers
```

## Phase 15: Blueprint Skills

Phase 15 adds deterministic blueprint planning and small-build support. Status, preview, and material skills are low risk. World-mutating build skills are confirmation-gated and are not enabled for curriculum autonomy.

Low-risk blueprint skills:

- `blueprint_status`
- `list_blueprints`
- `blueprint_preview`
- `blueprint_materials`
- `blueprint_plan`
- `schematic_status`

Confirmation-gated build skills:

- `blueprint_build_small`
- `blueprint_continue_build`
- `blueprint_cancel_build`

Blueprint build skills mutate the world, require ModVinny approval, and must pass `blueprintSafety.js`. They are capped, cancellable, and record evidence such as `blueprint_block_verified` and `blueprint_build_completed`.

Schematic import is registered only as status/scaffold support in Phase 15. Imported schematic builds are not advertised as working unless a safe parser is added later.

Checks:

```powershell
npm run blueprint:audit
npm run test:blueprints
```

## Phase 16: Server Plugin Bridge Skills

Phase 16 adds low-risk bridge status skills plus one confirmation-gated region registration skill.

Low-risk bridge skills:

- `server_bridge_status`
- `bridge_health`
- `bridge_recent_events`
- `bridge_regions`
- `bridge_emergency_stop`

Confirmation-gated bridge skill:

- `bridge_register_region`

The bridge skills report local Paper plugin telemetry and optional protected regions. They do not expose raw server commands, teleport, item grants, operator actions, or world editing. If the plugin is unavailable, these skills report that honestly and `tj` continues using normal Mineflayer systems.

Checks:

```powershell
npm run bridge:audit
npm run test:bridge
```
