# Phase 15: Blueprint / Schematic Building

## Overview

Blueprint building gives tj a deterministic, owner-approved way to plan and build small structures. The system uses built-in blueprint definitions, material checks, safety validation, capped block placement, build memory, and evidence records.

This is not freeform LLM building. Ollama does not generate block coordinates, approve builds, or place blocks.

## Architecture

```text
chat.js / commandRegistry.js
-> actions.js
-> blueprintSystem.js
-> blueprintRegistry.js / blueprintPlanner.js / blueprintSafety.js
-> blueprintBuilder.js
-> placement.js
-> progressEvidence.js / blueprintMemory.js
```

The builder never imports Ollama and does not accept raw placement text. Mutating build actions require owner confirmation.

## Built-In Blueprints

Phase 15 ships with small deterministic blueprints:

- `starter_workstation`: crafting table, furnace, chest, and torches.
- `torch_ring`: a small ring of torches.
- `storage_wall`: up to four chests with torches.
- `small_shelter_5x5`: a simple plank shelter with a door and torches.
- `farm_corner`: composter, chest, and torch utility corner.
- `mine_entrance_marker`: cobblestone and torch mine marker.
- `nether_portal_safety_frame`: cobblestone safety marker only. It does not light or enter a portal.

Blueprints are limited by config:

```json
"maxBlueprintBlocks": 256,
"maxBlueprintWidth": 16,
"maxBlueprintLength": 16,
"maxBlueprintHeight": 8,
"maxBlocksPlacedPerRun": 64
```

## Material Estimation

`materialEstimator.js` counts required blocks, checks inventory, reports missing materials, and only allows safe substitutions when explicitly approved in a future flow.

Phase 15 does not spend rare blocks, ores, diamonds, filled containers, or dangerous blocks as build material.

## Build Planning

`blueprintPlanner.js` creates a plan before anything is placed. It can:

- normalize blueprint names and aliases
- choose an origin near the owner or home
- rotate blueprint coordinates
- transform relative coordinates into world positions
- sort blocks so foundations and lower blocks come before roof/details
- generate a preview and material summary

Planning does not place or break blocks.

## Safety Rules

`blueprintSafety.js` blocks builds when:

- the request is not from ModVinny
- confirmation is missing
- cancellation is active
- hostile mobs or active danger are nearby
- health or food is unsafe
- the build is too far from owner or home
- the blueprint is too large
- dangerous blocks are present
- the area overlaps protected blocks
- the area overlaps players, mobs, villagers, farms, chests, beds, portals, or workstations
- the plan would place beds outside the overworld
- clearing or replacing blocks would be required

Dangerous blocks such as TNT, lava, fire, command blocks, structure blocks, spawners, and end crystals are rejected.

## Build Execution

`blueprintBuilder.js` places blocks one at a time through `placement.js`.

During every block placement it checks:

- cancellation
- safety
- inventory
- placement feasibility
- block verification after placement

Builds pause if they hit the per-run block cap, lose materials, encounter danger, or fail validation. `tj stop` cancels the active build.

## Build Memory

`blueprint-memory.json` stores:

- active build
- paused builds
- failed builds
- build history
- placed, failed, and remaining blocks
- compact evidence

The file is created safely, validated on load, backed up if malformed, and capped so it does not grow without bound.

## Evidence

Blueprint evidence includes:

- `blueprint_status_reported`
- `blueprint_list_reported`
- `blueprint_preview_created`
- `blueprint_materials_checked`
- `blueprint_plan_created`
- `blueprint_build_approved`
- `blueprint_build_started`
- `blueprint_block_placed`
- `blueprint_block_verified`
- `blueprint_build_partial`
- `blueprint_build_completed`
- `blueprint_build_failed`
- `blueprint_build_cancelled`
- `schematic_status_reported`
- `schematic_import_unsupported`

`blueprint_build_completed` requires block verification evidence. A preview or material report is not proof of construction.

## Schematic Import

Imported schematics are disabled by default:

```json
"schematicImportEnabled": false,
"allowImportedSchematics": false
```

`schematicImport.js` is an honest scaffold. It rejects path traversal, only allows the local `schematics` folder if future support is enabled, and reports unsupported status unless a safe parser is added and tested.

Phase 15 does not claim `.schem` or `.schematic` import support.

## Commands

```text
tj blueprints
tj blueprint status
tj schematic status
tj preview small shelter
tj materials for small shelter
tj plan build small shelter
tj build starter workstation
tj confirm build
tj blueprint progress
tj pause build
tj resume build
tj continue build
tj cancel build
tj stop
```

Expected flow:

```text
tj build starter workstation
tj confirm build
tj blueprint progress
```

If materials or safety checks fail, tj reports the blockers instead of building.

## Dashboard Integration

If the dashboard is enabled, it exposes blueprint status, active build progress, history, preview, material checks, and safe control endpoints for planning, confirming, continuing, pausing, and cancelling builds.

Dashboard controls still require the dashboard token and route through existing safe action systems.

## Tests

```powershell
cd E:\Games\MCAI\bot
npm run blueprint:audit
npm run test:blueprints
```

The audit validates built-ins, dimensions, dangerous blocks, commands, evidence names, skill registration, and that schematic import is disabled/unsupported honestly.

## Known Caveats

- Phase 15 starts with small built-in blueprints only.
- Imported schematics are disabled until a safe parser is added and tested.
- Large decorative builds are future work.
- Redstone blueprints are future work.
- Area clearing and block replacement are disabled by default.
- Multi-bot construction is future work.
