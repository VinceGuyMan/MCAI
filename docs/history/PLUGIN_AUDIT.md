# Plugin Audit

Phase 18.5 did not install new packages. This audit records what is currently installed and how it should be treated by tj's safety model.

## Installed Mineflayer Packages

- `mineflayer`
  - Installed: yes
  - Used: yes
  - Purpose: physical player bot framework
  - Risk: high if called directly from planners or LLM output
  - Recommendation: keep wrapped behind deterministic modules, `actions.js`, safety checks, and cancellation

- `mineflayer-pathfinder`
  - Installed: yes
  - Used: yes
  - Purpose: movement/pathing
  - Risk: medium because bad routing can move tj into danger
  - Recommendation: keep behind movement/actions modules and cancellation checks

- `minecraft-data`
  - Installed: yes
  - Used: yes
  - Purpose: item/block/entity metadata
  - Risk: low
  - Recommendation: safe to keep for validation and planning

- `vec3`
  - Installed: yes
  - Used: yes
  - Purpose: block/entity coordinates
  - Risk: low
  - Recommendation: safe utility dependency

## Not Installed

- `mineflayer-collectblock`
  - Useful: maybe, for resource collection
  - Risk: medium; could bypass custom safety if used directly
  - Recommendation: do not install automatically. If added later, wrap behind `actions.js`, resource caps, owner-only commands, and cancellation.

- `mineflayer-tool`
  - Useful: maybe, for tool selection
  - Risk: low to medium
  - Recommendation: current tool helpers are custom. Only add if it reduces bugs and stays behind safety.

- `mineflayer-armor-manager`
  - Useful: maybe, for armor equip automation
  - Risk: medium if it swaps valuable gear at the wrong time
  - Recommendation: do not auto-equip outside gear safety rules.

- `mineflayer-auto-eat`
  - Useful: maybe, for hunger handling
  - Risk: medium because it can consume valuable food without owner awareness
  - Recommendation: keep current deterministic `eat`/food logic unless wrapped with reserve rules.

- `prismarine-viewer`
  - Useful: debugging/visualization
  - Risk: low locally, but it exposes a local web surface
  - Recommendation: optional future dashboard integration only, local-only.

- `web-inventory` or similar dashboard inventory tools
  - Useful: maybe
  - Risk: medium if it exposes inventory controls
  - Recommendation: read-only dashboard first; no raw inventory mutation.

## Recommendation

The current dependency set is conservative and appropriate. Future plugins should be added only after a safety wrapper exists, with owner-only control, confirmation for risky actions, and tests proving they cannot bypass `commandRegistry`, `actions.js`, `skillRunner`, `safety.js`, or cancellation.

## Phase 21.5 Reality Audit

Latest check:

- `mineflayer-pathfinder`: installed and now loaded through `pluginLoader.js`.
- `mineflayer-collectblock`: missing. Competent Core gather/mine macros now fail honestly instead of pretending reliable collection is available.
- `mineflayer-tool`: missing. Competent Core gather/mine macros require it for field-reliable tool selection.
- `mineflayer-auto-eat`: missing and optional.
- `mineflayer-armor-manager`: missing and optional.
- `prismarine-viewer`: missing and optional.

Commands:

- `npm run plugins:check`
- `npm run plugins:audit`
- `npm run test:plugins`
- In game: `tj plugin status`

Critical install command:

```powershell
cd E:\Games\MCAI\bot
npm install mineflayer-collectblock mineflayer-tool
```

Recommended optional install command:

```powershell
cd E:\Games\MCAI\bot
npm install mineflayer-auto-eat mineflayer-armor-manager prismarine-viewer
```

The wrappers are intentionally strict now: unless `allowFallbackWithoutPlugin=true`, missing plugins return clear `ok:false` results. This protects field testing from false positives.
