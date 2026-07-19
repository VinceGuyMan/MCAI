# Server Plugin Bridge

The optional local Paper plugin bridge gives MCAI cleaner server-side telemetry, event history, protected-region awareness, and an emergency-stop signal without giving the bot cheat powers.

## Security Model

- The plugin and Node client bind to `127.0.0.1` by default.
- POST endpoints require `serverPluginToken`.
- Tokens are never exposed through dashboard output.
- There are no endpoints for raw commands, teleport, item grants, operator actions, or world editing.
- If the plugin is missing or stopped, `tj` keeps working with the existing Mineflayer systems.

## Architecture

```text
Paper plugin
-> local HTTP bridge
-> bridgeClient.js / pluginBridge.js
-> bridgeValidator.js / bridgeEvidence.js
-> safety, map memory, and dashboard
```

Ollama never sends bridge commands. The dashboard and chat commands only call safe bridge actions.

## Plugin Setup

1. Build the plugin jar from `server-plugin`.
2. Copy the jar into the local Paper `plugins` folder.
3. Start Paper through `MCAI.cmd`. The launcher synchronizes `plugins/MCAIBridge/config.yml` with MCAI's local bridge host, port, token, and safety settings before Paper starts.
4. Start `tj`.
5. Run `tj bridge status`.

If Paper is started outside the MCAI launcher, set the same private token in `config.json` (`serverPluginToken`) and `plugins/MCAIBridge/config.yml` (`bridge.token`) before enabling the bridge.

This workspace currently includes plugin source and Gradle files. If Java/Gradle are not on PATH, build the jar from an environment that has JDK 21 and Gradle available.

## API Endpoints

Read-only:

- `GET /status`
- `GET /health`
- `GET /events/recent`
- `GET /events?since=EVENT_ID`
- `GET /players`
- `GET /players/:name`
- `GET /regions`
- `GET /regions/:id`
- `GET /regions/near`
- `GET /protected-blocks`
- `GET /advancements/recent`
- `GET /deaths/recent`
- `GET /villagers/recent`

Token-gated:

- `POST /control/emergency-stop`
- `POST /regions/register`
- `POST /regions/update`
- `POST /regions/delete`

## Events

The plugin records a small capped event buffer for player joins/quits, deaths, respawns, world changes, advancements, portal use, villager or golem deaths, hostile activity near protected regions, explosions, ignition, and protected-region block changes.

On the Node side, `pluginBridge.js` stores the last bridge event id and a capped set of recently processed event ids in memory. That keeps polling from replaying the same old bridge events repeatedly after reconnects or plugin restarts.

## Regions

`tj` can register home, farm, village, portal, and custom watched regions after owner confirmation. Protected bridge regions are synced into memory and safety checks can block destructive actions inside them.

## Commands

```text
tj bridge status
tj server status
tj bridge health
tj recent server events
tj recent deaths
tj recent advancements
tj bridge regions
tj protected regions
tj register home region
tj confirm bridge region
tj bridge emergency stop
```

## Dashboard

The dashboard adds:

- `/api/server-bridge/status`
- `/api/server-bridge/events`
- `/api/server-bridge/regions`
- `/api/server-bridge/players`
- `/api/server-bridge/health`
- `/api/server-bridge/emergency-stop`
- `/api/server-bridge/register-region`

Dashboard POST controls require the dashboard token and still route through safe `actions.js` adapters.

## Evidence

Bridge events create evidence names such as:

- `bridge_status_reported`
- `bridge_connected`
- `bridge_event_received`
- `bridge_emergency_stop_received`
- `bridge_region_registered`
- `bridge_player_death_recorded`
- `bridge_advancement_recorded`
- `bridge_protected_region_event`

Bridge evidence can strengthen debugging, but it does not replace skill/action evidence for physical work such as inventory changes or block placement.

## Tests

```powershell
Set-Location .\bot
npm run bridge:audit
npm run test:bridge
```

## Known Limitations

- The bridge is optional.
- The plugin source is present, but the jar must be built with a local Java/Gradle toolchain.
- It is intended for a local offline Paper server, not a public server.
- It does not expose arbitrary server commands.
- It does not give `tj` teleport, item, x-ray, operator, or world-edit powers.
