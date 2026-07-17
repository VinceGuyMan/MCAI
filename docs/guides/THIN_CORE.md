# TJ Thin Core

Thin core mode keeps TJ practical and easier to debug.

The rule is:

```text
chat or natural command
-> command registry / thin intent route
-> actionGate
-> thinCore.js
-> pluginWrappers.js
-> Mineflayer plugins
```

Mineflayer handles the connection and low-level Minecraft state. The core plugins do the physical work:

- `mineflayer-pathfinder`: movement
- `mineflayer-collectblock`: basic block gathering and mining
- `mineflayer-tool`: tool selection
- `mineflayer-auto-eat`: eating
- `mineflayer-armor-manager`: armor equip

TJ decides what to do, checks safety, calls one small safe action, and verifies evidence.

## Enabled Config

```json
"thinCoreEnabled": true,
"advancedAutonomyEnabled": false,
"curriculumExecutionEnabled": false,
"progressionExecutionEnabled": false,
"villagerSystemEnabled": false,
"netherSystemEnabled": false,
"blueprintSystemEnabled": false,
"experimentalCombatEnabled": false
```

When `thinCoreEnabled=true`, common movement and resource commands use the thin action API. Advanced systems remain in the repo for status and explicit future work, but normal routing should not use them as broad execution engines.

## Minimal Action API

`bot/thinCore.js` exposes:

- `status`
- `stop`
- `come_to_owner`
- `follow_owner`
- `stay`
- `collect_resource`
- `eat_if_hungry`
- `equip_tool_for`
- `equip_armor`
- `craft_item`
- `store_items`
- `return_home`
- `remember_home`
- `report_missing_requirements`

Every thin action returns:

```json
{
  "ok": true,
  "message": "short message",
  "evidence": {},
  "data": {}
}
```

Failures include `reason` and may include `error`.

## Resource Collection

Thin resource collection supports only:

- `wood`
- `stone`
- `coal`
- `iron`

Aliases such as `logs`, `oak`, `cobble`, `cobblestone`, and `raw iron` normalize to those resources.

The action records:

- starting inventory count
- ending inventory count
- target count
- collected count
- blocks attempted
- plugin wrapper used
- failure reason if incomplete

## Disabled In Thin Core

These systems are not deleted, but should not run from normal command routing while thin core is enabled:

- broad planner execution in `brain.applyPlan`
- curriculum/progression execution
- villager automation
- blueprint/build automation
- Nether automation
- enchanting/anvil/potion automation
- aggressive combat automation
- old custom resource-run loops for wood, stone, coal, and iron

## Field Test Commands

Run these in Minecraft as `ModVinny`:

```text
tj plugin status
tj status
tj come here
tj follow me
tj stay
tj get 8 wood
tj mine 16 stone
tj find coal
tj eat
tj set home
tj return home
tj stop
```

Expected behavior:

- movement uses pathfinder wrappers
- resource collection uses collectBlock/tool wrappers
- eating uses auto-eat wrapper
- failed plugin availability is reported honestly
- `tj stop` clears movement and active thin-core work

## PraisonAI Later

PraisonAI should wait until thin core passes field tests. When added later, it should only choose high-level goals and call the minimal thin action API. It must never directly control Mineflayer.
