# Local dashboard

The MCAI dashboard is a loopback-only telemetry and safe-control panel for the configured companion bot. It is not a public administration console and should not be port-forwarded.

Default URL:

```text
http://127.0.0.1:8787
```

## What it is for

The current companion view reports:

- bot connection, health, hunger, position, and dimension;
- configured owner visibility and distance;
- danger flags and nearby hostiles;
- current task, active skill, and goals;
- inventory and recent skill evidence;
- recent command-routing failures and logs;
- status for optional parked/experimental systems when those systems are present.

The default product focus is the surface companion loop. Empty or unavailable advanced panels do not mean setup failed; villagers, Nether work, blueprints, gear mutation, and the optional Paper bridge are parked or experimental unless explicitly enabled.

## Start and open it

The bot hosts the dashboard automatically when `dashboardEnabled` is true. The normal path is:

```bat
MCAI.cmd --start
```

Open the dashboard from the launcher menu or visit the local URL. To run a dashboard without starting the bot, use this from the repository root:

```powershell
Set-Location .\bot
npm run dashboard
```

A standalone dashboard can perform setup and local health checks, but live bot telemetry requires the bot process.

## Setup page

Use `http://127.0.0.1:8787/setup.html` to select a supported local model provider, load installed models, assign models by role, test chat, and view the setup checklist.

The setup page does not replace the private `config.json` setup described in [`../../QUICKSTART_1_0.md`](../../QUICKSTART_1_0.md). Owner identity, Minecraft connection settings, and security tokens remain private configuration.

## Security model

Recommended settings:

```json
{
  "dashboardEnabled": true,
  "dashboardHost": "127.0.0.1",
  "dashboardPort": 8787,
  "dashboardLocalOnly": true,
  "dashboardRequireOwnerToken": true,
  "dashboardAllowDangerousControl": false,
  "dashboardAllowRawCommand": false
}
```

- Keep `dashboardHost` on loopback.
- Set a private `dashboardToken` in `config.json` and never commit it.
- The browser asks for this token and stores it in that browser's local storage.
- Read and control API requests require the token when token protection is enabled.
- Dashboard responses redact recognized secrets and local paths.
- Memory endpoints return summaries rather than raw private memory files.
- Raw JavaScript, shell commands, arbitrary Mineflayer calls, and direct LLM prompts are not exposed.

## Safe controls

The default dashboard can request emergency cancellation and low-risk status skills such as:

- `status`;
- `inventory_summary`;
- `food_status`.

Controls that mutate the world or spend resources remain subject to feature flags, owner confirmation, skill validation, and the same action gates used by in-game chat. Parked systems do not become enabled merely because a status button is visible.

## API overview

Common read endpoints include:

- `GET /api/status`
- `GET /api/bot`
- `GET /api/safety`
- `GET /api/inventory`
- `GET /api/task`
- `GET /api/skills`
- `GET /api/logs`
- `GET /api/commands`
- `GET /api/doctor`
- `GET /api/setup`
- `GET /api/setup/checklist`
- `GET /api/ollama`
- `GET /api/server`

Common control/setup endpoints include:

- `POST /api/control/stop`
- `POST /api/control/run-skill`
- `POST /api/setup/llm`
- `POST /api/setup/test-llm`

Send the private token in the `x-dashboard-token` header. Advanced-domain endpoints may remain available for compatibility, but they are not part of the default companion promise.

## Checks

From the repository root:

```powershell
Set-Location .\bot
npm run dashboard:test
npm run doctor
```

For a live check, start MCAI, open the dashboard, confirm that the configured bot and owner appear, run Status, and verify that STOP cancels active movement promptly.

## Troubleshooting

- **401 / token prompt:** enter the private `dashboardToken` from `config.json`.
- **Dashboard offline:** confirm the bot is running with `MCAI.cmd --status`; a standalone dashboard has no live bot object.
- **Port already in use:** stop the existing MCAI dashboard before starting another instance.
- **No model list:** start the configured local LLM server, then retry from Setup.
- **Advanced panel unavailable:** check its feature flag and guide; most advanced domains are parked by default.

Do not expose port `8787` to the internet or treat the dashboard as hardened public-hosting software.
