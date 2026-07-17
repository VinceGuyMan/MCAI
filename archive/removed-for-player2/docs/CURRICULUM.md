# Curriculum Suggestions And Approved Execution

Phase 10 Milestone 4 added a suggestion layer for tj's skill system. Milestone 5 adds approved one-step execution for low-risk readiness/status skills.

Suggestions are recommendation only. Approved execution is handled separately by `curriculumExecutor.js`, and still never lets Ollama create or run actions.

## Architecture

Minecraft chat flows through:

`chat.js -> actions.js -> curriculumEngine.js -> skillRegistry.js / skillValidator.js / skillMemory.js / progressEvidence.js`

Approved execution flows through:

`chat.js -> actions.js -> curriculumExecutor.js -> curriculumGuard.js -> skillRunner.js -> actions.js -> deterministic modules`

The curriculum engine reads:

- registered skills from `skillRegistry.js`
- runner-safe status skills from `skillValidator.js`
- recent success, failure, cooldown, and evidence data from `skillMemory.js`
- evidence summaries from `progressEvidence.js`
- reusable tracks from `curriculumTemplates.js`

`curriculumEngine.js` returns suggestions only. `curriculumExecutor.js` can run one approved low-risk step through `skillRunner.js`.

## Scoring Model

Scoring is deterministic in `curriculumScoring.js`.

Skills are boosted when they are:

- useful for survival or current readiness
- low risk
- implemented
- enabled in the safe skill runner
- backed by recent evidence

Skills are penalized or blocked when they are:

- unknown
- unimplemented
- high risk
- confirmation-gated
- recently failed
- on cooldown
- unsafe in the current context
- not enabled in the Milestone 2 skill runner

## Curriculum Tracks

Current tracks:

- `survival_basics`
- `base_readiness`
- `mining_readiness`
- `food_security`
- `exploration_readiness`
- `combat_readiness`
- `nether_readiness`
- `skill_system_health`

Tracks may contain blocked steps. That is intentional. tj should say what is safe now and what is not ready yet.

## Commands

- `tj curriculum status`
- `tj suggest next skill`
- `tj what can you practice?`
- `tj curriculum tracks`
- `tj suggest mining readiness`
- `tj suggest nether readiness`
- `tj curriculum history`
- `tj accept suggestion`
- `tj dismiss suggestion`

`tj accept suggestion` records that ModVinny liked the suggestion. It does not run the skill.

## Memory

Curriculum suggestion history is stored in `curriculum-memory.json`.

It stores small summaries only:

- last suggestions
- accepted suggestions
- dismissed suggestions
- track history
- lightweight owner track preferences

It does not store world snapshots or large logs.

## Evidence Integration

Evidence affects ranking but does not execute anything.

For example:

- A skill with recent verified evidence is easier to recommend.
- A skill with recent failed evidence is deprioritized.
- A status skill with only reported evidence may still be useful, but tj should label it honestly.

Ollama cannot verify evidence.

## Known Caveats

Milestone 4 does not run curriculum steps. It does not create a `curriculumEngine` execution loop. It does not make tj practice skills by himself.

Risky skills such as Nether entry, portal lighting, combat engagement, deep mining, caving, and diamond mining can appear as blocked suggestions only.

## Milestone 5: Approved Execution

Milestone 5 adds `bot/curriculumExecutor.js` and `bot/curriculumGuard.js`.

Approved execution is intentionally narrow:

1. tj suggests a skill or track.
2. ModVinny approves the skill or track.
3. tj waits.
4. ModVinny says `tj run approved curriculum step`.
5. tj runs exactly one low-risk readiness/status skill through `skillRunner.js`.
6. tj records evidence and pauses before the next step.

Execution architecture:

```text
chat.js / commandRegistry.js
-> curriculumExecutor.js
-> curriculumGuard.js
-> skillRunner.js
-> actions.js
-> deterministic modules
-> progressEvidence.js / skillMemory.js / curriculumMemory.js
```

`curriculumExecutor.js` does not import Mineflayer, `actions.js`, or Ollama. It executes only through `skillRunner.runSkill`.

Allowed now:

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

Blocked now:

- mining execution
- combat execution
- Nether entry or portal lighting
- building
- farming creation or mutation
- animal luring/breeding
- storage mutation
- exploration travel
- any medium/high-risk step by default

Commands:

- `tj curriculum execution status`
- `tj approve curriculum food_status`
- `tj approve survival basics`
- `tj run approved curriculum step`
- `tj continue curriculum`
- `tj curriculum progress`
- `tj explain curriculum blockers`
- `tj cancel curriculum`

Evidence behavior:

- Underlying skills still record skill evidence through `skillRunner.js`.
- Curriculum wraps that evidence with `curriculum_step_started`, `curriculum_step_completed`, `curriculum_step_failed`, or `curriculum_step_partial`.
- Failed or partial steps pause the curriculum.
- Completed steps also pause unless the entire curriculum is complete.

Memory behavior:

- `curriculum-memory.json` stores active curriculum sessions, recent sessions, and execution history.
- The history is capped and stores compact evidence, not large action results.

Known caveat: Milestone 5 is not full autonomous practice. It does not execute action-heavy gameplay skills, and it does not run whole tracks automatically.

## Phase 13: Gear Readiness Tracks

Phase 13 adds gear-related curriculum tracks:

- `gear_readiness`
- `mining_gear_readiness`
- `combat_gear_readiness`
- `nether_gear_readiness`
- `enchanting_readiness`
- `potion_readiness`

These tracks execute only low-risk status/readiness skills through approved curriculum execution. They do not auto-enchant, auto-repair, auto-use potions, auto-brew, or spend rare resources.

Blocked gear curriculum steps include:

- `enchant_item`
- `repair_item`
- `apply_book_to_item`
- `use_potion`
- `brew_potion`

Those remain direct, confirmation-gated owner commands.

## Phase 15: Blueprint Readiness Tracks

Phase 15 adds blueprint-related readiness tracks:

- `building_readiness`
- `base_blueprint_readiness`
- `shelter_blueprint_readiness`

These tracks use safe status and planning skills such as:

- `blueprint_status`
- `list_blueprints`
- `blueprint_preview`
- `blueprint_materials`
- `home_status`
- `inventory_summary`

Curriculum does not auto-build. `blueprint_build_small` and `blueprint_continue_build` are world-mutating, confirmation-gated skills and remain blocked from autonomous curriculum execution.

Blueprint readiness can help answer whether a small shelter, workstation, storage wall, or marker is practical, but ModVinny still has to approve the build and run it through the blueprint commands.
