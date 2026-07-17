# Action domain handlers

Factories composed by `createActions.js`. Nearly all handlers live here.

| Module | Contents |
|--------|----------|
| `runtimeContext.js` | say, pathfinder setup, cancel, owner helpers |
| `thin.js` | Thin-core wrappers |
| `movement.js` | stop, status, come / follow / stay |
| `survival.js` | wood/dig, craft, armor, food, inventory |
| `dialogue.js` | chat, personality, conversation memory |
| `mapHelpers.js` | map load/save, waypoints |
| `farming.js` | crops, pens, farm storage |
| `mining.js` | mining status, coal/iron, smelt |
| `exploration.js` | map status, scout, routes, biomes |
| `base.js` | home, storage, build, resource runs, items/sleep |
| `gear.js` | enchant / anvil / potions / brewing |
| `villagers.js` | villager economy / trading |
| `blueprints.js` | blueprint build pipeline |
| `bridge.js` | server bridge + plugin wrappers |
| `nether.js` | nether prep / portals / scout |
| `combat.js` | combat / defense |
| `planning.js` | goals + strategic planner |
| `skills.js` | skill runner + evidence |
| `meta.js` | natural router, competent core, idle, learning, test arena |
| `curriculum.js` | curriculum suggest + execute |
| `progression.js` | milestones / progression memory |

`createActions.js` is now a **composer** (~orchestrator + executeAction + help + a few status helpers).

## Composition order

```text
runtime → thin → movement → survival
dialogue
resourceOptions → sayPlanning stub
mapHelpers → farming → mining → exploration
base (fills resourceRunAction)
gear → villagers → blueprints → bridge
nether → combat → planning (fills sayPlanning)
skills → meta → curriculum → progression
help / returnHomeAndDeposit / executeAction / api surface
```

## Still inline in createActions (intentionally small)

- `resourceOptions`
- `brainStatus`, `taskStatus`, `safetyStatus`, `memoryStatus`, `whereBot` / `whereOwner` / `whoNearby`
- `help`, `returnHomeAndDepositHandler`
- `normalizeActionResult`, `executeAction`, `hasAction`, `listActions`
- Public `api` object mapping
