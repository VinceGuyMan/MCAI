# MCAI Architecture

**Goal of this document:** make a vibe-coded 150-module bot *maintainable* without claiming every module is production-ready.

## One-sentence model

```text
Owner chat → command / natural route → action gate → thin core or domain action → Mineflayer plugins → world
```

Local Ollama is for **intent, dialogue, and planning hints**. Physical work should stay deterministic (plugins + small action APIs), not free-form LLM code.

## Runtime stack

| Layer | Entry / home | Role |
|--------|----------------|------|
| Paper server | `scripts/Start-Server.ps1`, Paper jars | Local offline world |
| Bot process | `bot/bot.js` | Mineflayer player `tj` |
| Plugins | `bot/pluginLoader.js` | pathfinder, collectblock, tool, auto-eat, armor |
| Chat / commands | `bot/chat.js`, `commandRegistry.js`, `naturalCommandRouter.js` | Owner-only control surface |
| Safety | `safety.js`, `actionGate.js`, `confirmationManager.js` | Blocks risky work |
| Thin core | `thinCore.js` + `pluginWrappers.js` | Small reliable action API |
| Competent core | `competentCore.js`, `coreMacros.js` | Safe macro helpers |
| God façade | `actions.js` (~5.5k lines) | Wires almost every domain (main debt) |
| Brain tick | `brain.js` | Periodic autonomy (throttled in thin mode) |
| Memory | `memory.json` + domain `*-memory.json` | Persistent state |
| Dashboard | `dashboard/` | Local telemetry + safe controls |
| Optional bridge | `bridge/`, `server-plugin/` | Paper plugin channel (experimental) |

## Tiers (what to touch when)

### Tier 0 — Keep working first

Must stay simple and reliable. Prefer fixing these over adding systems.

| Area | Files (approx) | Config |
|------|----------------|--------|
| Boot / config / log | `bot.js`, `config.js`, `configSchema.js`, `logger.js` | `config.json` |
| Plugins | `pluginLoader.js`, `pluginStatus.js`, `pluginWrappers.js` | `loadOptionalMineflayerPlugins` |
| Thin actions | `thinCore.js` | `thinCoreEnabled=true` |
| Chat stop/status/follow | `chat.js`, `commandRegistry.js` | owner gate |
| Safety stop | `cancellation.js`, `actionGate.js`, `safety.js` | confirmations |
| Basics | `inventory.js`, `homeBase.js`, `food.js`, `crafting.js`, `storage.js`, `armor.js` | various |

**Thin resource set only:** wood, stone, coal, iron.

### Tier 1 — Useful, but not thin-core critical

Survival helpers that may be called from chat or macros when not locked down:

- Mining / resource runs (`mining*.js`, `resourceRuns.js`, `oreScanner.js`)
- Farming / animals
- Map / waypoints / light exploration
- Dialogue personality stack
- Goals / skills **status** (not full auto execution)

### Tier 2 — Parked / gated advanced systems

Code may exist and even be imported, but **should not run** with the default thin-core config:

| System | Flag (should be false in thin mode) | Domain files |
|--------|--------------------------------------|--------------|
| Broad autonomy | `advancedAutonomyEnabled` | `brain.js` plan apply, idle autonomy |
| Curriculum | removed; compatibility flags remain false | retired stubs only |
| Progression | removed; compatibility flags remain false | retired stubs only |
| Villagers | `villagerSystemEnabled` | `villager*.js`, trade*, economy* |
| Nether | `netherSystemEnabled` | `nether*.js`, `portalManager.js` |
| Blueprints | `blueprintSystemEnabled` | `blueprint*.js`, `schematicImport.js` |
| Experimental combat | `experimentalCombatEnabled` | `combat*.js`, defense modules |
| Gear / potions | (domain-specific) | `gear*.js`, enchanting, brewing, potions |

See `bot/domains.json` for the machine-readable map.

### Tier 3 — Meta / tooling

- `bot/scripts/*` audits and doctor
- `bot/test/*`
- `dashboard/*`
- Docs under `docs/`

## Maintainability progress (2026-07 restructure)

Done:

1. **Docs** under `docs/guides` + `docs/history`.
2. **Tier-2 physical homes** in `bot/systems/<domain>/` with **shims** at old `bot/*.js` paths.
3. **`actions.js` split** into `actions/shared.js`, `actions/lazyTier2.js`, `actions/createActions.js` (+ stable re-export entry).
4. **Lazy Tier-2 load** — `attachLazyTier2(config)` only `import()`s `systems/*` when the matching flag is true (parked domains get no-op stubs).
5. **Node.js LTS** installed for local tooling/tests.

Still open:

1. **`createActions.js` is mostly a composer** — handler bodies live under `actions/domains/*`. Remaining inline: `executeAction`, help, status reporters, public `api` map.
2. **Tier-1 implementation modules** (e.g. `mining.js`, `farming.js` at bot root) can later move under `systems/` like Tier-2; action *handlers* are already domain-split.
3. Optional: split the large `api = { ... }` surface into per-domain `api` fragments.

## Target layout (migrate gradually)

Do **not** mass-move JS in one shot. Prefer:

```text
MCAI\
  README.md
  ARCHITECTURE.md
  MODULE_MAP.md
  QUICKSTART_1_0.md
  VERSION.md
  config.json
  docs\                 # guides + history (moved)
  bot\
    bot.js              # entry stays here
    domains.json        # registry of systems
    core\               # future: thin + boot only
    systems\            # future: one folder per domain
      nether\
      villagers\
      blueprints\
      combat\
      curriculum\
      progression\
      gear\
    actions.js          # shrink over time into actions\*.js
    scripts\
    test\
  dashboard\
  bridge\
  scripts\              # server install/start
```

### Migration rules

1. **One domain per PR / session** when moving code.
2. After a move, leave a **shim** at the old path (`export * from './systems/...'`) until all imports updated.
3. Never enable Tier 2 flags to “test organize”; use unit tests / dry audits.
4. Prefer splitting `actions.js` by **returned action handlers** over renaming for aesthetics.
5. Delete only: temp `*.tmp-*` files, confirmed dead shims after a full test pass.

## Default local policy (1.0-local)

From `config.json` intent:

- `thinCoreEnabled: true`
- Advanced execution flags: **false**
- `competentCoreDisableAdvancedAutonomy: true`
- Local Ollama only; no cloud API
- Only the configured `ownerUsername` may issue action commands

## Where to work next

| Priority | Work | Why |
|----------|------|-----|
| P0 | Keep Tier 0 reliable | Playable companion |
| P1 | Split `actions.js` into domain handlers | Biggest maintainability win |
| P2 | Lazy-import Tier 2 inside `createActions` | Faster boot, clearer boundaries |
| P3 | Physical move into `bot/systems/*` | Match mental model to folders |
| P4 | Multi-bot / public dashboard / perfect Nether | Backlog fantasy, not structure work |

## Related files

- `MODULE_MAP.md` — file ↔ tier ↔ flag
- `bot/domains.json` — machine-readable registry
- `docs/guides/THIN_CORE.md` — thin action API details
- `docs/` — feature guides and historical reports
- `BACKLOG.md` — product backlog (not structure)
