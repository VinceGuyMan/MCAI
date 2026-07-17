# Phase 12: Achievement and Progression System

## Overview

The progression system tracks tj's Minecraft survival progress with custom evidence-backed milestones. It is a planner and tracker, not an autonomous speedrun system.

Progression can:

- report completed, incomplete, blocked, and future milestones
- suggest safe next milestones
- explain missing prerequisites and evidence
- build draft plans that connect to skills, curriculum, and goals
- record manual corrections only after confirmation

Progression cannot:

- move, dig, place, attack, open chests, or enter portals directly
- mark dangerous milestones complete without evidence or confirmation
- execute Nether, End, boss, PVP, mining, building, or combat tasks by itself
- use Ollama as proof that something happened

## Architecture

```text
ModVinny chat
-> chat.js / commandRegistry.js
-> progressionSystem.js
-> progressionRegistry.js
-> progressionTracker.js / progressionAdvisor.js / progressionPlanner.js
-> skill, curriculum, and goal systems
-> deterministic actions
-> progressEvidence.js / progressionEvidence.js
-> progression-memory.json
```

Progression modules do not import Mineflayer directly and do not call Ollama for verification.

## Custom Milestones vs Vanilla Advancements

Custom milestones are the primary tracker because Mineflayer does not provide a guaranteed complete vanilla advancement API for every server setup.

`vanillaAdvancementBridge.js` is best-effort:

- it can detect some advancement-like messages if they appear
- it maps known advancement text to custom milestones where possible
- it fails gracefully when vanilla data is unavailable
- it does not require operator commands or cheats

## Categories And Tiers

Categories include tutorial, survival, tools, base, storage, food, farming, animals, mining, gear, exploration, combat, Nether, enchanting, villagers, End, automation, and custom.

Tiers include tutorial, early, mid, advanced, Nether, endgame, and postgame.

Future systems such as villager breeding/transport/trading halls, full brewing automation, End progression, and dragon fighting are visible as blocked/future milestones. Enchanting, anvil, potion inventory, gear-readiness, and villager economy milestones are available only where the Phase 13/14 code can verify or honestly report them.

## Evidence

Progression evidence is deterministic and comes from:

- inventory counts
- equipment and health/food state
- memory and map memory
- skill evidence history where available
- Nether portal memory and safe-entry records
- gear, enchanting, anvil, potion, and brewing status reports
- owner-confirmed manual corrections

LLM dialogue never counts as evidence.

If evidence cannot be verified, tj reports it as unknown or blocked. For status/check milestones, running the matching command or skill creates the useful evidence.

## Paths

Progression paths are guidance only:

- `safe_survival`
- `builder`
- `miner`
- `farmer`
- `explorer`
- `nether_prep`

Paths suggest the next milestone; they do not execute it.

## Commands

```text
tj progression status
tj progression check
tj next milestone
tj milestones
tj completed milestones
tj blocked milestones
tj explain milestone mining_readiness
tj path safe survival
tj path nether prep
tj plan progression food_security
tj create goal for food_security
tj create curriculum for mining_readiness
tj advancement status
tj progression history
```

Manual corrections require confirmation:

```text
tj mark milestone food_security complete
tj confirm mark milestone complete
tj reset progression
tj confirm reset progression
```

## Dashboard

If Phase 11 dashboard is enabled, `/api/progression` exposes a summarized progression panel:

- completion percent
- recommended milestone
- completed milestones
- blocked milestones
- category/tier progress
- path list
- recent progression history

Dashboard progression controls are view-first. Dangerous task execution is not exposed through progression.

## Phase 13 Gear Milestones

Gear progression adds milestones such as:

- `enchanting_status_known`
- `enchantment_table_known`
- `lapis_available`
- `first_enchanted_item`
- `anvil_known`
- `first_repaired_item`
- `first_book_applied`
- `potion_inventory_known`
- `fire_resistance_available`
- `brewing_status_known`
- `nether_gear_ready`
- `mining_pickaxe_upgraded`
- `combat_weapon_upgraded`
- `armor_upgraded`

Brewing mastery, villager breeding/transport/trading halls, cured-villager discounts, and netherite upgrades remain future/blocked.

## Phase 15 Blueprint Milestones

Blueprint progression adds milestones such as:

- `blueprint_system_ready`
- `first_blueprint_previewed`
- `first_material_estimate`
- `first_approved_blueprint_build`
- `starter_workstation_built`
- `storage_wall_built`
- `small_shelter_built`
- `mine_entrance_marker_built`
- `portal_safety_frame_built`

Future/blocked blueprint milestones include:

- `imported_schematic_built`
- `large_build_completed`
- `redstone_blueprint_built`
- `decorative_base_blueprints`
- `multi_bot_construction`

Blueprint completion evidence comes from verified block placement and build memory. A preview or material estimate can satisfy planning milestones, but it does not count as a completed build.

## Phase 16 Bridge Milestones

The optional local Paper plugin bridge adds progression milestones such as:

- `server_bridge_status_known`
- `plugin_bridge_connected`
- `first_bridge_event_recorded`
- `home_region_registered`
- `protected_region_known`
- `advancement_bridge_available`
- `death_event_bridge_available`

Future/blocked bridge milestones include server-side inventory bridge support, villager trade bridge support, region editing, and multi-bot coordination.

Bridge evidence can support progression when it reports real server events such as deaths, respawns, advancements, protected-region activity, portal use, or emergency stops. It is optional and does not replace the custom progression tracker.

## Tests

```powershell
cd E:\Games\MCAI\bot
npm run progression:audit
npm run test:progression
```

The audit validates milestone IDs, categories, tiers, prerequisites, evidence names, paths, goal references, future milestones, and that progression modules do not directly call Mineflayer execution or Ollama.

## Known Limitations

- This is not full autonomous Minecraft completion.
- Vanilla advancement tracking is best-effort.
- Custom progression is the source of truth.
- Some physical evidence for action-heavy skills still depends on future evidence milestones.
- Nether entry, portal lighting, combat, deep mining, caving, End entry, villager breeding/transport/trading halls, netherite upgrades, full brewing automation, and boss fights remain confirmation-gated or future-blocked.
