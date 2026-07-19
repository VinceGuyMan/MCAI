# MCAI quickstart

MCAI is a local Minecraft companion: a Paper server, a physical Mineflayer player (default name `tj`), and an optional local LLM for dialogue.

## Before you start

- Windows is the supported all-in-one launcher platform.
- Install Node.js 20 or newer.
- Install Java 21 or newer.
- Keep both Minecraft and the dashboard bound to this computer. Do not port-forward them.

## First-time setup

1. From the repository root, install the bot dependencies:

   ```powershell
   Set-Location .\bot
   npm install
   Set-Location ..
   ```

2. Install Paper and, if needed, a local Java runtime:

   ```powershell
   .\scripts\Install-Paper.ps1
   .\scripts\Install-Java.ps1
   ```

   Review the [Minecraft EULA](https://aka.ms/MinecraftEULA) before starting the server. MCAI asks for explicit acceptance before it writes `eula=true`; non-interactive server starts require `--accept-eula` after you review the agreement.

3. Run `MCAI.cmd` without flags. The first-run setup creates `config.json`, generates private local dashboard and bridge tokens, and asks for your Minecraft username and the bot name.

4. Keep `host` and `dashboardHost` on `127.0.0.1`. Advanced manual installs may copy `config.example.json`, but must replace both token placeholders with private values.

5. Optional: install Ollama or start an OpenAI-compatible local model server. Commands remain code-first when the LLM is unavailable.

## Start MCAI

Double-click `MCAI.cmd`, or run:

```bat
MCAI.cmd --start
```

The launcher starts Paper and the bot. Join `127.0.0.1:25565` using the Minecraft version configured in `config.json`, then chat from the configured owner account:

```text
tj help
tj status
tj come here
tj companion mode
tj get wood
tj stop
```

The default dashboard is available at `http://127.0.0.1:8787` when enabled. Its control token is the private `dashboardToken` value in `config.json`.
Older local configs with placeholder tokens are upgraded to random private tokens on the next interactive or start command; the dashboard will prompt for the new token once.

## Useful launcher commands

```bat
MCAI.cmd --start-server
MCAI.cmd --start-bot
MCAI.cmd --start
MCAI.cmd --status
MCAI.cmd --stop-bot
MCAI.cmd --stop-server
MCAI.cmd --stop
```

For the interactive menu and desktop shortcut, see [`launcher/README.md`](launcher/README.md). For troubleshooting, run `npm run doctor` from `bot/` and see [`docs/guides/DASHBOARD.md`](docs/guides/DASHBOARD.md).
