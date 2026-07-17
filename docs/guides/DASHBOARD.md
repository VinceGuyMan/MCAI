# Phase 11: Local Dashboard

## Overview

The dashboard is a local-only telemetry and safe-control panel for `tj`. It runs beside the Mineflayer bot and shows short summaries of bot status, owner distance, safety flags, current tasks, active skill/curriculum/goal state, inventory, recent evidence, recent skill runs, and recent logs.

Default URL:

```text
http://127.0.0.1:8787
```

The dashboard is intentionally not a raw Mineflayer console. It cannot execute arbitrary JavaScript, shell commands, raw movement, raw digging, raw combat, or direct LLM prompts.

## Security Model

- Binds to `127.0.0.1` by default.
- Refuses unsafe public binding when `dashboardLocalOnly=true`.
- POST control endpoints require `dashboardToken`.
- Dashboard output redacts tokens, API keys, secrets, and local file paths.
- Memory endpoints return summaries only, not raw memory files.
- Risky controls are blocked by default.

Important config:

```json
"dashboardEnabled": true,
"dashboardHost": "127.0.0.1",
"dashboardPort": 8787,
"dashboardRequireOwnerToken": true,
"dashboardToken": "change-me-local-token",
"dashboardAllowDangerousControl": false,
"dashboardAllowRawCommand": false
```

Change `dashboardToken` if another person can access your machine.

## API Endpoints

Read-only endpoints:

- `GET /api/status`
- `GET /api/bot`
- `GET /api/safety`
- `GET /api/inventory`
- `GET /api/task`
- `GET /api/skills`
- `GET /api/skills/recent`
- `GET /api/evidence/recent`
- `GET /api/curriculum`
- `GET /api/goals`
- `GET /api/progression`
- `GET /api/progression/milestones`
- `GET /api/progression/next`
- `GET /api/progression/paths`
- `GET /api/progression/history`
- `GET /api/gear`
- `GET /api/gear/upgrades`
- `GET /api/enchanting`
- `GET /api/anvil`
- `GET /api/potions`
- `GET /api/brewing`
- `GET /api/map`
- `GET /api/memory`
- `GET /api/logs`
- `GET /api/commands`
- `GET /api/doctor`
- `GET /api/ollama`

Control endpoints:

- `POST /api/control/stop`
- `POST /api/control/pause`
- `POST /api/control/resume`
- `POST /api/control/run-skill`
- `POST /api/control/approve-curriculum`
- `POST /api/control/run-curriculum-step`
- `POST /api/control/cancel-curriculum`
- `POST /api/control/goal/pause`
- `POST /api/control/goal/resume`
- `POST /api/control/goal/cancel`

Send the token as:

```text
x-dashboard-token: your-token
```

## Safe Controls

Allowed by default:

- Emergency stop.
- Safe skill runner checks such as `status`, `inventory_summary`, `food_status`, and `nether_checklist`.
- Approved curriculum step execution through `curriculumExecutor.js`.
- Goal pause/resume/cancel through `goals.js`.
- Gear, enchanting, anvil, potion, and brewing status checks through safe skills.
- Blueprint status, preview, material checks, and owner-approved build control through safe blueprint actions.

Blocked by default:

- Nether entry.
- Portal lighting.
- Combat engagement.
- Mining execution.
- General building execution outside the approved blueprint flow.
- Storage mutation.
- Exploration travel.
- Any raw Mineflayer command.
- Any arbitrary code execution.
- Any mutating gear action such as enchanting, anvil use, potion use, or brewing.
- Imported schematic execution and arbitrary schematic file paths.
- Large, dangerous, or raw block-placement builds.

## Blueprint Endpoints

Phase 15 adds local dashboard blueprint endpoints:

- `GET /api/blueprints`
- `GET /api/blueprints/status`
- `GET /api/blueprints/history`
- `GET /api/blueprints/active`
- `GET /api/blueprints/preview/:id`
- `GET /api/blueprints/materials/:id`
- `POST /api/blueprints/plan`
- `POST /api/blueprints/confirm`
- `POST /api/blueprints/continue`
- `POST /api/blueprints/pause`
- `POST /api/blueprints/cancel`

POST endpoints require the dashboard token and route through `actions.js` and the blueprint system. The dashboard cannot send raw Mineflayer placement commands or arbitrary schematic paths.

## Server Plugin Bridge Panel

Phase 16 adds an optional local bridge panel and API endpoints:

- `GET /api/server-bridge/status`
- `GET /api/server-bridge/events`
- `GET /api/server-bridge/regions`
- `GET /api/server-bridge/players`
- `GET /api/server-bridge/health`
- `POST /api/server-bridge/emergency-stop`
- `POST /api/server-bridge/register-region`

The panel shows bridge connectivity, recent events, and protected-region telemetry when the Paper plugin is installed. POST controls require the dashboard token and never expose the server bridge token. The dashboard cannot send raw server commands, teleport requests, give-item requests, or world-edit operations.

## Local Setup

Start normally:

```powershell
cd E:\Games\MCAI\bot
npm start
```

The bot starts the dashboard automatically when `dashboardEnabled=true`.

Standalone dashboard smoke start:

```powershell
cd E:\Games\MCAI\bot
npm run dashboard
```

## Tests

```powershell
cd E:\Games\MCAI\bot
npm run dashboard:test
npm run doctor
npm run smoke
```

## Known Limitations

- The dashboard is not a full map viewer yet.
- Memory is summarized, not edited.
- It does not expose raw logs or raw local files.
- It cannot run risky skills unless a future phase adds a stronger confirmation model.
- It is not designed for public hosting.

## Future Ideas

- Waypoint map view.
- Inventory detail table.
- Goal editor.
- Memory viewer/editor with confirmations.
- Live Mineflayer viewer integration.
- Multi-bot dashboard later.
