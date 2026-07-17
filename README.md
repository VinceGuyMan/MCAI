# MCAI — Local Minecraft Companion Bot

**Public alpha.** MCAI runs a local [Paper](https://papermc.io/) Minecraft server plus a physical [Mineflayer](https://github.com/PrismarineJS/mineflayer) player (default name `tj`). The bot is **code-first**: dig, craft, smelt, and movement work through deterministic routers and plugins. [Ollama](https://ollama.com) is **optional** and used mainly for dialogue.

> Keep the server local. Do **not** port-forward Minecraft or the dashboard.

## What works today (iron-age companion)

| Area | Status |
|------|--------|
| Come / follow / stay / stop | Solid |
| Owner-only commands | Solid |
| Wood / stone / dirt / sand dig (dry-path, oxygen abort) | Improving |
| Craft tool sets (wood / stone / iron) | Solid when materials exist |
| Smelt charcoal & iron | Supported (furnace place/use) |
| Surface coal / iron scout | Best-effort in loaded chunks |
| `tj progress to iron` macro | End-to-end surface path (partial success OK) |
| Food gather / eat | Solid |
| Optional starter kit (`tj kit`) for testing | Available |
| Dialogue via Ollama (`llmMode: dialogue`) | Optional |
| Nether / villagers / huge builds | Parked / experimental flags off |

In-game smoke list: see [`TEST_COMMANDS.txt`](TEST_COMMANDS.txt).

## Requirements

- **Windows** is the primary supported host (AIO launcher). Linux/macOS can run the bot + Paper manually.
- **Node.js** 20+ (bot)
- **Java** 21+ (Paper)
- **Paper** 1.21.x (download via scripts; **not** shipped in this repo)
- **Ollama** (optional) for chat personality

## Quick start

### 1. Configure

```bash
cp config.example.json config.json
```

Edit `config.json`:

- `ownerUsername` — your offline Minecraft name  
- `botUsername` — default `tj`  
- `ollamaModel` / `models.*` — if using Ollama  

Never commit your real `config.json`.

### 2. Install bot dependencies

```bash
cd bot
npm install
```

### 3. Paper server

Use the install scripts under `scripts/` (Windows) or place a Paper jar for 1.21.x in the project root and accept the EULA. Details: [`QUICKSTART_1_0.md`](QUICKSTART_1_0.md).

### 4. Run

**Windows all-in-one:** double-click `MCAI.cmd` (or `MCAI.vbs`).

```bat
MCAI.cmd --start
MCAI.cmd --status
MCAI.cmd --stop
```

**Manual:** start Paper, then:

```bash
cd bot
npm start
```

Dashboard (optional): `http://127.0.0.1:8787` — local telemetry only.

### 5. In-game (as owner)

```text
tj help
tj status
tj come here
tj get wood
tj craft basic tools
tj progress to iron
tj how do we get iron tools?
tj stop
```

## Architecture (short)

| Layer | Role |
|-------|------|
| `bot/chat.js` + `commandRegistry.js` | Chat → commands |
| `bot/thinCore.js` | Reliable collect / movement |
| `bot/pluginWrappers.js` | Pathfinder + safe dig |
| `bot/coreMacros.js` | Multi-step helpers (`progress_to_iron`) |
| `bot/smelting.js` / `crafting.js` | Furnace + recipes |
| `dashboard/` | Local status UI |
| `launcher/` | Windows AIO |

Deep map: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`MODULE_MAP.md`](MODULE_MAP.md).

**Policy:** thin core on; advanced systems (Nether, villagers, blueprints) default **off**.

## Tests

```bash
cd bot
npm test
npm run test:thin-core
npm run test:competent-core
npm run check
```

## Security

See [`SECURITY.md`](SECURITY.md). Change default dashboard/bridge tokens if other users share the machine.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). PRs that improve surface reliability (wood/stone/iron, drown safety, honest failures) are preferred over new large systems.

## License

[MIT](LICENSE) for this repository’s source code.

Minecraft, Paper, and Mojang assets are subject to their own licenses/terms. **Paper jars and Minecraft client/server binaries are not redistributed in this repo** — download them yourself.

## Disclaimer

This is an early public alpha. Expect pathing quirks, incomplete ore finds, and ongoing iron-age polish. It is a companion for local play, not a fully autonomous Minecraft agent.
