# MCAIBridge Paper Plugin

MCAIBridge is an optional local-only Paper plugin for the MCAI Mineflayer bot. It exposes safe server-side telemetry, recent events, protected regions, and an emergency stop signal.

It does not provide teleport, item giving, arbitrary console commands, world editing, inventory editing, permission changes, or any OpenAI/cloud access.

## Build

This project expects Java 21 and Gradle:

```powershell
Set-Location .\server-plugin
gradle build
```

If Java/Gradle are not on PATH, install a JDK 21 toolchain or use an IDE/Gradle wrapper of your choice.

## Install

1. Build the jar.
2. Copy `build/libs/MCAIBridge-0.2.0-public-alpha.jar` to the repository's local `plugins/` directory.
3. Start the Paper server once so `plugins/MCAIBridge/config.yml` is created.
4. Change `bridge.token` from the default.
5. Restart or reload the server.
6. Start tj and run:

```text
tj bridge status
```

## Security

Default bind is `127.0.0.1:8791`.

POST endpoints require `X-MCAI-Bridge-Token`. Do not expose this bridge publicly. If you intentionally bind beyond loopback, use a non-default token and understand that this is no longer the default safety model.

## Endpoints

- `GET /status`
- `GET /health`
- `GET /events/recent`
- `GET /events?since=evt_123`
- `GET /players`
- `GET /players/{configured-owner-name}`
- `GET /regions`
- `GET /regions/region_id`
- `GET /regions/near?world=world&x=0&y=64&z=0&radius=32`
- `GET /protected-blocks`
- `GET /advancements/recent`
- `GET /deaths/recent`
- `GET /villagers/recent`
- `POST /control/emergency-stop`
- `POST /regions/register`
- `POST /regions/delete`
- `POST /regions/update`

No endpoint executes arbitrary server commands.
