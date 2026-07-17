# Contributing to MCAI

Thanks for interest in improving this local Minecraft companion bot.

## Philosophy

- **Code-first, LLM-optional.** Commands and survival jobs should work with deterministic routing (`thinCore`, command registry, core macros). Ollama is for dialogue, not required for dig/craft/smelt.
- **Local only.** Do not design features that require exposing the Paper server or dashboard to the public internet.
- **Surface iron-age first.** Wood → stone → fuel → iron is the current product focus. Deep caves, diamonds, Nether, and villagers are parked or experimental.
- **Safety over cleverness.** Prefer dry-path digs, oxygen abort, owner-only commands, and honest failure messages.

## Development setup

1. Clone the repo.
2. Copy `config.example.json` → `config.json` and set `ownerUsername` / models.
3. Install bot deps: `cd bot && npm install`
4. Install Java + Paper (see `scripts/Install-Java.ps1`, `scripts/Install-Paper.ps1` or `QUICKSTART_1_0.md`).
5. Optional: install [Ollama](https://ollama.com) and pull a small dialogue model.
6. Start Paper, then `cd bot && npm start` (or use `MCAI.cmd` on Windows).

## Checks before a PR

```bash
cd bot
npm run check          # syntax on core files
npm test               # unit suite (may take a few minutes)
npm run test:thin-core
npm run test:competent-core
```

In-game smoke (owner chat):

```text
tj status
tj come here
tj stop
tj get wood
tj how do we get iron tools?
```

## What to avoid committing

- `config.json`, memory JSON, `session-log.jsonl`, worlds, Paper jars, `node_modules`, logs
- Real tokens, player UUIDs, or private server details

Use `config.example.json` for shared defaults.

## Code map

| Path | Role |
|------|------|
| `bot/thinCore.js` | Reliable collect / come / follow |
| `bot/pluginWrappers.js` | Pathfinder + dig wrappers |
| `bot/commandRegistry.js` | Chat command aliases |
| `bot/coreMacros.js` | `progress_to_iron` and helpers |
| `bot/chat.js` | Chat routing |
| `dashboard/` | Local telemetry UI |
| `launcher/` | Windows AIO launcher |

See `ARCHITECTURE.md` and `MODULE_MAP.md` for tiers and flags.

## Pull requests

- Keep PRs focused (one concern when possible).
- Describe **what** changed and **how you tested** (unit and/or in-game).
- Prefer fixing thin-core reliability over adding new Tier-2 systems.
